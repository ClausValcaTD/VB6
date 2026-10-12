# Figma workspace paint publication

The [Figma workspace](figma-workspace.md) keeps the semantic DOM as its layout,
input and accessibility authority. A retained rendering backend can paint over
that DOM. Workspace transactions must publish both together: native inputs and
text must not show a new theme or location while the covering canvas still
contains the previous backgrounds and native-hole geometry.

`src/ide/figma/presentation.js` submits fresh styles and geometry through each
live document's existing renderer after the coalesced workspace synchronization.
It also runs after leaving Figma mode and on actual system-scheme changes. It
retains the driver, atlas, user policy and application data rather than restarting
or replacing the renderer. Paint errors enter the existing ordered fallback.
Hidden, printing, disposed and native-HTML documents schedule no paint work.

Publication runs at mutation/transaction boundaries, not on a polling timer. The
renderer retains its existing demand scheduling and ResizeObserver registration
rules. Tests require idle painting to stop after the transaction settles.

## Regression checks

The original 22 authoring cases remain in `tools/figma-browser-tests.py`.
`tools/figma-presentation-browser-tests.py` shares that harness's fixture,
application startup, error recording and cleanup, but runs two additional visual
cases and writes into a separate `presentation` report directory. It cannot
overwrite the authoring result file.

The visual checks sample actual composited screenshot pixels for the header,
layers, canvas and inspector during light/dark/light transitions and System
scheme changes. They require a live Canvas2D backend and do not force a paint in
the test or accept native HTML fallback. They also verify project isolation,
classic restoration and absence of a perpetual idle paint loop. Each capture
retains expected colors, measured colors, sample positions and renderer stats.
These checks detect stale retained pixels that computed-style and interaction
assertions alone cannot detect. They do not certify complete Figma pixel parity.

```sh
npm run build
node --test tests/figma-*.test.mjs tests/modal-contributions.test.mjs
python -m pip install playwright==1.57.0 Pillow
python -m playwright install --with-deps chromium firefox webkit
VB6_BROWSER=webkit VB6_TEST_TRANSPORT=http python tools/figma-presentation-browser-tests.py
VB6_BROWSER=webkit VB6_TEST_TRANSPORT=file python tools/figma-presentation-browser-tests.py
```

The Figma workflow executes 24 workspace cases per browser/origin (22 authoring
plus two paint-publication cases), separately from the classic auto-layout
regressions. Four pure presentation tests cover call ordering, retained resource
identity, detached documents, idle exclusions and failure propagation. Memory
transport remains a labelled local-only fallback, not origin-persistence evidence.
