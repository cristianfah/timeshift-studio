"use client";

import * as React from "react";

import type { ToolcraftPersistableStateSlice } from "../../schema/types";
import type { ResolvedToolcraftAppSchema } from "../../schema/types";
import {
  createToolcraftPersistenceController,
  type ToolcraftPersistenceStatus,
} from "../../state/persistence-controller";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftState } from "../../state/types";
import { getToolcraftBinaryMediaHydrationKey } from "../../source-assets/binary-media-hydration";

const ToolcraftPersistenceStatusContext =
  React.createContext<ToolcraftPersistenceStatus>({ status: "disabled" });

function getPersistedStateReferences(
  state: ToolcraftState,
  include: readonly ToolcraftPersistableStateSlice[],
): readonly unknown[] {
  const references: unknown[] = [];

  for (const slice of include) {
    switch (slice) {
      case "canvas":
        references.push(state.canvas);
        break;
      case "layers":
        references.push(state.layers, state.selectedLayerId);
        break;
      case "media":
        references.push(state.mediaAssets);
        break;
      case "panels":
        references.push(state.panels);
        break;
      case "timeline":
        references.push(state.timeline);
        break;
      case "values":
        for (const target of Object.keys(state.defaults)) {
          references.push(state.values[target]);
        }
        break;
    }
  }

  return references;
}

function persistedStateReferencesEqual(
  previous: readonly unknown[],
  next: readonly unknown[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index]))
  );
}

function isPersistenceHydrationPending(
  state: ToolcraftState,
  include: readonly ToolcraftPersistableStateSlice[],
): boolean {
  return (
    include.includes("media") &&
    state.mediaAssets.some(
      (asset) => "lifecycle" in asset && asset.lifecycle === "restoring",
    )
  );
}

export function useToolcraftPersistence(
  schema: ResolvedToolcraftAppSchema,
  store: ToolcraftExternalStore,
  options: {
    blockedReason?: "newer-version";
    cleanupStorageKeys?: readonly string[];
    mediaMigrationResourceKeys?: readonly string[];
  } = {},
): ToolcraftPersistenceStatus {
  const [status, setStatus] = React.useState<ToolcraftPersistenceStatus>(() =>
    options.blockedReason === "newer-version"
      ? { reason: "incompatible-version", status: "failed" }
      : schema.persistence.storage === "localStorage"
      ? { status: "pending" }
      : { status: "disabled" },
  );

  React.useEffect(() => {
    const persistence = schema.persistence;

    if (
      persistence.storage !== "localStorage" ||
      typeof window === "undefined"
    ) {
      setStatus({ status: "disabled" });
      return undefined;
    }

    let mounted = true;
    const mediaMigrationResourceKeys = new Set(
      options.mediaMigrationResourceKeys ?? [],
    );
    const controller = createToolcraftPersistenceController({
      blockedReason: options.blockedReason,
      getCommittedState: store.getCommittedState,
      getWriteBlock: () => {
        if (!persistence.include.includes("media")) {
          return null;
        }

        const hasBlockedMigration = store.getCommittedState().mediaAssets.some(
          (asset) =>
            asset.assetKind !== "model" &&
            asset.lifecycle !== "ready" &&
            mediaMigrationResourceKeys.has(
              getToolcraftBinaryMediaHydrationKey(asset.id, asset.resourceRef),
            ),
        );

        return hasBlockedMigration
          ? { reason: "unavailable", status: "failed" }
          : null;
      },
      onStatusChange: (nextStatus) => {
        if (mounted) {
          setStatus(nextStatus);
        }
      },
      onWriteSuccess: () => {
        for (const storageKey of options.cleanupStorageKeys ?? []) {
          try {
            window.localStorage.removeItem(storageKey);
          } catch {
            // Cleanup is best-effort after the canonical snapshot is durable.
          }
        }
      },
      schema,
      storage: window.localStorage,
    });
    const scheduleWhenHydrated = (): void => {
      if (
        !isPersistenceHydrationPending(
          store.getCommittedState(),
          persistence.include,
        )
      ) {
        controller.schedule();
      }
    };
    const unsubscribe = store.subscribeSelector(
      () =>
        getPersistedStateReferences(
          store.getCommittedState(),
          persistence.include,
        ),
      scheduleWhenHydrated,
      persistedStateReferencesEqual,
    );
    const handlePageHide = (): void => {
      controller.flush();
    };

    window.addEventListener("pagehide", handlePageHide);
    scheduleWhenHydrated();

    return () => {
      mounted = false;
      window.removeEventListener("pagehide", handlePageHide);
      unsubscribe();
      controller.dispose();
    };
  }, [
    options.blockedReason,
    options.cleanupStorageKeys,
    options.mediaMigrationResourceKeys,
    schema,
    store,
  ]);

  return status;
}

export function ToolcraftPersistenceStatusProvider({
  children,
  status,
}: {
  children: React.ReactNode;
  status: ToolcraftPersistenceStatus;
}): React.JSX.Element {
  return React.createElement(
    ToolcraftPersistenceStatusContext.Provider,
    { value: status },
    children,
  );
}

export function useToolcraftPersistenceStatus(): ToolcraftPersistenceStatus {
  return React.useContext(ToolcraftPersistenceStatusContext);
}
