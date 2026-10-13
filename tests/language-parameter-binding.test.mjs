import test from 'node:test';
import assert from 'node:assert/strict';
import {run,main,module,project} from './helpers/compiler-runtime.mjs';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
const item='Private Type Item\nValue As Long\nEnd Type';
const bag=module('Bag','Public Value As Long','class');

for(const [type,setup,argument]of [['record','Dim value As Item\nvalue.Value = 7','value'],['object','Dim value As New Bag','value'],['Nothing','Dim value As Bag','value']])test('Variant forwarding retains declared Variant for '+type,async()=>{
 const formal=type==='record'?'Item':'Bag';
 const code=item+'\n'+main(setup+'\nOuter '+argument)+'\nSub Outer(ByRef value As Variant)\nOn Error Resume Next\nInner value\nDebug.Print Err.Number\nEnd Sub\nSub Inner(ByRef value As '+formal+')\nDebug.Print "wrong callee entered"\nEnd Sub';
 assert.deepEqual((await run(code,[bag])).output,['13']);
});
test('multi-hop Variant forwarding preserves typed write-back and tags',async()=>{
 const r=await run(main('Dim value As Integer\nvalue = 7\nOuter value\nDebug.Print value, TypeName(value)')+'\nSub Outer(ByRef value As Variant)\nForward value\nEnd Sub\nSub Forward(ByRef value As Variant)\nvalue = 9.5\nDebug.Print TypeName(value)\nEnd Sub');
 assert.deepEqual(r.output,['Integer','10 Integer']);
});
test('Variant record forwarding aliases fields without converting its declared type',async()=>{
 const r=await run(item+'\n'+main('Dim value As Item\nvalue.Value = 7\nOuter value\nDebug.Print value.Value')+'\nSub Outer(ByRef value As Variant)\nForward value\nEnd Sub\nSub Forward(ByRef value As Variant)\nvalue.Value = 9\nOn Error Resume Next\nTyped value\nDebug.Print Err.Number\nEnd Sub\nSub Typed(ByRef value As Item)\nDebug.Print "wrong callee entered"\nEnd Sub');
 assert.deepEqual(r.output,['13','9']);
});
test('Variant view of typed array retains shape, element type and resize authority',async()=>{
 const r=await run(main('Dim a() As Long\nReDim a(1)\nOuter a\nDebug.Print UBound(a), a(0), TypeName(a)')+'\nSub Outer(ByRef value As Variant)\nReDim Preserve value(3)\nvalue(0) = 7\nEnd Sub');
 assert.deepEqual(r.output,['3 7 Long()']);
});
test('Variant view of an array element retains Error 10 lifetime',async()=>{
 const r=await run('Dim values() As Long\n'+main('ReDim values(1)\nOuter values(0)\nReDim Preserve values(3)\nDebug.Print UBound(values), values(0)')+'\nSub Outer(ByRef value As Variant)\nOn Error Resume Next\nReDim Preserve values(4)\nDebug.Print Err.Number\nvalue = 9\nEnd Sub');
 assert.deepEqual(r.output,['10','3 9']);
});
test('cross-type object parameter changes become visible only on normal return',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Set shared = New Bag\nshared.Value = 7\nChange shared\nDebug.Print shared.Value')+'\nSub Change(ByRef value As Object)\nSet value = New Bag\nvalue.Value = 9\nDebug.Print shared.Value, value.Value\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['7 9','9']);
});
test('cross-type Nothing assignment is delayed, including an initially Nothing argument',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Change shared\nDebug.Print shared.Value\nClearValue shared\nDebug.Print shared Is Nothing')+'\nSub Change(ByRef value As Object)\nSet value = New Bag\nvalue.Value = 9\nDebug.Print shared Is Nothing\nEnd Sub\nSub ClearValue(ByRef value As Object)\nSet value = Nothing\nDebug.Print shared Is Nothing\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['True','9','False','True']);
});
test('same-type object parameters remain direct aliases',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Set shared = New Bag\nChange shared\nDebug.Print shared Is Nothing')+'\nSub Change(ByRef value As Bag)\nSet value = Nothing\nDebug.Print shared Is Nothing\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['True','True']);
});
test('an escaping procedure error suppresses cross-type object copy-back',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Set shared = New Bag\nshared.Value = 7\nOn Error Resume Next\nChange shared\nDebug.Print Err.Number, shared.Value')+'\nSub Change(ByRef value As Object)\nSet value = New Bag\nvalue.Value = 9\nErr.Raise 5\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['5 7']);
});
test('handled errors still allow normal-return object copy-back',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Set shared = New Bag\nChange shared\nDebug.Print shared.Value')+'\nSub Change(ByRef value As Object)\nOn Error Resume Next\nErr.Raise 5\nSet value = New Bag\nvalue.Value = 9\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['9']);
});
test('mutations of the referenced object remain shared before reassignment',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Set shared = New Bag\nChange shared')+'\nSub Change(ByRef value As Object)\nvalue.Value = 9\nDebug.Print shared.Value\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['9']);
});
test('invalid object copy-back raises 13 after callee completion, preserving caller',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Set shared = New Bag\nshared.Value = 7\nOn Error Resume Next\nChange shared\nDebug.Print Err.Number, shared.Value')+'\nSub Change(ByRef value As Object)\nSet value = New Other\nDebug.Print "completed"\nEnd Sub',[bag,module('Other','','class')]);
 assert.deepEqual(r.output,['completed','13 7']);
});
for(const type of ['Variant','Long','String'])test('typed object formal rejects declared '+type+' aliases before entry',async()=>{
 const setup=type==='Variant'?'Set value = New Bag':type==='Long'?'value = 7':'value = "text"';
 const r=await run(main('Dim value As '+type+'\n'+setup+'\nOn Error Resume Next\nChange value\nDebug.Print Err.Number')+'\nSub Change(ByRef value As Object)\nDebug.Print "wrong callee entered"\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['13']);
});
test('grouped Variant object value becomes an independent parameter temporary',async()=>{
 const r=await run(main('Dim value As Variant\nSet value = New Bag\nvalue.Value = 7\nChange (value)\nDebug.Print value.Value')+'\nSub Change(ByRef value As Bag)\nSet value = New Bag\nvalue.Value = 9\nDebug.Print value.Value\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['9','7']);
});
test('repeated aliases copy back in parameter order',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Set shared = New Bag\nChange shared, shared\nDebug.Print shared.Value')+'\nSub Change(ByRef first As Object, ByRef second As Object)\nSet first = New Bag\nfirst.Value = 11\nSet second = New Bag\nsecond.Value = 22\nDebug.Print shared.Value\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['0','22']);
});
test('an error in a later parameter prevents all copy-back and callee entry',async()=>{
 const r=await run('Dim shared As Bag\n'+main('Dim bad As String\nSet shared = New Bag\nshared.Value = 7\nOn Error Resume Next\nChange shared, bad\nDebug.Print Err.Number, shared.Value')+'\nSub Change(ByRef value As Object, ByRef count As Long)\nDebug.Print "wrong callee entered"\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['13 7']);
});
test('event Variant forwarding reports declared Variant before any typed sink',async()=>{
 const emitter=module('Emitter','Public Event Changed(ByRef value As Variant)\nPublic Sub Work(ByRef value As Bag)\nRaiseEvent Changed(value)\nEnd Sub','class');
 const sink=module('Sink','Public WithEvents Source As Emitter\nPrivate Sub Source_Changed(ByRef value As Variant)\nOn Error Resume Next\nTyped value\nDebug.Print Err.Number\nEnd Sub\nPrivate Sub Typed(ByRef value As Bag)\nDebug.Print "wrong callee entered"\nEnd Sub','class');
 const r=await run(main('Dim source As New Emitter, sink As New Sink, value As New Bag\nSet sink.Source = source\nsource.Work value'),[bag,emitter,sink]);
 assert.deepEqual(r.output,['13']);
});
test('source event object binding defers copy-back until all subscribers finish',async()=>{
 const emitter=module('Emitter','Public Event Changed(ByRef value As Object)\nPublic Sub Work()\nRaiseEvent Changed(M.shared)\nEnd Sub','class');
 const sink=module('Sink','Public WithEvents Source As Emitter\nPrivate Sub Source_Changed(ByRef value As Object)\nSet value = New Bag\nvalue.Value = 9\nDebug.Print M.shared.Value\nEnd Sub','class');
 const r=await run('Public shared As Bag\n'+main('Dim source As New Emitter, sink As New Sink\nSet sink.Source = source\nSet shared = New Bag\nshared.Value = 7\nsource.Work\nDebug.Print shared.Value'),[bag,emitter,sink]);
 assert.deepEqual(r.output,['7','9']);
});
test('source-event host exceptions suppress pending copy-back',async()=>{
 const code='Public shared As Bag\n'+main('Dim source As New Emitter\nSet shared = New Bag\nshared.Value = 7\nOn Error Resume Next\nsource.Work\nDebug.Print Err.Number, shared.Value');
 const p=compileProject(project(code,[bag,module('Emitter','Public Event Changed(ByRef value As Object)\nPublic Sub Work()\nRaiseEvent Changed(M.shared)\nEnd Sub','class')]));assert.deepEqual(p.diagnostics,[]);
 const output=[];let vm;vm=new VirtualMachine(p,{print:s=>output.push(s),sourceEvent:async(_i,_n,args)=>{await args[0].ref.set(await vm.createObject('Bag'));throw new Error('host failure');}});await vm.start();assert.deepEqual(output,['5 7']);
});

test('Variant reference inspection retains tags without reading a host accessor',async()=>{
 const {variantParameterReference}=await import('../src/runtime/parameter-binding.js');
 const {Cell,Ref,tagScalar}=await import('../src/runtime/values.js');
 const value=new Cell('Integer',7),view=variantParameterReference(value);
 assert.equal(view.type,'Variant');assert.equal(view.assignmentType,'Integer');assert.equal(view.debugGet(),7);
 assert.equal(view.debugGetScalar().type,'integer');assert.equal(view.debugGetScalar().variant,true);
 assert.equal(variantParameterReference(view),view);view.set(tagScalar(9.5,'double'));assert.equal(value.get(),10);
 let calls=0;const host=new Ref(()=>{calls++;return 7;},()=>{},'Long');const proxy=variantParameterReference(host);
 assert.equal(calls,0);assert.equal(proxy.debugGet,undefined);assert.equal(proxy.debugGetScalar,undefined);
});
test('Variant reference inspection uses an existing scalar-only safe accessor',async()=>{
 const {variantParameterReference}=await import('../src/runtime/parameter-binding.js');
 const {Ref,tagScalar}=await import('../src/runtime/values.js');
 const ref=new Ref(()=>{throw new Error('unsafe accessor');},()=>{},'Long');ref.debugGetScalar=()=>tagScalar(7,'long');
 assert.equal(variantParameterReference(ref).debugGet(),7);
});
test('source events retain the requirement for genuine array arguments',async()=>{
 const r=await run(main('Dim source As New Emitter\nsource.Work'),[module('Emitter','Public Event Changed(ByRef value() As Variant)\nPublic Sub Work()\nDim value() As Variant\nReDim value(1)\nOn Error Resume Next\nRaiseEvent Changed((value))\nDebug.Print Err.Number\nEnd Sub','class')]);
 assert.deepEqual(r.output,['13']);
});
test('debugger Reset does not perform a pending cross-type object copy-back',async()=>{
 const {pause}=await import('./helpers/compiler-runtime.mjs');
 const code='Dim shared As Bag\nSub Main()\nSet shared = New Bag\nshared.Value = 7\nChange shared\nEnd Sub\nSub Change(ByRef value As Object)\nSet value = New Bag\nvalue.Value = 9\nDebug.Print value.Value\nEnd Sub';
 const p=await pause(code,10,[bag]);assert.equal(p.vm.instances.get('m').fields.get('shared').get().fields.get('value').get(),7);
 p.vm.stop();await p.running;assert.equal(p.vm.stack.length,0);assert.equal(p.vm.instances.get('m').fields.get('shared').get().fields.get('value').get(),7);
});
test('source event reset from a host does not deliver observers or copy back',async()=>{
 const code='Public shared As Bag\nSub Main()\nDim source As New Emitter\nSet shared = New Bag\nshared.Value = 7\nsource.Work\nEnd Sub';
 const p=compileProject(project(code,[bag,module('Emitter','Public Event Changed(ByRef value As Object)\nPublic Sub Work()\nRaiseEvent Changed(M.shared)\nEnd Sub','class')]));assert.deepEqual(p.diagnostics,[]);
 let vm,events=0;vm=new VirtualMachine(p,{sourceEvent:async(_i,_n,args)=>{await args[0].ref.set(await vm.createObject('Bag'));vm.stop();}});vm.on('event',()=>events++);await vm.start();
 assert.equal(events,0);assert.equal(vm.instances.get('m').fields.get('shared').get().fields.get('value').get(),7);assert.equal(vm.stack.length,0);
});
test('Object to class ByRef uses a checked temporary and delayed copy-back',async()=>{
 const r=await run('Dim shared As Object\n'+main('Set shared = New Bag\nshared.Value = 7\nChange shared\nDebug.Print shared.Value')+'\nSub Change(ByRef value As Bag)\nSet value = New Bag\nvalue.Value = 9\nDebug.Print shared.Value\nEnd Sub',[bag]);
 assert.deepEqual(r.output,['7','9']);
});
test('interface ByRef copy-back preserves identity and waits for normal return',async()=>{
 const iface=module('IValue','Public Property Get Value() As Long\nEnd Property','class');
 const implementation=module('Impl','Implements IValue\nPrivate Property Get IValue_Value() As Long\nIValue_Value = 17\nEnd Property','class');
 const r=await run('Dim shared As Impl\n'+main('Set shared = New Impl\nChange shared\nDebug.Print shared Is Nothing')+'\nSub Change(ByRef value As IValue)\nDebug.Print value.Value\nSet value = Nothing\nDebug.Print shared Is Nothing\nEnd Sub',[iface,implementation]);
 assert.deepEqual(r.output,['17','False','True']);
});
