import test from 'node:test';
import assert from 'node:assert/strict';
import {commitWorkspacePresentation} from '../src/ide/figma/presentation.js';

function eventTarget() {
  const listeners=new Map();
  return {listeners,
    addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
    removeEventListener(type,listener){listeners.get(type)?.delete(listener);},
    dispatch(type){for(const listener of [...listeners.get(type)||[]])listener();}
  };
}
function fixture() {
  const events=[],frames=new Map(),driver={},atlas={},view=eventTarget();let sequence=0;
  view.requestAnimationFrame=fn=>{const handle=sequence++;frames.set(handle,fn);return handle;};
  view.cancelAnimationFrame=handle=>{events.push(['cancel',handle]);frames.delete(handle);};
  const document=Object.assign(eventTarget(),{defaultView:view});
  const renderer={driver,atlas,policy:{backend:'canvas2d'},
    invalidateStyles(){events.push('invalidate');},
    cancelFrame(){events.push('cancel-normal-frame');},
    renderNow(options){events.push(['paint',options]);},
    fallback(reason){events.push(['fallback',reason]);}};
  const tick=()=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();};
  return {events,document,renderer,view,frames,tick};
}
const paints=f=>f.events.filter(e=>Array.isArray(e)&&e[0]==='paint');
const released=f=>{assert.equal(f.frames.size,0);for(const target of [f.document,f.view])for(const listeners of target.listeners.values())assert.equal(listeners.size,0);};

test('workspace publication draws at a frame and completes after the following opportunity',async()=>{
  const f=fixture(),{driver,atlas,policy}=f.renderer;let done=false;
  const ready=commitWorkspacePresentation([f.document],()=>f.renderer).then(()=>{done=true;});
  assert.deepEqual(f.events,['invalidate','cancel-normal-frame']);assert.equal(f.frames.size,1);
  f.tick();await Promise.resolve();assert.equal(done,false);assert.deepEqual(paints(f),[['paint',{force:true}]]);
  f.tick();await ready;assert.equal(done,true);released(f);
  assert.equal(f.renderer.driver,driver);assert.equal(f.renderer.atlas,atlas);assert.equal(f.renderer.policy,policy);
});
test('concurrent workspace requests coalesce to one bounded publication draw',async()=>{
  const f=fixture(),request=()=>commitWorkspacePresentation([f.document],()=>f.renderer);
  const requests=[request(),request(),request()];assert.equal(f.frames.size,1);
  f.tick();assert.equal(paints(f).length,1);assert.equal(f.frames.size,1);
  f.tick();await Promise.all(requests);released(f);
});
test('a newer transaction during settlement is painted before any waiter completes',async()=>{
  const f=fixture();let done=false;
  const first=commitWorkspacePresentation([f.document],()=>f.renderer).then(()=>{done=true;});f.tick();
  const second=commitWorkspacePresentation([f.document],()=>f.renderer);f.tick();await Promise.resolve();
  assert.equal(done,false);assert.equal(paints(f).length,2);f.tick();await Promise.all([first,second]);released(f);
});
test('reentrant workspace publication during painting cannot settle an unpainted revision',async()=>{
  const f=fixture(),render=f.renderer.renderNow;let reentrant;
  f.renderer.renderNow=options=>{render(options);if(!reentrant)reentrant=commitWorkspacePresentation([f.document],()=>f.renderer);};
  const first=commitWorkspacePresentation([f.document],()=>f.renderer);f.tick();f.tick();
  assert.equal(paints(f).length,2);f.tick();await Promise.all([first,reentrant]);released(f);
});
test('all live detached documents must reach their own publication boundary',async()=>{
  const a=fixture(),b=fixture(),map=new Map([[a.document,a.renderer],[b.document,b.renderer]]);let done=false;
  const ready=commitWorkspacePresentation([...map.keys()],d=>map.get(d)).then(()=>{done=true;});
  a.tick();a.tick();await Promise.resolve();assert.equal(done,false);b.tick();b.tick();await ready;
  assert.equal(paints(a).length,1);assert.equal(paints(b).length,1);released(a);released(b);
});
test('native HTML, hidden, printing, disposed and missing renderers schedule nothing',async()=>{
  for(const mode of ['html','hidden','printing','disposed','absent']){
    const f=fixture();
    if(mode==='html')f.renderer.driver=null;
    if(mode==='hidden')f.document.hidden=true;
    if(mode==='printing')f.renderer.printing=true;
    if(mode==='disposed')f.renderer.disposed=true;
    await commitWorkspacePresentation([f.document],()=>mode==='absent'?null:f.renderer);
    assert.deepEqual(f.events,[],mode);released(f);
  }
});
test('visibility cancellation releases frame handle zero and resolves without painting',async()=>{
  const f=fixture(),ready=commitWorkspacePresentation([f.document],()=>f.renderer);
  assert.ok(f.frames.has(0));f.document.hidden=true;f.document.dispatch('visibilitychange');await ready;
  assert.deepEqual(f.events.at(-1),['cancel',0]);assert.equal(paints(f).length,0);released(f);
});
test('pagehide and printing settle pending publication without retaining document listeners',async()=>{
  for(const event of ['pagehide','beforeprint']){
    const f=fixture(),ready=commitWorkspacePresentation([f.document],()=>f.renderer);f.view.dispatch(event);await ready;
    assert.equal(paints(f).length,0);released(f);
  }
});
test('disposal or driver release before a scheduled frame prevents stale painting',async()=>{
  for(const mode of ['disposed','driver']){
    const f=fixture(),ready=commitWorkspacePresentation([f.document],()=>f.renderer);
    if(mode==='disposed')f.renderer.disposed=true;else f.renderer.driver=null;
    f.tick();await ready;assert.equal(paints(f).length,0);released(f);
  }
});
test('paint failures await ordinary fallback and leave other document publications independent',async()=>{
  const a=fixture(),b=fixture(),render=a.renderer.renderNow;let fail=true,recover;
  a.renderer.ready=new Promise(resolve=>{recover=resolve;});
  a.renderer.renderNow=options=>{if(fail){fail=false;throw new Error('lost device');}render(options);};
  const map=new Map([[a.document,a.renderer],[b.document,b.renderer]]),ready=commitWorkspacePresentation([...map.keys()],d=>map.get(d));
  a.tick();assert.deepEqual(a.events.at(-1),['fallback','lost device']);assert.equal(a.frames.size,0);
  b.tick();b.tick();released(b);recover();await Promise.resolve();assert.equal(a.frames.size,1);
  a.tick();a.tick();await ready;released(a);assert.equal(paints(a).length,1);
});
test('closed documents ignore late fallback completion and permit a fresh later request',async()=>{
  const f=fixture(),render=f.renderer.renderNow;let recover;
  f.renderer.ready=new Promise(resolve=>{recover=resolve;});f.renderer.renderNow=()=>{throw new Error('lost');};
  const ready=commitWorkspacePresentation([f.document],()=>f.renderer);f.tick();f.view.dispatch('pagehide');await ready;
  recover();await Promise.resolve();released(f);
  f.renderer.renderNow=render;const next=commitWorkspacePresentation([f.document],()=>f.renderer);f.tick();f.tick();await next;released(f);
});
