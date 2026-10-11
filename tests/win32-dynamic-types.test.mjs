import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
const project=code=>{const p=newProject('DynamicTypes');p.modules[0].code=code;return p;};
for(const level of [0,1,2]){
 test(`typed control properties and ByVal/ByRef returns keep owned identities O${level}`,t=>{
  const p=project(`Private result As Long,flag As Boolean,kind As Long
Private Sub Verify()
 Dim c As CheckBox,b As OptionButton,a As Label,d As Label,e As TextBox
 Set c=Controls.Add("VB.CheckBox","check")
 Set b=Controls.Add("VB.OptionButton","radio")
 Set a=Controls.Add("VB.Label","label")
 Set e=Controls.Add("VB.TextBox","edit")
 c.Value=2
 b.Value=True
 e.Text="editable"
 e.MaxLength=4096
 a.Caption="original"
 Take a
 Set d=Identity(a)
 Clear (a)
 Clear a
 result=c.Value
 flag=b.Value
 If d.Caption="shared" And a Is Nothing And e.Text="editable" And e.MaxLength=4096 Then kind=1
 Set d=Nothing
End Sub
Private Sub Take(ByVal a As Label)
 a.Caption="shared"
 Set a=Nothing
End Sub
Private Sub Clear(ByRef a As Label)
 Set a=Nothing
End Sub
Private Function Identity(ByVal a As Label) As Label
 Set Identity=a
End Function`);
  const h=dynamicControlMachine(t,p,level);h.create('Form1');h.invokeForm('Form1','Verify');const m=h.vm.memory,n=name=>m.read(h.vm.symbol('global:Form1:'+name))|0;
  assert.equal(n('result'),2);assert.equal(n('flag')&65535,65535);assert.equal(n('kind'),1);
  h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);
 });
 test(`typed control argument mismatch raises before entering the callee O${level}`,t=>{
  const p=project(`Private entered As Long,answer As Long,assignment As Long
Private Sub Verify()
 Dim value As Object,label As Label
 Set value=Controls.Add("VB.TextBox","input")
 On Error Resume Next
 Take value
 answer=Err.Number
 Err.Clear
 Set label=value
 assignment=Err.Number
 Err.Clear
End Sub
Private Sub Take(ByVal label As Label)
 entered=1
End Sub`);
  const h=dynamicControlMachine(t,p,level);h.create('Form1');h.invokeForm('Form1','Verify');const m=h.vm.memory,n=name=>m.read(h.vm.symbol('global:Form1:'+name));
  assert.equal(n('answer'),13);assert.equal(n('assignment'),13);assert.equal(n('entered'),0);h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);
 });
}
for(const types of [['Object','Label'],['Label','Object'],['Label','TextBox'],['Control','Object']])test(`ByRef ${types.join(' to ')} cannot expose a differently typed slot`,()=>{
 const p=project(`Sub Verify()\n Dim c As ${types[0]}\n Take c\nEnd Sub\nSub Take(ByRef c As ${types[1]})\nEnd Sub`);
 assert.throws(()=>compileWin32(p),/exactly matching/);
});
