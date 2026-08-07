import type { ToolcraftHistoryPatch } from "./types";

const controlsResetHistorySource = "controls.reset" as const;
const canvasStateHistorySource = "canvas.state" as const;
const historyPatchMetadataNamespace =
  "toolcraft/history-patch-metadata/v1";
declare const historyPatchMetadataKeyType: unique symbol;
const historyPatchMetadataKey: typeof historyPatchMetadataKeyType = Symbol.for(
  historyPatchMetadataNamespace,
) as typeof historyPatchMetadataKeyType;

export type ToolcraftInternalHistoryPatchSource =
  | typeof canvasStateHistorySource
  | typeof controlsResetHistorySource;

type ToolcraftHistoryPatchMetadata = {
  source: ToolcraftInternalHistoryPatchSource;
};

type ToolcraftHistoryPatchWithMetadata = ToolcraftHistoryPatch & {
  [historyPatchMetadataKey]?: ToolcraftHistoryPatchMetadata;
};

export function getToolcraftControlsResetHistorySource(): ToolcraftInternalHistoryPatchSource {
  return controlsResetHistorySource;
}

export function getToolcraftHistoryPatchSource(
  patch: ToolcraftHistoryPatch | undefined,
): ToolcraftInternalHistoryPatchSource | undefined {
  return (patch as ToolcraftHistoryPatchWithMetadata | undefined)?.[
    historyPatchMetadataKey
  ]?.source;
}

export function isToolcraftControlsResetHistoryPatch(
  patch: ToolcraftHistoryPatch | undefined,
): boolean {
  return getToolcraftHistoryPatchSource(patch) === controlsResetHistorySource;
}

export function isToolcraftCanvasStateHistoryPatch(
  patch: ToolcraftHistoryPatch | undefined,
): boolean {
  return getToolcraftHistoryPatchSource(patch) === canvasStateHistorySource;
}

export function tagToolcraftControlsResetHistoryPatch(
  patch: ToolcraftHistoryPatch,
): ToolcraftHistoryPatch {
  return tagToolcraftHistoryPatchSource(patch, controlsResetHistorySource);
}

export function tagToolcraftCanvasStateHistoryPatch(
  patch: ToolcraftHistoryPatch,
): ToolcraftHistoryPatch {
  return tagToolcraftHistoryPatchSource(patch, canvasStateHistorySource);
}

export function tagToolcraftHistoryPatchSource(
  patch: ToolcraftHistoryPatch,
  source: ToolcraftInternalHistoryPatchSource | undefined,
): ToolcraftHistoryPatch {
  if (source === undefined) {
    return patch;
  }

  const taggedPatch: ToolcraftHistoryPatchWithMetadata = {
    ...patch,
    [historyPatchMetadataKey]: { source },
  };

  return taggedPatch;
}
