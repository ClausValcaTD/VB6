# Form designer support and issue #116

This is a capability audit of the browser implementation, not certification of
complete Microsoft VB6 or third-party ActiveX compatibility. The regression
fixture is synthetic; it contains no licensed native binaries or copied source.

## SSTab editing

Select a tab header in the form designer to make that page active. The active
page is persisted in the form model and the action is one undoable change. The
Properties window exposes the current page's Caption, Picture, TabEnabled and
TabVisible aliases, the Tab index, and the total Tabs count. Property Pages is
available from the inspector and designer context menu. The built-in editor
supports captions, pictures by asset reference, enabled/visible flags, count,
orientation, tabs per row, tab height, maximum width and style. Disabled or hidden
runtime tabs remain reachable in the designer for editing.

Ctrl+PageUp / Ctrl+PageDown changes the selected SSTab page. Arrow keys and
Home/End work after a header receives keyboard focus. Selecting a hidden page
child through the Properties object selector reveals its page. A newly drawn
or pasted child belongs to the selected page. Inactive page descendants do not
receive selection outlines, rubber-band selection, Select All or tab-order
markers. Disabled inputs are selected rather than activated; Timer, ImageList
and CommonDialog remain selectable at design time.

Legacy FRM ownership uses exact control name/array index and parent identity,
not a name-only lookup or a guessed negative-coordinate threshold. Reading,
rendering and saving an untouched imported fixture do not change its source
bytes. Edits materialize logical coordinates and save explicit page ownership
with inactive-page offsets back into native source. Removing the last child
retains explicit empty page records. Removing occupied pages is rejected before
mutation. Browser-only TabPage is not emitted into an SSTab FRM. Malformed or
ambiguous ownership is diagnosed rather than assigned to a random array member.

The exported browser runtime separates page visibility from a child's Visible
property, exposes indexed tab properties and supplies PreviousTab to Click. Runtime
Controls.Add records the exact container element ID and the active SSTab page;
removing controls clears page membership. Loading an imported array template
normalizes saved inactive-page coordinates. Loaded SSTab instances do not copy
the original container's child ownership. Container reassignment clears legacy
records only in cloned live properties, leaving the designer source unchanged.
Container removal validates the entire descendant graph before disposing any
object, including when a design-time control is nested below dynamic containers.
Default, Cancel and mnemonic keyboard selection excludes inactive pages and
hidden/disabled ancestors. These behaviors have actual browser regressions.
TabStrip retains its collection API and is not treated as an SSTab designer
container. No change here certifies native EXE or arbitrary OCX behavior.

## Shared editing behavior

Selections, clipboard operations and deletion use stable IDs. Copying a nested
container includes its descendants, preserves relative offsets, remaps parent
IDs and keeps copied array members under one new name. Only selected hierarchy
roots move; children are not translated twice. Escape/pointer cancellation
restores the pre-gesture form. Multi-control property edits validate a clone
before applying, and stale dialogs reject changed forms, selections or lock
state. Fixed-size control dimensions and omitted native dimensions are handled
through shared capabilities/defaults. TabIndex edits reorder eligible controls
without duplicate indices.

Optional workspace and auto-layout tools handle root-capture events before the
base designer handles plane-capture gestures. A consumed gesture must not start
a second base transaction. Keyboard tools likewise run before base key handling.
Double-click navigation resolves the actual control hit after pointer capture,
including selection handles; background double-clicks target the form event.

Property rows must be activated before their ellipsis buttons become visible,
as in the existing compact Properties UI. The built-in collection dialogs edit
private drafts; Cancel does not change the project. Tree node parent references
are resolved in two passes, so forward references work. Duplicate keys and
cycles are rejected. Grid/chart data supports quoted tab-separated fields,
escaped quotes, multiline cells, and preservation of unchanged scalar types.

## Built-in control audit

Every one of the 40 built-in toolbox controls is exercised through actual DOM
click selection and keyboard positioning by `tools/browser-designer-tests.py`.
The following table records the current designer implementation. An entry is
not a statement that every runtime property/event or native property page of
that control has been reproduced.

| Control | Designer container | Resize axes | TabIndex | Specialized editor / boundary |
|---|---|---|---|---|
| PictureBox | Yes | X/Y | Yes | Shared Properties |
| Label | No | X/Y | Yes | Shared Properties |
| TextBox | No | X/Y | Yes | Shared Properties |
| Frame | Yes | X/Y | Yes | Shared Properties |
| CommandButton | No | X/Y | Yes | Shared Properties |
| CheckBox | No | X/Y | Yes | Shared Properties |
| OptionButton | No | X/Y | Yes | Shared Properties |
| ComboBox | No | X only | Yes | List text; fixed height except Simple style |
| ListBox | No | X/Y | Yes | List text |
| HScrollBar | No | X/Y | Yes | Shared Properties |
| VScrollBar | No | X/Y | Yes | Shared Properties |
| Timer | No | Fixed | No | Shared Properties |
| DriveListBox | No | X only | Yes | Shared Properties |
| DirListBox | No | X/Y | Yes | Shared Properties |
| FileListBox | No | X/Y | Yes | Shared Properties |
| Shape | No | X/Y | No | Shared Properties |
| Line | No | X/Y | No | Shared geometry; native X1/Y1/X2/Y2 endpoint designer remains a boundary |
| Image | No | X/Y | No | Shared Properties |
| Data | No | X/Y | No | Shared Properties |
| OLE | No | X/Y | Yes | Selectable placeholder; not a generic native OLE designer |
| WebBrowser | No | X/Y | Yes | Existing isolated browser adapter; no live navigation from designer input |
| TreeView | No | X/Y | Yes | Nodes |
| ListView | No | X/Y | Yes | Columns, Items |
| ProgressBar | No | X/Y | Yes | Shared Properties |
| Slider | No | X/Y | Yes | Shared Properties |
| StatusBar | No | X/Y | Yes | Panels |
| Toolbar | No | X/Y | Yes | Buttons |
| TabStrip | No | X/Y | Yes | Tabs |
| SSTab | Yes | X/Y | Yes | Built-in tab property pages and page ownership |
| RichTextBox | No | X/Y | Yes | Shared Properties |
| MSFlexGrid | No | X/Y | Yes | GridData |
| MSHFlexGrid | No | X/Y | Yes | GridData |
| DataGrid | No | X/Y | Yes | GridData |
| DTPicker | No | X/Y | Yes | Shared Properties |
| MonthView | No | X/Y | Yes | Shared Properties |
| UpDown | No | X/Y | Yes | Shared Properties |
| ImageList | No | Fixed | No | ListImages |
| CommonDialog | No | Fixed | No | Shared Properties; no native shell dialog during design |
| MSChart | No | X/Y | Yes | GridData |
| Adodc | No | X/Y | No | Shared Properties |

## Explicit compatibility boundaries

The generic OLE placeholder is not native embedding. Third-party OCX property
pages still require trusted registered adapters; projects cannot install
arbitrary adapters. Existing native bridge support is separate from this browser
form designer. Native FRX encoding for every common-control structured collection
is not implemented by these editors. The native writer rejects unsupported
structured properties instead of silently discarding them; browser project
serialization retains them. Native Line endpoint geometry, every common-control
style/resource interaction, and pixel-identical Windows typography still need
additional implementation and differential qualification. Runtime-created
control-array/container paths listed above have focused browser coverage; this
is not a claim of exhaustive native ActiveX lifecycle compatibility.

The renderers keep the existing backend selection and fallback policy. A DOM
interaction test is not proof of physical GPU performance or exact native pixels.
The retention suite tests zero unchanged mutations, bounded visible rows and
read-before-write selection measurements. Tab header nodes and unchanged ARIA/tab-index attributes are retained between
refreshes. An actual-browser regression records zero subtree mutations for 200
unchanged SSTab refreshes (the previous implementation emitted 1,600). Page saves group bindings by owner/page instead of rescanning
all form controls for every page. Full property transactions still clone the form;
this audit does not claim constant-time editing for arbitrarily large documents.

## Reproducible checks

```
npm run build
npm run test:designer
npm test
python tools/browser-designer-tests.py --origin inline
npm run test:designer:browser
python tools/browser-html-retention.py
```

`test:designer:browser` uses normal HTTP navigation. The dedicated
`Designer controls` workflow runs the complete Chromium/Firefox/WebKit matrix
independently of the parallel existing IDE and auto-layout qualification. `--origin inline` runs the actual generated
standalone IDE in-memory for restricted local environments. `--case` is only a
local diagnosis filter; reports identify partial runs and CI does not use it.
All failures remain failures; no browser policy is changed to make a test pass.

The generated-artifact manifest is authored explicitly with
`npm run build:update-ide-artifacts` outside CI after source review. Normal builds
and CI strictly verify it; they do not rewrite expected fingerprints. Commit the
manifest with the corresponding source, not with an incomplete checkpoint.

## Reference scope

- Issue and synthetic reproduction: https://github.com/wieslawsoltes/VB6/issues/116
- Original Microsoft VB6 help identifiers recorded by the implementation:
  aa228576 (Tab), aa228561 (TabCaption), aa228581 (Tabs), aa228573
  (TabOrientation). These historical MSDN pages are not a claim of a currently
  available licensed native test environment.
- Microsoft, *Upgrading ActiveX Controls and Components*, chapter 13:
  https://download.microsoft.com/download/C/C/8/CC8C1F44-D96F-4E74-8C8A-0734D958610C/chapter13.pdf
  Native ActiveX/container migration requirements are distinct from browser
  emulation. Consult the original control's documentation for unqualified cases.
