# Native Recordset snapshots and grid binding

The freestanding PE32 compiler admits an Automation Recordset assigned to the
`DataSource` property of MSFlexGrid, MSHFlexGrid or DataGrid. Both `Set` and the
original bundled Data sample's assignment syntax use the same native operation.
Actual IDispatch/OleAut32 calls read the Recordset; no JavaScript provider,
interpreted project, display-only substitute or sample rewrite is embedded.
The installed x86 Automation server must support the admitted Recordset members.
This is not yet the configured SQLite/REST/GraphQL provider implementation or the
Adodc/TextBox two-way-binding contract.

## Snapshot and ownership

The receiver's grid ID, HWND, generation and data revision are captured before
evaluating the right-hand side. The binder retains the source, clones its cursor
read-only, and explicitly applies the source's Filter and Sort to that clone.
ADO clones have independent views; assuming that Sort is inherited gives a
wrongly ordered snapshot. The source's position is never traversed or changed.
A single Fields traversal obtains header names; a single bounded GetRows call
obtains field-first, record-second array data. Empty Recordsets bind headers
without attempting to read beyond EOF.

A private packer validates both SAFEARRAY shapes and widths and prepares one
owned String vector. Headers occupy the first grid row; records follow in native
row-major grid order. Null displays as an empty String. Conversion uses the
existing Automation scalar rules, counted UTF-16 Strings and a one-million-unit
per-String bound, retaining embedded NUL characters. Every allocation, conversion
and array lock is released or transferred explicitly. Conversion failure cannot
publish a partly converted table.

The limits remain at most 10,000 columns, 100,000 data rows and 1,048,576 cells
including the header, further constrained by the configured native array-byte
budget. The reader requests one record beyond its calculated limit to reject
oversized data rather than silently truncating it. Invalid provider shapes and
unsupported conversions remain errors.

The publication phase prepares five metadata vectors without touching live grid
storage. Compatible column widths, column data and alignment survive rebinding;
new widths/heights use their ordinary defaults. A final HWND/generation/revision
check rejects callback-driven destruction, recreation or intervening data edits.
An active in-place editor rejects binding rather than discarding an uncommitted
edit. Only then are the six vector handles, dimensions and selection state
replaced together. The source owner moves into its bound slot without a further
allocation or COM call. The retired source is an ordinary statement-owned
Variant and is released at cleanup.

`grid.DataSource` returns an owned reference to the bound source, not a cursor
clone. `Set grid.DataSource = Nothing` clears data and releases that reference;
a later assignment may reuse the same grid. Binding is an explicit snapshot:
mutating the source does not silently rewrite an already published table. Assign
DataSource again to refresh it, as the original Data sample does. Sorting and
editing the grid independently do not write changes back to the Recordset.

## Performance

The cell packer uses at most three bulk SAFEARRAY locks, not per-cell IDispatch
or SAFEARRAY index calls. Metadata publication uses a fixed number of bulk locks
and copies, then one invalidation when redraw is enabled. Neither traversal nor
conversion resizes or repaints the live grid per cell. All cleanup and ownership
checks remain active at O0, O1 and O2.

The private grid's scalar/lifetime primitives have explicitly validated native
signatures. Initial column/row metadata and all-column assignments use bounded
bulk fills. Guard checks, error numbers, versioning and bounds behavior are
compared with the independent VB kernel algorithm. Authored functions with
matching names are never substituted.

String and Variant expression owners reuse frame slots only after instruction
cleanup boundaries. Each instruction retains distinct simultaneous owners;
locals, return values, loop state and With pins are never pooled. Cleanup cost
scales with the high-water set of simultaneous temporaries instead of all
previous expressions in a procedure. Recursive activations retain separate
frames. Compiler-generated call argument slots are addressed directly while
preserving authored argument evaluation order and the full typed ABI.

## Acceptance

The unchanged Data sample is compiled independently at O0/O1/O2.
`win32-data-sample-fixture.mjs` preserves its authored statements and designer
objects, appends readback checks, then sends native button messages through the
original Add/Sort/Close handlers. Add uses the real InputBox dialog with the same
same-process timer driver as its independent Windows fixture.
`win32-data-binding-fixture.mjs` tests actual ADO sort/filter/cursor/identity,
Unicode/Null, clear/rebind, metadata retention and rollback against HWND grids.
All native fixtures retain their original strict size and timeout gates.

The checked IA-32 suites separately exercise the complete emitted pipeline with
explicit foreign-API doubles, conversion/allocation failures and callback edits.
The VB grid kernel is also executed as an independent algorithm oracle. Neither
of those local harnesses is evidence of execution on Windows. Consult the exact
candidate's Windows execution artifact and unchanged-sample audit for its result.

Primary contracts: [ADO Clone](https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/clone-method-ado),
[GetRows](https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/getrows-method-ado),
[Sort](https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/sort-property-ado),
and [SafeArrayAccessData](https://learn.microsoft.com/windows/win32/api/oleauto/nf-oleauto-safearrayaccessdata).
