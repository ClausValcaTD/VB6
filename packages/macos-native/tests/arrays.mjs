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
Public Sub CheckNativeArrays()
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
  Debug.Assert Err.Number = 9
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
  Debug.Assert Err.Number = 13
  Debug.Assert target(0) = 8
  Err.Clear
  TemporaryValues (text)
  Debug.Assert Err.Number = 13
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
  Debug.Print "NATIVE_ARRAYS_OK"
End Sub`}
  ];
}
