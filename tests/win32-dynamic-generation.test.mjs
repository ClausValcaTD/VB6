import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/project/model.js';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
for(const optimization of [0,1,2])test(`Controls.Add captures the form generation, not a recycled HWND O${optimization}`,t=>{
 const p=newProject('RecreatedOwner');p.modules[0].code=`Private result As Long
Private Function RecreateOwner() As String
 Unload Me
 Me.Show
 RecreateOwner="VB.Label"
End Function
Private Sub Verify()
 On Error Resume Next
 Dim value As Object
 Set value=Controls.Add(RecreateOwner(),"must not publish")
 result=Err.Number
 Err.Clear
End Sub`;
 const h=dynamicControlMachine(t,p,optimization);h.create('Form1');const old=h.handle('Form1'),m=h.vm.memory;
 // The double forces genuine handle-value reuse. The original old HWND and
 // all of its control nodes are destroyed first; no compiler routine is hooked.
 h.vm.hook('user32.dll','DestroyWindow',1,([hwnd])=>{const result=h.destroy(hwnd);h.reuseHandle(hwnd);return result;});
 h.invokeForm('Form1','Verify');assert.equal(h.handle('Form1'),old);
 assert.equal(m.read(h.vm.symbol('global:Form1:result')),91);
 assert.equal(m.read(h.vm.symbol('dynamic-controls:Form1')+8),0,'no late control in the new form');
 h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);
});
