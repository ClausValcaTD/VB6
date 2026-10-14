/** Real Windows modal InputBox acceptance. A same-process timer supplies text
 * and button messages to the actual #32770 dialog while DialogBox pumps. No
 * generated helper or user32 entry is replaced, hooked, or skipped by this test.
 */
export function nativeInputBoxFixture(fixture){
 const {project,add,check,finish}=fixture('AotControlInputBox');
 add('Dim answer As String,n As Long\nInputDriver.Prepare "Zażółć Ω 中",1\nanswer=InputBox("Prompt & text" & vbCrLf & "Second line",InputDriver.DialogTitle,"default")');
 check('answer="Zażółć Ω 中" And InputDriver.Fired=1 And InputDriver.DriverError=0','native modal dialog returns Unicode entered through its actual EDIT window');
 check('InputDriver.Limit=255 And InputDriver.ChildCount=4','the real dialog has all four native controls and the documented 255-unit edit limit');
 add('InputDriver.Prepare "not returned",2\nanswer=InputBox("Cancel",InputDriver.DialogTitle,"default")');
 check('answer="" And InputDriver.DriverError=0','native Cancel returns a zero-length String');
 add('InputDriver.Prepare "not returned",16\nanswer=InputBox("Close",InputDriver.DialogTitle)');
 check('answer="" And InputDriver.DriverError=0','native close command follows the cancel result');
 add('InputDriver.Prepare String$(255,"x"),1\nanswer=InputBox("Limit",InputDriver.DialogTitle)');
 check('Len(answer)=254 And answer=String$(254,"x")','return value is truncated at 254 UTF-16 units');
 add('InputDriver.Prepare "first" & vbCrLf & "second",1\nanswer=InputBox("Paste",InputDriver.DialogTitle)');
 check('answer="first"','native edit text containing a pasted line break stops at that break');
 add('InputDriver.Prepare "",0\nanswer=InputBox("Default",InputDriver.DialogTitle,"retained default")');
 check('answer="retained default"','OK without replacing EDIT text returns the authored default');
 add('InputDriver.Prepare "",0\nanswer=InputBox(prompt:="Position",title:=InputDriver.DialogTitle,default:="positioned",ypos:=2880,xpos:=1440)');
 check('answer="positioned" And InputDriver.X=InputDriver.DpiX And InputDriver.Y=2*InputDriver.DpiY','named positions use twips converted with the actual screen DPI');
 add('InputDriver.Prepare "",0\nanswer=InputBox("Reopen",InputDriver.DialogTitle,"another")');
 check('answer="another" And InputDriver.DriverError=0','reopening does not reuse a previous call result or state');
 check('InputDriver.TimerID=0 And InputDriver.Fired=8','every actual dialog was answered and its timer released');
 const result=finish();
 project.modules.push(nativeInputBoxDriver());
 return result;
}

/** Reusable same-process real-dialog driver for source-preserving samples. */
export function nativeInputBoxDriver(dialogTitle='InputBox native acceptance'){
 return {id:'native-input-driver',name:'InputDriver',kind:'module',code:`Option Explicit
Public Const DialogTitle As String="${String(dialogTitle).replaceAll('"','""')}"
Public Fired As Long,DriverError As Long,TimerID As Long,Limit As Long,ChildCount As Long
Public X As Long,Y As Long,DpiX As Long,DpiY As Long
Private NextText As String,NextAction As Long
Private Type RECT
 left As Long
 top As Long
 right As Long
 bottom As Long
End Type
Private Declare Function SetTimer Lib "user32" (ByVal hwnd As Long,ByVal id As Long,ByVal interval As Long,ByVal callback As Long) As Long
Private Declare Function KillTimer Lib "user32" (ByVal hwnd As Long,ByVal id As Long) As Long
Private Declare Function FindWindowW Lib "user32" (ByVal className As Long,ByVal title As Long) As Long
Private Declare Function GetWindowThreadProcessId Lib "user32" (ByVal hwnd As Long,process As Long) As Long
Private Declare Function GetCurrentProcessId Lib "kernel32" () As Long
Private Declare Function GetDlgItem Lib "user32" (ByVal hwnd As Long,ByVal id As Long) As Long
Private Declare Function SendMessageW Lib "user32" (ByVal hwnd As Long,ByVal message As Long,ByVal w As Long,ByVal l As Long) As Long
Private Declare Function SetDlgItemTextW Lib "user32" (ByVal hwnd As Long,ByVal id As Long,ByVal value As Long) As Long
Private Declare Function PostMessageW Lib "user32" (ByVal hwnd As Long,ByVal message As Long,ByVal w As Long,ByVal l As Long) As Long
Private Declare Function GetWindowRect Lib "user32" (ByVal hwnd As Long,rect As RECT) As Long
Private Declare Function GetDC Lib "user32" (ByVal hwnd As Long) As Long
Private Declare Function ReleaseDC Lib "user32" (ByVal hwnd As Long,ByVal dc As Long) As Long
Private Declare Function GetDeviceCaps Lib "gdi32" (ByVal dc As Long,ByVal index As Long) As Long
Public Sub Prepare(ByVal text As String,ByVal action As Long)
 NextText=text
 NextAction=action
 TimerID=SetTimer(0,0,25,AddressOf Pulse)
 If TimerID=0 Then Error 7
End Sub
Private Sub Pulse(ByVal hwnd As Long,ByVal message As Long,ByVal id As Long,ByVal ticks As Long)
 Dim dialog As Long,process As Long,n As Long,rect As RECT,dc As Long
 dialog=FindWindowW(StrPtr("#32770"),StrPtr(DialogTitle))
 If dialog=0 Then Exit Sub
 n=GetWindowThreadProcessId(dialog,process)
 If process<>GetCurrentProcessId() Then Exit Sub
 n=KillTimer(0,id)
 TimerID=0
 Fired=Fired+1
 ChildCount=0
 If GetDlgItem(dialog,1001)<>0 Then ChildCount=ChildCount+1
 If GetDlgItem(dialog,1002)<>0 Then ChildCount=ChildCount+1
 If GetDlgItem(dialog,1)<>0 Then ChildCount=ChildCount+1
 If GetDlgItem(dialog,2)<>0 Then ChildCount=ChildCount+1
 Limit=SendMessageW(GetDlgItem(dialog,1002),&HD5,0,0)
 If NextAction=1 Then
  n=SetDlgItemTextW(dialog,1002,StrPtr(NextText))
  If n=0 Then DriverError=1
 End If
 n=GetWindowRect(dialog,rect)
 X=rect.left
 Y=rect.top
 dc=GetDC(0)
 DpiX=GetDeviceCaps(dc,88)
 DpiY=GetDeviceCaps(dc,90)
 n=ReleaseDC(0,dc)
 If NextAction=16 Then
  n=PostMessageW(dialog,&H10,0,0)
 ElseIf NextAction=2 Then
  n=PostMessageW(dialog,&H111,2,0)
 Else
  n=PostMessageW(dialog,&H111,1,0)
 End If
 If n=0 Then DriverError=2
End Sub`};
}
