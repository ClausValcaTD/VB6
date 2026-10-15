/** Shared source-level disconnected Recordset acceptance; no provider or COM mock. */
export function recordsetProject(){return {schema:1,name:'NativeRecordsets',startup:'Sub Main',modules:[{name:'Main',kind:'module',code:`Option Explicit
Private Sub AddRow(ByVal rs As Object, ByVal id As Long, ByVal name As String)
  rs.AddNew
  rs.Fields.Item("ID").Value = id
  rs.Fields.Item("Name").Value = name
  rs.Fields.Item("Amount").Value = CCur("1.2500")
  rs.Update
End Sub
Sub Main()
  Dim rs As Object, field As Object, bookmark As Variant, rows As Variant
  Set rs = CreateObject("ADODB.Recordset")
  rs.CursorLocation = adUseClient
  rs.Fields.Append "ID", adInteger
  rs.Fields.Append "Name", adVarWChar, 16
  rs.Fields.Append "Amount", adCurrency
  Debug.Assert rs.Fields.Count = 3
  Debug.Assert rs.State = adStateClosed
  rs.Open
  Debug.Assert rs.BOF And rs.EOF
  AddRow rs, 1, "Bêta"
  AddRow rs, 2, "Alpha"
  AddRow rs, 3, "Gamma"
  Debug.Assert rs.RecordCount = 3
  rs.MoveFirst
  Set field = rs.Fields.Item("Name")
  bookmark = rs.Bookmark
  Debug.Assert field.Value = "Bêta"
  field.Value = "changed"
  Debug.Assert rs.EditMode = 1
  Debug.Assert field.OriginalValue = "Bêta"
  rs.CancelUpdate
  Debug.Assert field.Value = "Bêta"
  On Error Resume Next
  field.Value = "too long for this column"
  On Error GoTo 0
  Debug.Assert Err.Number = 372
  Err.Clear
  Debug.Assert field.Value = "Bêta"
  Debug.Assert rs.EditMode = 0
  rs.Sort = "Name ASC"
  rs.MoveFirst
  Debug.Assert rs.Fields.Item("Name").Value = "Alpha"
  rs.Bookmark = bookmark
  Debug.Assert rs.Fields.Item("ID").Value = 1
  rs.Filter = "ID >= 2 AND Name LIKE 'G*'"
  Debug.Assert rs.RecordCount = 1
  Debug.Assert rs.Fields.Item("Name").Value = "Gamma"
  rs.Filter = adFilterNone
  rs.Sort = "ID ASC"
  rs.MoveFirst
  rows = rs.GetRows(2)
  Debug.Assert LBound(rows, 1) = 0 And UBound(rows, 1) = 2
  Debug.Assert LBound(rows, 2) = 0 And UBound(rows, 2) = 1
  Debug.Assert rows(0, 0) = 1
  Debug.Assert rows(1, 0) = "Bêta"
  Debug.Assert rows(0, 1) = 2
  Debug.Assert rows(2, 1) = CCur("1.25")
  Debug.Assert rs.Fields.Item("ID").Value = 3
  rs.AddNew
  rs.Fields.Item("ID").Value = 4
  rs.CancelUpdate
  Debug.Assert rs.RecordCount = 3
  rs.MoveFirst
  rs.Delete
  Debug.Assert rs.RecordCount = 2
  rs.Close
  Debug.Assert rs.State = adStateClosed
  On Error Resume Next
  Debug.Print rs.RecordCount
  On Error GoTo 0
  Debug.Assert Err.Number = 3704
  Err.Clear
  Debug.Print "NATIVE_RECORDSETS_OK"
End Sub`}]};}

export function recordsetModule(){const module=recordsetProject().modules[0];return {...module,name:'NativeRecordsetChecks',code:module.code.replace('Sub Main()', 'Public Sub CheckNativeRecordsets()')};}
