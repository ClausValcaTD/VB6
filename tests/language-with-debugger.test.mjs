import test from 'node:test';
import assert from 'node:assert/strict';
import {VirtualMachine} from '../src/runtime/vm.js';
import {assertArrayUnlocked} from '../src/runtime/array-lifetime.js';

const types=`Private Type Child
Value As Long
End Type
Private Type Item
Value As Long
Nested As Child
End Type
Dim a() As Item`;
async function paused(t,withBlock=false){
 const code=`${types}
Sub Main()
ReDim a(1)
a(0).Value = 7
a(0).Nested.Value = 11
${withBlock?'With a(0)\nDebug.Print .Value\nEnd With':'Debug.Print a(0).Value'}
ReDim Preserve a(3)
Debug.Print UBound(a)
End Sub
Function Resize() As Long
ReDim a(4)
Resize = UBound(a)
End Function
Function Probe() As Long
With a(0)
With .Nested
Probe = .Value
End With
End With
End Function`;
 const project={name:'WithDebugger',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]},output=[];
 const vm=new VirtualMachine(project,{print:s=>output.push(s)},{debuggerEnabled:true});
 assert.deepEqual(vm.program.diagnostics,[]);
 t.after(()=>vm.stop());
 const pause=new Promise(resolve=>{const off=vm.on('pause',e=>{off();resolve(e);});});
 vm.setBreakpoint('M',code.split('\n').findIndex(s=>s=== (withBlock?'Debug.Print .Value':'Debug.Print a(0).Value'))+1);
 const running=vm.start();await pause;
 return {vm,project,output,running,array:vm.instances.get('m').fields.get('a').get()};
}
async function finish(c){c.vm.breakpoints.clear();c.vm.resume();await c.running;assert.notEqual(c.vm.state,'error',c.vm.lastError?.message);}

test('Automatic/explicit watches and Immediate assignment use the paused lexical With',async t=>{
 const c=await paused(t,true);assert.equal(await c.vm.evaluateWatch('.Value'),7);assert.equal(await c.vm.evaluateExplicit('.Value'),7);
 await c.vm.immediate('.Value = 9');assert.throws(()=>assertArrayUnlocked(c.array),e=>e.number===10);
 await finish(c);assert.deepEqual(c.output,['9','3']);assert.doesNotThrow(()=>assertArrayUnlocked(c.array));
});
test('Explicit evaluation executes its own nested With using the running instruction',async t=>{
 const c=await paused(t,true);assert.equal(await c.vm.evaluateExplicit('Probe()'),11);assert.equal(c.vm.stack.length,1);
 assert.equal(await c.vm.evaluateExplicit('.Value'),7);await finish(c);assert.deepEqual(c.output,['7','3']);
});
test('Immediate array target lease is released before returning to the paused caller',async t=>{
 const c=await paused(t);await c.vm.immediate('a(0).Value = 9');assert.doesNotThrow(()=>assertArrayUnlocked(c.array));
 await finish(c);assert.deepEqual(c.output,['9','3']);
});
test('Immediate assignment retains array storage across RHS evaluation and releases on failure',async t=>{
 const c=await paused(t);await assert.rejects(()=>c.vm.immediate('a(0).Value = Resize()'),e=>e.number===10);
 assert.equal(c.array.bounds[0][1],1);assert.equal(c.array.get(0).Value,7);assert.doesNotThrow(()=>assertArrayUnlocked(c.array));
 await finish(c);assert.deepEqual(c.output,['7','3']);
});
test('Multiple Immediate statements have separate target lifetimes',async t=>{
 const c=await paused(t);await c.vm.immediate('a(0).Value = 9 : Call Resize()');assert.equal(c.array.bounds[0][1],4);
 assert.doesNotThrow(()=>assertArrayUnlocked(c.array));await finish(c);assert.deepEqual(c.output,['4','0','3']);
});
test('Cancelling an Immediate RHS releases its element target',async t=>{
 const c=await paused(t);c.vm.library.set('waitforever',()=>new Promise(()=>{}));
 await assert.rejects(()=>c.vm.immediate('a(0).Value = WaitForever()',{timeLimit:20}),e=>e.number===7);
 assert.doesNotThrow(()=>assertArrayUnlocked(c.array));assert.equal(c.vm.state,'paused');await finish(c);assert.deepEqual(c.output,['7','3']);
});
test('Strict live edit cannot retarget an active With receiver',async t=>{
 const c=await paused(t,true),old=c.vm.currentFrame.proc;
 c.project.modules[0].code=c.project.modules[0].code.replace('With a(0)','With a(1)');
 assert.throws(()=>c.vm.applyEdits(c.project),/Restart required/);assert.equal(c.vm.currentFrame.proc,old);
 assert.throws(()=>assertArrayUnlocked(c.array),e=>e.number===10);await finish(c);assert.deepEqual(c.output,['7','3']);
});
test('Strict expression edit keeps its original With receiver and reconciles replacement code',async t=>{
 const c=await paused(t,true);c.project.modules[0].code=c.project.modules[0].code.replace('Debug.Print .Value','Debug.Print .Value + 1');
 c.vm.applyEdits(c.project);assert.throws(()=>assertArrayUnlocked(c.array),e=>e.number===10);
 await finish(c);assert.deepEqual(c.output,['8','3']);assert.doesNotThrow(()=>assertArrayUnlocked(c.array));
});
test('Versioned edit retains the old With activation until it returns',async t=>{
 const c=await paused(t,true),oldCode=c.vm.currentFrame.proc.code;
 c.project.modules[0].code=c.project.modules[0].code.replace('With a(0)\nDebug.Print .Value\nEnd With','Debug.Print "replacement"');
 c.vm.applyEdits(c.project,{policy:'versioned'});assert.equal(c.vm.currentFrame.proc.code,oldCode);assert.throws(()=>assertArrayUnlocked(c.array),e=>e.number===10);
 await finish(c);assert.deepEqual(c.output,['7','3']);assert.doesNotThrow(()=>assertArrayUnlocked(c.array));
});
