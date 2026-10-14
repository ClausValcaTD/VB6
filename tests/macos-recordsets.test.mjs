import test from 'node:test';
import assert from 'node:assert/strict';
import {recordsetProject} from '../packages/macos-native/tests/recordsets.mjs';
import {compileMacOS} from '../packages/macos-native/src/compiler.js';
import {compileMacOSAOT} from '../packages/macos-native/src/aot-compiler.js';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
for(const optimization of [0,1,2,3])test('native recordset fixture lowers at O'+optimization,()=>{
  const project=recordsetProject(),before=JSON.stringify(project);
  assert.ok(compileMacOS(project,{optimization}).files['main.cpp']);
  assert.ok(compileMacOSAOT(project,{optimization}).section.length);
  assert.equal(JSON.stringify(project),before);
});
test('native recordset acceptance also executes in the independent browser VM',async()=>{
  const program=compileProject(recordsetProject());assert.ok(program.valid,JSON.stringify(program.diagnostics));
  const output=[],errors=[],pauses=[],vm=new VirtualMachine(program,{print:t=>output.push(t),error:e=>errors.push(e)});
  vm.on('pause',event=>{pauses.push(event.reason);queueMicrotask(()=>vm.stop());});
  await vm.start();assert.deepEqual(errors,[]);assert.deepEqual(pauses,[]);assert.ok(output.includes('NATIVE_RECORDSETS_OK'));
});

for(const optimization of [0,1,2,3])test('original Data sample retains source and designer at O'+optimization,async()=>{
  const fs=await import('node:fs/promises');const {macOSDataSampleProject}=await import('../tools/macos-data-sample-fixture.mjs');
  const original=JSON.parse(await fs.readFile(new URL('../examples/data.vb6web',import.meta.url),'utf8'));
  const project=macOSDataSampleProject();const originalForm=original.modules.find(m=>m.name==='frmData'),form=project.modules.find(m=>m.name==='frmData');
  assert.ok(form.code.startsWith(originalForm.code));assert.deepEqual(form.form,originalForm.form);
  assert.ok(compileMacOS(project,{optimization}).files['main.cpp']);assert.ok(compileMacOSAOT(project,{optimization}).section.length);
});
