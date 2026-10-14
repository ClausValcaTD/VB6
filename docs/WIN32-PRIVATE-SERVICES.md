# Private native services

The Collection service declares its exact private `Word`/`PutWord` host ABI for
pointer-load/store lowering, like the dynamic-control and event services. Public
VB methods with those names remain ordinary authored procedures. Argument order,
checked value conversion, error propagation, and owned rollback are preserved.
A private procedure's one-pass frame clear explicitly marks the frame as zeroed;
error-frame installation then writes only its live metadata instead of clearing
the same twelve words again. Unmarked/ordinary procedure frames retain their
normal initialization and source checkpoints.

Private service reachability is a global fixed point. A later-emitted service
may request another root from an earlier service; that earlier service is
revisited without re-emitting any existing body. This prevents missing native
symbols in projects that compose several demand-loaded compiler services.

`node tools/bench-win32-collections.mjs [report.json]` runs fifty additions and
removals at each optimization level and reports emitted size, checked-machine
instruction counts and final owned-allocation counts. It keeps the existing
instruction guard. These counts are not wall-clock Windows performance data;
compare revisions using the same test machine and workload.
