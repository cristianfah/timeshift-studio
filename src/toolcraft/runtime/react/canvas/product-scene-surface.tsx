"use client";

import * as React from "react";

import {
  resolveToolcraftProductSceneBounds,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftSceneRect,
} from "../../scene";
import type { ToolcraftCanvasFrame } from "../../state/canvas-frame";
import type { ToolcraftState } from "../../state/types";
import { useToolcraftCommittedSelector } from "../app-shell/toolcraft-selectors";

export type ToolcraftProductSceneFrame =
  | Readonly<{ kind: "finite" | "infinite"; rect: ToolcraftSceneRect }>
  | Readonly<{ kind: "empty" | "unavailable"; rect: null }>;

const ProductSceneFrameContext =
  React.createContext<ToolcraftProductSceneFrame | null>(null);
const ProductSceneBoundsContext =
  React.createContext<ToolcraftProductSceneBoundsProvider | undefined>(
    undefined,
  );

function resolveInfiniteProductFrame(
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined,
  state: ToolcraftState,
): ToolcraftProductSceneFrame {
  if (!boundsProvider) {
    return { kind: "unavailable", rect: null };
  }

  try {
    const result = resolveToolcraftProductSceneBounds(
      boundsProvider({ state }),
    );
    return result.ok
      ? { kind: "infinite", rect: result.bounds }
      : {
          kind:
            result.code === "empty-scene" ? "empty" : "unavailable",
          rect: null,
        };
  } catch {
    return { kind: "unavailable", rect: null };
  }
}

function productSceneFramesEqual(
  previous: ToolcraftProductSceneFrame,
  next: ToolcraftProductSceneFrame,
): boolean {
  if (previous.kind !== next.kind) return false;
  if (previous.rect === null || next.rect === null) return true;

  return (
    Object.is(previous.rect.height, next.rect.height) &&
    Object.is(previous.rect.width, next.rect.width) &&
    Object.is(previous.rect.x, next.rect.x) &&
    Object.is(previous.rect.y, next.rect.y)
  );
}

export function useToolcraftProductSceneFrame(): ToolcraftProductSceneFrame {
  const frame = React.useContext(ProductSceneFrameContext);
  if (!frame) {
    throw new Error(
      "useToolcraftProductSceneFrame must be used inside Toolcraft product scene content.",
    );
  }
  return frame;
}

export function ToolcraftProductSceneBoundsBoundary({
  boundsProvider,
  children,
}: Readonly<{
  boundsProvider?: ToolcraftProductSceneBoundsProvider;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <ProductSceneBoundsContext.Provider value={boundsProvider}>
      {children}
    </ProductSceneBoundsContext.Provider>
  );
}

export function ToolcraftProductSceneSurface({
  children,
  frame,
}: Readonly<{
  children: React.ReactNode;
  frame: ToolcraftCanvasFrame;
}>): React.JSX.Element {
  if (frame.kind === "finite") {
    const productFrame: ToolcraftProductSceneFrame = {
      kind: "finite",
      rect: {
        height: frame.size.height,
        width: frame.size.width,
        x: 0,
        y: 0,
      },
    };

    return (
      <ProductSceneFrameContext.Provider value={productFrame}>
        {children}
      </ProductSceneFrameContext.Provider>
    );
  }

  return <InfiniteProductSceneSurface>{children}</InfiniteProductSceneSurface>;
}

function InfiniteProductSceneSurface({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const boundsProvider = React.useContext(ProductSceneBoundsContext);
  const selectProductFrame = React.useCallback(
    (state: ToolcraftState) =>
      resolveInfiniteProductFrame(boundsProvider, state),
    [boundsProvider],
  );
  const productFrame = useToolcraftCommittedSelector(
    selectProductFrame,
    productSceneFramesEqual,
  );
  const readyRect =
    productFrame.kind === "infinite" ? productFrame.rect : null;

  return (
    <ProductSceneFrameContext.Provider value={productFrame}>
      <div
        className={readyRect ? "absolute" : "contents"}
        data-toolcraft-product-scene=""
        data-toolcraft-product-scene-status={
          readyRect ? "ready" : productFrame.kind
        }
        style={
          readyRect
            ? {
                height: readyRect.height,
                left: readyRect.x,
                top: readyRect.y,
                width: readyRect.width,
              }
            : undefined
        }
      >
        {children}
      </div>
    </ProductSceneFrameContext.Provider>
  );
}
