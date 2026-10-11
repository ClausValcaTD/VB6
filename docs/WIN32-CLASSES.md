# Typed native classes and String mutation

The direct Win32 backend lowers admitted class modules to IA-32 procedures with
a hidden receiver argument. Each `New` allocates a separate owned instance.
Fields and procedure-level `Static` variables live in that allocation, not in
shared module globals. Class methods retain their source locations and execute
as machine code; no source evaluator, JS engine or browser VM is embedded.

## Instance and call contract

Typed scalar class references support `Set`, `Nothing`, `As New`, reference
identity with `Is`, `TypeOf`, `TypeName`, `IsObject`, public/private fields and
methods, and Property Get/Let/Set procedures. A getter or method may return an
owned typed class reference. ByVal passes a retained reference to a separate
callee variable; ByRef exposes an exact-type reference slot. Grouping a ByRef
argument creates an isolated owned slot. A method's receiver is retained before
later actual arguments run, so replacing the original variable during argument
evaluation cannot redirect the call to another instance.

Class fields admit the native scalar types, counted Strings, scalar Variants,
Collections, other typed classes and supported inline records. Array-valued class
fields and arrays of class references are still diagnosed. Methods can use the
already-supported local typed arrays. Interfaces, WithEvents, RaiseEvent,
generic Object/IDispatch values and independent Form instances require further
native implementations; accepting a class module does not certify those paths.

`Class_Initialize` is parameterless and runs after zeroed fields and fixed String
initialization. A failing initializer does not publish a successful constructor
result; partially owned fields are released and the authored error survives.
`Class_Terminate` runs once when the final reference is released. The object is
rooted during that call. A reference retained by the handler keeps it alive
without re-running initialization or repeating termination. Uncaught termination
errors do not bypass field cleanup or replace an existing caller error at the
release boundary. This is the implemented native finalization policy, not a
claim of licensed VB6 differential certification. Reference cycles are not a
tracing garbage collector: break owned cycles explicitly with `Set ... = Nothing`.
`End` retains its existing abrupt-process-exit semantics.

Private class lifecycle services use the existing private error-state scope.
Internal allocation/cleanup calls cannot clear the authored caller's `Err` just
because a service uses an internal Sub, On Error statement or DLL call.

The instance header is private compiler/runtime data. It is **not** an
IUnknown, IDispatch, OCX or external `As Any` object ABI. A typed class reference
cannot silently convert into an integer, Double, Currency, Boolean or String.

`Is` and `TypeOf` return Boolean values, including when boxed into a Variant or
passed to `CStr`. Their -1/0 machine representation must not cause `CStr` to
print numeric text: Boolean conversion uses `True`/`False`, while explicit Long
-1/0 retains numeric formatting. This also applies to String/numeric comparison
results; Variant comparisons still propagate Null.

## Runtime member names

`CallByName` dispatches case-insensitive runtime names to compiled public class
methods, scalar public fields and property accessors. It also admits the
implemented caption/text, visibility, geometry, Tag and font properties of
native controls. The object, name, call type and actual arguments evaluate in
source order. Arguments are owned value snapshots; they do not expose the
original variables as an undocumented late-bound ByRef ABI. A missing member
raises 438 and an incompatible argument count raises 450.

Reflective object-return values and arbitrary COM dispatch are not implemented;
unsupported dispatch remains an error. Direct typed class-return calls use the
owned reference ABI above. Supported control-property names do not imply an
implementation of every other classic intrinsic-control property.

## Counted String statements

`Mid`, `Mid$`, `LSet` and `RSet` capture the addressable String (or Variant
String) destination and its original value before evaluating operands. This
includes pinned typed-array elements and inline fixed String fields. Mutation
creates an owned result rather than writing shared literals or borrowed BSTR
storage. Embedded NUL characters remain counted UTF-16 data.

Mid replacement cannot grow the original String. Its start is one-based and a
negative length is invalid. A zero-length/out-of-range replacement does not
publish a value, including when evaluating its right-hand side changed the
original variable. LSet/RSet pad with spaces to the original width or truncate
the source prefix. Non-String Variant destinations produce a type mismatch;
LSet's unsafe cross-UDT binary-copy form is not implied by String support.

## Validation

`tests/win32-class-execution.test.mjs` and
`tests/win32-string-statements.test.mjs` execute whole emitted IA-32 procedures
against explicitly labelled foreign-API doubles, with exact owner counts,
error-frame checks and receiver/lifecycle cases. They are not executions on
Windows.

`tools/win32-class-fixtures.mjs` extends the independent Windows execution matrix
with class, String and real HWND reflection assertions.
`tools/win32-compatibility-sample-fixture.mjs` retains all the original
Compatibility sample's statements, class and designer objects, adds a separate
startup driver and appended readback checks, and routes real BM_CLICK messages
to its original buttons. The wholly unchanged sample is compiled separately at
O0/O1/O2. Consult the exact revision's Windows `execution.json` for runtime
acceptance, rather than treating compilation or mocked execution as a pass.

Primary contracts: [Static](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/static-statement),
[Initialize](https://learn.microsoft.com/previous-versions/office/aa211389(v=office.11)),
[CallByName](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/callbyname-function),
[Mid](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/mid-statement),
[LSet](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/lset-statement),
and [RSet](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/rset-statement).
