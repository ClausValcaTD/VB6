import test from 'node:test';import assert from 'node:assert/strict';
import {collectionMachine} from './support/native-collection-machine.mjs';
for(const optimization of [0,1,2]){
 test(`authored Collection values, order, keys, aliases and enumeration execute on IA-32 O${optimization}`,t=>{
 const h=collectionMachine(t,`Option Explicit
Private count As Long,joined As String,saved As String
Private Sub Main()
 Dim c As New Collection,alias As Collection,item As Variant
 c.Add "a","first"
 c.Add "c","last"
 c.Add "b",before:="LAST"
 c.Add "d",after:=3
 Set alias=c
 Set c=Nothing
 count=alias.Count
 saved=alias("FIRST")
 For Each item In alias
  joined=joined & item
 Next
 alias.Remove "first"
 alias.Remove 1
 Set alias=Nothing
End Sub`,optimization);
 h.invoke();assert.equal(h.number('count'),4);assert.equal(h.text('saved'),'a');assert.equal(h.text('joined'),'abcd');
 assert.equal(h.owned().length,2,'only two retained global strings');
 });
 test(`Collection typed ByVal/ByRef/grouped/function ABI retains exact owners O${optimization}`,t=>{
 const h=collectionMachine(t,`Option Explicit
Private count As Long,result As String
Private Sub Main()
 Dim c As New Collection,a As Collection
 c.Add "kept"
 Take c
 Clear (c)
 Set a=Identity(c)
 Clear c
 count=a.Count
 result=a(1)
 Set a=Nothing
End Sub
Private Sub Take(ByVal c As Collection)
 c.Add "shared"
 Set c=Nothing
End Sub
Private Sub Clear(ByRef c As Collection)
 Set c=Nothing
End Sub
Private Function Identity(ByVal c As Collection) As Collection
 Set Identity=c
End Function`,optimization);
 h.invoke();assert.equal(h.number('count'),2);assert.equal(h.text('result'),'kept');assert.equal(h.owned().length,1);
 });
 test(`intrinsic Collection cleanup preserves caller Err and raising-callee unwinding O${optimization}`,t=>{
 const h=collectionMachine(t,`Option Explicit
Private number As Long,description As String,source As String,numberAfter As Long
Private Sub Main()
 Dim c As New Collection,n As Long
 On Error Resume Next
 Err.Raise 901,"retained source","retained description"
 c.Add "one"
 n=c.Count
 number=Err.Number
 description=Err.Description
 source=Err.Source
 Err.Clear
 Leaf
 numberAfter=Err.Number
 Err.Clear
 Set c=Nothing
End Sub
Private Sub Leaf()
 Dim c As New Collection
 c.Add "owned by raising frame"
 Err.Raise 902,"leaf","release while pending"
End Sub`,optimization);
 h.invoke();assert.equal(h.number('number'),901);assert.equal(h.text('description'),'retained description');assert.equal(h.text('source'),'retained source');assert.equal(h.number('numberAfter'),902);assert.equal(h.owned().length,2);
 assert.equal(h.vm.memory.read(h.vm.symbol('native:error:frame')),0);assert.equal(h.vm.memory.read(h.vm.symbol('native:error:pending')),0);
 });
}
for(const optimization of [0,1,2]){
 test(`Collection insertion/removal errors are atomic and preserve error text O${optimization}`,t=>{
 const h=collectionMachine(t,`Option Explicit
Private a As Long,b As Long,c As Long,d As Long,n As Long,value As String,source As String
Private Sub Main()
 Dim items As New Collection
 items.Add "kept","key"
 On Error Resume Next
 items.Add "duplicate","KEY"
 a=Err.Number
 source=Err.Source
 items.Add "conflict",before:=1,after:=1
 b=Err.Number
 items.Remove 0
 c=Err.Number
 items.Add "bad position",before:="missing"
 d=Err.Number
 n=items.Count
 value=items(1)
 Err.Clear
 Set items=Nothing
End Sub`,optimization);
 h.invoke();assert.deepEqual(['a','b','c','d','n'].map(h.number),[457,5,5,5,1]);assert.equal(h.text('source'),'M');assert.equal(h.text('value'),'kept');assert.equal(h.owned().length,2);
 });
 test(`Collection allocation/copy failures roll back owners and For Each acquisition O${optimization}`,t=>{
 const h=collectionMachine(t,`Option Explicit
Private items As Collection,number As Long,visits As Long
Private Sub Main()
End Sub
Private Sub Setup()
 Set items=New Collection
 items.Add "original","key"
End Sub
Private Sub TryNew()
 On Error Resume Next
 Set items=New Collection
 number=Err.Number
 Err.Clear
End Sub
Private Sub TryAdd()
 On Error Resume Next
 items.Add "new","newkey"
 number=Err.Number
 Err.Clear
End Sub
Private Sub TryEach()
 Dim item As Variant
 On Error Resume Next
 For Each item In items
  visits=visits+1
 Next
 number=Err.Number
 Err.Clear
End Sub
Private Sub ClearAll()
 Set items=Nothing
End Sub`,optimization);
 h.invoke('Setup');const owners=h.owned().length,ptr=h.vm.memory.read(h.global('items'));
 h.failures.set('allocate',20);h.invoke('TryNew');assert.equal(h.number('number'),7);assert.equal(h.vm.memory.read(h.global('items')),ptr);assert.equal(h.owned().length,owners);
 h.failures.set('allocate',32);h.invoke('TryAdd');assert.equal(h.number('number'),7);assert.equal(h.owned().length,owners);
 h.failures.set('nodeCopy',true);h.invoke('TryAdd');assert.equal(h.number('number'),7);assert.equal(h.owned().length,owners);assert.equal(h.vm.memory.read(ptr+12),1);
 h.failures.set('allocate',16);h.invoke('TryEach');assert.equal(h.number('number'),7);assert.equal(h.number('visits'),0);assert.equal(h.owned().length,owners);
 h.invoke('TryEach');assert.equal(h.number('visits'),1);assert.equal(h.owned().length,owners);
 h.invoke('ClearAll');assert.equal(h.owned().length,0);
 });
 test(`Collection auto-instantiation failures do not turn Nothing comparisons into success O${optimization}`,t=>{
 const h=collectionMachine(t,`Private items As New Collection,number As Long,seen As Long
Private Sub Main()
 On Error Resume Next
 seen=items.Count
 number=Err.Number
 Err.Clear
End Sub
Private Sub ClearAll()
 Set items=Nothing
End Sub`,optimization);
 h.failures.set('allocate',20);h.invoke();assert.equal(h.number('number'),7);assert.equal(h.owned().length,0);h.invoke();assert.equal(h.number('number'),0);assert.equal(h.owned().length,1);h.invoke('ClearAll');assert.equal(h.owned().length,0);
 });
 test(`Collection cursors survive mutation and nested iteration but release on Exit For and GoTo O${optimization}`,t=>{
 const h=collectionMachine(t,`Option Explicit
Private visits As String,inner As Long,afterLoop As Long
Private Sub Main()
 Dim items As New Collection,value As Variant,nested As Variant
 items.Add "a"
 items.Add "c"
 For Each value In items
  visits=visits & value
  If value="a" Then
   items.Add "b",before:=2
   items.Remove 1
  End If
  For Each nested In items
   inner=inner+1
   Exit For
  Next
 Next
 Set items=Nothing
 Dim last As New Collection
 last.Add "release"
 For Each value In last
  Set last=Nothing
  GoTo Finished
 Next
Finished:
 afterLoop=1
End Sub`,optimization);
 h.invoke();assert.equal(h.text('visits'),'abc');assert.equal(h.number('inner'),3);assert.equal(h.number('afterLoop'),1);assert.equal(h.owned().length,1,'only retained global concatenation');
 });
 test(`Collection arguments preserve source evaluation order and pin a replaced receiver O${optimization}`,t=>{
 const h=collectionMachine(t,`Option Explicit
Private receiver As Collection,kept As Collection,sequence As Long,oldCount As Long,newCount As Long,value As String
Private Sub Main()
 Set receiver=New Collection
 Set kept=receiver
 receiver.Add key:=Mark(1,"key"), item:=ReplaceReceiver()
 oldCount=kept.Count
 newCount=receiver.Count
 value=kept("key")
 Set receiver=Nothing
 Set kept=Nothing
End Sub
Private Function Mark(ByVal digit As Long,ByVal value As String) As String
 sequence=sequence*10+digit
 Mark=value
End Function
Private Function ReplaceReceiver() As String
 sequence=sequence*10+2
 Set receiver=New Collection
 ReplaceReceiver="snapshot"
End Function`,optimization);
 h.invoke();assert.equal(h.number('sequence'),12);assert.equal(h.number('oldCount'),1);assert.equal(h.number('newCount'),0);assert.equal(h.text('value'),'snapshot');assert.equal(h.owned().length,1);
 });
}
for(const optimization of [0,1,2])test(`recursive Collection return names are calls, while chained results support default Item O${optimization}`,t=>{
 const h=collectionMachine(t,`Private result As String
Private Sub Main()
 Dim c As Collection
 Set c=Make(3)
 result=c(1) & Make(2)(1)
 Set c=Nothing
End Sub
Private Function Make(ByVal depth As Long) As Collection
 If depth=0 Then
  Set Make=New Collection
  Make.Add "x"
 Else
  Set Make=Make(depth-1)
 End If
End Function`,optimization);
 h.invoke();assert.equal(h.text('result'),'xx');assert.equal(h.owned().length,1);
});
