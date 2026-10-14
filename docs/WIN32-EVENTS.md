# Native typed source events

The Win32 AOT backend supports `WithEvents` fields referring to a typed native
class, and synchronous `RaiseEvent` of an Event declared in that class. It emits
machine-code dispatch and per-declaration handler tables. There is no source
interpreter or JavaScript callback loop in an exported executable.

## Binding and delivery

A WithEvents field owns both its source reference and its connection. Assigning
another source builds the replacement connection before publishing the field;
allocation failure retains the original reference/subscription. Assigning
Nothing disconnects the field. A connection borrows its class/form sink owner
instead of retaining it indefinitely, avoiding an artificial reference cycle.
The callback temporarily retains a class sink while its handler executes.

Callbacks run in connection order. ByRef arguments refer to the same typed
storage across all callbacks and return changes to the raising procedure.
ByVal arguments retain their declared scalar/String/Variant/reference ABI.
Source arguments evaluate once even when there are no subscribers. The handler
must be a Sub with the Event's exact parameter types and passing modes.

Delivery captures a linked-list tail and keeps a stack-local active scope.
Connections removed during dispatch become tombstones and are reclaimed after
the outermost delivery. A removed pending handler is skipped. A new connection
waits for a subsequent raise, including a nested raise started after connection.
Nested raises have independent boundaries. There is **no heap-allocated
subscriber snapshot per raise**; the tested scalar path performs no HeapAlloc
calls after publisher/sinks/connections have been set up. User handler work,
String/Variant copies and creating subscriptions can of course allocate.

Errors from a handler propagate through ordinary native procedure error frames
to the raising call, with active-delivery cleanup. Event-delivery wrappers are
not error-isolated intrinsics: handler changes to Err remain observable. Private
connection-management helpers retain the existing owned Err snapshot policy so
internal cleanup cannot erase or replace an authored caller error.

## Lifetime and current limits

All a class sink's subscriptions disconnect before any field is destroyed.
A field finalizer therefore cannot publish into that already-dying sink. Form
subscriptions disconnect during native form teardown. Source teardown frees the
now-empty subscription state. A source with no Event subscribers needs no
subscription-state allocation until the first connection. Connections are
limited to 65,535 per source; reference count and nesting overflow are diagnosed.

This is typed source-event support, not COM connection points, external OCX
interfaces or generic Object/IDispatch. WithEvents arrays, As New WithEvents
fields, and optional/ParamArray Event signatures remain diagnostics. Passing a
raw WithEvents cell ByRef is not admitted, because replacing that raw pointer
would bypass subscription maintenance; a parenthesized value uses an ordinary
isolated typed reference. Independent Form instances, dynamic intrinsic control
arrays and Controls.Add are separate implementation areas, not implied by source
events. The original Events sample still requires those dynamic control features.

## Validation

The checked IA-32 execution tests run complete authored publisher/sink procedures,
including reentrant connection changes, nested raises, cancellation, wide and
owned payloads, error propagation, allocation failure and callback self-release.
Foreign Win32/Automation functions in those tests are explicitly doubled; those
results are not Windows execution evidence.

`tools/win32-event-fixtures.mjs` adds separate real-Windows fixtures to the existing
native matrix. The driver requires every maintained family at O0/O1/O2, checks
exact executable hashes, and retains its timeout, size and no-extraction gates.
Consult the exact candidate's `execution.json` before claiming a Windows pass.

Primary contracts: [RaiseEvent](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/raiseevent-statement)
and [Private/WithEvents declarations](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/private-statement).
