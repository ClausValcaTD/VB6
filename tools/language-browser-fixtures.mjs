import {newProject} from '../src/project/model.js';
import {SETTER_ORDER_FIXTURE,SETTER_ORDER_EXPECTED} from '../tests/migration-setter-order-fixtures.mjs';
const project=code=>({...newProject('LanguageParity'),startup:'Sub Main',modules:[{id:'m',name:'M',kind:'module',code}]});
const fixtures=[
 {name:'Like grammar and trapped Error 93',project:project('Sub Main()\nDebug.Print "ab" Like "a[]b"\nDebug.Print "a" & vbLf & "b" Like "a?b"\nDebug.Print "^" Like "[^]"\nOn Error Resume Next\nDebug.Print "a" Like "[z-a]"\nDebug.Print Err.Number\nEnd Sub'),expected:['True','True','True','93'],error:93},
 {name:'Variant element type changes and Preserve',project:project('Sub Main()\nDim a As Variant\nReDim a(1) As Long\na(0) = 9\nReDim a(-1 To 1) As String\na(-1) = "text"\nReDim Preserve a(-1 To 3)\nDebug.Print TypeName(a), a(-1), UBound(a), Len(a(3))\nEnd Sub'),expected:['String() text 3 0'],error:null},
 {name:'Typed array results and owned resizable storage',project:project('Function Values() As Long()\nDim a(1) As Long\na(0) = 17\nValues = a\nEnd Function\nSub Main()\nDim a() As Long\na = Values()\nReDim Preserve a(3)\nDebug.Print a(0), a(3), TypeName(a)\nEnd Sub'),expected:['17 0 Long()'],error:null},
 {name:'Implicit ReDim under Option Explicit',project:project('Option Explicit\nSub Main()\nDebug.Print IsArray(a)\nReDim a(1 To 2) As Integer\na(1) = 9\nReDim Preserve a(1 To 3)\nDebug.Print a(1), a(3), TypeName(a)\nEnd Sub'),expected:['True','9 0 Integer()'],error:null},
 {name:'Named indexed Let/Set, ByRef aliases and evaluation order',project:{...newProject('SetterOrder'),...SETTER_ORDER_FIXTURE},expected:SETTER_ORDER_EXPECTED,error:5}
];
console.log(JSON.stringify(fixtures));
