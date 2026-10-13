import test from 'node:test';
import assert from 'node:assert/strict';
import {Cell,LazyCell,Ref,NOTHING} from '../src/runtime/values.js';
import {bindReferenceParameter} from '../src/runtime/parameter-binding.js';
import {run,main,module} from './helpers/compiler-runtime.mjs';
const param=(type,bounds=null)=>({type,bounds,byRef:true});
const noRecords={recordDefinition(){throw new Error('scalar parameter unexpectedly resolved a record');}};
const bag=module('Bag','Public Value As Long\nPrivate Sub Class_Initialize()\nM.created = M.created + 1\nEnd Sub','class');
const execute=(body,procedures='')=>run('Public created As Long\n'+main(body)+'\n'+procedures,[bag]);

for(const type of ['Byte','Integer','Long','Single','Double','Currency','Date','String','Boolean'])test('binding '+type+' storage neither reads nor resolves its current value',async()=>{
 let reads=0;const ref=new Ref(()=>{reads++;throw new Error('unrequested read');},()=>{},type);
 const binding=await bindReferenceParameter(noRecords,param(type),ref,{});
 assert.equal(binding.cell,ref);assert.equal(binding.copyBack,undefined);assert.equal(reads,0);
});
test('scalar declaration mismatch is rejected before reading the variable',async()=>{
 let reads=0;const ref=new Ref(()=>{reads++;throw new Error('unrequested read');},()=>{},'String');
 await assert.rejects(bindReferenceParameter(noRecords,param('Long'),ref,{}),e=>e.number===13);assert.equal(reads,0);
});
test('declared nonobject aliases are rejected without reading their values',async()=>{
 for(const type of ['Variant','Long','String']){
  let reads=0;const ref=new Ref(()=>{reads++;throw new Error('unrequested read');},()=>{},type);
  await assert.rejects(bindReferenceParameter({recordDefinition:()=>null},param('Object'),ref,{}),e=>e.number===13);assert.equal(reads,0);
 }
});
test('same-type lazy object alias does not instantiate on binding',async()=>{
 let calls=0;const ref=new LazyCell('Bag',()=>{calls++;return {};});
 const binding=await bindReferenceParameter({recordDefinition:()=>null},param('Bag'),ref,{});
 assert.equal(binding.cell,ref);assert.equal(binding.copyBack,undefined);assert.equal(ref.peek(),NOTHING);assert.equal(calls,0);
});
test('unused same-type source ByRef formal never invokes Class_Initialize',async()=>{
 const r=await execute('Dim value As New Bag\nIgnore value\nDebug.Print created','Sub Ignore(ByRef value As Bag)\nEnd Sub');assert.deepEqual(r.output,['0']);
});
test('writing Nothing through same-type lazy binding does not instantiate it',async()=>{
 const r=await execute('Dim value As New Bag\nClearValue value\nDebug.Print created','Sub ClearValue(ByRef value As Bag)\nSet value = Nothing\nEnd Sub');assert.deepEqual(r.output,['0']);
});
test('forwarding same-type lazy variables initializes once on first data access',async()=>{
 const r=await execute('Dim value As New Bag\nOuter value\nDebug.Print created, value.Value','Sub Outer(ByRef value As Bag)\nInner value\nDebug.Print created\nvalue.Value = 7\nEnd Sub\nSub Inner(ByRef value As Bag)\nDebug.Print created\nEnd Sub');assert.deepEqual(r.output,['0','0','1 7']);
});
test('an escaping error before accessing a lazy formal has no constructor effects',async()=>{
 const r=await execute('Dim value As New Bag\nOn Error Resume Next\nWork value\nDebug.Print Err.Number, created','Sub Work(ByRef value As Bag)\nErr.Raise 5\nEnd Sub');assert.deepEqual(r.output,['5 0']);
});
test('later parameter rejection does not instantiate earlier same-type lazy storage',async()=>{
 const r=await execute('Dim value As New Bag, text As String\nOn Error Resume Next\nWork value, text\nDebug.Print Err.Number, created','Sub Work(ByRef value As Bag, ByRef count As Long)\nDebug.Print "must not enter"\nEnd Sub');assert.deepEqual(r.output,['13 0']);
});
for(const [name,argument,formal]of [['ByVal','value','ByVal value As Bag'],['grouped','(value)','ByRef value As Bag'],['cross-type','value','ByRef value As Object']])test(name+' arguments still evaluate the lazy object once',async()=>{
 const r=await execute('Dim value As New Bag\nIgnore '+argument+'\nDebug.Print created','Sub Ignore('+formal+')\nEnd Sub');assert.deepEqual(r.output,['1']);
});
test('class constructor errors occur at first use, not same-type parameter binding',async()=>{
 const throwing=module('Bad','Private Sub Class_Initialize()\nErr.Raise 5\nEnd Sub','class');
 const r=await run(main('Dim value As New Bad\nIgnore value\nDebug.Print "not created"\nOn Error Resume Next\nDebug.Print value Is Nothing\nDebug.Print Err.Number')+'\nSub Ignore(ByRef value As Bad)\nEnd Sub',[throwing]);assert.deepEqual(r.output,['not created','5']);
});
test('ordinary object reference adapters retain runtime value validation',async()=>{
 const ref=new Ref(()=>7,()=>{},'Bag');
 await assert.rejects(bindReferenceParameter({recordDefinition:()=>null},param('Bag'),ref,{}),e=>e.number===424);
});
test('actual scalar writes retain range conversion and reference identity',async()=>{
 const ref=new Cell('Integer',7),{cell}=await bindReferenceParameter(noRecords,param('Integer'),ref,{});
 cell.set(9.5);assert.equal(ref.get(),10);assert.throws(()=>cell.set(32768),e=>e.number===6);assert.equal(ref.get(),10);
});
