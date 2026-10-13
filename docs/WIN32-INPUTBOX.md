# Native InputBox

The freestanding Win32 compiler emits a standard Unicode dialog template and an
IA-32 dialog procedure for InputBox/InputBox$. The system dialog manager owns the
modal loop, default and Cancel buttons, keyboard navigation, and owner disabling
and restoration. This does not embed a browser, interpreter or binary template.
Only programs which call the intrinsic link this code and its user32 imports.

Prompt, title, default text and explicit x/y positions support positional,
omitted and named arguments. Operands are captured once in source order before
resolving the active thread window as owner. Omitted title uses the project name.
Explicit positions are twips converted with the screen device DPI. Omitted
positions center horizontally and place the dialog approximately one third down
the primary screen. Prompt ampersands are literal; multiline prompt text is
supported by the static control. Controls use the standard system dialog font.

The native single-line EDIT has a 255-unit limit. Return values are bounded to
254 UTF-16 units and stop at the first NUL, CR or LF. OK returns an owned counted
String; Cancel, Escape and window-close return a zero-length String. Native
creation/text failures raise error 5; result allocation failure raises error 7.
The original destination is unchanged when assignment fails. Legacy helpfile
and context arguments are checked for pairing and then diagnosed as unsupported,
not silently ignored. This is not a WinHelp or Excel Application.InputBox host.

Each call has its own stack-local input/result state. Nested modal calls cannot
reuse another call's state. Callback entry saves and clears the native VB error
frame; failures are recorded without jumping across a Windows stack frame. The
caller restores normal VB error dispatch only after DialogBox returns. Returned
BSTRs are transferred to ordinary expression ownership; cancellation and failed
creation release any unpublished result. Successful dialog operations do not
clear the caller's existing Err metadata.

`tests/win32-inputbox.test.mjs` executes the emitted caller and callback with
explicit foreign Windows doubles, validates the dialog-template layout, source
operand order, Unicode/truncation, nested ownership, and allocation/API failures.
These tests are not Windows execution. `tools/win32-inputbox-fixture.mjs` adds
actual Windows acceptance: a same-process timer interacts with the real #32770
and EDIT HWNDs, supplies Unicode text, and posts OK/Cancel/close messages. It
checks native edit limits, defaults, positions and timer cleanup. Consult the
exact revision's Windows execution artifact for that run's result.

Primary contracts:
- [InputBox](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/inputbox-function)
- [DLGTEMPLATE](https://learn.microsoft.com/windows/win32/api/winuser/ns-winuser-dlgtemplate)
- [DialogBoxIndirectParamW](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-dialogboxindirectparamw)
- [EndDialog](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-enddialog)
