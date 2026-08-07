import {
  clampToolcraftCanvasZoom,
  toolcraftCanvasZoomDefault,
  toolcraftCanvasZoomStep,
} from "./canvas-zoom";
import { normalizeToolcraftCanvasModeForBackground } from "./canvas-background-state";
import { commitToolcraftStatePatch } from "./history-patches";
import { tagToolcraftCanvasStateHistoryPatch } from "./history-patch-metadata";
import {
  asToolcraftCanvasSizeDimension,
  getToolcraftCanvasAspectRatioFromSize,
  normalizeToolcraftCanvasAspectRatioValue,
  toolcraftCanvasAspectRatioTarget,
  toolcraftCanvasSizeHeightTarget,
  toolcraftCanvasSizeWidthTarget,
} from "./canvas-state";
import type {
  ToolcraftCommand,
  ToolcraftState,
} from "./types";

type ToolcraftCanvasCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "canvas.center"
      | "canvas.applySettings"
      | "canvas.panBy"
      | "canvas.setOffset"
      | "canvas.setSize"
      | "canvas.setViewport"
      | "canvas.zoomIn"
      | "canvas.zoomOut"
      | "canvas.zoomReset";
  }
>;

export function reduceToolcraftCanvasCommand(
  state: ToolcraftState,
  command: ToolcraftCanvasCommand,
): ToolcraftState {
  switch (command.type) {
    case "canvas.applySettings": {
      const width = asToolcraftCanvasSizeDimension(command.size.width);
      const height = asToolcraftCanvasSizeDimension(command.size.height);

      if (width === null || height === null) {
        return state;
      }

      const size = { height, unit: "px" as const, width };
      const aspectRatio = command.aspectRatio === undefined
        ? getToolcraftCanvasAspectRatioFromSize(size)
        : normalizeToolcraftCanvasAspectRatioValue(command.aspectRatio, size);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const mode = normalizeToolcraftCanvasModeForBackground({
        mode: command.mode,
        schema: state.schema,
        values: state.values,
      });

      if (state.canvas.mode !== mode) {
        before["canvas.mode"] = state.canvas.mode;
        after["canvas.mode"] = mode;
      }

      if (
        state.canvas.mode === "infinite" &&
        mode === "finite" &&
        (state.canvas.offset.x !== 0 || state.canvas.offset.y !== 0)
      ) {
        before["canvas.offset"] = state.canvas.offset;
        after["canvas.offset"] = { x: 0, y: 0 };
      }

      if (
        state.canvas.size.width !== size.width ||
        state.canvas.size.height !== size.height
      ) {
        before["canvas.size"] = state.canvas.size;
        after["canvas.size"] = size;
      }

      for (const [target, value] of [
        [toolcraftCanvasAspectRatioTarget, aspectRatio],
        [toolcraftCanvasSizeWidthTarget, size.width],
        [toolcraftCanvasSizeHeightTarget, size.height],
      ] as const) {
        if (
          (target in state.values || target in state.defaults) &&
          !Object.is(state.values[target], value)
        ) {
          before[target] = state.values[target];
          after[target] = value;
        }
      }

      if (Object.keys(after).length === 0) {
        return state;
      }

      return commitToolcraftStatePatch(
        state,
        tagToolcraftCanvasStateHistoryPatch({
          after,
          before,
          label: command.label ?? "Import settings",
        }),
        { group: command.historyGroup, mode: command.history },
      );
    }

    case "canvas.setOffset":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          offset: command.offset,
        },
      };

    case "canvas.panBy":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          offset: {
            x: state.canvas.offset.x + command.delta.x,
            y: state.canvas.offset.y + command.delta.y,
          },
        },
      };

    case "canvas.setSize":
      return commitToolcraftStatePatch(
        state,
        tagToolcraftCanvasStateHistoryPatch({
          after: { "canvas.size": command.size },
          before: { "canvas.size": state.canvas.size },
          label: "Resize canvas",
        }),
      );

    case "canvas.center":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          offset: { x: 0, y: 0 },
        },
      };

    case "canvas.zoomIn":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          zoom: clampToolcraftCanvasZoom(state.canvas.zoom + toolcraftCanvasZoomStep),
        },
      };

    case "canvas.zoomOut":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          zoom: clampToolcraftCanvasZoom(state.canvas.zoom - toolcraftCanvasZoomStep),
        },
      };

    case "canvas.zoomReset":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          zoom: toolcraftCanvasZoomDefault,
        },
      };

    case "canvas.setViewport":
      return {
        ...state,
        canvas: {
          ...state.canvas,
          offset: command.offset,
          zoom: clampToolcraftCanvasZoom(command.zoom),
        },
      };
  }
}
