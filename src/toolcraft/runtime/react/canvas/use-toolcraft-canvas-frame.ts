"use client";

import { getToolcraftCanvasFrame } from "../../state/canvas-frame";
import type { ToolcraftState } from "../../state/types";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";

const selectCanvas = (state: ToolcraftState) => state.canvas;

function canvasStatesEqual(
  previous: ToolcraftState["canvas"],
  next: ToolcraftState["canvas"],
): boolean {
  return previous.mode === next.mode && previous.size === next.size;
}

export function useToolcraftCanvasFrame() {
  return getToolcraftCanvasFrame(
    useToolcraftCommittedSelector(selectCanvas, canvasStatesEqual),
  );
}
