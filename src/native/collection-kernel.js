/** Owned ordered Collection service, compiled to IA-32, not interpreted in a PE.
 * Header: refs, first, last, count, iterators. Node: next, previous, key BSTR,
 * key-present flag, owned VARIANT. Cursor: owner, next node, next/previous cursor.
 * Pointer access and VARIANT/String ownership bridges are generated host thunks.
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/collection-object
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/add-method-visual-basic-for-applications
 */
export const COLLECTION_KERNEL=String.raw`Option Explicit
Private Const vbString As Long=8
Private Const vbTextCompare As Long=1
Private Declare Function GetProcessHeap Lib "kernel32" () As Long
Private Declare Function HeapAlloc Lib "kernel32" (ByVal heap As Long, ByVal flags As Long, ByVal bytes As Long) As Long
Private Declare Function HeapFree Lib "kernel32" (ByVal heap As Long, ByVal flags As Long, ByVal address As Long) As Long
Private Function Word(ByVal address As Long, ByVal offset As Long) As Long
End Function
Private Sub PutWord(ByVal address As Long, ByVal offset As Long, ByVal value As Long)
End Sub
Private Sub NodeKeySet(ByVal node As Long, ByVal key As String)
End Sub
Private Function NodeKey(ByVal node As Long) As String
End Function
Private Sub NodePut(ByVal node As Long, ByVal value As Variant)
End Sub
Private Function NodeGet(ByVal node As Long) As Variant
End Function
Private Sub NodeClear(ByVal node As Long)
End Sub
Private Function Allocate(ByVal size As Long) As Long
 Allocate=HeapAlloc(GetProcessHeap(),8,size)
 If Allocate=0 Then Error 7
End Function
Private Sub Free(ByVal address As Long)
 Dim n As Long
 If address<>0 Then n=HeapFree(GetProcessHeap(),0,address)
End Sub
Private Sub Require(ByVal receiver As Long)
 If receiver=0 Then Error 91
 If Word(receiver,0)<1 Then Error 91
End Sub
Private Function CollectionNew() As Long
 Dim receiver As Long
 receiver=Allocate(20)
 PutWord receiver,0,1
 CollectionNew=receiver
End Function
Private Function CollectionRetain(ByVal receiver As Long) As Long
 Dim refs As Long
 If receiver<>0 Then
  Require receiver
  refs=Word(receiver,0)
  If refs=&H7FFFFFFF Then Error 6
  PutWord receiver,0,refs+1
 End If
 CollectionRetain=receiver
End Function
Private Sub CollectionRelease(ByVal receiver As Long)
 Dim refs As Long,node As Long,following As Long
 If receiver=0 Then Exit Sub
 Require receiver
 refs=Word(receiver,0)-1
 PutWord receiver,0,refs
 If refs<>0 Then Exit Sub
 node=Word(receiver,4)
 Do While node<>0
  following=Word(node,0)
  NodeClear node
  Free node
  node=following
 Loop
 Free receiver
End Sub
Private Function CollectionCount(ByVal receiver As Long) As Long
 Require receiver
 CollectionCount=Word(receiver,12)
End Function
Private Function FindKey(ByVal receiver As Long,ByVal key As String) As Long
 Dim node As Long
 node=Word(receiver,4)
 Do While node<>0
  If Word(node,12)<>0 Then
   If StrComp(NodeKey(node),key,vbTextCompare)=0 Then
    FindKey=node
    Exit Function
   End If
  End If
  node=Word(node,0)
 Loop
End Function
Private Function Resolve(ByVal receiver As Long,ByVal index As Variant) As Long
 Dim node As Long,n As Long,count As Long
 Require receiver
 If VarType(index)=vbString Then
  node=FindKey(receiver,CStr(index))
  If node=0 Then Error 5
 Else
  n=CLng(index)
  count=Word(receiver,12)
  If n<1 Or n>count Then Error 5
  If n<=count\2 Then
   node=Word(receiver,4)
   Do While n>1
    node=Word(node,0)
    n=n-1
   Loop
  Else
   node=Word(receiver,8)
   Do While n<count
    node=Word(node,4)
    n=n+1
   Loop
  End If
 End If
 Resolve=node
End Function
Private Function CollectionItem(ByVal receiver As Long,ByVal index As Variant) As Variant
 CollectionItem=NodeGet(Resolve(receiver,index))
End Function
Private Sub CollectionAdd(ByVal receiver As Long,ByVal item As Variant,Optional ByVal key As Variant,Optional ByVal before As Variant,Optional ByVal after As Variant)
 Dim node As Long,previous As Long,following As Long,hasKey As Boolean,text As String,code As Long,cursor As Long
 Require receiver
 If Word(receiver,12)>=1000000 Then Error 7
 If Not IsMissing(before) And Not IsMissing(after) Then Error 5
 If Not IsMissing(key) Then
  text=CStr(key)
  hasKey=True
  If FindKey(receiver,text)<>0 Then Error 457
 End If
 If Not IsMissing(before) Then
  following=Resolve(receiver,before)
  previous=Word(following,4)
 ElseIf Not IsMissing(after) Then
  previous=Resolve(receiver,after)
  following=Word(previous,0)
 Else
  previous=Word(receiver,8)
 End If
 On Error GoTo Failed
 node=Allocate(32)
 If hasKey Then
  NodeKeySet node,text
  PutWord node,12,-1
 End If
 NodePut node,item
 ' No caller code runs after cloning. Publish links only after all owners exist.
 PutWord node,4,previous
 PutWord node,0,following
 If previous=0 Then PutWord receiver,4,node Else PutWord previous,0,node
 If following=0 Then PutWord receiver,8,node Else PutWord following,4,node
 PutWord receiver,12,Word(receiver,12)+1
 ' Active cursors are stable across insertions/removals; their next value is
 ' still captured before entering an authored loop body.
 cursor=Word(receiver,16)
 Do While cursor<>0
  If Word(cursor,4)=following Then PutWord cursor,4,node
  cursor=Word(cursor,8)
 Loop
 Exit Sub
Failed:
 code=Err.Number
 If node<>0 Then
  NodeClear node
  Free node
 End If
 Error code
End Sub
Private Sub CollectionRemove(ByVal receiver As Long,ByVal index As Variant)
 Dim node As Long,previous As Long,following As Long,cursor As Long
 node=Resolve(receiver,index)
 previous=Word(node,4)
 following=Word(node,0)
 NodeClear node
 If previous=0 Then PutWord receiver,4,following Else PutWord previous,0,following
 If following=0 Then PutWord receiver,8,previous Else PutWord following,4,previous
 PutWord receiver,12,Word(receiver,12)-1
 cursor=Word(receiver,16)
 Do While cursor<>0
  If Word(cursor,4)=node Then PutWord cursor,4,following
  cursor=Word(cursor,8)
 Loop
 Free node
End Sub
Private Function CollectionCursor(ByVal receiver As Long) As Long
 Dim cursor As Long,head As Long,n As Long
 Require receiver
 If Word(receiver,0)=&H7FFFFFFF Then Error 6
 cursor=Allocate(16)
 n=CollectionRetain(receiver)
 head=Word(receiver,16)
 PutWord cursor,0,receiver
 PutWord cursor,4,Word(receiver,4)
 PutWord cursor,8,head
 If head<>0 Then PutWord head,12,cursor
 PutWord receiver,16,cursor
 CollectionCursor=cursor
End Function
Private Function CursorNext(ByVal cursor As Long,ByRef value As Variant) As Boolean
 Dim node As Long
 node=Word(cursor,4)
 If node=0 Then Exit Function
 value=NodeGet(node)
 PutWord cursor,4,Word(node,0)
 CursorNext=True
End Function
Private Sub CursorRelease(ByVal cursor As Long)
 Dim receiver As Long,previous As Long,following As Long
 If cursor=0 Then Exit Sub
 receiver=Word(cursor,0)
 previous=Word(cursor,12)
 following=Word(cursor,8)
 If previous=0 Then PutWord receiver,16,following Else PutWord previous,8,following
 If following<>0 Then PutWord following,12,previous
 Free cursor
 CollectionRelease receiver
End Sub
`;
