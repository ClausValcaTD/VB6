/** Execute the original Data sample, appending checks without rewriting handlers. */
import fs from 'node:fs';
export function macOSDataSampleProject(){
  const project=JSON.parse(fs.readFileSync(new URL('../examples/data.vb6web',import.meta.url),'utf8'));
  project.name='NativeOriginalData';const form=project.modules.find(m=>m.name==='frmData');
  form.code+=`
Public Sub NativeDataVerify()
  Debug.Assert grdCustomers.Rows = 6 And grdCustomers.Cols = 3
  Debug.Assert grdCustomers.FixedRows = 1 And grdCustomers.FixedCols = 0
  Debug.Assert grdCustomers.TextMatrix(0, 0) = "ID"
  Debug.Assert grdCustomers.TextMatrix(0, 1) = "Customer"
  Debug.Assert grdCustomers.TextMatrix(0, 2) = "Country"
  Debug.Assert grdCustomers.TextMatrix(1, 1) = "Alfreds Futterkiste"
  Debug.Assert grdCustomers.TextMatrix(5, 2) = "UK"
  Debug.Assert lblCount.Caption = "5 customers"
  Debug.Assert grdCustomers.DataSource Is rs
  Debug.Assert rs.Fields.Item("ID").Value = 5
  Dim bookmark As Variant
  bookmark = rs.Bookmark
  RefreshGrid
  Debug.Assert rs.Bookmark = bookmark
  AddCustomer "AAA Native", "Unknown"
  RefreshGrid
  Debug.Assert rs.RecordCount = 6 And grdCustomers.Rows = 7
  Debug.Assert grdCustomers.TextMatrix(6, 0) = "6"
  Debug.Assert grdCustomers.TextMatrix(6, 1) = "AAA Native"
  cmdSort_Click
  Debug.Assert grdCustomers.TextMatrix(1, 0) = "6"
  Debug.Assert grdCustomers.TextMatrix(1, 1) = "AAA Native"
  Debug.Assert grdCustomers.TextMatrix(2, 1) = "Alfreds Futterkiste"
  bookmark = rs.Bookmark
  grdCustomers.TextMatrix(1, 2) = "Native edit"
  Debug.Assert rs.Bookmark = bookmark
  Debug.Assert rs.Fields.Item("Country").Value = "Native edit"
  rs.Filter = "Country = 'Native edit'"
  Debug.Assert grdCustomers.Rows = 2
  Debug.Assert grdCustomers.TextMatrix(1, 0) = "6"
  rs.Filter = adFilterNone
  Debug.Assert grdCustomers.Rows = 7
  Set grdCustomers.DataSource = Nothing
  Debug.Assert grdCustomers.DataSource Is Nothing
  RefreshGrid
  Debug.Assert grdCustomers.Rows = 7 And grdCustomers.DataSource Is rs
  rs.Close
  Debug.Assert grdCustomers.Rows = 1
  Debug.Assert grdCustomers.Cols = 3
  Debug.Assert grdCustomers.TextMatrix(0, 1) = "Customer"
  Debug.Print "NATIVE_ORIGINAL_DATA_OK"
  cmdClose_Click
End Sub
`;
  project.startup='Sub Main';project.modules.push({name:'NativeDataAcceptance',kind:'module',code:'Sub Main()\nLoad frmData\nfrmData.NativeDataVerify\nEnd Sub'});
  return project;
}
