import {
  clampToolcraftTimelineDurationSeconds,
  toolcraftTimelineDefaultDurationSeconds,
} from "../state/timeline-values";
import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftTimelinePanelSchema,
  ToolcraftAppSchema,
  ToolcraftCanvasSize,
  ToolcraftCanvasSizingSchema,
  ToolcraftTimelinePanelSchema,
  ToolcraftToolbarSchema,
} from "./types";

export const defaultToolcraftCanvasSize = {
  height: 1080,
  unit: "px",
  width: 1920,
} satisfies ToolcraftCanvasSize;

export function resolveToolcraftCanvasSizing(
  canvas: ToolcraftAppSchema["canvas"],
): ToolcraftCanvasSizingSchema {
  if (canvas.sizing) {
    return canvas.sizing;
  }

  if (canvas.size) {
    return { mode: "editable-output" };
  }

  if (canvas.upload) {
    return { mode: "editable-output" };
  }

  return { mode: "intrinsic-media" };
}

export function resolveToolcraftExport(
  exportSchema: ToolcraftAppSchema["export"],
): ResolvedToolcraftAppSchema["export"] {
  return {
    png: {
      background: exportSchema?.png?.background ?? "include",
    },
  };
}

export function resolveToolcraftMedia(
  mediaSchema: ToolcraftAppSchema["media"],
): ResolvedToolcraftAppSchema["media"] {
  return {
    defaultAssets: mediaSchema?.defaultAssets ?? [],
  };
}

export function resolveToolcraftTimelinePanel(
  timeline: ToolcraftTimelinePanelSchema | undefined,
): ResolvedToolcraftTimelinePanelSchema | undefined {
  if (timeline === true) {
    return {
      defaultDurationSeconds: toolcraftTimelineDefaultDurationSeconds,
      enabled: true,
      mode: "keyframes",
    };
  }

  if (!timeline || timeline.enabled === false) {
    return undefined;
  }

  return {
    defaultDurationSeconds: clampToolcraftTimelineDurationSeconds(
      timeline.defaultDurationSeconds,
    ),
    enabled: true,
    mode: timeline.mode ?? "keyframes",
  };
}

export function resolveToolcraftToolbar({
  canvasEnabled,
  toolbar,
}: {
  canvasEnabled: boolean;
  toolbar: ToolcraftAppSchema["toolbar"];
}): Required<ToolcraftToolbarSchema> {
  return {
    history: toolbar?.history ?? canvasEnabled,
    radar: toolbar?.radar ?? canvasEnabled,
    theme: toolbar?.theme ?? true,
    zoom: toolbar?.zoom ?? canvasEnabled,
  };
}
