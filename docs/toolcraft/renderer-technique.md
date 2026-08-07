# Renderer Technique

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this file is the focused renderer-selection reference.

Choose renderer technology from product output semantics, reference behavior, fidelity requirements, and the assessed render plan. Names, keywords, control types, source formats, and visual richness do not select a renderer.

## Normative Sequence

Use the same producer order for every custom renderer:

1. Inventory reachable controls, runtime-state inputs, and external inputs.
2. Model workload dimensions with schema or product-enforced boundaries.
3. Declare each candidate pass's cost, frequency, lifecycle, execution location, quality, cache keys, and exact interaction invalidation.
4. Run `assessToolcraftRenderPlan`; resolve errors and run protected `pnpm verify:kernel` only when the assessment requires candidate evidence.
5. Derive canonical paths and compile combined fixtures through their adapters.
6. Implement the selected renderer and run targeted checks for the paths being developed.
7. Run lifecycle-appropriate delivery proof: full functional acceptance with no measured performance for first product delivery, exact ownership-derived functional checks for later work, or one targeted iteration for a performance complaint. Full certification is a separate operator/CI command.

Do not write renderer code before the envelope, `rendererTechnique`, pipeline, and assessment exist.

## Selection Principles

- Preserve the reference renderer in reference-runtime-clone mode unless a concrete blocker, replacement reason, and acceptance mapping are recorded.
- Keep semantic output in a representation that preserves its required fidelity, editing behavior, accessibility, and export meaning.
- Select execution location and renderer API from assessed pass cost and update frequency. Do not infer them from a product category or target name.
- Preview and export may use different renderers when `previewExportDifferenceReason` explains the boundary and tests prove equivalent product semantics.
- Prefer retained resources and stable cache keys. Source-bound resources live outside React render, survive unrelated interactions according to pass lifecycle, and release during cleanup.
- Separate layers when they have different semantics, invalidation, lifecycle, interaction, or export treatment. A costly layer does not force unrelated output into the same renderer.
- Preserve selected quality, product boundaries, backing resolution, and source fidelity. A renderer is not accepted by silently reducing them.
- In infinite mode, custom Canvas 2D, WebGL, and WebGPU previews use `useToolcraftProductSceneFrame()` as their backing and coordinate frame. Do not keep rendering into dormant finite `canvas.size`, derive another bounds wrapper, or measure DOM geometry; runtime already positions the product scene surface from `sceneBoundsProvider`.
- A preview-only environment that must stay fixed to the complete Infinity
  viewport uses `infiniteCanvasContent`, not the bounded product renderer. Keep
  that layer pointer-transparent and exclude it from scene bounds and export.

When assessment requires a benchmark, declare `kernelBenchmarkDecisions`, implement only the named executable candidates in `e2e/app-kernel-benchmarks.ts`, and let protected `pnpm verify:kernel` measure them at the exact combined workload vector. Candidate outputs must be deterministic and equal at full quality. Do not author timing values or add speculative benchmark metadata when generic assessment resolves the choice.

## Required Inventory

Custom renderer specs and `src/app/app-performance.ts` mirror:

- `sourceRepresentation`;
- `productRepresentation`;
- `previewRenderer`;
- `exportRenderer`;
- `rendererStrategy`;
- `whyNotAlternativeStrategies`;
- `fidelityRisks`;
- `performanceRisks`.

Workload pressure and renderer candidates are derived from envelope dimensions and assessed renderer-pass cost/lifecycle. Do not author a parallel coarse workload category or separate renderer-comparison metadata. `kernelBenchmarkDecisions` records product intent; only its protected current-source receipt is measurement evidence.

If output is intentionally rasterized, include `intentionalRasterizationReason`. If preview and export renderers differ, include `previewExportDifferenceReason`. If a reference runtime renderer changes, include `referenceRendererChangeReason`.

`rendererTechnique` records the selected technology. `rendererPipeline` records why and when its passes execute. Both must agree with the implementation.

Renderer technology does not decide camera ownership. Before renderer code,
product readiness separately declares `viewInteraction`: editable spatial scenes
default to `orbit`; fixed or timeline-owned cameras require explicit
user/reference evidence. WebGL/Three.js alone does not imply orbit, and a fixed
camera chosen by the implementation is not evidence for omitting it.

## Layer Inventory

Declare each meaningful product, overlay, and export layer in `rendererTechnique.layers`. Give visible product and editing layers a stable `uiSelector` for browser proof. For every layer, record content semantics, renderer, primitive magnitude, and export mode.

Editing handles remain interaction overlays, stay out of exported product output, and write through runtime state. Tests verify visible layers and export inclusion independently.

## Three-Dimensional Model Interaction

Standard model apps use `modelPresentation: { mode: "runtime" }` and the runtime's lazy Three binding/canvas layer. It renders canonical geometry plus the supported authored material/texture/vertex-color appearance, or the exact Blender-compatible fallback when appearance is absent. Product `canvasContent` must not import format loaders, enumerate repository records, create a second Three cache, reconstruct materials, or render a duplicate model over the runtime layer. `renderDefaultCanvasMedia={false}` affects generic image/file preview only and never disables model presentation.

Custom model output is an explicit presentation mode, not a loader escape hatch. Declare unique consumers in `modelPresentation: { mode: "custom", consumers }`, mount `useToolcraftModelPresentationConsumer(declaration)`, then acquire and release the supplied presentation lease. Runtime suppresses its standard layer only for those declared source targets and reports retryable feedback when the checked consumer is missing or acquisition fails.

```tsx
const declaration = {
  id: "product-model",
  sourceTarget: "source.model",
  orientationTarget: "view.orbit",
} as const;

function ProductModel({ activeDocumentRef }: { activeDocumentRef: string }) {
  const presentation = useToolcraftModelPresentationConsumer(declaration);

  React.useEffect(() => {
    const controller = new AbortController();
    let release: (() => void) | undefined;

    void presentation
      .acquirePresentation(activeDocumentRef, {
        purpose: "preview",
        signal: controller.signal,
      })
      .then((lease) => {
        if (controller.signal.aborted) return lease.release();
        release = lease.release;
        mountProductSceneRoot(lease.root, lease.document, lease.bounds);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) handleProductPresentationError(error);
      });

    return () => {
      controller.abort();
      unmountProductSceneRoot();
      release?.();
    };
  }, [activeDocumentRef, presentation]);

  return <canvas data-toolcraft-product-output />;
}
```

The `mount*` and error functions above stand for product renderer integration only. The consumer receives the ready canonical root and metadata; it does not import GLTF/OBJ/FBX loaders or rebuild materials.

The presentation lease is keyed by canonical document reference and shares immutable geometry/material/texture GPU resources across preview and export while cloning only scene roots. Replacement, delete/reset, failed creation, release, and provider unmount dispose ownership deterministically. The original uploaded folder/ZIP remains immutable durable source; display fit and camera pose live outside the leased root.

The runtime presents structurally valid analyzing or repairing geometry at `0.4` opacity and committed clean/fixed geometry at `1`. Export is always `1`. Runtime image/video export composites visible committed model layers before awaiting the product's shared `ToolcraftAppComposition.exportRenderer` frame. Runtime owns the presentation binding, pose, scene frame, dimensions, pixel ratio, encoding, and download; product code does not call model compositors or construct a parallel export host.

When `viewInteraction.mode` is `orbit`, schema `orientationGizmo`, direct model drag, preview rendering, hit testing, reset/history, and export share every declared orientation pose target. The product renderer supplies geometry-aware `hitTest`; Toolcraft owns gesture scheduling and history through `useToolcraftModelOrbitInteraction`.

Pointer ownership is selected on pointer-down. A visible-model hit rotates; a miss is left untouched so `CanvasShell` pans. Target-scoped runtime ownership serializes gizmo drag, snap, and direct orbit, and cancels stale work on a newer gesture or external state write. Do not infer model geometry in runtime, keep a second local camera/Euler state, or let orientation invalidate passes that do not consume the pose. Measure the orientation target's canonical live interaction path at the declared workload without reducing preview quality.

Layer boundaries follow semantics and invalidation, not a fixed list of product domains. Their workload proof comes from derived paths and combined fixtures.
