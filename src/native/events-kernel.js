/** Ordered synchronous subscriptions. Connections own nodes; dispatch owns a
 * stack-local active scope, not a heap snapshot. Disconnect leaves tombstones
 * until the outermost raise exits, preventing reentrant traversal of freed nodes.
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/raiseevent-statement
 */
export const EVENTS_KERNEL=String.raw`Option Explicit
Private Declare Function GetProcessHeap Lib "kernel32" () As Long
Private Declare Function HeapAlloc Lib "kernel32" (ByVal heap As Long,ByVal flags As Long,ByVal bytes As Long) As Long
Private Declare Function HeapFree Lib "kernel32" (ByVal heap As Long,ByVal flags As Long,ByVal address As Long) As Long
Private Function Word(ByVal address As Long,ByVal offset As Long) As Long
End Function
Private Sub PutWord(ByVal address As Long,ByVal offset As Long,ByVal value As Long)
End Sub
Private Function Allocate(ByVal bytes As Long) As Long
 Allocate=HeapAlloc(GetProcessHeap(),8,bytes)
 If Allocate=0 Then Error 7
End Function
Private Sub Free(ByVal address As Long)
 Dim result As Long
 If address<>0 Then result=HeapFree(GetProcessHeap(),0,address)
End Sub
' State: head, tail, active dispatches, connected count (16 bytes).
' Node: source, sink owner (borrowed), handler table, next, previous, state.
Private Function Connect(ByVal source As Long,ByVal owner As Long,ByVal table As Long) As Long
 Dim state As Long,node As Long,tail As Long
 If source=0 Then Exit Function
 state=Word(source,12)
 If state=0 Then
  state=Allocate(16)
  PutWord source,12,state
 End If
 If Word(state,12)>=65535 Then Error 7
 node=Allocate(24)
 PutWord node,0,source
 PutWord node,4,owner
 PutWord node,8,table
 PutWord node,20,state
 tail=Word(state,4)
 PutWord node,16,tail
 If tail=0 Then PutWord state,0,node Else PutWord tail,12,node
 PutWord state,4,node
 PutWord state,12,Word(state,12)+1
 Connect=node
End Function
Private Sub Unlink(ByVal node As Long)
 Dim state As Long,previous As Long,following As Long
 state=Word(node,20)
 previous=Word(node,16)
 following=Word(node,12)
 If previous=0 Then PutWord state,0,following Else PutWord previous,12,following
 If following=0 Then PutWord state,4,previous Else PutWord following,16,previous
 Free node
End Sub
Private Sub Disconnect(ByVal node As Long)
 Dim state As Long
 If node=0 Then Exit Sub
 If Word(node,0)=0 Then Exit Sub
 state=Word(node,20)
 PutWord node,0,0
 PutWord node,4,0
 PutWord node,8,0
 PutWord state,12,Word(state,12)-1
 If Word(state,8)=0 Then Unlink node
End Sub
Private Function OpenRaise(ByVal source As Long) As Long
 Dim state As Long,active As Long
 If source=0 Then Error 91
 state=Word(source,12)
 If state=0 Then Exit Function
 If Word(state,12)=0 Then Exit Function
 active=Word(state,8)
 If active=&H7FFFFFFF Then Error 6
 PutWord state,8,active+1
 OpenRaise=state
End Function
Private Sub CloseRaise(ByVal state As Long)
 Dim active As Long,node As Long,following As Long
 If state=0 Then Exit Sub
 active=Word(state,8)-1
 PutWord state,8,active
 If active<>0 Then Exit Sub
 node=Word(state,0)
 Do While node<>0
  following=Word(node,12)
  If Word(node,0)=0 Then Unlink node
  node=following
 Loop
End Sub
Private Sub DisposeSource(ByVal source As Long)
 Dim state As Long
 If source=0 Then Exit Sub
 state=Word(source,12)
 If state=0 Then Exit Sub
 If Word(state,8)<>0 Or Word(state,12)<>0 Then Error 91
 PutWord source,12,0
 Free state
End Sub
`;
