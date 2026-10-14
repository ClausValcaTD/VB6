/** Real ADODB.Recordset and HWND grid snapshot acceptance. No API or dispatch
 * method is replaced; allocation/reentry injection has a separate IA-32 suite.
 * The Name field explicitly accepts Null; ADO's type-derived default attributes
 * do not establish nullability. Keep the provider Null and grid empty-text
 * checks together so fixture setup cannot silently remove the conversion case.
 * https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/append-method-ado
 * https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/fieldattributeenum
 */
export function nativeDataBindingFixture(fixture){
 const {control,add,check,finish}=fixture('AotControlDataBinding');control('MSFlexGrid','G',{Rows:3,Cols:2,FixedRows:1,FixedCols:0});
 add('Dim rs As Object,old As Object,broken As Object,position As Variant,n As Long\nSet rs=CreateObject("ADODB.Recordset")\nrs.Fields.Append "ID",adInteger\nrs.Fields.Append "Name",adVarWChar,80,adFldIsNullable\nrs.Open\nrs.AddNew\nrs.Fields.Item("ID").Value=2\nrs.Fields.Item("Name").Value="Zulu"\nrs.Update\nrs.AddNew\nrs.Fields.Item("ID").Value=1\nrs.Fields.Item("Name").Value="Alpha"\nrs.Update\nrs.Sort="Name ASC"\nrs.MoveLast\nposition=rs.Bookmark\nG.ColWidth(1)=2340\nG.DataSource=rs');
 check('G.Rows=3 And G.Cols=2 And G.FixedRows=1 And G.FixedCols=0','a complete native Recordset snapshot publishes one header and all data rows');
 check('G.TextMatrix(0,0)="ID" And G.TextMatrix(0,1)="Name" And G.TextMatrix(1,0)="1" And G.TextMatrix(1,1)="Alpha" And G.TextMatrix(2,0)="2"','headers and sorted values retain GetRows field/record axes');
 check('G.DataSource Is rs And rs.Bookmark=position And rs.Fields.Item("ID").Value=2','the grid owns the source identity without moving its cursor');
 check('G.ColWidth(1)=2340','rebinding preserves compatible column metadata');
 add('rs.Filter="ID = 2"\nSet G.DataSource=rs');
 check('G.Rows=2 And G.TextMatrix(1,0)="2" And G.TextMatrix(1,1)="Zulu"','the clone explicitly receives the source filter as well as sort');
 add('rs.Filter="ID = 99"\nSet G.DataSource=rs');
 check('G.Rows=1 And G.Cols=2 And G.TextMatrix(0,1)="Name"','an empty filtered Recordset still publishes headers without reading beyond EOF');
 add('rs.Filter=0\nrs.Sort=""\nrs.MoveFirst\nrs.Fields.Item("Name").Value="A" & ChrW$(0) & ChrW$(937) & ChrW$(20013)\nrs.Update\nrs.MoveNext\nrs.Fields.Item("Name").Value=Null\nrs.Update\nG.DataSource=rs');
 check('IsNull(rs.Fields.Item("Name").Value) And Len(G.TextMatrix(1,1))=4 And AscW(Mid$(G.TextMatrix(1,1),3,1))=937 And G.TextMatrix(2,1)=""','counted Unicode and NUL Strings survive the native snapshot; Null displays empty');
 add('Set old=rs\nSet broken=CreateObject("ADODB.Recordset")\nOn Error Resume Next\nErr.Clear\nG.DataSource=broken\nn=Err.Number');
 check('n<>0 And G.DataSource Is old And G.Rows=3 And Len(G.TextMatrix(1,1))=4','a closed-provider failure retains previous cells, dimensions and source ownership');
 add('Err.Clear\nOn Error GoTo 0\nSet G.DataSource=Nothing');
 check('G.DataSource Is Nothing And G.Rows=0 And G.Cols=1','binding Nothing clears the snapshot and releases the bound reference');
 add('G.DataSource=rs');
 check('G.Rows=3 And G.DataSource Is rs And Len(G.TextMatrix(1,1))=4','a cleared grid remains reusable with the same live external Recordset');
 add('Set G.DataSource=Nothing\nrs.Close\nSet rs=Nothing\nSet old=Nothing\nSet broken=Nothing');
 return finish('Private Const adFldIsNullable As Long = &H20');
}
