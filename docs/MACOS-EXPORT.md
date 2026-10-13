# Native macOS Apple Silicon export

This target builds native arm64 Mach-O applications using direct ARM64 AOT or an explicit Apple Clang alternative, sharing the native AppKit runtime. It is an experimental compiler and compatibility runtime, not a Windows executable emulator, a COM loader or certification of complete VB6/Win32 parity.

## Export paths

The IDE's **File → Make Project.app (macOS Apple Silicon)…** command defaults to **Export .app ZIP**: an actual executable generated directly in the browser using the embedded native SDK, with no Mac connection, Clang or source-only step. It also works offline. [Direct AOT architecture, APIs, validation and capacity limits](MACOS-DIRECT-AOT.md) describe this path.

**Build via Mac Bridge** explicitly contacts a local Mac compiler and downloads the signed application's original ZIP bytes. **Download Source Build Kit** is a separate offline source artifact; extraction and compilation on a Mac are still necessary for that artifact.

All paths run shared-frontend validation and native-target preflight. The dialog provides application name, reverse-DNS bundle identifier, minimum macOS version and optimization (O0–O3 project code for direct export, independently of the O2 native SDK; O0–O3 for the explicit Clang/source paths). Existing Windows AOT, licensed Microsoft VB6 runtime, VB.NET and HTML commands remain independent.

### Optional Mac compiler bridge

On the Mac, install Node.js 22+ and Xcode Command Line Tools, then run from the repository:

```sh
npm run macos:bridge -- --origin https://wieslawsoltes.github.io
```

For a local IDE at `http://127.0.0.1:8080`, use that exact origin instead. The bridge binds only `127.0.0.1`; its default endpoint is `http://127.0.0.1:8769/macos`. Copy the URL and random token printed in the terminal into the export dialog. Press **Build via Mac Bridge**, review the terminal's source hash and adapter list, and type `YES` to approve that build.

The CLI requires an interactive terminal. There is no unattended allow-all flag. A `file:` IDE can be permitted with `--allow-file-origin`; this explicitly permits opaque file origins and does not authenticate a particular local HTML file. Browser local-network policy is not disabled by the exporter. When the browser denies that connection, direct **Export .app ZIP** still needs no bridge; a locally served IDE or source kit are other explicit alternatives.

The result has this shape:

```text
MyApplication.app/
  Contents/
    Info.plist
    MacOS/MyApplication        # arm64 Mach-O, executable permissions
    Resources/
      vb6-build.json
      vb6-source-map.json
    _CodeSignature/...
MyApplication.app.zip
MyApplication.build.json
```

The bridge performs code-signature verification before returning the archive. The browser validates bundle metadata, Mach-O architecture, execute permissions, safe ZIP entries and SHA-256 hashes. **This bridge-client validation is not cryptographic signature verification.** Direct export separately verifies code-page and resource hashes; neither path performs browser-based macOS trust evaluation. It preserves the original archive rather than rebuilding a ZIP that could lose permissions or signature-related metadata.

Closing the dialog cancels the request and clears its token. Cancellation settles the client even when an injected transport or response stream ignores its abort signal; late response bodies are discarded and cannot update a replacement connection. Response deadlines cover both headers and body streaming, and every completed response must match an advertised Content-Length. Changing the project while a build is pending prevents downloading a result for the old snapshot. A keyboard-accessible Save ZIP link remains available when automatic download is suppressed. No export path runs the produced application.

### Source build kit

The source kit contains generated `main.cpp`, all required native SDK sources, `build.mjs`, manifest, plist and source map. The IDE also includes the exact project snapshot as `project.vb6web`. It contains no prebuilt application.

```sh
# After extracting the kit on a Mac:
node build.mjs --out NativeOutput --jobs 4
```

From a repository checkout, the equivalent command-line workflows are:

```sh
node tools/build-macos-native.mjs
node tools/build-macos.mjs Project.vb6web --source-only --out NewSourceFolder
node tools/build-macos.mjs Project.vbp --clang --out NativeOutput \
  --name MyApplication \
  --bundle-identifier org.example.myapplication \
  --minimum-version 11.0 \
  --optimization 2
```

Existing outputs are not replaced by default. The extracted kit's builder supports explicit `--force`; review the destination before using it. Do not execute build scripts obtained from untrusted projects without review.

## Compiler and runtime architecture

Direct export uses a checked ARM64 encoder and Mach-O linker, sharing Win32 byte-section infrastructure and the native runtime. See [the direct pipeline](MACOS-DIRECT-AOT.md#reuse-and-code-generation). The following diagram describes the retained **explicit Apple Clang** alternative:

```text
VB6 project / imported .vbp
  → shared parser, declarations, semantic binder and IR
  → macOS native lowering and source diagnostics
  → C++17 native procedures + standalone value/runtime ABI
  → Objective-C++ AppKit host and explicit source-API adapters
  → installed Apple Clang / macOS SDK
  → signed arm64 Mach-O inside .app
```

The explicit Clang mode is a C++-lowering backend; the default direct mode uses the ARM64 encoder. JavaScript executes during compilation and IDE operation; it is not embedded as the exported program's language interpreter. Generated procedures and the native runtime are machine code. Runtime-value and member dispatch remain dynamic where VB semantics require them.

| Contract | Native representation / behavior |
| --- | --- |
| Integer / Boolean | 16-bit values; Boolean true is -1. |
| Long | Signed 32-bit values even on an LP64 host. |
| Currency | Scaled signed 64-bit integer. |
| Decimal | 96-bit coefficient and scale in Variant/Decimal values. |
| Strings | Counted UTF-16; embedded NUL is preserved internally. |
| Arrays / records | Bounds-aware arrays and explicit record codecs, not host struct packing. |
| Native handles | Typed, generation-checked 31-bit positive handles over native objects. |
| Error handling | Native error state, source checkpoints, On Error and Resume lowering. |
| Project interfaces | Shared bound contracts, restricted dispatch and canonical target identity. |

`Implements` lowering uses the shared frontend's member bindings, including public-field accessor contracts. Interface parameter names are translated to implementation parameter positions before ordinary call-frame binding. Interface views expose only their contract, support checked cross-casts and back-casts, preserve ByRef storage checks, and share object identity for `Is` and dictionary keys. A view strongly owns its instance; the reverse view cache is weak, avoiding an introduced target/view reference-count cycle. This does not implement arbitrary COM vtables or Windows type-library activation. Native class finalization and its remaining global/form-lifecycle boundaries are described in [lifetime and editing contracts](MACOS-LIFETIME-EDITING.md).

[Native array contracts](MACOS-ARRAYS.md) describe typed Function/Property array results,
per-call result storage, typed-array copies, Variant ReDim and ABI validation.

AppKit provides native windows, editing controls, buttons, lists, outlines, tables, tabs, menus, timers, dialogs, retained drawing and printing adapters. Source-level `Declare` adapters translate explicitly supported kernel32/user32/gdi32/shell32-style contracts to native services. Windows DLL names do not cause DLL loading. Raw Windows pointers are not accepted as Cocoa objects.

## Reusable package

`packages/macos-native` packages as `@vb6-studio/macos-native`. Ordinary repository builds regenerate the independent compiler bundle and SDK payload. `npm pack ./packages/macos-native` creates a tarball without publishing it. The package's compiled entry point does not depend on repository-relative frontend files.

```js
import {createMacOSBuildKit, compileMacOS} from '@vb6-studio/macos-native';
import {buildMacOSProject, readMacOSProject} from '@vb6-studio/macos-native/node';

const project = await readMacOSProject('/projects/Demo/Demo.vbp');
const options = {
  name: 'Demo',
  bundleIdentifier: 'org.example.demo',
  minimumVersion: '11.0',
  optimization: 2
};
// For direct .app.zip output use exportMacOSApplication / exportMacOSProject;
// the APIs below intentionally retain explicit source/Apple Clang behavior.
const lowered = compileMacOS(project, options); // native source and report
const kit = createMacOSBuildKit(project, options); // portable source files
const built = await buildMacOSProject(project, {
  compiler: options,
  out: '/projects/native-output',
  jobs: 4,
  identity: '-'
});
console.log(built.executable, built.sha256);
```

`@vb6-studio/macos-native/builder` exposes the source-kit builder; `./bridge` exposes `createMacOSBridge`. A custom bridge host must implement its own explicit authorization callback. The default callback denies builds. Neither API executes the generated app. `buildMacOSProject` defaults to a durable `out` directory under the caller's current directory, not inside its disposable source-staging directory.

## Build authority and signing

HTTP requests can select compiler target options, not arbitrary SDK source, shell commands, output paths, compiler executables, signing identities or credentials. The host creates the SDK/source kit itself. Exact Host and Origin checks, constant-time token comparison, bounded UTF-8 input, a reservation before asynchronous body reads, one active request, consent timeouts and disconnect cancellation constrain the bridge.

This is an authority boundary, not a sandbox. The compiler invokes a local native toolchain, and exported apps can use native capabilities available to their process. Approve only trusted projects. Source text is emitted as checked values rather than concatenated executable C++ fragments, but that is not a guarantee that arbitrary untrusted compilation is risk-free.

The native builder uses direct process arguments, source/toolchain-keyed runtime caching, private staging, output-path checks, Mach-O segment inspection and native signature verification. Each POSIX compiler invocation owns a separate process group. Cancellation, timeout, excessive diagnostics or a failing log callback terminates that group and waits for process exit and closed output streams before source staging can be removed. This does not sandbox a malicious tool that escapes its process group. UTF-8 output is decoded incrementally and independently for stdout and stderr. SDK line endings are normalized before embedding so Windows CRLF and Unix LF checkouts yield the same build-kit revision and IDE fingerprints.

Default signing is ad-hoc. It is **not** Developer ID signing, notarization, Gatekeeper acceptance or App Store qualification. A trusted local CLI can supply its signing identity with `--clang --identity`, or sign a direct executable with `--distribute --identity`. The [distribution workflow](MACOS-DISTRIBUTION.md) supports Hardened Runtime, explicitly supplied entitlements and optional Apple notarization through a local Keychain profile. Project/HTTP data cannot choose these settings. No signing credential is included in project exports, and real service acceptance requires the developer's own valid identity and credentials. A synthetic notarization test is not evidence of Apple trust.

## Validation and scope of evidence

The separate Direct macOS AOT workflow checks the handwritten ARM64 backend and genuine offline browser-produced applications as described in [direct validation](MACOS-DIRECT-AOT.md#validation-and-sdk-maintenance).

The read-only Native macOS workflow has Linux and Apple Silicon jobs plus Chromium, Firefox and WebKit export UI jobs. The native harness:

- Compiles and runs native value, generated VB, class-finalization and interface/view-lifetime tests with AddressSanitizer and UndefinedBehaviorSanitizer.
- On Apple Silicon, compiles/signs/executes the app, creates 33 AppKit control types with selected behavior checks plus live field-editor, UTF-16 selection, rich-text replacement and list-identity regressions, verifies runtime-cache reuse, and downloads an app through the actual bridge before independently verifying and executing it.
- Checks that reusable-API output remains after temporary source cleanup.

The browser suite verifies source ZIPs, actual browser downloads, manual-save fallback, diagnostic failures, token lifetime, cancellation, design-mode restrictions and stale-project rejection. Its protocol image is explicitly synthetic and nonexecutable. It is not evidence of a working native binary. Native execution evidence comes from the separate Apple Silicon job. Local in-memory transport runs, when needed in restricted environments, are labelled and do not replace real HTTP/WebCrypto CI.

Portable Node regressions also validate malformed archives/Mach-O, permissions, links, Unicode filename collisions, target metadata, independent offline package extraction, bridge authority boundaries and LF/CRLF determinism. Existing repository validation and generated-bundle checks remain enabled.

## Unfinished compatibility

A green targeted test run does not certify the complete original VB6 language/runtime/control API. Important remaining areas include global/static/default-form shutdown and complete lifecycle semantics; reference-cycle collection and exact resurrection compatibility; design-time FRX/resource fidelity; complete control member, event and layout behavior; locale-sensitive formatting and ANSI conversion; native database/COM integration; and comprehensive visual/application parity. The 33-control test is a creation-and-selected-behavior smoke test, not full acceptance for every member of those controls.

Unknown native declarations and unknown control types are rejected by native preflight. Some unsupported members are detected at runtime instead; compilation alone therefore does not prove a program's untested paths are supported. Arbitrary Windows DLL/OCX binaries, COM servers and pointer-based Win32 extensions are not made portable by this backend. Keep original sources and validate application behavior on an actual Mac before relying on a migration.
