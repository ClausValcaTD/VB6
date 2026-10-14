# Validation and deployment

Three workflows own repository automation:

| Workflow | Responsibility |
| --- | --- |
| `validate.yml` | Read-only build, Node, browser, renderer, package and native-platform validation |
| `pages.yml` | Publish successfully validated current main; do not repeat the test suite |
| `macos-aot-runtime.yml` | Explicit runtime refresh restricted to `maint/macos-runtime-*`, with its existing narrow write permission and branch-head lease |

## One complete required check

The existing **test** check depends on every validation job, including matrix
instances. Its gate rejects missing, skipped, cancelled, neutral or failed
results. No PR path filters or `continue-on-error` exceptions hide required tests.
Administrators with additional old per-workflow required-check names should
replace those requirements deliberately; deleting YAML does not edit branch
protection. This change does not alter protection settings.

## Parallelism and deduplication

The complete `tests/*.test.mjs` set uses Node's four-way `--test-shard` partition,
with two test-file workers per job. Package/ABI checks and browser suites no longer
share that deadline. `tools/ci/suites.json` assigns each browser entrypoint to a
bounded group. Figma HTTP and standalone-file tests run in separate jobs in
Chromium, Firefox and WebKit. Native Apple jobs still execute the archives
exported by all three browsers.

The optional Monaco distribution is built once from locked dependencies and
passed to all three engine jobs, each testing both origins and the real shared
model. Agent transcript and Code GPU qualification share the existing renderer
API/display setup. Required backends, pixel assertions and native oracles remain
unchanged. Software GPU execution is not physical-hardware qualification.

Duplicate full/focused Node runs, repeated Classic layout runs and separate
fingerprint-only jobs are removed only where the owning job already performs
those checks. Source/provenance archives, package notices, x86/x64 Automation and
AOT execution remain covered. All 81 explicit tool entrypoints in the previous
11 workflows have retained owners, including the designer checks added on main
while PR #123 was open. The complete Node glob covers further unit tests.

The shared browser setup action caches pip downloads and pins both existing
Playwright profiles. It does not cache test results, successful verdicts or built
application files. Every checkout still performs the ordinary build that checks
all reviewed fingerprints. CI cannot regenerate its own expected fingerprints.
Browser binaries and system dependencies are installed for the exact profile.

## Failure evidence and local commands

`tools/ci/run.py` accepts fixed script basenames, engine and origin names, never
arbitrary shell commands. It records per-suite logs and atomic
`reports/ci/<group>-<browser>-<origin>/timings.json` before execution. Independent
suites continue after failure, but the job remains failed. There are no automatic
test retries. Cancellation stops the child process group and launches no
successor; a process timeout is not a pass. Per-suite timings appear in the job
summary, alongside the original screenshots and reports. Matrix-specific
artifact names avoid collisions.

```sh
python -m pip install -r tools/ci/requirements-checks.txt
python tools/ci/check.py
python tools/ci/test_run.py
python tools/ci/test_check.py
node --test tests/ci-gate.test.mjs
VB6_BROWSER=chromium VB6_TEST_TRANSPORT=http python tools/ci/run.py figma
```

The audit rejects duplicate YAML keys, missing gate dependencies, cycles, missing
suite owners, missing engines/origins/platforms and failure suppression. It also
parses Bash blocks. The pinned, SHA-256-verified actionlint binary checks Actions
syntax and expression types. Historical timings or results do not qualify a
later source revision.

## Publication boundary

Pages accepts only successful **Validate** pushes to this repository's current
`main`. It checks the event, repository and exact SHA, then rebuilds that source
with read-only permissions. It does not execute uploaded PR artifacts. Manual
publication also requires successful push validation of current main. Only the
final deployment job receives Pages write and OIDC permissions; it checks the
main ref again before publishing. Older completed validations do not deliberately
redeploy stale source.

References: [GitHub workflow-run security](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[Node test sharding](https://nodejs.org/api/cli.html#--test-shard), and
[Playwright CI/cache tradeoffs](https://playwright.dev/python/docs/ci).
