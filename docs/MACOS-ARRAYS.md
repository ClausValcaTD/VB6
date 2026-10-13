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

Direct array-element references hold a shared, scoped lease. Resizing, erasing
or replacing their array fails with Error 10 until the last reference is
released, including after handled or propagated errors. Whole-array ByRef
aliases remain resizable. Record fields preserve their declared fixed-array
storage and element types; copied record arrays own independent fields.

These checks do not yet implement every nested record-field, With and For Each
lease from the browser VM, nor do they establish complete Microsoft VB6 array ABI
compatibility. Native Declare does not expose raw SAFEARRAY pointers. Keep these
remaining reference-lifetime boundaries separate from successful value-copy and
result-storage tests.

## SDK and validation

The helper ABI is **2**. The compiler, native loader and payload-provenance check
must agree. An ABI 1 custom or embedded runtime is rejected before linking, because
it cannot preserve array-result metadata. Applications already exported with an
older SDK are not modified. Mach-O container/layout versions are independent of
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

Reference: Microsoft documents that whole-array assignment requires matching
array types and a resizable destination, or a scalar Variant destination:
https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/can-t-assign-to-an-array
This shared VBA reference informs the contract; it is not a licensed VB6
differential-execution certification.
