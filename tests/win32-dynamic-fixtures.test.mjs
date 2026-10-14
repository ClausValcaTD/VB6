import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileWin32} from '../src/native/compiler.js';
import {nativeControlFixtures} from '../tools/win32-control-fixtures.mjs';
import {nativeEventsSampleFixture} from '../tools/win32-events-sample-fixture.mjs';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
test('original Events verifier preserves every statement and designer object',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../examples/events.vb6web',import.meta.url))),{project,checks}=nativeEventsSampleFixture();
 assert.equal(checks.length,12);
 for(const module of original.modules){const actual=project.modules.find(m=>m.id===module.id);assert.ok(actual.code.startsWith(module.code));if(module.form)assert.deepEqual(actual.form,module.form);}
 for(const optimization of [0,1,2]){
  const before=JSON.stringify(original),sample=compileWin32(original,{optimization}),verified=compileWin32(project,{optimization});
  assert.equal(JSON.stringify(original),before);assert.deepEqual(sample.bytes,compileWin32(original,{optimization}).bytes);
  assert.equal(verified.report.target,'win32-aot');assert.equal(verified.report.extraction,false);
  // A complete original application is distinct from the small isolated
  // fixtures. Bound only the appended verifier's overhead; never simplify it.
  assert.ok(verified.bytes.length<=sample.bytes.length+24*1024);
 }
});
for(const name of ['AotControlDynamicArrays','AotControlDynamicReferences','AotControlDynamicInput'])test(`${name} keeps the existing small-fixture size budget`,()=>{
 const f=nativeControlFixtures().find(f=>f.project.name===name),before=JSON.stringify(f.project);
 for(const optimization of [0,1,2]){const result=compileWin32(f.project,{optimization});assert.ok(result.bytes.length<100*1024);assert.deepEqual(result.bytes,compileWin32(f.project,{optimization}).bytes);}
 assert.equal(JSON.stringify(f.project),before);
});
for(const name of ['AotControlOriginalEvents','AotControlDynamicArrays','AotControlDynamicReferences','AotControlDynamicInput'])for(const optimization of [0,1,2])test(`native acceptance fixture control flow executes with explicit foreign doubles: ${name} O${optimization}`,t=>{
 const {project}=nativeControlFixtures().find(f=>f.project.name===name),h=dynamicControlMachine(t,project,optimization),exit=new Error('simulated process exit');
 let code=null;
 h.vm.hook('kernel32.dll','GetCurrentProcess',0,()=>0xffffffff);
 h.vm.hook('user32.dll','GetGuiResources',2,([process,kind])=>{assert.equal(process,0xffffffff);assert.equal(kind,0);return [...h.fonts.values()].filter(f=>!f.stock).length;});
 h.vm.hook('kernel32.dll','ExitProcess',1,([result])=>{code=result;throw exit;});
 assert.throws(()=>{
  if(name==='AotControlOriginalEvents'){h.create('frmEvents');h.invokeForm('frmEvents','NativeVerify');}
  else if(name==='AotControlDynamicArrays'){
   // This is a complete application with 50 creation/disposal cycles, not a
   // single helper invocation. Keep every iteration/assertion and a finite
   // application budget; the default helper guard remains two million.
   h.vm.invoke('create:Form1',[],{maxInstructions:8000000});
  }else h.create('Form1');
 },error=>error===exit);
 assert.equal(code,0,`native assertion ${code} failed in the checked machine; not a Windows result`);
});
