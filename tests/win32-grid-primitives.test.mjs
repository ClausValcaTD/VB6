/** Compare emitted private-grid leaf/lifetime lowering to the independent VB
 * algorithm. Foreign OleAut32 calls remain explicit test doubles, not Windows. */
import test from 'node:test';import assert from 'node:assert/strict';
import {emittedGrid} from './support/native-grid-abi.mjs';
import {gridKernel} from './support/native-grid-kernel.mjs';
import {NATIVE_GRID_FIELDS as F} from '../src/native/control-grid-contract.js';
const code='G.Row=1\nG.ColWidth(0)=1200\nDim width As Long,text As String\nwidth=G.ColWidth(0)\nG.TextMatrix(1,1)="seed"\ntext=G.TextMatrix(1,1)';
const scalarFields=['rows','cols','fixedrows','fixedcols','row','col','rowsel','colsel','toprow','leftcol','version','redraw'];
function checkedError(h,fn,n){
 const registers=h.vm.registers.slice(),flags={...h.vm.flags},ip=h.vm.ip;
 try{assert.throws(fn,e=>e.number===n);}finally{h.vm.registers.set(registers);h.vm.flags=flags;h.vm.ip=ip;}
}
for(const optimization of [0,1,2]){
 test(`native grid initialization, scalar clamps and metadata match the VB algorithm O${optimization}`,async t=>{
  const h=emittedGrid(t,code,optimization),g=await gridKernel(1);await g.initialize(0,3,3,101);
  for(const [rows,cols]of [[0,1],[1,1],[7,4],[2,5]]){
   h.invoke('Initialize',[0,101,rows,cols]);await g.initialize(0,rows,cols,101);const epoch=h.invoke('Stamp',[0]),args=[0,101,epoch];
   for(const f of scalarFields)assert.equal(h.invoke('GetField',[...args,F[f]])|0,await g.get(0,f),f);
   for(const [field,count]of [[F.widths,cols],[F.heights,rows],[F.rowdata,rows],[F.coldata,cols],[F.alignment,cols]]){
    for(const value of [0,field===F.alignment?2:42]){
     h.invoke('SetIndexed',[...args,field,-1,value]);await g.call(0,'SetIndexed',field,-1,value);
     for(let i=0;i<count;i++)assert.equal(h.invoke('GetIndexed',[...args,field,i])|0,await g.call(0,'GetIndexed',field,i));
    }
   }
   // Exercise the public field setter to reach Normalize and notification.
   for(const [name,value]of [['fixedrows',rows],['fixedcols',cols],['row',0],['col',0]]){
    let error;try{await g.set(0,name,value);}catch(e){error=e.number;}
    if(error)checkedError(h,()=>h.invoke('SetField',[...args,F[name],value]),error);else h.invoke('SetField',[...args,F[name],value]);
   }
   for(const f of scalarFields)assert.equal(h.invoke('GetField',[...args,F[f]])|0,await g.get(0,f),f+' normalized');
  }
  h.invoke('Dispose',[0]);assert.equal(h.arrays.size,0);await g.close();
 });
 test(`native grid rejects stale references/invalid indices without changing metadata O${optimization}`,t=>{
  const h=emittedGrid(t,code,optimization),before=h.invoke('GetIndexed',[...h.args,F.widths,0]);
  for(const [args,error]of [[[-1,101,h.epoch,F.widths,0,1],340],[[0,0,h.epoch,F.widths,0,1],91],[[0,101,h.epoch+1,F.widths,0,1],91],[[...h.args,F.widths,-2,1],381],[[...h.args,F.widths,3,1],381],[[...h.args,F.widths,0,-1],380],[[...h.args,F.heights,0,300001],380],[[...h.args,F.alignment,0,3],380]])checkedError(h,()=>h.invoke('SetIndexed',args),error);
  assert.equal(h.invoke('GetIndexed',[...h.args,F.widths,0]),before);
  const frees=h.vm.memory.regions.filter(r=>r.label==='BSTR').length;
  checkedError(h,()=>h.invoke('GetText',[...h.args,100,0]),381);
  const text=h.vm.memory.string('Ω\0中');h.invoke('SetText',[...h.args,1,1,text]);h.vm.memory.free(text-4);
  const copy=h.invoke('GetText',[...h.args,1,1]);assert.equal(h.m.bstr(copy),'Ω\0中');h.m.free(copy-4);
  h.invoke('Dispose',[0]);assert.equal(h.arrays.size,0);assert.equal(h.vm.memory.regions.filter(r=>r.label==='BSTR').length,frees);
 });
 for(let nth=1;nth<=7;nth++)test(`native grid initialization rolls back allocation ${nth} and remains reusable O${optimization}`,t=>{
  const h=emittedGrid(t,code,optimization),vm=h.vm,m=h.m,address=m.read(vm.symbol('iat:oleaut32.dll!SafeArrayCreateVector')),original=vm.hooks.get(address).callback;let calls=0;
  vm.hooks.get(address).callback=args=>++calls===nth?0:original(args);
  checkedError(h,()=>h.invoke('Initialize',[0,101,10,4]),7);assert.equal(h.arrays.size,0);
  vm.hooks.get(address).callback=original;h.invoke('Initialize',[0,101,2,2]);assert.equal(h.arrays.size,7);h.invoke('Dispose',[0]);assert.equal(h.arrays.size,0);
 });
 test(`native grid initialization and all-column metadata fill use constant foreign-call counts O${optimization}`,t=>{
  const h=emittedGrid(t,code,optimization);let access=0,put=0;
  for(const [name,bump]of [['SafeArrayAccessData',()=>access++],['SafeArrayPutElement',()=>put++]]){
   const address=h.m.read(h.vm.symbol('iat:oleaut32.dll!'+name)),entry=h.vm.hooks.get(address),old=entry.callback;entry.callback=args=>{bump();return old(args);};
  }
  h.invoke('Initialize',[0,101,500,200]);const epoch=h.invoke('Stamp',[0]);assert.equal(access,2);assert.equal(put,0);
  h.invoke('SetIndexed',[0,101,epoch,F.widths,-1,1900]);assert.equal(access,3);assert.equal(put,0);
  assert.equal(h.invoke('GetIndexed',[0,101,epoch,F.widths,199]),1900);h.invoke('Dispose',[0]);assert.equal(h.arrays.size,0);
 });
}
