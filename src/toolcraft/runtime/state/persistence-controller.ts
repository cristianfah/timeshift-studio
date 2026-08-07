import type { ResolvedToolcraftAppSchema } from "../schema/types";
import { createToolcraftPersistenceSnapshot } from "./persistence-snapshot";
import type { ToolcraftState } from "./types";

export type ToolcraftPersistenceStorage = Pick<Storage, "setItem">;

export type ToolcraftPersistenceWriteResult =
  | { status: "disabled" | "success" }
  | {
      reason:
        | "incompatible-version"
        | "quota"
        | "unavailable"
        | "unknown";
      status: "failed";
    };

export type ToolcraftPersistenceStatus =
  | ToolcraftPersistenceWriteResult
  | { status: "pending" };

export type ToolcraftPersistenceController = {
  dispose(): ToolcraftPersistenceWriteResult;
  flush(): ToolcraftPersistenceWriteResult;
  getStatus(): ToolcraftPersistenceStatus;
  schedule(): void;
};

function classifyPersistenceFailure(
  error: unknown,
): Extract<ToolcraftPersistenceWriteResult, { status: "failed" }>["reason"] {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return "quota";
    }

    if (error.name === "InvalidStateError" || error.name === "SecurityError") {
      return "unavailable";
    }
  }

  return "unknown";
}

export function createToolcraftPersistenceController({
  blockedReason,
  debounceMs = 120,
  getCommittedState,
  getWriteBlock,
  onStatusChange,
  onWriteSuccess,
  schema,
  storage,
}: {
  blockedReason?: "newer-version";
  debounceMs?: number;
  getCommittedState: () => ToolcraftState;
  getWriteBlock?: () => Extract<
    ToolcraftPersistenceWriteResult,
    { status: "failed" }
  > | null;
  onStatusChange?: (status: ToolcraftPersistenceStatus) => void;
  onWriteSuccess?: () => void;
  schema: ResolvedToolcraftAppSchema;
  storage?: ToolcraftPersistenceStorage;
}): ToolcraftPersistenceController {
  let disposed = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: ToolcraftPersistenceStatus =
    blockedReason === "newer-version"
      ? { reason: "incompatible-version", status: "failed" }
      : schema.persistence.storage === "localStorage"
      ? { status: "pending" }
      : { status: "disabled" };

  const publishStatus = (nextStatus: ToolcraftPersistenceStatus): void => {
    status = nextStatus;
    onStatusChange?.(status);
  };

  const clearScheduledFlush = (): void => {
    if (timer === undefined) {
      return;
    }

    clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): ToolcraftPersistenceWriteResult => {
    if (blockedReason === "newer-version") {
      const result = {
        reason: "incompatible-version",
        status: "failed",
      } as const;

      publishStatus(result);
      return result;
    }

    if (schema.persistence.storage !== "localStorage") {
      const result = { status: "disabled" } as const;

      publishStatus(result);
      return result;
    }

    clearScheduledFlush();
    pending = false;

    const writeBlock = getWriteBlock?.();

    if (writeBlock) {
      publishStatus(writeBlock);
      return writeBlock;
    }

    if (!storage) {
      const result = { reason: "unavailable", status: "failed" } as const;

      publishStatus(result);
      return result;
    }

    try {
      const snapshot = createToolcraftPersistenceSnapshot(
        getCommittedState(),
        schema.persistence,
      );

      if (!snapshot) {
        const result = { status: "disabled" } as const;

        publishStatus(result);
        return result;
      }

      storage.setItem(schema.persistence.key, JSON.stringify(snapshot));
      onWriteSuccess?.();

      const result = { status: "success" } as const;

      publishStatus(result);
      return result;
    } catch (error) {
      const result = {
        reason: classifyPersistenceFailure(error),
        status: "failed",
      } as const;

      publishStatus(result);
      return result;
    }
  };

  return {
    dispose() {
      if (disposed) {
        return status.status === "pending" ? flush() : status;
      }

      const result = pending
        ? flush()
        : status.status === "pending"
          ? flush()
          : status;

      disposed = true;
      clearScheduledFlush();
      return result;
    },
    flush,
    getStatus() {
      return status;
    },
    schedule() {
      if (
        blockedReason === "newer-version" ||
        disposed ||
        schema.persistence.storage !== "localStorage"
      ) {
        return;
      }

      clearScheduledFlush();
      pending = true;
      publishStatus({ status: "pending" });
      timer = setTimeout(() => {
        timer = undefined;
        flush();
      }, debounceMs);
    },
  };
}
