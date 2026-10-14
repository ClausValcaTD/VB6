/** Keep every original sample statement/control/class. A separate startup driver
 * shows that original form and runs appended readback checks using real button
 * messages; source export is also tested on the completely unchanged sample. */
import fs from 'node:fs';
export function nativeCompatibilitySampleFixture(){
 const project=JSON.parse(fs.readFileSync(new URL('../examples/compatibility.vb6web',import.meta.url),'utf8'));
 project.name='AotControlCompatibility';const form=project.modules.find(m=>m.name==='frmCompatibility'),checks=[],code=[];
 const check=(condition,label)=>{checks.push(label);code.push('If Not ('+condition+') Then ExitProcess '+checks.length);};
 check('lblCalendar.Caption="2025-02-28"','unchanged startup calendar routine uses native CallByName to display the leap-day result');
 check('InStr(txtOutput.Text,"Named: left / right")>0 And InStr(txtOutput.Text,"Optional: Missing versus Empty")>0','unchanged named/optional argument demo writes actual EDIT text');
 check('InStr(txtOutput.Text,"TypeOf Counter: True")>0','unchanged TypeOf demo instantiates its native class');
 check('InStr(txtOutput.Text,"Mid$: aXYdef")>0 And InStr(txtOutput.Text,"LSet: [aXYdef    ]")>0 And InStr(txtOutput.Text,"RSet: [    aXYdef]")>0','all three unchanged String mutation demonstrations write the expected text');
 check('InStr(txtOutput.Text,"CVErr: Error 2001 / type 10")>0','unchanged CVErr demonstration retains native error Variant formatting');
 code.push('Dim n As Long\nn=NativeClick(cmdA.hWnd,&HF5,0,0)\nn=NativeClick(cmdA.hWnd,&HF5,0,0)\nn=NativeClick(cmdB.hWnd,&HF5,0,0)');
 check('lblCounters.Caption="A = 2     B = 1"','real BM_CLICK routing invokes reflection and direct methods on independent Counter instances');
 code.push('n=NativeClick(cmdB.hWnd,&HF5,0,0)');
 check('lblCounters.Caption="A = 2     B = 2"','a second native button route changes only its own instance Static state');
 code.push('n=NativeClick(cmdClear.hWnd,&HF5,0,0)');
 check('txtOutput.Text=""','unchanged Clear button removes native output text');
 form.code+='\nPrivate Declare Sub ExitProcess Lib "kernel32" (ByVal code As Long)\nPrivate Declare Function NativeClick Lib "user32" Alias "SendMessageW" (ByVal hwnd As Long,ByVal message As Long,ByVal w As Long,ByVal l As Long) As Long\nPublic Sub NativeVerify()\n'+code.join('\n')+'\nExitProcess 0\nEnd Sub\n';
 project.modules.push({id:'native-acceptance',name:'NativeAcceptance',kind:'module',code:'Private Sub Main()\nfrmCompatibility.Show\nfrmCompatibility.NativeVerify\nEnd Sub'});
 project.startup='Sub Main';return {project,checks};
}
