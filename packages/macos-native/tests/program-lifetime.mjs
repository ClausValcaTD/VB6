/** Source acceptance for normal program-root cleanup and default form lifetime. */
export function programLifetimeProject() {
  return {schema:1,name:'NativeProgramLifetime',startup:'Sub Main',modules:[
    {name:'RootProbe',kind:'class',code:`Option Explicit
Public Label As String
Private Sub Class_Terminate()
  Debug.Assert ExitFile > 0
  Debug.Assert BodyFinished
  Debug.Assert Not WasAbrupt
  Print #ExitFile, Label
  Debug.Print "NATIVE_ROOT_RELEASED:" & Label
End Sub`},
    {name:'Main',kind:'module',code:`Option Explicit
Public ExitFile As Integer
Public BodyFinished As Boolean
Public WasAbrupt As Boolean
Private globalProbe As RootProbe
Private values(0 To 1) As Object
Private Sub SaveStatic()
  Static remembered As RootProbe
  Set remembered = New RootProbe
  remembered.Label = "static"
End Sub
Sub Main()
  ExitFile = FreeFile
  Open "native-program-lifetime.txt" For Output As #ExitFile
  Set globalProbe = New RootProbe
  globalProbe.Label = "global"
  Set values(0) = globalProbe
  Set values(1) = New RootProbe
  values(1).Label = "array"
  SaveStatic
  BodyFinished = True
  Debug.Print "NATIVE_PROGRAM_BODY_OK"
End Sub`}
  ]};
}
export function formLifetimeProject() {
  return {schema:1,name:'NativeFormLifetime',startup:'Sub Main',modules:[
    {name:'Main',kind:'module',code:`Option Explicit
Public Initialized As Long
Public Loaded As Long
Public Unloaded As Long
Public Terminated As Long
Public CancelClose As Boolean
Public LastUnloadMode As Integer
Public FailInitialize As Boolean
Sub Main()
  Set Form1 = Nothing
  Debug.Assert Initialized = 0
  Dim localForm As Form1
  Set localForm = New Form1
  Debug.Assert Initialized = 1
  Debug.Assert Loaded = 0
  localForm.State = 41
  Debug.Assert localForm.UserValue = 41
  Debug.Assert localForm.ReadState() = 41
  Debug.Assert Loaded = 0
  Load localForm
  Debug.Assert Loaded = 1
  CancelClose = True
  Unload localForm
  Debug.Assert Unloaded = 0
  Debug.Assert LastUnloadMode = 1
  CancelClose = False
  Unload localForm
  Debug.Assert Unloaded = 1
  Debug.Assert Terminated = 0
  Debug.Assert localForm.UserValue = 41
  Debug.Assert localForm.ReadState() = 41
  Debug.Assert Loaded = 1
  Set localForm = Nothing
  Debug.Assert Terminated = 1
  Set localForm = Form1
  Debug.Assert Initialized = 2
  localForm.State = 52
  Set Form1 = Nothing
  Debug.Assert Terminated = 1
  Debug.Assert localForm.ReadState() = 52
  Set localForm = Nothing
  Debug.Assert Terminated = 2
  FailInitialize = True
  On Error Resume Next
  Set localForm = Form1
  On Error GoTo 0
  Debug.Assert Err.Number = 5
  Err.Clear
  Debug.Assert Terminated = 2
  FailInitialize = False
  Set localForm = Form1
  Debug.Assert Initialized = 4
  Set Form1 = Nothing
  Set localForm = Nothing
  Debug.Assert Terminated = 3
  Debug.Print "NATIVE_FORM_LIFETIME_OK"
End Sub`},
    {name:'Form1',kind:'form',form:{name:'Form1',type:'Form',properties:{Caption:'Native form lifetime',ClientWidth:3000,ClientHeight:1800},controls:[]},
     code:`Option Explicit
Public State As Long
Public Property Get UserValue() As Long
  UserValue = State
End Property
Public Function ReadState() As Long
  ReadState = State
End Function
Private Sub Form_Initialize()
  Initialized = Initialized + 1
  If FailInitialize Then Err.Raise 5
End Sub
Private Sub Form_Load()
  Loaded = Loaded + 1
End Sub
Private Sub Form_QueryUnload(Cancel As Integer, UnloadMode As Integer)
  LastUnloadMode = UnloadMode
  If CancelClose Then Cancel = 1
End Sub
Private Sub Form_Unload(Cancel As Integer)
  Unloaded = Unloaded + 1
End Sub
Private Sub Form_Terminate()
  Terminated = Terminated + 1
End Sub`}
  ]};
}
