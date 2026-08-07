import { TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY_TEXT } from "./performance-verification-policy";

export type ToolcraftDecisionArea =
  | "acceptance"
  | "canvas"
  | "controls"
  | "layers"
  | "panels"
  | "performance"
  | "persistence"
  | "reference-analysis"
  | "reference-clone"
  | "renderer"
  | "runtime-shell"
  | "timeline"
  | "workflow";

export type ToolcraftDecisionRuleLevel =
  | "default"
  | "escape-hatch"
  | "heuristic"
  | "invariant"
  | "recommendation";

export type ToolcraftDecisionVerdict =
  | "keep-hard"
  | "keep-but-clarify"
  | "move-to-validator"
  | "relax-to-heuristic"
  | "remove-duplicate";

export type ToolcraftDecisionDiagnosticSeverity = "error" | "warning";

export type ToolcraftDecisionEnforcement =
  | "acceptance-validator"
  | "browser-helper"
  | "cli-integrity-check"
  | "docs"
  | "performance-validator"
  | "runtime"
  | "schema-normalization"
  | "spec-checklist"
  | "starter-agents";

export type ToolcraftDecisionRule = {
  area: ToolcraftDecisionArea;
  currentConstraint: string;
  desiredBehavior: string;
  enforcement: readonly ToolcraftDecisionEnforcement[];
  id: string;
  level: ToolcraftDecisionRuleLevel;
  title: string;
  verdict: ToolcraftDecisionVerdict;
};

export const TOOLCRAFT_DECISION_CONTRACT = [
  {
    area: "runtime-shell",
    currentConstraint: "Apps must assemble through defineToolcraft and ToolcraftApp.",
    desiredBehavior:
      "Generated apps use the Toolcraft runtime shell and keep product-specific rendering inside supported extension points: schema controls, bounded canvasContent product output, editor-only full-viewport infiniteCanvasContent product output, controlRenderers for true custom controls, one shared ToolcraftAppComposition.exportRenderer for typed image/video actions, ToolcraftApp onPanelAction for non-export product actions, and runtime commands. App-specific code must not import or render low-level runtime surfaces or built-in control components directly, instantiate encoders, or own artifact download mechanics.",
    enforcement: [
      "cli-integrity-check",
      "acceptance-validator",
      "starter-agents",
      "spec-checklist",
    ],
    id: "runtime-shell-required",
    level: "invariant",
    title: "Toolcraft runtime shell is required",
    verdict: "keep-hard",
  },
  {
    area: "canvas",
    currentConstraint:
      "canvasContent must not contain buttons, forms, CTAs, helper text, upload prompts, menus, settings UI, or invented placeholder/demo artwork for apps with uploaded/imported source-material flows.",
    desiredBehavior:
      "Canvas renders only real product result, source material, renderer output derived from current state, and valid product editing handles. If uploaded or imported content is part of the product source flow, the pre-content canvas stays neutral and runtime-backed until real content exists. Do not add agent-invented preset modes, demo backgrounds, CTA copy, fake sample output, or decorative placeholders to fill the canvas; a default procedural/reference source is allowed only when the prompt or reference explicitly defines it and the worklog records that evidence.",
    enforcement: ["browser-helper", "starter-agents", "spec-checklist"],
    id: "canvas-no-app-ui",
    level: "invariant",
    title: "Canvas contains product output, not app UI",
    verdict: "move-to-validator",
  },
  {
    area: "canvas",
    currentConstraint:
      "The Toolcraft canvas shell owns the visible workspace backing behind product output.",
    desiredBehavior:
      "Generated apps preserve the runtime canvas surface and do not replace or hide it when product renderers customize their own background. In infinite mode the shell fills the complete viewport with the selected standard Background color, while bounded product background pixels remain suppressed. Preview-only product environments may layer through infiniteCanvasContent across the complete viewport under the transformed world; that layer is pointer-transparent and excluded from scene bounds and export.",
    enforcement: ["browser-helper", "starter-agents", "spec-checklist"],
    id: "canvas-surface-preserved",
    level: "invariant",
    title: "Canvas backing stays runtime-owned",
    verdict: "move-to-validator",
  },
  {
    area: "canvas",
    currentConstraint:
      "Editable output can switch from a finite artboard to an unbounded workspace, but product renderers and export actions still need one canonical world-space frame contract.",
    desiredBehavior:
      "Editable-output apps expose one runtime-owned Infinity canvas mode. Enabling it removes finite artboard clipping and size controls while preserving the dormant finite canvas size for exact restoration. When the standard Background pair exists, its selected color fills the complete infinite viewport and Background off atomically resolves finite mode and disables Infinity. Runtime image and model assets retain explicit world-space frames. ToolcraftAppComposition.sceneBoundsProvider supplies product-renderer bounds for one exact state through one direct composition boundary. Runtime applies that same product frame to the live infinite preview, and custom raster/WebGL renderers consume useToolcraftProductSceneFrame for backing size and world-to-local translation instead of the dormant finite canvas size. ToolcraftAppComposition.infiniteCanvasContent is reserved for preview-only product environments that fill the complete Infinity viewport without world transforms, pointer input, scene-bounds participation, or export inclusion. Image export resolves the current frame and video export unions every state from the runtime-owned timestamp schedule. Hidden layers, suppressed default consumers, viewport environments, and editor-only UI do not expand preview or output bounds. Finite preview and export remain the full finite canvas and do not call the provider, while empty, unavailable, and unsafe oversized infinite exports return typed visible failures.",
    enforcement: [
      "acceptance-validator",
      "browser-helper",
      "docs",
      "runtime",
      "starter-agents",
    ],
    id: "infinity-canvas-scene-bounds",
    level: "invariant",
    title: "Infinity canvas uses canonical scene bounds",
    verdict: "keep-hard",
  },
  {
    area: "canvas",
    currentConstraint:
      "Product editing handles may live on the canvas when they manipulate visible product geometry.",
    desiredBehavior:
      "AI chooses canvas handles only for direct geometry or parameter manipulation and keeps handles tokenized, textless, export-excluded, and runtime-bound.",
    enforcement: ["browser-helper", "acceptance-validator", "spec-checklist"],
    id: "canvas-handle-placement",
    level: "heuristic",
    title: "Canvas handle placement is product-dependent",
    verdict: "keep-but-clarify",
  },
  {
    area: "controls",
    currentConstraint:
      "Panel controls and canvas editing handles are validated independently, so the same user operation can be recreated on both surfaces.",
    desiredBehavior:
      "Every operation that can plausibly live on canvas or in the panel declares typed interactionOwnership before implementation. User request, inspected reference, or product usability selects one primary surface. Related state may expose complementary operations on the other surface, but the same target and operation capability cannot be mirrored across canvas and panel.",
    enforcement: [
      "acceptance-validator",
      "docs",
      "starter-agents",
      "spec-checklist",
    ],
    id: "interaction-surface-ownership",
    level: "invariant",
    title: "Each user operation has one primary interaction surface",
    verdict: "move-to-validator",
  },
  {
    area: "panels",
    currentConstraint: "PanelHost owns drag, snap, and double-click reset behavior.",
    desiredBehavior:
      "Any rendered application panel preserves runtime panel mechanics and does not recreate panel dragging locally.",
    enforcement: ["runtime", "browser-helper", "starter-agents"],
    id: "panel-host-behavior",
    level: "invariant",
    title: "Panel mechanics stay runtime-owned",
    verdict: "keep-hard",
  },
  {
    area: "layers",
    currentConstraint:
      "Layers are optional and should appear only for multiple editable entities, grouping, visibility, selection, or reorder workflows.",
    desiredBehavior:
      "AI decides whether the product needs layers; single-layer apps do not render a layers panel.",
    enforcement: ["starter-agents", "spec-checklist"],
    id: "layers-enable-only-when-needed",
    level: "heuristic",
    title: "Layer enablement is product-dependent",
    verdict: "keep-but-clarify",
  },
  {
    area: "layers",
    currentConstraint:
      "Once layers are enabled, selection, visibility, reorder, grouping, media lifecycle, and selected-layer controls must work through the real LayersPanel UI.",
    desiredBehavior:
      "Layer-enabled apps prove real layer interactions and product output changes instead of dispatching layer commands directly in browser tests.",
    enforcement: ["acceptance-validator", "browser-helper", "performance-validator"],
    id: "layers-enabled-behavior",
    level: "invariant",
    title: "Enabled layers must fully work",
    verdict: "keep-hard",
  },
  {
    area: "timeline",
    currentConstraint:
      "Timeline is optional only for animated products that have no video export and are explicitly classified as autonomous decorative output.",
    desiredBehavior:
      "AI writes an Animation Intent Inventory before choosing no timeline, playback, keyframes, or custom reference timeline; user-requested product animation defaults to playback unless explicitly justified as autonomous output without video export. Export Video always requires a top Toolcraft timeline.",
    enforcement: ["starter-agents", "spec-checklist", "acceptance-validator"],
    id: "timeline-mode-choice",
    level: "heuristic",
    title: "Timeline mode is chosen from behavior",
    verdict: "keep-but-clarify",
  },
  {
    area: "timeline",
    currentConstraint:
      "Enabled timeline modes must control renderer time, pause, scrub, duration, loop, and keyframe evaluation where relevant.",
    desiredBehavior:
      "Playback and keyframe apps prove runtime timeline state controls visible and exported output, and renderer cycle duration follows state.timeline.durationSeconds.",
    enforcement: ["acceptance-validator", "browser-helper", "performance-validator"],
    id: "timeline-enabled-behavior",
    level: "invariant",
    title: "Enabled timelines must drive output",
    verdict: "keep-hard",
  },
  {
    area: "controls",
    currentConstraint:
      "Every product control explicitly declares always or conditional applicability; every visible finite sibling branch binds to runtime state, resets from schema defaults, and passes its accepted browser outcome.",
    desiredBehavior:
      "Non-applicable controls are absent with values preserved, and no always or conditional control remains visible in a finite product branch where its value is ignored.",
    enforcement: ["acceptance-validator", "browser-helper"],
    id: "controls-product-coverage",
    level: "invariant",
    title: "Visible controls must affect the product",
    verdict: "keep-hard",
  },
  {
    area: "controls",
    currentConstraint:
      "Product artifact delivery must match the required productReadiness.exportIntent declaration.",
    desiredBehavior:
      'Every product declares productReadiness.exportIntent. Image export starts as the Toolcraft default and is removed only with explicit user-removal evidence; video export requires explicit user request evidence. Animation, playback, keyframes, or timeline presence never changes artifact delivery intent. Resolved intent capabilities correspond exactly to schema actions, settings sections, and acceptance coverage: image-only, image-plus-video, video-only, and explicit no-export products expose only the runtime-owned artifact surfaces their intent enables. Product apps declare the standard background pair and runtime places it in Setup: Background beside Infinity canvas, Color below, and Timeline last. One shared product exportRenderer draws deterministic scene-coordinate frames for enabled artifact types; runtime owns settings, scene crop, PNG/JPEG/video background semantics, visible runtime media/model composition, exact timestamped encoding, download, progress, and typed failures.',
    enforcement: ["acceptance-validator", "performance-validator", "browser-helper", "starter-agents"],
    id: "output-export-required",
    level: "invariant",
    title: "Product output follows artifact export intent",
    verdict: "move-to-validator",
  },
  {
    area: "controls",
    currentConstraint:
      "Every product controls section must be represented in the exported Control Section Inventory before schema authoring.",
    desiredBehavior:
      "Generated product apps publish a typed Control Section Inventory with stable entityId, human-readable entity, exact targets, and a concrete grouping reason. One entity stays in one section through ten controls; larger entities use balanced two-to-ten-control workflow stages with explicit split evidence, so section ownership and reset boundaries are machine-checkable without runtime rewriting.",
    enforcement: ["acceptance-validator", "docs", "starter-agents", "spec-checklist"],
    id: "controls-section-inventory-required",
    level: "invariant",
    title: "Product control sections require typed inventory",
    verdict: "move-to-validator",
  },
  {
    area: "controls",
    currentConstraint:
      "Built-in control owners have structural layout constraints that prevent clipping, ambiguous value ownership, and unsupported inline composition.",
    desiredBehavior:
      "Exact component constraints such as full-width range sliders, compound-control ownership, and supported inline group membership remain hard runtime and acceptance invariants, while product grouping and ordering preferences remain heuristics.",
    enforcement: ["acceptance-validator", "schema-normalization", "docs"],
    id: "controls-component-layout-invariants",
    level: "invariant",
    title: "Built-in component layout constraints stay hard",
    verdict: "move-to-validator",
  },
  {
    area: "controls",
    currentConstraint:
      "Labels, color placement, section grouping, selector order, and inline density need product-aware decisions.",
    desiredBehavior:
      "Given a valid Control Section Inventory, ordering, labels, color placement, and compact density remain product-aware recommendations. The ten-control maximum and entity cohesion are inventory invariants; heuristics may report questionable presentation without rejecting a coherent product-specific choice solely because it differs from a preferred layout.",
    enforcement: ["acceptance-validator", "schema-normalization", "docs", "starter-agents"],
    id: "controls-layout-heuristics",
    level: "heuristic",
    title: "Control layout remains product-aware",
    verdict: "keep-but-clarify",
  },
  {
    area: "renderer",
    currentConstraint:
      "Custom renderers must declare rendererTechnique and rendererTechnique.layers when product output uses semantic layers or mixed rendering.",
    desiredBehavior:
      "AI chooses rendering technology from product output semantics, fidelity, reference behavior, and performance, then proves that choice in typed config and browser tests.",
    enforcement: ["performance-validator", "browser-helper", "spec-checklist"],
    id: "renderer-technique-inventory",
    level: "default",
    title: "Renderer technique is a typed decision",
    verdict: "keep-but-clarify",
  },
  {
    area: "renderer",
    currentConstraint:
      "A spatial scene can omit orientationGizmo by silently choosing a fixed camera before the existing rotatable-model rule applies.",
    desiredBehavior:
      "Every generated product declares typed viewInteraction intent before controls or renderer code. A visible editable three-dimensional scene defaults to orbit and requires matching orientationGizmo targets. Fixed or timeline-owned cameras are evidence-backed escape hatches allowed only when an explicit user request or inspected reference owns that behavior.",
    enforcement: [
      "acceptance-validator",
      "docs",
      "starter-agents",
      "spec-checklist",
    ],
    id: "renderer-view-interaction",
    level: "invariant",
    title: "Spatial view interaction is an explicit typed decision",
    verdict: "move-to-validator",
  },
  {
    area: "renderer",
    currentConstraint:
      "Model upload and presentation can be described as geometry-only, hidden through renderDefaultCanvasMedia, or reimplemented by a custom renderer without a checked presentation consumer.",
    desiredBehavior:
      "Runtime model import preserves the supported authored appearance subset from standalone files, folders, and bounded ZIP packages, chooses the first normalized root deterministically, and uses the Blender-compatible fallback material only when authored appearance is absent. The original source package remains durable and immutable; canonicalization is derived data, and geometry repair never becomes appearance repair. ToolcraftAppComposition declares modelPresentation: runtime owns standard preview/export by default, while custom mode suppresses only its declared model targets and requires one mounted checked consumer per target. renderDefaultCanvasMedia controls generic image/file preview only and never disables runtime model presentation. Preview, export, orientationGizmo, and direct model drag share one presentation document, appearance lease, and camera pose.",
    enforcement: [
      "acceptance-validator",
      "browser-helper",
      "cli-integrity-check",
      "docs",
      "performance-validator",
      "runtime",
      "starter-agents",
    ],
    id: "model-appearance-presentation",
    level: "invariant",
    title: "Model appearance and presentation stay runtime-owned",
    verdict: "keep-hard",
  },
  {
    area: "reference-clone",
    currentConstraint:
      "Reference-runtime-clone mode preserves the reference runtime as source of truth unless a redesign is explicit; functionality must be inventoried from inspected reference behavior before implementation.",
    desiredBehavior:
      "Ported apps keep reference loops, mutable state, transport semantics, media lifecycle, and export behavior before Toolcraft refinements. The agent records referenceStudy evidence from source inspection plus running the original or restoring it locally when runnable/reconstructable, builds a reference feature inventory from inspected source/runtime/UI behavior, gives each inventory item feature-level behavior evidence from that study, maps every user-visible and output-affecting feature to Toolcraft implementation and acceptance coverage, and marks intentional behavior changes only with explicit user approval evidence.",
    enforcement: ["acceptance-validator", "browser-helper", "starter-agents"],
    id: "reference-clone-source-of-truth",
    level: "invariant",
    title: "Reference clone preserves behavior",
    verdict: "keep-hard",
  },
  {
    area: "reference-analysis",
    currentConstraint:
      "Video, GIF, and screen-recording references are often treated as static visual inspiration or summarized from a few frames.",
    desiredBehavior:
      "Whenever a supplied reference is a video, GIF, screen recording, contact sheet, or extracted frame sequence, the agent studies it as behavioral evidence before implementation: extract or inspect a storyboard, record timecoded frame observations, compare frame-to-frame transitions, decompose changing entities and state into product behavior, and map those observed behaviors to acceptance rows. This applies to new Toolcraft apps and reference-runtime-clone work; it is independent from loop duration or timeline choice.",
    enforcement: ["acceptance-validator", "browser-helper", "docs", "starter-agents"],
    id: "video-reference-analysis",
    level: "invariant",
    title: "Video references require storyboard behavior study",
    verdict: "move-to-validator",
  },
  {
    area: "acceptance",
    currentConstraint:
      "Acceptance coverage must prove product responsibility, not only typecheck, component existence, runtime mutation, or shader uniform presence.",
    desiredBehavior:
      "Generated apps fail when a visible entity is disconnected from runtime state, product output, export output, or command side effects.",
    enforcement: ["acceptance-validator", "browser-helper"],
    id: "acceptance-product-observable",
    level: "invariant",
    title: "Acceptance needs product observables",
    verdict: "keep-hard",
  },
  {
    area: "performance",
    currentConstraint:
      "Performance coverage currently asks every visible non-action control for a performance scenario.",
    desiredBehavior: [
      "Heavy workload controls get min/default/max workload coverage; ordinary controls get lightweight responsiveness coverage so they cannot hang or break input. Animated previews suspend or coalesce non-essential animation work during canvas drag, pan, pinch, zoom, and radar/center interactions without changing user playback state.",
      TOOLCRAFT_PERFORMANCE_VERIFICATION_POLICY_TEXT,
      "Request-authorized browser performance checks read budgets from typed performance config and run sequentially for stable measurements.",
    ].join(" "),
    enforcement: ["performance-validator", "browser-helper", "starter-agents"],
    id: "performance-coverage-levels",
    level: "invariant",
    title: "Performance coverage has workload and responsiveness levels",
    verdict: "keep-but-clarify",
  },
  {
    area: "persistence",
    currentConstraint:
      "Generated apps persist runtime workspace state by default; product code must not write localStorage or IndexedDB directly.",
    desiredBehavior:
      "Local persistence is enabled by default for values, canvas, and panels; enabled timeline, layers, and media join the resolved plan. The only opt-out is persistence.storage none with a recorded reason. localStorage stores small versioned JSON metadata while the Toolcraft binary repository stores media bytes in IndexedDB. Reload acceptance declares every resolved slice, uses persistence-state evidence, changes real user state, reloads the page, and observes the restored workspace or product output; settings import/export is not a substitute for persistence.",
    enforcement: ["starter-agents", "spec-checklist", "acceptance-validator", "browser-helper"],
    id: "persistence-policy-explicit",
    level: "default",
    title: "Persistence is explicit app policy",
    verdict: "keep-but-clarify",
  },
  {
    area: "workflow",
    currentConstraint:
      "Template app work must use brainstorming, writing-plans, systematic-debugging, and browser verification when the environment supports those skills.",
    desiredBehavior:
      "Workflow skills guide the generation process, while product implementation plans stay focused on app files, tests, build, and browser verification.",
    enforcement: ["starter-agents", "docs"],
    id: "workflow-required",
    level: "invariant",
    title: "Required workflow stays part of the contract",
    verdict: "remove-duplicate",
  },
] as const satisfies readonly ToolcraftDecisionRule[];

export function getToolcraftDecisionRule(
  id: string,
): ToolcraftDecisionRule | undefined {
  return TOOLCRAFT_DECISION_CONTRACT.find((rule) => rule.id === id);
}

export function getToolcraftDecisionRulesByArea(
  area: ToolcraftDecisionArea,
): ToolcraftDecisionRule[] {
  return TOOLCRAFT_DECISION_CONTRACT.filter((rule) => rule.area === area);
}

export type ToolcraftDecisionRuleId =
  (typeof TOOLCRAFT_DECISION_CONTRACT)[number]["id"];

export function getToolcraftDecisionDiagnosticSeverity(
  id: ToolcraftDecisionRuleId,
): ToolcraftDecisionDiagnosticSeverity {
  const level = getToolcraftDecisionRule(id)?.level;

  return level === "heuristic" || level === "recommendation" ? "warning" : "error";
}
