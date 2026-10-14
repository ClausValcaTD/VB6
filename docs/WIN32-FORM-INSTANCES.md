# Independent native Form instances and MDI

The direct Win32 backend admits independently owned instances of an ordinary
Form prototype. A typed Form declaration or `New <FormName>` activates the
instance-based path. Without that demand, the existing static Form backend and
its compiled application output are unchanged. This is native IA-32 and HWND
execution, not an embedded source interpreter or a swap between global copies
of one prototype's mutable state.

## Reference and window lifetime

A concrete Form type and the `Form` union support typed assignment, `As New`,
`Nothing`, `Is`, `TypeOf`, function returns, exact ByRef slots and retained ByVal
arguments. The prototype name denotes its separately owned default instance;
`Me` always denotes the actual receiver. User fields and procedure Static fields
are object-relative. Each created window owns a separate reference until
`WM_NCDESTROY`; each window or control callback temporarily retains its receiver.
Closing a window does not destroy an object still held by a variable or Collection.
Subsequent UI access can recreate that object's window and run Form_Load again.

The allocation embeds a canonical IUnknown interface. When a Form is stored in
a Variant or Collection, the physical Automation tag is VT_UNKNOWN. OleAut32's
normal copy/clear operations use that emitted interface's AddRef and Release;
no extra wrapper is allocated per boxed reference. The language-visible VarType
is vbObject and TypeName preserves the concrete Form name. Retrieving a Form
checks the canonical interface and, where required, its concrete type. This is
not arbitrary IDispatch, external OCX or general COM object dispatch.

The owning HWND has a canonical property identifying its Form. Child HWND slots,
common-control state, Tag and font ownership are stored in that Form's allocation.
Callback routes compare the actual HWND, not only a designer control name.
Reference/epoch snapshots ensure that an operand which unloads and recreates a
window cannot publish a setter into the replacement, including exact HWND reuse.
An old child-control reference remains invalid after the Form is reloaded.

Creation checks allocation, HWND, property, subclass and font operations. A
private rollback owner disposes unpublished children and GDI resources before
releasing the allocation; a failed native destruction does not authorize freeing
live HWND state. A Form_Load error preserves its original owned Err metadata,
unloads the failed window and permits a later retry on the retained object.
Ordinary class lifetime services and their error-state boundaries are reused.

## MDI behavior

An MDI parent uses an actual MDICLIENT. Independent child windows are created by
CreateMDIWindowW and use DefMDIChildProcW for default processing. ActiveForm reads
the current native MDI child and returns a retained Form reference; it is Nothing
when there is no active child. Arrange supports cascade, horizontal and vertical
tiling, and icon arrangement through the corresponding native MDI messages.

The existing MDI parent remains in the static backend. Its close path enumerates
current child windows rather than consulting a single default child slot. Each
child receives QueryUnload and Unload, can cancel the close, and can modify other
windows while handling the event. Enumeration reacquires the current native
child after every successful close rather than carrying a stale successor.
A child veto keeps the MDI parent alive. The close traversal is bounded and does
not allocate a list of all documents.

## Current admission limits

The independent-instance path currently admits scalar designer Label,
CommandButton, TextBox, CheckBox, OptionButton and Frame controls. Those controls
have distinct HWNDs, fonts, Tag and common property state. Nested scalar Frames
forward native notifications to their own Form. Implemented keyboard callbacks
retain ByRef KeyAscii/KeyCode cancellation and Unicode replacement, including a
handler that unloads its own receiver.

Form admission includes Initialize, Terminate, Load, Resize, Activate,
Deactivate, QueryUnload and Unload. Intrinsic properties include Caption, hWnd,
Name, Visible, Enabled, WindowState, ScaleMode, ScaleWidth and ScaleHeight.
Twips and Pixels remain distinct. Show is currently nonmodal (mode zero only);
Hide, SetFocus and Refresh use the native window. Unsupported owner/modal Show
forms and other independent-instance members are diagnosed rather than silently
changing their behavior.

Menus on the independent child, images, KeyPreview, drawing surfaces, additional
control families, designer control arrays and runtime Controls collection
operations on the independent Form are not yet lowered. These do not disable
those features in the existing static Form backend. Surface discovery does not
attach independent Forms to shared prototype drawing state. This admission is
sufficient for the unchanged bundled MDI sample, not complete VB6 Form parity.
Reference cycles still require explicit release; there is no tracing collector.

## Performance and validation

Object field/control addressing is direct. Capturing a Form does not copy a
prototype-wide bank of HWNDs, control data or user fields. Boxing uses the
embedded interface and no per-copy heap wrapper. Window recreation allocates
fresh HWND/GDI state while retaining object identity. Registry disposal is
linear in the instance's controls; child lookup in ordinary source is direct.
These are algorithmic properties, not measured Windows hardware throughput.

The `win32-form-instances`, `win32-form-interface` and
`win32-form-boundaries` suites execute emitted IA-32 with explicitly labelled
foreign API doubles or check fail-closed compilation. They include independent
state, cancellation, real emitted IUnknown reference operations, creation failure
injection, Unicode input, destruction during callbacks, same-value HWND reuse,
Form_Load error recovery, default instances and forbidden shared drawing state.
They are not Windows executions.

`tools/win32-mdi-sample-fixture.mjs` preserves every original MDI statement and
designer object, appends a verifier and adds a separate startup driver. Its
assertions use real menu commands, MDI messages, child HWNDs, native text readback,
close cancellation and GDI handle counts. The wholly unchanged sample is compiled
separately at O0/O1/O2. The new fixture is included in the independently enumerated
Windows matrix and retains the existing executable size limit and timeout.
Consult the exact candidate's Windows execution.json before claiming native
acceptance; a passed compiler or mocked instruction test is not such a result.

Primary contracts: [Using MDI](https://learn.microsoft.com/windows/win32/winmsg/using-multiple-document-interface),
[CreateMDIWindowW](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-createmdiwindoww),
[MDI messages](https://learn.microsoft.com/windows/win32/winmsg/multiple-document-interface-messages),
[IUnknown](https://learn.microsoft.com/windows/win32/api/unknwn/nn-unknwn-iunknown),
and [VariantCopy](https://learn.microsoft.com/windows/win32/api/oleauto/nf-oleauto-variantcopy).
