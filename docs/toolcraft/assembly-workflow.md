# Assembly Workflow

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this file is the focused runtime assembly path.

Build the app from the local Toolcraft runtime copy. Do not recreate controls, panels, toolbar, canvas behavior, timeline, layers, or app chrome by hand.

Use:

- `@/toolcraft/runtime` for schema, contracts, state, commands, history, canvas, panels, timeline, layers, toolbar, and tests.
- `@/toolcraft/runtime/react` for `ToolcraftApp` and hooks.
- `@/toolcraft/runtime/styles.css` for runtime styles.
- `@/toolcraft/ui` for visual components.

## Runtime Path

Declare the product with `defineToolcraft` and export its typed composition. The protected route renders `ToolcraftApp` and owns host-only props.

```tsx
import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";

export const appComposition = {
  schema: appSchema,
} satisfies ToolcraftAppComposition;
```

Edit `src/app/app-composition.tsx`, not the signed route. Product composition may provide only `schema`, `canvasContent`, `infiniteCanvasContent`, `controlRenderers`, `exportRenderer`, `modelPresentation`, `onPanelAction`, `renderDefaultCanvasMedia`, `sceneBoundsProvider`, and optional `rendererPipelineRegistration`; the protected route owns `className` and other host layout. `infiniteCanvasContent` is editor-only product output for a full Infinity viewport backdrop; it does not inherit world transforms or participate in scene bounds/export. Model products default to `modelPresentation: { mode: "runtime" }`. Custom presentation declares checked consumers and suppresses only their model targets; `renderDefaultCanvasMedia={false}` affects generic image/file preview, not runtime models. Do not compose `ToolcraftRoot`, `CanvasShell`, `ControlsPanel`, `LayersPanel`, `TimelinePanel`, or `ToolbarPanel` by hand. If a runtime surface has a performance or behavior issue, fix the shared runtime instead of replacing the surface locally.

Supporting product modules may be organized anywhere under `src`; there is no folder allowlist. The product boundary follows all product production files and rejects host/runtime surface imports, built-in control imports/re-exports, dynamic bypasses, and production dependencies on test/spec modules.

Allowed app extension points:

| Extension point | Use for |
| --- | --- |
| Schema controls | Built-in controls, targets, defaults, visibility, panel actions. |
| `canvasContent` | Product output only. |
| `infiniteCanvasContent` | Editor-only full-viewport product environment under the Infinity world; never app UI or export content. |
| `controlRenderers` | True custom controls only after the built-in fit check. |
| `exportRenderer` | One deterministic scene-coordinate product frame shared by runtime image and video export. |
| `onPanelAction` | Non-export sticky footer product actions. |
| `rendererPipelineRegistration` | One compiled executable pipeline shared by render work, actions, evidence, and new-envelope assessment. |
| Runtime commands/hooks | History, media, canvas, timeline, layers, and controlled app behavior. |

Do not render built-in controls such as `SliderControl`, `SelectControl`, `ColorControl`, `GradientControl`, `FontPickerControl`, `FileDropControl`, or `PanelActionsControl` directly in app code. Declare them in schema so layout, reset, history, visibility, keyframes, labels, and tests stay runtime-owned.

## Product Readiness

The starter baseline is neutral: canvas/upload/toolbar shell only. Do not include demo controls, prompt fields, timeline, or layers until product behavior requires them.

Once the folder is a real product, switch `src/app/app-acceptance-data.ts` from neutral readiness to:

```ts
export const appProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Product name",
  productSummary: "What the app creates or edits.",
  requestedBehavior: "The user-facing behavior this app must implement.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "This product has no visible three-dimensional scene or model.",
  },
} as const;
```

Every product declaration requires `productReadiness.exportIntent`. It is the authority for exact image/video schema actions, settings sections, and artifact acceptance. Use `core/setup-export.md` for the single export-intent decision sequence; animation and timeline choices do not supply delivery intent.

Populate `interactionOwnership` before adding canvas handles or custom
interactions. One operation has one primary `canvas` or `panel` surface chosen
from user request, inspected reference, or product usability evidence. Different
operations may share related state across surfaces; mirrored operations may not.

Use `viewInteraction.mode: "orbit"` for a visible editable spatial scene and
list its `orientationGizmo` targets. `fixed-camera` or `timeline-camera` require
explicit request/reference evidence; do not infer fixed framing merely because
the prompt did not separately request rotation.

## Controls

Before choosing component layout, export `appControlSectionInventory` and make the entity-first grouping decision. Every product section declares stable `entityId`, human-readable `entity`, exact targets, and `groupingReason`; one entity stays in one section through ten controls, while larger entities split only into explicit balanced workflow stages.

Use `core/layout.md` for section grouping, dependency cohesion, headers, reset, collapse, spacing, dividers, labels, and inline rows. Use `core/control-selection.md` and `component-rules.md` before choosing concrete controls. Built-in compound controls stay compound; extend the kit instead of splitting owned fields into neighboring controls.

## Canvas And Product Output

Use `canvasContent` only for product output: WebGL, Canvas 2D, SVG, DOM product text, shader previews, generated previews, export previews, or product editing handles.

`canvasContent` must not contain app UI: buttons, forms, CTAs, upload prompts, helper text, settings, menus, labels, placeholder copy, or empty-state instructions.

If upload/import is part of the source-material flow, use `fileDrop` and keep the pre-content canvas neutral. Do not invent canvas placeholder artwork, source CTAs, fake sample output, or hidden preset files. Use `media.defaultAssets` when the prompt or reference actually provides default files.

Use `core/runtime-boundary.md` for shell boundaries, `core/media-upload.md` for upload behavior, and `core/setup-export.md` for editable output size, background, and export sections.

## Reference And Design Sources

If a Figma URL is provided, use Figma MCP/design context before implementation and rebuild from file structure, not from a screenshot.

If a video, GIF, screen recording, contact sheet, or extracted-frame sequence is provided, write a Video Reference Study before implementation.

When porting an existing app, use `transferMode: "reference-runtime-clone"` unless the user explicitly asks for redesign. Declare `referenceStudy` plus `referenceFeatureInventory`, then prove each inspected reference feature with acceptance coverage. Use `core/reference-study.md` for the detailed reference, Figma, and video study rules.

## Timeline And Animation

Before adding animation controls, write an Animation Intent Inventory. Product animation, keyframes, and playback use the top Toolcraft timeline. Explicitly requested video export also requires that timeline, but the timeline never authorizes video delivery. Autonomous no-timeline animation is allowed only for non-product decorative motion with no user-facing transport and no video export.

Use `core/timeline-animation.md` for timeline mode, compact/extended timeline, seamless forward loops, duration changes, keyframes, viewport interaction performance, and video export timing.

## Renderer Work

For custom renderers, write the Renderer Technique Decision Matrix and typed performance model before code. Follow one sequence: reachable controls and inputs; workload dimensions and enforced boundaries; pass cost, frequency, lifecycle, and invalidation; render-plan assessment and protected kernel benchmark when required; derived paths and combined fixtures; impact-derived functional/browser development checks; lifecycle-appropriate delivery proof. Only exact request authority may add measured targeted performance.

Compile one lightweight renderer pipeline registration outside test modules. Supply that exact registration as `rendererPipelineRegistration` in the composition and as `rendererPipeline` to new-envelope performance assessment. Run `assessToolcraftRenderPlan` before implementing the renderer. Derive path ids from the assessed registration and compile workload fixtures from those paths; do not classify workload by target names or author scenario-specific maxima. Renderer work uses `useToolcraftPipelinePass`; retained resources are available only from its generation-bound pass execution context. Product code never receives runtime disposal ownership.

Use `renderer-technique.md`, `core/performance.md`, and `performance.md` for renderer strategy, envelope dimensions, pass metadata, adapters, derived paths, render scale, and optimization evidence.

## Automatic Delivery Lifecycle

Use one normal sequence: assemble or change the product, gather focused functional feedback, finish the coherent delivery batch, run protected functional delivery once, and return the app for user evaluation. Focused checks while implementation is changing do not mint delivery evidence.

1. First product delivery uses bare `npm run verify:delivery` for complete product contracts, one production build, full functional acceptance, and no measured performance.
2. Later `functional-targeted` delivery uses the same bare command for exact ownership-derived functional proof relative to the immediately previous successful delivery.
3. Classifier output establishes complaint authority only and never path localization. Only a localized complaint or a post-clarification targeted choice records an exact request quote and canonical affected path IDs in the worklog, then one bare delivery runs one targeted iteration and returns the app for evaluation. Unresolved localization creates neither performance-iteration intent nor canonical path authority regardless of classifier result.
4. A full audit requires an explicit operator request or accepted offer; only then run `npm run verify:perf` for one fresh build and the complete maximum-fixture performance matrix.

Protected receipts own changed files, the derived plan, executed checks, reports, measurements, and pass/fail evidence. The worklog keeps product intent and decisions.

For final delivery, run:

```bash
npm run verify:delivery
npm run dev
```
