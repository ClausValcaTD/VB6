import test from 'node:test';
import assert from 'node:assert/strict';
import {BinarySection,PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {optimizeNativeSections} from '../src/native/optimizer.js';
import {optimizeNativeSections as reference} from './support/native-relaxation-reference.mjs';
function fixture(seed,count=96){
 const image=new PE32Image(),code=image.section('.text',0x60000020),data=image.section('.data',0xc0000040),x=new X86(code,image);
 let state=seed>>>0;const random=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
 for(let i=0;i<count;i++){
  x.label('b'+i);
  if(random(2))x.jump('b'+random(count+1));else x.branch(['e','ne','l','g'][random(4)],'b'+random(count+1));
  x.nop(random(12));
  if(random(5)===0)data.reference('b'+i,'va',random(7));
  if(random(8)===0)x.value('b'+random(count+1));
 }
 x.label('b'+count).ret();
 code.codeUnits=[{name:'all',start:0,end:code.length,closed:true}];return [code,data];
}
const snapshot=sections=>sections.map(s=>({bytes:s.bytes,labels:[...s.labels],fixups:s.fixups,units:s.codeUnits}));
for(const level of [1,2])test('single-materialization relaxation equals the legacy fixed point O'+level,()=>{
 for(let seed=1;seed<=128;seed++){
  const a=fixture(seed),b=fixture(seed);
  assert.deepEqual(optimizeNativeSections(a,level),reference(b,level),'stats for seed '+seed);
  assert.deepEqual(snapshot(a),snapshot(b),'layout/relocations for seed '+seed);
 }
});
test('multi-pass relaxation publishes bytes, fixups and labels only once',()=>{
 const s=new BinarySection('.text',0x60000020),x=new X86(s,new PE32Image());
 x.label('entry').jump('end').jump('end').nop(123).label('end').ret();
 const writes={bytes:0,labels:0,fixups:0};
 for(const name of Object.keys(writes)){let value=s[name];Object.defineProperty(s,name,{get:()=>value,set:next=>{writes[name]++;value=next;},configurable:true});}
 const stats=optimizeNativeSections([s],1);assert.equal(stats.passes,2);assert.deepEqual(writes,{bytes:1,labels:1,fixups:1});
});
