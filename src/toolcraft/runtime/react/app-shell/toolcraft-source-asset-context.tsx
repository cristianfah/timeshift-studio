"use client";

import * as React from "react";

import {
  createToolcraftDefaultBinaryMediaHydrationJobs,
  getToolcraftBinaryMediaHydrationKey,
  type ToolcraftBinaryMediaHydrationJob,
} from "../../source-assets/binary-media-hydration";
import type { ToolcraftSourceAssetCoordinator } from "../../source-assets/source-asset-coordinator";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import { ToolcraftModelRenderProvider } from "../model-rendering/model-render-provider";
import { useToolcraftModelPresentationMode } from "../model-rendering/model-presentation-mode";
import {
  getToolcraftOrientationControlEntries,
  resolveToolcraftOrientationControl,
} from "../orientation-gizmo/orientation-gizmo-selection";
import { ToolcraftMediaPresentationProvider } from "./toolcraft-media-presentation";
import { acquireToolcraftSourceAssetOwner } from "./toolcraft-source-asset-owner";
import { decorateToolcraftUnavailableResourceProofCoordinator } from "./toolcraft-unavailable-resource-proof";

export { useToolcraftMediaPresentationUrls } from "./toolcraft-media-presentation";

export const ToolcraftSourceAssetCoordinatorContext =
  React.createContext<ToolcraftSourceAssetCoordinator | null>(null);

type ToolcraftSourceAssetCoordinatorFactory = (
  store: ToolcraftExternalStore,
) => ToolcraftSourceAssetCoordinator;

type ToolcraftSourceAssetOwnerLease = ReturnType<
  typeof acquireToolcraftSourceAssetOwner
>;

type ToolcraftSourceAssetAcquisition = Readonly<{
  lease: ToolcraftSourceAssetOwnerLease;
  store: ToolcraftExternalStore;
}>;

function selectModelHydrationFingerprint(
  state: ReturnType<ToolcraftExternalStore["getCommittedState"]>,
): string {
  return state.mediaAssets
    .filter((asset) => asset.assetKind === "model")
    .map((asset) =>
      `${asset.id}\u0000${asset.lifecycle}\u0000${asset.sourceBundleRef}`
    )
    .sort()
    .join("\u0001");
}

function selectBinaryHydrationFingerprint(
  state: ReturnType<ToolcraftExternalStore["getCommittedState"]>,
): string {
  return state.mediaAssets
    .flatMap((asset) =>
      asset.assetKind !== "model" && asset.lifecycle === "restoring"
        ? [`${asset.id}\u0000${asset.resourceRef}`]
        : [],
    )
    .sort()
    .join("\u0001");
}

export function ToolcraftSourceAssetProvider({
  binaryMediaHydrationJobs = [],
  children,
  createCoordinator,
  onDisposeError,
  onError,
  store,
}: {
  binaryMediaHydrationJobs?: readonly ToolcraftBinaryMediaHydrationJob[];
  children: React.ReactNode;
  createCoordinator?: ToolcraftSourceAssetCoordinatorFactory;
  /** @deprecated Use onError. */
  onDisposeError?: (error: unknown) => void;
  onError?: (error: unknown) => void;
  store: ToolcraftExternalStore;
}): React.JSX.Element {
  const [acquisition, setAcquisition] =
    React.useState<ToolcraftSourceAssetAcquisition | null>(null);
  const activeLease = acquisition?.store === store
    ? acquisition.lease
    : null;
  const constructionOnError = onError ?? onDisposeError;

  // Construction inputs are captured when the store owner is acquired.
  // Same-store callback identity changes intentionally keep that owner.
  React.useLayoutEffect(() => {
    const lease = acquireToolcraftSourceAssetOwner({
      createCoordinator,
      decorateCoordinator:
        decorateToolcraftUnavailableResourceProofCoordinator,
      onError: constructionOnError,
      store,
    });
    setAcquisition({
      lease,
      store,
    });
    return lease.release;
  }, [store]);

  return activeLease
    ? (
      <ToolcraftSourceAssetProviderContent
        binaryMediaHydrationJobs={binaryMediaHydrationJobs}
        lease={activeLease}
        store={store}
      >
        {children}
      </ToolcraftSourceAssetProviderContent>
    )
    : <></>;
}

function ToolcraftSourceAssetProviderContent({
  binaryMediaHydrationJobs,
  children,
  lease,
  store,
}: {
  binaryMediaHydrationJobs: readonly ToolcraftBinaryMediaHydrationJob[];
  children: React.ReactNode;
  lease: ToolcraftSourceAssetOwnerLease;
  store: ToolcraftExternalStore;
}): React.JSX.Element {
  const coordinator = lease.coordinator;
  const modelPresentation = useToolcraftModelPresentationMode();
  const customSourceTargets = React.useMemo(
    () => modelPresentation.mode === "custom"
      ? new Set(
          modelPresentation.consumers.map(({ sourceTarget }) => sourceTarget),
        )
      : new Set<string>(),
    [modelPresentation],
  );
  const getActiveCustomTargetsFingerprint = React.useCallback(
    () => [...new Set(
      store.getCommittedState().mediaAssets.flatMap((asset) =>
        asset.assetKind === "model" &&
          asset.lifecycle !== "restoring" &&
          asset.lifecycle !== "unavailable" &&
          asset.sourceTarget !== undefined &&
          customSourceTargets.has(asset.sourceTarget)
          ? [asset.sourceTarget]
          : []
      ),
    )].sort().join("\u0000"),
    [customSourceTargets, store],
  );
  const activeCustomTargetsFingerprint = React.useSyncExternalStore(
    store.subscribe,
    getActiveCustomTargetsFingerprint,
    getActiveCustomTargetsFingerprint,
  );
  const activeCustomTargets = React.useMemo(
    () => activeCustomTargetsFingerprint.length === 0
      ? []
      : activeCustomTargetsFingerprint.split("\u0000"),
    [activeCustomTargetsFingerprint],
  );
  const orientationEntries = React.useMemo(
    () => getToolcraftOrientationControlEntries(
      store.getCommittedState().schema.panels.controls?.sections ?? [],
    ),
    [store],
  );
  const getVisibleOrientationTarget = React.useCallback(
    () => resolveToolcraftOrientationControl(
      store.getCommittedState(),
      orientationEntries,
    )?.control.target ?? "",
    [orientationEntries, store],
  );
  const visibleOrientationTarget = React.useSyncExternalStore(
    store.subscribe,
    getVisibleOrientationTarget,
    getVisibleOrientationTarget,
  );
  const hydratedModelTargetsRef = React.useRef(new Set<string>());
  const binaryHydrationJobs = React.useMemo(() => {
    const jobs = new Map<string, ToolcraftBinaryMediaHydrationJob>();

    for (const job of [
      ...createToolcraftDefaultBinaryMediaHydrationJobs(
        store.getCommittedState().schema,
      ),
      ...binaryMediaHydrationJobs,
    ]) {
      jobs.set(
        getToolcraftBinaryMediaHydrationKey(job.assetId, job.resourceRef),
        job,
      );
    }

    return [...jobs.values()];
  }, [binaryMediaHydrationJobs, store]);
  const binaryBootstrapUrls = React.useMemo(
    () =>
      new Map(
        binaryHydrationJobs.map((job) => [job.resourceRef, job.dataUrl]),
      ),
    [binaryHydrationJobs],
  );

  React.useEffect(() => {
    const hydrateModels = (): void => {
      const currentTargets = new Set<string>();
      for (const asset of store.getCommittedState().mediaAssets) {
        if (asset.assetKind === "model" && asset.sourceTarget) {
          currentTargets.add(asset.sourceTarget);
        }
      }
      for (const target of new Set([
        ...hydratedModelTargetsRef.current,
        ...currentTargets,
      ])) {
        coordinator.clearPresentationFeedback(target);
      }
      hydratedModelTargetsRef.current = currentTargets;
      void coordinator.hydrateModels().catch(lease.reportError);
    };
    const unsubscribeHydration = store.subscribeSelector(
      selectModelHydrationFingerprint,
      hydrateModels,
    );
    const hydrateBinaryMedia = (): void => {
      void coordinator.hydrateBinaryMedia(binaryHydrationJobs).catch(
        lease.reportError,
      );
    };
    const unsubscribeBinaryHydration = store.subscribeSelector(
      selectBinaryHydrationFingerprint,
      hydrateBinaryMedia,
    );
    hydrateModels();
    hydrateBinaryMedia();

    return () => {
      unsubscribeHydration();
      unsubscribeBinaryHydration();
    };
  }, [binaryHydrationJobs, coordinator, lease.reportError, store]);

  const context = (
    <ToolcraftMediaPresentationProvider
      bootstrapUrls={binaryBootstrapUrls}
      resources={lease.presentationResources}
    >
      <ToolcraftSourceAssetCoordinatorContext.Provider value={coordinator}>
        {children}
      </ToolcraftSourceAssetCoordinatorContext.Provider>
    </ToolcraftMediaPresentationProvider>
  );

  return coordinator.resolveResource ? (
    <ToolcraftModelRenderProvider
      activeCustomTargets={activeCustomTargets}
      clearPresentationFeedback={coordinator.clearPresentationFeedback}
      customConsumers={
        modelPresentation.mode === "custom"
          ? modelPresentation.consumers
          : []
      }
      reportPresentationFeedback={coordinator.reportPresentationFeedback}
      resolveResource={coordinator.resolveResource}
      retainResourceRef={coordinator.retainResourceRef}
      visibleOrientationTarget={visibleOrientationTarget || undefined}
    >
      {context}
    </ToolcraftModelRenderProvider>
  ) : context;
}

export function useToolcraftSourceAssetCoordinator(): ToolcraftSourceAssetCoordinator {
  const coordinator = React.useContext(ToolcraftSourceAssetCoordinatorContext);

  if (!coordinator) {
    throw new Error(
      "useToolcraftSourceAssetCoordinator must be used inside ToolcraftRoot",
    );
  }

  return coordinator;
}
