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
 const printed=[],unhandled=[],vm=new VirtualMachine(program,{print:text=>printed.push(text),error:error=>unhandled.push(error)});
 await vm.start();assert.deepEqual(unhandled,[]);assert.notEqual(vm.state,'error');assert.equal(vm.err.Number,0);assert.ok(printed.includes('NATIVE_ARRAYS_OK'));
});
test('both native lowerings preserve function and property result array shape',()=>{
 const source=compileMacOS(project).files['main.cpp'],native=compileMacOSAOT(project);
 const arrays=native.metadata.modules.flatMap(m=>m.procedures).filter(p=>p.returnArray);
 assert.equal(arrays.length,10);assert.ok(arrays.some(p=>p.accessor==='get'));
 assert.equal((source.match(/p.returnArray=true/g)||[]).length,arrays.length);
 assert.ok(source.includes('f.declare("implicitValues"'));
});
for(const backend of [compileMacOS,compileMacOSAOT])test(backend.name+' rejects array native Declare ABI instead of scalar lowering',()=>{
 assert.throws(()=>backend({schema:1,name:'BadABI',startup:'Sub Main',modules:[{name:'M',kind:'module',code:'Declare Function GetTickCount Lib "kernel32" () As Long()\nSub Main()\nEnd Sub'}]}),error=>error.diagnostics?.some(d=>/array|Unexpected|declaration/i.test(d.message)));
});

test('array error acceptance cannot swallow a failed assertion with Resume Next',async()=>{
 const broken=structuredClone(project);const module=broken.modules.find(m=>m.name==='NativeArrayChecks');
 module.code=module.code.replace('Debug.Assert Err.Number = 10','Debug.Assert Err.Number = 999');
 const printed=[],pauses=[],vm=new VirtualMachine(compileProject(broken),{print:text=>printed.push(text)});
 vm.on('pause',event=>{pauses.push(event.reason);queueMicrotask(()=>vm.stop());});
 await vm.start();assert.ok(pauses.includes('assert'));assert.ok(!printed.includes('NATIVE_ARRAYS_OK'));
});
