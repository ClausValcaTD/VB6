import test from 'node:test';import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
function project(code='',properties={}){
 const p=newProject('FormBoundaries');p.startup='Sub Main';Object.assign(p.modules[0].form.properties,properties);p.modules[0].code=code;
 p.modules.push({id:'m',name:'M',kind:'module',code:'Sub Main()\nDim instance As New Form1\ninstance.Show\nEnd Sub'});return p;
}
for(const [name,make]of [
 ['unsupported designer control family',()=>{const p=project();p.modules[0].form.controls=[createControl('Timer','Timer1')];return p;}],
 ['designer control arrays',()=>{const p=project();const c=createControl('TextBox','Text1');c.properties.Index=0;p.modules[0].form.controls=[c];return p;}],
 ['form menu',()=>{const p=project();p.modules[0].form.menus=[{name:'mnuFile',properties:{Caption:'File'}}];return p;}],
 ['image on an intrinsic control',()=>{const p=project();const c=createControl('CommandButton','Button1');c.properties.Picture='unsupported.bmp';p.modules[0].form.controls=[c];return p;}],
 ['unrouted Paint event',()=>project('Private Sub Form_Paint()\nEnd Sub')],
 ['unimplemented scale',()=>project('',{ScaleMode:7})],
 ['KeyPreview',()=>project('',{KeyPreview:-1})],
 ['independent Controls.Add',()=>project('Private Sub Form_Load()\nDim control As Object\nSet control=Controls.Add("VB.Label","label")\nEnd Sub')],
 ['independent Me.Controls.Add',()=>project('Private Sub Form_Load()\nDim control As Object\nSet control=Me.Controls.Add("VB.Label","label")\nEnd Sub')],
 ['drawing on independent Form',()=>project('Private Sub Form_Load()\nMe.Line (1,1)-(2,2)\nEnd Sub')],
])test(name+' is diagnosed without emitting a plausible unsupported EXE',()=>{
 assert.throws(()=>compileWin32(make()),e=>e.name==='NativeCompileError');
});
