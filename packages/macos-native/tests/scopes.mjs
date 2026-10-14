/** Source acceptance shared by the VM, Clang and direct ARM64 execution gates. */
export function scopeModules(){return [
{name:'NativeScopeBox',kind:'class',code:`Public Value As Long
Public Function Touch(ByRef slot As Long) As Long
  slot = slot + 1
  Touch = slot
End Function
Public Property Get DefaultValue() As Long
Attribute DefaultValue.VB_UserMemId = 0
  Err.Raise 5
End Property`},
{name:'NativeScopeChecks',kind:'module',code:`Option Explicit
Private Type ScopeLeaf
  Value As Long
End Type
Private Type ScopeRow
  Value As Long
  Nested As ScopeLeaf
  Numbers(0 To 1) As Long
  Bag As Variant
End Type
Private rows() As ScopeRow
Private numbers() As Long
Private calls As Long
Private Sub Setup()
  ReDim rows(0 To 1)
  ReDim numbers(0 To 1)
  rows(0).Value = 7
  rows(0).Nested.Value = 11
  rows(0).Numbers(0) = 13
  numbers(0) = 1
  numbers(1) = 2
  calls = 0
  Err.Clear
End Sub
Private Function Once() As Long
  calls = calls + 1
  Once = 0
End Function
Private Sub CheckError(ByVal expected As Long)
  Debug.Assert Err.Number = expected
  Err.Clear
End Sub
Private Sub BorrowField(ByRef slot As Long)
  On Error Resume Next
  ReDim rows(0 To 3)
  On Error GoTo 0
  CheckError 10
  slot = slot + 1
End Sub
Private Sub BorrowThen(ByRef slot As Long, ByVal index As Long)
  slot = index
End Sub
Private Sub FreeField(ByRef slot As Long)
  ReDim rows(0 To 3)
  slot = 99
End Sub
Private Function FailIndex() As Long
  ReDim rows(0 To 3)
  FailIndex = 0
End Function
Private Function Touch(ByRef slot As Long) As Long
  slot = slot + 1
  Touch = slot
End Function
Private Function Sum(ByVal first As Long, ByVal second As Long) As Long
  Sum = first + second
End Function
Private Function ResizeAfterReturn() As Long
  ReDim Preserve rows(0 To 3)
  ResizeAfterReturn = 1
End Function
Private Sub CheckNestedReferences()
  Setup
  BorrowField rows(Once()).Nested.Value
  Debug.Assert rows(0).Nested.Value = 12
  Debug.Assert calls = 1
  BorrowField rows(0).Numbers(0)
  Debug.Assert rows(0).Numbers(0) = 14
  On Error Resume Next
  BorrowThen rows(0).Numbers(0), FailIndex()
  On Error GoTo 0
  CheckError 10
  Debug.Assert rows(0).Numbers(0) = 14
  Debug.Assert UBound(rows) = 1
  Debug.Assert Touch(rows(0).Nested.Value) + ResizeAfterReturn() = 14
  Debug.Assert UBound(rows) = 3
  Dim box As New NativeScopeBox
  Debug.Assert Sum(box.Touch(rows(0).Nested.Value), ResizeAfterReturn()) = 15
  Dim copy As ScopeRow
  copy = rows(0)
  FreeField (copy.Nested.Value)
  Debug.Assert copy.Nested.Value = 14
End Sub
Private Sub CheckWithValues()
  Setup
  With rows(Once()).Nested
    On Error Resume Next
    Erase rows
    On Error GoTo 0
    CheckError 10
    .Value = 17
  End With
  Debug.Assert calls = 1
  ReDim Preserve rows(0 To 3)
  Debug.Assert rows(0).Nested.Value = 17
  With (rows(0))
    .Value = 19
    ReDim rows(0 To 2)
    Debug.Assert .Value = 19
    Debug.Assert rows(0).Value = 0
  End With
  Dim a As ScopeRow, b As ScopeRow
  a.Bag = Array(1, 2)
  b.Bag = 42
  b.Value = 21
  b.Nested.Value = 22
  With a
    With .Nested
      a = b
      .Value = .Value + 1
    End With
    Debug.Assert .Value = 21
  End With
  Debug.Assert a.Nested.Value = 23
  Debug.Assert b.Nested.Value = 22
  Debug.Assert a.Bag = 42
  Dim objects() As NativeScopeBox, keep As NativeScopeBox
  ReDim objects(0 To 1)
  Set objects(0) = New NativeScopeBox
  Set keep = objects(0)
  With objects(0)
    ReDim objects(0 To 3)
    .Value = 31
  End With
  Debug.Assert keep.Value = 31
  Debug.Assert objects(0) Is Nothing
End Sub
Private Sub CheckWithControlFlow()
  Setup
  Dim other As ScopeRow
  With rows(0)
    .Value = 41
    GoSub suspended
    Debug.Assert .Value = 41
    With rows(1)
      .Value = 42
    End With
    On Error Resume Next
    ReDim rows(0 To 4)
    On Error GoTo 0
    CheckError 10
  End With
  ReDim Preserve rows(0 To 4)
  Debug.Assert rows(0).Value = 41
  Debug.Assert rows(1).Value = 42
  Do
    With rows(0)
      .Value = 43
      Exit Do
    End With
  Loop While False
  ReDim Preserve rows(0 To 5)
  Debug.Assert rows(0).Value = 43
  With rows(0)
    On 1 GoTo finished
  End With
finished:
  ReDim Preserve rows(0 To 6)
  Debug.Assert UBound(rows) = 6
  Exit Sub
suspended:
  On Error Resume Next
  Erase rows
  On Error GoTo 0
  CheckError 10
  With other
    .Value = 51
  End With
  Debug.Assert other.Value = 51
  Return
End Sub
Private Sub CheckWithErrorFlow()
  Setup
  On Error GoTo handler
  With rows(0)
    .Value = 61
    Err.Raise 5
    Debug.Assert .Value = 61
  End With
  ReDim Preserve rows(0 To 3)
  Debug.Assert rows(0).Value = 61
  On Error GoTo 0
  Dim outer As ScopeRow
  outer.Value = 71
  On Error Resume Next
  With outer
    GoTo skipped
    With rows(0)
skipped:
      .Value = 999
      On Error GoTo 0
      CheckError 91
    End With
    Debug.Assert .Value = 71
  End With
  Debug.Assert outer.Value = 71
  calls = 0
again:
  calls = calls + 1
  With rows(0)
    .Value = calls
    If calls < 3 Then GoTo again
  End With
  ReDim Preserve rows(0 To 4)
  Debug.Assert rows(0).Value = 3
  Debug.Assert calls = 3
  On Error Resume Next
  Do
    With rows(99)
      Exit Do
    End With
  Loop While False
  On Error GoTo 0
  CheckError 9
  ReDim rows(0 To 5)
  Exit Sub
handler:
  Debug.Assert Err.Number = 5
  Resume Next
End Sub
Private Sub CheckEachLive()
  Setup
  Dim item As Variant, count As Long, total As Long
  For Each item In numbers
    count = count + 1
    total = total + item
    If count = 1 Then numbers(1) = 3
    On Error Resume Next
    ReDim numbers(0 To 4)
    On Error GoTo 0
    CheckError 10
  Next
  Debug.Assert count = 2
  Debug.Assert total = 4
  ReDim Preserve numbers(0 To 3)
  Debug.Assert numbers(1) = 3
  For Each item In numbers
    Exit For
  Next
  Erase numbers
  ReDim numbers(0 To 1)
  For Each item In numbers
    GoTo escaped
  Next
escaped:
  ReDim numbers(0 To 5)
  Debug.Assert UBound(numbers) = 5
  count = 0
  For Each item In rows(0).Numbers
    count = count + 1
    On Error Resume Next
    Erase rows
    On Error GoTo 0
    CheckError 10
  Next
  Debug.Assert count = 2
  ReDim rows(0 To 2)
End Sub
Private Sub CheckEachSuspension()
  Setup
  Dim item As Variant, inner As Variant, count As Long
  For Each item In numbers
    count = count + 1
    GoSub suspended
    For Each inner In numbers
      Exit For
    Next
    On Error Resume Next
    Erase numbers
    On Error GoTo 0
    CheckError 10
  Next
  Debug.Assert count = 2
  Erase numbers
  ReDim numbers(0 To 1)
  On Error GoTo handler
  For Each item In numbers
    Err.Raise 5
    On Error Resume Next
    ReDim numbers(0 To 5)
    On Error GoTo 0
    CheckError 10
    On Error GoTo handler
  Next
  On Error GoTo 0
  ReDim numbers(0 To 5)
  Debug.Assert UBound(numbers) = 5
  Exit Sub
suspended:
  On Error Resume Next
  ReDim numbers(0 To 4)
  On Error GoTo 0
  CheckError 10
  Return
handler:
  Debug.Assert Err.Number = 5
  Resume Next
End Sub
Private Sub FailNestedScopes()
  Dim item As Variant
  With rows(0)
    For Each item In numbers
      With .Nested
        Err.Raise 5
      End With
    Next
  End With
End Sub
Private Sub CheckFailureCleanup()
  Setup
  On Error Resume Next
  FailNestedScopes
  On Error GoTo 0
  CheckError 5
  Erase rows
  Erase numbers
  ReDim rows(0 To 3)
  ReDim numbers(0 To 3)
  Debug.Assert UBound(rows) = 3
  Debug.Assert UBound(numbers) = 3
End Sub
Public Sub CheckNativeScopes()
  CheckNestedReferences
  CheckWithValues
  CheckWithControlFlow
  CheckWithErrorFlow
  CheckEachLive
  CheckEachSuspension
  CheckFailureCleanup
  Debug.Print "NATIVE_SCOPES_OK"
End Sub`}
];}
export function scopesProject(){return {schema:1,name:'NativeScopes',startup:'Sub Main',modules:[...scopeModules(),{name:'ScopeMain',kind:'module',code:'Sub Main()\nCheckNativeScopes\nEnd Sub'}]};}
