import {
  resolveToolcraftExportFrame,
  ToolcraftSceneExportError,
  type ToolcraftExportFrame,
} from "../../export/export-frame";
import { getToolcraftCanvasFrame, type ToolcraftCanvasFrame } from "../../state/canvas-frame";
import type { ToolcraftState } from "../../state/types";
import { getSceneElementPresentationRect } from "../canvas/scene-element-presentation-rect";
import type { ToolcraftModelRenderHost } from "./model-render-binding";
import { getToolcraftVisibleModelExportRequests } from "./model-render-state";

export type ToolcraftRenderModelsToCanvas = (
  canvas: HTMLCanvasElement,
) => Promise<number>;

export type ToolcraftModelExportOptions = Readonly<{
  canvasFrame: ToolcraftCanvasFrame;
  exportFrame: ToolcraftExportFrame;
  suppressedTargets?: readonly string[];
}>;

function resolveModelExportOptions(
  state: ToolcraftState,
  options: ToolcraftModelExportOptions | undefined,
): ToolcraftModelExportOptions {
  if (options) return options;
  const result = resolveToolcraftExportFrame(state, null);
  if (!result.ok) throw new ToolcraftSceneExportError(result);
  return {
    canvasFrame: getToolcraftCanvasFrame(state.canvas),
    exportFrame: result.frame,
  };
}

function exportPixelRatios(
  frame: ToolcraftExportFrame,
  canvas: HTMLCanvasElement,
): Readonly<{ height: number; pixelRatio: number; width: number }> {
  const width = canvas.width / frame.width;
  const height = canvas.height / frame.height;
  const pixelRatio = Math.min(width, height);
  return Number.isFinite(pixelRatio) && pixelRatio > 0
    ? { height, pixelRatio, width }
    : { height: 1, pixelRatio: 1, width: 1 };
}

export async function renderToolcraftModelsToCanvas(
  host: ToolcraftModelRenderHost | null,
  state: ToolcraftState,
  canvas: HTMLCanvasElement,
  options?: ToolcraftModelExportOptions,
): Promise<number> {
  if (!host) return 0;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Toolcraft model export requires a 2D target canvas.");
  }
  const resolved = resolveModelExportOptions(state, options);
  const ratios = exportPixelRatios(resolved.exportFrame, canvas);
  const requests = getToolcraftVisibleModelExportRequests(state, {
    suppressedTargets: resolved.suppressedTargets,
    viewportForAsset: (asset) => {
      const rect = getSceneElementPresentationRect(resolved.canvasFrame, asset);
      return { height: rect.height, width: rect.width };
    },
  });

  for (const request of requests) {
    const rect = getSceneElementPresentationRect(
      resolved.canvasFrame,
      request.asset,
    );
    await host.renderExport(request, {
      height: rect.height,
      onRendered: (source) => {
        context.drawImage(
          source,
          (rect.x - resolved.exportFrame.x) * ratios.width,
          (rect.y - resolved.exportFrame.y) * ratios.height,
          rect.width * ratios.width,
          rect.height * ratios.height,
        );
      },
      pixelRatio: ratios.pixelRatio,
      width: rect.width,
    });
  }

  return requests.length;
}
