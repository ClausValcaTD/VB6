/** Original Events sample acceptance. Preserve every original statement and
 * designer object; append a separate verifier and startup driver. No JS runtime
 * or alternative project replaces the original form/event/button procedures. */
import fs from 'node:fs';
export function nativeEventsSampleFixture(){
 const project=JSON.parse(fs.readFileSync(new URL('../examples/events.vb6web',import.meta.url),'utf8'));
 project.name='AotControlOriginalEvents';const form=project.modules.find(m=>m.name==='frmEvents'),checks=[],body=[];
 const check=(condition,label)=>{checks.push(label);body.push(`If Not (${condition}) Then NativeExitProcess ${checks.length}`);};
 body.push('Dim result As Long,old As Long,saved As Long,held As Object,caption As String\nsaved=Me.hWnd');
 check('cmdAction.Count=5 And cmdAction.LBound=0 And cmdAction.UBound=4','original Form_Load creates every dynamic array member');
 check('Controls("lblDynamic").Caption="This label was created by Controls.Add." And Controls("lblDynamic").Visible','original Controls.Add creates a visible native label with authored text');
 check('Controls("lblDynamic").Left=2400 And Controls("lblDynamic").Top=3585','original dynamic label placement survives native coordinate conversion');
 check('NativeIsWindow(cmdAction(3).hWnd)<>0 And NativeParent(cmdAction(3).hWnd)=saved','runtime array elements are real child HWNDs');
 body.push('result=NativeSend(cmdAction(3).hWnd,&HF5,0,0)');
 check('lblCount.Caption="Total: 4" And lblStatus.Caption="The Changed event ran synchronously."','original native Click raises the original synchronous source event');
 body.push('result=NativeSend(cmdAction(4).hWnd,&HF5,0,0)');
 check('lblCount.Caption="Total: 4" And InStr(lblStatus.Caption,"cancelled")>0','original BeforeChange cancels the +5 native button route');
 body.push('result=NativeSend(cmdRemove.hWnd,&HF5,0,0)');
 check('cmdAction.Count=4 And cmdAction.UBound=3','original Remove button unloads the highest runtime index');
 body.push('result=NativeSend(cmdReset.hWnd,&HF5,0,0)');
 check('lblCount.Caption="Total: 0"','original Reset route updates the native label through its source event');
 body.push('Set held=cmdAction(2)\nUnload cmdAction(2)\nOn Error Resume Next\ncaption=held.Caption');
 check('Err.Number=91','a retained reference cannot read the destroyed native element');
 body.push('Err.Clear\nOn Error GoTo 0\nLoad cmdAction(2)\ncmdAction(2).Caption="replacement"\nOn Error Resume Next\nheld.Caption="must not appear"');
 check('Err.Number=91 And cmdAction(2).Caption="replacement"','reloading an index does not redirect an old reference to the replacement HWND');
 body.push('Err.Clear\nOn Error GoTo 0\nSet held=Nothing\nControls.Remove "lblDynamic"');
 check(`Controls.Count=${form.form.controls.length+3}`,'named dynamic removal leaves the original designer controls and live array elements');
 body.push('result=NativeSend(cmdClose.hWnd,&HF5,0,0)');
 check('NativeIsWindow(saved)=0','original Close button destroys the form after releasing runtime children');
 form.code+='\nPrivate Declare Sub NativeExitProcess Lib "kernel32" Alias "ExitProcess" (ByVal code As Long)\n'+
  'Private Declare Function NativeSend Lib "user32" Alias "SendMessageW" (ByVal hwnd As Long,ByVal message As Long,ByVal w As Long,ByVal l As Long) As Long\n'+
  'Private Declare Function NativeParent Lib "user32" Alias "GetParent" (ByVal hwnd As Long) As Long\n'+
  'Private Declare Function NativeIsWindow Lib "user32" Alias "IsWindow" (ByVal hwnd As Long) As Long\n'+
  'Public Sub NativeVerify()\n'+body.join('\n')+'\nNativeExitProcess 0\nEnd Sub\n';
 project.modules.push({id:'native-events-acceptance',name:'NativeEventsAcceptance',kind:'module',code:'Private Sub Main()\nfrmEvents.Show\nfrmEvents.NativeVerify\nEnd Sub'});
 project.startup='Sub Main';return {project,checks};
}
