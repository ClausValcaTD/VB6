import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
for(const optimization of [0,1,2]){
 test(`dynamic text input preserves ByRef cancellation and full Index routing O${optimization}`,t=>{
  const p=newProject('DynamicInput'),c=createControl('TextBox','Edits');c.properties.Index=0;c.properties.Text='';p.modules[0].form.controls=[c];
  p.modules[0].code=`Private calls As Long,observed As Integer
Private Sub Form_Load()
 Load Edits(32767)
End Sub
Private Sub Edits_KeyPress(Index As Integer,KeyAscii As Integer)
 calls=calls+1
 observed=Index
 If KeyAscii=120 Then KeyAscii=0
 If KeyAscii=65 Then KeyAscii=937
End Sub`;
  const h=dynamicControlMachine(t,p,optimization);h.create('Form1');const m=h.vm.memory,dir=h.vm.symbol('dynamic-index:Form1:edits'),node=m.read(m.read(dir+508)+1020),hwnd=m.read(node+4);
  h.send(hwnd,0x102,120);assert.equal(h.window(hwnd).text,'');h.send(hwnd,0x102,65);assert.equal(h.window(hwnd).text,'Ω');
  assert.equal(m.read(h.vm.symbol('global:Form1:calls')),2);assert.equal(m.read(h.vm.symbol('global:Form1:observed'),16),32767);
  h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);
 });
 test(`Load clones live text, colors, Tag, geometry and font ownership without aliasing O${optimization}`,t=>{
  const p=newProject('DynamicClone'),c=createControl('CommandButton','Buttons');c.properties.Index=0;p.modules[0].form.controls=[c];
  p.modules[0].code=`Private copied As Long,independent As Long
Private Sub Form_Load()
 Buttons(0).Caption="live"
 Buttons(0).FontName="Consolas"
 Buttons(0).FontSize=12.5
 Buttons(0).FontBold=True
 Buttons(0).Tag="x" & ChrW$(0) & "y"
 Buttons(0).Width=3000
 Buttons(0).Enabled=False
 Load Buttons(256)
 If Buttons(256).Caption="live" And Buttons(256).FontName="Consolas" And Buttons(256).FontSize=12.5 And Buttons(256).FontBold And Buttons(256).Width=3000 And Not Buttons(256).Enabled And Len(Buttons(256).Tag)=3 Then copied=1
 Buttons(256).Tag="different"
 Buttons(256).FontName="Arial"
 If Len(Buttons(0).Tag)=3 And Buttons(0).FontName="Consolas" Then independent=1
End Sub`;
  const h=dynamicControlMachine(t,p,optimization);h.create('Form1');const m=h.vm.memory;
  assert.equal(m.read(h.vm.symbol('global:Form1:copied')),1);assert.equal(m.read(h.vm.symbol('global:Form1:independent')),1);
  h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);assert.ok([...h.fonts.values()].filter(f=>!f.stock).length<=1,'only the preexisting shared initial font cache can remain');
 });
}
