import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compileWin32} from '../src/native/compiler.js';
import {newProject} from '../src/project/model.js';
const classModule={id:'c',kind:'class',name:'Counter',code:'Private secret As Long\nPublic value As Long\nPublic Function NextValue() As Long\nStatic n As Long\nn=n+1\nNextValue=n\nEnd Function'};
const project=code=>({...newProject('TypedClasses'),startup:'Sub Main',modules:[{name:'M',id:'m',kind:'module',code:'Sub Main()\n'+code+'\nEnd Sub'},structuredClone(classModule)]});
for(const optimization of[0,1,2])test(`unchanged Compatibility sample exports typed class and string operations O${optimization}`,()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../examples/compatibility.vb6web',import.meta.url))),before=JSON.stringify(p),a=compileWin32(p,{optimization});
 assert.deepEqual(a.bytes,compileWin32(p,{optimization}).bytes);assert.equal(JSON.stringify(p),before);assert.equal(a.report.extraction,false);
 assert.ok(a.report.sourceMap.some(s=>s.source==='Counter'&&s.procedure==='NextValue'));
 assert.ok(!a.report.sourceMap.some(s=>s.source==='NativeClassService'));
});
for(const code of [
 'Dim a As New Counter\nDim n As Long\nn=a',
 'Dim a As New Counter\nDim n As Double\nn=CDbl(a)',
 'Dim a As New Counter\nDim n As Currency\nn=CCur(a)',
 'Dim a As New Counter\nIf a Then a.value=1',
 'Dim a As New Counter\na=1',
 'Dim a As New Counter\nSet a=1',
 'Dim a As New Counter\nDim s As String\ns=CStr(a)',
 'Dim a As New Counter\na.secret=3',
 'Dim a As New Counter\na.Missing=3',
 'Dim a As New Counter\na.Missing 3',
 'Dim a() As Counter',
 'Dim n As Long\nn=Counter.NextValue()',
 'Dim n As Long\nn=NextValue()',
])test('invalid class access is a compiler diagnostic, not a pointer conversion: '+code,()=>{
 assert.throws(()=>compileWin32(project(code)),e=>e.name==='NativeCompileError');
});

test('native Compatibility acceptance preserves every original sample statement and designer object',async()=>{
 const {nativeCompatibilitySampleFixture}=await import('../tools/win32-compatibility-sample-fixture.mjs');
 const original=JSON.parse(fs.readFileSync(new URL('../examples/compatibility.vb6web',import.meta.url))),{project:p,checks}=nativeCompatibilitySampleFixture();
 for(const m of original.modules){const actual=p.modules.find(x=>x.id===m.id);assert.ok(actual.code.startsWith(m.code));if(m.form)assert.deepEqual(actual.form,m.form);}
 assert.equal(checks.length,8);
 for(const optimization of [0,1,2]){const a=compileWin32(p,{optimization});assert.ok(a.bytes.length<100*1024);assert.deepEqual(a.bytes,compileWin32(p,{optimization}).bytes);}
});
