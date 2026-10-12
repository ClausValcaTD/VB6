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
node --test tests/language-like-parity.test.mjs tests/language-array-parity.test.mjs tests/language-property-parity.test.mjs
node --test --test-concurrency=4 tests/*.test.mjs
python tools/browser-language-parity.py
python tools/browser-tests.py
node tools/bench-language-runtime.mjs --root /path/to/checkout
node tools/bench-language.mjs --root /path/to/checkout
```

The browser language suite checks both the built runtime and the real IDE's run iframe and Output channel. Benchmarks are non-gating, validate results, exclude fixture creation and retain every sample. Keep revision-specific results with CI/release evidence; do not interpret a targeted runtime gain as a compiler-wide or whole-application speedup.

## Primary references

- [Microsoft ReDim statement](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/redim-statement)
- [MS-VBAL ReDim semantics](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/22b5d372-0a54-4617-9462-4934b5edc88c)
- [MS-VBAL Like expression](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/792d4f80-72c1-49da-98a7-37d5783a8615)
- [MS-VBAL evaluation to a data value](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/ff101375-b301-4cba-80b9-e1ab59f7a8be)
