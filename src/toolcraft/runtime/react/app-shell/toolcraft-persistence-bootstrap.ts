import type { ResolvedToolcraftAppSchema } from "../../schema/types";
import {
  collectToolcraftBinaryMediaHydrationJobs,
  getToolcraftBinaryMediaHydrationKey,
  type ToolcraftBinaryMediaHydrationJob,
} from "../../source-assets/binary-media-hydration";
import {
  getToolcraftPersistenceKey,
  mergeToolcraftInitialState,
  parseToolcraftPersistenceSnapshotResult,
} from "../../state/persistence";
import { readLegacyToolcraftSectionCollapseMigration } from "../../state/persistence-legacy-section-collapse";
import type { ToolcraftInitialState } from "../../state/types";
import { readToolcraftLocalStorageEntry } from "./storage-key-migration";

export type ToolcraftPersistenceBootstrap = {
  blockedReason?: "newer-version";
  cleanupStorageKeys: readonly string[];
  initialState?: ToolcraftInitialState;
  mediaHydrationJobs: readonly ToolcraftBinaryMediaHydrationJob[];
  mediaMigrationResourceKeys: readonly string[];
};

const emptyBootstrap: ToolcraftPersistenceBootstrap = {
  cleanupStorageKeys: [],
  mediaHydrationJobs: [],
  mediaMigrationResourceKeys: [],
};

function readPersistedMediaHydrationJobs(
  rawValue: string | null,
): ToolcraftBinaryMediaHydrationJob[] {
  if (!rawValue) {
    return [];
  }

  try {
    const payload: unknown = JSON.parse(rawValue);

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("state" in payload) ||
      typeof payload.state !== "object" ||
      payload.state === null ||
      !("mediaAssets" in payload.state)
    ) {
      return [];
    }

    return collectToolcraftBinaryMediaHydrationJobs(payload.state.mediaAssets);
  } catch {
    return [];
  }
}

export function readToolcraftPersistenceBootstrap(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftPersistenceBootstrap {
  const storageKey = getToolcraftPersistenceKey(schema.persistence);

  if (!storageKey || typeof window === "undefined") {
    return emptyBootstrap;
  }

  try {
    const entry = readToolcraftLocalStorageEntry(storageKey);
    const parsed = parseToolcraftPersistenceSnapshotResult(
      schema,
      entry?.value ?? null,
    );

    if (parsed.kind === "newer-version") {
      return {
        ...emptyBootstrap,
        blockedReason: "newer-version",
      };
    }

    const legacyCollapse = readLegacyToolcraftSectionCollapseMigration(schema);
    const cleanupStorageKeys = new Set<string>();

    if (entry && entry.storageKey !== storageKey) {
      cleanupStorageKeys.add(entry.storageKey);
    }

    if (legacyCollapse) {
      cleanupStorageKeys.add(legacyCollapse.storageKey);
    }

    const mediaHydrationJobs = readPersistedMediaHydrationJobs(
      entry?.value ?? null,
    );

    return {
      cleanupStorageKeys: [...cleanupStorageKeys],
      initialState: mergeToolcraftInitialState(
        legacyCollapse ? { panels: legacyCollapse.panels } : undefined,
        parsed.kind === "current" || parsed.kind === "migrated"
          ? parsed.state
          : undefined,
      ),
      mediaHydrationJobs,
      mediaMigrationResourceKeys: mediaHydrationJobs.map((job) =>
        getToolcraftBinaryMediaHydrationKey(job.assetId, job.resourceRef)
      ),
    };
  } catch {
    return emptyBootstrap;
  }
}
