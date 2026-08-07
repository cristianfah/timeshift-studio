"use client";

import * as React from "react";

import type { ToolcraftCanvasFrame } from "../../state/canvas-frame";

export function CanvasSceneSurface({
  children,
  frame,
}: {
  children: React.ReactNode;
  frame: ToolcraftCanvasFrame;
}): React.JSX.Element {
  if (frame.kind === "finite") {
    return (
      <div
        className="relative z-10 overflow-hidden"
        data-toolcraft-canvas-content=""
        data-toolcraft-canvas-mode="finite"
        data-toolcraft-editable-canvas=""
        style={{ height: frame.size.height, width: frame.size.width }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="relative z-10 overflow-visible"
      data-toolcraft-canvas-mode="infinite"
      data-toolcraft-infinite-scene=""
    >
      {children}
    </div>
  );
}

export function CanvasSceneSlot({
  children,
  frame,
}: {
  children: React.ReactNode;
  frame: ToolcraftCanvasFrame;
}): React.JSX.Element {
  return (
    <div
      className={frame.kind === "finite" ? "absolute inset-0 z-20" : "contents"}
      data-toolcraft-canvas-slot=""
    >
      {children}
    </div>
  );
}
