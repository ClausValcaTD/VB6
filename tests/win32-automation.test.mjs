import test from 'node:test';import assert from 'node:assert/strict';
import {automationMachine} from './support/native-automation-machine.mjs';
import {planAutomationArguments,prepareNativeAutomation} from '../src/native/automation-plan.js';
import {compileWin32} from '../src/native/compiler.js';import {newProject} from '../src/project/model.js';
const V=(tag,value)=>({tag,value});
for(const optimization of [0,1,2]){
 test(`native Automation calls chained members and retains/disposes actual interface references O${optimization}`,t=>{
  const h=automationMachine(t,`Private n As Long,text As String
Sub Main()
 Dim rs As Object,alias As Object
 Set rs=CreateObject("Fake.Recordset")
 Set alias=rs
 rs.Fields.Append "ID",adInteger
 rs.Fields.Item("ID").Value=42
 n=rs.RecordCount
 text=rs.Fields.Item("ID").Value
 Set rs=Nothing
 n=n+alias.RecordCount
 Set alias=Nothing
End Sub`,optimization);
  let data='';const field=h.define('field',{value:1},{invoke:({flags,values})=>{if(flags&4){data=values[0].value;return V(0,0);}return V(3,data);}});
  const fields=h.define('fields',{append:1,item:2},{invoke:({name,values})=>{if(name==='append'){assert.deepEqual(values.map(v=>v.value),[3,'ID']);return V(0,0);}assert.equal(values[0].value,'ID');return V(9,field);}});
  h.define('Fake.Recordset',{fields:1,recordcount:2},{invoke:({name})=>name==='fields'?V(9,fields):V(3,1)});
  h.invoke();assert.equal(h.number('n'),2);assert.equal(h.text('text'),'42');assert.equal(h.refs(),0);assert.equal(h.owned().length,1);assert.equal(h.state.initialized,1);h.vm.invoke('native:automation:shutdown');assert.equal(h.state.initialized,0);
 });
 test(`native Automation named layout preserves source order and typed ByRef writes O${optimization}`,t=>{
  const h=automationMachine(t,`Private order As Long,total As Long,text As String,number As Long
Sub Main()
 Dim object As Object,n As Long,s As String
 Set object=CreateObject("Fake.Test")
 total=object.Sum(second:=Mark(2),first:=Mark(1))
 n=7:s="before"
 object.Mutate n,s
 number=n:text=s
 object.Mutate (n),(s)
 total=total+n
 Set object=Nothing
End Sub
Function Mark(ByVal value As Long) As Long
 order=order*10+value
 Mark=value
End Function`,optimization);
  let calls=0;h.define('Fake.Test',{sum:1,first:11,second:12,mutate:2},{invoke:e=>{
   if(e.name==='sum'){assert.deepEqual(e.names,[11,12]);assert.deepEqual(e.values.map(v=>v.value),[1,2]);return V(3,3);}
   if(calls++===0){assert.deepEqual(e.values.map(v=>v.rawTag),[0x4008,0x4003]);e.setReference(e.views[0],V(8,'after'));e.setReference(e.views[1],V(3,19));}
   else assert.deepEqual(e.values.map(v=>v.tag),[8,3]);return V(0,0);
  }});
  h.invoke();assert.equal(h.number('order'),21);assert.equal(h.number('number'),19);assert.equal(h.number('total'),22);assert.equal(h.text('text'),'after');assert.equal(h.refs(),0);assert.equal(h.owned().length,1);
 });
 test(`native Automation failures preserve destinations and transfer deferred COM error text O${optimization}`,t=>{
  const h=automationMachine(t,`Private number As Long,text As String,source As String,help As String,context As Long,seen As String
Sub Main()
 Dim object As Object
 Set object=CreateObject("Fake.Test")
 seen="old"
 On Error Resume Next
 seen=object.Fail()
 number=Err.Number:text=Err.Description:source=Err.Source:help=Err.HelpFile:context=Err.HelpContext
 Err.Clear
 Set object=Nothing
End Sub`,optimization);
  h.define('Fake.Test',{fail:1},{invoke:()=>({hr:0x80020009,scode:0x800a0cc1,source:'ADO Ω',description:'Missing field',helpfile:'help.chm',context:42,deferred:true,partial:V(8,'must be freed')})});
  h.invoke();assert.equal(h.number('number'),3265);assert.equal(h.text('source'),'ADO Ω');assert.equal(h.text('text'),'Missing field');assert.equal(h.text('help'),'help.chm');assert.equal(h.number('context'),42);assert.equal(h.text('seen'),'old');assert.equal(h.refs(),0);assert.equal(h.owned().length,4);
 });
 test(`native Automation method failures capture IErrorInfo before releasing objects O${optimization}`,t=>{
  const h=automationMachine(t,`Private number As Long,text As String
Sub Main()
 Dim object As Object
 Set object=CreateObject("Fake.Test")
 On Error Resume Next
 object.Fail
 number=Err.Number:text=Err.Description
 Err.Clear
 Set object=Nothing
End Sub`,optimization);
  h.define('Fake.Test',{fail:1},{invoke:()=>({hr:0x80004005,errorInfo:{source:'provider',description:'provider detail'}})});
  h.invoke();assert.equal(h.number('number'),0x80004005|0);assert.equal(h.text('text'),'provider detail');assert.equal(h.refs(),0);assert.equal(h.owned().length,1);
 });
 test(`native Automation Object ABI supports Variant returns, aliases, With, and canonical Is O${optimization}`,t=>{
  const h=automationMachine(t,`Private text As String,n As Long
Sub Main()
 Dim object As Object,other As Object
 Set object=CreateObject("Fake.Test")
 Set other=Identity(object)
 With other
  .Value="new"
  text=.Value
 End With
 If object Is other Then n=1
 Clear other
 If other Is Nothing Then n=n+1
 Set object=Nothing
End Sub
Function Identity(ByVal object As Object) As Object
 Set Identity=object
End Function
Sub Clear(ByRef object As Object)
 Set object=Nothing
End Sub`,optimization);
  let value='';h.define('Fake.Test',{value:1},{invoke:({flags,values})=>{if(flags&4){value=values[0].value;return V(0,0);}return V(8,value);}});
  h.invoke();assert.equal(h.text('text'),'new');assert.equal(h.number('n'),2);assert.equal(h.refs(),0);assert.equal(h.owned().length,1);
 });
}
for(const optimization of [0,1,2]){
 test(`Automation receiver is captured before an argument replaces the source Object O${optimization}`,t=>{
  const h=automationMachine(t,`Private object As Object,other As Object,result As String
Sub Main()
 Set object=CreateObject("Fake.First")
 result=object.Echo(Change())
 Set object=Nothing
End Sub
Function Change() As String
 Set object=CreateObject("Fake.Second")
 Change="argument"
End Function`,optimization);
  h.define('Fake.First',{echo:1},{invoke:({values})=>V(8,'first:'+values[0].value)});
  h.define('Fake.Second',{echo:99},{invoke:()=>assert.fail('receiver changed during arguments')});
  h.invoke();assert.equal(h.text('result'),'first:argument');assert.equal(h.refs(),0);assert.equal(h.owned().length,1);
 });
 test(`Automation unknown names, activation failure and null receivers preserve old output O${optimization}`,t=>{
  const h=automationMachine(t,`Private one As Long,two As Long,three As Long,s As String
Sub Main()
 Dim object As Object
 s="old"
 On Error Resume Next
 Set object=CreateObject("Fake.Unknown")
 one=Err.Number
 Err.Clear
 s=object.Value
 two=Err.Number
 Err.Clear
 Set object=CreateObject("Fake.Test")
 s=object.Missing
 three=Err.Number
 Err.Clear
 Set object=Nothing
End Sub`,optimization);
  h.define('Fake.Test',{value:1},{invoke:()=>V(8,'unused')});h.invoke();assert.deepEqual(['one','two','three'].map(h.number),[429,91,438]);assert.equal(h.text('s'),'old');assert.equal(h.refs(),0);assert.equal(h.owned().length,1);
 });
 test(`successful Automation calls preserve prior Err metadata and caller source lines O${optimization}`,t=>{
  const h=automationMachine(t,`Private number As Long,description As String,source As String,line As Long,n As Long
Sub Main()
 Dim object As Object
 Set object=CreateObject("Fake.Test")
 On Error Resume Next
100 Err.Raise 901,"caller","retained error"
 n=object.Value
 number=Err.Number:description=Err.Description
 Err.Clear
200 n=object.Missing
 source=Err.Source:line=Erl
 Err.Clear
 Set object=Nothing
End Sub`,optimization);
  h.define('Fake.Test',{value:1},{invoke:()=>V(3,42)});h.invoke();assert.equal(h.number('number'),901);assert.equal(h.text('description'),'retained error');assert.equal(h.text('source'),'M');assert.equal(h.number('line'),200);assert.equal(h.number('n'),42);assert.equal(h.refs(),0);assert.equal(h.owned().length,2);
 });
}
test('Automation plans retain source order separately from reversed named/positional ABI slots',()=>{
 const args=[{kind:'literal',value:1},{kind:'named',name:'b',expr:{kind:'literal',value:2}},{kind:'named',name:'c',expr:{kind:'literal',value:3}}];
 const p=planAutomationArguments(args);assert.deepEqual(p.entries.map(e=>e.index),[0,1,2]);assert.deepEqual(p.abi.map(e=>e.index),[2,1,0]);assert.deepEqual(p.names,['c','b']);
 const put=planAutomationArguments([...args,{kind:'literal',value:'new'}],{put:true});assert.deepEqual(put.abi.map(e=>e.index),[3,2,1,0]);
 assert.throws(()=>planAutomationArguments([args[1],args[0]]));assert.throws(()=>planAutomationArguments([args[1],args[1]]));assert.throws(()=>planAutomationArguments(Array(65).fill(args[0])));
});
test('authored CreateObject function retains its ordinary native implementation and Object ABI',()=>{
 const p={...newProject('NoAutomation'),startup:'Sub Main',modules:[{name:'M',kind:'module',code:'Sub Main()\nDim n As Long\nn=CreateObject("x")\nEnd Sub\nFunction CreateObject(ByVal value As String) As Long\nCreateObject=1\nEnd Function'}]};
 assert.ok(!compileWin32(p).report.imports.some(i=>i.symbol==='CoCreateInstance'));
});
test('the native ADO fixture compiles deterministically with the existing size budget',async()=>{
 const {nativeControlFixtures}=await import('../tools/win32-control-fixtures.mjs');const f=nativeControlFixtures().find(f=>f.project.name==='AotControlAutomation');const original=JSON.stringify(f.project);
 assert.equal(f.checks.length,12);for(const optimization of [0,1,2]){const r=compileWin32(f.project,{optimization});assert.ok(r.bytes.length<100*1024);assert.deepEqual(r.bytes,compileWin32(f.project,{optimization}).bytes);}
 assert.equal(JSON.stringify(f.project),original);
});
test('COM Object promotion preserves the separate borrowed common-control event ABI',()=>{
 const p=newProject('MixedEvents');p.modules[0].form.controls=[{id:'tree',type:'TreeView',name:'Tree',properties:{Name:'Tree',Nodes:[]}}];
 p.modules[0].code='Private object As Object\nSub Form_Load()\nSet object=CreateObject("ADODB.Recordset")\nEnd Sub\nSub Tree_NodeClick(ByVal Item As Object)\nDim s As String\ns=Item.Text\nEnd Sub';
 const before=JSON.stringify(p);assert.ok(compileWin32(p).bytes.length);assert.equal(JSON.stringify(p),before);
 p.modules[0].code=p.modules[0].code.replace('s=Item.Text','Set object=Item');assert.throws(()=>compileWin32(p),/borrowed|box|reference|supported/i);
});

for(const optimization of [0,1,2])test(`Automation Object defaults stay Nothing instead of Empty across locals/globals/Static/returns O${optimization}`,t=>{
 const h=automationMachine(t,`Private globalObject As Object,count As Long
Sub Main()
 Dim localObject As Object,object As Object
 If IsObject(globalObject) And globalObject Is Nothing Then count=count+1
 If IsObject(localObject) And localObject Is Nothing Then count=count+1
 If IsObject(DefaultObject()) And DefaultObject() Is Nothing Then count=count+1
 StaticCheck
 Set object=CreateObject("Fake.Test")
 Take object
End Sub
Sub StaticCheck()
 Static stored As Object
 If IsObject(stored) And stored Is Nothing Then count=count+1
End Sub
Function DefaultObject() As Object
End Function
Sub Take(ByVal object As Object)
 If object.Value=42 Then count=count+1
End Sub`,optimization);
 h.define('Fake.Test',{value:1},{invoke:()=>V(3,42)});h.invoke();assert.equal(h.number('count'),5);assert.equal(h.refs(),0);assert.equal(h.owned().length,0);
});
test('Object ByRef parameters cannot silently expose scalar or Variant slots',()=>{
 for(const decl of ['Long','Variant']){
 const p={...newProject('ObjectABI'),startup:'Sub Main',modules:[{name:'M',kind:'module',code:`Sub Main()
Dim object As Object,value As ${decl}
Set object=CreateObject("Fake.Test")
Take value
End Sub
Sub Take(ByRef target As Object)
Set target=Nothing
End Sub`}]};
 assert.throws(()=>compileWin32(p),/exact Object storage/);
 }
});
