# Native disconnected Recordsets and grid binding

The native runtime implements `CreateObject("ADODB.Recordset")` as an in-process
C++ object. It does not activate COM, load a Windows DLL, connect to a database,
or embed a JavaScript interpreter. Direct ARM64 and explicit Clang lowering use
the same object and value ABI. The existing project importer, frontend, numeric
coercion, UTF-16 strings, arrays and source error handling are reused.

## Implemented contract

Define fields through `Fields.Append` before `Open`. The runtime supports signed
and unsigned small integer fields, Long, Single, Double, Currency, Date,
Boolean, Decimal/numeric, counted UTF-16 text, Byte-array binary fields and
scalar/Byte-array Variant fields. Field names and ordinals are checked; duplicate
names are rejected case-insensitively. Decimal precision and scale are writable
before opening. Required fields may be initially Null in an AddNew buffer, but
must contain a value before Update. DefinedSize and scalar conversion errors do
not create or change the pending edit buffer.

The disconnected cursor is client-side, static, and optimistic by default.
Read-only cursors and read-only clones are supported. Explicit external sources,
connections, other cursor/locking modes, batch operations, SQL/provider queries,
provider persistence and native COM activation are rejected rather than mocked.
No connection string or credential is sent anywhere.

The object exposes Fields/Field access, count/state, BOF/EOF, EditMode, bookmarks,
absolute positions/pages, AddNew/Update/CancelUpdate/Delete, navigation, Clone,
Sort, Filter, Find, GetRows, GetString and chunked text/binary field access.
Property assignment supports the default field-value path. Unsupported members
produce an error instead of returning invented data. OriginalValue reads the
pre-edit snapshot; UnderlyingValue reads committed shared storage.

`GetRows` returns a field-first, record-second Variant array. Selection accepts
field names/ordinals and one-dimensional arrays of them. Returned arrays and
binary fields own their writable storage. Successful extraction advances to the
next unread row. `GetString` supports the delimited clip-string form and explicit
column, row and Null representations, subject to output bounds.

## Ownership, clones and edits

Each Recordset is an independent cursor and edit buffer over a shared committed
store. Rows have stable identities and versions. Clones start at the first row,
do not inherit the original filter, share committed changes and accept each
other's opaque bookmarks. Unrelated stores and deleted bookmarks are rejected.
Closing one cursor leaves other clones open. Its later schema changes or reopen
cannot mutate the schema/store still held by an existing clone.

Pending changes are private until Update. CancelUpdate restores the previous
row after an abandoned AddNew. Navigation posts pending changes through the same
checked Update path. Optimistic writes reject a changed row rather than silently
replacing another cursor's edits. All fields in a supplied field/value update
are validated before replacing stored data. Field size, row/cell and byte-budget
failures retain the old committed value and pending edit state.

Unsorted/unfiltered consecutive inserts append to cursor views without rescanning
all previous rows. Filters and sorts rebuild independent stable-ID views when
necessary. Store and view notifications have bounded reentrancy; subscribers are
weakly registered. A shared emitter is retained until its notification guard and
iteration state are finished, even if a callback closes/reopens the source or
releases its last external owner. The in-flight callable is copied before it is
invoked, so clearing or replacing its registration cannot destroy a closure that
is still executing. Grid change callbacks follow the same rule, including
self-detachment. These temporary owners are released after notification; they
do not introduce permanent observer cycles. The commit precedes notification: a throwing subscriber does
not roll back a committed row, but other live subscribers are still called.
These objects and their UI adapters are confined to the runtime's owning thread;
this is not a concurrent database engine or a transaction system.

## Criteria and ordering

Criteria support checked field names (including bracketed names), single/double
quoted strings with escaped delimiters, numeric and date literals, comparisons,
AND/OR, explicit parentheses and edge-wildcard LIKE (`*` or `%`). AND and OR are
combined left-to-right rather than giving AND an implicit higher precedence.
Parenthesized groups and `IS NULL`/`IS NOT NULL` are native extensions; this is not
an exhaustive Microsoft provider grammar. Unsupported or malformed criteria are
rejected before changing the filter.

Numeric comparison literals retain fractional precision instead of being rounded
to the field's storage type. Sorting is stable across multiple keys, with Null
first in ascending order and numeric values before strings for mixed Variants.
Text comparison uses the existing native case-folding contract, not full Windows
locale/collation equivalence. ANSI and wide-text field types both use counted
UTF-16 storage; their byte-length/encoding behavior is not certified as provider
or Windows code-page parity.

## Native grids

MSFlexGrid, MSHFlexGrid and DataGrid can bind to the native Recordset, including
the original Data sample's `grid.DataSource = rs` spelling without Set. This is
an explicit DataSource-property exception; other Let/Set rules are unchanged.
Binding does not navigate the source cursor. The matrix contains a fixed header
row followed by the visible records; the bound shape belongs to the Recordset.
Closing the source leaves its header row. Unbinding leaves a detached matrix and
removes subscriptions; reassigning DataSource invalidates earlier edit tokens.

TextMatrix writes are typed writes to stable record identities, not writes to a
row number that can silently change after sorting. Assignable references capture
an edit token before evaluating the right-hand side. Real AppKit DataGrid edits
capture the same token when editing begins. Tokens validate binding identity,
source-open generation, view revision, column identity and row version. A late
commit after sort/filter/rebind/close or another cursor's write is rejected.
Validation failures do not overwrite the cell. Control disposal detaches its
observer and invalidates retained references.

## Bounds and qualification

The store is bounded to one million cells (or the smaller runtime array budget),
256 columns and an estimated 64 MiB of value storage. Text/binary field values
have a one-million-unit element bound in addition to DefinedSize. Queries are
bounded by length, tokens and nesting. Native grids additionally bound row count,
cell count and displayed text. GetRows and GetString have independent output
budgets. These are explicit safety limits, not performance guarantees.

`packages/macos-native/tests/recordsets.cpp` exercises the native core directly
under AddressSanitizer/UndefinedBehaviorSanitizer, including clone/edit conflicts,
closed-schema isolation, failed writes, query validation, notification behavior,
array ownership, stale grid tokens and repeated appends. Source fixtures run
through both native lowerings and the independent browser VM. The original Data
sample verifier appends checks without replacing its handlers or designer.

The actual Apple Silicon harness must execute the original Data application and
Recordset programs at O0–O3, exercise genuine AppKit table delegates and verify the
exported signatures. Browser conformance archives also contain Recordset source
checks. SDK embedding requires all core, native application and AppKit proof flags.
The helper-call ABI remains 4; ordinary builds still reject a stale SDK by native
source provenance. Portable tests and compilation do not replace native Mac
qualification. Revision-specific results belong in test artifacts, not this guide.

`packages/macos-native/tests/recordset-notifications.cpp` independently tests
observer-driven close/reopen, emitter release during normal and throwing
callbacks, callable self-removal, bound-grid detachment, continued delivery after
an observer throws, and surviving clone ownership. Both native harnesses compile
and execute these regressions with their existing sanitizer and warning flags.

## References

The following ADO descriptions inform the implementation; they are not a claim
of complete Microsoft ADO/provider or licensed VB6 differential certification.

- Microsoft Clone: https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/clone-method-ado
- Microsoft Update: https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/update-method-ado
- Microsoft CancelUpdate: https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/cancelupdate-method-ado
- Microsoft GetRows: https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/getrows-method-ado
- Microsoft Filter: https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/filter-property-ado
