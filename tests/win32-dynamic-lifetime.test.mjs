import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
const seed=()=>{const c=createControl('CommandButton','Buttons');c.properties.Index=0;c.properties.Caption='seed';return c;};
function run(t,code,level,controls=[]){
 const p=newProject('DynamicLifetime');p.modules[0].code=code;p.modules[0].form.controls=controls;
 const h=dynamicControlMachine(t,p,level);h.create('Form1');const m=h.vm.memory;
 return {...h,call:(name,args=[])=>h.invokeForm('Form1',name,args),n:name=>m.read(h.vm.symbol('global:Form1:'+name))|0,
  count:()=>m.read(h.vm.symbol('dynamic-controls:Form1')+8),close:()=>h.destroy(h.handle('Form1'))};
}
for(const level of [0,1,2]){
 test(`runtime references reject destroyed and reused HWND identities O${level}`,t=>{
  const h=run(t,`Private held As Object,alias As Object,result As Long,identity As Long
Private Sub Setup()
 Set held=Controls.Add("VB.Label","runtime")
 held.Caption="owned"
 Set alias=held
End Sub
Private Sub ReadStale()
 On Error Resume Next
 Dim name As String
 name=alias.Caption
 result=Err.Number
 Err.Clear
 If alias Is held Then identity=1
End Sub
Private Sub RemoveCurrent()
 Controls.Remove "runtime"
End Sub
Private Sub Replace()
 Set held=Controls.Add("VB.Label","runtime")
 held.Caption="replacement"
End Sub
Private Sub ReleaseAll()
 Set held=Nothing
 Set alias=Nothing
End Sub`,level);
  h.call('Setup');const node=h.n('held'),hwnd=h.vm.memory.read(node+4);
  h.destroy(hwnd);h.call('ReadStale');assert.equal(h.n('result'),91);assert.equal(h.n('identity'),1);assert.equal(h.count(),0);
  h.reuseHandle(hwnd);h.call('Replace');assert.equal(h.vm.memory.read(h.n('held')+4),hwnd);assert.notEqual(h.n('held'),node);
  h.call('ReadStale');assert.equal(h.n('result'),91);assert.equal(h.window(hwnd).text,'replacement');
  h.call('RemoveCurrent');h.call('ReleaseAll');h.close();assert.equal(h.owned().length,0);
 });
 test(`setter operand mutation cannot redirect a captured control receiver O${level}`,t=>{
  const h=run(t,`Private held As Object,answer As Long,replacementOK As Long
Private Sub Setup()
 Set held=Controls.Add("VB.Label","runtime")
 held.Caption="old"
End Sub
Private Function ReplaceReceiver() As String
 Controls.Remove "runtime"
 Set held=Controls.Add("VB.Label","runtime")
 held.Caption="new"
 ReplaceReceiver="must not publish"
End Function
Private Sub TryWrite()
 On Error Resume Next
 held.Caption=ReplaceReceiver()
 answer=Err.Number
 Err.Clear
 If held.Caption="new" Then replacementOK=1
End Sub`,level);
  h.call('Setup');h.call('TryWrite');assert.equal(h.n('answer'),91);assert.equal(h.n('replacementOK'),1);h.close();assert.equal(h.owned().length,0);
 });
 test(`Controls.Add name validation and removal origin preserve the registry O${level}`,t=>{
  const h=run(t,`Private result As Long,total As Long
Private Sub Setup()
 Dim held As Object
 Set held=Controls.Add("VB.Label","same")
End Sub
Private Sub Duplicate()
 On Error Resume Next
 Dim held As Object
 Set held=Controls.Add("VB.Label","SAME")
 result=Err.Number
 Err.Clear
 total=Controls.Count
End Sub
Private Sub InvalidName()
 On Error Resume Next
 Dim held As Object
 Set held=Controls.Add("VB.Label","a" & ChrW$(0) & "b")
 result=Err.Number
 Err.Clear
End Sub
Private Sub RemoveDesign()
 On Error Resume Next
 Controls.Remove "Buttons"
 result=Err.Number
 Err.Clear
End Sub
Private Sub RemoveUnknown()
 On Error Resume Next
 Controls.Remove "missing"
 result=Err.Number
 Err.Clear
End Sub`,level,[seed()]);
  h.call('Setup');const before=h.owned().length;h.call('Duplicate');assert.equal(h.n('result'),457);assert.equal(h.n('total'),2);assert.equal(h.owned().length,before);
  h.call('InvalidName');assert.equal(h.n('result'),5);assert.equal(h.count(),2);h.call('RemoveDesign');assert.equal(h.n('result'),362);
  h.call('RemoveUnknown');assert.equal(h.n('result'),35601);h.close();assert.equal(h.owned().length,0);
 });
 test(`sparse Load/Unload retains the authored template and full Index event argument O${level}`,t=>{
  const h=run(t,`Private result As Long,seen As Integer,first As Long,last As Long,total As Long
Private Sub Make()
 Load Buttons(256)
 Load Buttons(32767)
 Buttons(32767).Caption="highest"
 first=Buttons.LBound
 last=Buttons.UBound
 total=Buttons.Count
End Sub
Private Sub Buttons_Click(Index As Integer)
 seen=Index
 Unload Buttons(Index)
End Sub
Private Sub Duplicate()
 On Error Resume Next
 Load Buttons(256)
 result=Err.Number
 Err.Clear
End Sub
Private Sub RemoveTemplate()
 On Error Resume Next
 Unload Buttons(0)
 result=Err.Number
 Err.Clear
End Sub`,level,[seed()]);
  h.call('Make');assert.deepEqual(['first','last','total'].map(h.n),[0,32767,3]);h.call('Duplicate');assert.equal(h.n('result'),360);h.call('RemoveTemplate');assert.equal(h.n('result'),362);
  const hwnd=[...h.windows.values()].find(w=>w.text==='highest').hwnd;h.send(hwnd,0xf5);assert.equal(h.n('seen'),32767);assert.ok(!h.windows.has(hwnd));assert.equal(h.count(),2);
  h.close();assert.equal(h.owned().length,0);
 });
 for(const api of ['GetObjectW','CreateFontIndirectW','CreateWindowExW','SetPropW','SetWindowSubclass'])test(`failed dynamic ${api} rolls back unpublished state O${level}`,t=>{
  const h=run(t,`Private result As Long
Private Sub TryCreate()
 On Error Resume Next
 Dim held As Object
 Set held=Controls.Add("VB.Label","runtime")
 result=Err.Number
 Err.Clear
End Sub
Private Sub RemoveCurrent()
 Controls.Remove "runtime"
End Sub`,level);
  const baseline=[h.count(),h.windows.size,h.fonts.size,h.owned().length];h.fail(api);h.call('TryCreate');assert.ok([5,7].includes(h.n('result')),String(h.n('result')));
  assert.deepEqual([h.count(),h.windows.size,h.fonts.size,h.owned().length],baseline);
  h.call('TryCreate');assert.equal(h.n('result'),0);assert.equal(h.count(),1);h.call('RemoveCurrent');assert.deepEqual([h.count(),h.windows.size,h.fonts.size,h.owned().length],baseline);
  h.close();assert.equal(h.owned().length,0);
 });
 test(`node/page allocation failures retain the old control index and permit retry O${level}`,t=>{
  const h=run(t,`Private result As Long
Private Sub TryLoad()
 On Error Resume Next
 Load Buttons(32767)
 result=Err.Number
 Err.Clear
End Sub`,level,[seed()]);
  const baseline=[h.count(),h.windows.size,h.fonts.size,h.owned().length];
  for(const size of [192,1028]){h.failures.set('allocate',size);h.call('TryLoad');assert.equal(h.n('result'),7);assert.deepEqual([h.count(),h.windows.size,h.fonts.size,h.owned().length],baseline);}
  h.call('TryLoad');assert.equal(h.n('result'),0);assert.equal(h.count(),2);h.close();assert.equal(h.owned().length,0);
 });
 test(`Frame parenting and TextBox Change route exactly once O${level}`,t=>{
  const c=createControl('TextBox','Edits');c.properties.Index=0;
  const h=run(t,`Private count As Long,indexSeen As Integer
Private Sub Setup()
 Dim frame As Object,child As Object
 Set frame=Controls.Add("VB.Frame","parent")
 Set child=Controls.Add("VB.Label","nested",frame)
 child.Caption="nested text"
 Load Edits(1000)
 Edits(1000).Text="changed"
End Sub
Private Sub Edits_Change(Index As Integer)
 count=count+1
 indexSeen=Index
End Sub
Private Sub RemoveFrame()
 Controls.Remove "parent"
End Sub`,level,[c]);
  h.call('Setup');const label=[...h.windows.values()].find(w=>w.text==='nested text');assert.equal(h.window(label.parent).classname,'BUTTON');assert.equal(h.n('count'),1);assert.equal(h.n('indexSeen'),1000);
  h.call('RemoveFrame');assert.equal(h.count(),2);h.close();assert.equal(h.owned().length,0);
 });
}
