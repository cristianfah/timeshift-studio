import {
  createToolcraftDataUrlResourceRef,
  type ToolcraftBinaryMediaKind,
} from "../source-assets/media-resource-ref";
import type { ToolcraftMediaResourceState } from "./types";

type ToolcraftMediaResourceSource =
  | ToolcraftMediaResourceState
  | { dataUrl: string };

export function cloneToolcraftMediaResourceState(
  kind: ToolcraftBinaryMediaKind,
  source: ToolcraftMediaResourceSource,
): ToolcraftMediaResourceState {
  if (!("resourceRef" in source)) {
    return {
      lifecycle: "restoring",
      resourceRef: createToolcraftDataUrlResourceRef(kind, source.dataUrl),
    };
  }

  if (source.lifecycle === "unavailable") {
    return {
      error: { ...source.error },
      lifecycle: "unavailable",
      resourceRef: source.resourceRef,
    };
  }

  return {
    lifecycle: source.lifecycle,
    resourceRef: source.resourceRef,
  };
}
