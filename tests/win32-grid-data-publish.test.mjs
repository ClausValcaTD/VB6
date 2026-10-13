/** The independently executable VB grid algorithm is the transaction oracle.
 * Separate emitted-IA32 and Windows suites cover its native ABI and OleAut32. */
import test from 'node:test';import assert from 'node:assert/strict';
import {Cell} from '../src/runtime/values.js';
import {gridKernel} from './support/native-grid-kernel.mjs';
const make=(g,values)=>{const h=g.vm.library.get('buffernew')(values.length,8);g.buffers.get(h).items=[...values];return new Cell('Long',h);};
const publish=async(g,owner,rows,cols,version)=>g.raw('PublishData',0,100,await g.raw('Stamp',0),version??await g.get(0,'version'),{ref:owner},rows,cols);
async function snapshot(g){return {rows:await g.get(0,'rows'),cols:await g.get(0,'cols'),version:await g.get(0,'version'),buffers:[...g.buffers].map(([h,b])=>[h,{kind:b.kind,items:[...b.items]}])};}

test('bulk grid publication transfers one cell owner and preserves compatible column metadata',async()=>{
 const g=await gridKernel();await g.initialize(0,3,3);await g.call(0,'SetIndexed',15,1,2400);await g.call(0,'SetIndexed',18,1,42);await g.call(0,'SetIndexed',19,1,2);
 const oldHandles=new Set(g.buffers.keys()),format=await g.get(0,'format'),version=await g.get(0,'version'),draws=g.invalidations.length;
 const values=['ID','Name','1','Alpha','2','Ω\0中','3','last'],owner=make(g,values);await publish(g,owner,4,2);
 assert.equal(owner.get(),0,'transfer only at commit');assert.equal(g.buffers.size,7);for(const h of oldHandles)assert.equal(g.buffers.has(h),h===format,'only the independent format string is retained');
 assert.equal(await g.get(0,'rows'),4);assert.equal(await g.get(0,'cols'),2);assert.equal(await g.get(0,'fixedrows'),1);assert.equal(await g.get(0,'fixedcols'),0);
 assert.equal(await g.get(0,'version'),version+1);assert.equal(g.invalidations.length,draws+1,'one repaint after publication');
 for(let i=0;i<values.length;i++)assert.equal(await g.text(0,Math.floor(i/2),i%2),values[i]);
 assert.equal(await g.call(0,'GetIndexed',15,1),2400);assert.equal(await g.call(0,'GetIndexed',18,1),42);assert.equal(await g.call(0,'GetIndexed',19,1),2);await g.close();
});
for(let fail=0;fail<5;fail++)test('failed metadata allocation rolls back every fresh owner, failure '+fail,async()=>{
 const g=await gridKernel();await g.initialize(0,3,3);await g.put(0,1,1,'preserved');
 const before=await snapshot(g),owner=make(g,['ID','Name','1','new']),h=owner.get(),draws=g.invalidations.length;
 g.failAfter(fail);await assert.rejects(publish(g,owner,2,2),e=>e.number===7);
 assert.equal(owner.get(),h);assert.equal(g.invalidations.length,draws);assert.equal(await g.text(0,1,1),'preserved');
 g.vm.library.get('bufferfree')(h);assert.deepEqual(await snapshot(g),before);g.failAfter(Infinity);await g.close();
});
for(const fail of [0,1,3,5,9])test('failed metadata copy preserves prior cells and dimensions, failure '+fail,async()=>{
 const g=await gridKernel();await g.initialize(0,3,3);const before=await snapshot(g),owner=make(g,['H1','H2','a','b','c','d']),h=owner.get();
 g.failWrites(fail);await assert.rejects(publish(g,owner,3,2),e=>e.number===7);assert.equal(owner.get(),h);
 g.vm.library.get('bufferfree')(h);assert.deepEqual(await snapshot(g),before);g.failWrites(Infinity);await g.close();
});
test('rebinding Nothing commits an empty cell vector and releases all old strings',async()=>{
 const g=await gridKernel();await g.initialize(0,3,3);const owner=make(g,[]);await publish(g,owner,0,1);
 assert.equal(owner.get(),0);assert.equal(await g.get(0,'rows'),0);assert.equal(await g.get(0,'cols'),1);assert.equal(await g.get(0,'fixedrows'),0);assert.equal(g.buffers.size,7);await g.close();
});
test('stale data version cannot overwrite a newer edit',async()=>{
 const g=await gridKernel();await g.initialize(0,3,3);const version=await g.get(0,'version'),owner=make(g,['H','new']),h=owner.get();
 await g.put(0,1,1,'newer');const before=await snapshot(g);await assert.rejects(publish(g,owner,2,1,version),e=>e.number===5);
 assert.deepEqual(await snapshot(g),before);assert.equal(owner.get(),h);g.vm.library.get('bufferfree')(h);await g.close();
});
for(const mutation of ['edit','destroy'])test('final receiver/version guard rejects reentrant '+mutation+' during preparation',async()=>{
 const g=await gridKernel();await g.initialize(0,3,3);const owner=make(g,['header','outer']),h=owner.get();
 const allocate=g.vm.library.get('buffernew');let once=false;
 g.vm.library.set('buffernew',async(...args)=>{const result=allocate(...args);if(!once){once=true;if(mutation==='edit')await g.put(0,1,1,'inner');else await g.raw('Dispose',0);}return result;});
 await assert.rejects(publish(g,owner,2,1),e=>e.number===(mutation==='edit'?5:91));assert.equal(owner.get(),h);
 if(mutation==='edit')assert.equal(await g.text(0,1,1),'inner');
 g.vm.library.get('bufferfree')(h);await g.close();
});
