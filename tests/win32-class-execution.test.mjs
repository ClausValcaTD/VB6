import test from 'node:test';import assert from 'node:assert/strict';
import {collectionMachine} from './support/native-collection-machine.mjs';
const counter={id:'c',name:'Counter',kind:'class',code:`Private total As Long
Public Function NextValue() As Long
 Static count As Long
 count=count+1
 total=total+count
 NextValue=count
End Function
Public Property Get Value() As Long
 Value=total
End Property
Public Property Let Value(ByVal value As Long)
 total=value
End Property`};
for(const optimization of [0,1,2])test(`native class instances have separate fields and method Static state O${optimization}`,t=>{
 const h=collectionMachine(t,`Private a As Long,b As Long,c As Long,d As Long
Private Sub Main()
 Dim first As New Counter,second As New Counter,alias As Counter
 a=first.NextValue()
 b=first.NextValue()
 c=second.NextValue()
 Set alias=first
 Set first=Nothing
 alias.Value=40
 d=alias.NextValue()+alias.Value
 Set alias=Nothing
 Set second=Nothing
End Sub`,optimization,[counter]);
 h.invoke();assert.deepEqual(['a','b','c','d'].map(h.number),[1,2,1,46]);assert.equal(h.owned().length,0);
});
const lifetime={id:'l',name:'Lifetime',kind:'class',code:`Private name As String
Private owned As New Collection
Public Property Get Title() As String
 Title=name
End Property
Public Property Let Title(ByVal value As String)
 name=value
End Property
Private Sub Class_Initialize()
 started=started+1
 name="initial"
 owned.Add "owned"
End Sub
Private Sub Class_Terminate()
 finished=finished+1
End Sub
Public Function Self() As Lifetime
 Set Self=Me
End Function
Public Function Same(ByVal other As Lifetime) As Boolean
 Same=Me Is other
End Function`};
for(const optimization of [0,1,2])test(`native class lifecycle, owned fields, ByVal/ByRef and typed return ABI O${optimization}`,t=>{
 const h=collectionMachine(t,`Public started As Long,finished As Long
Private got As String,n As Long
Private Sub Main()
 Dim a As New Lifetime,b As Lifetime
 got=a.Title
 Take a
 Set b=a.Self()
 If a.Same(b) Then n=1
 Clear (a)
 got=got & a.Title
 Clear a
 got=got & b.Title
 Set b=Nothing
End Sub
Private Sub Take(ByVal a As Lifetime)
 a.Title="changed"
 Set a=Nothing
End Sub
Private Sub Clear(ByRef a As Lifetime)
 Set a=Nothing
End Sub`,optimization,[lifetime]);
 h.invoke();assert.equal(h.number('started'),1);assert.equal(h.number('finished'),1);assert.equal(h.number('n'),1);assert.equal(h.text('got'),'initialchangedchanged');assert.equal(h.owned().length,1);
});
for(const optimization of [0,1,2])test(`native class initialization failure rolls back fields and preserves authored error metadata O${optimization}`,t=>{
 const h=collectionMachine(t,`Private n As Long,s As String,d As String
Private Sub Main()
 Dim a As Failing
 On Error Resume Next
 Set a=New Failing
 n=Err.Number
 s=Err.Source
 d=Err.Description
 Err.Clear
End Sub`,optimization,[{name:'Failing',id:'f',kind:'class',code:`Private text As String
Private c As New Collection
Private Sub Class_Initialize()
 text="allocated"
 c.Add "allocated"
 Err.Raise 903,"initializer","owned error"
End Sub`}]);
 h.invoke();assert.equal(h.number('n'),903);assert.equal(h.text('s'),'initializer');assert.equal(h.text('d'),'owned error');assert.equal(h.owned().length,2);
});
for(const optimization of [0,1,2])test(`class fields and private properties work through captured With receivers O${optimization}`,t=>{
 const h=collectionMachine(t,`Private s As String,n As Long
Private Sub Main()
 Dim a As New Fields,b As New Fields
 a.Text="first"
 b.Text="second"
 With a
  .Text=.Text & "!"
  .Add 3
  n=.Value
 End With
 s=a.Text & b.Text
End Sub`,optimization,[{id:'f',name:'Fields',kind:'class',code:`Public Text As String
Private total As Long
Public Sub Add(ByVal amount As Long)
 Me.total=total+amount
End Sub
Public Property Get Value() As Long
 Value=total
End Property`}]);
 h.invoke();assert.equal(h.text('s'),'first!second');assert.equal(h.number('n'),3);assert.equal(h.owned().length,1);
});
for(const optimization of [0,1,2])test(`class reflection dispatches dynamic names, scalar parameters, and property access O${optimization}`,t=>{
 const h=collectionMachine(t,`Private a As Long,b As Long,c As Long,s As String,n1 As Long,n2 As Long
Private Sub Main()
 Dim object As New Reflect,name As String,mode As Long
 name="sum":mode=vbMethod
 a=CallByName(object,name,mode,7,5)
 CallByName object,"VALUE",vbLet,20
 b=CallByName(object,"value",vbGet)
 s=CallByName(object,"Echo",vbMethod,"unicode " & ChrW$(937))
 CallByName object,"Field",vbLet,"public"
 s=s & CallByName(object,"FIELD",vbGet)
 c=object.Value
 On Error Resume Next
 a=CallByName(object,"PrivateSecret",vbMethod)
 n1=Err.Number
 Err.Clear
 a=CallByName(object,"Sum",vbMethod,1)
 n2=Err.Number
 Err.Clear
End Sub`,optimization,[{id:'r',name:'Reflect',kind:'class',code:`Public Field As String
Private total As Long
Public Function Sum(ByVal first As Long,ByRef second As Long) As Long
 Sum=first+second
 second=200
End Function
Public Function Echo(ByVal value As String) As String
 Echo=value
End Function
Public Property Get Value() As Long
 Value=total
End Property
Public Property Let Value(ByVal value As Long)
 total=value
End Property
Private Function PrivateSecret() As Long
 PrivateSecret=123
End Function`}]);
 h.invoke();assert.deepEqual(['a','b','c','n1','n2'].map(h.number),[12,20,20,438,450]);assert.equal(h.text('s'),'unicode Ωpublic');assert.equal(h.owned().length,1);
});
for(const optimization of [0,1,2])test(`class receivers are retained before mutating arguments and recursive returns O${optimization}`,t=>{
 const h=collectionMachine(t,`Public receiver As Reflect,kept As Reflect,sequence As Long
Private a As Long,b As Long,s As String
Private Sub Main()
 Set receiver=New Reflect
 Set kept=receiver
 a=receiver.Add(Change())
 b=kept.Value
 Set receiver=Make(4)
 s=receiver.Echo("last")
 Set receiver=Nothing
 Set kept=Nothing
End Sub
Private Function Change() As Long
 Set receiver=New Reflect
 Change=6
End Function
Private Function Make(ByVal count As Long) As Reflect
 If count=0 Then
  Set Make=New Reflect
 Else
  Set Make=Make(count-1)
 End If
End Function`,optimization,[{name:'Reflect',id:'r',kind:'class',code:`Private total As Long
Public Function Add(ByVal n As Long) As Long
 total=total+n
 Add=total
End Function
Public Property Get Value() As Long
 Value=total
End Property
Public Function Echo(ByVal value As String) As String
 Echo=value
End Function`}]);
 h.invoke();assert.deepEqual(['a','b'].map(h.number),[6,6]);assert.equal(h.text('s'),'last');assert.equal(h.owned().length,1);
});
for(const optimization of [0,1,2])test(`class resurrection and raising finalizers cannot skip deterministic field cleanup O${optimization}`,t=>{
 const h=collectionMachine(t,`Public revived As Phoenix,calls As Long
Private alive As Long,n As Long
Private Sub Main()
 Dim a As New Phoenix
 alive=a.Alive
 Set a=Nothing
 alive=revived.Alive
 Set revived=Nothing
 Dim b As New Raising
 b.Test
 On Error Resume Next
 Err.Raise 901,"preserved","caller fault"
 Set b=Nothing
 n=Err.Number
 Err.Clear
End Sub`,optimization,[{id:'p',name:'Phoenix',kind:'class',code:`Private text As String
Private Sub Class_Initialize()
 text="owned"
End Sub
Public Property Get Alive() As Long
 Alive=Len(text)
End Property
Private Sub Class_Terminate()
 calls=calls+1
 Set revived=Me
End Sub`},{id:'r',name:'Raising',kind:'class',code:`Private text As String
Public Sub Test()
 text="owned"
End Sub
Private Sub Class_Terminate()
 Err.Raise 999,"finalizer","cleanup must run"
End Sub`}]);
 h.invoke();assert.equal(h.number('calls'),1);assert.equal(h.number('alive'),5);assert.equal(h.number('n'),901);assert.equal(h.owned().length,0);
});
