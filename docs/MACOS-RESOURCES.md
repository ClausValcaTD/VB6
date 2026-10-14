# Native macOS resources and pictures

Both direct ARM64 export and the explicit Apple Clang/source-kit path use the
same resource planner. Imported `.res` entries and `.frm`/`.frx` picture, text
and list data are resolved against the normalized project snapshot. The planner
reuses the existing RES/FRX model and Win32 picture validation rather than
loading paths from the developer's machine or fetching remote URLs.

## Resource functions

`LoadResString(index)` reads a counted UTF-16 string-table slot. Embedded NUL
and supplementary Unicode characters are retained. IDs 0 through 65535 are
accepted; an absent table produces Error 326, while an existing empty slot
returns an empty String. String-valued string-table IDs are rejected rather
than silently converted to ordinals.

`LoadResData(index, format)` returns an independently owned, zero-based Byte
array. Numeric and Unicode named identifiers are distinct: numeric `101` is
not the resource named `"101"`. Repeated calls share immutable catalog bytes,
not writable array storage. Empty data produces an allocated empty array with
bounds 0 through -1. The runtime's array-element budget also applies.

`LoadResPicture(index, format)` defaults to bitmap format 0; format 1 selects
an icon group and format 2 a cursor group. The loader resolves group components
with the group's language preference and reconstructs checked ICO/CUR data.
Cursor resources use a doubled XOR/AND bitmap height in their group header,
unlike the display height in a CUR file. Cursor hotspots remain separate from
icon plane/bit-depth fields. Invalid groups or images fail explicitly.

`project.settings.resourceLanguage` selects a numeric language ID. Lookup
prefers an exact language, then neutral language, then the first catalog entry
in stable source order. This deterministic policy is not the full Windows
thread/UI-language negotiation algorithm.

## Designer pictures and runtime ownership

The planner resolves `Picture`, `Icon`, `MouseIcon`, `DownPicture` and
`DisabledPicture` from embedded image data, imported asset paths or counted
FRX records. Decoded FRX text/list properties use the existing shared hydration
rules. A missing picture, remote URL or unresolved opaque resource is an export
diagnostic; it is not a silently missing control image. The caller's original
project and imported resource-binding snapshot are not modified.

Native AppKit `StdPicture` values retain the decoded image, picture type,
natural dimensions, selected icon/cursor data and hotspot. Assignments between
variables and controls retain object identity. Handles expire when the owning
picture is released; stale handles cannot resolve a later object.

Image controls distinguish natural sizing from Stretch. PictureBox AutoSize
uses natural image geometry; its ordinary drawing surface does not stretch
the background picture to fill. Button normal/down/disabled images, form icon
and custom MouseIcon cursor tracking use the native picture object. Invalid
picture types and oversized natural geometry are checked before replacing the
previous value, layout flag or frame.

`LoadPicture` accepts the implemented BMP/DIB, PNG, JPEG, GIF and ICO/CUR
formats; calling it without a filename returns an empty picture. Header and
pixel-dimension checks run before AppKit decoding, and decoded dimensions must
agree. `SavePicture` preserves selected icon/cursor format and hotspots, while
bitmap pictures use the existing native raster encoders. This does not yet
implement WMF/EMF rendering, every multi-resolution icon policy, original-file
byte preservation for raster re-encoding, every ImageList/third-party property
stream, or all historical OLE persistence formats.

Bitmap sampling for native GetPixel is color-managed from the image's actual
profile to sRGB. It uses a one-pixel CoreGraphics destination and returns VB's
0x00BBGGRR color value, avoiding calibrated NSColor reinterpretation. Tests
separately compare raw decoded components and sampled colors; they do not
retag decoded images or accept a broad color-error threshold.

## Bundle and source-kit contract

The planner writes `resources/vb6-assets.bin` in a source kit. The builder
copies it to `Contents/Resources/vb6-assets.bin`; direct export packages the
same catalog there and includes it in the resource seal. Resource bytes remain
outside the executable's project metadata. Extra caller-supplied resources
cannot replace this reserved catalog.

The native runtime locates the catalog relative to the actual executable,
not the current working directory. It lazily loads a bounded regular file,
rejects a symlink at the catalog path, validates all record/key/payload ranges
and keeps an immutable index. A present malformed catalog is an error, not a
resource-free application. Ordinary applications with no resources add no
catalog file.

The format has a versioned 32-byte header and 32-byte entries, separate project
and designer namespaces, counted UTF-16 keys and deduplicated immutable payloads.
Limits remain 20 MiB per catalog, 20,000 records, 10,000 designer pictures and
1,024 UTF-16 units per named identifier. These do not remove the independent
AOT image/metadata, ZIP expansion or native array budgets.

Compiler reports retain the structured resource counts and byte size. A source
kit additionally reports `resourceFiles`, independently of that catalog detail.
The source-kit manifest lists actual resource file paths.

## Validation and SDK maintenance

Helper ABI 4 identifies the resource-aware runtime. Normal builds reject an
outdated embedded SDK. The guarded runtime refresh requires native parser,
AppKit picture/pixel, lifecycle, lexical-scope, large-project and O0–O3 execution
proof before embedding the exact tested SDK bytes.

`tests/macos-resources.test.mjs` checks catalog encoding, shared frontend/FRX
resolution, caller immutability, diagnostics, source/direct resource identity,
resource report preservation and signature tampering. The independent native
parser tests mutate headers, ranges, string tables, image groups and image
dimensions under sanitizers. Genuine AppKit tests exercise decoded pixel
colors, natural/stretched sizing, failure-atomic changes, cursor hotspots and
picture/handle ownership.

The direct native harness adds a resource-form application at each optimization
level. It exercises original RES/FRX assets, resource functions, picture
assignment and raster/icon/cursor save-load paths, and verifies signatures
without recompiling or re-signing the exported application. Offline browser
conformance archives include resource data and execute separately on Apple
Silicon. Test results are retained in revision-specific CI artifacts, not
inferred from successful compilation alone.

Resource support is not arbitrary Windows DLL/OCX loading, full native control
parity, database integration, complete locale equivalence or Apple distribution
approval. See [macOS export](MACOS-EXPORT.md),
[direct AOT](MACOS-DIRECT-AOT.md) and [distribution](MACOS-DISTRIBUTION.md).

## Format references

- Microsoft RESDIR: https://learn.microsoft.com/en-us/windows/win32/menurc/resdir
- Microsoft CURSORDIR: https://learn.microsoft.com/en-us/windows/win32/menurc/cursordir
- Microsoft bitmap headers: https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-header-types
- LLVM resource compiler cursor-group conversion:
  https://github.com/llvm/llvm-project/blob/main/llvm/tools/llvm-rc/ResourceFileWriter.cpp
- Apple CoreGraphics image cropping:
  https://developer.apple.com/documentation/coregraphics/cgimage/cropping(to:)
