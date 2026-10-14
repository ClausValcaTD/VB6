import test from 'node:test';import assert from 'node:assert/strict';
import {collectionMachine} from './support/native-collection-machine.mjs';
for(const optimization of [0,1,2])test(`Variant Len/LenB format values, propagate Null, and retain counted NUL characters O${optimization}`,t=>{
 const h=collectionMachine(t,`Private a As Long,b As Long,c As Long,d As Long,n As Long,failed As Long
Private Sub Main()
 Dim v As Variant,result As Variant
 v="a" & ChrW$(0) & "b"
 a=Len(v)
 b=LenB(v)
 v=70000&
 c=Len(v)
 v=Empty
 d=Len(v)
 v=Null
 result=Len(v)
 If IsNull(result) And IsNull(LenB(v)) Then n=1
 v=CVErr(13)
 On Error Resume Next
 a=Len(v)
 failed=Err.Number
 Err.Clear
End Sub`,optimization);
 h.invoke();assert.deepEqual(['a','b','c','d','n','failed'].map(h.number),[3,6,5,0,1,13]);assert.equal(h.owned().length,0);
});
