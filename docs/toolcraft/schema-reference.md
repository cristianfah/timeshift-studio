# Schema Reference

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this file is a field reference for `src/app/app-schema.ts`.

Edit `src/app/app-schema.ts` as the public product surface. Use `defineToolcraft` to configure runtime surfaces, product controls, defaults, persistence, and product actions.

## Runtime Shape

Top-level schema fields:

| Field              | Purpose                                                                | Detailed rules                                                             |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `canvas`           | Product workspace, output size, upload/drop support, render scale.     | `core/runtime-boundary.md`, `core/setup-export.md`, `core/media-upload.md` |
| `media`            | Predefined attached files, images, and models shown in `fileDrop`.      | `core/media-upload.md`                                                     |
| `panels`           | Controls, layers, timeline.                                            | `core/runtime-boundary.md`, `core/timeline-animation.md`                   |
| `toolbar`          | History, radar, theme, zoom.                                           | `assembly-workflow.md`                                                     |
| `persistence`      | Intentional reload persistence for runtime slices.                     | `performance.md`, `acceptance-testing.md`                                  |
| `settingsTransfer` | Runtime-owned Export Settings / Import Settings identity.              | `core/setup-export.md`                                                     |
| `panelActions`     | Sticky product delivery actions such as export, copy, generate, apply. | `core/setup-export.md`, `core/control-selection.md`                        |

Schema controls always bind to a `target`, use `defaultValue` for reset behavior, and include `performanceRole` / `performanceReason` on visible non-action controls. Use built-in control `type` values before `controlRenderers`.

## Canvas

Canvas sizing modes:

- `editable-output`: product/export apps. Runtime `Setup` shows Background beside Infinity canvas, then Background color, `Aspect ratio`, `Canvas width`, `Canvas height`, optional `Resolution scale`, and finally optional `Timeline`. With the standard Background pair, Background off restores finite mode and disables Infinity; an enabled infinite viewport uses the selected Background color.
- `intrinsic-media`: explicit media-viewer/source-native products where imported media intentionally owns `canvas.size`.
- `fixed-output`: non-product/internal fixtures where users must not edit output size.

Product-output, exportable, shader, procedural, and reference-clone apps use `editable-output`. Uploaded background/source images inside a product canvas also use `editable-output`: keep the current canvas size and render the image as cover/crop inside current canvas bounds.

`canvas.mode` is runtime state with values `"finite"` and `"infinite"`; it is not a second schema sizing mode. `canvas.infinity` is the reserved built-in Setup target. Infinite mode preserves `canvas.size` only for later finite restoration and never uses that dormant size for layout or export.

Editable-output apps may opt into Infinity for a fresh workspace and Reset with
`canvas.sizing: { defaultMode: "infinite", mode: "editable-output" }`. Omitting
`defaultMode` keeps the runtime default finite. A valid persisted or explicitly
provided initial canvas mode takes precedence over the schema default.

Custom product output declares bounds on the composition:

```tsx
export const appComposition: ToolcraftAppComposition = {
  canvasContent: <ProductCanvas />,
  sceneBoundsProvider: ({ state }) => [
    getVisibleProductSceneRect(state),
  ],
  schema: appSchema,
};
```

The provider returns world-space `{ x, y, width, height }` rectangles for one exact state. Runtime uses their union for the live infinite product scene, unions them with visible image/model frames for export, and calls the provider for every scheduled video state before forming one stable envelope. Canvas 2D, WebGL, and WebGPU product output calls `useToolcraftProductSceneFrame()` inside `canvasContent` for active backing size and world-to-local translation. Product code does not read DOM bounds, author a time-range envelope, or reuse dormant finite size in infinite mode.

Use `canvas.renderScale: true` or `canvas.renderScale: { step }` only for non-vector raster previews such as Canvas 2D, WebGL, or WebGPU. For this field, product code may customize only the slider step; authored schema cannot set `enabled`, `min`, `defaultValue`, or `max`. Runtime resolves enabled render scale to `{ enabled: true, min: 1, defaultValue: 2, max: 2, step }`, using `0.25` when no step is authored. A custom step must be finite, between `0.01` and `1`, and evenly partition the canonical `1..2` range so `2` remains reachable; invalid input fails fast. Do not enable it for DOM/SVG/vector-native previews. Enabling it requires one browser runtime acceptance row targeting `canvas.renderScale` with `renderScaleCoverage.kind: "selected-backing-pixels"` and exact sorted states `["interaction", "steady"]`, plus `"playback"` when timeline is enabled. The fixed `canvas-render-scale-backing` recipe proves actual backing pixels rather than timing.

## Media Defaults

Use `media.defaultAssets` for predefined files, images, or model packages with complete local appearance dependencies:

```ts
media: {
  defaultAssets: [
    {
      id: "default-source",
      assetKind: "image",
      dataUrl: "data:image/png;base64,...",
      fileName: "source.png",
      sourceTarget: "source.image",
    },
    {
      id: "default-model",
      assetKind: "model",
      fileName: "scene.gltf",
      sourceTarget: "source.model",
      sourceFiles: [
        {
          dataUrl: "data:model/gltf+json;base64,...",
          path: "scene/scene.gltf",
        },
        {
          dataUrl: "data:application/octet-stream;base64,...",
          path: "scene/geometry.bin",
        },
      ],
    },
  ],
}
```

`sourceTarget` must match a compatible `fileDrop` control target. Runtime shows the asset as an attached file, users can remove it, and Reset restores it. Model defaults require `assetKind: "model"`, a root `fileName`, and complete local `sourceFiles`; each source uses a serializable `dataUrl` plus its bundle-relative `path`. Runtime restores default models through the same validation, analysis, repair, repository, and rendering pipeline as a user upload. Persisted empty media remains empty until Reset and must not silently resurrect defaults.

For a multi-item `fileDrop`, `recommendedMaxItems` is advisory. `hardMaxItems`, when present, must be a finite nonnegative safe integer and is enforced before decode or storage allocation. Additive imports count current assets with the same `sourceTarget` plus the incoming logical batch; replacement imports count only the incoming batch. A `fileDrop` with `assetKind: "file"`, `multiple: true`, and `variant: "collection-actions"` may declare `itemControls`; each entry uses a supported built-in collection item control and declares `defaultValue`. Attached files render these controls directly beneath their upload row, values persist at the parent target as records keyed by `mediaId`, and file bytes remain runtime-owned media.

## Model FileDrop

Declare appearance-preserving 3D import through the built-in control:

```ts
model: {
  type: "fileDrop",
  assetKind: "model",
  target: "source.model",
  label: "Model",
  topologyProfile: "realtime-mesh",
  modelFormats: ["glb", "gltf", "fbx", "obj", "stl", "ply"],
  modelLimits: {
    maxTriangles: 1_000_000,
  },
  performanceRole: "workload",
  performanceReason: "Imported topology controls decode, analysis, repair, and render cost.",
}
```

`modelFormats` may narrow the production adapters but cannot advertise an unavailable format. `modelLimits` may narrow normalized runtime admission limits; do not widen protected ceilings in product code. `topologyProfile` is `"realtime-mesh"` or `"solid-mesh"`. Model upload is one package (`multiple: false`): a standalone root, a folder batch with relative paths, or one bounded ZIP. Runtime preserves the supported authored appearance subset, selects the first normalized supported root, and uses the Blender-compatible fallback only when authored appearance is absent. Product code does not add loaders, topology state, repair actions, material reconstruction, or a second model store/cache.

Composition declares the presentation owner:

```ts
export const appComposition: ToolcraftAppComposition = {
  modelPresentation: { mode: "runtime" },
  schema: appSchema,
};
```

For a true custom model canvas, use `mode: "custom"` with unique `{ id, sourceTarget, orientationTarget? }` declarations and mount `useToolcraftModelPresentationConsumer` for each declaration. Custom consumers acquire and release presentation leases; they never parse source files or call format loaders. `renderDefaultCanvasMedia: false` does not suppress runtime model presentation.

## Panels

- `panels.controls` contains product sections after mandatory runtime `Setup`.
- `panels.layers` is only for multiple editable objects, media objects, groups, visibility, selection, or reorder.
- `panels.timeline` is required for product animation, keyframes, playback, and video export.

Timeline compact/extended presentation is runtime UI state owned by the auto-injected `Setup` switch. Do not create product targets for `panels.timeline.extended`.

## Toolbar

`toolbar` configures runtime-owned controls:

```ts
toolbar: {
  history: true,
  radar: true,
  theme: true,
  zoom: true,
}
```

History owns undo/redo and keyboard shortcuts. Do not add route-local undo/redo listeners. Standard shortcuts operate from focused non-text controls such as sliders and switches; active text-entry fields retain native text undo until editing ends.

## Control Fields

Common control fields:

| Field               | Purpose                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `type`              | Built-in type or registered custom renderer type.                                                                            |
| `target`            | Runtime state target.                                                                                                        |
| `defaultValue`      | Initial value and reset value.                                                                                               |
| `label`             | Short UI label, `false`, or omitted.                                                                                         |
| `description`       | Product-specific help text only when it adds meaning beyond the label.                                                       |
| `applicability`     | Required product claim: `{ mode: "always" }` or `{ mode: "conditional", all: [...] }`. Hidden values are preserved.       |
| `orderRole`         | Makes section order testable.                                                                                                |
| `semanticGroup`     | Language-independent product sub-entity/workflow grouping, required on every control in sections with eight to ten controls. |
| `sliderValueKind`   | `slider` intent: `"continuous"` or `"discrete"`.                                                                             |
| `textValueKind`     | `text`/`code` intent: `"single-line"`, `"multiline"`, or `"structured"`.                                                     |
| `curveIntent`       | `curves` composition: `"single-value-map"` or `"color-channels"`.                                                            |
| `performanceRole`   | `"workload"` or `"responsiveness"` for coverage derivation.                                                                  |
| `performanceReason` | Why the role fits this app.                                                                                                  |
| `commitMode`        | `text` controls: `"content"` applies while typing, `"setting"` commits on blur/Enter.                                        |
| `keyframeable`      | Timeline/keyframe capability override when structurally needed.                                                              |
| `variant`           | Component-specific variant.                                                                                                  |

Every authored product control declares `applicability`: use `{ mode: "always" }` only when it affects its accepted outcome in every finite sibling-selector branch, or `{ mode: "conditional", all: [...] }` when every predicate must match. Inactive controls are absent while values remain preserved. Do not use `disabled`, `disabledWhen`, or inert visible controls for availability. Legacy control `visibleWhen` remains readable only at the low-level compatibility boundary; product acceptance rejects it and omitted applicability. Section `visibleWhen` remains a separate legacy section-layout feature.

Conditions support `equals`, `notEquals`, `oneOf`, `notOneOf`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, and `lessThanOrEqual`. Reserved runtime targets include `runtime.settingsTransfer`, `canvas.infinity`, `canvas.aspectRatio`, `canvas.size.width`, `canvas.size.height`, `canvas.renderScale`, and `panels.timeline.extended`; product sections must not declare them.

## Built-In Control Types

[//]: # (toolcraft-contract:built-in-control-table:start)
| `type` | Runtime visual owner |
| --- | --- |
| `aspectRatio` | `CanvasAspectRatioControl` |
| `slider` | `Slider` |
| `rangeSlider` | `RangeSlider` |
| `text` | `TextInput` |
| `rangeInput` | `RangeInput` |
| `code` | `CodeTextarea` |
| `select` | `Select` |
| `segmented` | `Segmented` |
| `tabs` | `TabsControl` |
| `switch` | `Switch` |
| `checkbox` | `Checkbox` |
| `actions` | `Actions` |
| `collectionActions` | `CollectionActions` |
| `sourceCollection` | `ControlsPanelCollectionItems` |
| `panelActions` | `PanelActions` |
| `colorOpacity` | `ColorOpacity` |
| `palette` | `Palette` |
| `vector` | `Vector` |
| `orientationGizmo` | `ToolcraftOrientationGizmo` |
| `color` | `Color` |
| `gradient` | `Gradient` |
| `fontPicker` | `FontPicker` |
| `curves` | `Curves` |
| `anchorGrid` | `AnchorGrid` |
| `channelMixer` | `ChannelMixer` |
| `fileDrop` | `FileDrop` |
| `imagePicker` | `ImagePicker` |
| `settingsTransfer` | `SettingsTransfer` |
[//]: # (toolcraft-contract:built-in-control-table:end)

Use `component-rules.md` for component-specific fit, labels, variants, units, parser behavior, and exceptions. `sourceCollection` renders a supported built-in `itemControl` for a source-owned array without add/remove UI; `collectionActions` owns user cardinality and its limits. Use `itemControl` for one homogeneous repeated value. For one logical repeated entity made from two or more built-in fields, use `itemControls`; for example, `{ type: "collectionActions", target: "surface.layers", defaultValue: [{ strength: 0.4, invert: false }], itemControls: { strength: { type: "slider", defaultValue: 0.5 }, invert: { type: "switch", defaultValue: false } } }`. Every field requires `defaultValue`; `itemControl` and `itemDefaultValue` are invalid competing template sources. `+` appends the complete defaults, `−` removes the final record, edits preserve sibling/product keys, and runtime places a line only between compound records without `Item N` headings. Standalone color `itemControl` remains a divider-free two-column grid. Use `core/control-selection.md` before deciding a custom control is needed.

`orientationGizmo` uses a non-degenerate `{ position: [x, y, z], up: [x, y, z] }` default, `label: false`, and `keyframeable: false`. Declare one target for the active/selected model and keep it beside at least one visible product control in the semantic model/view section; runtime renders the handle on the canvas rather than in the controls panel. Multiple declarations require statically provable mutually exclusive combined section/control visibility conditions, because runtime permits at most one active orientation handle.

## Product View Interaction

Product-mode `appProductReadiness` always declares the spatial view decision
before schema controls or renderer code:

```ts
export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: { image: { mode: "toolcraft-default" }, video: { mode: "not-requested" } },
  interactionOwnership: [],
  mode: "product",
  productName: "Model Studio",
  productSummary: "An editable three-dimensional product scene.",
  requestedBehavior: "Rotate the model and export the selected view.",
  viewInteraction: {
    mode: "orbit",
    orientationTargets: ["view.orbit"],
  },
};
```

## Interaction Surface Ownership

Product readiness declares `interactionOwnership` before controls or canvas
interactions. Each operation uses one primary surface while distinct operations
may edit related state across surfaces:

```ts
interactionOwnership: [
  {
    alternative: {
      reason: "A panel copy would separate the same drag from visible output.",
      surface: "panel",
    },
    capability: "direct-spatial-edit",
    evidence: {
      detail: "The inspected reference exposes draggable handles over output.",
      source: "reference",
    },
    id: "output-position-drag",
    reason: "Canvas drag preserves spatial correspondence and immediate feedback.",
    surface: "canvas",
    target: "output.position",
  },
  {
    alternative: {
      reason: "The canvas would obscure output with persistent property chrome.",
      surface: "canvas",
    },
    capability: "property-edit",
    evidence: {
      detail: "A usability comparison keeps non-spatial properties discoverable.",
      source: "usability-analysis",
    },
    id: "output-position-properties",
    reason: "The panel exposes useful properties without duplicating direct drag.",
    surface: "panel",
    target: "output.position",
  },
]
```

Capabilities are `direct-spatial-edit`, `spatial-selection`,
`structured-selection`, `property-edit`, `precise-value-entry`,
`collection-edit`, and `command`. Evidence sources are `user-request`,
`reference`, and `usability-analysis`. Canvas handles and custom interactions
reference the inventory through acceptance `interactionId`; a built-in panel
control also references it when its target overlaps a canvas handle.

Use `non-spatial` only when no visible three-dimensional scene/model exists.
Use `fixed-camera` or `timeline-camera` only with `source:
"explicit-user-request" | "inspected-reference"` and non-empty `evidence`.
Timeline camera also requires timeline playback/keyframes. Orbit targets must
exactly match schema `orientationGizmo` targets.

## Control Section Inventory

Before writing `panels.controls.sections`, export `appControlSectionInventory` beside `appAcceptance`:
```ts
export const appControlSectionInventory = [
  {
    entity: "Text block",
    entityId: "text-block",
    groupingReason: "These controls edit the text content, typography, and visible text fill together.",
    id: "text",
    targets: ["text.content", "text.font"],
    title: "Text",
  },
] as const;
```

- Every product control target appears exactly once in the inventory. Runtime-owned `Setup`, sticky footer `Export`, settings transfer, and runtime canvas sizing targets do not need entries. The product targets authored in the standard `Background` source section remain in its `Background` inventory entry after runtime relocates those controls into `Setup`. Stable `entityId` is the primary grouping authority; target namespaces are only secondary diagnostics.
- Keep one logical entity in one section through ten controls. One to seven controls is the normal size; sections with eight to ten controls require `semanticGroup` on every control. Controls editing one tightly scoped product sub-entity share the same group, and this fact may not be inferred from English labels.
- When one entity has more than ten controls, split it into balanced workflow sections containing two to ten controls. Every split section keeps the same `entityId` and `entity`, declares a unique `workflowStage`, and provides a concrete `splitReason`. Do not create a one-control tail.

## Transfer Metadata

Reference and motion metadata lives in `appTransferMode`.

Use `transferMode: "reference-runtime-clone"` when porting an existing app unless the user explicitly asks for redesign. Reference clones declare `referenceStudy`, `referenceFeatureInventory`, and acceptance mapping; detailed evidence requirements live in `core/reference-study.md`.

Every product readiness declaration includes required `exportIntent`. Its resolved image/video capabilities must correspond exactly to schema actions and settings sections. Use `core/setup-export.md` for the authoritative modes, evidence requirements, and decision sequence.

Video references declare `videoReferenceStudy` before implementation. Animated products declare `animationIntent`, and playback/keyframe timeline apps declare a proven loop duration when known. Detailed animation rules live in `core/timeline-animation.md`.

## Export And Actions

Product apps expose enabled artifact delivery through sticky `panelActions`, not canvas UI or ordinary body controls. `productReadiness.exportIntent` is required: image export defaults on and is absent only with explicit removal evidence; video export exists only with explicit user-request evidence. Animation, playback, keyframes, and timeline presence never change that intent.

Every app with `Export PNG` includes `Image Export` controls with `export.image.format` and `export.image.resolution`. Apps with `Export Video` include `Video Export` controls with `export.video.format` and `export.video.resolution`. Image-only, image-plus-video, video-only, and explicit no-export layouts must match `core/setup-export.md` exactly.

Use the standard runtime path: declare typed `export-image`/`export-video` panel actions and their settings, provide one `ToolcraftAppComposition.exportRenderer` when product code contributes pixels, and draw one deterministic frame from the supplied state/time in scene coordinates. Call `shouldIncludeToolcraftPreviewBackground(state)` only for bounded live preview; runtime owns artifact composition, sizing, encoding, download, progress, and errors.

Detailed Setup, Background, Image Export, Video Export, sticky action, icon, and progress rules live in `core/setup-export.md`.

## Persistence

Generated apps persist their runtime workspace locally by default. The resolved base plan contains `"canvas"`, `"panels"`, and `"values"`; enabled timeline, layers, and media capabilities add `"timeline"`, `"layers"`, and `"media"` automatically. Most apps do not need a `persistence` field.

Use an explicit localStorage configuration only to customize the key/version or request additional compatible slices:

```ts
persistence: {
  storage: "localStorage",
  key: "toolcraft:my-app:state:v3",
  version: 3,
  include: ["timeline"], additionalValueTargets: ["composition.layout"],
}
```

Explicit `include` augments rather than removes capability-derived slices. Control-backed values persist automatically; `additionalValueTargets` opts product-owned non-control state into persistence after trimming and deduplication, while empty entries and undeclared values remain excluded. `{ storage: "none" }` is the only opt-out; record why losing the workspace on reload is intentional.

localStorage contains only small versioned JSON metadata. Image, file, and model bytes live in the Toolcraft binary repository backed by IndexedDB; persisted media records contain resource references, never data URLs. Product code must not read or write either storage API directly. Reset restores schema defaults, Settings Transfer remains the portable JSON boundary, and unavailable binary resources become typed per-asset failures without discarding other restored slices.

Every local app declares `persistenceCoverage: "reload"`, `evidence: "persistence-state"`, and `persistenceSlices` exactly equal to the resolved `schema.persistence.include`, then proves the visible workspace after a real browser reload.

## Settings Transfer

`settingsTransfer` customizes runtime-owned settings import/export identity:

```ts
settingsTransfer: { enabled: "auto", additionalValueTargets: ["composition.layout"] };
```

Allowed values are `"auto"`, `true`, `false`, or `{ enabled, appId, fileName, additionalValueTargets }`. Control-backed values transfer automatically; `additionalValueTargets` opts product-owned non-control state into settings JSON while undeclared values stay excluded. Transfer and persistence allowlists are independent; both are trimmed and deduplicated during resolution. None of these options hide mandatory runtime `Setup`; do not implement settings import/export through `panelActions`, hidden file inputs, or route-local handlers.
