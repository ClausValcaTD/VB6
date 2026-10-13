# Array storage, source properties and Like matching

These contracts describe the independent browser compiler/runtime. Microsoft language documentation informs the behavior; it does not certify complete Microsoft VB6 compatibility or replace execution against a licensed VB6 oracle.

## Declarative ReDim and storage lifetime

`src/language/redim-semantics.js` binds ReDim declarations against procedure and module storage before execution. ReDim may declare a dynamic local array under Option Explicit. A later explicit declaration or an accessible public module variable takes precedence over an implicit local. Binding is rebuilt each validation pass; cached statement syntax is not rewritten into a variable declaration.

A dynamic local array exists throughout its procedure, including when Dim appears after the first ReDim. Parameters keep their supplied storage. Explicit Static declarations and Static procedures retain their array storage between calls.

The common frontend diagnoses malformed ReDim declarations, fixed arrays, incompatible declared element types, constant/non-Variant scalar targets, and ParamArray resizing. `VB_REDIM_FIXED` and `VB_REDIM_TYPE` distinguish the fixed-storage and type cases; target adapters may map them to their existing public diagnostic codes.

`src/runtime/redim.js` resolves storage and evaluates bounds once. An array held in a Variant may change its element type only without Preserve. A typed array's element type remains invariant. A type/allocation/bounds failure must leave the prior array, bounds, contents and scalar tags intact.

Array assignment preserves the target descriptor's fixed/dynamic nature. Copying a fixed array into dynamic array storage gives the target an owned resizable descriptor, without making the fixed source resizable. Array temporaries passed through grouped expressions have independent typed storage.

## Typed procedure results

`Function ... As T()` and `Property Get ... As T()` carry `returnArray` in the common procedure metadata. Explicit bounds in a return type are invalid. Return storage is an owned dynamic array with the declared element type. A reference to the procedure's own array name accesses its result storage, not a recursive scalar invocation.

A parameterless array-returning procedure can be evaluated and then indexed according to the argument-list evaluation rules. Interface and property accessor validation includes array shape, not just the element type name. Record arrays retain factories for field defaults; object/class array elements initialize to Nothing.

`src/runtime/procedure-storage.js` supplies reusable typed-array cells and result storage. Code creating or copying these cells must preserve type checks, descriptor ownership and record factories.

## Preservation performance and invariants

The storage model is row-major with a contiguous final dimension. ReDim Preserve copies retained row spans directly, including their existing scalar tags. It avoids per-element coordinate generation, get/coerce/set dispatch, and replacement of retained record fields with new aliases. Enumeration order remains independently defined by the existing array enumerator.

Allocation happens before the old descriptor is committed. Rank, unchanged earlier dimensions, lower-bound restrictions, fixed-array guards, overflow checks and allocation limits remain authoritative. This is not a general implementation of native SAFEARRAY locking or all interop lifetime rules.

Compiled For/For Each instructions retain their parsed control-variable expression in `variable`. The semantic checker and VM reuse it; a parse fallback remains for older manually constructed IR without that field.

## Borrowed array storage and enumeration lifetime

`src/runtime/array-lifetime.js` tracks temporary source-runtime array locks in WeakMaps, not in cloned values or exported descriptors. Each lease scope retains an array at most once. Distinct nested invocations hold independent retains and release them in `finally`, including argument validation/evaluation failures, host exceptions and debugger cancellation. Statement execution reuses one scope per execute invocation, clearing its retained set after each statement; it does not allocate a scope for every scalar instruction. Loop and With reconciliation runs at actual control transfers, handler/GoSub state changes and live-code replacement, not ordinary fall-through. It also checks the destination after a paused checkpoint resumes. The execution scope is installed once per invocation and releases only nonempty statement leases; recursive calls retain independent scopes.

A direct array element passed ByRef is retained as soon as its address is captured, before evaluating later arguments. The lease ends when that call completes, not at the end of its containing expression. Record fields and nested Variant arrays inherit their containing array owners; ordinary object-instance fields do not. Whole-array ByRef parameters remain resizable. Grouped expression temporaries and ByVal arguments do not borrow the original element storage. Source events retain arguments across all sinks and the host callback.

Array assignment targets and indexed property ByRef arguments remain valid while their right-hand sides evaluate. `ReDim`, `Erase`, and replacement of a locked Variant array report Error 10 without changing the old descriptor, contents or scalar tags. Value copies receive independent, unlocked descriptors.

For Each holds its source array until the loop terminates. Normal completion, Exit For, jumps out of the loop, procedure exits and stack unwinding release it. GoSub and active error handlers suspend rather than terminate the originating loop; Return and Resume reconcile the actual destination. Paused debugger frames keep their leases; reset releases them when those frames unwind. Versioned live editing retains the old invocation's enumeration state.

This is managed source-runtime lifetime tracking, **not a native SAFEARRAY locking ABI**. COM-marshaled aliases, arbitrary native pointers, native/compute compiler lock-equivalence and undocumented Microsoft implementation quirks remain separate compatibility work.

## With receiver identity and lifetime

The compiler emits lexical With identifiers and endpoints. The source VM retains the owner of a record-array element for the entire With activation, including nested record fields. A UDT variable remains an alias; a grouped expression or function/property result uses an independent record value. Class/object receivers preserve the captured object reference without borrowing the array descriptor or invoking a default property. Receiver/index expressions execute once.

Leading-dot access binds to its lexical initializer. Skipping an initializer or resuming after a failed nested With produces Error 91 rather than accidentally selecting an outer receiver. GoSub and error handlers suspend live leases but do not expose them as unrelated receivers. End With, explicit loop exits, jumps outside the block, procedure returns, unhandled exceptions and debugger reset release ownership. Paused automatic watches use the lexical context of the paused statement. Explicit evaluation distinguishes the suspended caller from a running evaluation callee. Each Immediate statement has its own target lifetime, including multiple statements in one command, RHS failures and cancellation. Leaving Immediate never leaks a new lease into the paused statement or releases its persistent With lease.

`tests/language-with-lifetime.test.mjs` tests ownership, rvalues, nested receivers, once-only evaluation, control flow, failure atomicity and debugger cleanup. This source-runtime implementation does not claim native SAFEARRAY lock/COM ABI equivalence or licensed Microsoft VB6 differential certification.

## With arguments and case-insensitive record access

An implicit call such as `Bump .Value` passes the lexical With member as its first argument. `Bump.Value` remains a qualified callee. `Call Bump(.Value)` passes the variable ByRef when declared; `Bump(.Value)` retains the grouped-expression temporary rule. Named, omitted and additional arguments preserve their source order and classifications.

Logical-line construction optionally retains explicit continuation offsets for the compiler. A continued callee (`object _` followed by `.Bump .Value`) therefore remains qualified without swallowing the following With argument. The offsets survive labels, colon splitting, inline If branches and conditional preprocessing; the default logical-line API and physical starting line remain unchanged.

Record reads, writes and ByRef references share a field lookup helper. Exact spelling uses the existing field map; mixed casing builds a weak per-map key index instead of allocating and scanning every field on every access. It stores original keys rather than cells, preserves record/array assignment aliases and Variant tags, and does not share storage between clones. Class-instance maps already use canonical keys and no longer need a copied entry-array scan.

## Allocation-bounded array iteration

The array iterator advances the first subscript fastest while storage remains last-dimension contiguous. It calculates rank-sized counters and strides once per traversal and yields offsets without allocating coordinates or converting subscripts for each element. Public indexed access still validates subscripts. The scalar iterator preserves the stored VB subtype and Variant tag; the raw iterator preserves its ordinary JavaScript-value contract.

`tools/bench-array-iteration.mjs` compares independent source roots, validates an order-sensitive checksum and subtype counts after every warmup/sample, and records all samples. This is an array-traversal benchmark, not a compiler-wide or whole-IDE speed claim.

## Typed-array live editing

Strict Edit and Continue includes `returnArray` in procedure signatures. A scalar/array return-shape change is rejected before mutating active procedure/result storage. Versioned editing may retain the old invocation and give subsequent invocations the new signature. Both policies validate persistent implicit ReDim declarations in Static procedures, not only authored Static/Dim statements.

## Authored property writes

`src/runtime/property-reference.js` resolves authored property assignment before evaluating a getter. `Let` and `Set` select their own accessors rather than selecting whichever accessor exists first. A wrong assignment kind receives a read-only diagnostic.

The receiver and indexed argument expressions are evaluated once in source order. ByRef indexes remain aliases. Named interface invocation binds argument names to the public signature, not private implementation parameter names. Missing required arguments and access restrictions are checked before invoking the setter.

Write-only properties must not require a getter. An array-valued parameterless getter can be evaluated and its result indexed; that index is not a fictitious property parameter. Host/COM objects continue through their separate adapter and are not assumed to be authored source instances.

## Like grammar, errors and resource bounds

`src/runtime/like.js` exports `compileLikePattern` and `matchLike`. The values layer uses the same matcher for runtime operators and compiler constant evaluation.

The matcher handles wildcard/digit tokens, character lists/ranges and negation, literal escapes, zero-width `[]`, UTF-16 characters including NUL/CR/LF, and Error 93 when invalid pattern syntax is reached. A mismatch before a malformed suffix can return False; encountering a star validates the remaining pattern according to the documented matching rules.

Matching uses one restart position without a backtracking regular expression or recursion. The worst-case bound is O(input length × pattern length) token comparisons; class membership additionally scans the ranges in that class. This is not a universal linear-time claim.

Compiled syntax is immutable. The LRU is bounded by 128 entries and 65,536 total input characters; oversized patterns are not cached. Matched source strings are never retained. Option Compare Text currently uses invariant case folding, not full Windows LCID collation or ligature expansion.

## Export boundaries

The native x86 and compute targets currently reject typed-array procedure returns because their return ABIs are not implemented. The VB.NET migrator reports blocking `MIG_ARRAY_RETURN` diagnostics and retains its unresolved-migration MSBuild guard. Ordinary export refuses that unresolved conversion; an explicit review bundle is not a certified buildable conversion.

Do not remove these diagnostics until the target has typed return storage, call/ownership handling and executable conformance tests. Frontend acceptance is not proof of backend support.

## Reproduction and regression coverage

The three `tests/language-*-parity.test.mjs` suites cover matching, arrays and properties. Like validation includes an independent dynamic-programming oracle, malformed syntax, cache isolation and an adversarial wildcard case. Array tests cover retained tags/aliases, failure atomicity, Static lifetime, declared/implicit storage, result factories and target diagnostics. Property tests also execute the unchanged SDK setter-order fixture through the VM.

```sh
node tools/build.mjs
node --test tests/language-*-parity.test.mjs tests/language-array-lifetime.test.mjs tests/language-array-live-edit.test.mjs tests/language-with*.test.mjs tests/language-record-lookup.test.mjs
node --test --test-concurrency=4 tests/*.test.mjs
python tools/browser-language-parity.py
python tools/browser-tests.py
node tools/bench-language-runtime.mjs --root /path/to/checkout
node tools/bench-language.mjs --root /path/to/checkout
node tools/bench-array-iteration.mjs --root /path/to/checkout
node tools/bench-language-execution.mjs --root /path/to/checkout
```

`bench-language-execution.mjs` additionally measures complete source execution for scalar loops, array loops, element-ByRef calls and 64-field record With loops, so pure-iterator gains are not mistaken for whole-VM speedups. It excludes compilation and VM construction, includes module initialization, checks output and instruction counts, and disables scheduler yields only in this CPU benchmark.

The browser language suite checks both the built runtime and the real IDE's run iframe and Output channel. Benchmarks are non-gating, validate results, exclude fixture creation and retain every sample. Keep revision-specific results with CI/release evidence; do not interpret a targeted runtime gain as a compiler-wide or whole-application speedup.

## Primary references

- [Microsoft ReDim statement](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/redim-statement)
- [MS-VBAL ReDim semantics](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/22b5d372-0a54-4617-9462-4934b5edc88c)
- [MS-VBAL Like expression](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/792d4f80-72c1-49da-98a7-37d5783a8615)
- [MS-VBAL evaluation to a data value](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/ff101375-b301-4cba-80b9-e1ab59f7a8be)
- [Microsoft Error 10: fixed or temporarily locked arrays](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/this-array-is-fixed-or-temporarily-locked-error-10)

- [MS-VBAL With statement semantics](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/52caae3d-3ded-436f-a36a-8d5a30c21600)

- [MS-VBAL Call statement and With argument whitespace](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/f7c864a8-8fce-49dc-8347-30dc749d6576)
- [MS-VBAL member access and explicit continuation](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/af3a4059-3059-4e79-8aa5-685324fb266a)

## Compile-time fixed dimensions and diagnostic reuse

Fixed bounds on `Dim`, `Static`, module variables, and record fields are now bound
as constant expressions in their declaring module/procedure. Forward and imported
constants, private-module visibility, ambiguity, enum members and `Option Base`
use the existing binder. Each endpoint is Let-coerced to `Long` with the existing
checked half-even numeric conversion; a lower bound above its upper bound is a
compile-time diagnostic. User function calls and variable reads cannot size fixed
arrays. `ReDim` still evaluates runtime expressions once, and its declarations
never acquire fixed-bound metadata.

The declaration's original `bounds` syntax is retained. Successful binding adds
immutable `boundValues`; rebinding clears its value before evaluating again, so
an edited or removed dependency cannot leave a previous successful dimension in
an invalid program. Compilation does not allocate array elements or replace the
runtime's separate allocation limit. Numeric literals are interned only within
one binding pass, up to 256 entries, with separate subtype identities; negative
zero, authored overflow, and expression-complexity checks are preserved. Fixed
metadata keeps a stable declaration shape during edits instead of deleting and
recreating the property on every binding pass. The source VM consumes dimensions for
fixed declarations and record fields. This also fixes imported record arrays
resolving a private bound or implicit base from the caller's module.

The diagnostics cache retains at most one completed semantic result, in addition
to its existing module syntax entries. It can skip the semantic pass only when
all ordered module entries, detached layout/form metadata and compiler settings
match. Any source/dependency, module-order, declaration, attribute, layout or
settings change triggers whole-project revalidation. This is **unchanged-snapshot
reuse**, not partial dependency-graph compilation. Returned diagnostics are
caller-owned copies. Cancelled/interleaved generators cannot publish an
incomplete result or swap a suspended generator's layout context; clearing the
cache prevents an older generator from repopulating it. Existing `stats` fields
are unchanged; the result adds a `semanticCacheHit` boolean.

Tests: `language-fixed-bounds.test.mjs`, `diagnostics-semantic-cache.test.mjs` and
additional shipped-runtime/actual-IDE fixtures in `browser-language-parity.py`.
The browser runner checks rejected declarations cannot start an application and
exercises repeated snapshots, dependency edits, and repairs in both the real
bundled worker and the yielding main-thread fallback.
`node tools/bench-declarations.mjs --root <checkout>` reports cold compilation,
unchanged diagnostics, changed public-constant dependencies, and complete VM
execution of repeated fixed-array declarations. It checks results, retains every
timing sample, and does not gate CI on hardware-dependent timing thresholds.

References: Microsoft MS-VBAL 5.2.3.1.3, [Array Dimensions and Bounds](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/7c97ad30-4b76-45d9-9827-7455f98a5503),
and [Declaring arrays](https://learn.microsoft.com/en-us/office/vba/language/concepts/getting-started/declaring-arrays).
These references support this declaration increment; they are not certification
against the licensed Microsoft VB6 compiler or every native/COM array ABI.

## Scoped record declarations and nominal identity

`RecordTypeIndex` resolves record declarations by module, visibility and qualified
name. Each compiler pass and runtime owns its index; there is no global cache of
project syntax. Local declarations shadow imported records, private types are
visible only in their module, and ambiguous imports are diagnosed rather than
resolved by module order. `typeScopes` retains the authored visibility without
changing the public `types` field-list representation. Declared record variables,
parameters, results, fields, events and ReDim types share these checks. Records
cannot be instantiated with `As New`, used as `WithEvents` sources or declared as
Optional/ByVal record parameters. This pass resolves project records, not every
external type library or arbitrary undeclared object type.

The VM uses the declaration index for schema lookup, including the common miss
for scalar types, instead of scanning all modules for each declaration. Record
construction resolves nested field types in their *declaring* module, consumes
already-bound dimensions, and initializes typed object fields to Nothing. An
imported record's private member type cannot be replaced by a caller-local type
with the same spelling. Existing recursion and value-allocation limits remain.

Records carry an internal symbol-keyed nominal identity; this metadata neither
adds a reserved source-field name nor changes TypeName or binary file bytes.
Value copies, typed array factories, grouped temporaries, procedure results and
Binary/Random Get retain it. Equal field layouts and short type names do not make
two modules' distinct private record declarations interchangeable. A mismatch
raises Error 13 before overwriting a typed target. Qualified and unqualified names
for the same accessible declaration are interchangeable in source calls, property
and interface signatures, typed arrays and ReDim. Whole-array aliases keep the
original declaration's identity even when a caller shadows its type name.

Strict and versioned live editing include record visibility in the module storage
contract; incompatible visibility edits require a restart before live state is
changed. Background diagnostics rebind against edited record providers. The
normal IDE/runtime browser suite includes qualified records, rejected private/New
uses, nominal mismatch atomicity, nested provider schemas, typed results and file
roundtrips. The existing native private-record regression now asserts the earlier
frontend diagnostic's code, source and line instead of waiting for a generic
native storage error.

`tests/language-record-identity.test.mjs` covers the source-runtime behavior.
`node tools/bench-record-types.mjs --root <checkout>` reports independent cold
compilation, VM construction, and full execution of repeated scalar/record/record
array declarations across many modules, checking outputs and instruction counts
for every sample. Indexing benefits do not imply native ABI equivalence or a
whole-compiler speedup. Native/COM record wire identity, complete recursive record
rules, general type-library binding and cross-project identity remain separate
work; no licensed Microsoft VB6 differential certification is claimed.

Primary references: [MS-VBAL User Defined Type Declarations](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/a5fe374b-eddf-4808-9e73-477914940dba),
[Member Access Expressions: type binding](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/af3a4059-3059-4e79-8aa5-685324fb266a),
and [Entities and Declared Types](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/aaee9b48-168f-4cfe-95d1-14c5cc427b69).

## Record arguments and source-event dispatch

Source calls validate a record rvalue against the formal's declaration identity
before constructing a ByRef temporary. Parentheses and function results may
create independent storage, but cannot reinterpret a same-named private record
from another module. Scalars, Empty, Nothing and object instances cannot become
record temporaries. Matching qualified/unqualified record values are copied with
their identity intact and evaluated once.

Source events validate record aliases and temporaries before any source sink,
source-control enablement hook, host callback or observer is notified, even with
no subscribers. Mismatches raise Error 13. Array-element argument leases still
release on rejection, and matching ByRef aliases still propagate field writes.
The ordinary Cell coercion API and native/COM wire formats are unchanged.
`tests/language-record-arguments.test.mjs` and shipped-runtime/actual-IDE fixtures
cover these paths. This is source-runtime conformance, not a licensed VB6 oracle.

## Typed record destinations versus Variant payloads

Record-array element writes now validate the declared record identity before
coercion, rejecting scalar, Empty, Null, Nothing, array and unrelated object
values with Error 13 while retaining the old element, field aliases and bounds.
Matching typed record writes still copy values into the existing field storage.
This validation also covers unqualified low-level record factories that do not
carry the project index's nominal metadata.

A Variant cell or Variant-array element is not permanently typed by its previous
record payload. It can receive another record type or a scalar, array, Empty,
Null or object value through the applicable assignment operation. Copies remain
independent and scalar subtype tags survive transitions. Typed records containing
Variant fields follow the same rule when the whole record is assigned: the
field's declared Variant type, not its previous payload, determines compatibility.
Typed nested records continue to enforce their declared identity.

`tests/language-record-assignment.test.mjs` and four additional runtime/actual-IDE
browser fixtures test these distinctions. These are source-runtime storage
contracts; external typelib restrictions, complete aggregate lock/lifetime
semantics and native record/COM representation remain separate validation work.
Primary reference: [MS-VBAL Let-coercion to and from a UDT](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/d5727cbc-068f-45f0-8119-7e7f13db9d54).

`node tools/bench-record-assignment.mjs --root <checkout>` measures typed record,
record-array, Variant-record and scalar-array assignment workloads independently.
Compilation and VM construction are excluded; startup/execution, checked output,
fixed instruction counts and every timing sample are retained. Timing is
non-gating and does not establish a compiler-wide speedup.

Direct `ByRef` record arguments must name typed record storage, not a Variant
variable or Variant-array element that happens to hold a matching record. Such
aliases raise Error 13 before entering the procedure or delivering a source
event. Parenthesized Variant record values can still become independent, nominally
checked typed temporaries. This closes the path where writes through a record
formal could otherwise replace its Variant backing storage with a nonrecord.
The source runtime enforces this guard; complete static call-site type checking
and external/native parameter ABI equivalence are not claimed.

Reference: [MS-VBAL Procedure Invocation Argument Processing](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/1fb9af32-fc48-4c4f-998a-ed8047048ca5).
