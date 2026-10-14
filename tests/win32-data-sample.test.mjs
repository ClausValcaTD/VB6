import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {nativeDataSampleFixture} from '../tools/win32-data-sample-fixture.mjs';
import {nativeControlFixtures} from '../tools/win32-control-fixtures.mjs';
import {compileWin32} from '../src/native/compiler.js';
for(const optimization of [0,1,2])test(`unchanged Data sample compiles to native ADO/grid code deterministically O${optimization}`,()=>{
 const project=JSON.parse(fs.readFileSync(new URL('../examples/data.vb6web',import.meta.url))),before=JSON.stringify(project),a=compileWin32(project,{optimization});
 assert.equal(a.report.target,'win32-aot');assert.equal(a.report.extraction,false);assert.deepEqual(a.bytes,compileWin32(project,{optimization}).bytes);assert.equal(JSON.stringify(project),before);
 assert.ok(a.report.imports.some(i=>i.symbol==='CoCreateInstance'));assert.ok(a.report.imports.some(i=>i.symbol==='SafeArrayAccessData'));assert.ok(a.report.imports.some(i=>i.symbol==='DialogBoxIndirectParamW'));
});
test('original Data acceptance retains every authored statement/designer object and drives real source handlers',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../examples/data.vb6web',import.meta.url))),{project,checks}=nativeDataSampleFixture();
 assert.equal(checks.length,12);
 for(const m of original.modules){const copy=project.modules.find(x=>x.id===m.id);assert.ok(copy);assert.ok(copy.code.startsWith(m.code));if(m.form)assert.deepEqual(copy.form,m.form);}
 assert.match(project.modules[0].code,/NativeClick\(cmdAdd\.hWnd/);assert.match(project.modules[0].code,/NativeClick\(cmdSort\.hWnd/);assert.match(project.modules[0].code,/NativeClick\(cmdClose\.hWnd/);
 for(const optimization of [0,1,2])assert.ok(compileWin32(project,{optimization}).bytes.length<100*1024,'retain the original strict fixture size cap');
});
test('real Recordset binding acceptance retains ten independent native assertions under the size cap',()=>{
 const {project,checks}=nativeControlFixtures().find(f=>f.project.name==='AotControlDataBinding'),before=JSON.stringify(project);assert.equal(checks.length,10);
 for(const optimization of [0,1,2]){const a=compileWin32(project,{optimization});assert.ok(a.bytes.length<100*1024);assert.deepEqual(a.bytes,compileWin32(project,{optimization}).bytes);}
 assert.equal(JSON.stringify(project),before);
});


test('real binding fixture explicitly admits and verifies the Null used by its conversion check',()=>{
 const {project,checks}=nativeControlFixtures().find(f=>f.project.name==='AotControlDataBinding');
 const code=project.modules[0].code;
 assert.ok(code.includes('rs.Fields.Append "Name",adVarWChar,80,adFldIsNullable'));
 assert.ok(code.includes('rs.Fields.Item("Name").Value=Null\nrs.Update\nG.DataSource=rs'));
 const assertion=code.split('\n').find(line=>line.includes('Then ExitProcess 7'));
 assert.ok(assertion.includes('IsNull(rs.Fields.Item("Name").Value)'));
 assert.ok(assertion.includes('G.TextMatrix(2,1)=""'));
 assert.equal(checks.length,10);
});
