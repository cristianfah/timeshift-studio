import {
  outwardRoundToolcraftSceneRect,
  type ToolcraftSceneBoundsResult,
  type ToolcraftSceneRect,
} from "../scene";
import { getToolcraftCanvasFrame } from "../state/canvas-frame";
import type { ToolcraftState } from "../state/types";

export const TOOLCRAFT_MAX_EXPORT_EDGE_PX = 8192;
export const TOOLCRAFT_MAX_EXPORT_PIXELS =
  TOOLCRAFT_MAX_EXPORT_EDGE_PX * TOOLCRAFT_MAX_EXPORT_EDGE_PX;

export type ToolcraftExportFrame = ToolcraftSceneRect;

export type ToolcraftSceneExportFailure = Readonly<{
  code:
    | "empty-scene"
    | "scene-bounds-unavailable"
    | "scene-export-too-large";
  message: string;
  ok: false;
}>;

export type ToolcraftExportFrameResult =
  | Readonly<{ frame: ToolcraftExportFrame; ok: true }>
  | ToolcraftSceneExportFailure;

export type ToolcraftArtifactSize = Readonly<{
  height: number;
  width: number;
}>;

const emptySceneExportFailure: ToolcraftSceneExportFailure = Object.freeze({
  code: "empty-scene",
  message: "The scene has no visible exportable elements.",
  ok: false,
});

function isSceneBoundsResult(
  value: ToolcraftSceneBoundsResult | ToolcraftSceneRect,
): value is ToolcraftSceneBoundsResult {
  return "ok" in value;
}

export function resolveToolcraftExportFrame(
  state: ToolcraftState,
  sceneBounds: ToolcraftSceneBoundsResult | ToolcraftSceneRect | null,
): ToolcraftExportFrameResult {
  const canvas = getToolcraftCanvasFrame(state.canvas);
  if (canvas.kind === "finite") {
    return {
      frame: {
        height: canvas.size.height,
        width: canvas.size.width,
        x: 0,
        y: 0,
      },
      ok: true,
    };
  }

  if (!sceneBounds) {
    return emptySceneExportFailure;
  }
  if (isSceneBoundsResult(sceneBounds)) {
    if (!sceneBounds.ok) {
      return sceneBounds;
    }
    sceneBounds = sceneBounds.bounds;
  }

  const frame = outwardRoundToolcraftSceneRect(sceneBounds);
  return frame.width > 0 && frame.height > 0
    ? { frame, ok: true }
    : emptySceneExportFailure;
}

export function validateToolcraftArtifactSize(
  size: ToolcraftArtifactSize,
): Readonly<{ ok: true }> | ToolcraftSceneExportFailure {
  const valid =
    Number.isInteger(size.width) &&
    Number.isInteger(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    size.width <= TOOLCRAFT_MAX_EXPORT_EDGE_PX &&
    size.height <= TOOLCRAFT_MAX_EXPORT_EDGE_PX &&
    size.width * size.height <= TOOLCRAFT_MAX_EXPORT_PIXELS;

  return valid
    ? { ok: true }
    : {
        code: "scene-export-too-large",
        message: `Export must fit within ${TOOLCRAFT_MAX_EXPORT_EDGE_PX} px per edge and ${TOOLCRAFT_MAX_EXPORT_PIXELS} total pixels.`,
        ok: false,
      };
}

export class ToolcraftSceneExportError extends Error {
  readonly feedback: ToolcraftSceneExportFailure;

  constructor(feedback: ToolcraftSceneExportFailure) {
    super(feedback.message);
    this.name = "ToolcraftSceneExportError";
    this.feedback = feedback;
  }
}
