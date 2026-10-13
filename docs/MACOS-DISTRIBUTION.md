# Trusted local macOS distribution

The direct exporter creates an offline, ad-hoc-signed Apple Silicon application. Distribution is an explicit **local Mac** operation over those compiled bytes: it does not run Apple Clang on the project, launch the application, or enable a browser build service. Its default tool executor invokes the installed Apple tools without a shell.

## Signing and notarization

Install the Apple command-line tools, Node.js 22 and a valid **Developer ID Application** identity in the local Keychain. Identity creation, Apple Developer account access and notarization credentials belong to the developer; they are not provided or manufactured by the exporter. Configure a notarytool Keychain profile using Apple's documented credential setup, not a password embedded in the project or command history.

```sh
node tools/build-macos-native.mjs

# Compile offline, then sign locally. This does not submit to Apple.
node tools/build-macos.mjs Project.vb6web --out SignedOutput \
  --distribute --identity 'Developer ID Application: Your Name (TEAMID1234)'

# Explicitly allow Apple submission, wait for acceptance and staple its ticket.
node tools/build-macos.mjs Project.vb6web --out NotarizedOutput \
  --distribute --identity 'Developer ID Application: Your Name (TEAMID1234)' \
  --notarize-profile 'My notarytool Keychain profile'

# Local ad-hoc Hardened Runtime test, never Developer ID/notary approval.
node tools/build-macos.mjs Project.vb6web --out LocalTest \
  --distribute --identity -
```

The first command produces `Project.app.zip` and `Project.distribution.json` in a new or otherwise unused output location. Existing files and output-directory symlinks are refused. Distribution requires an explicit identity; `--source-only`, `--clang` and `--distribute` are mutually exclusive. `--jobs` belongs only to Clang compilation. Signing timeout is configurable with `--sign-timeout` from 1,000 to 600,000 milliseconds per tool invocation.

`--notarize-profile` authorizes uploading the compiled application to Apple. Omitting it never submits, staples or claims Gatekeeper acceptance. The profile is a reference to local Keychain credentials, not a credential itself. Project files, resource metadata and HTTP bridge requests cannot set signing identities, passwords, entitlements or notary profiles. Exporter reports omit credential material and the profile name.

## Entitlements are explicit developer policy

`--entitlements-json path.json` accepts a regular, non-symlink JSON file up to 64 KiB. Dictionaries, arrays, Boolean values, safe integer values and valid XML strings are supported; property accessors, invalid Unicode and excessive nesting/counts are rejected. The serializer emits deterministic escaped plist XML rather than accepting executable or untrusted XML fragments.

```json
{
  "com.apple.security.app-sandbox": true,
  "com.apple.security.network.client": true,
  "com.apple.security.files.user-selected.read-write": true
}
```

These are example developer choices, **not automatic application compatibility**. Enabling App Sandbox changes file, networking and process permissions; the developer must select entitlements that match the application, provision where necessary and test real behavior. This tool does not silently add JIT, writable-executable-memory, debugging or library-validation exceptions. Project code is statically executable and does not require JIT entitlements. The default entitlement dictionary is empty, so applications are not sandboxed by default.

## Reusable APIs

After building and packing the independent package:

```js
import {exportMacOSApplication} from '@vb6-studio/macos-native';
import {distributeMacOSApplication} from '@vb6-studio/macos-native/distribution';

const built = await exportMacOSApplication(project, {
  name: 'Demo', bundleIdentifier: 'org.example.demo', optimization: 3
});
const release = await distributeMacOSApplication(built.bytes, built.options, {
  out: '/projects/releases/demo',
  identity: 'Developer ID Application: Your Name (TEAMID1234)',
  notarizeProfile: 'My notarytool Keychain profile', // explicit network submission
  entitlements: {'com.apple.security.network.client': true},
  signal: abortController.signal
});
console.log(release.archive, release.sha256, release.notarized);
```

`exportMacOSDistribution(project, {compiler, resources, ...distributionOptions})` from `./node` combines the two steps. `createMacOSDistributor` supports a trusted embedding host's native tool executor; it is not an HTTP API or a permission bypass. The default `distributeMacOSApplication` always uses the current platform and actual installed tools. No source-project-controlled function is executed as a tool provider.

## Verification and publication order

The input is snapshotted and independently verified as a direct AOT archive, including every signed page, resource seal, path and executable permission, before unpacking into private staging. Approved entitlements are linted. Signing always requests Hardened Runtime; Developer ID requests also require a secure timestamp. Strict native signature verification and display metadata must identify the requested signature type before proceeding.

Notarization must return a valid submission identifier and exactly `Accepted`. Pending, rejected, malformed and tool-error results fail. After acceptance the tool staples and validates the ticket, then requires `spctl --assess --type execute` success. The deliverable ZIP is created with `ditto` and resource forks preserved. **That ZIP is extracted again**, independently verified with `codesign`, checked for matching signature type/team, and, when notarized, checked for the stapled ticket and Gatekeeper assessment. The tool never substitutes verification of an intermediate staging directory for verification of the published archive.

Only after these gates does it publish the archive and report with exclusive file creation. Signing/submission/cancellation failures remove private staging and do not publish a successful report. If another writer wins a destination-file race, rollback removes only this operation's owned inode and preserves the competing file. Two-file publication is not crash-atomic: a process or machine crash between final links may leave the ZIP without its report. A timeout after a notarization submission may also leave the submission running at Apple; local cancellation does not assert remote cancellation. Use Apple's tools to inspect an existing submission before retrying.

The JSON report records original/final SHA-256, signing type/team, Hardened Runtime, native signature verification, final-archive round-trip verification, notarization ID/status, stapled ticket and Gatekeeper result. Sign-only output reports `notarized`, `ticketStapled` and `gatekeeperAccepted` as false. `Resources/vb6-build.json` retains the original compilation report; it is not rewritten to masquerade as a distribution trust report.

## Evidence and boundaries

Unit tests inject explicitly **synthetic** native-tool/notary results to exercise rejection, pending status, cancellation, entitlement validation and exclusive-output rollback. They do not certify a Developer ID identity or Apple-service response. The separate native CI test uses real Apple `codesign`/`ditto`, Hardened Runtime ad-hoc signing, final-ZIP extraction and actual ARM64 execution. It verifies unchanged project code and metadata before/after signing. No signing credentials are assumed in public CI; real Developer ID, notarization, sandbox behavior and distribution-policy acceptance require separate credentialed developer validation.

This workflow targets direct ARM64 app archives, not arbitrary imported macOS bundles, third-party nested frameworks, Intel/universal output, App Store submission or Windows COM/OCX portability. Apple acceptance and local trust policy may change independently of a previously recorded successful assessment. Never infer full VB6 runtime/control parity, malware safety or universal deployment approval from a valid signature.

## Primary references

- Apple, customizing the notarization workflow: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
- Apple, creating Developer ID certificates: https://developer.apple.com/help/account/certificates/create-developer-id-certificates/
- Apple, Hardened Runtime: https://developer.apple.com/documentation/security/hardened-runtime
- Apple, App Sandbox: https://developer.apple.com/documentation/security/app-sandbox
