import {newProject} from '../src/project/model.js';
import {SETTER_ORDER_FIXTURE,SETTER_ORDER_EXPECTED} from '../tests/migration-setter-order-fixtures.mjs';
const project=code=>({...newProject('LanguageParity'),startup:'Sub Main',modules:[{id:'m',name:'M',kind:'module',code}]});
const withClass=(code,extra)=>{const result=project(code);result.modules.push(extra);return result;};
const fixtures=[
 {name:'With record storage and Exit Do cleanup',project:project(`Private Type Item
Value As Long
End Type
Sub Main()
Dim a() As Item
ReDim a(1)
a(0).Value = 7
On Error Resume Next
Do
With a(0)
ReDim a(4)
Debug.Print Err.Number, .Value
.Value = 9
Exit Do
End With
Loop
ReDim Preserve a(3)
Debug.Print a(0).Value, UBound(a)
End Sub`),expected:['10 7','9 3'],error:10},
 {name:'Grouped With record uses a value temporary',project:project(`Private Type Item
Value As Long
End Type
Sub Main()
Dim a() As Item
ReDim a(1)
a(0).Value = 7
With (a(0))
.Value = 9
Debug.Print .Value, a(0).Value
ReDim a(3)
Debug.Print .Value, UBound(a)
End With
End Sub`),expected:['9 7','9 3'],error:null},
 {name:'Implicit With arguments remain ByRef across continued calls',project:withClass(`Private Type Item
Value As Long
End Type
Sub Bump(ByRef value As Long)
value = value + 1
End Sub
Sub Main()
Dim item As Item, c As New Bumper
With item
Bump .Value
Call Bump(.Value)
Bump(.Value)
If True Then c _
 .Bump .Value: Bump .Value
Debug.Print .Value
End With
End Sub`,{id:'bumper',name:'Bumper',kind:'class',code:'Public Sub Bump(ByRef value As Long)\nvalue = value + 1\nEnd Sub'}),expected:['4'],error:null},
 {name:'GoSub suspends With ownership and restores receiver',project:project(`Private Type Item
Value As Long
End Type
Sub Main()
Dim a() As Item, other As Item
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
End Sub`),expected:['10','18','17','3'],error:10},
 {name:'Failed nested With cannot fall back to outer receiver',project:project(`Private Type Item
Value As Long
End Type
Sub Main()
Dim a() As Item, item As Item
item.Value = 17
On Error Resume Next
With item
With a(0)
.Value = 19
Debug.Print Err.Number
End With
Debug.Print .Value
End With
Debug.Print item.Value
End Sub`),expected:['91','17','17'],error:91},
 {name:'Resume outside With releases record storage',project:project(`Private Type Item
Value As Long
End Type
Sub Main()
Dim a() As Item
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
End Sub`),expected:['3'],error:5},

 {name:'Like grammar and trapped Error 93',project:project('Sub Main()\nDebug.Print "ab" Like "a[]b"\nDebug.Print "a" & vbLf & "b" Like "a?b"\nDebug.Print "^" Like "[^]"\nOn Error Resume Next\nDebug.Print "a" Like "[z-a]"\nDebug.Print Err.Number\nEnd Sub'),expected:['True','True','True','93'],error:93},
 {name:'Variant element type changes and Preserve',project:project('Sub Main()\nDim a As Variant\nReDim a(1) As Long\na(0) = 9\nReDim a(-1 To 1) As String\na(-1) = "text"\nReDim Preserve a(-1 To 3)\nDebug.Print TypeName(a), a(-1), UBound(a), Len(a(3))\nEnd Sub'),expected:['String() text 3 0'],error:null},
 {name:'Typed array results and owned resizable storage',project:project('Function Values() As Long()\nDim a(1) As Long\na(0) = 17\nValues = a\nEnd Function\nSub Main()\nDim a() As Long\na = Values()\nReDim Preserve a(3)\nDebug.Print a(0), a(3), TypeName(a)\nEnd Sub'),expected:['17 0 Long()'],error:null},
 {name:'Implicit ReDim under Option Explicit',project:project('Option Explicit\nSub Main()\nDebug.Print IsArray(a)\nReDim a(1 To 2) As Integer\na(1) = 9\nReDim Preserve a(1 To 3)\nDebug.Print a(1), a(3), TypeName(a)\nEnd Sub'),expected:['True','9 0 Integer()'],error:null},
 {name:'ByRef array borrowing and release',project:project(`Dim a() As Long
Sub Work(ByRef value As Long)
On Error Resume Next
ReDim Preserve a(4)
Debug.Print Err.Number, UBound(a)
value = 17
End Sub
Sub Main()
ReDim a(1)
Work a(0)
ReDim Preserve a(3)
Debug.Print a(0), UBound(a)
End Sub`),expected:['10 1','17 3'],error:10},
 {name:'For Each locking and Exit For cleanup',project:project(`Sub Main()
Dim a As Variant, item As Variant
a = Array(7, 8)
On Error Resume Next
For Each item In a
a = 12
Debug.Print Err.Number, item
Exit For
Next
a = 19
Debug.Print a
End Sub`),expected:['10 7','19'],error:10},
 {name:'Nested record-field ByRef lifetime',project:project(`Type Point
Value As Long
End Type
Dim a() As Point
Sub Work(ByRef value As Long)
On Error Resume Next
Erase a
Debug.Print Err.Number
value = 23
End Sub
Sub Main()
ReDim a(1)
Work a(0).Value
ReDim Preserve a(3)
Debug.Print a(0).Value, UBound(a)
End Sub`),expected:['10','23 3'],error:10},
 {name:'Multidimensional Variant iteration order and tags',project:project(`Sub Main()
Dim a() As Variant, value As Variant
ReDim a(1 To 2, 3 To 4)
a(1, 3) = CInt(13)
a(2, 3) = CLng(23)
a(1, 4) = CInt(14)
a(2, 4) = CLng(24)
For Each value In a
Debug.Print value, TypeName(value)
Next
End Sub`),expected:['13 Integer','23 Long','14 Integer','24 Long'],error:null},
 {name:'Named indexed Let/Set, ByRef aliases and evaluation order',project:{...newProject('SetterOrder'),...SETTER_ORDER_FIXTURE},expected:SETTER_ORDER_EXPECTED,error:5}
];
console.log(JSON.stringify(fixtures));
