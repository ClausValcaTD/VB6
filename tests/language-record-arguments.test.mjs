import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {run,main,module,project} from './helpers/compiler-runtime.mjs';
const record='Private Type Item\nValue As Long\nEnd Type';
const foreign=module('Other',record+'\nPublic Sub Change(ByRef value As Item)\nDebug.Print "entered wrong procedure"\nvalue.Value = 99\nEnd Sub\nPublic Function MakeItem() As Variant\nDim value As Item\nvalue.Value = 23\nMakeItem = value\nEnd Function');

test('grouped record arguments cannot substitute a same-named private declaration',async()=>{
 const r=await run(record+'\n'+main('Dim value As Item\nvalue.Value = 7\nOn Error Resume Next\nOther.Change (value)\nDebug.Print Err.Number, value.Value'),[foreign]);
 assert.deepEqual(r.output,['13 7']);
});
test('record function-result arguments are validated before entering the procedure',async()=>{
 const r=await run(record+'\nSub Change(ByRef value As Item)\nDebug.Print "entered wrong procedure"\nEnd Sub\n'+main('On Error Resume Next\nChange Other.MakeItem()\nDebug.Print Err.Number'),[foreign]);
 assert.deepEqual(r.output,['13']);
});
for(const expression of ['42','Empty','Nothing','"text"','New Bag'])test('record temporary rejects incompatible argument '+expression,async()=>{
 const r=await run(record+'\nSub Change(ByRef value As Item)\nDebug.Print "entered wrong procedure"\nEnd Sub\n'+main('On Error Resume Next\nChange '+expression+'\nDebug.Print Err.Number'),[module('Bag','','class')]);
 assert.deepEqual(r.output,['13']);
});
test('qualified grouped records own independent storage and retain nominal type',async()=>{
 const r=await run(main('Dim value As Item\nvalue.Value = 7\nChange (value)\nDebug.Print value.Value')+'\nSub Change(ByRef value As Types.Item)\nvalue.Value = 9\nDebug.Print value.Value, TypeName(value)\nEnd Sub',[module('Types','Public Type Item\nValue As Long\nEnd Type')]);
 assert.deepEqual(r.output,['9 Item','7']);
});
test('same-type function results pass through a typed temporary once',async()=>{
 const r=await run(record+'\nDim calls As Long\nFunction MakeItem() As Item\ncalls = calls + 1\nMakeItem.Value = 8\nEnd Function\nSub Change(ByRef value As M.Item)\nvalue.Value = value.Value + 1\nDebug.Print value.Value\nEnd Sub\n'+main('Change MakeItem()\nDebug.Print calls'));
 assert.deepEqual(r.output,['9','1']);
});
for(const grouped of [false,true])test('source event rejects foreign record '+(grouped?'temporary':'alias')+' before any host notification',async()=>{
 const output=[],notifications=[];
 const p=project(record+'\n'+main('Dim source As New Emitter, value As Item\nvalue.Value = 7\nOn Error Resume Next\nsource.Work value\nDebug.Print Err.Number, value.Value'),[
  module('Emitter',record+'\nPublic Event Changed(ByRef value As Item)\nPublic Sub Work(ByRef value As Variant)\nRaiseEvent Changed('+(grouped?'(value)':'value')+')\nEnd Sub','class')]);
 const compiled=compileProject(p);assert.deepEqual(compiled.diagnostics,[]);
 const vm=new VirtualMachine(compiled,{print:s=>output.push(s),sourceEventEnabled:()=>{notifications.push('enabled');return true;},sourceEvent:()=>notifications.push('host')});
 vm.on('event',()=>notifications.push('signal'));
 await vm.start();assert.deepEqual(output,['13 7']);assert.deepEqual(notifications,[]);
});
test('matching source event aliases and temporaries preserve declared record identity',async()=>{
 const output=[],received=[];
 const p=project(main('Dim source As New Emitter, value As Item\nvalue.Value = 7\nsource.Work value\nDebug.Print value.Value'),[
  module('Types','Public Type Item\nValue As Long\nEnd Type'),
  module('Emitter','Public Event Changed(ByRef value As Types.Item)\nPublic Sub Work(ByRef value As Item)\nRaiseEvent Changed(value)\nRaiseEvent Changed((value))\nEnd Sub','class')]);
 const compiled=compileProject(p);assert.deepEqual(compiled.diagnostics,[]);
 const vm=new VirtualMachine(compiled,{print:s=>output.push(s),sourceEvent:(_i,_n,args)=>{const v=args[0].ref.get();received.push(v.Value);v.Value+=1;}});
 await vm.start();assert.deepEqual(output,['8']);assert.deepEqual(received,[7,8]);
});
test('record validation failure releases an array-element argument lease',async()=>{
 const r=await run(record+'\n'+main('Dim values() As Item\nReDim values(1)\nvalues(0).Value = 7\nOn Error Resume Next\nOther.Change values(0)\nDebug.Print Err.Number\nErr.Clear\nReDim Preserve values(3)\nDebug.Print Err.Number, UBound(values), values(0).Value'),[foreign]);
 assert.deepEqual(r.output,['13','0 3 7']);
});
