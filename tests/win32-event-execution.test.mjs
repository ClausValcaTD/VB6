import test from 'node:test';import assert from 'node:assert/strict';
import {collectionMachine} from './support/native-collection-machine.mjs';
const source={id:'publisher',name:'Publisher',kind:'class',code:`Private total As Long
Public Event BeforeChange(Cancel As Boolean,ByVal Amount As Long)
Public Event Changed(ByVal Value As Long)
Public Sub Add(ByVal Amount As Long)
 Dim cancel As Boolean
 RaiseEvent BeforeChange(cancel,Amount)
 If Not cancel Then
  total=total+Amount
  RaiseEvent Changed(total)
 End If
End Sub
Public Property Get Value() As Long
 Value=total
End Property`};
const listener={id:'listener',name:'Listener',kind:'class',code:`Private WithEvents target As Publisher
Public id As Long
Public Sub Connect(ByVal value As Publisher)
 Set target=value
End Sub
Public Sub Disconnect()
 Set target=Nothing
End Sub
Private Sub target_BeforeChange(Cancel As Boolean,ByVal Amount As Long)
 order=order*10+id
 If Amount>4 Then Cancel=True
End Sub
Private Sub target_Changed(ByVal Value As Long)
 observed=observed+Value
End Sub`};
for(const optimization of [0,1,2]){
 test(`WithEvents synchronous ordered callbacks and ByRef cancellation O${optimization}`,t=>{
  const h=collectionMachine(t,`Public order As Long,observed As Long
Private value As Long
Private Sub Main()
 Dim p As New Publisher,a As New Listener,b As New Listener
 a.id=1:b.id=2
 a.Connect p:b.Connect p
 p.Add 3
 p.Add 5
 value=p.Value
 Set a=Nothing:Set b=Nothing:Set p=Nothing
End Sub`,optimization,[source,listener]);
  h.invoke();assert.equal(h.number('order'),1212);assert.equal(h.number('observed'),6);assert.equal(h.number('value'),3);assert.equal(h.owned().length,0);
 });
 test(`WithEvents reassignments detach and reconnect in assignment order O${optimization}`,t=>{
  const h=collectionMachine(t,`Public order As Long,observed As Long
Private Sub Main()
 Dim p As New Publisher,q As New Publisher,a As New Listener,b As New Listener
 a.id=1:b.id=2
 a.Connect p:b.Connect p
 a.Connect p
 p.Add 1
 a.Connect q
 p.Add 1
 q.Add 1
 b.Disconnect
 p.Add 1
End Sub`,optimization,[source,listener]);
  h.invoke();assert.equal(h.number('order'),2121);assert.equal(h.number('observed'),5);assert.equal(h.owned().length,0);
 });
 test(`a failed event connection leaves the old source reference and subscription intact O${optimization}`,t=>{
  const h=collectionMachine(t,`Public order As Long,observed As Long
Private p As Publisher,q As Publisher,a As Listener,number As Long
Private Sub Main()
End Sub
Private Sub Setup()
 Set p=New Publisher:Set q=New Publisher:Set a=New Listener
 a.id=1:a.Connect p
End Sub
Private Sub Replace()
 On Error Resume Next
 a.Connect q
 number=Err.Number
 Err.Clear
 p.Add 1:q.Add 2
End Sub
Private Sub Dispose()
 Set a=Nothing:Set p=Nothing:Set q=Nothing
End Sub`,optimization,[source,listener]);
  h.invoke('Setup');h.failures.set('allocate',24);h.invoke('Replace');assert.equal(h.number('number'),7);assert.equal(h.number('order'),1);assert.equal(h.number('observed'),1);
  h.invoke('Dispose');assert.equal(h.owned().length,0);
 });
 test(`steady scalar RaiseEvent does not allocate a subscriber snapshot O${optimization}`,t=>{
  const h=collectionMachine(t,`Public order As Long,observed As Long
Private p As Publisher,a As Listener
Private Sub Main()
End Sub
Private Sub Setup()
 Set p=New Publisher:Set a=New Listener
 a.id=0:a.Connect p
End Sub
Private Sub Fire()
 p.Add 1
End Sub
Private Sub Dispose()
 Set a=Nothing:Set p=Nothing
End Sub`,optimization,[source,listener]);
  h.invoke('Setup');const allocated=()=>h.vm.calls.filter(c=>c.name?.endsWith('!HeapAlloc')).length;
  const before=allocated();assert.ok(before>=4,'real publisher/sink/state/connection allocations were observed');for(let i=0;i<20;i++)h.invoke('Fire');assert.equal(allocated(),before);assert.equal(h.number('observed'),210);h.invoke('Dispose');assert.equal(h.owned().length,0);
 });
 test(`handler errors unwind dispatch state and remain visible at the raising call O${optimization}`,t=>{
  const bad={...listener,code:listener.code.replace('order=order*10+id','Err.Raise 905,"listener","failure"')};
  const h=collectionMachine(t,`Public order As Long,observed As Long
Private number As Long,value As Long,location As String
Private Sub Main()
 Dim p As New Publisher,a As New Listener
 a.Connect p
 On Error Resume Next
 p.Add 1
 number=Err.Number
 location=Err.Source
 value=p.Value
 Err.Clear
 a.Disconnect
 p.Add 2
 value=value+p.Value
End Sub`,optimization,[source,bad]);
  h.invoke();assert.equal(h.number('number'),905);assert.equal(h.text('location'),'listener');assert.equal(h.number('value'),2);assert.equal(h.owned().length,1);
  assert.equal(h.vm.memory.read(h.vm.symbol('native:error:frame')),0);assert.equal(h.vm.memory.read(h.vm.symbol('native:error:pending')),0);
 });
}
const tick={id:'ticker',name:'Ticker',kind:'class',code:`Public Event Tick(ByVal n As Long)
Public Sub Fire(ByVal n As Long)
 RaiseEvent Tick(n)
End Sub`};
for(const optimization of [0,1,2]){
 test(`disconnecting pending sinks and connecting new sinks during a raise is safe O${optimization}`,t=>{
  const sink={id:'sink',name:'Sink',kind:'class',code:`Private WithEvents source As Ticker
Public id As Long,mode As Long
Public Sub Connect(ByVal p As Ticker)
 Set source=p
End Sub
Public Sub Disconnect()
 Set source=Nothing
End Sub
Private Sub source_Tick(ByVal n As Long)
 order=order*10+id
 If mode=1 Then
  mode=0
  second.Disconnect
  third.Connect source
 End If
End Sub`};
  const h=collectionMachine(t,`Public first As Sink,second As Sink,third As Sink,order As Long
Private Sub Main()
 Dim p As New Ticker
 Set first=New Sink:Set second=New Sink:Set third=New Sink
 first.id=1:second.id=2:third.id=3:first.mode=1
 first.Connect p:second.Connect p
 p.Fire 1
 p.Fire 2
 Set first=Nothing:Set second=Nothing:Set third=Nothing
End Sub`,optimization,[tick,sink]);
  h.invoke();assert.equal(h.number('order'),113);assert.equal(h.owned().length,0);
 });
 test(`nested event raises have independent boundaries and synchronous ordering O${optimization}`,t=>{
  const sink={id:'sink',name:'Sink',kind:'class',code:`Private WithEvents source As Ticker
Public id As Long
Public Sub Connect(ByVal p As Ticker)
 Set source=p
End Sub
Private Sub source_Tick(ByVal n As Long)
 order=order*10+id
 If id=1 And n=1 Then source.Fire 2
End Sub`};
  const h=collectionMachine(t,`Public order As Long
Private Sub Main()
 Dim p As New Ticker,a As New Sink,b As New Sink
 a.id=1:b.id=2:a.Connect p:b.Connect p
 p.Fire 1
End Sub`,optimization,[tick,sink]);
  h.invoke();assert.equal(h.number('order'),1122);assert.equal(h.owned().length,0);
 });
 test(`the current sink may release its last authored owner inside its own callback O${optimization}`,t=>{
  const sink={id:'sink',name:'Sink',kind:'class',code:`Private WithEvents source As Ticker
Private text As String
Public Sub Connect(ByVal p As Ticker)
 Set source=p
 text="still alive"
End Sub
Private Sub source_Tick(ByVal n As Long)
 Set current=Nothing
 result=text
End Sub
Private Sub Class_Terminate()
 terminated=terminated+1
End Sub`};
  const h=collectionMachine(t,`Public current As Sink,result As String,terminated As Long
Private Sub Main()
 Dim p As New Ticker
 Set current=New Sink:current.Connect p
 p.Fire 1:p.Fire 2
End Sub`,optimization,[tick,sink]);
  h.invoke();assert.equal(h.text('result'),'still alive');assert.equal(h.number('terminated'),1);assert.equal(h.owned().length,1);
 });
}
for(const optimization of [0,1,2]){
 test(`event ABI preserves ByRef String/Single/Variant and ByVal Double/String ownership O${optimization}`,t=>{
  const p={id:'p',name:'Payload',kind:'class',code:`Public Event Changed(text As String, amount As Single, item As Variant, ByVal scale As Double, ByVal copy As String)
Public Sub Fire(text As String, amount As Single, item As Variant)
 RaiseEvent Changed(text,amount,item,1.25,"copy " & ChrW$(937))
End Sub`};
  const s={id:'s',name:'PayloadSink',kind:'class',code:`Private WithEvents source As Payload
Public Sub Connect(ByVal p As Payload)
 Set source=p
End Sub
Private Sub source_Changed(text As String, amount As Single, item As Variant, ByVal scale As Double, ByVal copy As String)
 text=text & "!"
 amount=amount+scale
 item="changed"
 observed=copy
 copy="private mutation"
End Sub`};
  const h=collectionMachine(t,`Public observed As String
Private result As String,total As Single
Private Sub Main()
 Dim p As New Payload,a As New PayloadSink,b As New PayloadSink,text As String,amount As Single,item As Variant
 a.Connect p:b.Connect p
 text="A" & ChrW$(0) & ChrW$(20013)
 amount=0.5
 item=7
 p.Fire text,amount,item
 result=text & CStr(item)
 total=amount
End Sub`,optimization,[p,s]);
  h.invoke();assert.equal(h.text('observed'),'copy Ω');assert.equal(h.text('result'),'A\0中!!changed');assert.equal(h.vm.readFP(h.global('total'),32),3);assert.equal(h.owned().length,2);
 });
 test(`RaiseEvent operands evaluate once even without any subscribers O${optimization}`,t=>{
  const p={id:'p',name:'Payload',kind:'class',code:`Public Event Changed(ByVal first As Long,ByVal second As Long)
Public Sub Fire()
 RaiseEvent Changed(Mark(1),Mark(2))
End Sub`};
  const h=collectionMachine(t,`Public order As Long
Private Sub Main()
 Dim p As New Payload
 p.Fire
End Sub
Public Function Mark(ByVal n As Long) As Long
 order=order*10+n
 Mark=n
End Function`,optimization,[p]);
  h.invoke();assert.equal(h.number('order'),12);assert.equal(h.owned().length,0);
 });
 test(`event delivery exposes authored Err changes rather than treating a callback as an intrinsic O${optimization}`,t=>{
  const p={id:'p',name:'Payload',kind:'class',code:`Public Event Changed()
Public Sub Fire()
 RaiseEvent Changed
End Sub`};
  const s={id:'s',name:'PayloadSink',kind:'class',code:`Private WithEvents source As Payload
Public Sub Connect(ByVal p As Payload)
 Set source=p
End Sub
Private Sub source_Changed()
 observed=Err.Number
 Err.Description="edited by sink"
End Sub`};
  const h=collectionMachine(t,`Public observed As Long
Private result As String,number As Long
Private Sub Main()
 Dim p As New Payload,a As New PayloadSink
 a.Connect p
 On Error Resume Next
 Err.Raise 908,"source","prior"
 p.Fire
 number=Err.Number
 result=Err.Description
 Err.Clear
End Sub`,optimization,[p,s]);
  h.invoke();assert.equal(h.number('observed'),908);assert.equal(h.number('number'),908);assert.equal(h.text('result'),'edited by sink');assert.equal(h.owned().length,1);
 });
 test(`all sink subscriptions disconnect before a field finalizer can publish to a dying sink O${optimization}`,t=>{
  const p={id:'p',name:'Payload',kind:'class',code:`Public Event Changed()
Public Sub Fire()
 RaiseEvent Changed
End Sub`};
  const helper={id:'h',name:'Helper',kind:'class',code:`Private Sub Class_Terminate()
 publisher.Fire
End Sub`};
  const s={id:'s',name:'PayloadSink',kind:'class',code:`Private helper As Helper
Private WithEvents source As Payload
Public Sub Connect(ByVal p As Payload)
 Set helper=New Helper
 Set source=p
End Sub
Private Sub source_Changed()
 observed=observed+1
End Sub`};
  const h=collectionMachine(t,`Public publisher As Payload,observed As Long
Private Sub Main()
 Set publisher=New Payload
 Dim a As New PayloadSink
 a.Connect publisher
 publisher.Fire
 Set a=Nothing
 Set publisher=Nothing
End Sub`,optimization,[p,helper,s]);
  h.invoke();assert.equal(h.number('observed'),1);assert.equal(h.owned().length,0);
 });
}
