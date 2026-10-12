# Figma workspace for real VB6 applications

Figma mode is an optional IDE workspace. It changes the editor shell, panels,
menus, tools and canvas navigation; it does not turn a project into a mockup or
replace its VB6 controls with unrelated vector objects. Classic VB6 remains the
default. Existing form code, property validation, debugger, project formats and
application export commands remain authoritative.

## Enable it

Open **Tools > Options > General > Workspace**, select **Figma**, and accept the
dialog. Cancel discards the staged workspace fields. The same settings are
available from **Tools > Figma Workspace Options**, the workspace header's
options button, or the **View > Figma Workspace** toggle.

Choose Light, Dark or System for the workspace color scheme. Choose Pixels or
VB6 twips for the compact Position section. These preferences are local to the
browser profile. Unavailable browser storage does not prevent session-only use;
the status bar reports that persistence is unavailable.

In Figma mode, the top-left **Workspace menu** contains the original File, Edit,
View, Project, Format, Debug, Run, Tools, Window and Help commands. There is no
second classic menu strip. The header provides Design/Code, Undo/Redo, panel
visibility, workspace options, and the actual VB6 Run/Stop commands.

Three settings are intentionally independent:

| Setting | Owner | Effect |
| --- | --- | --- |
| Figma workspace and its color scheme | Browser workspace preference | IDE chrome, panel arrangement and canvas navigation |
| Application appearance | Authored VB6 project | The actual controls in the designer and running/exported application |
| Anchoring and automatic layout | `project.settings.anchoring === true` | Project layout metadata, solver and runtime layout members |

Merely switching workspace does not edit the project, add a history entry,
change the application's palette, or enable automatic layout. A classic gray
VB6 form can therefore appear on a Figma-style canvas. Its appearance is an
accurate preview, not an accidental leak of the old IDE chrome.

## Workspace and actual controls

The left dock has **Layers**, **Assets** and **Files**. Layers is the current
form's actual control hierarchy. Assets is the existing toolbox registry,
presented as searchable cards with real VB6 type names. Files is the original
project explorer, not a separate page model.

The toolbar's Frame inserts a VB6 `Frame`; Text inserts a VB6 `Label`. Button and
input tools insert `CommandButton` and `TextBox`. The full Assets catalog retains
the original standard, extended and registered control types. Nonvisual controls
such as Timer remain genuine VB6 controls; they appear in the hierarchy and
property inspector but do not become flow-layout participants.

The right **Design** dock contains a compact name/type header, alignment commands,
Position, Constraints, Auto layout and **All VB6 properties**. The last section
hosts the original property inspector itself, including its object selector,
alphabetic/category tabs, type-specific editors and descriptions. There is no
second property bag to synchronize. Editing Caption, Text, Name, colors, fonts,
control arrays or supported custom properties uses the existing validation and
history paths.

Name editing invokes the existing VB6 rename operation. Event procedures are
updated through that path rather than by renaming only a layer label. Double-
click a control to open its default event, or use **Edit VB6 events**. Form events
use the VB6 `Form_...` procedure prefix, for example `Form_Load`, not the visual
form's instance name.

Layers supports Ctrl/Command multiselection, Shift ranges, search with ancestors
retained, expand/collapse, visibility editing and keyboard navigation. Arrow keys
move focus, Right/Left expand/collapse or enter/leave a parent, Enter/Space select,
and F2 focuses the real name editor. The viewport renders only the visible tree
rows plus overscan. Hierarchy traversal is iterative rather than recursive.

With project layout enabled, drag a layer above/below a sibling to reorder it,
or into a container to reparent it. The destination highlight distinguishes
before, after and inside. Drops go through the existing atomic layout authoring
operation, including parent-cycle validation and project revision checks. A
project switch or intervening edit invalidates a stale drag. Undo restores the
previous hierarchy and geometry.

## Canvas navigation and document windows

The canvas has a view-only pan/zoom transform. All control coordinates, source
properties, guides and history retain their original model coordinates. Form
resize handles move with the same plane as the form. Hit testing continues to
use the actual transformed designer, not a disconnected screenshot.

| Input | Action |
| --- | --- |
| V | Pointer / move tool |
| H | Hand tool |
| F | VB6 Frame tool |
| T | VB6 Label tool |
| Space + drag, middle-button drag, or Hand + drag | Pan |
| Wheel / trackpad | Pan |
| Shift + wheel | Horizontal pan |
| Ctrl/Command + wheel | Zoom around the pointer |
| Shift+1 | Fit the form |
| Shift+2 | Fit the selection |
| Shift+0 | 100% |
| Escape during a pan | Restore the pre-gesture viewport |

Canvas shortcuts are scoped away from text/property/code editors. The zoom menu
supports 10% through 800%, fit and fit selection. Resize observations are
coalesced, and hidden/inactive documents do not require a continuous animation
loop. Pointer capture, cancellation, lost capture and window blur terminate pan
gestures without leaving a stuck Hand state.

The default workspace shows a single active canvas with document tabs above it.
The original **Window > Cascade / Tile** commands remain functional and restore
multiple real document windows. **Window > Single design canvas** returns to the
Figma-style active-document surface; it does not close or discard other files.

Docking still uses the existing manager, including movable panels. Classic and
Figma arrangements are stored independently. Switching back restores the classic
panel profile, toolbox category, inspector placement, and previously open
classic designer zoom/scroll positions. The implementation captures scroll
before applying Figma CSS and restores it after the classic layout settles.
Below 850 CSS pixels, the header's Layers and Design buttons open mutually
exclusive drawers; Escape closes a drawer and restores header focus.

## Enable real auto layout and anchoring

Use **Enable auto layout and anchoring** in the Design inspector, or the existing
**Tools > Options > General > Layout Extensions** project option. The workspace
button prepares, solves and validates every form before publishing the project-
wide opt-in. An invalid dormant layout therefore cannot leave half of a project
enabled. The successful workspace-button operation is one Undo transaction.

The floating toolbar's plus button enables the extension first when it is off.
Once enabled, the button or **Shift+A** uses the existing Add Auto Layout command:
it enables flow on a selected container or wraps selected siblings in a new
borderless `LayoutFrameN`. **Alt+Shift+A** removes flow without deleting the
container or its children. These are actual VB6 Frames with preserved control
IDs and event source, not synthetic design-only groups.

The Design inspector embeds the complete existing Auto Layout editor. Its
supported authoring surface includes:

| Area | Supported settings |
| --- | --- |
| Flow | Absolute, Horizontal, Vertical, both wrap directions, Grid |
| Sizing | Independent Fixed/Hug/Fill axes; child minimum and maximum dimensions |
| Distribution | Start, Center, End, Space Between, Space Around, Space Evenly |
| Alignment | Item, baseline, wrapped-line, cell and per-child alignment |
| Spacing | Signed item gap, independent line/row gap, linked or four-sided padding and margins |
| Grid | Fixed, Hug and weighted `fr` tracks; implicit rows; explicit zero-based cells and row/column spans |
| Children | Ignore auto layout, basis, grow/shrink, Anchor, Dock and order |
| Rendering | Clip contents and first-on-top/last-on-top stacking |

Grid columns can contain `1200 hug 1fr 2fr`. Per-track limits can use a data-only
JSON array such as `[{"size":"1fr","min":600,"max":1800},"2fr"]`. Invalid input is
rejected before an edit is published. Zero maximum means unlimited; `-1` on an
individual inset inherits the linked inset; a `-1` line gap inherits the main
gap. These are the existing project contracts, not CSS strings masquerading as
VB6 properties.

The same solver determines designer and browser-runtime geometry. Supported
text controls have intrinsic measurement for Hug sizing; unknown controls use
authored dimensions unless a solver consumer supplies measurement. A Hug parent
with a participating Fill child on the same axis is resolved to Fixed to avoid a
circular size dependency. Hidden and ignored children do not consume flow space.
Ignored children retain absolute anchoring behavior. Manual resize changes only
the resized axis to Fixed.

The existing canvas tools remain connected: edge/center/spacing/size guides,
Alt-hover measurements, reorder and reparent previews, keyboard-accessible inset
and gap sliders, and one-transaction spacing edits. Escape, cancellation, lost
capture, blur or stale revisions cancel previews. Running and locked forms reject
edits. See [Optional Auto Layout designer](auto-layout-designer.md) for detailed
solver behavior, resource limits and runtime examples.

## Constraints and units

The compact Constraints editor exposes horizontal Center, Left, Right and Left
and right; vertical Center, Top, Bottom and Top and bottom. Its edge diagram has
24-pixel hit targets around the thin visual strokes. It edits the real Anchor
bitfield, not an unrelated display constraint:

| Bit | Edge |
| --- | --- |
| 1 | Top |
| 2 | Bottom |
| 4 | Left |
| 8 | Right |

All sixteen combinations are preserved. Opposite edges stretch with the parent;
a single edge preserves the corresponding margin; neither edge moves by half the
parent-size delta while retaining the original center offset. Child limits still
apply. Changing one axis of a mixed selection preserves each control's other
axis. Normal flow owns participating children's placement; choose Ignore auto
layout for absolute anchored placement inside a flow container. Setting anchors
uses the existing Anchor/Dock mutual-exclusion rules.

The compact X/Y/W/H fields can display pixels or twips. The browser designer uses
**15 twips per CSS pixel**, independently of physical display pixels. A width of
160 in pixel mode writes `Width = 2400`; it does not migrate the project to pixel
units. For a form, compact W/H map to ClientWidth/ClientHeight. The full VB6
property grid, advanced Auto Layout dimensions, and existing guide labels remain
in twips. Invalid, nonfinite and out-of-range compact dimensions are rejected;
negative sizes are not accepted.

## Persistence and export contracts

Workspace preferences use `vb6-studio-web.figma-workspace.v1`; independent dock
profiles use the same key with `.layouts`. They are separate from authored
project data. Malformed or denied preference storage falls back safely; malformed
saved docking is restored through the existing validating dock model or a fresh
Figma profile. No preference is written merely to make startup appear enabled.

`.vb6web` preserves authored layout metadata. Native-source projects use the
existing versioned layout companion rather than inventing Microsoft `.frm`
properties. Standalone HTML and Electron-packaged applications use the browser
runtime and embedded solver. Workspace CSS and toolbar/inspector code are not
included in exported application chrome, and a VB6 button's event still executes
VB6 code.

Target limitations are unchanged by this workspace. The freestanding PE32 target
supports its existing anchoring/docking and explicit-size stack/wrap subset;
advanced Hug/Fill, grid, baseline and other nondefault layout features are
explicitly diagnosed there. The licensed Microsoft VB6 compiler rejects the
Studio layout extension. Use HTML/Electron for the advanced browser-layout
contract. See [Auto Layout export coverage](auto-layout-designer.md#export-coverage-and-explicit-boundaries)
and [Anchoring and layout](anchoring-layout.md).

## Implementation map and validation

| Module | Responsibility |
| --- | --- |
| `src/ide/figma-mode.js` | Workspace lifecycle, commands, assets, independent profiles and appearance |
| `src/ide/figma/model.js` | Pure preferences, units, anchors, tree traversal and viewport geometry |
| `src/ide/figma/viewport.js` | Reversible designer viewport adapter and gesture lifecycle |
| `src/ide/figma/layers.js` | Windowed real-control hierarchy and guarded drag/drop |
| `src/ide/figma/inspector.js` | Canonical property/layout editors and compact constraint controls |
| `src/ide/figma/options.js` | Staged standard Options and dedicated workspace dialog |
| `src/ide/modal-contributions.js` | Title-scoped, removable modal contribution hook |
| `src/ide/figma-mode.css` | Root-scoped light/dark/responsive IDE chrome |

The installer runs after the existing editor, auto-layout, rendering and MCP
integrations. It does not fork the project model, compiler, runtime, property
registry or history service. SVG glyphs are original; no logo, font download, CDN,
external API, account or Figma service is required. Authored names and values are
inserted as text/data, not evaluated markup.

Run from the repository root:

```sh
npm run build
node --test tests/figma-workspace.test.mjs tests/modal-contributions.test.mjs
npm test
python -m pip install playwright==1.57.0
python -m playwright install --with-deps chromium firefox webkit
VB6_BROWSER=chromium VB6_TEST_TRANSPORT=http npm run test:figma:browser
VB6_BROWSER=chromium VB6_TEST_TRANSPORT=file npm run test:figma:browser
npm run test:layout:designer
```

The Figma workspace CI matrix repeats hosted and standalone acceptance in
Chromium, Firefox and WebKit, including real-origin reload persistence. It also
runs the existing classic auto-layout browser suite. Reports retain page errors,
transport, timings and light/dark/narrow screenshots. Node tests cover all anchor
combinations, unit validation, pointer-centered zoom, reversible docking,
preferences, contribution lifecycle and a 10,000-level hierarchy. The 22 browser
cases cover actual controls/properties/events/runtime, layout transactions,
physical pan/zoom hit testing, unselected-layer drag reparenting, mixed values,
readonly guards, tiling, accessibility and restoration.

`VB6_TEST_TRANSPORT=memory` is only an explicitly labelled local fallback for
restricted environments. It skips persistence and is not evidence of HTTP,
file-origin or all-browser coverage. Ordinary builds verify the committed
artifact fingerprints; CI never silently regenerates the expected manifest.

## Deliberate compatibility boundaries

This is an independently implemented Figma-style VB6 authoring workspace, not a
claim of pixel-identical Figma reproduction or Figma service compatibility. It
does not provide `.fig` import, cloud collaboration, Figma prototype semantics,
vector-network editing, component variants or variable binding. It retains VB6
application semantics where a graphics editor would have different objects.
Typography depends on installed fonts; there is no full Figma text-shaping or
stroke-inclusive layout equivalence. Existing grid guides show occupied child
rectangles, not editable rulers for every empty grid track. Those boundaries do
not turn the exposed toolbox, property inspector, layout settings or Run action
into placeholders: each is connected to the real VB6 application pipeline.
