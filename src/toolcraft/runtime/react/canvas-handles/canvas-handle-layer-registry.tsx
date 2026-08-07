"use client";

import * as React from "react";

import type { ToolcraftBuiltInControlType } from "../../contracts/component-contracts";
import { useToolcraftStore } from "../app-shell/toolcraft-store-context";

type ToolcraftCanvasHandleLayer = React.LazyExoticComponent<
  React.ComponentType<Record<string, never>>
>;

const LazyOrientationGizmoLayer = React.lazy(async () => {
  const module = await import("../orientation-gizmo/orientation-gizmo-layer");

  return { default: module.ToolcraftOrientationGizmoLayer };
});

export const TOOLCRAFT_CANVAS_HANDLE_LAYER_REGISTRY = {
  orientationGizmo: LazyOrientationGizmoLayer,
} as const satisfies Partial<
  Record<ToolcraftBuiltInControlType, ToolcraftCanvasHandleLayer>
>;

type RegisteredCanvasHandleType =
  keyof typeof TOOLCRAFT_CANVAS_HANDLE_LAYER_REGISTRY;

function isRegisteredCanvasHandleType(
  controlType: string,
): controlType is RegisteredCanvasHandleType {
  return controlType in TOOLCRAFT_CANVAS_HANDLE_LAYER_REGISTRY;
}

export function ToolcraftCanvasHandleLayers(): React.JSX.Element | null {
  const store = useToolcraftStore();
  const activeTypes = React.useMemo(
    () => [
      ...new Set(
        (store.getCommittedState().schema.panels.controls?.sections ?? [])
          .flatMap((section) => Object.values(section.controls))
          .map((control) => control.type)
          .filter(isRegisteredCanvasHandleType),
      ),
    ],
    [store],
  );

  if (activeTypes.length === 0) {
    return null;
  }

  return (
    <>
      {activeTypes.map((controlType) => {
        const Layer = TOOLCRAFT_CANVAS_HANDLE_LAYER_REGISTRY[controlType];

        return (
          <React.Suspense fallback={null} key={controlType}>
            <Layer />
          </React.Suspense>
        );
      })}
    </>
  );
}
