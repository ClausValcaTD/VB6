# Native runtime controls and sparse control arrays

The freestanding x86 target creates runtime intrinsic controls with actual
`CreateWindowExW` HWNDs. No interpreted project or browser runtime is substituted.
The implementation is demand-gated: an ordinary static-control project does not
acquire this runtime or its dependencies merely by linking the compiler package.

## Implemented operations

`Load` and `Unload` operate on runtime members of designed intrinsic control
arrays. Indices are checked in 0..32767; duplicate members, missing indices and
attempts to remove designer controls are errors. `Count`, `LBound` and `UBound`
reflect current membership. Load clones live state, text, geometry, Tag and font
metadata into independent owned resources, rather than sharing mutable storage.

`Controls.Add`, `Controls.Item` (including default index/name access), `Count` and
`Remove` support the admitted intrinsic families: Label, CommandButton, TextBox,
CheckBox, OptionButton and Frame. Add accepts an optional native Form/Frame
container and creates a hidden control until its Visible property is set. Names
are nonempty, bounded counted Strings with no embedded NUL; duplicate-name
comparison uses Windows' ordinal case-insensitive comparison. Tag remains counted
Unicode data and can contain embedded NUL characters.

Object/Control reference slots own a control node, not a numeric HWND alias.
Typed intrinsic slots retain their control kind for property dispatch and checked
assignment. ByVal has an independently owned reference slot; ordinary ByRef must
match the declared type exactly; grouped arguments use a temporary slot. Typed
returns transfer ownership. Unsupported COM/IDispatch objects and boxing these
private control references into Automation Variants remain explicit boundaries.
Existing TreeView/ListView event-item descriptors retain their separate borrowed
ABI and are not treated as owned HWND references.

The generic Object path admits common geometry, text/caption, Tag, visibility,
enabled, color and font properties. Typed references additionally route the
already-implemented family-specific properties (for example TextBox MaxLength
or CheckBox/OptionButton Value). This is not blanket support for every legacy
VB control, arbitrary OCX, dynamic WithEvents control variables or every member
of an untyped Object. Unsupported members continue to produce diagnostics.

## Checkbox state

Both designer and runtime CheckBox windows use the native three-state style, so
Value 2 is representable even with the default two-state click policy. The
framework applies user-click cycling before the authored Click handler: by
default unchecked becomes checked, checked becomes unchecked, and an
indeterminate checkbox becomes checked. TripleState enables the three-state
cycle. Load copies this policy with the live state. A runtime control's native
state is read through BM_GETCHECK rather than a separate cached value.

## Lifetime, reentry and callbacks

The node keeps its identity until all references are released. Destruction
invalidates its HWND before references can use it again. An old reference cannot
bind to a replacement control just because its name, array index or HWND value
is reused. A setter captures its receiver before evaluating operands. Controls.Add
also captures a monotonically checked form generation: destroying and recreating
a form during operand evaluation cannot publish a control into the new instance,
even when Windows reuses the exact HWND value.

Native subclasses pin a node throughout a callback. Runtime array notifications
carry the actual Index, and KeyAscii/KeyCode cancellation and changes cross the
native ByRef ABI. Designer controls keep their existing event route without a
second delivery. Frames forward descendant notifications to their owning form.
No error transfer crosses a Windows callback stack into a suspended caller.

Creation publishes registry/index links only after the HWND, subclass and owned
state exist. Failure paths release unpublished names/fonts/windows without
changing earlier members; sparse page allocation failures are also recoverable.
Closing suppresses obsolete callbacks, destroys children before disposing their
fonts/state, detaches held references, and releases index pages. A failed native
destruction is not treated as permission to detach and free live HWND state.

## Performance contract

The 15-bit array index uses a 128-entry directory and lazily allocated pages of
256 element pointers. A lookup performs one directory read and, for an allocated
page, one element read. The emitted leaf has no allocation, imported call,
callback or successful-path mutation of the caller's Err state. Bounds/count are
cached. Removing a boundary member uses a bounded native scan: at most 128 page
pointers and 256 element pointers. Empty pages are reclaimed.

`tools/bench-win32-control-index.mjs` reports reproducible instruction counts and
pointer reads by executing the actual linked helper in the checked IA-32 test
machine. It is not a Windows timing benchmark or a hardware-throughput claim.
Keep those distinctions when comparing revisions; host/compiler timing and native
application performance require their own measurements.

Compiler-owned pointer primitives are lowered directly only when their exact
private host ABI is declared; authored functions with similar names are not
substituted. Private helper frames are zeroed in one bounded block, and private
helpers with no Resume path omit internal statement-address writes. Authored
sequence points, Resume/Resume Next, extension instructions, error propagation,
rollback handlers and owned cleanup remain intact. These reductions apply at
O0 as native service lowering, not as disabled safety checks or source pruning.

## Validation boundaries

The `win32-dynamic-*` and `win32-control-index-*` Node tests execute compiled code
with explicitly labelled foreign Windows/Automation doubles. They check ownership,
callback ABI, failed creation, sparse boundaries, current-state cloning, typed
references, input, and forced handle-value reuse. This is not native Windows
execution. The ordinary helper instruction guard remains two million; the full
50-cycle application fixture uses an explicit bounded eight-million instruction
budget without dropping any of its iterations or assertions.

`win32-dynamic-control-fixtures.mjs` adds small self-checking Windows applications;
each retains the existing sub-100-KiB isolated-fixture budget at O0/O1/O2.
`win32-events-sample-fixture.mjs` separately preserves every original Events
statement and designer object, appending a verifier and startup driver. Its
readback uses real BM_CLICK routes and independently declared Win32 APIs. That
complete application is not replaced by a smaller mock fixture; the verifier's
additional size is bounded relative to the unchanged sample. All earlier native
fixture families, their assertions and the Windows timeouts remain enabled.

A compiled acceptance executable is not a passed execution. Consult the exact
revision's `execution.json` from the Windows runner before claiming native
acceptance or that all bundled applications are ready to merge.

Primary API contracts: [SetWindowSubclass](https://learn.microsoft.com/windows/win32/api/commctrl/nf-commctrl-setwindowsubclass),
[DefSubclassProc](https://learn.microsoft.com/windows/win32/api/commctrl/nf-commctrl-defsubclassproc),
[WM_COMMAND](https://learn.microsoft.com/windows/win32/menurc/wm-command),
[WM_DESTROY](https://learn.microsoft.com/windows/win32/winmsg/wm-destroy), and
[CompareStringOrdinal](https://learn.microsoft.com/windows/win32/api/stringapiset/nf-stringapiset-comparestringordinal).
