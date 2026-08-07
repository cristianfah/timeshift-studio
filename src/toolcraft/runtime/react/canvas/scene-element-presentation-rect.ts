import type { ToolcraftCanvasFrame } from "../../state/canvas-frame";
import type { ToolcraftSceneElementFrame } from "../../state/types";
import {
  getToolcraftSceneElementRect,
  type ToolcraftSceneRect,
} from "../../scene";

export type ToolcraftSceneElementPresentation = Readonly<{
  fit: "cover" | "element";
  rect: ToolcraftSceneRect;
}>;

export function getSceneElementPresentation(
  canvas: ToolcraftCanvasFrame,
  element: ToolcraftSceneElementFrame,
): ToolcraftSceneElementPresentation {
  return canvas.kind === "finite"
    ? {
        fit: "cover",
        rect: {
          height: canvas.size.height,
          width: canvas.size.width,
          x: 0,
          y: 0,
        },
      }
    : { fit: "element", rect: getToolcraftSceneElementRect(element) };
}

export function getSceneElementPresentationRect(
  canvas: ToolcraftCanvasFrame,
  element: ToolcraftSceneElementFrame,
): ToolcraftSceneRect {
  return getSceneElementPresentation(canvas, element).rect;
}
