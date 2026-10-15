/** Locale-independent Write # records, emitted as ordinary private VB/x86.
 * Delimiters are the VBA interchange format, not RFC 4180 CSV. In particular,
 * embedded quotation marks are preserved, not doubled into a different format.
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/writestatement
 */
import {mem32} from './x86-operands.js';
const arg=argument=>({argument}),slot=v=>mem32({base:'ebp',displacement:v.offset});
export const NATIVE_WRITE_SOURCE=`Option Explicit
Private Declare Function VariantChangeTypeEx Lib "oleaut32" (ByVal destination As Long, ByVal source As Long, ByVal locale As Long, ByVal flags As Integer, ByVal target As Integer) As Long
Private Function TwoDigits(ByVal value As Long) As String
 TwoDigits=Right$("0" & CStr(value),2)
End Function
Private Function Field(ByVal value As Variant) As String
 Dim kind As Long, converted As Variant, result As String, hr As Long, d As Date
 kind=VarType(value)
 Select Case kind
 Case 0
  Field=""
 Case 1
  Field="#NULL#"
 Case 8
  Field=Chr$(34) & CStr(value) & Chr$(34)
 Case 11
  If CBool(value) Then
   Field="#TRUE#"
  Else
   Field="#FALSE#"
  End If
 Case 10
  Field="#ERROR " & Mid$(CStr(value),7) & "#"
 Case 7
  d=CDate(value)
  If Fix(CDbl(d))<>0 Then result=Right$("000" & CStr(Year(d)),4) & "-" & TwoDigits(Month(d)) & "-" & TwoDigits(Day(d))
  If Hour(d)<>0 Or Minute(d)<>0 Or Second(d)<>0 Or result="" Then
   If result<>"" Then result=result & " "
   result=result & TwoDigits(Hour(d)) & ":" & TwoDigits(Minute(d)) & ":" & TwoDigits(Second(d))
  End If
  Field="#" & result & "#"
 Case 2,3,4,5,6,14,17
  ' Fixed en-US LCID plus NOUSEROVERRIDE: never use a user decimal separator.
  hr=VariantChangeTypeEx(VarPtr(converted),VarPtr(value),1033,4,8)
  If hr<0 Then
   If hr=&H8007000E Then Err.Raise 7
   If hr=&H8002000A Then Err.Raise 6
   Err.Raise 13
  End If
  Field=CStr(converted)
 Case Else
  Err.Raise 13
 End Select
End Function`;
function kernel(c){return c.nativeWriteKernel ||= c.privateNativeKernel('NativeWriteRecord',NATIVE_WRITE_SOURCE);}
export function nativeWriteImage(c,instruction){
 const x=c.x,out=c.temporaryString(),position=c.arrayWorkspace(4,'write-column');
 c.clearStringStorage(out);
 const append=()=>{
  x.push().push(arg(out.offset)).call('native:string:concat');c.ownString();
  x.push();c.rawStorageAddress(out);x.push().call('native:string:assign');
 };
 for(const [index,expr] of instruction.exprs.entries()){
  if(index){x.value(c.string(','));append();}
  c.invokePrivateNative(kernel(c),'Field',[expr]);append();
 }
 x.value(c.string('\r\n'));append();x.mov(slot(position),0).value(arg(out.offset));
 return {out,position};
}
