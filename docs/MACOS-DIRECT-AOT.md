# Direct macOS Apple Silicon AOT

The default macOS export produces an actual arm64 Mach-O executable in a signed `.app.zip`, directly in the browser or Node.js. It does not export only source, call a Mac compiler service, run Clang for the project, or embed a VB/JavaScript interpreter in the application. The complete standalone IDE includes the verified native SDK, so this path also works offline in a secure file context.

## Use it

Choose **File → Make Project.app (macOS Apple Silicon)… → Export .app ZIP**. Keep optimization at O2. Application name, bundle identifier and deployment target are configurable. The visible **Save ZIP** link retries the same archive when automatic download is suppressed. Closing the dialog cancels publication; changing the project rejects a stale result. Export does not launch the application.

From a checkout, on Linux, Windows or macOS with Node.js 22:

```sh
node tools/build-macos-native.mjs
node tools/build-macos.mjs Project.vb6web --out NativeOutput
# NativeOutput/Project.app.zip contains the executable application.
```

`.vbp` and project-directory input use the existing native project importer. Output archives are created exclusively: an existing file or symlink is not overwritten. Node.js is needed for command-line export, not for running the resulting application.

**Build via Mac Bridge** remains an explicitly approved Apple Clang alternative. The CLI selects that toolchain with `--clang`; `--identity` and `--jobs` require that explicit mode. **Download Source Build Kit**, or `--source-only`, remains a separate source artifact. No failing direct export silently changes into one of these other modes.

## Reusable APIs

Build and pack `packages/macos-native` to obtain `@vb6-studio/macos-native`. Packing does not publish to npm. Its bundled entry point includes the frontend and compressed native SDK; it does not import files outside the package.

```js
import {
  exportMacOSApplication,
  verifyMacOSAOTArchive
} from '@vb6-studio/macos-native';

const result = await exportMacOSApplication(project, {
  name: 'Demo',
  bundleIdentifier: 'org.example.demo',
  minimumVersion: '11.0',
  optimization: 2
}, {
  signal: abortController.signal,
  resources: {'Resources/notes.txt': 'Packaged application data'}
});
// result.bytes: complete .app.zip; result.executable: Mach-O bytes.
// Save result.bytes using the application's own file/download UI.
await verifyMacOSAOTArchive(result.bytes, result.options);
```

For durable Node output, `exportMacOSProject(project, {compiler: options, out, signal, resources})` is exported from `@vb6-studio/macos-native/node`. The older `buildMacOSProject` deliberately retains its Apple Clang behavior. Lower-level APIs include `compileMacOSAOT`, `linkMacOSAOT`, `exportMacOSAOT`, `loadMacOSAOTRuntime` and `macOSAOTRuntimeInfo`. Loading returns defensive copies; callers cannot poison later exports by mutating their template or manifest.

## Reuse and code generation

```text
VB6 project
  → existing project normalization, parser, semantic binder and bound IR
  → shared native constant/reference binding + ARM64 procedure lowering
  → checked AArch64 instructions and relocations
  → prelinked native value/runtime/AppKit SDK
  → Mach-O project sections, entry metadata and deployment target
  → SHA-256 code signature + sealed bundle resources
  → deterministic ZIP with Unix executable permissions
```

`src/native/binary-section.js` is shared with the Win32 PE32 linker and the ARM64 assembler. Win32 retains its PE format, x86 backend and runtime. Shared frontend binding and the existing macOS native runtime are reused instead of duplicating VB type widths, arrays, records, object/interface dispatch, files and AppKit controls.

Project procedures are real ARM64 instructions. Conditions, loops, calls, error continuations and `GoSub`/`Resume` destinations become native control flow. A fixed integer-only helper ABI transfers native runtime values via checked handles. Generated frames preserve the Apple ARM64 calling convention and stack alignment. Helpers catch exceptions before they could unwind through generated frames; propagation resumes through ordinary compiled C++ frames. The metadata section contains literals, declarations, form properties and entry offsets, not an executable AST or bytecode stream. Dynamic value/member dispatch remains where VB semantics require it.

The maintainer-built SDK already contains linked system imports and AppKit runtime code. Export fills reserved code/metadata sections, resolves branches against verified helper symbols, adjusts deployment/signature metadata, and creates a new ad-hoc signature. It does not request writable-executable memory, JIT entitlement, shell commands, or a native compiler from the browser.

## Integrity, determinism and signing

Runtime decompression is bounded and requires matching SHA-256, ABI, section layout, helper symbols and source provenance. Mach-O validation rejects unsupported architecture, writable executable segments, overlapping/out-of-range sections, missing helpers and non-system dylib dependencies. ARM64 encoders and relocations reject invalid registers, immediates, missing symbols, range overflow and alignment errors rather than truncating silently.

The executable has a SHA-256 CodeDirectory with 4 KiB page hashes and signed Info.plist/resource-envelope slots. Every packaged resource is sealed. `verifyMacOSAOTArchive` independently checks a downloaded ZIP, execute permissions, Mach-O structure, all code-page hashes and the resource seal; it rejects injected, missing or changed resources. ZIP timestamps are fixed, allowing exact byte comparison across hosts and browsers for the same project, options, resources and SDK.

**Ad-hoc signing is not Developer ID signing, notarization, Gatekeeper acceptance or App Store qualification.** Browser cryptographic byte verification is not macOS trust evaluation. Actual Apple `codesign --verify --strict` is a separate CI gate. Distribution needs the developer's own signing/notarization process; no credentials are embedded or accepted through project metadata. Exported native applications are not sandboxed by this exporter.

## Deliberate limits

The direct SDK reserves **2 MiB of project machine code and 2 MiB of project metadata**, independently of its runtime. Oversize projects receive explicit diagnostics. It uses the O2 native SDK; other optimization settings require the explicit Clang/source path. Minimum target is macOS 11 on arm64, not Intel/Rosetta or a universal binary.

This completes a direct executable-export path, not universal VB6/Win32/COM compatibility. The existing [macOS compatibility boundaries](MACOS-EXPORT.md#unfinished-compatibility) still apply: Windows DLL/OCX binaries and arbitrary COM servers are not loaded; some control members and native services fail at runtime rather than at frontend validation. Retain source and test actual application behavior on a Mac. The native test runner's host/SDK version is not proof of every supported deployment OS version.

## Validation and SDK maintenance

`tests/macos-arm64.test.mjs`, `macos-aot.test.mjs` and `macos-aot-package.test.mjs` cover encoding, native compiler output, signatures, tampering, determinism, offline SDK loading, CLI output and cancellation/overwrite boundaries. Structural fixtures are explicitly nonexecutable and are not used as native runtime evidence.

`tools/test-macos-aot.mjs` runs the helper-call oracle with AddressSanitizer/UndefinedBehaviorSanitizer, builds the native SDK on Apple Silicon, then exports and executes conformance and RichText applications. It verifies the generated app signature without re-signing or compiling the project's source. The portable oracle is diagnostic only, not a replacement for ARM64 execution.

`tools/browser-macos-aot-tests.py` uses genuine Web Crypto in Chromium, Firefox and WebKit. Each browser downloads the real application from HTTP and file origins while offline, compares bytes to Node, and checks manual-save, cancellation and stale-project behavior. `tools/test-macos-browser-artifacts.mjs` runs those exact six downloaded archives on Apple Silicon after strict native signature verification. Existing Win32, macOS source/bridge, repository and artifact-fingerprint validation remain separate gates.

Ordinary builds reject a stale or missing native SDK. After editing native runtime or AOT C++ sources, a maintainer can run on Apple Silicon:

```sh
node tools/test-macos-aot.mjs
node tools/embed-macos-aot-runtime.mjs artifacts/macos-aot/runtime reports/macos-aot/validation.json
node tools/build.mjs --update-ide-manifest
```

The embedding tool requires successful native execution and signature verification for the exact runtime bytes plus matching current source hashes; a source kit or portable-only report is insufficient. Commit the generated payload and fingerprints, review the diff, and run all exact-head checks.

The manual **Refresh verified macOS runtime** workflow accepts only a `maint/macos-runtime-*` branch. Its read-only native job builds and validates; the publication job can commit only the generated payload with a branch-head lease. It never writes `main`, changes project source, or runs from a pull-request trigger. An automated token commit still needs a reviewed follow-up commit or explicit validation run before merge.
