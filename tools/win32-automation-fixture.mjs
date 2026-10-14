/** Actual ADODB.Recordset Automation, supplied by the installed x86 Windows COM
 * server. A Clone has its own view: copy Sort explicitly before requesting the
 * sorted GetRows snapshot. The Windows trace proves the original empty Sort.
 * No recordset implementation, dispatch method or VARIANT API is mocked.
 */
export function nativeAutomationFixture(fixture){
 const {add,check,finish}=fixture('AotControlAutomation');
 add('Dim rs As Object,alias As Object,copy As Object,values As Variant,position As Variant,n As Long,s As String,cloneSort As String,cloneFirst As Long\nSet rs=CreateObject("ADODB.Recordset")\nrs.Fields.Append "ID",adInteger\nrs.Fields.Append "Name",adVarWChar,80\nrs.Open');
 check('rs.State=adStateOpen And rs.Fields.Count=2','CreateObject activates a real local ADODB.Recordset and chained Fields.Append establishes its schema');
 add('rs.AddNew\nrs.Fields.Item("ID").Value=2\nrs.Fields.Item("Name").Value="Z" & ChrW$(937)\nrs.Update\nrs.AddNew\nrs.Fields.Item("ID").Value=1\nrs.Fields.Item("Name").Value="Alpha"\nrs.Update');
 check('rs.RecordCount=2 And rs.Fields.Item("ID").Value=1','Invoke PROPERTYPUT assigns real ADO fields without confusing argument order');
 add('Set alias=rs\nSet rs=Nothing');check('alias.RecordCount=2 And IsObject(alias)','an owned Object alias retains the external Recordset after its original variable is cleared');
 add('alias.MoveFirst');check('alias.Fields.Item("Name").Value="Z" & ChrW$(937)','Unicode BSTR results survive chained dispatch and temporary-interface release');
 add('alias.Sort="Name ASC"\nalias.MoveFirst');check('alias.Fields.Item("Name").Value="Alpha"','Sort is a real Recordset property assignment, not a reordered display copy');
 add('position=alias.Bookmark\nSet copy=alias.Clone(adLockReadOnly)\ncloneSort=copy.Sort\ncopy.MoveFirst\ncloneFirst=CLng(copy.Fields.Item("ID").Value)\ncopy.Sort=alias.Sort\ncopy.MoveFirst\nvalues=copy.GetRows()');
 check('LBound(values,1)=0 And UBound(values,1)=1 And UBound(values,2)=1','native dispatch results own a two-dimensional GetRows SAFEARRAY');
 check('values(0,0)=1 And values(1,0)="Alpha" And values(0,1)=2 And values(1,1)="Z" & ChrW$(937)','GetRows retains field/record axes and Unicode values');
 check('alias.Bookmark=position And alias.Fields.Item("ID").Value=1','consuming a clone does not advance the source Recordset cursor');
 add('Set copy=Nothing\nOn Error Resume Next\nErr.Clear\ns=alias.Fields.Item("MissingField").Value');
 check('Err.Number=3265 And Len(Err.Description)>0 And Len(Err.Source)>0','ADO EXCEPINFO becomes the original VB error number and owned source/description');
 add('Err.Clear\ns=alias.NonexistentNativeMember');check('Err.Number=438','GetIDsOfNames failure is explicit rather than an ignored member call');
 add('Err.Clear\nSet rs=CreateObject("VB6.Native.Acceptance.DoesNotExist")');check('Err.Number=429 And rs Is Nothing','failed local COM activation does not publish a partial object');
 add('Err.Clear\nOn Error GoTo 0\nalias.Close');check('alias.State=adStateClosed','the real ADO Close method executes after prior handled errors');
 check('cloneSort="" And cloneFirst=2','the cloned cursor has an independent view; explicitly setting its Sort supplies the requested GetRows order');
 add('Set alias=Nothing\nSet rs=Nothing');
 return finish();
}
