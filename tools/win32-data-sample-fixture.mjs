/** The original Data application, with every statement and designer object
 * unchanged. The appended verifier uses native button messages and a real
 * dialog timer; ADO, source handlers, binding and actual grid reads are unhooked.
 */
import fs from 'node:fs';
import {nativeInputBoxDriver} from './win32-inputbox-fixture.mjs';
export function nativeDataSampleFixture(){
 const project=JSON.parse(fs.readFileSync(new URL('../examples/data.vb6web',import.meta.url),'utf8'));
 const form=project.modules.find(m=>m.name==='frmData'),checks=[],body=[];
 const add=line=>body.push(line),check=(condition,text)=>{checks.push(text);add(`If Not (${condition}) Then NativeExit ${checks.length}`);};
 project.name='AotControlOriginalData';
 add('Dim nativeResult As Long,nativeWindow As Long,before As Variant\nnativeWindow=Me.hWnd');
 check('grdCustomers.Rows=6 And grdCustomers.Cols=3 And grdCustomers.FixedRows=1 And grdCustomers.FixedCols=0','original startup binds five real ADO records with one native header row');
 check('grdCustomers.TextMatrix(0,0)="ID" And grdCustomers.TextMatrix(0,1)="Customer" And grdCustomers.TextMatrix(0,2)="Country"','native grid headers come from the actual Recordset field schema');
 check('grdCustomers.TextMatrix(1,1)="Alfreds Futterkiste" And grdCustomers.TextMatrix(5,2)="UK" And lblCount.Caption="5 customers"','original seed and count-label output are preserved by real Recordset binding');
 check('grdCustomers.DataSource Is rs And rs.Fields.Item("ID").Value=5','binding owns the original source without moving its current record');
 add('InputDriver.Prepare "AAA Native",1\nnativeResult=NativeClick(cmdAdd.hWnd,&HF5,0,0)');
 check('rs.RecordCount=6 And grdCustomers.Rows=7 And lblCount.Caption="6 customers"','real Add button and InputBox append one record and refresh the native grid');
 check('grdCustomers.TextMatrix(6,0)="6" And grdCustomers.TextMatrix(6,1)="AAA Native" And grdCustomers.TextMatrix(6,2)="Unknown"','the new record fields reach the native grid without changing the original AddCustomer source');
 add('nativeResult=NativeClick(cmdSort.hWnd,&HF5,0,0)');
 check('grdCustomers.TextMatrix(1,0)="6" And grdCustomers.TextMatrix(1,1)="AAA Native" And grdCustomers.TextMatrix(2,1)="Alfreds Futterkiste"','real Sort button rebuilds the cloned view in the requested ADO order');
 add('before=rs.Bookmark\nRefreshGrid');
 check('rs.Bookmark=before And grdCustomers.DataSource Is rs','repeated refresh preserves the authored cursor and bound object identity');
 add('InputDriver.Prepare "unused",2\nnativeResult=NativeClick(cmdAdd.hWnd,&HF5,0,0)');
 check('rs.RecordCount=6 And grdCustomers.Rows=7 And nextId=6','cancelling the original InputBox does not append a row');
 add('InputDriver.Prepare " ",1\nnativeResult=NativeClick(cmdAdd.hWnd,&HF5,0,0)');
 check('rs.RecordCount=6 And grdCustomers.Rows=7 And nextId=6','the original Trim guard rejects a blank submitted name');
 check('InputDriver.TimerID=0 And InputDriver.Fired=3 And InputDriver.DriverError=0','all real dialogs were answered and their timers released');
 add('nativeResult=NativeClick(cmdClose.hWnd,&HF5,0,0)');
 check('NativeIsWindow(nativeWindow)=0','the unchanged Close handler unloads the native form and its bound grid');
 form.code+='\nPrivate Declare Sub NativeExit Lib "kernel32" Alias "ExitProcess" (ByVal code As Long)\nPrivate Declare Function NativeClick Lib "user32" Alias "SendMessageW" (ByVal hwnd As Long,ByVal message As Long,ByVal w As Long,ByVal l As Long) As Long\nPrivate Declare Function NativeIsWindow Lib "user32" Alias "IsWindow" (ByVal hwnd As Long) As Long\nPublic Sub NativeVerify()\n'+body.join('\n')+'\nNativeExit 0\nEnd Sub\n';
 project.modules.push(nativeInputBoxDriver('New customer'));
 project.modules.push({id:'native-data-acceptance',name:'NativeDataAcceptance',kind:'module',code:'Private Sub Main()\nfrmData.Show\nfrmData.NativeVerify\nEnd Sub'});
 project.startup='Sub Main';return {project,checks};
}
