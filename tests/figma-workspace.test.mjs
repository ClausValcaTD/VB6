import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFigmaSettings,loadFigmaSettings,modelLength,displayLength,constraintAxis,setConstraintAxis,zoomAt,fitViewport,layerRows,figmaDockProfile} from '../src/ide/figma/model.js';
import {DockLayout} from '../src/ide/dock-layout.js';

test('Figma preferences are opt-in, bounded, and tolerate unavailable storage',()=>{
  assert.deepEqual(normalizeFigmaSettings({mode:'other',scheme:'other',units:'other',injected:true}),{mode:'classic',scheme:'light',units:'px'});
  assert.equal(loadFigmaSettings({getItem(){throw Error('denied');}}).mode,'classic');
  assert.equal(loadFigmaSettings({getItem(){return '{';}}).mode,'classic');
  assert.equal(normalizeFigmaSettings({mode:'figma',scheme:'system',units:'twips'}).mode,'figma');
});
test('display units never change twip source semantics',()=>{
  assert.equal(displayLength(1800,'px'),120);assert.equal(modelLength('120','px'),1800);assert.equal(modelLength('1800','twips'),1800);
  for(const value of ['',' ','NaN','Infinity','2e9'])assert.throws(()=>modelLength(value,'px'));
  assert.throws(()=>modelLength('-1','px',{size:true}));assert.equal(modelLength('-1','twips'),-1);
});
test('all sixteen anchor combinations roundtrip horizontal and vertical constraints',()=>{
  for(let a=0;a<16;a++)for(const axis of ['x','y'])assert.equal(setConstraintAxis(a,axis,constraintAxis(a,axis)),a);
  assert.equal(setConstraintAxis(5,'x',3),13);assert.equal(setConstraintAxis(5,'y',3),7);
  assert.equal(setConstraintAxis(15,'x',0),3);assert.throws(()=>setConstraintAxis(5,'x',8));
});
test('zoom preserves the world point under the cursor and fit centers bounds',()=>{
  const state={x:130,y:-40,zoom:1.5},point={x:410,y:210},next=zoomAt(state,3,point);
  assert.equal((point.x-next.x)/next.zoom,(point.x-state.x)/state.zoom);
  assert.equal((point.y-next.y)/next.zoom,(point.y-state.y)/state.zoom);
  assert.equal(zoomAt(state,200,point).zoom,8);
  const fit=fitViewport(1000,800,{x:10,y:20,width:400,height:300});assert.equal(fit.x+210*fit.zoom,500);assert.equal(fit.y+170*fit.zoom,400);
});
const control=(id,parent=null)=>({id,name:id,type:'Frame',parent,properties:{}});
test('layers retain nested parents, collapse, search ancestors and stable order',()=>{
  const form={controls:[control('a'),control('b','a'),control('c','b'),control('d')]};
  assert.deepEqual(layerRows(form).map(r=>[r.control.id,r.depth]),[['a',1],['b',2],['c',3],['d',1]]);
  assert.deepEqual(layerRows(form,{collapsed:new Set(['a'])}).map(r=>r.control.id),['a','d']);
  assert.deepEqual(layerRows(form,{query:' c ',collapsed:new Set(['a'])}).map(r=>r.control.id),['a','b','c']);
});
test('layer traversal is iterative for deep trees and terminates on corrupt cycles',()=>{
  const controls=Array.from({length:10000},(_,i)=>control('n'+i,i?'n'+(i-1):null));
  assert.equal(layerRows({controls}).length,10000);
  assert.equal(layerRows({controls:[control('a','b'),control('b','a')]}).length,2);
});
test('Figma dock profile preserves classic profile and restores through real DockLayout',()=>{
  const model=new DockLayout();for(const id of ['toolbox','project','properties','layout','auto-layout','figma-layers','debug'])model.register(id,{edge:id==='toolbox'?'left':'right',hidden:id==='debug'});
  const before=model.snapshot(),text=JSON.stringify(before),profile=figmaDockProfile(before);assert.equal(JSON.stringify(before),text);
  model.restore(profile);assert.equal(model.windows.get('toolbox').group,'figma-left');assert.equal(model.windows.get('properties').group,'figma-right');assert.equal(model.windows.get('layout').hidden,true);
  model.restore(before);assert.deepEqual(model.snapshot(),before);
});
