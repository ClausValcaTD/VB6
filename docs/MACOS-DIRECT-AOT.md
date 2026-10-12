# Direct macOS Apple Silicon AOT export

## Goal

Produce an actual arm64 Mach-O executable in an executable-mode-preserving `.app.zip` directly from the browser or Node.js, without exporting only source and without requiring a compiler bridge for this path. Keep the existing Apple Clang / native-runtime path available and accurately labelled.

## Implementation boundaries

Reuse the shared VB6 parser, semantic binding, project normalization and native binary-section infrastructure used by Win32 AOT. Add checked ARM64 machine-code emission, a Mach-O linker, deterministic ad-hoc signatures, bundle packaging and an independent API. Do not translate source into an embedded JavaScript or VB bytecode interpreter.

Unsupported language, platform APIs and control behavior must produce source diagnostics, not silently generated no-ops. A successful source-kit export or Linux structure test is not evidence of native macOS execution.

## Acceptance before merge

- Executable export is distinct from source-kit export in the IDE and CLI.
- Checked ARM64 encoding and relocation tests pass, including range failures.
- Mach-O imports, segments, entry point, code hashes and ZIP permissions are validated.
- Actual Apple Silicon execution and native signature verification pass on the exact PR head.
- Existing Win32 AOT, bridge and source-kit tests remain passing.
- Remaining compatibility boundaries are documented; no claim of full VB6 parity without evidence.

Status: implementation in progress; no direct-binary exporter is delivered by this initial documentation commit.
