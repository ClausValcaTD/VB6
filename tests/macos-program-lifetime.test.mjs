import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {programLifetimeProject,formLifetimeProject,abruptLifetimeProject} from '../packages/macos-native/tests/program-lifetime.mjs';
import {compileMacOS} from '../packages/macos-native/src/compiler.js';
import {compileMacOSAOT} from '../packages/macos-native/src/aot-compiler.js';

for(const [name,factory] of [['program roots',programLifetimeProject],['default forms',formLifetimeProject],['abrupt End',abruptLifetimeProject]])
  test('both native compilers lower '+name+' at all optimization levels',()=>{
    for(const optimization of [0,1,2,3]){
      const project=factory(),before=JSON.stringify(project);
      const source=compileMacOS(project,{optimization}),aot=compileMacOSAOT(project,{optimization});
      assert.ok(source.files['main.cpp'].includes('Class_Terminate')||source.files['main.cpp'].includes('Form_Terminate'));
      assert.ok(aot.report.codeBytes>0);assert.equal(aot.report.optimization.level,optimization);
      assert.equal(JSON.stringify(project),before);
    }
  });
test('form reset lowers a writable default-form slot, not an eager read',()=>{
  const source=compileMacOS(formLifetimeProject()).files['main.cpp'];
  assert.ok(source.includes('auto target=f.ref("Form1");auto value=Value::object(nullptr);assign(f.runtime,target,value,true);'));
});
test('runtime source discovery includes normal-lifecycle implementation',async()=>{
  const files=await fs.readdir(new URL('../packages/macos-native/native/',import.meta.url));
  assert.ok(files.includes('program-lifetime.cpp'));
  const source=await fs.readFile(new URL('../packages/macos-native/native/program-lifetime.cpp',import.meta.url),'utf8');
  assert.match(source,/bool Runtime::finish\(\)/);
  assert.match(source,/void Runtime::stop\(\) noexcept/);
});
