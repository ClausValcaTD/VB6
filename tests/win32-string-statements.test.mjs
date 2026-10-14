import test from 'node:test';import assert from 'node:assert/strict';
import {collectionMachine} from './support/native-collection-machine.mjs';
for(const optimization of [0,1,2])test(`native Mid/LSet/RSet mutate counted snapshots and preserve ownership O${optimization}`,t=>{
 const h=collectionMachine(t,`Private a As String,b As String,c As String,observed As Long
Private Sub Main()
 Dim s As String,fixed As String * 10,v As Variant
 s="abcdef"
 Mid$(s,2,2)="XYZ"
 a=s
 fixed="abc"
 RSet fixed="xy"
 b=fixed
 LSet fixed="abcdefghijkl"
 c=fixed
 v="A" & ChrW$(0) & "B"
 Mid(v,2,1)=ChrW$(937)
 If v="A" & ChrW$(937) & "B" Then observed=1
 LSet v="Z"
 If v="Z  " Then observed=observed+1
 RSet v="T"
 If v="  T" Then observed=observed+1
End Sub`,optimization);
 h.invoke();assert.equal(h.text('a'),'aXYdef');assert.equal(h.text('b'),'        xy');assert.equal(h.text('c'),'abcdefghij');assert.equal(h.number('observed'),3);assert.equal(h.owned().length,3);
});
for(const optimization of [0,1,2])test(`native String mutation checks errors, no-op and operand snapshots O${optimization}`,t=>{
 const h=collectionMachine(t,`Private text As String,first As String,second As String,third As String,err1 As Long,err2 As Long,err3 As Long
Private Sub Main()
 text="abcdef"
 Mid(text,2,2)=Change()
 first=text
 text="abcdef"
 Mid(text,99,2)=Change()
 second=text
 text="12345"
 RSet text=Change()
 third=text
 On Error Resume Next
 Mid(text,0,1)="x"
 err1=Err.Number
 Err.Clear
 Mid(text,1,-1)="x"
 err2=Err.Number
 Err.Clear
 Dim v As Variant
 v=42
 LSet v="x"
 err3=Err.Number
 Err.Clear
End Sub
Private Function Change() As String
 text="altered"
 Change="XY"
End Function`,optimization);
 h.invoke();assert.equal(h.text('first'),'aXYdef');assert.equal(h.text('second'),'altered');assert.equal(h.text('third'),'   XY');assert.deepEqual(['err1','err2','err3'].map(h.number),[5,5,13]);assert.equal(h.owned().length,4);
});
