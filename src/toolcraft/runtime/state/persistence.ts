import type {
  ToolcraftLocalStoragePersistenceSchema,
  ResolvedToolcraftAppSchema,
} from "../schema/types";
import { readToolcraftPersistedInitialState } from "./persistence-readers";
import {
  migrateToolcraftPersistencePayload,
  type ToolcraftVersionedPersistencePayload,
} from "./persistence-migrations";
import type { ToolcraftInitialState } from "./types";

export type { ToolcraftPersistencePayload } from "./persistence-shared";
export { mergeToolcraftInitialState } from "./persistence-merge";
export { createToolcraftPersistenceSnapshot } from "./persistence-snapshot";

export type ToolcraftPersistenceSnapshotParseResult =
  | { kind: "absent" | "invalid" | "unsupported-version" }
  | {
      kind: "current";
      state: ToolcraftInitialState;
    }
  | {
      fromVersion: number;
      kind: "migrated";
      state: ToolcraftInitialState;
    }
  | {
      kind: "newer-version";
      payload: ToolcraftVersionedPersistencePayload;
    };

export function parseToolcraftPersistenceSnapshotResult(
  schema: ResolvedToolcraftAppSchema,
  rawValue: string | null,
): ToolcraftPersistenceSnapshotParseResult {
  const persistence = schema.persistence;

  if (persistence.storage !== "localStorage" || !rawValue) {
    return { kind: "absent" };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawValue);
  } catch {
    return { kind: "invalid" };
  }

  const migration = migrateToolcraftPersistencePayload(
    payload,
    persistence.version,
  );

  if (migration.kind === "newer-version") {
    return migration;
  }

  if (migration.kind === "invalid" || migration.kind === "unsupported-version") {
    return { kind: migration.kind };
  }

  const state = readToolcraftPersistedInitialState(
    schema,
    migration.payload.state,
    new Set(persistence.include),
  ) ?? {};

  return migration.kind === "migrated"
    ? { fromVersion: migration.fromVersion, kind: "migrated", state }
    : { kind: "current", state };
}

export function parseToolcraftPersistenceSnapshot(
  schema: ResolvedToolcraftAppSchema,
  rawValue: string | null,
): ToolcraftInitialState | undefined {
  const result = parseToolcraftPersistenceSnapshotResult(schema, rawValue);

  return result.kind === "current" || result.kind === "migrated"
    ? result.state
    : undefined;
}

export function getToolcraftPersistenceKey(
  persistence: ResolvedToolcraftAppSchema["persistence"],
): ToolcraftLocalStoragePersistenceSchema["key"] | undefined {
  return persistence.storage === "localStorage" ? persistence.key : undefined;
}
