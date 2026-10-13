import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {compileMacOS} from '../packages/macos-native/src/compiler.js';
import {compileMacOSAOT} from '../packages/macos-native/src/aot-compiler.js';
import {scopesProject} from '../packages/macos-native/tests/scopes.mjs';

test('native nested-reference/lexical-scope acceptance passes the independent VM',async()=>{
  const program=compileProject(scopesProject());assert.equal(program.valid,true,JSON.stringify(program.diagnostics));
  const output=[],errors=[],pauses=[],vm=new VirtualMachine(program,{print:t=>output.push(t),error:e=>errors.push(e)});
  vm.on('pause',event=>{pauses.push(event.reason);queueMicrotask(()=>vm.stop());});
  await vm.start();assert.deepEqual(errors,[]);assert.deepEqual(pauses,[]);assert.ok(output.includes('NATIVE_SCOPES_OK'));assert.equal(vm.err.Number,0);
});
for(const optimization of [0,1,2,3])test('O'+optimization+' lowers lexical scope identities and cleanup in both native paths',()=>{
  const project=scopesProject(),direct=compileMacOSAOT(project,{optimization}),cpp=compileMacOS(project,{optimization}).files['main.cpp'];
  assert.match(cpp,/f\.with\("\$with\d+"\)/);assert.match(cpp,/f\.closeEach/);assert.match(cpp,/borrowArrayValue/);assert.doesNotMatch(cpp,/withValues/);
  const ops=direct.functions.flatMap(f=>f.ops).filter(op=>op.op==='call');
  for(const name of ['with','with_push','with_pop','each_close','each_start','retain','release'])assert.ok(ops.some(op=>op.name===name),name);
  assert.ok(ops.filter(op=>op.name==='each_start').every(op=>op.args.length===4));
  assert.ok(ops.filter(op=>op.name==='with').every(op=>op.args.length===1));
});
