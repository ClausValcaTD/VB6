import test from 'node:test';
import assert from 'node:assert/strict';
import {VirtualMachine} from '../src/runtime/vm.js';
import {VBArray} from '../src/runtime/values.js';

async function paused(t,code,line){
 const project={name:'ArrayLiveEdit',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]},output=[];
 const vm=new VirtualMachine(project,{print:s=>output.push(s)},{debuggerEnabled:true});assert.equal(vm.program.valid,true,JSON.stringify(vm.program.diagnostics));
 t.after(()=>vm.stop());
 const next=new Promise(resolve=>{const off=vm.on('pause',e=>{off();resolve(e);});});
 vm.setBreakpoint('M',line);const running=vm.start();await next;
 return {vm,project,output,running};
}

test('Strict live edit rejects scalar-to-array return changes without mutating the active frame',async t=>{
 const code='Sub Main()\nDebug.Print IsArray(F())\nDebug.Print IsArray(F())\nEnd Sub\nFunction F() As Long\nF = F\nEnd Function';
 const {vm,project,output,running}=await paused(t,code,6),old=vm.currentFrame.proc,result=vm.currentFrame.result;
 project.modules[0].code=code.replace('As Long\n','As Long()\n');
 assert.throws(()=>vm.applyEdits(project),/signature changed/);assert.equal(vm.currentFrame.proc,old);assert.equal(vm.currentFrame.result,result);assert.equal(vm.codeRevision,undefined);
 vm.breakpoints.clear();vm.resume();await running;assert.deepEqual(output,['False','False']);
});

test('Versioned edit retains the scalar invocation and uses array storage on the next call',async t=>{
 const code='Sub Main()\nDebug.Print IsArray(F())\nDebug.Print IsArray(F())\nEnd Sub\nFunction F() As Long\nF = F\nEnd Function';
 const {vm,project,output,running}=await paused(t,code,6);
 project.modules[0].code=code.replace('As Long\n','As Long()\n');
 const result=vm.applyEdits(project,{policy:'versioned'});assert.equal(result.retainedFrames.length,2);assert.equal(vm.currentFrame.proc.returnArray,undefined);assert.equal(vm.currentFrame.result.get() instanceof VBArray,false);
 vm.breakpoints.clear();vm.resume();await running;assert.deepEqual(output,['False','True']);
});

for(const policy of ['strict','versioned'])test(policy+' edit protects implicit ReDim storage in Static procedures',async t=>{
 const code='Sub Main()\nWork\nDebug.Print "pause"\nWork\nEnd Sub\nStatic Sub Work()\nReDim a(1) As Long\na(0) = 7\nDebug.Print TypeName(a)\nEnd Sub';
 const {vm,project,output,running}=await paused(t,code,3);
 project.modules[0].code=code.replace('a(1) As Long','a(1) As String');
 assert.throws(()=>vm.applyEdits(project,{policy}),/static local storage/);assert.equal(vm.codeRevision,undefined);
 vm.breakpoints.clear();vm.resume();await running;assert.deepEqual(output,['Long()','pause','Long()']);
});

test('Paused For Each locks its source; reset releases it after stack unwind',async t=>{
 const code='Dim a As Variant\nSub Main()\nDim item As Variant\na = Array(1, 2)\nFor Each item In a\nDebug.Print item\nNext\nEnd Sub';
 const {vm,running}=await paused(t,code,6),array=vm.instances.get('m').fields.get('a').get();
 assert.throws(()=>array.redim([[0,3]],true),e=>e.number===10);
 vm.stop();await running;assert.doesNotThrow(()=>array.redim([[0,3]],true));assert.equal(vm.stack.length,0);
});

test('Paused ByRef element locks its source; reset does not leak the reference lease',async t=>{
 const code='Dim a() As Long\nSub Main()\nReDim a(1)\nWork a(0)\nEnd Sub\nSub Work(ByRef item As Long)\nDebug.Print item\nEnd Sub';
 const {vm,running}=await paused(t,code,7),array=vm.instances.get('m').fields.get('a').get();
 assert.throws(()=>array.redim([[0,3]],true),e=>e.number===10);
 vm.stop();await running;assert.doesNotThrow(()=>array.redim([[0,3]],true));assert.equal(vm.stack.length,0);
});

test('Versioned loop edit retains its old enumeration lock until that invocation finishes',async t=>{
 const code='Dim a As Variant\nSub Main()\na = Array(1, 2)\nWork\na = 9\nDebug.Print a\nEnd Sub\nSub Work()\nDim item As Variant\nFor Each item In a\nDebug.Print item\nNext\nEnd Sub';
 const {vm,project,output,running}=await paused(t,code,11),array=vm.instances.get('m').fields.get('a').get();
 project.modules[0].code=code.replace('For Each item In a\nDebug.Print item\nNext','Debug.Print "new"');
 const result=vm.applyEdits(project,{policy:'versioned'});assert.equal(result.retainedFrames.length,2);assert.throws(()=>array.redim([[0,3]],true),e=>e.number===10);
 vm.breakpoints.clear();vm.resume();await running;assert.deepEqual(output,['1','2','9']);assert.doesNotThrow(()=>array.redim([[0,3]],true));
});
