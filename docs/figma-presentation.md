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

## WebGL command submission

A workspace transaction may call `renderNow()` outside requestAnimationFrame.
WebGL therefore flushes the completed command batch explicitly. A later retained
scene can be unchanged and legitimately skip drawing; that optimization must not
become a dependency for submitting the preceding frame. Empty scenes also flush
their clear operation. Geometry reuse does not skip submission when a draw was
requested, and failed submission is not counted as a completed frame.

`gl.flush()` requests execution without blocking for GPU completion. This is not
a `gl.finish()`, readback, context recreation, forced software renderer, or an
idle repaint loop. Driver statistics expose `flushes` alongside submitted frames.
Flush itself does not guarantee that an operating-system compositor has already
presented the result; composited-pixel acceptance remains necessary.

Reference: [WebGL best practices: flush when expecting results](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#flush_when_expecting_results).

## Regression checks

The original 22 authoring cases remain in `tools/figma-browser-tests.py`.
`tools/figma-presentation-browser-tests.py` shares that harness's fixture,
application startup, error recording and cleanup, but runs three additional
visual cases in a separate `presentation` report directory. It cannot overwrite
the authoring result file.

The visual checks sample actual composited screenshot pixels for the header,
layers, canvas and inspector during repeated light/dark transitions and System
scheme changes. One case qualifies the actual shipped rendering policy and keeps
its selected WebGPU, WebGL2 or Canvas2D backend throughout; the other cases
explicitly exercise Canvas2D. Tests do not force a paint to satisfy a probe or
accept native HTML fallback. They also verify project isolation, classic
restoration and absence of a perpetual idle paint loop.

Each capture retains expected colors, measured colors, sample positions and
renderer statistics. The evidence includes the DOM styles, cached paint styles,
active canvases and retained commands covering each probe, distinguishing stale
scene construction from stale canvas presentation. These checks detect errors
that computed-style and interaction assertions alone cannot detect. They do not
certify complete Figma pixel parity.

```sh
npm run build
node --test tests/figma-*.test.mjs tests/modal-contributions.test.mjs tests/rendering-webgl-submission.test.mjs
python -m pip install playwright==1.57.0 Pillow
python -m playwright install --with-deps chromium firefox webkit
VB6_BROWSER=webkit VB6_TEST_TRANSPORT=http python tools/figma-presentation-browser-tests.py
VB6_BROWSER=webkit VB6_TEST_TRANSPORT=file python tools/figma-presentation-browser-tests.py
```

The Figma workflow executes 27 workspace cases per browser/origin (22 authoring,
three paint-publication and two navigation cases), separately from the classic
auto-layout regressions. Four pure presentation tests cover call ordering, retained resource
identity, detached documents, idle exclusions and failure propagation. Six WebGL
submission tests cover ordered batches, retained geometry, empty clears, color
changes, lost/disposed contexts and submission failures. Memory transport remains
a labelled local-only fallback, not origin-persistence or WebKit GPU evidence.

## Navigation event priority

Hand and Space-drag navigation capture pointer starts on the persistent designer
pane, before the form surface's auto-layout capture listener. Registering another
capture listener on the same surface is insufficient: registration order would
let auto layout begin a control move or reparent transaction first. Capturing at
the ancestor resolves the event order without coupling the solver to a particular
workspace. Events outside the designer root are ignored. Mode disposal aborts the
listener, restoring canonical Pointer editing in both Figma and Classic modes.

`tools/figma-navigation-browser-tests.py` exercises physical Hand and Space drags
over a real flow-layout control and requires the expected viewport delta with an
identical project, selection and Undo stack. A second case verifies editing and
Undo after switching to Pointer and after returning to Classic. These checks use
the shared real-IDE harness and retain evidence in a separate `navigation`
directory. They run on HTTP and file origins in all three browser engines.
