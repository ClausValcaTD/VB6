/** Sparse 15-bit runtime control indices: 128 lazily allocated 256-entry pages.
 * Lookup reads a directory pointer and then one element, without allocation.
 * Count and bounds are cached; empty pages are reclaimed immediately. The VB
 * service is compiled to IA-32, not embedded as an interpreter in the EXE. */
export const CONTROL_INDEX_BYTES=528;
export const CONTROL_INDEX_KERNEL=String.raw`
Private Function IndexFind(ByVal directory As Long,ByVal index As Long) As Long
 Dim page As Long
 If index<0 Or index>32767 Then Error 340
 page=Word(directory,(index\256)*4)
 If page<>0 Then IndexFind=Word(page,(index And 255)*4)
End Function
Private Sub IndexInsert(ByVal directory As Long,ByVal index As Long,ByVal value As Long)
 Dim page As Long,offset As Long,count As Long
 If value=0 Then Error 5
 If IndexFind(directory,index)<>0 Then Error 360
 offset=(index\256)*4
 page=Word(directory,offset)
 If page=0 Then
  page=Allocate(1028)
  PutWord directory,offset,page
 End If
 PutWord page,(index And 255)*4,value
 PutWord page,1024,Word(page,1024)+1
 count=Word(directory,512)
 If count=0 Or index<Word(directory,516) Then PutWord directory,516,index
 If count=0 Or index>Word(directory,520) Then PutWord directory,520,index
 PutWord directory,512,count+1
End Sub
Private Function IndexBoundary(ByVal directory As Long,ByVal direction As Long) As Long
 Dim p As Long,i As Long,page As Long
 If direction=1 Then p=0 Else p=127
 Do While p>=0 And p<128
  page=Word(directory,p*4)
  If page<>0 Then
   If direction=1 Then i=0 Else i=255
   Do While i>=0 And i<256
    If Word(page,i*4)<>0 Then
     IndexBoundary=p*256+i
     Exit Function
    End If
    i=i+direction
   Loop
  End If
  p=p+direction
 Loop
 IndexBoundary=-1
End Function
Private Function IndexRemove(ByVal directory As Long,ByVal index As Long) As Long
 Dim page As Long,offset As Long,count As Long
 IndexRemove=IndexFind(directory,index)
 If IndexRemove=0 Then Exit Function
 offset=(index\256)*4
 page=Word(directory,offset)
 PutWord page,(index And 255)*4,0
 count=Word(page,1024)-1
 PutWord page,1024,count
 If count=0 Then
  PutWord directory,offset,0
  Free page
 End If
 count=Word(directory,512)-1
 PutWord directory,512,count
 If count=0 Then
  PutWord directory,516,-1
  PutWord directory,520,-1
 Else
  If index=Word(directory,516) Then PutWord directory,516,IndexBoundary(directory,1)
  If index=Word(directory,520) Then PutWord directory,520,IndexBoundary(directory,-1)
 End If
End Function
Private Sub IndexClear(ByVal directory As Long)
 Dim i As Long,page As Long
 For i=0 To 127
  page=Word(directory,i*4)
  PutWord directory,i*4,0
  Free page
 Next
 PutWord directory,512,0
 PutWord directory,516,-1
 PutWord directory,520,-1
End Sub
`;
