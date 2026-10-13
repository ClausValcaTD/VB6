# Compile-time circular record dependencies

The common source compiler rejects recursive project user-defined type (UDT)
declarations before startup, including declarations that no executed procedure
uses. `VB_RECORD_RECURSION` identifies each field participating in a cycle, with
its declaring module and physical source line. The public diagnostic number is
1002, consistent with other frontend declaration errors.

Scalar record fields, fixed record arrays and resizable record arrays contribute
dependency edges. Qualified names, local shadowing and private visibility use the
same `RecordTypeIndex` as ordinary declarations and runtime storage. An inaccessible
or ambiguous type keeps its existing diagnostic rather than being arbitrarily
selected to manufacture a cycle.

Class/object and Variant fields do not contribute inline record edges. A class
may therefore refer back to a containing record without being mistaken for a
recursive value layout. Unresolved external/library names remain the responsibility
of their existing binders. This change is not complete external typelib validation
or a general prohibition on references between modules.

## Algorithm and cost

`src/language/record-recursion.js` exports `recursiveRecordFields(index)`. It builds
a directed graph of record declarations and their record-valued fields, then uses
two iterative depth-first traversals to find strongly connected components. A
field is cyclic only when its source and target belong to the same nontrivial
component, or when it directly refers to its own declaration. Acyclic consumers
of a cyclic type do not receive redundant cycle-field errors.

Graph construction and traversal take O(records + fields) time, excluding the
length-dependent cost of identifier normalization. Storage is O(records +
record-valued fields). Traversal uses explicit stacks rather than JavaScript
recursion, and a scalar-only graph exits before the traversal passes. Diagnostics
are emitted in original declaration/field order, not traversal order.

All graph state belongs to one validation pass. The analysis does not annotate or
retain syntax nodes globally. A provider edit that creates or removes a cycle
therefore updates diagnostics even when consumers reuse cached parsed syntax.
An unchanged fully validated snapshot retains the existing semantic-cache fast
path. Runtime nesting/allocation guards remain unchanged as defense in depth.

## Validation

`tests/language-record-recursion.test.mjs` covers direct and mutual cycles,
qualified scalar/array dependencies, private shadowing, disconnected cycles,
acyclic consumers and diamonds, class/Variant boundaries, visibility/ambiguity,
conditional compilation and diagnostics cache invalidation/repair. A deterministic
80-graph randomized test compares the iterative implementation against an
independent transitive-reachability oracle. Two 25,000-record tests exercise deep
acyclic and cycle-entry graphs without recursion overflow or timing thresholds.

The existing `tools/browser-language-parity.py` runs three additional fixtures
through both the built runtime compiler and the actual IDE Run command. Invalid
unused/self and cross-module array cycles must leave the IDE in design mode with
no runtime iframe or startup output. The class-reference boundary must execute
normally. Existing worker/fallback diagnostics and all earlier fixtures remain.

```sh
node tools/build.mjs
node --test tests/language-record-recursion.test.mjs
node --test --test-concurrency=4 tests/*.test.mjs
python tools/browser-language-parity.py
```

Microsoft documents that circular references between user-defined types are
invalid. This is an independently implemented frontend contract, not validation
against a licensed Microsoft VB6 compiler or a claim of complete VB6 parity.

Primary references:
- [Microsoft: Circular dependencies between modules](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/circular-dependencies-between-modules)
- [MS-VBAL: User Defined Type Declarations](https://learn.microsoft.com/en-us/openspecs/microsoft_general_purpose_programming_languages/ms-vbal/a5fe374b-eddf-4808-9e73-477914940dba)
