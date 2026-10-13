/** Source-level array acceptance shared by Clang and direct ARM64 harnesses. */
export function arrayModules() {
  return [
    {name:'IArrayValues',kind:'class',code:`Public Function Values() As Long()
End Function`},
    {name:'ArrayValues',kind:'class',code:`Option Explicit
Implements IArrayValues
Private Function IArrayValues_Values() As Long()
  ReDim IArrayValues_Values(-1 To 1)
  IArrayValues_Values(-1) = 37
End Function
Public Property Get Items() As String()
  Dim original(1 To 2) As String
  original(1) = "owned"
  Items = original
End Property`},
    {name:'NativeArrayChecks',kind:'module',code:`Option Explicit
Private borrowedValues() As Long
Private borrowedVariant As Variant
Private Type NativeArrayRecord
  Numbers(1 To 2) As Long
  Captions(0 To 1) As String * 4
End Type
Private Function RecordValues() As NativeArrayRecord()
  ReDim RecordValues(1 To 2)
  RecordValues(1).Numbers(1) = 55
  RecordValues(1).Captions(0) = "one"
End Function
Private Function ObjectValues() As ArrayValues()
  ReDim ObjectValues(1 To 2)
  Set ObjectValues(1) = New ArrayValues
End Function
Private Function LongValues() As Long()
  ReDim LongValues(-2 To 0, 3 To 4)
  LongValues(-2, 3) = 41
  BumpResult LongValues()
  Debug.Assert LongValues(-2, 3) = 42
End Function
Private Sub BumpResult(values() As Long)
  values(-2, 3) = values(-2, 3) + 1
End Sub
Private Function EmptyValues() As Long()
End Function
Private Static Function FreshResult(ByVal populated As Boolean) As Long()
  If populated Then
    ReDim FreshResult(1 To 1)
    FreshResult(1) = 9
  End If
End Function
Private Function FixedValues() As String()
  Dim original(2 To 3) As String
  original(2) = "hello" & ChrW(0) & "world"
  FixedValues = original
End Function
Private Function BadValues() As Long()
  Dim wrong(1) As String
  BadValues = wrong
End Function
Private Sub TemporaryValues(values() As Long)
  values(0) = 99
  ReDim Preserve values(0 To 4)
End Sub
Private Sub BorrowedElement(ByRef slot As Long)
  On Error Resume Next
  ReDim borrowedValues(0 To 4)
  On Error GoTo 0
  Debug.Assert Err.Number = 10
  On Error Resume Next
  Err.Clear
  Erase borrowedValues
  On Error GoTo 0
  Debug.Assert Err.Number = 10
  On Error Resume Next
  Err.Clear
  borrowedValues = EmptyValues()
  On Error GoTo 0
  Debug.Assert Err.Number = 10
  On Error Resume Next
  Err.Clear
  slot = 66
  On Error GoTo 0
End Sub
Private Sub BorrowedVariantElement(ByRef slot As Long)
  On Error Resume Next
  borrowedVariant = 17
  On Error GoTo 0
  Debug.Assert Err.Number = 10
  On Error Resume Next
  Err.Clear
  ReDim borrowedVariant(0 To 4) As Long
  On Error GoTo 0
  Debug.Assert Err.Number = 10
  On Error Resume Next
  Err.Clear
  slot = 77
  On Error GoTo 0
End Sub
Private Sub FailedBorrowedElement(ByRef slot As Long)
  slot = 88
  Err.Raise 5
End Sub
Public Sub CheckNativeArrays()
  ReDim borrowedValues(0 To 1)
  BorrowedElement borrowedValues(0)
  Debug.Assert borrowedValues(0) = 66
  Debug.Assert UBound(borrowedValues) = 1
  ReDim Preserve borrowedValues(0 To 2)
  Debug.Assert borrowedValues(0) = 66
  On Error Resume Next
  FailedBorrowedElement borrowedValues(0)
  On Error GoTo 0
  Debug.Assert Err.Number = 5
  On Error Resume Next
  Err.Clear
  On Error GoTo 0
  ReDim Preserve borrowedValues(0 To 3)
  Debug.Assert borrowedValues(0) = 88
  Erase borrowedValues
  ReDim borrowedVariant(0 To 1) As Long
  BorrowedVariantElement borrowedVariant(0)
  Debug.Assert borrowedVariant(0) = 77
  borrowedVariant = 19
  Debug.Assert borrowedVariant = 19
  Dim a() As Long, b() As Long, text() As String
  a = LongValues()
  Debug.Assert a(-2, 3) = 42
  ReDim Preserve a(-2 To 0, 3 To 6)
  Debug.Assert a(-2, 3) = 42
  Debug.Assert a(0, 6) = 0
  b = EmptyValues()
  Debug.Assert IsArray(b)
  ReDim b(1 To 2)
  Debug.Assert b(1) = 0
  b = FreshResult(True)
  b = FreshResult(False)
  On Error Resume Next
  Err.Clear
  Debug.Print UBound(b)
  On Error GoTo 0
  Debug.Assert Err.Number = 9
  On Error Resume Next
  Err.Clear
  On Error GoTo 0
  text = FixedValues()
  ReDim Preserve text(2 To 5)
  Debug.Assert text(2) = "hello" & ChrW(0) & "world"
  Debug.Assert Len(text(5)) = 0
  Dim source(0 To 1) As Long, target() As Long
  source(0) = 7
  target = source
  ReDim Preserve target(0 To 3)
  target(0) = 8
  Debug.Assert source(0) = 7
  Debug.Assert UBound(source) = 1
  TemporaryValues (source)
  Debug.Assert source(0) = 7
  Debug.Assert UBound(source) = 1
  ReDim implicitValues(1 To 2) As Long
  implicitValues(1) = 21
  Debug.Assert implicitValues(1) = 21
  On Error Resume Next
  target = BadValues()
  On Error GoTo 0
  Debug.Assert Err.Number = 13
  On Error GoTo 0
  Debug.Assert target(0) = 8
  On Error Resume Next
  Err.Clear
  TemporaryValues (text)
  On Error GoTo 0
  Debug.Assert Err.Number = 13
  On Error Resume Next
  Err.Clear
  On Error GoTo 0
  Dim implementation As ArrayValues, contract As IArrayValues
  Set implementation = New ArrayValues
  Set contract = implementation
  b = contract.Values()
  Debug.Assert b(-1) = 37
  Debug.Assert contract.Values(-1) = 37
  text = implementation.Items
  ReDim Preserve text(1 To 4)
  text(1) = "changed"
  Debug.Assert implementation.Items(1) = "owned"
  Dim records() As NativeArrayRecord, singleRecord As NativeArrayRecord
  records = RecordValues()
  Debug.Assert records(1).Numbers(1) = 55
  Debug.Assert records(1).Captions(0) = "one "
  Debug.Assert records(2).Numbers(1) = 0
  singleRecord = records(1)
  singleRecord.Numbers(1) = 56
  singleRecord.Captions(0) = "changed"
  Debug.Assert records(1).Numbers(1) = 55
  Debug.Assert records(1).Captions(0) = "one "
  Debug.Assert singleRecord.Captions(0) = "chan"
  ReDim Preserve records(1 To 3)
  Debug.Assert records(1).Numbers(1) = 55
  Debug.Assert records(3).Numbers(1) = 0
  Dim objects() As ArrayValues, otherObjects() As ArrayValues
  objects = ObjectValues()
  otherObjects = objects
  Debug.Assert objects(1) Is otherObjects(1)
  Debug.Assert objects(2) Is Nothing
  Set otherObjects(1) = Nothing
  Debug.Assert Not (objects(1) Is Nothing)
  Dim flexible As Variant
  ReDim flexible(2 To 3) As Long
  flexible(2) = 17
  ReDim flexible(4 To 5) As String
  flexible(4) = "variant resized"
  ReDim Preserve flexible(4 To 7) As String
  Debug.Assert flexible(4) = "variant resized"
  Debug.Assert Len(flexible(7)) = 0
  On Error Resume Next
  ReDim Preserve flexible(4 To 8) As Long
  On Error GoTo 0
  Debug.Assert Err.Number = 13
  On Error Resume Next
  Err.Clear
  On Error GoTo 0
  Debug.Assert flexible(4) = "variant resized"
  On Error GoTo 0
  Debug.Assert UBound(flexible) = 7
  On Error Resume Next
  flexible = 42
  ReDim flexible(0 To 2) As Long
  On Error GoTo 0
  Debug.Assert Err.Number = 13
  On Error Resume Next
  Err.Clear
  On Error GoTo 0
  Debug.Assert flexible = 42
  On Error Resume Next
  ReDim Preserve target(1 To 4)
  On Error GoTo 0
  Debug.Assert Err.Number = 9
  On Error Resume Next
  Err.Clear
  On Error GoTo 0
  Debug.Assert LBound(target) = 0
  On Error GoTo 0
  Debug.Assert target(0) = 8
  On Error GoTo 0
  Debug.Print "NATIVE_ARRAYS_OK"
End Sub`}
  ];
}
