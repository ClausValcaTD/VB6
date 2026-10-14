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
Position, Constraints, Auto layout and searchable **VB6 property sections**.
Content, Appearance and Typography are initially expanded; Behavior, Data and
binding, Window, Geometry, Layout and More group the other supported properties.
These sections use the original inspector's type-specific editor rows and
descriptions. Classic object/category tabs return on leaving Figma mode. There
is no second property bag to synchronize. Editing Caption, Text, Name, colors, fonts,
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
node --test tests/figma-*.test.mjs tests/modal-contributions.test.mjs
npm test
python -m pip install playwright==1.57.0 Pillow
python -m playwright install --with-deps chromium firefox webkit
VB6_BROWSER=chromium VB6_TEST_TRANSPORT=http npm run test:figma:browser
VB6_BROWSER=chromium VB6_TEST_TRANSPORT=file npm run test:figma:browser
npm run test:layout:designer
VB6_BROWSER=chromium VB6_TEST_TRANSPORT=http npm run test:figma:editor
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

## Expanded property and code workspaces

The Design inspector now exposes **Content**, **Appearance** and **Typography**
by default. **Behavior**, **Data and binding**, **Window**, **Geometry · twips**,
**Layout properties · twips** and **More VB6 properties** organize the remaining
properties supported by the current selection. The search field filters by
property name, section and available component description. Multiple search
terms must all match. Expand/collapse controls affect only the property view;
Escape clears search and Enter moves focus to the first editable match.

These sections project the existing PropertyInspector's keys and editor rows.
They neither invent properties nor maintain a second property bag. Color fields
keep VB6 OLE/BGR numeric values and the real system-color palette; text and lists
use the original multiline dialog; Font opens the original font dialog, while
individual font attributes are directly editable. Mixed values, component
validation and Undo remain shared with Classic. Running or locked forms cannot
be edited. A pending dialog/palette cannot apply its result after the project,
module, selection or originating property row has been replaced.

Code documents replace the irrelevant Design controls with a **Code** sidebar:
searchable, windowed procedure outline, cursor/line/procedure counts, Go to Line,
Find/Replace, split editing, Full Module/Current Procedure modes, and line-number
control. Comment, Uncomment and Format commands use the existing source editor;
bookmark and breakpoint buttons operate on the existing project/debugger state.
Form layers remain visible while editing their source; selecting a layer returns
to its designer. Non-form modules expose the code tools without a fake form.
The outline consumes the editor's incremental procedure index, not another
parser or source buffer, and unsubscribes when changing or closing documents.

The source editor has a native transparent textarea above its syntax layer.
Generic Figma form-field styling must not give that textarea an opaque background
or different typography/padding. The source/XAML inputs and optional advanced
editor surfaces are excluded from those chrome rules. Figma code colors follow
the workspace scheme, but explicit editor font, size and color preferences take
precedence. Native selection/caret geometry, split panes and source Undo retain
the existing editor contract. Optional Monaco surfaces use their own native
folding rather than the legacy Current Procedure projection.

`tools/figma-editor-browser-tests.py` exercises displayed keyword pixels (not just
DOM text), matching input/syntax metrics, physical typing and split Undo, outline
navigation, real property dialogs and validation, mixed values, search, and
Classic restoration. It runs on HTTP/file origins in the Figma browser matrix.
`tools/figma-advanced-editor-browser-tests.py` additionally exercises the Code sidebar
against actual optional Monaco editing and split views. Generated screenshots
and per-case results are retained in CI; an unavailable backend or startup failure
is not a passing case.


## Agent, MCP and tool views in the workspace

The header provides **Agent**, **MCP** and **Tools**. Agent opens beside the current
form/code document in the right dock, with the original Task, Connection, Changes,
Queue, Permissions, Tools, Plan, Tasks and Activity pages. MCP opens in the bottom
tool dock with its original access, permissions, capabilities, activity and
operations pages. Tools links directly to those pages and to Search, Object
Browser, Resources, Data Environment and the registered docked views. Existing
modeless documents, including XAML and advanced navigation tools, receive real
workspace document tabs. Their source/view implementations are not replaced.

The hosted content is the original tool object and DOM root. Hiding a dock leaves
its task/connection alive; **Expand to document** moves the same view into MDI;
the header rehosts it. The original Close action retains its original cancellation
and disposal semantics. Returning to Classic moves hosted views back to their
MDI owners without clearing drafts, transcripts, keys or running transports. Keys
are not copied into workspace preferences. Dock placement is part of the existing
independent Figma profile; no provider/MCP connection is created by profile reload.
Opening Data Environment never executes a query. Existing project-reset owners
still revoke old-project access and cancel their operations.

Header state distinguishes an active agent run and enabled MCP sharing. The
original MCP access indicator and consent/permission controls remain operative;
**Stop MCP sharing** delegates to the original sharing owner. Opening, hiding,
expanding or restyling a tool grants no new permissions and sends no request.
On narrow screens the Agent opens in the right drawer, with scrollable page tabs;
Escape closes the drawer, not its task. Tool content uses workspace palette
variables locally, without changing the authored application's colors.

**Review selection for agent** captures form/control identities and allowlisted
geometry/layout settings, or the explicitly selected source text. A review dialog
lets the user edit the text, cancel, or append it to the current agent draft. It
never sends the draft. Existing draft edits are preserved. Task, project or module
replacement invalidates the pending append. Form values such as Text, Tag, assets,
project settings, transport credentials and runtime data are not collected.
Names and selected source can still be confidential: inspect the preview. The
source excerpt is limited to 12,000 characters, control context to 100 controls,
and the resulting draft to the agent's 100,000-character limit. Reviewed context
is task data, never an authorization to perform its described actions.

## Drag Assets onto the actual designer

Drag a VB6 component card from **Assets** onto the form or a nested container.
The preview shows the target name, local twip coordinates, default-size footprint
and destination outline. In flow containers it shows the insertion slot instead.
Placement uses the live transformed client surface: pan/zoom and Frame/tab client
insets are accounted for. Selection handles and layout-padding overlays do not
accidentally turn a nested drop into a root-level insertion. Other windows and
modals still occlude the designer normally.

The drop uses the canonical stock/registered component type, independent custom
defaults, a unique name, TabIndex and both native-parent ID and name. It creates
one detached proposal, validates it, then publishes one Undo transaction. Existing
layout solves horizontal/vertical/wrapping/grid children in that transaction.
Alt bypasses the grid and marks participating visual children Ignore auto layout;
Timer and other nonvisual components remain form-owned and outside flows. Normal
click-to-draw and double-click insertion remain available.

Use the separate grip for touch/pen dragging; the remainder of the card remains
scrollable. Focus the grip and press Enter/Space for keyboard placement, arrows
to move, Shift+arrows for ten grid steps and Enter to insert. Escape/Tab cancels.
The current form designer is activated when placement starts from its Code view.
A pointer held near the canvas edge pans the viewport without changing form data;
Escape reverses that drag's automatic pan. Animation stops when the drag ends or
leaves the edge. Pointer cancellation, capture loss, blur, mode exit, invalid
outside drops and intervening project/form revisions cancel without insertion.
Locked and running forms reject placement.

Only a drag started in this workspace is accepted. The browser's protected drag
store contains an opaque per-drag nonce, not serialized controls, JavaScript,
URLs or credentials. The destination revalidates the session, nonce, type,
revision and form before publication. External files, `.fig` objects and other
browser windows are not interpreted as component drag capabilities; use the
existing project/file import commands for those workflows.

`tools/figma-services-browser-tests.py` checks real hosted tool lifetimes, reviewed
context, an active synthetic local transport without provider calls, native asset
drops, nested/flow/Alt/nonvisual placement, mouse-grip and keyboard cancellation,
edge pan, narrow drawers and origin-backed dock reload. Chromium additionally
uses a physical CDP touch stream; Firefox and WebKit explicitly skip that
Chromium-only touch injector, not their native/pointer authoring checks. All three
engines run HTTP and standalone-file cases in the Figma workflow. Memory origin
is a local fallback only and explicitly skips persistence.
