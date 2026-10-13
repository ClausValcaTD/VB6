import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject,compileModule,validateCompiledModules} from '../src/language/compiler.js';
import {ProjectDiagnosticCache,diagnosticSnapshot} from '../src/language/diagnostics.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {run,main,invalid,module,project,pause,finish} from './helpers/compiler-runtime.mjs';
const record=(name='Item',scope='Public',field='Value As Long')=>`${scope} Type ${name}\n${field}\nEnd Type`;
const types=module('Types',record());

test('qualified records allocate typed fields and preserve short TypeName',async()=>{
 const r=await run(main('Dim a As Types.Item\na.Value = 7\nDebug.Print a.Value, TypeName(a)'),[types]);assert.deepEqual(r.output,['7 Item']);
});
test('qualified and unqualified aliases designate the same record value',async()=>{
 const r=await run(main('Dim a As Types.Item, b As Item\na.Value = 7\nb = a\na.Value = 9\nDebug.Print b.Value'),[types]);assert.deepEqual(r.output,['7']);
});
test('qualified ByRef record parameters preserve the original field alias',async()=>{
 const r=await run(main('Dim a As Item\nChange a\nDebug.Print a.Value')+'\nSub Change(ByRef a As Types.Item)\na.Value = 9\nEnd Sub',[types]);assert.deepEqual(r.output,['9']);
});
test('qualified record function results use typed owned storage',async()=>{
 const r=await run(main('Dim a As Item\na = MakeItem()\nDebug.Print a.Value, TypeName(a)')+'\nFunction MakeItem() As Types.Item\nMakeItem.Value = 8\nEnd Function',[types]);assert.deepEqual(r.output,['8 Item']);
});
test('qualified record arrays and grouped typed parameters retain nominal element type',async()=>{
 const r=await run(main('Dim a() As Item, b() As Types.Item\nReDim a(1)\na(0).Value = 7\nb = a\nChange (b)\nDebug.Print a(0).Value, b(0).Value')+'\nSub Change(ByRef a() As Item)\na(0).Value = 9\nEnd Sub',[types]);assert.deepEqual(r.output,['7 7']);
});
test('ReDim explicit qualification may spell an unchanged record identity differently',async()=>{
 const r=await run(main('Dim a() As Item\nReDim a(1) As Types.Item\na(0).Value = 11\nReDim Preserve a(3) As Types.Item\nDebug.Print a(0).Value, a(3).Value'),[types]);assert.deepEqual(r.output,['11 0']);
});
test('qualified typed-array function results copy and resize as their declared record type',async()=>{
 const r=await run(main('Dim a() As Item\na = MakeItems()\nReDim Preserve a(2)\nDebug.Print a(0).Value, a(2).Value')+'\nFunction MakeItems() As Types.Item()\nDim b(1) As Item\nb(0).Value = 13\nMakeItems = b\nEnd Function',[types]);assert.deepEqual(r.output,['13 0']);
});
test('nested records resolve private member types in the declaring module',async()=>{
 const r=await run('Private Type Detail\nWrong As String\nEnd Type\n'+main('Dim a As Envelope\na.Data.Value = 12\nDebug.Print a.Data.Value'),[
 module('Types',record('Detail','Private')+'\n'+record('Envelope','Public','Data As Detail'))]);assert.deepEqual(r.output,['12']);
});
test('nested record arrays use owner-qualified private factories after Preserve',async()=>{
 const r=await run('Private Type Detail\nWrong As String\nEnd Type\n'+main('Dim a As Envelope\nDebug.Print a.Data(0).Value, UBound(a.Data)'),[
 module('Types',record('Detail','Private')+'\n'+record('Envelope','Public','Data(1) As Detail'))]);assert.deepEqual(r.output,['0 1']);
});
for(const declaration of ['Dim a As Hidden','Dim a As Types.Hidden','Dim a() As Types.Hidden'])test('private record cannot be imported: '+declaration,()=>{
 invalid(main(declaration),/not accessible|not defined/,[module('Types',record('Hidden','Private'))]);
});
test('type declaration metadata retains visibility independent of member syntax',()=>{
 const m=compileModule(module('Types',record('Hidden','Private')+'\n'+record('Visible')));assert.equal(m.typeScopes.hidden,'private');assert.equal(m.typeScopes.visible,'public');assert.equal(m.types.Hidden[0].name,'Value');
});
for(const declaration of ['ByVal a As Types.Item','Optional a As Types.Item'])test('invalid record formal diagnosed before execution: '+declaration,()=>{
 invalid('Sub Work('+declaration+')\nEnd Sub',/ByVal|Optional/,[types]);
});
test('record As New declarations fail at compile time',()=>invalid(main('Dim a As New Types.Item'),/New|class/,[types]));
test('private same-named record does not shadow an accessible class in another module',async()=>{
 const r=await run(main('Dim a As New Item\nDebug.Print TypeName(a)'),[module('Owner',record('Item','Private')),module('Item','Public Value As Long','class')]);assert.deepEqual(r.output,['Item']);
});
test('different private record declarations cannot be assigned through Variant',async()=>{
 const r=await run(record('Item','Private')+'\n'+main('Dim a As Item\na.Value = 5\nOn Error Resume Next\na = Other.MakeItem()\nDebug.Print Err.Number, a.Value'),[
 module('Other',record('Item','Private')+'\nPublic Function MakeItem() As Variant\nDim a As Item\na.Value = 9\nMakeItem = a\nEnd Function')]);assert.deepEqual(r.output,['13 5']);
});
test('different private record arrays cannot replace a typed array even when empty',async()=>{
 const r=await run(record('Item','Private')+'\n'+main('Dim a() As Item\nReDim a(1)\na(0).Value = 5\nOn Error Resume Next\na = Other.MakeItems()\nDebug.Print Err.Number, a(0).Value'),[
 module('Other',record('Item','Private')+'\nPublic Function MakeItems() As Variant\nDim a() As Item\nMakeItems = a\nEnd Function')]);assert.deepEqual(r.output,['13 5']);
});
test('ByRef does not reinterpret another module private record with the same spelling',async()=>{
 const r=await run(record('Item','Private')+'\n'+main('Dim a As Item\na.Value = 5\nOn Error Resume Next\nOther.Change a\nDebug.Print Err.Number, a.Value'),[
 module('Other',record('Item','Private')+'\nPublic Sub Change(ByRef a As Item)\na.Value = 9\nEnd Sub')]);assert.deepEqual(r.output,['13 5']);
});
test('binary file roundtrip retains qualified record identity and field aliasing',async()=>{
 const r=await run(main('Dim a As Types.Item, b As Item\na.Value = 19\nOpen "record.bin" For Binary As #1\nPut #1, 1, a\nGet #1, 1, b\nClose\na = b\nDebug.Print a.Value, TypeName(b)'),[types]);assert.deepEqual(r.output,['19 Item']);
});
test('cached private/public record edits invalidate consumer declarations',()=>{
 const p=project(main('Dim a As Types.Item'),[structuredClone(types)]),c=new ProjectDiagnosticCache();
 assert.equal(c.check(diagnosticSnapshot(p)).valid,true);p.modules[1].code=record('Item','Private');let r=c.check(diagnosticSnapshot(p));assert.equal(r.valid,false);assert.equal(r.stats.compiledModules,1);
 p.modules[1].code=record();assert.equal(c.check(diagnosticSnapshot(p)).valid,true);
});
test('structured-cloned compiler metadata can rebuild the record type index',()=>{
 const c=compileProject(project(main('Dim a As Types.Item'),[types])),m=structuredClone(c.modules);m.get('types').typeScopes.item='private';
 assert.ok(validateCompiledModules(m).some(d=>/not accessible|not defined/.test(d.message)));
});

test('record object and intrinsic object fields initialize to Nothing',async()=>{
 const r=await run(record('Container','Public','Object As Bag\nItems As Collection')+'\n'+main('Dim a As Container\nDebug.Print a.Object Is Nothing, a.Items Is Nothing'),[module('Bag','Public Value As Long','class')]);assert.deepEqual(r.output,['True True']);
});
test('private type in current module remains accessible through its qualified spelling',async()=>{
 const r=await run(record('Item','Private')+'\n'+main('Dim a As M.Item\na.Value = 12\nDebug.Print a.Value'));assert.deepEqual(r.output,['12']);
});
test('ambiguous imported records diagnose rather than choosing source-module order',()=>{
 for(const extra of [[types,module('Other',record())],[module('Other',record()),types]])invalid(main('Dim a As Item'),/Ambiguous/ ,extra);
});
test('record array whole-assignment to a qualified typed parameter preserves ownership',async()=>{
 const r=await run(main('Dim a() As Item\nReDim a(1)\na(0).Value = 9\nReplace a\nDebug.Print a(0).Value')+'\nSub Replace(ByRef a() As Types.Item)\nDim b(1) As Item\nb(0).Value = 21\na = b\nEnd Sub',[types]);assert.deepEqual(r.output,['21']);
});
test('source record event formals accept qualification without copying the alias',async()=>{
 const p=project(main('Dim e As New Emitter, a As Item\ne.Work a\nDebug.Print a.Value'),[types,module('Emitter','Public Event Changing(ByRef a As Types.Item)\nPublic Sub Work(ByRef a As Item)\nRaiseEvent Changing(a)\nEnd Sub','class')]);
 const c=compileProject(p);assert.deepEqual(c.diagnostics,[]);const output=[];
 const vm=new VirtualMachine(c,{print:s=>output.push(s),sourceEvent:(_i,_n,args)=>{args[0].ref.get().Value=23;}});await vm.start();assert.deepEqual(output,['23']);
});
test('private field-array ReDim keeps the declaration identity when caller shadows its name',async()=>{
 const r=await run(record('Item','Private')+'\n'+main('ReDim SharedItems(1)\nSharedItems(0).Value = 17\nReDim Preserve SharedItems(2)\nDebug.Print SharedItems(0).Value, SharedItems(2).Value'),[
 module('Types',record('Item','Private')+'\nPublic SharedItems() As Item')]);assert.deepEqual(r.output,['17 0']);
});
test('explicit ReDim cannot substitute caller private type into imported typed storage',()=>{
 invalid(record('Item','Private')+'\n'+main('ReDim SharedItems(1) As Item'),/element type/,[module('Types',record('Item','Private')+'\nPublic SharedItems() As Item')]);
});
test('Variant-held private record arrays preserve their factory across untyped ReDim',async()=>{
 const r=await run(record('Item','Private','Wrong As String')+'\n'+main('Dim a As Variant\na = Types.MakeItems()\nReDim a(2)\nDebug.Print a(2).Value'),[
 module('Types',record('Item','Private')+'\nPublic Function MakeItems() As Variant\nDim a() As Item\nMakeItems = a\nEnd Function')]);assert.deepEqual(r.output,['0']);
});
test('Random file record arrays preserve nominal type through decode and growth',async()=>{
 const r=await run(main('Dim a() As Types.Item, b() As Item\nReDim a(1 To 2)\na(2).Value = 29\nOpen "items.dat" For Random As #1 Len = 18\nPut #1, 1, a\nGet #1, 1, b\nClose\nReDim Preserve b(1 To 3)\nDebug.Print b(2).Value, b(3).Value'),[types]);assert.deepEqual(r.output,['29 0']);
});
test('property contracts accept record qualification aliases',async()=>{
 const r=await run(main('Dim a As New Holder, value As Item\nvalue.Value = 31\na.Item = value\nvalue = a.Item\nDebug.Print value.Value'),[types,module('Holder','Private stored As Item\nPublic Property Get Item() As Types.Item\nItem = stored\nEnd Property\nPublic Property Let Item(ByRef value As Item)\nstored = value\nEnd Property','class')]);assert.deepEqual(r.output,['31']);
});
test('interface contracts bind qualified record types against the declaring interface',async()=>{
 const r=await run(main('Dim source As New Worker, target As Contract, value As Item\nSet target = source\ntarget.Change value\nDebug.Print value.Value'),[types,module('Contract','Public Sub Change(ByRef a As Types.Item)\nEnd Sub','class'),module('Worker','Implements Contract\nPrivate Sub Contract_Change(ByRef a As Item)\na.Value = 37\nEnd Sub','class')]);assert.deepEqual(r.output,['37']);
});
test('matching-shaped private record declarations do not satisfy another interface type',()=>{
 invalid(main(''),/does not match/,[module('Contract',record('Item','Private')+'\nPublic Sub Change(ByRef a As Item)\nEnd Sub','class'),module('Worker',record('Item','Private')+'\nImplements Contract\nPrivate Sub Contract_Change(ByRef a As Item)\nEnd Sub','class')]);
});
test('live-edit policies reject record visibility changes before modifying storage',async()=>{
 for(const policy of ['strict','versioned']){
  const p=await pause(record('Item','Private')+'\n'+main('Dim a As Item\na.Value = 5\nDebug.Print a.Value'),7);
  const next=structuredClone(p.project);next.modules[0].code=next.modules[0].code.replace('Private Type','Public Type');
  assert.throws(()=>p.vm.applyEdits(next,{policy}),/Restart required/);assert.equal(p.vm.program.modules.get('m').typeScopes.item,'private');await finish(p);assert.deepEqual(p.output,['5']);
 }
});

test('nominal metadata does not reserve a new source record field name',async()=>{
 const r=await run(record('Item','Private','[__recordIdentity] As Long')+'\n'+main('Dim a As Item, b As Item\na.[__recordIdentity] = 41\nb = a\nDebug.Print b.[__recordIdentity]'));assert.deepEqual(r.output,['41']);
});

test('source event declarations cannot pass a record ByVal',()=>{
 invalid(main(''),/ByVal/,[types,module('Emitter','Public Event Changed(ByVal a As Types.Item)','class')]);
});
