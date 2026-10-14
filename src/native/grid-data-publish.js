/** Transactional grid replacement, compiled as part of the demand-driven native
 * grid kernel. The caller owns cells until the final receiver/version guard.
 * Existing cell text is never re-copied during rebinding. Metadata buffers are
 * prepared off-screen, then all six handles and dimensions publish together.
 */
export const GRID_DATA_PUBLISH_SOURCE=`
Private Sub PublishData(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal expectedVersion As Long, ByRef cells As Long, ByVal rows As Long, ByVal cols As Long)
 Dim widths As Long, heights As Long, rowdata As Long, coldata As Long, alignment As Long
 Dim oldcells As Long, oldwidths As Long, oldheights As Long, oldrowdata As Long, oldcoldata As Long, oldalignment As Long
 Dim i As Long, c As Long, oldCols As Long, code As Long
 Guard id,hwnd,epoch
 If D(Gversion,id)<>expectedVersion Then Err.Raise 5
 If cells=0 Or rows<0 Or rows>100001 Or cols<1 Or cols>10000 Then Err.Raise 380
 If rows>0 Then
  If cols>1048576 \\ rows Then Err.Raise 7
 End If
 oldCols=D(Gcols,id)
 On Error GoTo Failed
 widths=buffernew(cols,3)
 heights=buffernew(rows,3)
 rowdata=buffernew(rows,3)
 coldata=buffernew(cols,3)
 alignment=buffernew(cols,3)
 Guard id,hwnd,epoch
 If D(Gversion,id)<>expectedVersion Then Err.Raise 5
 For c=0 To cols-1
  bufferput widths,c,1200
  If c<oldCols Then
   bufferput widths,c,bufferget(D(Gwidths,id),c)
   bufferput coldata,c,bufferget(D(Gcoldata,id),c)
   bufferput alignment,c,bufferget(D(Galignment,id),c)
  End If
 Next
 For i=0 To rows-1
  bufferput heights,i,315
 Next
 Guard id,hwnd,epoch
 If D(Gversion,id)<>expectedVersion Then Err.Raise 5
 oldcells=D(Gcells,id)
 oldwidths=D(Gwidths,id)
 oldheights=D(Gheights,id)
 oldrowdata=D(Growdata,id)
 oldcoldata=D(Gcoldata,id)
 oldalignment=D(Galignment,id)
 D(Gcells,id)=cells
 cells=0
 D(Gwidths,id)=widths
 widths=0
 D(Gheights,id)=heights
 heights=0
 D(Growdata,id)=rowdata
 rowdata=0
 D(Gcoldata,id)=coldata
 coldata=0
 D(Galignment,id)=alignment
 alignment=0
 D(Grows,id)=rows
 D(Gcols,id)=cols
 D(Gfixedrows,id)=0
 If rows>0 Then D(Gfixedrows,id)=1
 D(Gfixedcols,id)=0
 D(Grow,id)=D(Gfixedrows,id)
 D(Gcol,id)=0
 D(Growsel,id)=D(Grow,id)
 D(Gcolsel,id)=0
 D(Gtoprow,id)=D(Gfixedrows,id)
 D(Gleftcol,id)=0
 Normalize id
 Version id
 bufferfree oldcells
 oldcells=0
 bufferfree oldwidths
 oldwidths=0
 bufferfree oldheights
 oldheights=0
 bufferfree oldrowdata
 oldrowdata=0
 bufferfree oldcoldata
 oldcoldata=0
 bufferfree oldalignment
 oldalignment=0
 Invalidate id
 Exit Sub
Failed:
 code=Err.Number
 On Error Resume Next
 bufferfree widths
 bufferfree heights
 bufferfree rowdata
 bufferfree coldata
 bufferfree alignment
 bufferfree oldcells
 bufferfree oldwidths
 bufferfree oldheights
 bufferfree oldrowdata
 bufferfree oldcoldata
 bufferfree oldalignment
 On Error GoTo 0
 Err.Raise code
End Sub
`;
