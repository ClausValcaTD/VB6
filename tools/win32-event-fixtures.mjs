/** Real Windows synchronous source-event contracts. All assertions run as
 * generated x86; no event/source API is replaced by a JavaScript test hook. */
export function nativeEventFixtures(fixture){return [events(fixture),reentrancy(fixture)];}
function events(fixture){
 const f=fixture('AotControlSourceEvents'),{project,add,check,finish}=f;
 add('Dim p As New Publisher,a As New Sink,b As New Sink,n As Long,s As String,amount As Single,item As Variant\na.id=1:b.id=2\na.Connect p:b.Connect p');
 add('p.Add 3');check('order=12 And observed=6 And p.Value=3','connected class sinks run synchronously in connection order');
 add('p.Add 5');check('order=1212 And observed=6 And p.Value=3','ByRef Boolean cancellation affects the publisher and every subsequent sink');
 add('order=0\na.Connect p\np.Add 1');check('order=21 And p.Value=4','replacing a WithEvents binding disconnects the old connection before later raises');
 add('b.Disconnect\norder=0\np.Add 1');check('order=1 And p.Value=5','Nothing disconnects one subscription without touching another');
 add('Set formSource=p\nformCalls=0\np.Add 1');check('formCalls=1 And formValue=6','form WithEvents fields receive typed class events through the actual form module');
 add('a.Disconnect\norder=0\np.Add 2');check('order=0 And formCalls=2 And formValue=8','form subscriptions remain independent of class sink teardown');
 add('Set formSource=Nothing\np.Add 1');check('formCalls=2 And p.Value=9','disconnecting a form subscriber leaves the source usable');
 add('a.Connect p:b.Connect p\ns="A" & ChrW$(0) & ChrW$(20013)\namount=0.5\nitem=7\np.Payload s,amount,item');
 check('s="A" & ChrW$(0) & ChrW$(20013) & "!!" And amount=3 And item="changed"','ByRef String/Single/Variant writes cross real OleAut32 and x86 callback frames');
 check('copied="copy " & ChrW$(937)','ByVal Unicode String and Double payloads preserve the declared ABI');
 add('On Error Resume Next\nErr.Clear\nErr.Raise 910,"caller","prior description"\np.CheckError');check('seenError=910 And Err.Number=910 And Err.Description="edited by sink"','event delivery preserves authored Err visibility and does not restore over handler edits');
 add('Err.Clear\na.fail=True\np.Add 1\nn=Err.Number\ns=Err.Source');check('n=911 And s="sink" And p.Value=9','an unhandled source-event error returns to the raising call without publishing the value');
 add('Err.Clear\na.fail=False\norder=0\np.Add 1');check('order=12 And p.Value=10','a failed delivery releases its active traversal state before the next raise');
 add('Err.Clear\nOn Error GoTo 0\nSet a=Nothing\nSet b=Nothing\nSet p=Nothing');check('terminated=2','borrowed connection owners do not introduce source/sink reference cycles');
 const r=finish('Public order As Long,observed As Long,copied As String,seenError As Long,terminated As Long\nPrivate WithEvents formSource As Publisher\nPrivate formCalls As Long,formValue As Long',`Private Sub formSource_Changed(ByVal value As Long)
 formCalls=formCalls+1
 formValue=value
End Sub`);
 project.modules.push({id:'publisher',name:'Publisher',kind:'class',code:`Private total As Long
Public Event BeforeChange(Cancel As Boolean,ByVal Amount As Long)
Public Event Changed(ByVal Value As Long)
Public Event PayloadChanged(text As String,amount As Single,item As Variant,ByVal scale As Double,ByVal copy As String)
Public Event ErrorCheck()
Public Sub Add(ByVal Amount As Long)
 Dim cancel As Boolean
 RaiseEvent BeforeChange(cancel,Amount)
 If Not cancel Then
  total=total+Amount
  RaiseEvent Changed(total)
 End If
End Sub
Public Sub Payload(text As String,amount As Single,item As Variant)
 RaiseEvent PayloadChanged(text,amount,item,1.25,"copy " & ChrW$(937))
End Sub
Public Sub CheckError()
 RaiseEvent ErrorCheck
End Sub
Public Property Get Value() As Long
 Value=total
End Property`},{id:'sink',name:'Sink',kind:'class',code:`Private WithEvents source As Publisher
Public id As Long,fail As Boolean
Public Sub Connect(ByVal value As Publisher)
 Set source=value
End Sub
Public Sub Disconnect()
 Set source=Nothing
End Sub
Private Sub source_BeforeChange(Cancel As Boolean,ByVal Amount As Long)
 If fail Then Err.Raise 911,"sink","failure"
 order=order*10+id
 If Amount>4 Then Cancel=True
End Sub
Private Sub source_Changed(ByVal Value As Long)
 observed=observed+Value
End Sub
Private Sub source_PayloadChanged(text As String,amount As Single,item As Variant,ByVal scale As Double,ByVal copy As String)
 text=text & "!"
 amount=amount+scale
 item="changed"
 copied=copy
 copy="local replacement"
End Sub
Private Sub source_ErrorCheck()
 seenError=Err.Number
 Err.Description="edited by sink"
End Sub
Private Sub Class_Terminate()
 terminated=terminated+1
End Sub`});return r;
}
function reentrancy(fixture){
 const {project,add,check,finish}=fixture('AotControlEventReentrancy');
 add('Dim p As New Ticker,n As Long\nSet first=New Sink:Set second=New Sink:Set third=New Sink\nfirst.id=1:second.id=2:third.id=3\nfirst.Connect p:second.Connect p\nfirst.mode=1\np.Fire 1');
 check('order=1','a pending disconnected sink is skipped and a newly connected sink waits until the next raise');
 add('p.Fire 2');check('order=113','the new sink runs in connection order on the following raise');
 add('order=0\nfirst.mode=2\np.Fire 1');check('order=1133','nested raises use independent captured-tail boundaries and synchronous ordering');
 add('Set first=Nothing:Set third=Nothing\norder=0\np.Fire 1');check('order=0','all disconnected nodes can be reclaimed after nested delivery');
 add('Set first=New Sink\nfirst.id=1:first.mode=3:first.Connect p\np.Fire 1');check('order=1 And first Is Nothing And result="alive"','a callback retains its own sink through release of its last authored reference');
 add('order=0\np.Fire 1');check('order=0','callback-owned finalization disconnects the source before a later raise');
 add('Set second=Nothing\nSet p=Nothing');check('terminated=4','all class owners finalize once without an event-reference cycle');
 const r=finish('Public first As Sink,second As Sink,third As Sink,order As Long,result As String,terminated As Long');
 project.modules.push({id:'ticker',name:'Ticker',kind:'class',code:`Public Event Tick(ByVal n As Long)
Public Sub Fire(ByVal n As Long)
 RaiseEvent Tick(n)
End Sub`},{id:'sink',name:'Sink',kind:'class',code:`Private WithEvents source As Ticker
Public id As Long,mode As Long
Private text As String
Public Sub Connect(ByVal p As Ticker)
 text="alive"
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
 ElseIf mode=2 And n=1 Then
  source.Fire 2
 ElseIf mode=3 Then
  Set first=Nothing
  result=text
 End If
End Sub
Private Sub Class_Terminate()
 terminated=terminated+1
End Sub`});return r;
}
