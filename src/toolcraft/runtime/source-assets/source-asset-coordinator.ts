import type { ToolcraftControlSchema } from "../schema/types";
import {
  isToolcraftDefaultModelPlaceholder,
} from "../model-import/default-model-source-assets";
import {
  createToolcraftModelWorkerClient,
  type ToolcraftModelWorkerClient,
} from "../model-import/worker/model-import-worker-client";
import { createToolcraftModelRepairController } from "../model-import/model-source-asset-handler-repair-controller";
import type {
  ToolcraftCommand,
  ToolcraftMediaAsset,
  ToolcraftState,
} from "../state/types";
import { createToolcraftSourceAssetCleanupManager } from "./source-asset-cleanup-manager";
import {
  createToolcraftSourceAssetImportRunner,
  DIRECT_CANVAS_OPERATION_TARGET,
  DIRECT_CANVAS_SOURCE_ASSET_CONTROL,
} from "./source-asset-import-runner";
import {
  createToolcraftSourceAssetJobManager,
  type ToolcraftSourceAssetDefaultReplacement,
} from "./source-asset-job-manager";
import { createToolcraftSourceAssetModelHydrator } from "./source-asset-model-hydrator";
import { createToolcraftSourceAssetOperationStore } from "./source-asset-operation-store";
import { createToolcraftSourceAssetResourceResolver } from "./source-asset-resource-resolver";
import {
  getToolcraftSourceAssetHandler,
  type ToolcraftSourceAssetRegistry,
} from "./source-asset-registry";
import { createToolcraftProductionSourceAssetRegistry } from "./production-source-asset-registry";
import type { ToolcraftBinaryAssetRepository } from "./repository/binary-asset-repository";
import { assertToolcraftBinaryAssetRef } from "./repository/binary-asset-repository";
import { collectToolcraftReachableResourceRefs } from "./repository/resource-reachability";
import type {
  ToolcraftFileDropPresentation,
  ToolcraftSourceAssetBatch,
  ToolcraftSourceAssetFeedback,
  ToolcraftSourceAssetImportOutcome,
  ToolcraftSourceAssetOperation,
} from "./source-asset-types";
import type { ToolcraftBinaryMediaHydrationJob } from "./binary-media-hydration";
import { createToolcraftSourceAssetBinaryMediaHydrator } from "./source-asset-binary-media-hydrator";

export type ToolcraftSourceAssetCoordinator = {
  cancelTarget: (target: string) => void;
  clearPresentationFeedback: (target: string) => void;
  dispose: () => Promise<void>;
  getOperation: (target: string) => ToolcraftSourceAssetOperation;
  getPresentation: (
    control: ToolcraftControlSchema,
    mediaAssets: readonly ToolcraftMediaAsset[],
    operation?: ToolcraftSourceAssetOperation,
  ) => ToolcraftFileDropPresentation | null;
  hydrateModels: () => Promise<void>;
  hydrateBinaryMedia: (
    jobs: readonly ToolcraftBinaryMediaHydrationJob[],
  ) => Promise<void>;
  importBatch: (
    batch: ToolcraftSourceAssetBatch,
    control?: ToolcraftControlSchema,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
  repairModel: (
    assetId: string,
  ) => Promise<ToolcraftSourceAssetImportOutcome>;
  reportPresentationFeedback: (
    target: string,
    feedback: ToolcraftSourceAssetFeedback,
  ) => void;
  retainResourceRef?: (ref: string) => () => void;
  resolveResource?: (
    ref: string,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<Uint8Array | null>;
  subscribe: (listener: () => void) => () => void;
};

export type ToolcraftModelRepairCoordinator = Pick<
  ToolcraftSourceAssetCoordinator,
  "repairModel"
>;

export type CreateToolcraftSourceAssetCoordinatorOptions = {
  createModelWorkerClient?: () => ToolcraftModelWorkerClient;
  dispatch: (command: ToolcraftCommand) => void;
  getState: () => ToolcraftState;
  jobIdFactory?: () => string;
  registry?: ToolcraftSourceAssetRegistry;
  repository: ToolcraftBinaryAssetRepository;
};

export {
  DIRECT_CANVAS_OPERATION_TARGET,
  DIRECT_CANVAS_SOURCE_ASSET_CONTROL,
};

export function createToolcraftSourceAssetCoordinator({
  createModelWorkerClient: createWorkerClient,
  dispatch,
  getState,
  jobIdFactory,
  registry: requestedRegistry,
  repository,
}: CreateToolcraftSourceAssetCoordinatorOptions): ToolcraftSourceAssetCoordinator {
  const modelWorkerClient = createWorkerClient?.() ??
    createToolcraftModelWorkerClient();
  const registry = requestedRegistry ??
    createToolcraftProductionSourceAssetRegistry(modelWorkerClient);
  const operationStore = createToolcraftSourceAssetOperationStore();
  const presentationRefCounts = new Map<string, number>();
  let disposePromise: Promise<void> | null = null;

  const jobManager = createToolcraftSourceAssetJobManager({
    jobIdFactory,
    onBegin: (job, phase) => {
      operationStore.setOperation({
        jobId: job.jobId,
        phase,
        target: job.target,
      });
    },
    onCancelTarget: (target) => {
      operationStore.setOperation({ phase: "idle", target });
    },
  });
  const {
    attachLease,
    beginJob,
    isAdmissionCurrent,
    isCurrent,
    removeJob: removeActiveJob,
    reserveAdmission,
    settleLease,
    trackInflight,
  } = jobManager;

  const isDefaultReplacementCurrent = (
    replacement: ToolcraftSourceAssetDefaultReplacement,
  ): boolean => {
    const asset = getState().mediaAssets.find(
      (candidate) => candidate.id === replacement.assetId,
    );
    return asset?.assetKind === "model" &&
      isToolcraftDefaultModelPlaceholder(asset) &&
      asset.layerId === replacement.layerId &&
      asset.sourceBundleRef === replacement.placeholderRef &&
      asset.sourceTarget === replacement.sourceTarget;
  };

  const cleanupManager = createToolcraftSourceAssetCleanupManager({
    getReachableRefs: () =>
      collectToolcraftReachableResourceRefs({
        activeJobs: jobManager.getActiveJobs().map((job) => ({
          stagedResourceRefs: [...job.stagedResourceRefs].sort(),
        })),
        activePresentationRefs: [...presentationRefCounts.keys()].sort(),
        state: getState(),
      }),
    repository,
  });

  const finishOperation = (
    job: Parameters<typeof isCurrent>[0],
    feedback?: ToolcraftSourceAssetFeedback,
  ): void => {
    if (!isCurrent(job)) {
      return;
    }

    operationStore.setOperation({
      ...(feedback ? { feedback } : {}),
      phase: "idle",
      target: job.target,
    });
  };

  const importRunner = createToolcraftSourceAssetImportRunner({
    cleanupManager,
    dispatch,
    getState,
    isDefaultReplacementCurrent,
    jobManager,
    operationStore,
    registry,
    repository,
  });
  const importBatch = importRunner.importBatch;
  const modelHydrator = createToolcraftSourceAssetModelHydrator({
    cleanupManager,
    createModelWorkerClient: createWorkerClient,
    dispatch,
    getState,
    importRunner,
    isDefaultReplacementCurrent,
    jobManager,
    operationStore,
    repository,
  });
  const hydrateBinaryMedia = createToolcraftSourceAssetBinaryMediaHydrator({
    cleanupManager,
    dispatch,
    getState,
    repository,
  });

  const modelRepairController = createToolcraftModelRepairController({
    admit: (target) => {
      const admission = reserveAdmission(target);
      return {
        begin: () => {
          const job = beginJob(admission, "repairing");
          return {
            addStagedResourceRef: (ref) => job.stagedResourceRefs.add(ref),
            attachLease: (lease) => attachLease(job, lease),
            finish: (feedback) => finishOperation(job, feedback),
            isCurrent: () => isCurrent(job),
            jobId: job.jobId,
            release: () => removeActiveJob(job),
            reportOperation: (update) => {
              if (isCurrent(job)) {
                operationStore.updateOperation(job.target, update);
              }
            },
            settleLease: (lease) => settleLease(job, lease),
            signal: job.controller.signal,
          };
        },
        isCurrent: () => isAdmissionCurrent(admission),
      };
    },
    cleanupManager,
    dispatch,
    getState,
    isDisposed: jobManager.isDisposed,
    publishFeedback: (target, feedback) => {
      operationStore.setOperation({ feedback, phase: "idle", target });
    },
    repository,
    trackInflight,
    workerClient: modelWorkerClient,
  });

  const resolveResource = createToolcraftSourceAssetResourceResolver({
    getActiveJobs: jobManager.getActiveJobs,
    isDisposed: jobManager.isDisposed,
    repository,
  });

  return {
    cancelTarget: jobManager.cancelTarget,
    clearPresentationFeedback: operationStore.clearPresentationFeedback,
    dispose: () => {
      if (disposePromise) {
        return disposePromise;
      }

      disposePromise = (async () => {
        modelHydrator.cancel();
        await jobManager.beginDispose();
        await modelHydrator.settle();
        operationStore.dispose();
        const failures: unknown[] = [];
        try {
          modelWorkerClient.dispose();
        } catch (error) {
          failures.push(error);
        }
        try {
          modelHydrator.disposeWorker();
        } catch (error) {
          failures.push(error);
        }
        try {
          await cleanupManager.dispose();
        } catch (error) {
          failures.push(error);
        }
        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            "Source asset coordinator cleanup and disposal failed",
          );
        }
      })();
      return disposePromise;
    },
    getOperation: operationStore.getOperation,
    getPresentation: (control, mediaAssets, operation) => {
      const kind = control.assetKind === "file"
        ? "file"
        : control.assetKind === "model"
          ? "model"
          : "image";
      const handler = getToolcraftSourceAssetHandler(registry, kind);

      return handler
        ? handler.present({
            control,
            mediaAssets,
            operation: operation ?? operationStore.getOperation(control.target),
          })
        : null;
    },
    hydrateModels: modelHydrator.hydrateModels,
    hydrateBinaryMedia,
    importBatch,
    repairModel: modelRepairController.repairModel,
    reportPresentationFeedback: operationStore.setPresentationFeedback,
    retainResourceRef: (ref) => {
      assertToolcraftBinaryAssetRef(ref);
      if (jobManager.isDisposed()) {
        throw new Error("Source asset coordinator is disposed.");
      }
      presentationRefCounts.set(ref, (presentationRefCounts.get(ref) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const count = presentationRefCounts.get(ref);
        if (count === undefined || count <= 1) presentationRefCounts.delete(ref);
        else presentationRefCounts.set(ref, count - 1);
      };
    },
    resolveResource,
    subscribe: operationStore.subscribe,
  };
}
