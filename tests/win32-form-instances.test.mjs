import test from 'node:test';import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {formMachine} from './support/native-form-machine.mjs';
function project(){
 const p=newProject('Independent'),form=p.modules[0];form.name='Document';form.form.name='Document';form.form.properties.Name='Document';form.form.properties.Caption='doc';
 form.form.controls=[createControl('TextBox','Edit'),createControl('CheckBox','Keep'),createControl('CommandButton','Increment')];
 form.code=`Private counter As Long
Private Sub Form_Load()
 counter=10
 Edit.Text="start"
End Sub
Private Sub Increment_Click()
 counter=counter+1
 Edit.Text=CStr(counter)
End Sub
Private Sub Form_QueryUnload(Cancel As Integer,UnloadMode As Integer)
 If Keep.Value=1 Then Cancel=True
End Sub
Public Function Count() As Long
 Count=counter
End Function`;
 p.startup='Sub Main';p.modules.push({id:'m',name:'M',kind:'module',code:`Public a As Document,b As Document
Private Sub Main()
 Set a=New Document
 Set b=New Document
 a.Caption="first"
 b.Caption="second"
 a.Edit.Text="separate"
 a.Show
 b.Show
End Sub
Private Sub ClearAll()
 Unload a
 Unload b
 Set a=Nothing
 Set b=Nothing
End Sub`});return p;
}
for(const optimization of [0,1,2])test(`independent native forms retain distinct HWND, fields, controls and cancellation O${optimization}`,t=>{
 const h=formMachine(t,project(),optimization);h.vm.invoke('proc:M:Main');
 const a=h.findText('first'),b=h.findText('second');assert.ok(a&&b&&a.hwnd!==b.hwnd);
 const ae=h.children(a.hwnd).find(w=>w.classname==='EDIT'),be=h.children(b.hwnd).find(w=>w.classname==='EDIT');
 assert.equal(ae.text,'separate');assert.equal(be.text,'start');
 const button=h.children(a.hwnd).find(w=>w.classname==='BUTTON'&&(w.style&15)===0);assert.ok(button);h.send(button.hwnd,0xf5);assert.equal(ae.text,'11');assert.equal(be.text,'start');
 const keep=h.children(a.hwnd).find(w=>(w.style&15)===5);assert.ok(keep);h.send(keep.hwnd,0xf1,1);
 h.send(a.hwnd,0x10,1);assert.ok(h.windows.has(a.hwnd));assert.equal(be.text,'start');
 h.send(keep.hwnd,0xf1,0);h.vm.invoke('proc:M:ClearAll');assert.equal(h.windows.size,0);assert.equal(h.owned().length,0);
});
for(const optimization of [0,1,2])test(`Form references round-trip through real emitted IUnknown and Collection copies O${optimization}`,t=>{
 const p=project();p.modules[1].code=`Public forms As Collection
Public loaded As Long,total As Long,kind As String
Private Sub Main()
 Dim a As New Document,b As New Document,doc As Form,value As Variant
 Set forms=New Collection
 a.Caption="first":b.Caption="second"
 forms.Add a,"a":forms.Add b,"b"
 Set a=Nothing:Set b=Nothing
 For Each value In forms
  Set doc=value
  total=total+doc.Count()
 Next
 Set doc=forms("a")
 kind=TypeName(doc)
 Unload doc
 Set doc=forms("b")
 doc.Caption="retained"
 Unload doc
 Set doc=Nothing
 Set value=Nothing
 Set forms=Nothing
End Sub`;
 // Generic Form exposes only intrinsic members. Use a concrete variable to
 // call a user-declared Document method; this remains statically type checked.
 p.modules[1].code=p.modules[1].code.replace('doc As Form','doc As Document');
 const h=formMachine(t,p,optimization);h.vm.invoke('proc:M:Main');
 assert.equal(h.number('total'),20);assert.equal(h.text('kind'),'Document');assert.equal(h.windows.size,0);assert.equal(h.owned().length,1,'only retained global TypeName text');
});
for(const optimization of [0,1,2])for(const [api,after]of [['CreateWindowExW',1],['CreateWindowExW',2],['SetPropW',1],['SetPropW',2],['SetWindowSubclass',1],['CreateFontW',1]])test(`failed ${api}/${after} rolls back an independent Form and permits a retry O${optimization}`,t=>{
 const p=project();p.modules[1].code=`Public a As Document,number As Long
Private Sub Main()
 Set a=New Document
 On Error Resume Next
 a.Show
 number=Err.Number
 Err.Clear
End Sub
Private Sub Retry()
 a.Show
End Sub
Private Sub ClearAll()
 Unload a
 Set a=Nothing
End Sub`;
 const h=formMachine(t,p,optimization);h.fail(api,after);h.vm.invoke('proc:M:Main');
 assert.equal(h.number('number'),7);assert.equal(h.windows.size,0,'failed creation leaves no live HWND');
 assert.equal(h.owned().length,1,'only the authored Form reference remains');
 h.vm.invoke('proc:M:Retry');assert.equal(h.windows.size,4);h.vm.invoke('proc:M:ClearAll');assert.equal(h.windows.size,0);assert.equal(h.owned().length,0);
});
for(const optimization of [0,1,2])test(`closing and reopening retains Form identity but invalidates held child controls O${optimization}`,t=>{
 const p=project();p.modules[1].code=`Public a As Document,stale As TextBox,number As Long,old As Long,current As Long
Private Sub Main()
 Set a=New Document
 a.Show
 Set stale=a.Edit
 old=a.hWnd
 Unload a
End Sub
Private Sub Reopen()
 a.Show
 current=a.hWnd
 On Error Resume Next
 stale.Text="corrupt"
 number=Err.Number
 Err.Clear
End Sub
Private Sub ClearAll()
 Unload a
 Set a=Nothing
 Set stale=Nothing
End Sub`;
 const h=formMachine(t,p,optimization);h.vm.invoke('proc:M:Main');assert.equal(h.windows.size,0);
 h.reuseHandle(h.number('old'));h.vm.invoke('proc:M:Reopen');assert.equal(h.number('current'),h.number('old'),'force exact native handle reuse');assert.equal(h.number('number'),91);
 assert.equal(h.children(h.number('current')).find(w=>w.classname==='EDIT').text,'start');h.vm.invoke('proc:M:ClearAll');assert.equal(h.owned().length,0);
});
for(const optimization of [0,1,2])test(`a Form setter captures epoch before an operand destroys and recreates the same instance O${optimization}`,t=>{
 const p=project();p.modules[1].code=`Public a As Document,number As Long,got As String
Private Sub Main()
 Set a=New Document
 a.Show
 On Error Resume Next
 a.Caption=ReplaceWindow()
 number=Err.Number
 Err.Clear
 got=a.Caption
 Unload a
 Set a=Nothing
End Sub
Private Function ReplaceWindow() As String
 Unload a
 a.Show
 a.Caption="replacement"
 ReplaceWindow="old setter"
End Function`;
 const h=formMachine(t,p,optimization);h.vm.invoke('proc:M:Main');assert.equal(h.number('number'),91);assert.equal(h.text('got'),'replacement');assert.equal(h.owned().length,1);
});
for(const optimization of [0,1,2])test(`implicit Form properties and With refer to the current object rather than the prototype default O${optimization}`,t=>{
 const p=project();p.modules[0].code+=`\nPublic Sub Rename(ByVal text As String)
 Caption=text
 With Me
  .Edit.Text=Caption
 End With
End Sub`;
 p.modules[1].code=`Private Sub Main()
 Dim a As New Document,b As New Document
 a.Rename "left"
 b.Rename "right"
 a.Show:b.Show
 Unload a:Unload b
End Sub`;
 const h=formMachine(t,p,optimization);h.vm.invoke('proc:M:Main');assert.equal(h.windows.size,0);assert.equal(h.owned().length,0);
 const defaultSlot=h.vm.symbol('default-form:Document');assert.equal(h.vm.memory.read(defaultSlot),0,'no accidental default Form allocated');
});
for(const optimization of [0,1,2])test(`per-instance keyboard callbacks preserve ByRef edits and tolerate destruction of their receiver O${optimization}`,t=>{
 const p=project();p.modules[0].code+=`\nPrivate Sub Edit_KeyPress(KeyAscii As Integer)
 counter=counter+1
 If KeyAscii=120 Then KeyAscii=0
 If KeyAscii=65 Then KeyAscii=937
 If KeyAscii=113 Then Unload Me
End Sub`;
 const h=formMachine(t,p,optimization);h.vm.invoke('proc:M:Main');const a=h.findText('first'),b=h.findText('second');
 const edit=parent=>h.children(parent).find(w=>w.classname==='EDIT');const ae=edit(a.hwnd),be=edit(b.hwnd);
 h.send(ae.hwnd,0x102,120);assert.equal(ae.text,'separate');
 h.send(ae.hwnd,0x102,65);assert.equal(ae.text,'separateΩ');assert.equal(be.text,'start');
 h.send(ae.hwnd,0x102,113);assert.equal(h.windows.has(a.hwnd),false);assert.equal(h.windows.has(ae.hwnd),false);assert.equal(be.text,'start');
 h.vm.invoke('proc:M:ClearAll');assert.equal(h.windows.size,0);assert.equal(h.owned().length,0);
});
for(const optimization of [0,1,2])test(`Form_Load failure rolls back native children and preserves the caller error without destroying the object O${optimization}`,t=>{
 const p=project();p.modules[0].code=p.modules[0].code.replace('counter=10','counter=counter+1\n If counter=1 Then Err.Raise 901,"load source","load failure"');
 p.modules[1].code=`Public a As Document,number As Long,where As String,description As String
Private Sub Main()
 Set a=New Document
 On Error Resume Next
 a.Show
 number=Err.Number
 where=Err.Source
 description=Err.Description
 Err.Clear
End Sub
Private Sub Retry()
 a.Show
End Sub
Private Sub ClearAll()
 Unload a
 Set a=Nothing
End Sub`;
 const h=formMachine(t,p,optimization);h.vm.invoke('proc:M:Main');assert.equal(h.number('number'),901);assert.equal(h.text('where'),'load source');assert.equal(h.text('description'),'load failure');
 assert.equal(h.windows.size,0);h.vm.invoke('proc:M:Retry');assert.equal(h.windows.size,4);h.vm.invoke('proc:M:ClearAll');assert.equal(h.windows.size,0);assert.equal(h.owned().length,2,'only the two retained error Strings');
});
for(const optimization of [0,1,2])test(`Form default instance retains its independent lifetime until shutdown releases its owner O${optimization}`,t=>{
 const p=project();p.modules[1].code=`Public a As Document,total As Long
Private Sub Main()
 Set a=New Document
 a.Caption="explicit"
 Document.Caption="default"
 If Not (a Is Document) Then total=1
 a.Show
 Document.Show
End Sub
Private Sub ClearAll()
 Unload a
 Set a=Nothing
 Unload Document
End Sub`;
 const h=formMachine(t,p,optimization);h.vm.invoke('proc:M:Main');assert.equal(h.number('total'),1);assert.ok(h.findText('explicit'));assert.ok(h.findText('default'));
 h.vm.invoke('proc:M:ClearAll');assert.equal(h.windows.size,0);assert.equal(h.owned().length,1,'the default object remains until project shutdown');
 const address=h.vm.symbol('default-form:Document'),owner=h.vm.memory.read(address);h.vm.memory.write(address,0);
 h.vm.invoke('proc:NativeClassService:Release',[owner]);assert.equal(h.owned().length,0);
});
