# Procedure-local storage

Classic procedure-local `Dim`, `Static` and `Const` declarations establish storage
before executing the procedure body, after argument binding. The source VM no
longer depends on control reaching a declaration. A declaration inside a skipped
If, loop or Select case, or bypassed by GoTo, still supplies its local binding.
In particular, writes cannot fall through to a same-named module variable simply
because a local Dim was skipped.

Ordinary locals, fixed arrays and records are independent per invocation, including
recursive calls. Static storage keeps the existing per-procedure/per-instance
lifetime. As New creates a lazy variable, not an object: allocating its local slot
does not run Class_Initialize. Implicit ReDim declarations retain the binder's
existing rules and are not allocated twice when an explicit Dim also exists.
Fixed dimensions use their existing bound metadata, and allocation limits remain
unchanged. Failure to allocate a local propagates to the caller before the body
executes; a body-level error handler has not yet been installed.

`src/runtime/local-storage.js` creates metadata-only plans, weakly associated with
procedure objects. A plan is reused only while both the bytecode array and implicit
ReDim binding list are unchanged. It never stores a live Cell, value, frame or
object instance. Entries reference existing bound declaration metadata rather
than rewriting syntax. Code replacement invalidates plans; retained code revisions
continue using their own procedure objects and invocation storage.

The existing bytecode, labels, source lines, sequence points and instruction budget
are unchanged. Dim instructions check for already allocated local slots rather
than repeatedly invoking asynchronous declaration setup, including on loop
back-edges. Newly initialized locals are visible at the debugger's first executable
statement. Existing live-edit restrictions on active local layout changes remain.

## Validation and boundaries

`tests/language-local-storage.test.mjs` covers scope, default values, arrays,
records, constants, ByRef aliases, recursion, Static lifetimes, first-use As New,
allocation failure order, debugger access, code replacement and plan reuse.
`tools/local-storage-browser-fixtures.mjs` is included in the normal language
browser suite through `parameter-browser-fixtures.mjs`. Its projects run through
the built runtime and actual IDE Run/Output path, not an independently imported VM.

The existing nonclassic initialized-Dim extension (`Dim x As Long = expression`)
keeps its prior statement-time behavior and is not promoted to procedure-entry
execution. This compatibility increment does not add new source grammar, promise
complete compile-time name checking, remove native/compute/migration diagnostics,
or certify native/COM initialization, release and destructor behavior. Source
runtime tests are not licensed Microsoft VB6 differential certification.

```sh
node --test tests/language-local-storage.test.mjs
node tools/build.mjs
python tools/browser-language-parity.py
node tools/bench-local-storage.mjs --root /path/to/checkout
```

The benchmark checks complete source outputs and stable instruction counts. It
collects declaration-call counts separately from timing and retains every sample.
It includes the additional cost of allocating previously skipped declarations;
that correctness cost must not be hidden behind the loop-dispatch improvement.

Primary references: Microsoft [MS-VBAL Procedure Declarations, invocation step 4](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/227005ad-78fb-479f-8145-fa3b8b610386),
[Local Variable Declarations](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/7e93afc7-de6f-4c25-a139-164e92271d00),
and [Variables and extent](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/6fd5c596-7ce4-4b61-a8ce-42534465428f).
