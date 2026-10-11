import {CONTROL_INDEX_KERNEL} from './control-index-kernel.js';
/** Runtime intrinsic HWNDs use owned, invalidatable reference records.
 * Node[192]: refs, HWND, state*, index-directory*, Index, flags, registry*,
 * prev,next,name-BSTR,kind,ID,parent,subclass*,designer-HWND-slot*,linked.
 * Its owned common state starts at 64 and font state at 144. Designer state is
 * borrowed. Registry[24]: first,last,count,form-HWND-slot*,closing,next-ID.
 * No owned node is reclaimed while an authored expression or callback holds it.
 */
export const DYNAMIC_CONTROL_KERNEL=String.raw`Option Explicit
Private Type NativeRect
 left As Long
 top As Long
 right As Long
 bottom As Long
End Type
Private Type NativeFont
 height As Long
 width As Long
 escapement As Long
 orientation As Long
 weight As Long
 flags As Long
 flags2 As Long
 face(0 To 31) As Integer
End Type
Private Declare Function GetProcessHeap Lib "kernel32" () As Long
Private Declare Function HeapAlloc Lib "kernel32" (ByVal heap As Long,ByVal flags As Long,ByVal bytes As Long) As Long
Private Declare Function HeapFree Lib "kernel32" (ByVal heap As Long,ByVal flags As Long,ByVal value As Long) As Long
Private Declare Function IsWindow Lib "user32" (ByVal hwnd As Long) As Long
Private Declare Function GetParent Lib "user32" (ByVal hwnd As Long) As Long
Private Declare Function IsChild Lib "user32" (ByVal parent As Long,ByVal child As Long) As Long
Private Declare Function GetDlgItem Lib "user32" (ByVal parent As Long,ByVal id As Long) As Long
Private Declare Function GetWindowLongW Lib "user32" (ByVal hwnd As Long,ByVal index As Long) As Long
Private Declare Function SetWindowLongW Lib "user32" (ByVal hwnd As Long,ByVal index As Long,ByVal value As Long) As Long
Private Declare Function GetWindowRect Lib "user32" (ByVal hwnd As Long,bounds As NativeRect) As Long
Private Declare Function MapWindowPoints Lib "user32" (ByVal from As Long,ByVal target As Long,bounds As NativeRect,ByVal count As Long) As Long
Private Declare Function SendMessageW Lib "user32" (ByVal hwnd As Long,ByVal message As Long,ByVal wp As Long,ByVal lp As Long) As Long
Private Declare Function CreateWindowExW Lib "user32" (ByVal ex As Long,ByVal classname As Long,ByVal title As Long,ByVal style As Long,ByVal left As Long,ByVal top As Long,ByVal width As Long,ByVal height As Long,ByVal parent As Long,ByVal id As Long,ByVal instance As Long,ByVal parameter As Long) As Long
Private Declare Function DestroyWindow Lib "user32" (ByVal hwnd As Long) As Long
Private Declare Function GetModuleHandleW Lib "kernel32" (ByVal name As Long) As Long
Private Declare Function SetPropW Lib "user32" (ByVal hwnd As Long,ByVal name As Long,ByVal value As Long) As Long
Private Declare Function GetPropW Lib "user32" (ByVal hwnd As Long,ByVal name As Long) As Long
Private Declare Function RemovePropW Lib "user32" (ByVal hwnd As Long,ByVal name As Long) As Long
Private Declare Function SetWindowSubclass Lib "comctl32" (ByVal hwnd As Long,ByVal procedure As Long,ByVal id As Long,ByVal value As Long) As Long
Private Declare Function RemoveWindowSubclass Lib "comctl32" (ByVal hwnd As Long,ByVal procedure As Long,ByVal id As Long) As Long
Private Declare Function GetStockObject Lib "gdi32" (ByVal index As Long) As Long
Private Declare Function GetObjectW Lib "gdi32" (ByVal handle As Long,ByVal bytes As Long,font As NativeFont) As Long
Private Declare Function CreateFontIndirectW Lib "gdi32" (font As NativeFont) As Long
Private Declare Function DeleteObject Lib "gdi32" (ByVal object As Long) As Long
Private Const ReferenceName As String="VB6.Native.ControlReference"
Private Function Word(ByVal address As Long,ByVal offset As Long) As Long
End Function
Private Sub PutWord(ByVal address As Long,ByVal offset As Long,ByVal value As Long)
End Sub
Private Sub CopyBytes(ByVal target As Long,ByVal source As Long,ByVal count As Long)
End Sub
Private Sub SetString(ByVal target As Long,ByVal value As String)
End Sub
Private Function ReadString(ByVal target As Long) As String
End Function
Private Sub ClearString(ByVal target As Long)
End Sub
Private Function NameEquals(ByVal node As Long,ByVal name As Long) As Boolean
End Function
Private Function WindowText(ByVal hwnd As Long) As String
End Function
Private Function ClassName(ByVal kind As Long) As String
End Function
Private Function DefaultStyle(ByVal kind As Long) As Long
End Function
Private Function DefaultEx(ByVal kind As Long) As Long
End Function
Private Function DefaultWidth(ByVal kind As Long) As Long
End Function
Private Function DefaultHeight(ByVal kind As Long) As Long
End Function
Private Function KindName(ByVal kind As Long) As String
End Function
Private Function Allocate(ByVal bytes As Long) As Long
 Allocate=HeapAlloc(GetProcessHeap(),8,bytes)
 If Allocate=0 Then Error 7
End Function
Private Sub Free(ByVal address As Long)
 Dim n As Long
 If address<>0 Then n=HeapFree(GetProcessHeap(),0,address)
End Sub
Private Function Retain(ByVal node As Long) As Long
 If node<>0 Then
  If Word(node,0)=&H7FFFFFFF Then Error 6
  PutWord node,0,Word(node,0)+1
 End If
 Retain=node
End Function
Private Sub Release(ByVal node As Long)
 Dim count As Long
 If node=0 Then Exit Sub
 count=Word(node,0)-1
 PutWord node,0,count
 If count<>0 Then Exit Sub
 ClearString node+36
 Free node
End Sub
Private Function Require(ByVal node As Long) As Long
 If node=0 Then Error 91
 Require=Word(node,4)
 If Require=0 Then Error 91
End Function
Private Function RegistryWindow(ByVal registry As Long) As Long
 If Word(registry,16)<>0 Then Error 91
 RegistryWindow=Word(Word(registry,12),0)
 If RegistryWindow=0 Then Error 91
 If IsWindow(RegistryWindow)=0 Then Error 91
End Function
Private Sub Link(ByVal node As Long)
 Dim registry As Long,previous As Long,n As Long
 registry=Word(node,24)
 previous=Word(registry,4)
 n=Retain(node)
 PutWord node,28,previous
 If previous=0 Then PutWord registry,0,node Else PutWord previous,32,node
 PutWord registry,4,node
 PutWord registry,8,Word(registry,8)+1
 PutWord node,60,1
End Sub
Private Sub Unlink(ByVal node As Long)
 Dim registry As Long,previous As Long,following As Long,n As Long,directory As Long
 If Word(node,60)=0 Then Exit Sub
 PutWord node,60,0
 registry=Word(node,24)
 previous=Word(node,28)
 following=Word(node,32)
 If previous=0 Then PutWord registry,0,following Else PutWord previous,32,following
 If following=0 Then PutWord registry,4,previous Else PutWord following,28,previous
 PutWord registry,8,Word(registry,8)-1
 directory=Word(node,12)
 If directory<>0 Then
  If IndexFind(directory,Word(node,16))=node Then n=IndexRemove(directory,Word(node,16))
 End If
 PutWord node,28,0
 PutWord node,32,0
 Release node
End Sub
Private Sub DisposeState(ByVal node As Long)
 Dim state As Long,font As Long,n As Long
 state=Word(node,8)
 PutWord node,8,0
 If state=0 Or (Word(node,20) And 1)<>0 Then Exit Sub
 ClearString state+28
 n=Word(state,64)
 If n<>0 Then n=DeleteObject(n)
 PutWord state,64,0
 font=Word(state,72)
 If font<>0 Then
  n=Word(font,0)
  PutWord font,0,0
  If n<>0 Then n=DeleteObject(n)
  ClearString font+4
 End If
End Sub
Private Sub Detach(ByVal node As Long)
 Dim hwnd As Long,n As Long,keep As Long,address As Long
 keep=Retain(node)
 hwnd=Word(node,4)
 PutWord node,4,0
 If hwnd<>0 Then
  If GetPropW(hwnd,StrPtr(ReferenceName))=node Then n=RemovePropW(hwnd,StrPtr(ReferenceName))
  n=RemoveWindowSubclass(hwnd,Word(node,52),1)
 End If
 address=Word(node,56)
 If address<>0 Then
  If Word(address,0)=hwnd Then PutWord address,0,0
 End If
 Unlink node
 DisposeState node
 Release keep
End Sub
Private Sub AbortNode(ByVal node As Long)
 Dim hwnd As Long,n As Long
 If node=0 Then Exit Sub
 hwnd=Word(node,4)
 If hwnd<>0 Then
  n=RemoveWindowSubclass(hwnd,Word(node,52),1)
  n=RemovePropW(hwnd,StrPtr(ReferenceName))
  PutWord node,4,0
  n=DestroyWindow(hwnd)
 End If
 Unlink node
 DisposeState node
 Release node
End Sub
Private Function Reference(ByVal hwnd As Long) As Long
 Dim node As Long
 node=GetPropW(hwnd,StrPtr(ReferenceName))
 If node=0 Then Error 91
 If Word(node,4)<>hwnd Then Error 91
 Reference=Retain(node)
End Function
Private Function FindName(ByVal registry As Long,ByVal name As String) As Long
 Dim node As Long,chars As Long
 chars=StrPtr(name)
 node=Word(registry,0)
 Do While node<>0
  If NameEquals(node,chars) Then
   FindName=node
   Exit Function
  End If
  node=Word(node,32)
 Loop
End Function
Private Function Item(ByVal registry As Long,ByVal index As Variant) As Long
 Dim node As Long,n As Long,hwnd As Long
 hwnd=RegistryWindow(registry)
 If VarType(index)=8 Then
  node=FindName(registry,CStr(index))
 Else
  n=CLng(index)
  If n<0 Or n>=Word(registry,8) Then Error 35601
  node=Word(registry,0)
  Do While n>0
   node=Word(node,32)
   n=n-1
  Loop
 End If
 If node=0 Then Error 35601
 Item=Retain(node)
End Function
Private Sub Attach(ByVal node As Long)
 Dim hwnd As Long,n As Long
 hwnd=Require(node)
 If GetPropW(hwnd,StrPtr(ReferenceName))<>0 Then Error 5
 If SetPropW(hwnd,StrPtr(ReferenceName),node)=0 Then Error 7
 If SetWindowSubclass(hwnd,Word(node,52),1,node)=0 Then
  n=RemovePropW(hwnd,StrPtr(ReferenceName))
  Error 7
 End If
End Sub
Private Sub Register(ByVal registry As Long,ByVal directory As Long,ByVal index As Long,ByVal name As String,ByVal kind As Long,ByVal hwnd As Long,ByVal state As Long,ByVal callback As Long,ByVal address As Long)
 Dim node As Long,code As Long
 On Error GoTo Failed
 node=Allocate(192)
 PutWord node,0,1
 PutWord node,4,hwnd
 PutWord node,8,state
 PutWord node,12,directory
 PutWord node,16,index
 PutWord node,20,1
 PutWord node,24,registry
 PutWord node,40,kind
 PutWord node,52,callback
 PutWord node,56,address
 SetString node+36,name
 If hwnd<>0 Then Attach node
 If directory<>0 Then IndexInsert directory,index,node
 Link node
 Release node
 Exit Sub
Failed:
 code=Err.Number
 If node<>0 Then
  ' Borrowed designer HWNDs must not be destroyed by failed registration.
  Detach node
  Release node
 End If
 Error code
End Sub
Private Function NextId(ByVal registry As Long,ByVal parent As Long) As Long
 Dim candidate As Long,attempt As Long
 candidate=Word(registry,20)
 For attempt=1 To 65436
  If candidate<100 Or candidate>65535 Then candidate=100
  PutWord registry,20,candidate+1
  If GetDlgItem(parent,candidate)=0 Then
   NextId=candidate
   Exit Function
  End If
  candidate=candidate+1
 Next
 Error 7
End Function
Private Function Make(ByVal registry As Long,ByVal directory As Long,ByVal index As Long,ByVal name As String,ByVal kind As Long,ByVal parent As Long,ByVal source As Long,ByVal callback As Long) As Long
 Dim node As Long,hwnd As Long,state As Long,oldState As Long,font As Long,oldFont As Long,hfont As Long,n As Long,code As Long,owner As Long,id As Long,generation As Long
 Dim bounds As NativeRect,lf As NativeFont,style As Long,ex As Long,caption As String,cls As String
 owner=RegistryWindow(registry)
 generation=Word(registry,24)
 If Word(registry,8)>=32768 Then Error 7
 If parent=0 Then parent=owner
 If parent<>owner Then
  If IsChild(owner,parent)=0 Then Error 5
 End If
 If Len(name)=0 Or Len(name)>255 Or InStr(1,name,ChrW$(0))<>0 Then Error 5
 If directory=0 Then
  If FindName(registry,name)<>0 Then Error 457
 End If
 On Error GoTo Failed
 node=Allocate(192)
 PutWord node,0,1
 PutWord node,12,directory
 PutWord node,16,index
 PutWord node,20,2
 PutWord node,24,registry
 PutWord node,40,kind
 PutWord node,48,parent
 PutWord node,52,callback
 SetString node+36,name
 state=node+64
 font=node+144
 PutWord node,8,state
 PutWord state,72,font
 PutWord state,32,&H8000000F
 PutWord state,36,&H80000008
 PutWord state,68,1
 If kind=1 Then PutWord state,68,0
 If kind=3 Then PutWord state,32,&H80000005
 bounds.right=DefaultWidth(kind)
 bounds.bottom=DefaultHeight(kind)
 style=DefaultStyle(kind)
 ex=DefaultEx(kind)
 hfont=SendMessageW(parent,&H31,0,0)
 If hfont=0 Then hfont=GetStockObject(17)
 If source<>0 Then
  hwnd=Require(source)
  If GetWindowRect(hwnd,bounds)=0 Then Error 5
  n=MapWindowPoints(0,parent,bounds,2)
  style=GetWindowLongW(hwnd,-16) And Not &H10000000
  ex=GetWindowLongW(hwnd,-20)
  caption=WindowText(hwnd)
  hfont=SendMessageW(hwnd,&H31,0,0)
  If hfont=0 Then hfont=GetStockObject(17)
  oldState=Word(source,8)
  If oldState<>0 Then
   CopyBytes state,oldState,76
   PutWord state,28,0
   PutWord state,64,0
   PutWord state,72,font
   SetString state+28,ReadString(oldState+28)
   oldFont=Word(oldState,72)
   If oldFont<>0 Then
    CopyBytes font,oldFont,48
    PutWord font,0,0
    PutWord font,4,0
    PutWord font,8,0
    SetString font+4,ReadString(oldFont+4)
   End If
  End If
 End If
 If GetObjectW(hfont,92,lf)=0 Then Error 5
 hfont=CreateFontIndirectW(lf)
 If hfont=0 Then Error 7
 PutWord font,0,hfont
 If Word(font,4)=0 Then
  SetString font+4,"MS Sans Serif"
  PutWord font,12,825
  PutWord font,16,lf.weight
  PutWord font,40,0
  PutWord font,44,&H40208000
 End If
 PutWord font,8,1
 cls=ClassName(kind)
 id=NextId(registry,parent)
 PutWord node,44,id
 hwnd=CreateWindowExW(ex,StrPtr(cls),StrPtr(caption),style And Not &H10000000,bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top,parent,id,GetModuleHandleW(0),0)
 If hwnd=0 Then Error 7
 PutWord node,4,hwnd
 n=SetWindowLongW(hwnd,-21,state)
 Attach node
 n=SendMessageW(hwnd,&H30,hfont,0)
 If source<>0 Then
  If kind=4 Or kind=5 Then n=SendMessageW(hwnd,&HF1,SendMessageW(Require(source),&HF0,0,0),0)
  If kind=3 Then
   n=SendMessageW(hwnd,&HC5,SendMessageW(Require(source),&HD5,0,0),0)
   n=SendMessageW(hwnd,&HCC,SendMessageW(Require(source),&HD2,0,0),0)
  End If
 End If
 If RegistryWindow(registry)<>owner Or Word(registry,24)<>generation Or IsWindow(parent)=0 Then Error 91
 n=Require(node)
 If directory<>0 Then
  IndexInsert directory,index,node
 Else
  If FindName(registry,name)<>0 Then Error 457
 End If
 Link node
 Make=node
 Exit Function
Failed:
 code=Err.Number
 AbortNode node
 Error code
End Function
Private Function LoadElement(ByVal registry As Long,ByVal directory As Long,ByVal index As Long,ByVal callback As Long) As Long
 Dim source As Long,hwnd As Long,code As Long
 hwnd=RegistryWindow(registry)
 If IndexFind(directory,index)<>0 Then Error 360
 If Word(directory,512)=0 Then Error 340
 source=Retain(IndexFind(directory,Word(directory,516)))
 On Error GoTo Failed
 hwnd=Require(source)
 LoadElement=Make(registry,directory,index,ReadString(source+36),Word(source,40),GetParent(hwnd),source,callback)
 Release source
 Exit Function
Failed:
 code=Err.Number
 Release source
 Error code
End Function
Private Function ArrayItem(ByVal directory As Long,ByVal index As Long) As Long
 Dim node As Long
 node=IndexFind(directory,index)
 If node=0 Then Error 340
 ArrayItem=Retain(node)
End Function
Private Sub Remove(ByVal node As Long,ByVal arrayOnly As Long)
 Dim hwnd As Long,n As Long
 hwnd=Require(node)
 If (Word(node,20) And 1)<>0 Then Error 362
 If arrayOnly<>0 And Word(node,12)=0 Then Error 361
 If arrayOnly=0 And Word(node,12)<>0 Then Error 5
 n=DestroyWindow(hwnd)
 If n=0 Then Error 5
End Sub
Private Sub CloseRegistry(ByVal registry As Long)
 Dim node As Long,hwnd As Long,n As Long
 PutWord registry,16,1
 node=Word(registry,0)
 Do While node<>0
  n=Retain(node)
  hwnd=Word(node,4)
  ' WM_DESTROY precedes child destruction. Destroy the borrowed designer HWNDs
  ' as well before their form-owned fonts/state can be disposed. Existing
  ' references become invalid, but never point at freed live-HWND state.
  If hwnd<>0 Then
   n=DestroyWindow(hwnd)
   If n=0 Then
    Release node
    Error 5
   End If
  End If
  Detach node
  Release node
  node=Word(registry,0)
 Loop
End Sub
`+CONTROL_INDEX_KERNEL;
