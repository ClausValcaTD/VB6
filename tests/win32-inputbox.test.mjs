import test from 'node:test';import assert from 'node:assert/strict';
import {inputBoxMachine} from './support/native-inputbox-machine.mjs';
import {compileWin32} from '../src/native/compiler.js';import {newProject} from '../src/project/model.js';
import {BinarySection} from '../src/native/pe32.js';import {nativeInputBoxTemplate} from '../src/native/inputbox-template.js';
for(const optimization of [0,1,2]){
 test(`InputBox returns entered Unicode, defaults, Cancel and WM_CLOSE through native callback O${optimization}`,t=>{
  const h=inputBoxMachine(t,`Private a As String,b As String,c As String,d As String
Private Sub Main()
 a=InputBox("First & prompt" & vbCrLf & "Second line","Title","default")
 b=InputBox("Default")
 c=InputBox("Cancelled",,"not returned")
 d=InputBox("Closed",,"not returned")
End Sub`,optimization,[{text:'Zażółć Ω 中'},{},{cancel:true},{close:true}]);
  h.invoke();assert.equal(h.text('a'),'Zażółć Ω 中');assert.equal(h.text('b'),'');assert.equal(h.text('c'),'');assert.equal(h.text('d'),'');
  assert.equal(h.dialogs[0].prompt,'First & prompt\r\nSecond line');assert.equal(h.dialogs[0].title,'Title');assert.equal(h.dialogs[1].title,'CollectionChecks');
  assert.deepEqual(h.dialogs[0].position,[550,267]);assert.equal(h.owned().length,4);assert.equal(h.live.size,0);
 });
 test(`InputBox preserves source-order snapshots, optional positions and default text O${optimization}`,t=>{
  const h=inputBoxMachine(t,`Private text As String,sequence As Long
Private Sub Main()
 text=InputBox(title:=Mark(1,"title"),prompt:=Mark(2,"prompt"),default:=Mark(3,"start"),ypos:=2880,xpos:=1440)
End Sub
Private Function Mark(ByVal digit As Long,ByVal value As String) As String
 sequence=sequence*10+digit
 Mark=value
End Function`,optimization);
  h.invoke();assert.equal(h.number('sequence'),123);assert.equal(h.text('text'),'start');assert.deepEqual(h.dialogs[0].position,[144,288]);assert.equal(h.owned().length,1);
 });
 test(`InputBox truncates output to 254 UTF16 units and at pasted line breaks O${optimization}`,t=>{
  const h=inputBoxMachine(t,`Private a As String,b As String,c As String
Private Sub Main()
 a=InputBox("long")
 b=InputBox("CR")
 c=InputBox("LF")
End Sub`,optimization,[{text:'x'.repeat(255)},{text:'alpha\r\nbeta'},{text:'Ω\nsecond'}]);
  h.invoke();assert.equal(h.text('a'),'x'.repeat(254));assert.equal(h.text('b'),'alpha');assert.equal(h.text('c'),'Ω');assert.equal(h.owned().length,3);
 });
 test(`InputBox state survives nested modal calls and restores the suspended VB error frame O${optimization}`,t=>{
  let h;h=inputBoxMachine(t,`Private outer As String,inner As String
Private Sub Main()
 outer=InputBox("outer",,"first")
End Sub
Private Sub Nested()
 inner=InputBox("inner",,"second")
End Sub`,optimization,[{text:'outer result',during:()=>h.callback('proc:M:Nested',[])},{text:'inner result'}]);
  h.invoke();assert.equal(h.text('outer'),'outer result');assert.equal(h.text('inner'),'inner result');assert.equal(h.dialogs[1].owner,h.dialogs[0].hwnd);
  assert.notEqual(h.dialogs[0].state,h.dialogs[1].state);assert.equal(h.vm.memory.read(h.vm.symbol('native:error:frame')),0);assert.equal(h.owned().length,2);
 });
 test(`InputBox creation failure reaches the caller's On Error rather than crossing callback frames O${optimization}`,t=>{
  const h=inputBoxMachine(t,`Private number As Long,text As String
Private Sub Main()
 text="unchanged"
 On Error Resume Next
 text=InputBox("failure")
 number=Err.Number
 Err.Clear
End Sub`,optimization,[{apiFailure:true}]);
  h.invoke();assert.equal(h.number('number'),5);assert.equal(h.text('text'),'unchanged');assert.equal(h.owned().length,1);
 });
}
function project(code){return {...newProject('Input'),startup:'Sub Main',modules:[{id:'m',name:'M',kind:'module',code:'Sub Main()\nDim s As String\n'+code+'\nEnd Sub'}]};}
for(const code of ['s=InputBox()','s=InputBox(typo:="x")','s=InputBox("x",prompt:="y")','s=InputBox("x",,,,,"help.hlp")','s=InputBox("x",,,,,"help.hlp",10)'])test('InputBox diagnoses invalid or unsupported arguments: '+code,()=>assert.throws(()=>compileWin32(project(code)),e=>e.name==='NativeCompileError'));
test('user InputBox procedure is not substituted by native builtin',()=>{
 const p=project('s=InputBox("x")');p.modules[0].code+='\nPrivate Function InputBox(ByVal prompt As String) As String\nInputBox=prompt\nEnd Function';
 const r=compileWin32(p);assert.ok(!r.report.imports.some(i=>i.symbol==='DialogBoxIndirectParamW'));
});
test('dialog template uses aligned native controls and single-line edit contract',()=>{
 const s=new BinarySection('.rdata',0);nativeInputBoxTemplate(s,'dialog');const data=Uint8Array.from(s.bytes),v=new DataView(data.buffer);let p=18;
 const string=()=>{let text='';for(;;){const n=v.getUint16(p,true);p+=2;if(!n)return text;text+=String.fromCharCode(n);}};
 assert.equal(string(),'');assert.equal(string(),'');assert.equal(string(),'');assert.equal(v.getUint16(p,true),8);p+=2;assert.equal(string(),'MS Shell Dlg');
 const controls=[];for(let i=0;i<4;i++){p=(p+3)&~3;const style=v.getUint32(p,true),id=v.getUint16(p+16,true);p+=18;assert.equal(v.getUint16(p,true),0xffff);const klass=v.getUint16(p+2,true);p+=4;const text=string();assert.equal(v.getUint16(p,true),0);p+=2;controls.push({style,id,klass,text});}
 assert.deepEqual(controls.map(x=>x.id),[1001,1002,1,2]);assert.equal(controls[1].style&4,0);assert.equal(controls[2].style&15,1);assert.equal(p,data.length);
});

test('native InputBox acceptance compiles all ten assertions within the existing Windows fixture budget',async()=>{
 const {nativeControlFixtures}=await import('../tools/win32-control-fixtures.mjs');
 const fixture=nativeControlFixtures().find(f=>f.project.name==='AotControlInputBox'),before=JSON.stringify(fixture.project);
 assert.equal(fixture.checks.length,10);
 for(const optimization of [0,1,2]){const a=compileWin32(fixture.project,{optimization});assert.ok(a.bytes.length<100*1024);assert.deepEqual(a.bytes,compileWin32(fixture.project,{optimization}).bytes);}
 assert.equal(JSON.stringify(fixture.project),before);
});

for(const optimization of [0,1,2])for(const [action,expected]of [[{resultFailure:true},7],[{textFailure:true},5]])test(`InputBox records callback failure and raises only after DialogBox returns O${optimization} ${expected}`,t=>{
 const h=inputBoxMachine(t,`Private number As Long,value As String
Private Sub Main()
 value="preserved"
 On Error Resume Next
 value=InputBox("failure")
 number=Err.Number
 Err.Clear
End Sub`,optimization,[action]);
 h.invoke();assert.equal(h.number('number'),expected);assert.equal(h.text('value'),'preserved');assert.equal(h.live.size,0);assert.equal(h.owned().length,1);
});
for(const optimization of [0,1,2])test(`successful InputBox does not clear the caller's authored error metadata O${optimization}`,t=>{
 const h=inputBoxMachine(t,`Private number As Long,description As String,value As String
Private Sub Main()
 On Error Resume Next
 Err.Raise 901,"caller","original description"
 value=InputBox("prompt",,"default")
 number=Err.Number
 description=Err.Description
 Err.Clear
End Sub`,optimization);
 h.invoke();assert.equal(h.number('number'),901);assert.equal(h.text('description'),'original description');assert.equal(h.text('value'),'default');assert.equal(h.owned().length,2);
});
