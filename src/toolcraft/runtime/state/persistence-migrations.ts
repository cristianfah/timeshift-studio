import { isToolcraftPersistenceRecord } from "./persistence-shared";

export type ToolcraftVersionedPersistencePayload = {
  state: Record<string, unknown>;
  version: number;
};

export type ToolcraftPersistenceMigrationResult =
  | {
      kind: "current";
      payload: ToolcraftVersionedPersistencePayload;
    }
  | {
      fromVersion: number;
      kind: "migrated";
      payload: ToolcraftVersionedPersistencePayload;
    }
  | {
      kind: "newer-version" | "unsupported-version";
      payload: ToolcraftVersionedPersistencePayload;
    }
  | { kind: "invalid" };

type ToolcraftPersistenceMigration = (
  payload: ToolcraftVersionedPersistencePayload,
) => ToolcraftVersionedPersistencePayload;

function migratePersistenceV1ToV2(
  payload: ToolcraftVersionedPersistencePayload,
): ToolcraftVersionedPersistencePayload {
  return {
    state: payload.state,
    version: 2,
  };
}

const migrations: Readonly<Record<number, ToolcraftPersistenceMigration>> = {
  1: migratePersistenceV1ToV2,
};

function readVersionedPayload(
  value: unknown,
): ToolcraftVersionedPersistencePayload | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    !Number.isInteger(value.version) ||
    typeof value.version !== "number" ||
    !isToolcraftPersistenceRecord(value.state)
  ) {
    return undefined;
  }

  return {
    state: value.state,
    version: value.version,
  };
}

export function migrateToolcraftPersistencePayload(
  value: unknown,
  currentVersion: number,
): ToolcraftPersistenceMigrationResult {
  const payload = readVersionedPayload(value);

  if (!payload) {
    return { kind: "invalid" };
  }

  if (payload.version === currentVersion) {
    return { kind: "current", payload };
  }

  if (payload.version > currentVersion) {
    return { kind: "newer-version", payload };
  }

  const fromVersion = payload.version;
  let migrated = payload;

  while (migrated.version < currentVersion) {
    const migrate = migrations[migrated.version];

    if (!migrate) {
      return { kind: "unsupported-version", payload };
    }

    const next = migrate(migrated);

    if (next.version !== migrated.version + 1) {
      return { kind: "invalid" };
    }

    migrated = next;
  }

  return {
    fromVersion,
    kind: "migrated",
    payload: migrated,
  };
}
