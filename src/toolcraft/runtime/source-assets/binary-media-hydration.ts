import type { ResolvedToolcraftAppSchema } from "../schema/types";
import { isToolcraftPersistenceRecord } from "../state/persistence-shared";
import {
  createToolcraftDataUrlResourceRef,
  type ToolcraftBinaryMediaKind,
} from "./media-resource-ref";

export type ToolcraftBinaryMediaHydrationJob = {
  assetId: string;
  dataUrl: string;
  kind: ToolcraftBinaryMediaKind;
  mimeType: string;
  resourceRef: string;
};

export function getToolcraftBinaryMediaHydrationKey(
  assetId: string,
  resourceRef: string,
): string {
  return `${assetId}\u0000${resourceRef}`;
}

export function collectToolcraftBinaryMediaHydrationJobs(
  value: unknown,
): ToolcraftBinaryMediaHydrationJob[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    if (
      !isToolcraftPersistenceRecord(candidate) ||
      typeof candidate.dataUrl !== "string" ||
      typeof candidate.id !== "string" ||
      typeof candidate.mimeType !== "string" ||
      candidate.assetKind === "model"
    ) {
      return [];
    }

    const kind = candidate.assetKind === "file" ? "file" : "image";

    return [{
      assetId: candidate.id,
      dataUrl: candidate.dataUrl,
      kind,
      mimeType: candidate.mimeType,
      resourceRef: createToolcraftDataUrlResourceRef(kind, candidate.dataUrl),
    }];
  });
}

export function createToolcraftDefaultBinaryMediaHydrationJobs(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftBinaryMediaHydrationJob[] {
  return schema.media.defaultAssets.flatMap((asset, index) => {
    if (asset.assetKind === "model") {
      return [];
    }

    const kind = asset.assetKind === "file" ? "file" : "image";

    return [{
      assetId: asset.id ?? `default-media-${index + 1}`,
      dataUrl: asset.dataUrl,
      kind,
      mimeType:
        asset.mimeType ??
        (kind === "file" ? "application/octet-stream" : "image/*"),
      resourceRef: createToolcraftDataUrlResourceRef(kind, asset.dataUrl),
    }];
  });
}
