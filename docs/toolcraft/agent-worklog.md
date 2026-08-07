# Implementation Worklog

This file records product decisions and the evidence behind them. Keep it short, factual, and current. Update it after schema, renderer, timeline, layer, export, performance, or acceptance decisions.

## Status

Mode: starter

The neutral starter has no product renderer, timeline, layers, export behavior, or performance workload yet. Replace this status with `Mode: product` when the folder becomes a real app.

## Automatic Delivery Lifecycle

Keep this worklog human-shaped. For the first product delivery, record the request, decisions, state/output mapping, reference evidence, rejected alternatives, and known risks; one bare `npm run verify:delivery` derives complete contract proof, one build, full functional acceptance, and no measured performance. For later `functional-targeted` delivery, record only the new intent and decisions; the same bare command derives exact ownership-required proof from protected state.

Classifier output establishes complaint authority only and never path localization. A localized performance complaint adds the domain authority below, then one bare `npm run verify:delivery` runs one targeted iteration. If localization remains unresolved regardless of classifier result, ask one user-facing question naming visible operations and offering targeted diagnosis or a complete review; record neither `performance-iteration` intent nor canonical path authority until the answer supplies exact localization evidence. Never ask the user to choose internal path IDs. A broad or honestly unlocalizable problem may present that single choice with a recommendation for complete review, but the user still chooses. A direct complete-review request needs no further clarification. The full audit remains separate and requires an explicit operator request or accepted offer before `npm run verify:perf` may run. Protected receipts own changed files, plans, checks, reports, measurements, and pass/fail evidence.

When `canvas.renderScale` is enabled, record the renderer decision to preserve selected backing quality and map it to functional `renderScaleCoverage` for interaction and steady state, plus playback when timeline is enabled. The worklog may name the protected `canvas-render-scale-backing` recipe, but it cannot claim its evidence or turn a quality failure into performance authority.

## Performance Iteration Entry Contract

For high-confidence ordinary work, record `Performance intent: ordinary-product-work`. For unresolved localization, whether classification returned high-confidence `performance-iteration` or `needs-agent-judgment`, record the unresolved visible operation but no `Performance intent: performance-iteration` field or `Performance paths` until the user's one clarification provides exact localization. For a localized performance complaint or post-clarification targeted choice, record exactly these domain fields in the latest iteration:

```md
- Performance intent: performance-iteration
- Performance request evidence: "<verbatim exact Request quote>"
- Performance paths: ["performance-path:%5B...%5D"]
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
```

The quoted evidence must be an exact nontrivial raw substring of `Request` with identical whitespace and Unicode code units. `Performance paths` must be a non-empty unique JSON array of canonical path IDs. Do not record command arguments, changed-file inventory, executed checks, reports, or measurements; the protected planner and receipt own that machine evidence. Each localized complaint or post-clarification targeted choice authorizes one bounded iteration; after it passes, return the app and wait for user evaluation. Classifier output or complaint evidence alone never supplies path localization or authorizes full certification. The separate operator command is permitted only after the user explicitly requests a complete audit or explicitly accepts the agent's offer; the user does not need to name the command.

## Decision Trail

### Iteration 1 — Model appearance and presentation runtime contract

- Request: Preserve authored model materials and textures from folders or ZIP packages, use a Blender-like fallback only when authored appearance is absent, render the result on the canvas, and keep direct orbit synchronized with the orientation gizmo.
- Task type: Runtime, starter, contract, CLI, and generated-app delivery.
- User-visible result: GLB/glTF/OBJ/FBX/PLY/STL imports now retain the supported authored appearance subset, folder and ZIP resources remain durable, missing appearance resources surface typed warnings, and materialless geometry uses the canonical fallback. Runtime preview keeps one presentation lease and one camera pose for canvas rendering, direct model drag, gizmo snap, history, reset, and export.
- Source/reference checked: `/Users/kusnizza/Projects/toolcraft-apps/rain-drops`, the production model adapters, canonical document codecs, binary repository reachability, runtime canvas/model presentation, and generated-app browser evidence.
- Reference inputs: The user selected preservation for both folder and ZIP imports, fallback only when authored material is absent, and the current Toolcraft application contract as the source of truth.
- Docs/contracts read: `core/runtime-boundary.md`, `core/media-upload.md`, `core/performance.md`, `renderer-technique.md`, `acceptance-testing.md`, and the runtime decision/component contracts.
- Contract rules applied: `canvas-surface-preserved`, `interaction-surface-ownership`, `renderer-view-interaction`, `renderer-technique-inventory`, `acceptance-product-observable`, `performance-coverage-levels`, and `persistence-policy-explicit`.
- View interaction intent: A visible editable model uses `orbit`; runtime canvas drag and `orientationGizmo` consume the same orientation target without mutating canonical source data.
- Interaction ownership: Canvas owns direct spatial orbit and gizmo snap. The panel owns source package selection, status, warning, repair, and removal actions.
- Decision: Preserve immutable source packages and canonical appearance data; build a disposable Three.js projection with bounded batching/deduplication only for pixel-equivalent opaque geometry. Retain the renderer prewarm resource across remove/reimport and dispose it with the owning presentation host.
- Alternatives rejected: Product-owned model loaders, remote texture fallback, storing Three.js objects in state, appearance-driven topology repair, duplicate standard/custom presentation owners, and metadata-only browser evidence.
- State/output mapping: Durable package refs and canonical document refs live in runtime media state; resolved appearance resources feed a shared presentation lease; evaluated orientation state feeds preview, hit testing, gizmo, history/reset, and export.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: The canonical contract intentionally covers static geometry and the documented PBR subset; unsupported skins, morph targets, animation clips, texture transforms, or missing resources remain nonfatal diagnostics when possible. Synthetic browser fixtures prove contract behavior but cannot guarantee every malformed third-party exporter file.

### Iteration 2 — Infinity canvas runtime and scene-cropped export

- Request: Add an `Infinity canvas` toggle to the first Project Settings section; when enabled, remove canvas size controls and artboard limits, use the whole workspace, and export a crop around scene elements.
- Task type: Runtime, canvas, export, acceptance, starter contract, documentation, CLI, and generated-app delivery.
- User-visible result: Project Settings now starts with `Infinity canvas`. Enabling it removes aspect ratio, width, and height controls plus the finite artboard boundary; disabling it restores the exact previous finite dimensions. Image export remains full-artboard in finite mode and crops to visible scene bounds in infinite mode.
- Source/reference checked: Current Toolcraft canvas state, canvas viewport, image/model presentation, panel action boundary, generated product fixture, export pipeline, and the user-approved crop behavior.
- Reference inputs: The user explicitly selected an unrestricted infinite workspace, preservation of the current finite size, and export by the outer scene-element bounds.
- Docs/contracts read: `core/setup-export.md`, `core/runtime-boundary.md`, `acceptance-testing.md`, `schema-reference.md`, and the runtime decision/component contracts.
- Contract rules applied: `canvas-surface-preserved`, `controls-product-coverage`, `output-export-required`, `acceptance-product-observable`, and `infinity-canvas-scene-bounds`.
- View interaction intent: Infinity mode changes the canvas extent only; existing product `viewInteraction` and model orbit/gizmo ownership remain unchanged.
- Interaction ownership: Project Settings owns the finite/infinite mode. The canvas owns navigation across the unbounded workspace. Export actions consume canonical scene bounds without adding a second editing surface.
- Decision: Store the mode in canonical runtime state and history; retain finite dimensions while infinite; give runtime images and models explicit world frames; accept product bounds through the signed composition boundary; union only visible exportable entities; and reject empty, unavailable, or oversized scene exports with typed visible feedback.
- Alternatives rejected: Encoding Infinity as a sentinel width/height, deriving bounds from DOM pixels, always calling product bounds in finite mode, exporting the current viewport, retaining hidden/editor-only entities, and an implicit global bounds registry.
- State/output mapping: `canvas.setMode` drives settings visibility and artboard layout. Runtime image/model frames and `sceneBoundsProvider` feed one canonical resolver. Image and model compositors render the resolved scene frame at export scale; video exporters must resolve a bound over their explicit time range.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: Product-owned visual entities must provide truthful bounds through `sceneBoundsProvider`; the runtime fails closed with `scene-bounds-unavailable` instead of silently cropping them out.

### Iteration 3 — Grass controls-panel section navigation parity

- Request: "возьми механику навигации по секциям панели из этого проекта. перенеси полностью дизайн и поведение в стартер. панель появляется когда секции не влезают в высоту одного экрана"
- Task type: Shared runtime, controls-panel interaction, generated browser evidence, starter documentation, and standalone generation.
- User-visible result: Generated Toolcraft apps use the Grass section-navigation popup only while the controls body overflows its available viewport. A fitting panel cannot reveal the popup; losing overflow clears pending hover intent, and restoring overflow requires a fresh 300ms dwell.
- Source/reference checked: `/Users/kusnizza/Projects/toolcraft-apps/grass`, its generated runtime copy, the live app at `http://127.0.0.1:3003/`, canonical runtime/UI sources, and computed popup geometry and typography.
- Reference inputs: The user selected full Grass design and behavior, with navigation eligibility determined by sections not fitting within one screen height.
- Docs/contracts read: `component-rules.md`, `workflow.md`, `acceptance-testing.md`, and the runtime panel component contract.
- Contract rules applied: `panel-host-behavior`, `controls-component-layout-invariants`, `controls-layout-heuristics`, and `acceptance-product-observable`.
- Interaction ownership: The runtime controls panel owns overflow measurement, hover intent, section scroll-spy, and popup navigation. Product code supplies sections only and cannot render a duplicate navigation surface.
- Decision: Keep one runtime implementation, retain the complete Grass surface, spacing, type, scrolling, pointer corridor, timing, click, and keyboard behavior, and reset every pending popup timer when overflow disappears.
- Alternatives rejected: Copying the component into starter product code, retaining navigation state after overflow disappears, showing navigation persistently, and editing the exported Grass folder instead of the source runtime.
- State/output mapping: `scrollHeight > clientHeight + 1` makes navigation eligible; a 300ms dwell in the inner-left 12px strip mounts the runtime popup; its items map visible non-sticky sections to immediate viewport scroll positions.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: Already-exported applications retain their copied runtime until regenerated; the Grass reference remains unchanged.

### Iteration 4 — Runtime history keyboard shortcuts from focused controls

- Request: Make Undo and Redo work through standard keyboard shortcuts in generated apps.
- Task type: Shared runtime, generated keyboard interaction, contract, and standalone browser evidence.
- User-visible result: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, and Ctrl+Y operate Toolcraft history while focus remains on sliders, switches, checkboxes, and other non-text controls; active text editors keep native text undo.
- Source/reference checked: The runtime ToolcraftRoot shortcut listener, its unit tests, and a built standalone app where the focused Blur slider input reproduced the failure.
- Contract rules applied: `runtime-shell-required`, `interaction-surface-ownership`, `acceptance-product-observable`, and `workflow-required`.
- Interaction ownership: ToolcraftRoot owns one document-level history shortcut listener; product apps do not register duplicates.
- Decision: Classify input targets by native text-editing capability instead of treating every input as a text editor.
- Alternatives rejected: Always stealing text undo, per-control marker attributes, and app-local shortcut listeners.
- State/output mapping: Recognized shortcuts dispatch `history.undo`/`history.redo` through the runtime command bus; native text editors return before dispatch.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: Previously exported apps retain their copied runtime until regenerated; newly generated apps receive the fix through the CLI copy path.

### Iteration 5 — Blender-compatible orientation gizmo interaction

- Request: Make the orientation gizmo behave "все как в блендере": click signed points to return to axes and drag the gizmo with Blender-equivalent rotation.
- Task type: Shared runtime interaction, generated browser evidence, starter contract, and website documentation.
- User-visible result: The existing 70px Toolcraft gizmo keeps its size, colors, hover treatment, and 16px placement. Users can now drag anywhere inside its circular surface; gizmo and direct model drag share Blender factory Turntable sensitivity and pole recovery; signed-axis clicks use Blender Smooth View timing.
- Source/reference checked: Blender 4.5.2 LTS factory preferences plus the official navigation gizmo, view rotate, axis view, and smooth-view source. Factory Turntable sensitivity is 0.4 degrees per CSS pixel and Smooth View is 200ms maximum, scaled by quaternion angle.
- Contract rules applied: `canvas-handle-placement`, `interaction-surface-ownership`, `renderer-view-interaction`, `acceptance-product-observable`, `performance-coverage-levels`, and `workflow-required`.
- View interaction intent: A visible editable spatial model remains `orbit`; the runtime gizmo and visible-model hit surface consume one canonical `{ position, up }` target.
- Interaction ownership: An unmodified primary press inside the gizmo circle owns Turntable drag; a signed endpoint also owns click-to-axis; blank click is inert; outside-circle and model-miss presses remain canvas pan.
- Decision: Map Blender Z-up behavior to Toolcraft Y-up, use fixed world-up yaw plus screen-horizontal pitch with Blender's pole horizon blend, keep a 3px click/drag threshold, and use cubic smoothstep quaternion slerp with `200ms * angle / pi` duration.
- Alternatives rejected: Keeping endpoint-only sphere projection, changing only gizmo math while direct model drag remains viewport-scaled, and adopting a Three.js helper that owns a separate camera/controller.
- Licensing: This is an independent behavioral and mathematical reimplementation from documented behavior and observed source structure; no Blender GPL source code is copied.
- State/output mapping: Every drag or snap writes the canonical runtime pose under one history group and target-scoped interaction lease. Preview, hit testing, gizmo projection, reset/undo/redo, persistence, and export continue to consume that pose; stale gestures cannot write after a newer owner.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: Already-exported applications retain their copied runtime until regenerated. Browser proof relies on the runtime gizmo's canonical pose/target attributes and intentionally fails closed if the real handle is absent or ambiguous.

### Iteration 6 — Executable product-control applicability

- Request: Fix starter contracts so generated products show only settings that apply to the selected type and cannot pass delivery with a visible control that the renderer ignores.
- Task type: Shared runtime schema, controls-panel visibility, starter acceptance, protected browser evidence, generated fixtures, CLI, and documentation.
- User-visible result: Every generated product control explicitly declares `always` or `conditional` applicability. Non-matching controls disappear without losing their values, while every visible finite sibling branch must prove the control's real accepted product outcome.
- Source/reference checked: Badge behavior was used only as failure evidence; implementation scope remained the Toolcraft runtime and starter contracts. The legacy `visibleWhen` runtime path, control-section inventory, acceptance requirement derivation, reporter, and generated image/video/material fixtures were inspected.
- Contract rules applied: `controls-product-coverage`, `controls-section-inventory-required`, `controls-component-layout-invariants`, `acceptance-product-observable`, and `workflow-required`.
- Interaction ownership: The runtime owns applicability normalization and panel presence. Product schemas own explicit applicability claims. Existing product acceptance owns actions and outcomes; the applicability layer only derives the branch cases in which those outcomes must be reproved.
- Decision: Normalize explicit applicability, legacy `visibleWhen`, and omitted low-level input into one resolved model with origin metadata; reject legacy/implicit origins for product controls; combine conditional predicates with AND; derive pairwise cases from semantic section peers; preserve the authored `Background` inventory ownership after runtime relocates its product controls into `Setup`; attach case-scoped evidence only after exact presence/absence and real outcome assertions pass.
- Alternatives rejected: Extending optional `visibleWhen`, selector-owned target lists, renderer dependency inference, acceptance prose heuristics, Cartesian branch enumeration, and Badge-specific logic.
- State/output mapping: Applicability reads canonical runtime target values and changes only panel presence. Hidden values remain in runtime state, persistence, transfer, and history. Matching cases reuse the control's existing preview, rendered-pixel, artifact, command, or semantic proof.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` remains the generated-app delivery authority; this runtime/template contract delivery also runs the monorepo checks required by the repository entry contract.
- Risks: Pairwise proof depends on truthful Control Section Inventory grouping; unsupported selector domains fail acceptance instead of silently skipping cases. Legacy low-level consumers remain readable but cannot satisfy generated product acceptance.

## Decisions

### Renderer

- Decision: No product renderer yet.
- Reason: The starter is intentionally neutral.
- Evidence: No `canvasContent` product renderer is declared. The neutral composition still declares `modelPresentation: { mode: "runtime" }` so future model uploads have one standard owner until a product explicitly declares checked custom consumers.

### Timeline

- Decision: No timeline yet.
- Reason: The starter has no product animation behavior.
- Evidence: `panels.timeline` is omitted.

### Layers

- Decision: No layers yet.
- Reason: The starter has no layer workflow.
- Evidence: `panels.layers` is omitted.

### Controls

- Decision: No product controls yet.
- Reason: Controls are added only after the requested product behavior is known.
- Evidence: The starter schema exposes no product control sections.

### View Interaction

- Decision: No spatial product view yet.
- Reason: The neutral starter has no visible three-dimensional scene or model.
- Evidence: Product readiness remains in starter mode; product apps must declare typed `viewInteraction` before controls or renderer code.

### Interaction Ownership

- Decision: No product interaction surfaces yet.
- Reason: The neutral starter has no canvas handles or product controls to compare.
- Evidence: Product apps must declare typed `interactionOwnership` before implementing controls or canvas interactions.

### Export

- Decision: No product export yet.
- Reason: Export actions are added when the app has product output.
- Evidence: No sticky product `panelActions` are declared.

### Performance

- Decision: No product performance workload yet.
- Reason: Performance scenarios depend on renderer and control workload.
- Evidence: The starter performance matrix is a neutral baseline.

## Evidence

- Source reviewed: neutral starter schema and local Toolcraft docs.
- Contract applied: starter baseline remains neutral until product behavior exists; `model-appearance-presentation` keeps package import, appearance leases, model canvas output, gizmo pose, and export ownership explicit.

## Verification

Protected receipts own changed files, the derived plan, commands, selectors, reports, measurements, and pass/fail evidence. Decision Trail iterations record only one bare `npm run verify:delivery` narrative.

## Risks

- Risk: This template must be replaced with product-specific decisions before final delivery.
- Risk: A product that selects custom model presentation must mount every declared checked consumer; otherwise runtime reports typed retryable presentation feedback and suppresses only that declared target.
