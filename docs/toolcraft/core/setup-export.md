# Setup, Background, And Export

Read this module before changing Setup, canvas sizing, background, image export, video export, sticky actions, render scale, or timeline visibility.

## Runtime Setup

- Runtime `Setup` is always the first visible controls block in generated product apps.
- `Setup` is headerless, not collapsible, and has no section reset action.
- `Setup` always contains `Export Settings` and `Import Settings`.
- Do not implement settings import/export through `panelActions`, route-local file inputs, or app-authored controls.
- Do not gate settings import/export by app complexity.
- Product-output, exportable, shader, procedural, reference-clone, and uploaded-background/source apps use `editable-output`.
- Product apps declare the standard background state pair in one authored `Background` source section. Runtime removes that visible section and places a `Background` switch beside `Infinity canvas` immediately after settings transfer, with Background first.
- Runtime places `Background color` below that row, before finite canvas sizing.
- When the standard Background pair exists, `Infinity canvas` is available only while Background is on. Turning Background off exits infinite mode; turning it back on restores availability without enabling Infinity automatically.
- Finite `Aspect ratio`, `Canvas width`, and `Canvas height` follow Color; optional `Resolution scale` follows sizing.
- When enabled, `Timeline` is the final Setup control.
- Timeline and Infinity canvas are self-explanatory runtime switches and do not render help icons.
- App-authored sections must not declare runtime Setup targets: `runtime.settingsTransfer`, `canvas.infinity`, `canvas.aspectRatio`, `canvas.size.width`, `canvas.size.height`, `canvas.renderScale`, or `panels.timeline.extended`.

## Canvas Size Defaults

- When no explicit product size is provided, the default canvas size is `16:9` / `1920x1080`.
- Runtime aspect presets apply canonical canvas sizes; `16:9` is `1920x1080`.
- A prompt-provided, reference, fixed-format, or base/default size is only the initial `canvas.size`.
- Fixed/reference/base dimensions are not reasons to hide `Aspect ratio`, `Canvas width`, or `Canvas height`.
- Manual Canvas width/height edits keep the typed dimension, keep the other dimension unchanged, switch Aspect ratio to Custom, and show the reduced current ratio in the custom ratio inputs.

## Infinity Canvas

- `Infinity canvas` is the one runtime-owned mode switch for an unbounded workspace. Product code does not mirror it in `state.values` or create another canvas-mode control.
- Turning it on removes the finite artboard boundary and clipping. `Aspect ratio`, `Canvas width`, and `Canvas height` disappear because they do not constrain the workspace.
- Infinity canvas suppresses the bounded product-rendered preview background so the dormant finite output does not appear as a second canvas. While Background is on, `CanvasShell` fills the complete infinite viewport with the selected `Background color`; product code must not draw a synthetic workspace rectangle.
- Product output that semantically represents an editor environment rather than
  bounded scene geometry may use `ToolcraftAppComposition.infiniteCanvasContent`.
  Runtime mounts it only in Infinity mode, below the transformed product world,
  across the full viewport, with pointer input disabled. It does not pan, zoom,
  contribute to `sceneBoundsProvider`, or enter image/video export.
- The last finite `canvas.size` remains dormant and immutable while Infinity canvas is on. Turning it off restores that exact size and centers the finite artboard; reset, undo/redo, persistence, and settings transfer preserve the same canonical `canvas.mode` behavior. Fixed proof compares exact artboard pixels and width/height control values before Infinity, after restoration, and after redo.
- Runtime image and model assets keep explicit center-anchored world frames. Zoom, pan, radar, and model orientation change presentation, not scene geometry or export bounds.
- Product `canvasContent` and custom renderer output declare one direct `ToolcraftAppComposition.sceneBoundsProvider`. It returns product world-space rectangles for the supplied exact frame state; do not use a registry, DOM measurement, or app-authored time-range envelope.
- Runtime resolves that provider for the live committed state and positions one product scene surface at the exact union. Product output fills that surface; it does not create another absolute wrapper or reuse dormant finite `canvas.size` in infinite mode.
- Canvas 2D, WebGL, and WebGPU renderers call `useToolcraftProductSceneFrame()` inside `canvasContent` and use its rect for backing dimensions plus world-to-local translation. The hook reports finite, infinite, empty, or unavailable explicitly; empty/unavailable infinite frames do not silently render through finite fallback geometry.
- Infinite PNG export crops to the outward-rounded union of visible product, image, and model frames. Hidden or unavailable layers, runtime media suppressed by the composition, and editor-only handles or gizmos are excluded.
- Prove unavailable-image exclusion with `createToolcraftUnavailableImageResourceFixture` and `expectToolcraftInfinityCanvasUnavailableImageExportEvidence`; product tests never mutate storage/state or call the reserved bridge, and evidence publishes only after deterministic cleanup restores the ready resource.
- Infinite video export asks the provider for every state in the runtime-owned frame schedule, unions those bounds once, and uses the result for every encoded frame, preventing frame-to-frame output size changes.
- Finite-mode export remains the full finite canvas and does not call the product bounds provider.
- Empty scenes, missing/invalid product bounds, and artifacts above `8192px` per edge or `67,108,864` pixels fail before canvas allocation with visible typed feedback: `empty-scene`, `scene-bounds-unavailable`, or `scene-export-too-large`.

## Resolution Scale

- Non-vector raster, Canvas 2D, WebGL, and WebGPU previews author `canvas.renderScale` as `true` or `{ step }`. For this control, product code may customize only the slider step; it cannot author `enabled`, `min`, `defaultValue`, or `max`.
- Runtime resolves the enabled slider to canonical `min: 1`, `defaultValue: 2`, and `max: 2`; the default step is `0.25`.
- A custom step must be finite, between `0.01` and `1`, and evenly partition the canonical `1..2` range so the `2` maximum remains reachable. Invalid or non-partitioning steps fail schema resolution instead of being clamped.
- Runtime then appends `Resolution scale` after canvas sizing.
- `Resolution scale` changes backing pixels from `1` to `2` without changing visible CSS size or product output dimensions.
- The product acceptance matrix adds exactly one browser runtime row targeting `canvas.renderScale` with `renderScaleCoverage: { kind: "selected-backing-pixels", states: ["interaction", "steady"] }`; insert `"playback"` in sorted order when timeline is enabled.
- The product browser scenario uses `expectToolcraftCanvasRenderScaleEvidence` for every declared state. Only after CSS size remains stable and actual backing dimensions equal `css size × devicePixelRatio × selected scale` within the one-physical-pixel tolerance does the protected reporter emit `canvas-render-scale-backing`.
- Any quality clamp or lower-resolution stretch is a functional failure without measured performance.
- DOM/SVG/vector-native previews should not use render scale.
- Performance fixes must preserve the user's selected render scale. Do not pass budgets by silently downsampling, stretching a lower-resolution backing canvas, blurring output, or clamping render scale below the chosen value.

## Timeline Setup Switch

- When `panels.timeline` is enabled, runtime adds the `Timeline` mode switch to Setup.
- Off shows compact Play-only transport.
- On shows the extended timeline with scrubber, duration, loop, and keyframe UI.
- The switch controls runtime presentation only. It does not pause playback, change product values, remove keyframes, alter export, or reset with `Reset controls`.
- When `panels.timeline` is omitted, the Timeline switch must not appear.

## Background

- Every product app declares one authored `Background` source section containing:
  - `export.includeBackground` as a switch;
  - the product background color control.
- Runtime consumes that pair into Setup, labels the switch `Background`, places it left of `Infinity canvas` in an equal-width row, and labels the full-width color below it `Background color`.
- Background is a prerequisite for Infinity canvas. Disabling it atomically restores finite mode and disables Infinity; re-enabling it does not change the current finite mode.
- A separate visible Background section is stale layout and fails acceptance.
- Use a schema `color` target such as `appearance.background` or `scene.background`.
- Do not hardcode a configurable background in CSS, Canvas `fillStyle`, or WebGL clear color.
- Live preview calls `shouldIncludeToolcraftPreviewBackground(state)` and hides only the bounded product-rendered background when Background is off or Infinity canvas is on. In Infinity mode, the runtime viewport—not the product renderer—uses the selected Background color.
- Runtime image export reads Background directly: PNG can be transparent, while JPG remains opaque.
- Runtime video export keeps the selected background even when Background is off.

## Artifact Export Intent

Use this sequence as the single authority for choosing product artifact delivery:

1. Start every product with image export.
2. Add video export only when the user explicitly requests video delivery.
3. Do not infer video from animation, playback, keyframes, or timeline.
4. Keep image with video unless the user explicitly requests removal.
5. Record in `productReadiness.exportIntent`.

Product-mode readiness requires both discriminated decisions. Image uses `toolcraft-default`, `user-requested`, or `user-removed`: `user-requested` requires non-empty user-request evidence, and `user-removed` requires non-empty explicit user-removal evidence. Video uses `not-requested` or `user-requested`; `user-requested` requires non-empty explicit user-request evidence. Do not add optional modes, legacy fallbacks, or schema-derived inference. Resolved intent must correspond exactly to runtime-owned schema actions, settings sections, and artifact acceptance:

| Resolved delivery | Settings layout | Sticky export actions | Artifact acceptance |
| --- | --- | --- | --- |
| Image only | `Image Export` directly above sticky actions | `Export PNG` primary | Complete image coverage only |
| Image and video | `Image Export` immediately before `Video Export`; `Video Export` directly above sticky actions | `Export PNG` secondary, `Export Video` primary | Complete image and video coverage |
| Video only | `Video Export` directly above sticky actions | `Export Video` primary | Complete video coverage only |
| Explicit no-export | No image or video settings section | No image or video export action | No image or video artifact row |

Video-only requires non-empty evidence for both the explicit video request and explicit image removal. Explicit no-export requires non-empty image-removal evidence and video `not-requested`.

## Image Export

- Every app with `Export PNG` exposes a separate `Image Export` section.
- `Image Export` uses two `select` controls in one compact two-column inline row:
  - `export.image.format`, default `png`, with baseline `PNG` and `JPG` options;
  - `export.image.resolution`, default `4k`, with baseline `2K`, `4K`, and `8K` options.
- Image-only apps place `Image Export` directly above sticky footer actions.
- Apps with both image and video export place `Image Export` immediately before `Video Export`.
- Typed `export-image` actions are handled by the runtime. It resolves the current scene frame, selected format and resolution, allocates the exact backing, composites background plus visible runtime media/models, awaits `ToolcraftAppComposition.exportRenderer`, encodes the selected artifact, downloads it, and reports typed progress/failures.
- Product code supplies only the shared deterministic `exportRenderer.renderFrame` callback in scene coordinates. It must not allocate an export canvas, call `toBlob`/`toDataURL`, create object URLs, or download the artifact.
- The selected `export.image.resolution` must produce real 2048/4096/8192px long-edge PNG output for 2K/4K/8K. Retina sizing is only the fallback for current/omitted resolution.

## Video Export

- Only products with video `user-requested` intent and non-empty explicit user-request evidence expose `Export Video`; animation and timeline behavior do not authorize it.
- Any app with `Export Video` must enable the top Toolcraft timeline.
- Apps with `Export Video` expose a separate `Video Export` section directly above sticky footer actions. When image export is also enabled, `Image Export` sits immediately before it.
- `Video Export` uses two `select` controls in one compact two-column inline row by default:
  - `export.video.format`, default `mp4`, with baseline `MP4` and `WebM` options;
  - `export.video.resolution`, default `current`, with baseline `Current` and `4K` options.
- Stack the pair only when labels or selected values would clip, and record that fit reason in the worklog.
- Runtime uses the pinned Mediabunny timestamped encoder to select an actually supported container and codec. It reports the real MIME/extension or a typed visible failure.
- `MOV` and `ProRes` are not baseline browser outputs; use them only with a custom encoder/transcoder plus acceptance and performance coverage.
- Use `getToolcraftVideoExportSize` for video dimensions. `current` uses current canvas/output size with even encoder-safe rounding; `4k` fits inside 3840x2160, preserves aspect ratio, and returns even dimensions.
- Runtime renders the same shared product frame callback at a fixed 30 FPS offline schedule, evaluates each immutable frame state at its timeline timestamp, and writes explicit packet timestamps/durations. Renderer wall-clock cost changes export latency only, never media cadence or duration.
- Product code must not instantiate `MediaRecorder` or `VideoEncoder`, call `canvas.captureStream()`, import `mediabunny`, or provide a wall-clock fallback.
- Protected browser acceptance decodes representative video frames, enumerates actual encoded packet timings, and proves dimensions, duration, cadence, background, and changing product pixels before publishing evidence.

## Sticky Product Actions

- Export actions in sticky `panelActions` match the resolved artifact intent exactly. Explicit no-export products have no image or video export action.
- Clipboard copy may be an additional product action, but it never changes or substitutes for the recorded artifact intent.
- Export PNG and Export Video use `icon: "upload-simple"` to match the runtime `Export Settings` action.
- Runtime export actions own their real Promise and report render/encode/download progress through the sticky footer indicator.
- Async non-export download/copy/generate/apply handlers return the real Promise from `onPanelAction` and use `reportProgress(0..1)` when determinate progress is available.
