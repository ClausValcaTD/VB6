# Native macOS array storage and returns

Both direct ARM64 AOT and explicit Apple Clang export preserve the shared
frontend's typed-array result metadata. A `Function ... As Long()` or
`Property Get ... As String()` has an independent, initially unallocated dynamic
result array. The result is fresh on every invocation, including a `Static`
procedure; it is not a scalar return slot or a procedure-static local.

Within that procedure, indexing or `ReDim` of its name accesses result storage.
An empty `ResultName()` can be passed as a whole-array ByRef argument. Outside
the procedure, the existing parameterless-function/getter indexing shorthand
invokes the procedure first and indexes the returned array. Interface dispatch
retains the same result shape and ordinary caller/implementation parameter
binding. Unsupported array-valued native Declare and callback ABIs are rejected,
not lowered as scalar return values.

## Ownership and ReDim

Declared array cells retain their element type and array storage policy separately
from scalar Variant cells. Whole-array assignment requires a dynamic destination
and matching element type. It deep-copies array/record values while retaining
normal object-reference identity. Copying a fixed source into a dynamic result or
variable does not make the destination fixed. Array formal parameters validate
element type even when the actual argument is a grouped, non-aliasing temporary;
temporary arrays are copied and independently resizable.

`ReDim` declarations bound by the shared frontend are materialized before native
procedure execution, including implicit declarations under `Option Explicit`.
A declared array cannot change element type. A scalar Variant containing an array
can change element type only without `Preserve`; an Empty Variant can receive a
new array, but an initialized scalar is a type mismatch. Bounds/type/allocation
failures preserve the old value. A same-type resize allocates replacement storage
first, then commits it into the existing descriptor, retaining whole-array aliases
without a second deep copy through the variable setter.

Array-element and nested aggregate references hold shared, scoped leases.
Resizing, erasing or replacing an owning array fails with Error 10 until the
last active reference is released, including after handled or propagated errors.
Whole-array ByRef aliases remain resizable. Record fields preserve declared
fixed-array storage and element types; copied record arrays own independent fields.

A record or nested array value carries weak ancestry to its containing arrays.
Reading a value does not itself keep the parent array alive or locked. A direct
reference, reference `With`, or array enumerator acquires the necessary ownership
for its execution scope. Deep copies clear ancestry; object references preserve
identity without locking the array that happened to contain them. Member-call
arguments resolve once: direct fields remain ByRef, while indirect method/getter
results release their temporary argument references before later arguments run.

Assignments to records preserve the identity of existing fields, so nested
references still address the assigned storage. Validation checks shape and locked
descendants before any field changes; the commit phase uses existing containers
and payload swaps, without allocating or invoking user code. An invalid assignment
does not partially update earlier scalar fields.

## Lexical With and For Each

`With` activations use the shared frontend's lexical IDs and control-flow
intervals, not just the top of a value stack. A skipped or failed inner initializer
raises Error 91 instead of falling back to an outer receiver. Re-entering a block
releases its previous activation before evaluating its new initializer. Direct
record receivers retain storage; grouped and returned record values are independent
copies. Object receivers retain the original object identity even if the source
variable or containing array changes.

Array `For Each` reads the live element at each iteration rather than snapshotting
all elements at loop entry. Its lease protects both the array and containing
aggregate arrays. Natural completion, `Exit For`, jumps, failed initialization,
procedure returns and propagated errors release those leases. Existing object and
Collection enumeration behavior remains separate from this array contract.

Native source checkpoints reconcile active scope intervals. A `GoSub` return
address or active error continuation keeps suspended scopes alive outside their
lexical interval; `Return` and `Resume` restore access to those activations.
Ordinary exits release them. The same source tests run through the browser VM,
generated Clang procedures and direct ARM64 procedures; no runtime AST interpreter
is introduced by this scope tracking.

These are source/storage contracts, not complete Microsoft VB6 array ABI
certification. Native Declare does not expose raw SAFEARRAY pointers. Remaining shutdown
ordering, reference cycles and full native control lifecycle are separate
compatibility work; normal root cleanup is described in the lifecycle guide.

## SDK and validation

The helper ABI is **4**; it preserves the array/scope contracts introduced in
ABI 3 and adds [native resource support](MACOS-RESOURCES.md). The compiler, native
loader and payload-provenance check must agree. ABI 1, ABI 2 and ABI 3 custom or
embedded runtimes are rejected before linking because they do not satisfy the
current combined runtime/resource contract.
Applications already exported with an older SDK are not modified. Mach-O container/layout versions are independent of
the helper ABI; reserved-section layout compatibility requires a matching ABI.

`packages/macos-native/tests/arrays.mjs` supplies the source-level acceptance
program shared by the browser VM, native Clang conformance and direct ARM64
conformance. It covers multidimensional and negative bounds, typed results,
Static result reset, fixed-to-dynamic ownership, embedded NUL strings, implicit
ReDim, interface/property results, Variant element-type changes, grouped ByRef
temporaries, record/object-array results, fixed-length record fields, scoped
element references and failure-atomic checks. The direct harness executes it at O0–O3;
browser-exported conformance archives run separately on Apple Silicon. Portable
helper execution and metadata tests are not substitutes for actual ARM64 execution.

`packages/macos-native/tests/scopes.mjs` adds nested reference, lexical With,
live array iteration, suspended continuation and cleanup acceptance to those
same source-program execution paths. `tests/scopes.cpp` independently checks
lease sharing, weak ancestry, record-field identity and failure-atomic stores
under AddressSanitizer and UndefinedBehaviorSanitizer. The SDK embedding tool
requires successful native scope-ownership proof as well as ARM64 execution,
large-project/O0–O3 coverage and strict signature validation.

Reference: Microsoft documents that whole-array assignment requires matching
array types and a resizable destination, or a scalar Variant destination:
https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/can-t-assign-to-an-array
This shared VBA reference informs the contract; it is not a licensed VB6
differential-execution certification.

Microsoft also documents temporary array locks while elements are passed ByRef:
https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/this-array-is-fixed-or-temporarily-locked-error-10
