import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject} from '../src/language/compiler-core.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {assertArrayUnlocked} from '../src/runtime/array-lifetime.js';

const types=`Option Explicit
Private Type Child
Value As Long
End Type
Private Type Item
Value As Long
Nested As Child
End Type
Dim a() As Item
Dim calls As Long
Function Index() As Long
calls = calls + 1
End Function`;
const compile=(code,extra=[])=>compileProject({name:'WithLifetime',startup:'Sub Main',modules:[{name:'M',kind:'module',code},...extra]});
async function run(code,expected,extra=[]){
 const program=compile(code,extra);assert.deepEqual(program.diagnostics,[]);
 const output=[],vm=new VirtualMachine(program,{print:s=>output.push(s)});await vm.start();
 try{assert.notEqual(vm.state,'error',vm.lastError?.message);assert.deepEqual(output,expected);assert.equal(vm.stack.length,0);return vm;}
 finally{vm.stop();await vm.automationClose;await vm.dataClose;}
}
for(const operation of ['ReDim a(3)','ReDim Preserve a(3)','Erase a'])test('With record element retains storage through '+operation,()=>run(`${types}
Sub Main()
ReDim a(1)
a(0).Value = 7
On Error Resume Next
With a(Index())
${operation}
Debug.Print Err.Number, UBound(a), .Value
.Value = 8
End With
ReDim Preserve a(3)
Debug.Print UBound(a), a(0).Value, calls
End Sub`,['10 1 7','3 8 1']));

test('Nested record With retains its array owner',()=>run(`${types}
Sub Main()
ReDim a(1)
a(0).Nested.Value = 7
On Error Resume Next
With a(0).Nested
ReDim a(3)
Debug.Print Err.Number, .Value
.Value = 9
End With
ReDim Preserve a(3)
Debug.Print a(0).Nested.Value
End Sub`,['10 7','9']));

test('Grouped UDT With uses an independent value temporary',()=>run(`${types}
Sub Main()
ReDim a(1)
a(0).Value = 7
With (a(0))
.Value = 9
Debug.Print .Value, a(0).Value
ReDim a(3)
Debug.Print .Value, UBound(a)
End With
End Sub`,['9 7','9 3']));

test('UDT variable With preserves variable and field identity on assignment',()=>run(`${types}
Sub Main()
Dim x As Item, y As Item
y.Value = 17
With x
x = y
.Value = .Value + 1
End With
Debug.Print x.Value, y.Value
End Sub`,['18 17']));

test('Function-valued UDT With evaluates once into a temporary',()=>run(`${types}
Function Make() As Item
calls = calls + 1
Make.Value = 17
End Function
Sub Main()
With Make()
.Value = .Value + 1
Debug.Print .Value, calls
End With
End Sub`,['18 1']));

test('Object element With captures the object, not array storage or its default member',()=>run(`Sub Main()
Dim objects() As Box
ReDim objects(1)
Set objects(0) = New Box
objects(0).Value = 7
With objects(0)
ReDim objects(3)
.Value = .Value + 1
Debug.Print .Value, UBound(objects)
End With
End Sub`,['8 3'],[{name:'Box',kind:'class',code:`Public Value As Long
Public Property Get DefaultValue() As Long
Attribute DefaultValue.VB_UserMemId = 0
Err.Raise 5
End Property`}]));

for(const leave of ['GoTo finished','Exit Do','On 1 GoTo finished'])test('With releases record storage on '+leave,()=>run(`${types}
Sub Main()
ReDim a(1)
Do
With a(0)
.Value = 17
${leave}
End With
Loop While False
finished:
ReDim Preserve a(3)
Debug.Print UBound(a), a(0).Value
End Sub`,['3 17']));

test('Nested With releases only the inner lease',()=>run(`${types}
Sub Main()
ReDim a(1)
On Error Resume Next
With a(0)
With a(1)
.Value = 18
End With
ReDim a(3)
Debug.Print Err.Number
.Value = 17
End With
ReDim Preserve a(3)
Debug.Print a(0).Value, a(1).Value
End Sub`,['10','17 18']));

test('GoSub suspends With ownership and restores its receiver',()=>run(`${types}
Sub Main()
Dim other As Item
ReDim a(1)
With a(0)
.Value = 17
GoSub attempt
Debug.Print .Value
End With
ReDim Preserve a(3)
Debug.Print UBound(a)
Exit Sub
attempt:
On Error Resume Next
ReDim a(3)
Debug.Print Err.Number
With other
.Value = 18
Debug.Print .Value
End With
Return
End Sub`,['10','18','17','3']));

test('Active error handler suspends With until Resume Next',()=>run(`${types}
Sub Main()
ReDim a(1)
On Error GoTo handler
With a(0)
.Value = 17
Err.Raise 5
Debug.Print .Value
End With
ReDim Preserve a(3)
Debug.Print UBound(a)
Exit Sub
handler:
Debug.Print Err.Number
Resume Next
End Sub`,['5','17','3']));

test('Resume to a label outside With releases its lease',()=>run(`${types}
Sub Main()
ReDim a(1)
On Error GoTo handler
With a(0)
Err.Raise 5
End With
finished:
ReDim a(3)
Debug.Print UBound(a)
Exit Sub
handler:
Resume finished
End Sub`,['3']));

test('An unhandled callee error releases every With lease',()=>run(`${types}
Sub Fail()
With a(0)
With a(0).Nested
Err.Raise 5
End With
End With
End Sub
Sub Main()
ReDim a(1)
On Error Resume Next
Fail
ReDim a(3)
Debug.Print Err.Number, UBound(a)
End Sub`,['5 3']));

test('A failed nested With never falls back to the outer receiver',()=>run(`${types}
Sub Main()
Dim x As Item
x.Value = 17
On Error Resume Next
With x
With a(0)
.Value = 19
Debug.Print Err.Number
End With
Debug.Print .Value
End With
Debug.Print x.Value
End Sub`,['91','17','17']));

test('Jumping past a With initializer raises error 91 for its lexical receiver',()=>run(`${types}
Sub Main()
Dim x As Item
On Error Resume Next
GoTo skipped
With x
skipped:
.Value = 17
Debug.Print Err.Number
End With
Debug.Print x.Value
End Sub`,['91','0']));

test('Reentering a With initializer releases the previous activation',()=>run(`${types}
Sub Main()
ReDim a(1)
again:
calls = calls + 1
With a(0)
.Value = calls
If calls < 3 Then GoTo again
End With
ReDim Preserve a(3)
Debug.Print a(0).Value, calls, UBound(a)
End Sub`,['3 3 3']));

test('Debugger reset releases a suspended With owner',async()=>{
 const program=compile(`${types}
Sub Main()
ReDim a(1)
With a(0)
Stop
.Value = 17
End With
End Sub`);assert.deepEqual(program.diagnostics,[]);
 const vm=new VirtualMachine(program),execution=vm.start();
 for(let i=0;i<300&&vm.state!=='paused';i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(vm.state,'paused');const array=vm.instances.get('m').fields.get('a').get();
 assert.throws(()=>assertArrayUnlocked(array),e=>e.number===10);vm.stop();await execution;
 assert.doesNotThrow(()=>assertArrayUnlocked(array));assert.equal(vm.stack.length,0);
});
