import test from 'node:test';
import assert from 'node:assert/strict';
import {AOTFunction,emitAOTFunctions} from '../packages/macos-native/src/aot-emitter.js';
import {optimizeAOTOperations} from '../packages/macos-native/src/aot-optimizer.js';
import {compileMacOSAOT} from '../packages/macos-native/src/aot-compiler.js';
import {conformanceProject} from '../packages/macos-native/tests/conformance.mjs';
function body(){const f=new AOTFunction(0);f.call('clear');const value=f.call('literal',0);f.branch(value,'exit');f.jump('next');f.label('next');f.call('finish');f.end();f.label('failure');f.call('exception');f.end();return f;}
test('all optimization levels preserve the native helper-call graph',()=>{
  const functions=[body()],before=JSON.stringify(functions),sections=[0,1,2,3].map(level=>emitAOTFunctions(functions,level));
  for(const section of sections)assert.deepEqual(section.fixups.filter(f=>f.label.startsWith('_vb6_aot')).map(f=>f.label),sections[0].fixups.filter(f=>f.label.startsWith('_vb6_aot')).map(f=>f.label));
  assert.equal(JSON.stringify(functions),before);
  assert.ok(sections[1].length<sections[0].length);assert.ok(sections[2].length<sections[1].length);assert.ok(sections[3].length<sections[2].length);
  assert.ok(sections[1].optimization.removedJumps);assert.ok(sections[2].optimization.elidedStores);assert.ok(sections[3].optimization.forwardedLoads);
});
test('liveness includes reused slots across labels, handler edges and indirect dispatch',()=>{
  const operations=[{op:'call',name:'get',args:[],out:{slot:1}},{op:'label',name:'handler'},{op:'select',value:{slot:1},pairs:[[0,'exit']],fallback:'exit'}];
  assert.ok(optimizeAOTOperations(operations,3).readSlots.has(1));
});
test('optimization preserves declaration, source and entry-table shape in conformance source',()=>{
  const results=[0,1,2,3].map(optimization=>compileMacOSAOT(conformanceProject(),{optimization}));
  for(const result of results){const metadata={...result.metadata};delete metadata.entries;const base={...results[0].metadata};delete base.entries;assert.deepEqual(metadata,base);assert.deepEqual(result.sourceMap,results[0].sourceMap);}
  assert.ok(results[3].section.length<results[0].section.length);
});
test('invalid optimization levels fail before code emission',()=>{for(const level of [-1,4,1.5,NaN,'2'])assert.throws(()=>emitAOTFunctions([body()],level),/optimization/);});
