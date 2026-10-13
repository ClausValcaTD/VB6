import {newProject} from '../src/project/model.js';
const module=(name,code,kind='module')=>({id:name,name,code,kind});
const project=(code,extras=[])=>({...newProject('LocalStorage'),startup:'Sub Main',modules:[module('M',code),...extras]});
export const localStorageFixtures=[
 {name:'Skipped local Dim does not overwrite module storage',project:project('Public value As Long\nSub Main()\nvalue = 99\nWork\nDebug.Print value\nEnd Sub\nSub Work()\nIf False Then\nDim value As Long\nEnd If\nvalue = 7\nDebug.Print value\nEnd Sub'),expected:['7','99'],error:null},
 {name:'GoTo over local declarations retains typed defaults',project:project('Option Explicit\nSub Main()\nGoTo after\nDim value As Long\nafter:\nDebug.Print value, TypeName(value)\nEnd Sub'),expected:['0 Long'],error:null},
 {name:'Skipped fixed array uses compile-time constants and Option Base',project:project('Option Base 1\nSub Main()\nIf False Then\nDim values(Size) As Long\nEnd If\nConst Size = 3\nDebug.Print LBound(values), UBound(values), values(1)\nEnd Sub'),expected:['1 3 0'],error:null},
 {name:'Skipped Static declaration preserves its per-procedure value',project:project('Sub Main()\nWork\nWork\nEnd Sub\nSub Work()\nIf False Then\nStatic count As Long\nEnd If\ncount = count + 1\nDebug.Print count\nEnd Sub'),expected:['1','2'],error:null},
 {name:'Skipped local As New stays lazy until first use',project:project('Public created As Long\nSub Main()\nIf False Then\nDim value As New Bag\nEnd If\nDebug.Print created\nvalue.Value = 7\nDebug.Print created, value.Value\nEnd Sub',[module('Bag','Public Value As Long\nPrivate Sub Class_Initialize()\nM.created = M.created + 1\nEnd Sub','class')]),expected:['0','1 7'],error:null},
 {name:'Recursive calls own independent skipped local arrays',project:project('Sub Main()\nVisit 2\nEnd Sub\nSub Visit(ByVal depth As Long)\nIf False Then\nDim values(1) As Long\nEnd If\nvalues(0) = depth\nIf depth > 0 Then Visit depth - 1\nDebug.Print values(0)\nEnd Sub'),expected:['0','1','2'],error:null}
];
