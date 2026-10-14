/** Real Windows acceptance for the unchanged MDI sample. Original code and
 * designer objects are never rewritten: this appends a verifier and a driver.
 * Menu commands use actual HMENU item IDs; object ownership uses real OleAut32.
 */
import fs from 'node:fs';
export function nativeMdiSampleFixture(){
 const project=JSON.parse(fs.readFileSync(new URL('../examples/mdi.vb6web',import.meta.url),'utf8')),module=project.modules.find(m=>m.name==='frmWorkspace'),checks=[],lines=[];
 project.name='AotControlOriginalMDI';
 const add=s=>lines.push(s),check=(condition,label)=>{checks.push(label);add(`If Not (${condition}) Then NativeExit ${checks.length}`);};
 add('Dim first As frmDocument,second As frmDocument,third As Form,active As Form,frame As Long,client As Long,firstWindow As Long,secondWindow As Long,n As Long,before As Long,after As Long,fileMenu As Long,windowMenu As Long,i As Long\nframe=Me.hWnd\nSet first=documents(1)\nSet second=documents(2)\nfirstWindow=first.hWnd\nsecondWindow=second.hWnd\nclient=NativeParent(firstWindow)\nfileMenu=NativeSubMenu(NativeMenu(frame),0)\nwindowMenu=NativeSubMenu(NativeMenu(frame),1)');
 check('documents.Count=2 And firstWindow<>secondWindow And NativeParent(client)=frame And NativeParent(secondWindow)=client','startup creates two independent real MDI child windows under the original frame');
 check('first.Caption="Document 1" And second.Caption="Document 2" And Not (first Is second)','original New document code keeps independent captions and object identities');
 check('first.txtDocument.Text=LoadResString(102) And second.txtDocument.Text=LoadResString(102)','each original Form_Load sets its own EDIT text from resource 102');
 add('first.txtDocument.Text="first only"');check('second.txtDocument.Text=LoadResString(102)','editing one native document does not mutate its sibling');
 add('n=NativeMove(firstWindow,20,30,500,350,1)');
 check('first.txtDocument.Width=first.ScaleWidth-360 And first.txtDocument.Height=first.ScaleHeight-1500 And first.chkKeepOpen.Top=first.ScaleHeight-1125','real WM_SIZE routes the original Resize handler to its own current client dimensions');
 add('n=NativeSend(client,&H222,firstWindow,0)\nSet active=Me.ActiveForm');
 check('active Is first And TypeOf active Is frmDocument And TypeName(active)="frmDocument"','ActiveForm returns the retained typed object for the actual active MDI HWND');
 add('first.chkKeepOpen.Value=1\nn=NativeSend(frame,&H111,NativeMenuId(fileMenu,1),0)');
 check('NativeWindow(firstWindow)<>0 And NativeWindow(secondWindow)<>0','the original Close menu honors the selected document QueryUnload cancellation');
 add('n=NativeSend(frame,&H10,0,0)');
 check('NativeWindow(frame)<>0 And NativeWindow(firstWindow)<>0','an independent child veto prevents the parent frame from closing');
 add('first.chkKeepOpen.Value=0\nn=NativeSend(client,&H222,firstWindow,0)\nn=NativeSend(frame,&H111,NativeMenuId(fileMenu,1),0)');
 check('NativeWindow(firstWindow)=0 And NativeWindow(secondWindow)<>0 And documents.Count=2','closing releases one HWND while Collection-held Form objects remain valid');
 add('n=NativeSend(frame,&H111,NativeMenuId(fileMenu,0),0)\nSet third=documents(3)');
 check('documents.Count=3 And third.Caption="Document 3" And Not (third Is second)','another original New menu command creates a third distinct object');
 add('n=NativeSend(frame,&H111,NativeMenuId(windowMenu,0),0)\nn=NativeSend(frame,&H111,NativeMenuId(windowMenu,1),0)\nn=NativeSend(frame,&H111,NativeMenuId(windowMenu,2),0)\nn=NativeSend(frame,&H111,NativeMenuId(windowMenu,3),0)');
 check('NativeParent(third.hWnd)=client And NativeWindow(secondWindow)<>0','all four original Arrange menu handlers preserve independent MDI children');
 add('Unload third\nSet third=Nothing\nbefore=NativeGdi(NativeProcess(),0)\nFor i=1 To 10\n n=NativeSend(frame,&H111,NativeMenuId(fileMenu,0),0)\n Set third=Me.ActiveForm\n Unload third\n Set third=Nothing\nNext\nafter=NativeGdi(NativeProcess(),0)');
 check('after=before','repeated original New/Unload cycles release their HWNDs and per-instance GDI fonts');
 add('Unload second\nSet active=Me.ActiveForm');check('active Is Nothing','ActiveForm is Nothing after every native MDI child is closed');
 add('Set first=Nothing\nSet second=Nothing\nSet active=Nothing\nn=NativeSend(frame,&H111,NativeMenuId(fileMenu,2),0)');
 check('NativeWindow(frame)=0 And NativeWindow(client)=0','original Exit menu releases the document Collection and closes the native frame');
 module.code+=`\nPrivate Declare Sub NativeExit Lib "kernel32" Alias "ExitProcess" (ByVal code As Long)
Private Declare Function NativeSend Lib "user32" Alias "SendMessageW" (ByVal hwnd As Long,ByVal message As Long,ByVal wp As Long,ByVal lp As Long) As Long
Private Declare Function NativeParent Lib "user32" Alias "GetParent" (ByVal hwnd As Long) As Long
Private Declare Function NativeWindow Lib "user32" Alias "IsWindow" (ByVal hwnd As Long) As Long
Private Declare Function NativeMenu Lib "user32" Alias "GetMenu" (ByVal hwnd As Long) As Long
Private Declare Function NativeSubMenu Lib "user32" Alias "GetSubMenu" (ByVal menu As Long,ByVal index As Long) As Long
Private Declare Function NativeMenuId Lib "user32" Alias "GetMenuItemID" (ByVal menu As Long,ByVal index As Long) As Long
Private Declare Function NativeMove Lib "user32" Alias "MoveWindow" (ByVal hwnd As Long,ByVal x As Long,ByVal y As Long,ByVal width As Long,ByVal height As Long,ByVal redraw As Long) As Long
Private Declare Function NativeGdi Lib "user32" Alias "GetGuiResources" (ByVal process As Long,ByVal kind As Long) As Long
Private Declare Function NativeProcess Lib "kernel32" Alias "GetCurrentProcess" () As Long
Public Sub NativeVerify()
${lines.join('\n')}
NativeExit 0
End Sub
`;
 project.modules.push({id:'native-mdi-verifier',name:'NativeMdiVerifier',kind:'module',code:'Private Sub Main()\nfrmWorkspace.Show\nfrmWorkspace.NativeVerify\nEnd Sub'});project.startup='Sub Main';return {project,checks};
}
