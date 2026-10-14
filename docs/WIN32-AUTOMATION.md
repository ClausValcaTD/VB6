# External Automation in native Win32 exports

The direct x86 compiler can activate locally registered COM Automation servers
with `CreateObject` and invoke their properties/methods through `IDispatch`.
The executable imports the system COM/Automation DLLs; it does not contain a
Recordset interpreter, JS runtime, embedded server binary or extracted helper.
An appropriate **32-bit** server/provider must be installed on the target host.
Source export does not certify that an arbitrary ProgID exists there.

## Object storage and dispatch

Projects using the intrinsic CreateObject bind unqualified scalar Object storage
and Object procedure arguments/returns to owned 16-byte Automation VARIANTs.
Control-only projects keep their existing owned HWND-reference ABI and exact
emitted output. This is a bounded native admission rule: private intrinsic HWND
references, source class pointers and COM dispatch references must not be mixed
in one Automation Object slot. Such private references cannot be boxed as an
arbitrary external COM pointer. Arrays of Object, As New Object, WithEvents COM
connection points, imported Declare Object signatures and remote CreateObject
servers are not supported by this path. Typed external interfaces still require
a native type-library binding rather than guessing an IID from a source name.

Chained properties/methods perform real GetIDsOfNames and Invoke calls. Argument
expressions evaluate once in source order, after capturing the receiver. Named
arguments occupy the leading DISPPARAMS slots; ordinary arguments follow in
reverse order. Property puts use DISPID_PROPERTYPUT. Omitted positional arguments
are VT_ERROR/DISP_E_PARAMNOTFOUND. At most 64 actual arguments are admitted.
DISPID values are resolved on the addressed object, not cached globally by name
across unrelated implementations.

Addressable scalar arguments pass exact typed ByRef views. Variant variables use
VT_BYREF|VT_VARIANT; grouping creates an owned value snapshot. Typed array values
are independent boxed SAFEARRAYs, not pointers into the compiler's descriptor.
Fixed inline Strings/records require explicit value grouping where supported;
unsupported raw ByRef layouts are diagnosed. A failed call may have written an
actual ByRef argument, as allowed by COM; its result assignment is not published.

Calls to authored functions named CreateObject are not substituted. Scalar
conversions continue to use the existing Variant rules. Set requires an object
value; Nothing and uninitialized Object slots remain null references. Is compares
canonical IUnknown identities, not unrelated interface addresses. With holds its
own snapshot for the lexical block.

## Ownership, errors and thread boundary

COM initialization is lazy and tied to the native application's thread. Nested
calls reuse the apartment; a different-thread use is rejected. Normal application
shutdown releases owned globals/static Variant storage before matching
CoUninitialize. Existing abrupt End/ExitProcess semantics are unchanged.

Receivers, arguments and results have explicit owners. An Invoke result is moved
from an initialized temporary; a returned ByRef view is copied before its source
can disappear. Partial failure results and queried interfaces are released before
raising a VB error. EXCEPINFO deferred fill and IErrorInfo are captured **before**
cleanup can replace thread error information. BSTR source, description and help
metadata transfer to the ordinary Err object with the caller's source/Erl.
Successful calls do not clear an existing authored Err. Unknown members, bad
arity, type mismatch and failed activation remain observable errors.

This is a COM client, not a COM server or an OCX container. It does not supply
IDispatchEx, external connection points or a license for third-party components.

## Tests and next integration layer

`win32-automation.test.mjs` executes whole emitted procedures against explicitly
labelled external API/vtable doubles. `win32-automation-fixture.mjs` independently
uses the installed Windows ADODB.Recordset, real Fields/Sort/Clone/GetRows and
error metadata. Only the exact revision's Windows execution report constitutes
native acceptance. Compiling that fixture is not an execution pass.

Grid data binding is a separate native layer. Automation alone does not complete
provider configuration, persistence, grid synchronization, or the original Data,
SQLite, REST and GraphQL application exports.

Primary contracts: [IDispatch::Invoke](https://learn.microsoft.com/windows/win32/api/oaidl/nf-oaidl-idispatch-invoke),
[GetIDsOfNames](https://learn.microsoft.com/windows/win32/api/oaidl/nf-oaidl-idispatch-getidsofnames),
[EXCEPINFO](https://learn.microsoft.com/windows/win32/api/oaidl/ns-oaidl-excepinfo),
[ADO Fields.Append](https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/append-method-ado),
and [GetRows](https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/getrows-method-ado).
