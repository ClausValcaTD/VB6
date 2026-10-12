import test from 'node:test';
import assert from 'node:assert/strict';
import {commitWorkspacePresentation} from '../src/ide/figma/presentation.js';

function fixture() {
  const events=[], document={}, driver={}, atlas={};
  const renderer={driver,atlas,policy:{backend:'canvas2d'},
    invalidateStyles(){events.push('invalidate');},
    renderNow(){events.push('paint');},
    fallback(reason){events.push(['fallback',reason]);}};
  return {events,document,renderer};
}
test('workspace presentation invalidates and submits before returning without replacing the driver or atlas',()=>{
  const {events,document,renderer}=fixture(),{driver,atlas,policy}=renderer;
  commitWorkspacePresentation([document],d=>{assert.equal(d,document);return renderer;});events.push('returned');
  assert.deepEqual(events,['invalidate','paint','returned']);assert.equal(renderer.driver,driver);assert.equal(renderer.atlas,atlas);assert.equal(renderer.policy,policy);
});
test('workspace paint publication includes every live detached document',()=>{
  const a=fixture(),b=fixture(),map=new Map([[a.document,a.renderer],[b.document,b.renderer]]);
  commitWorkspacePresentation([...map.keys()],d=>map.get(d));
  assert.deepEqual(a.events,['invalidate','paint']);assert.deepEqual(b.events,['invalidate','paint']);
});
test('native HTML, hidden, printing and disposed documents schedule no rendering work',()=>{
  for(const mode of ['html','hidden','printing','disposed','absent']){
    const {events,document,renderer}=fixture();
    if(mode==='html')renderer.driver=null;
    if(mode==='hidden')document.hidden=true;
    if(mode==='printing')renderer.printing=true;
    if(mode==='disposed')renderer.disposed=true;
    commitWorkspacePresentation([document],()=>mode==='absent'?null:renderer);assert.deepEqual(events,[],mode);
  }
});
test('workspace paint failures enter ordinary renderer fallback and do not abort other windows',()=>{
  const a=fixture(),b=fixture(),map=new Map([[a.document,a.renderer],[b.document,b.renderer]]);
  a.renderer.renderNow=()=>{throw new Error('lost device');};
  commitWorkspacePresentation([...map.keys()],d=>map.get(d));
  assert.deepEqual(a.events,['invalidate',['fallback','lost device']]);assert.deepEqual(b.events,['invalidate','paint']);
});
