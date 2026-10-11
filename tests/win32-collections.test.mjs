import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileWin32} from '../src/native/compiler.js';
import {newProject} from '../src/project/model.js';
import {COLLECTION_KERNEL} from '../src/native/collection-kernel.js';
import {compileModule} from '../src/language/compiler.js';
import {nativeControlFixtures} from '../tools/win32-control-fixtures.mjs';
const project=code=>({...newProject('Collections'),startup:'Sub Main',modules:[{id:'m',name:'M',kind:'module',code}]});
const body=code=>project('Private Sub Main()\n'+code+'\nEnd Sub');
test('private collection service parses with explicit optional argument metadata',()=>{
 const m=compileModule({name:'K',kind:'module',code:COLLECTION_KERNEL});
 assert.deepEqual(m.procedures.get('collectionadd').params.map(p=>[p.name,!!p.optional,p.byRef]),[
 ['receiver',false,false],['item',false,false],['key',true,false],['before',true,false],['after',true,false]]);
});
for(const optimization of [0,1,2])test(`unchanged Language Lab compiles deterministically to native PE32 O${optimization}`,()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../examples/language.vb6web',import.meta.url))),before=JSON.stringify(p);
 const a=compileWin32(p,{optimization}),b=compileWin32(p,{optimization});assert.deepEqual(a.bytes,b.bytes);assert.equal(JSON.stringify(p),before);
 assert.equal(a.report.target,'win32-aot');assert.equal(a.report.extraction,false);
 for(const symbol of ['HeapAlloc','HeapFree','VariantCopyInd','VariantClear'])assert.ok(a.report.imports.some(i=>i.symbol===symbol),symbol);
 assert.ok(!a.report.sourceMap.some(s=>s.source.startsWith('NativeCollectionService')));
});
for(const source of [
 'Dim c As New Collection\nc.Add "text","key"\nc.Add 12,before:="key"\nDim value As Variant\nFor Each value In c\n Debug.Print value\nNext',
 'Dim c As Collection,a As Collection\nSet c=New Collection\nSet a=c\nSet c=Nothing\nDebug.Print a.Count',
 'Dim c As New Collection\nWith c\n .Add "one","key"\n Debug.Print .Count\n Debug.Print .Item("KEY")\nEnd With',
 'Dim c As New Collection,v As Variant\nFor Each v In c\n Exit For\nNext',
 'Dim c As New Collection,n As Long\nn=VarType(c)\nIf IsObject(c) Then Debug.Print TypeName(c)\nIf TypeOf c Is Collection Then Debug.Print "typed"\nIf c Is Nothing Then Debug.Print "null"'
])test('typed Collection operations compile without changing the source: '+source,()=>{
 const p=body(source),before=JSON.stringify(p);assert.ok(compileWin32(p).bytes.length);assert.equal(JSON.stringify(p),before);
});
test('typed ByVal, ByRef, grouped arguments and function-return ownership lower through real call ABI',()=>{
 const p=project(`Private Sub Main()
 Dim c As New Collection,a As Collection
 c.Add "kept"
 Take c
 Clear (c)
 Set a=Identity(c)
 Clear a
End Sub
Private Sub Take(ByVal c As Collection)
 Set c=Nothing
End Sub
Private Sub Clear(ByRef c As Collection)
 Set c=Nothing
End Sub
Private Function Identity(ByVal c As Collection) As Collection
 Set Identity=c
End Function`);
 for(const optimization of [0,1,2])assert.ok(compileWin32(p,{optimization}).bytes.length);
});
for(const code of ['Dim c As New Collection\nDim n As Long\nn=c',
 'Dim c As New Collection\nDebug.Print c',
 'Dim c As New Collection\nc=1',
 'Dim c As Collection\nSet c=1',
 'Dim c As New Collection\nc.Add',
 'Dim c As New Collection\nc.Add typo:=1',
 'Dim c As New Collection\nc.Remove',
 'Dim c As New Collection\nDim v As Variant\nv=c.Item()',
 'Dim c As New Collection\nDim n As Long\nFor Each n In c\nNext',
 'Dim c() As Collection',
 'Dim c As New Collection\nc.Add c',
 'Dim c As New Collection\nc.Missing 1'])test('invalid or unsupported collection behavior fails closed: '+code,()=>{
 assert.throws(()=>compileWin32(body(code)));
});

for(const name of ['AotControlCollectionValues','AotControlCollections'])test(name+' retains independent Windows assertions and the existing PE size budget',()=>{
 const fixture=nativeControlFixtures().find(f=>f.project.name===name),before=JSON.stringify(fixture.project);
 assert.equal(fixture.checks.length,name==='AotControlCollectionValues'?14:20);
 for(const optimization of [0,1,2]){
  const a=compileWin32(fixture.project,{optimization}),b=compileWin32(fixture.project,{optimization});
  assert.deepEqual(a.bytes,b.bytes);assert.equal(a.report.target,'win32-aot');assert.equal(a.report.extraction,false);
  assert.ok(a.bytes.length<100*1024,'retain the native fixture size budget');
 }
 assert.equal(JSON.stringify(fixture.project),before);
});
test('Collection variable slots are not exposed through implicit external As Any',()=>{
 const p=project('Private Declare Sub F Lib "x" (p As Any)\nSub Main()\nDim c As New Collection\nF c\nEnd Sub');
 assert.throws(()=>compileWin32(p),/external As Any object ABI/);
});
