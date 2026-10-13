import test from 'node:test';
import assert from 'node:assert/strict';
import {run,main,module} from './helpers/compiler-runtime.mjs';
import {Cell,VBArray,makeRecord,recordField,tagScalar,NOTHING,recordIdentity} from '../src/runtime/values.js';
const declarations='Type Item\nValue As Long\nEnd Type';
const types=module('Types',declarations+'\nType OtherItem\nText As String\nEnd Type');

for(const [name,expression] of [['number','42'],['Empty','Empty'],['Nothing','Nothing'],['Null','Null'],['string','"wrong"'],['Date','#2020-01-02#'],['array','Array(1, 2)'],['object','New Bag']]){
 test('typed record-array element rejects '+name+' without losing its fields',async()=>{
  const r=await run(declarations+'\n'+main('Dim a() As Item\nReDim a(1)\na(0).Value = 7\nOn Error Resume Next\na(0) = '+expression+'\nDebug.Print Err.Number, a(0).Value\nErr.Clear\nReDim Preserve a(3)\nDebug.Print Err.Number, a(0).Value, a(3).Value'),[module('Bag','','class')]);
  assert.deepEqual(r.output,['13 7','0 7 0']);
 });
}

test('qualified record array writes retain field aliases and independent value copies',async()=>{
 const r=await run(main('Dim a(1) As Types.Item, item As Item\nitem.Value = 9\na(0) = item\nitem.Value = 11\nBump a(0).Value\nDebug.Print a(0).Value, item.Value')+'\nSub Bump(ByRef value As Long)\nvalue = value + 1\nEnd Sub',[types]);
 assert.deepEqual(r.output,['10 11']);
});
test('scalar typed records still reject nonrecord replacements',async()=>{
 const r=await run(declarations+'\n'+main('Dim a As Item\na.Value = 7\nOn Error Resume Next\na = 12\nDebug.Print Err.Number, a.Value'));
 assert.deepEqual(r.output,['13 7']);
});
test('Variant variables can transition between record, numeric and Empty values',async()=>{
 const r=await run(main('Dim a As Item, v As Variant\na.Value = 7\nv = a\nv = CLng(19)\nDebug.Print v, TypeName(v)\nv = a\nv = Empty\nDebug.Print IsEmpty(v)\nDebug.Print a.Value'),[types]);
 assert.deepEqual(r.output,['19 Long','True','7']);
});
test('Variant variables can change between nominally different record types',async()=>{
 const r=await run(main('Dim a As Item, b As OtherItem, v As Variant\na.Value = 7\nb.Text = "next"\nv = a\nv = b\nb.Text = "source"\nDebug.Print TypeName(v), v.Text, a.Value, b.Text'),[types]);
 assert.deepEqual(r.output,['OtherItem next 7 source']);
});
test('Variant variables holding records can receive Null, arrays and object references',async()=>{
 const r=await run(main('Dim a As Item, v As Variant, obj As New Bag\nv = a\nv = Null\nDebug.Print IsNull(v)\nv = a\nv = Array(3, 5)\nDebug.Print v(1)\nv = a\nSet v = obj\nDebug.Print v Is obj'),[types,module('Bag','','class')]);
 assert.deepEqual(r.output,['True','5','True']);
});
test('Variant-array elements can change record types and retain scalar tags after replacement',async()=>{
 const r=await run(main('Dim a As Item, b As OtherItem, values(1) As Variant\na.Value = 7\nb.Text = "next"\nvalues(0) = a\nvalues(0) = b\nDebug.Print TypeName(values(0)), values(0).Text\nvalues(0) = CInt(12)\nDebug.Print values(0), TypeName(values(0))\nvalues(0) = a\nvalues(0) = Empty\nDebug.Print IsEmpty(values(0)), a.Value'),[types]);
 assert.deepEqual(r.output,['OtherItem next','12 Integer','True 7']);
});
test('Variant record assignment preserves a separately captured With value',async()=>{
 const r=await run(main('Dim a As Item, v As Variant\na.Value = 7\nv = a\nWith v\nv = 12\n.Value = 9\nDebug.Print .Value, v, a.Value\nEnd With'),[types]);
 assert.deepEqual(r.output,['9 12 7']);
});
test('copying a typed record permits a Variant field to change its stored type',async()=>{
 const r=await run('Type Envelope\nTag As Long\nPayload As Variant\nEnd Type\n'+main('Dim a As Envelope, b As Envelope, item As Item\na.Tag = 3\nitem.Value = 7\na.Payload = item\nb.Tag = 9\nb.Payload = CInt(12)\na = b\nDebug.Print a.Tag, a.Payload, TypeName(a.Payload), item.Value'),[types]);
 assert.deepEqual(r.output,['9 12 Integer 7']);
});
test('nested Variant fields can change nominal record type during a typed aggregate copy',async()=>{
 const r=await run('Type Envelope\nPayload As Variant\nEnd Type\nType Outer\nData As Envelope\nEnd Type\n'+main('Dim a As Outer, b As Outer, first As Item, second As OtherItem\nfirst.Value = 7\nsecond.Text = "next"\na.Data.Payload = first\nb.Data.Payload = second\na = b\nb.Data.Payload.Text = "source"\nDebug.Print a.Data.Payload.Text, b.Data.Payload.Text, first.Value'),[types]);
 assert.deepEqual(r.output,['next source 7']);
});
test('record array copy permits Variant field transitions without replacing typed field aliases',()=>{
 const record=value=>makeRecord('R',new Map([['Payload',new Cell('Variant',value)]]),'m.r');
 const first=makeRecord('First',new Map([['Value',new Cell('Long',7)]]),'m.first');
 const a=new VBArray([[0,0]],'R',()=>record(first));a.elementIdentity='m.r';
 const alias=recordField(a.get(0),'Payload');
 a.set([0],record(tagScalar(12,'integer',true)));
 assert.equal(recordField(a.get(0),'Payload'),alias);assert.equal(alias.get(),12);assert.equal(alias.getScalar().type,'integer');
 assert.equal(first.Value,7);assert.equal(recordIdentity(a.get(0)),'m.r');
});
test('record-array writes reject foreign nominal identities before copying fields',async()=>{
 const r=await run('Private Type Item\nValue As Long\nEnd Type\n'+main('Dim a(1) As Item\na(0).Value = 7\nOn Error Resume Next\na(0) = Other.MakeItem()\nDebug.Print Err.Number, a(0).Value'),[module('Other','Private Type Item\nValue As Long\nEnd Type\nPublic Function MakeItem() As Variant\nDim a As Item\na.Value = 99\nMakeItem = a\nEnd Function')]);
 assert.deepEqual(r.output,['13 7']);
});
for(const value of [0,undefined,null,NOTHING,tagScalar(12,'integer',true)])test('low-level typed record arrays reject nonrecord writes: '+String(value),()=>{
 const factory=()=>makeRecord('R',new Map([['Value',new Cell('Long',7)]]));
 const a=new VBArray([[0,0]],'R',factory),old=a.get(0),data=a.data;
 assert.throws(()=>a.set([0],value),error=>error.number===13);
 assert.equal(a.get(0),old);assert.equal(a.data,data);assert.equal(a.get(0).Value,7);assert.equal(a.scalarData,undefined);
});

for(const argument of ['payload','values(0)'])test('typed ByRef record formal rejects declared Variant storage: '+argument,async()=>{
 const r=await run(main('Dim item As Item, payload As Variant, values(1) As Variant\nitem.Value = 7\npayload = item\nvalues(0) = item\nOn Error Resume Next\nChange '+argument+'\nDebug.Print Err.Number, payload.Value, values(0).Value')+'\nSub Change(ByRef value As Item)\nDebug.Print "unexpected call"\nvalue = 42\nEnd Sub',[types]);
 assert.deepEqual(r.output,['13 7 7']);
});
for(const argument of ['(payload)','(values(0))'])test('grouping a Variant record supplies an independent typed temporary: '+argument,async()=>{
 const r=await run(main('Dim item As Item, payload As Variant, values(1) As Variant\nitem.Value = 7\npayload = item\nvalues(0) = item\nChange '+argument+'\nDebug.Print payload.Value, values(0).Value')+'\nSub Change(ByRef value As Item)\nvalue.Value = 9\nDebug.Print value.Value\nEnd Sub',[types]);
 assert.deepEqual(r.output,['9','7 7']);
});
test('a typed record-array element remains typed through a ByRef formal',async()=>{
 const r=await run(main('Dim values(1) As Item\nvalues(0).Value = 7\nChange values(0)\nDebug.Print values(0).Value')+'\nSub Change(ByRef value As Item)\nOn Error Resume Next\nvalue = 42\nDebug.Print Err.Number, value.Value\nEnd Sub',[types]);
 assert.deepEqual(r.output,['13 7','7']);
});
test('source event record formals reject Variant aliases but accept grouped temporaries',async()=>{
 const r=await run(main('Dim source As New Emitter\nsource.Work'),[types,module('Emitter','Public Event Changed(ByRef value As Item)\nPublic Sub Work()\nDim item As Item, payload As Variant\nitem.Value = 7\npayload = item\nOn Error Resume Next\nRaiseEvent Changed(payload)\nDebug.Print Err.Number, payload.Value\nErr.Clear\nRaiseEvent Changed((payload))\nDebug.Print Err.Number, payload.Value\nEnd Sub','class')]);
 assert.deepEqual(r.output,['13 7','0 7']);
});
