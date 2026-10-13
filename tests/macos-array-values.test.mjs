import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMacOS} from '../packages/macos-native/src/compiler.js';
import {compileMacOSAOT} from '../packages/macos-native/src/aot-compiler.js';
import {arrayModules} from '../packages/macos-native/tests/arrays.mjs';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
const project={schema:1,name:'ArrayValues',startup:'Sub Main',modules:[...arrayModules(),{name:'Main',kind:'module',code:'Sub Main()\nCheckNativeArrays\nEnd Sub'}]};
test('native array acceptance also passes the independent browser VM',async()=>{
 const program=compileProject(project);assert.equal(program.valid,true,JSON.stringify(program.diagnostics));
 const printed=[],vm=new VirtualMachine(program,{print:text=>printed.push(text)});
 await vm.start();assert.equal(vm.lastError?.number,13);assert.ok(printed.includes('NATIVE_ARRAYS_OK'));
});
test('both native lowerings preserve function and property result array shape',()=>{
 const source=compileMacOS(project).files['main.cpp'],native=compileMacOSAOT(project);
 const arrays=native.metadata.modules.flatMap(m=>m.procedures).filter(p=>p.returnArray);
 assert.equal(arrays.length,8);assert.ok(arrays.some(p=>p.accessor==='get'));
 assert.equal((source.match(/p.returnArray=true/g)||[]).length,arrays.length);
 assert.ok(source.includes('f.declare("implicitValues"'));
});
for(const backend of [compileMacOS,compileMacOSAOT])test(backend.name+' rejects array native Declare ABI instead of scalar lowering',()=>{
 assert.throws(()=>backend({schema:1,name:'BadABI',startup:'Sub Main',modules:[{name:'M',kind:'module',code:'Declare Function GetTickCount Lib "kernel32" () As Long()\nSub Main()\nEnd Sub'}]}),error=>error.diagnostics?.some(d=>/array|Unexpected|declaration/i.test(d.message)));
});
