import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import type {
  ToolcraftModelExportContext,
  ToolcraftModelHitTestPoint,
  ToolcraftModelPresentationRequest,
  ToolcraftModelPreviewContext,
  ToolcraftModelPreviewPreparationContext,
  ToolcraftModelRenderBinding,
  ToolcraftModelRenderHost,
  ToolcraftModelRenderPreparationStatus,
  ToolcraftModelResourceResolver,
} from "./model-render-binding";
import { createToolcraftModelPresentation } from "./model-render-binding";
import { TOOLCRAFT_MODEL_PRESENTATION_UNAVAILABLE_FEEDBACK } from "./model-presentation-feedback";
import { createToolcraftModelPresentationResourceManager } from "./model-presentation-resource-manager";
import type { ToolcraftModelRenderRegistry } from "./model-render-registry";

type ModelRenderSlot = {
  binding: ToolcraftModelRenderBinding<unknown>;
  controller: AbortController;
  generation: number;
  mutationQueue: Promise<void>;
  resource?: unknown;
};

type ExportResource = {
  binding: ToolcraftModelRenderBinding<unknown>;
  controller: AbortController;
  resource?: unknown;
};

type PreviewPreparationEntry = Readonly<{
  context: ToolcraftModelPreviewPreparationContext;
  promise: Promise<void>;
}>;

export type ToolcraftModelPresentationFeedbackBoundary = Readonly<{
  clear(sourceTarget: string): void;
  report(sourceTarget: string, feedback: ToolcraftSourceAssetFeedback): void;
}>;

function presentationFor(
  request: ToolcraftModelPresentationRequest,
  purpose: "export" | "preview",
) {
  return createToolcraftModelPresentation(request.asset, {
    ...(request.canonicalDocumentRef
      ? { canonicalDocumentRef: request.canonicalDocumentRef }
      : {}),
    ...(request.orientation ? { orientation: request.orientation } : {}),
    phase: request.phase,
    purpose,
    target: request.target,
    ...(request.viewport ? { viewport: request.viewport } : {}),
  });
}

export function createToolcraftModelRenderHost(
  registry: ToolcraftModelRenderRegistry,
  resolveResource: ToolcraftModelResourceResolver,
  feedbackBoundary: ToolcraftModelPresentationFeedbackBoundary,
  retainResourceRef?: (ref: string) => () => void,
): ToolcraftModelRenderHost {
  const slots = new Map<string, ModelRenderSlot>();
  const exportResources = new Set<ExportResource>();
  const presentationManager = createToolcraftModelPresentationResourceManager({
    resolveResource,
    ...(retainResourceRef ? { retainResourceRef } : {}),
  });
  let disposed = false;
  let generation = 0;
  let completedPreparationCount = 0;
  let failedPreparationCount = 0;
  let pendingPreparationCount = 0;
  let preparationStatus: ToolcraftModelRenderPreparationStatus = "idle";
  const preparationListeners = new Set<() => void>();
  const preparations = new Map<string, PreviewPreparationEntry>();

  const publishPreparationStatus = (
    status: ToolcraftModelRenderPreparationStatus,
  ): void => {
    if (preparationStatus === status) return;
    preparationStatus = status;
    for (const listener of preparationListeners) listener();
  };

  const refreshPreparationStatus = (): void => {
    publishPreparationStatus(
      pendingPreparationCount > 0
        ? "preparing"
        : failedPreparationCount > 0
          ? "error"
          : completedPreparationCount > 0
            ? "ready"
            : "idle",
    );
  };

  const preparationContextsEqual = (
    left: ToolcraftModelPreviewPreparationContext,
    right: ToolcraftModelPreviewPreparationContext,
  ): boolean =>
    left.height === right.height &&
    left.host === right.host &&
    left.pixelRatio === right.pixelRatio &&
    left.target === right.target &&
    left.width === right.width;

  const prepare = (
    context: ToolcraftModelPreviewPreparationContext,
  ): Promise<void> => {
    if (disposed || slots.has(context.target)) return Promise.resolve();
    const current = preparations.get(context.target);
    if (current && preparationContextsEqual(current.context, context)) {
      return current.promise;
    }

    pendingPreparationCount += 1;
    refreshPreparationStatus();
    let entry: PreviewPreparationEntry;
    const promise = (current?.promise.catch(() => undefined) ?? Promise.resolve())
      .then(() => registry.resolve(context.target).preparePreview?.(context))
      .then(() => {
        pendingPreparationCount -= 1;
        if (!disposed && preparations.get(context.target) === entry) {
          completedPreparationCount += 1;
        }
        refreshPreparationStatus();
      })
      .catch((error: unknown) => {
        pendingPreparationCount -= 1;
        if (!disposed && preparations.get(context.target) === entry) {
          failedPreparationCount += 1;
        }
        refreshPreparationStatus();
        throw error;
      });
    entry = Object.freeze({ context: { ...context }, promise });
    preparations.set(context.target, entry);
    return promise;
  };

  const retireSlot = (slot: ModelRenderSlot): void => {
    slot.controller.abort();
    if (slot.resource !== undefined) {
      slot.binding.dispose(slot.resource);
      slot.resource = undefined;
    }
  };

  const release = (key: string): void => {
    const slot = slots.get(key);
    if (!slot) return;
    slots.delete(key);
    retireSlot(slot);
  };

  const isCurrentSlotRequest = (
    key: string,
    slot: ModelRenderSlot,
    requestGeneration: number,
  ): boolean =>
    !disposed &&
    !slot.controller.signal.aborted &&
    slots.get(key) === slot &&
    slot.generation === requestGeneration;

  const updatePreviewSlot = async (
    key: string,
    slot: ModelRenderSlot,
    request: ToolcraftModelPresentationRequest,
    context: ToolcraftModelPreviewContext,
  ): Promise<void> => {
    const requestGeneration = ++generation;
    slot.generation = requestGeneration;

    try {
      if (!isCurrentSlotRequest(key, slot, requestGeneration)) return;
      const mutate = slot.mutationQueue.then(async () => {
        if (!isCurrentSlotRequest(key, slot, requestGeneration)) return;
        const presentation = presentationFor(request, "preview");
        await slot.binding.update(slot.resource, presentation, {
          acquirePresentation: presentationManager.acquirePresentation,
          signal: slot.controller.signal,
        });
        if (!isCurrentSlotRequest(key, slot, requestGeneration)) return;
        slot.binding.renderPreview(slot.resource, context);
        feedbackBoundary.clear(request.target);
      });
      slot.mutationQueue = mutate.catch(() => undefined);
      await mutate;
    } catch (error) {
      if (!isCurrentSlotRequest(key, slot, requestGeneration)) return;
      if (!slot.controller.signal.aborted) {
        feedbackBoundary.report(
          request.target,
          TOOLCRAFT_MODEL_PRESENTATION_UNAVAILABLE_FEEDBACK,
        );
      }
      release(key);
      throw error;
    }
  };

  const renderPreview = async (
    key: string,
    request: ToolcraftModelPresentationRequest,
    context: ToolcraftModelPreviewContext,
  ): Promise<void> => {
    if (disposed) return;
    await prepare({ ...context, target: request.target });
    if (disposed) return;
    preparations.delete(request.target);
    const binding = registry.resolve(request.target);
    const current = slots.get(key);

    if (current?.binding === binding && current.resource !== undefined) {
      await updatePreviewSlot(key, current, request, context);
      return;
    }

    if (current) release(key);
    const controller = new AbortController();
    const slot: ModelRenderSlot = {
      binding,
      controller,
      generation: ++generation,
      mutationQueue: Promise.resolve(),
    };
    slots.set(key, slot);

    try {
      const presentation = presentationFor(request, "preview");
      const resource = await binding.create(presentation, {
        acquirePresentation: presentationManager.acquirePresentation,
        signal: controller.signal,
      });
      if (disposed || slots.get(key) !== slot || controller.signal.aborted) {
        binding.dispose(resource);
        return;
      }
      slot.resource = resource;
      binding.renderPreview(resource, context);
      feedbackBoundary.clear(request.target);
    } catch (error) {
      const wasAborted = controller.signal.aborted;
      if (slots.get(key) === slot) {
        slots.delete(key);
        retireSlot(slot);
      }
      if (wasAborted) return;
      feedbackBoundary.report(
        request.target,
        TOOLCRAFT_MODEL_PRESENTATION_UNAVAILABLE_FEEDBACK,
      );
      throw error;
    }
  };

  const renderExport = async (
    request: ToolcraftModelPresentationRequest,
    context: ToolcraftModelExportContext,
  ): Promise<void> => {
    if (disposed) return;
    const binding = registry.resolve(request.target);
    const controller = new AbortController();
    const exportResource: ExportResource = { binding, controller };
    exportResources.add(exportResource);

    try {
      const presentation = presentationFor(request, "export");
      const resource = await binding.create(presentation, {
        acquirePresentation: presentationManager.acquirePresentation,
        signal: controller.signal,
      });
      exportResource.resource = resource;
      if (disposed || controller.signal.aborted) return;
      await binding.renderExport(resource, context);
      feedbackBoundary.clear(request.target);
    } catch (error) {
      if (!controller.signal.aborted) {
        feedbackBoundary.report(
          request.target,
          TOOLCRAFT_MODEL_PRESENTATION_UNAVAILABLE_FEEDBACK,
        );
      }
      throw error;
    } finally {
      exportResources.delete(exportResource);
      controller.abort();
      if (exportResource.resource !== undefined) {
        binding.dispose(exportResource.resource);
        exportResource.resource = undefined;
      }
    }
  };

  return {
    acquirePresentation: presentationManager.acquirePresentation,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const slot of slots.values()) retireSlot(slot);
      slots.clear();
      for (const activeExport of exportResources) {
        activeExport.controller.abort();
        if (activeExport.resource !== undefined) {
          activeExport.binding.dispose(activeExport.resource);
          activeExport.resource = undefined;
        }
      }
      exportResources.clear();
      preparationListeners.clear();
      preparations.clear();
      for (const binding of new Set([
        registry.standardBinding,
        ...Object.values(registry.bindings),
      ])) {
        binding.disposePreparedPreview?.();
      }
      presentationManager.dispose();
    },
    getPreparationStatus: () => preparationStatus,
    hitTest: (key: string, point: ToolcraftModelHitTestPoint) => {
      const slot = slots.get(key);
      return slot?.resource === undefined
        ? false
        : slot.binding.hitTest(slot.resource, point);
    },
    prepare,
    release,
    renderExport,
    renderPreview,
    subscribePreparation: (listener: () => void) => {
      preparationListeners.add(listener);
      return () => preparationListeners.delete(listener);
    },
  };
}
