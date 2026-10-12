/** Self-checking native HWND acceptance. No private node layout is inspected;
 * readback uses VB properties and independently declared Windows APIs. */
export function nativeDynamicControlFixtures(fixture){return [arrays(fixture),references(fixture),input(fixture)];}
function arrays(fixture){
 const {control,add,check,finish}=fixture('AotControlDynamicArrays');
 control('CommandButton','Buttons',{Index:0,Caption:'seed'});
 add('Dim result As Long,before As Long,after As Long,i As Long\nButtons(0).Caption="live"\nButtons(0).Tag="x" & ChrW$(0) & "y"\nButtons(0).FontName="Consolas"\nButtons(0).FontSize=12.5\nButtons(0).FontBold=True\nButtons(0).Width=3000\nLoad Buttons(256)\nLoad Buttons(32767)');
 check('Buttons.Count=3 And Buttons.LBound=0 And Buttons.UBound=32767','sparse indices keep cached count and exact 15-bit bounds');
 check('GetParent(Buttons(32767).hWnd)=Me.hWnd And Buttons(32767).Index=32767','high indices address real distinct native child windows');
 check('Buttons(256).Caption="live" And Len(Buttons(256).Tag)=3 And Buttons(256).Width=3000','Load copies live caption, counted Tag and geometry');
 check('Buttons(256).FontName="Consolas" And Buttons(256).FontSize=12.5 And Buttons(256).FontBold','Load copies live font metadata and owns a distinct HFONT');
 add('Buttons(256).FontName="Arial"\nButtons(256).Tag="different"');
 check('Buttons(0).FontName="Consolas" And Len(Buttons(0).Tag)=3','mutating a cloned font and Tag does not modify the template');
 add('result=SendValue(Buttons(32767).hWnd,&HF5,0,0)');
 check('seen=32767 And calls=1 And Buttons.Count=2 And Buttons.UBound=256','a native Click delivers the full Index and safely unloads its own receiver');
 add('On Error Resume Next\nErr.Clear\nLoad Buttons(256)');check('Err.Number=360 And Buttons.Count=2','duplicate runtime indices fail without changing existing members');
 add('Err.Clear\nUnload Buttons(0)');check('Err.Number=362 And Buttons.Count=2','designer controls cannot be unloaded through runtime array removal');
 add('Err.Clear\nLoad Buttons(32768)');check('Err.Number=340 And Buttons.Count=2','out-of-range lookup is checked before touching the sparse table');
 add('Err.Clear\nOn Error GoTo 0\nUnload Buttons(256)\nbefore=GetGuiResources(GetCurrentProcess(),0)\nFor i=1 To 50\n Load Buttons(32767)\n Unload Buttons(32767)\nNext\nafter=GetGuiResources(GetCurrentProcess(),0)');
 check('Buttons.Count=1 And Buttons.UBound=0 And after=before','repeated sparse load/unload reclaims the HWND font and table page');
 return finish('Private calls As Long,seen As Integer\nPrivate Declare Function GetGuiResources Lib "user32" (ByVal process As Long,ByVal flags As Long) As Long\nPrivate Declare Function GetCurrentProcess Lib "kernel32" () As Long',
  'Private Sub Buttons_Click(Index As Integer)\n calls=calls+1\n seen=Index\n Unload Buttons(Index)\nEnd Sub');
}
function references(fixture){
 const {add,check,finish}=fixture('AotControlDynamicReferences');
 add('Dim box As TextBox,label As Label,alias As Label,value As Object,parent As Object,child As Object,radio As OptionButton,checkBox As CheckBox,result As Long,old As Long,text As String\nSet label=Controls.Add("VB.Label","label")\nlabel.Caption="owned"\nSet alias=label\nClear (label)');
 check('alias Is label And alias.Caption="owned"','grouped ByRef arguments own an isolated slot with the same HWND identity');
 add('Set label=Identity(alias)\nTake label\nClear label');
 check('label Is Nothing And alias.Caption="shared"','typed ByVal calls and returns keep independent variable-slot ownership');
 add('Controls.Remove "label"\nOn Error Resume Next\ntext=alias.Caption');
 check('Err.Number=91','a retained alias rejects its destroyed native HWND');
 add('Err.Clear\nOn Error GoTo 0\nSet label=Controls.Add("VB.Label","label")\nlabel.Caption="replacement"\nOn Error Resume Next\nalias.Caption="stale"');
 check('Err.Number=91 And label.Caption="replacement"','reusing a removed name cannot redirect old references');
 add('Err.Clear\nOn Error GoTo 0\nSet alias=Nothing\nSet box=Controls.Add("VB.TextBox","input")\nbox.Text="typed input"\nbox.MaxLength=4096');
 check('box.Text="typed input" And box.MaxLength=4096','typed TextBox references route supported native properties');
 add('Set value=box\nOn Error Resume Next\nTake value');check('Err.Number=13','typed parameter mismatch is rejected before invoking a Label method');
 add('Err.Clear\nOn Error GoTo 0\nSet parent=Controls.Add("VB.Frame","frame")\nSet child=Controls.Add("VB.Label","child",parent)\nchild.Caption="nested"');
 check('GetParent(child.hWnd)=parent.hWnd And child.Caption="nested"','Controls.Add validates and uses a native Frame container');
 add('Controls.Remove "frame"\nOn Error Resume Next\ntext=child.Caption');check('Err.Number=91','destroying the parent invalidates retained descendant references');
 add('Err.Clear\nOn Error GoTo 0');
 return finish('',`Private Sub Take(ByVal label As Label)
 label.Caption="shared"
 Set label=Nothing
End Sub
Private Sub Clear(ByRef label As Label)
 Set label=Nothing
End Sub
Private Function Identity(ByVal label As Label) As Label
 Set Identity=label
End Function
`);
}

function input(fixture){
 const {control,add,check,finish}=fixture('AotControlDynamicInput');
 control('TextBox','Edits',{Index:0,Text:''});
 control('CheckBox','Checks',{Index:0,Value:2});
 control('CheckBox','Triple',{Index:0,TripleState:-1});
 add('Dim result As Long,radio As OptionButton,checkBox As CheckBox');
 add('Err.Clear\nOn Error GoTo 0\nLoad Edits(32767)\nresult=SendValue(Edits(32767).hWnd,&H102,120,0)');
 check('Edits(32767).Text="" And inputCalls=1 And inputIndex=32767','ByRef KeyAscii cancellation suppresses the native edit insertion');
 add('result=SendValue(Edits(32767).hWnd,&H102,65,0)');check('Edits(32767).Text=ChrW$(937) And inputCalls=2','changed Unicode KeyAscii reaches the original edit procedure');
 add('Set radio=Controls.Add("VB.OptionButton","radio")\nSet checkBox=Controls.Add("VB.CheckBox","check")\nradio.Value=True\ncheckBox.Value=2');
 check('radio.Value And checkBox.Value=2','typed value properties preserve Boolean and three-state control semantics');
 check('SendValue(radio.hWnd,&HF0,0,0)=1 And SendValue(checkBox.hWnd,&HF0,0,0)=2','typed values agree with independent native BM_GETCHECK, not a cached property');
 add('result=SendValue(checkBox.hWnd,&HF5,0,0)');
 check('checkBox.Value=1','a native click on a programmatically grayed two-state checkbox checks it');
 add('result=SendValue(checkBox.hWnd,&HF5,0,0)');
 check('checkBox.Value=0','the next native click unchecks it without cycling through indeterminate');
 add('Load Checks(256)');
 check('Checks(0).Value=2 And Checks(256).Value=2','designer and cloned controls both preserve an authored indeterminate state');
 add('result=SendValue(Checks(256).hWnd,&HF5,0,0)');
 check('Checks(256).Value=1 And Checks(0).Value=2','runtime array Click changes only the selected checkbox before handler dispatch');
 add('Load Triple(32767)\nresult=SendValue(Triple(32767).hWnd,&HF5,0,0)\nresult=SendValue(Triple(32767).hWnd,&HF5,0,0)');
 check('Triple(32767).Value=2 And Triple(0).Value=0','TripleState click policy survives live template cloning');
 add('result=SendValue(Triple(32767).hWnd,&HF5,0,0)');
 check('Triple(32767).Value=0','three-state native click cycling returns from indeterminate to unchecked');
 return finish('Private inputCalls As Long,inputIndex As Integer',`Private Sub Edits_KeyPress(Index As Integer,KeyAscii As Integer)
 inputCalls=inputCalls+1
 inputIndex=Index
 If KeyAscii=120 Then KeyAscii=0
 If KeyAscii=65 Then KeyAscii=937
End Sub`);
}
