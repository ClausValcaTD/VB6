import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
for(const optimization of [0,1,2])test(`CheckBox retains three programmatic states with independent native click policy O${optimization}`,t=>{
 const p=newProject('CheckStates'),form=p.modules[0];
 const checks=createControl('CheckBox','Checks'),triple=createControl('CheckBox','Three');
 Object.assign(checks.properties,{Index:0,Value:2});Object.assign(triple.properties,{Index:0,TripleState:-1});
 form.form.controls=[checks,triple];
 form.code=`Private seen As Long,calls As Long,bad As Long
Private dynamic As CheckBox
Private Sub Form_Load()
 Load Checks(32767)
 Load Three(256)
 Set dynamic=Controls.Add("VB.CheckBox","dynamic")
 dynamic.Value=2
End Sub
Private Sub Checks_Click(Index As Integer)
 calls=calls+1
 seen=Checks(Index).Value
End Sub
Private Sub Reject()
 On Error Resume Next
 dynamic.Value=3
 bad=Err.Number
 Err.Clear
End Sub`;
 const h=dynamicControlMachine(t,p,optimization);h.create('Form1');const m=h.vm.memory;
 const node=(name,index)=>{const dir=h.vm.symbol('dynamic-index:Form1:'+name);return m.read(m.read(dir+(index>>>8)*4)+(index&255)*4);};
 const scalar=h.handle('Form1:checks:0'),loaded=m.read(node('checks',32767)+4),third=m.read(node('three',256)+4);
 const dynamic=[...h.windows.values()].find(w=>w.props.size&&m.bstr(m.read([...w.props.values()][0]+36))==='dynamic').hwnd;
 for(const hwnd of [scalar,loaded,dynamic]){
  assert.equal(h.window(hwnd).style&15,5,'indeterminate value requires a three-state native button');
  assert.equal(h.send(hwnd,0xf0),2,'Value=2 reaches the actual button');
  h.send(hwnd,0xf5);assert.equal(h.send(hwnd,0xf0),1);
  h.send(hwnd,0xf5);assert.equal(h.send(hwnd,0xf0),0);
  h.send(hwnd,0xf5);assert.equal(h.send(hwnd,0xf0),1);
 }
 assert.equal(m.read(h.vm.symbol('global:Form1:calls')),6,'designer/dynamic callbacks are not duplicated');
 assert.equal(m.read(h.vm.symbol('global:Form1:seen')),1,'state changes before the authored Click');
 for(const value of [1,2,0,1]){h.send(third,0xf5);assert.equal(h.send(third,0xf0),value,'TripleState policy is cloned with the control');}
 h.invokeForm('Form1','Reject');assert.equal(m.read(h.vm.symbol('global:Form1:bad')),5);assert.equal(h.send(dynamic,0xf0),1);
 h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);
});
