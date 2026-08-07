import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ToolcraftState } from "../state/types";
import type { ToolcraftExportFrame } from "./export-frame";
import {
  normalizeToolcraftExportError,
  ToolcraftArtifactExportError,
} from "./export-error";
import type { ToolcraftProductExportFrameRenderer } from "./product-export-renderer";

export type ToolcraftArtifactFrameRenderRequest = Readonly<{
  backgroundColor: string;
  canvas: HTMLCanvasElement;
  frame: ToolcraftExportFrame;
  includeBackground: boolean;
  pixelRatio: number;
  renderProductFrame: ToolcraftProductExportFrameRenderer | null;
  renderRuntimeScene: (
    canvas: HTMLCanvasElement,
    frame: ToolcraftExportFrame,
    state: ToolcraftState,
  ) => Promise<unknown>;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  state: ToolcraftState;
}>;

function getTimelineProgress(state: ToolcraftState): number {
  if (state.timeline.durationSeconds <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      state.timeline.currentTimeSeconds / state.timeline.durationSeconds,
    ),
  );
}

export async function renderToolcraftArtifactFrame(
  request: ToolcraftArtifactFrameRenderRequest,
): Promise<void> {
  const context = request.canvas.getContext("2d");
  if (!context) {
    throw new ToolcraftArtifactExportError({
      code: "canvas-context-unavailable",
      message: "Toolcraft export requires a 2D canvas context.",
    });
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, request.canvas.width, request.canvas.height);
  if (request.includeBackground) {
    context.fillStyle = request.backgroundColor;
    context.fillRect(0, 0, request.canvas.width, request.canvas.height);
  }

  try {
    await request.renderRuntimeScene(
      request.canvas,
      request.frame,
      request.state,
    );
  } catch (error) {
    throw normalizeToolcraftExportError(error, {
      code: "runtime-scene-render-failed",
      message: "Toolcraft could not render runtime scene layers for export.",
    });
  }

  if (!request.renderProductFrame) {
    return;
  }

  context.save();
  context.scale(request.pixelRatio, request.pixelRatio);
  context.translate(-request.frame.x, -request.frame.y);
  try {
    await request.renderProductFrame({
      context,
      frame: request.frame,
      pixelRatio: request.pixelRatio,
      rendererPipeline: request.rendererPipeline,
      state: request.state,
      timeSeconds: request.state.timeline.currentTimeSeconds,
      timelineProgress: getTimelineProgress(request.state),
    });
  } catch (error) {
    throw normalizeToolcraftExportError(error, {
      code: "product-frame-render-failed",
      message: "Toolcraft could not render product pixels for export.",
    });
  } finally {
    context.restore();
  }
}
