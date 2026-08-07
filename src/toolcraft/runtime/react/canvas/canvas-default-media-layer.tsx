"use client";

import * as React from "react";

import type {
  ToolcraftCommand,
  ToolcraftImageAsset,
  ToolcraftMediaAsset,
  ToolcraftState,
} from "../../state/types";
import type { ToolcraftCanvasFrame } from "../../state/canvas-frame";
import { getCanvasMediaTransformStyle } from "./canvas-media-transform";
import { getSceneElementPresentationRect } from "./scene-element-presentation-rect";
import { isToolcraftLayerVisibleInTree } from "../layers/layer-tree";
import { useToolcraftMediaPresentationUrls } from "../app-shell/toolcraft-source-asset-context";

type ToolcraftCanvasImageAsset = ToolcraftImageAsset & {
  size: NonNullable<ToolcraftImageAsset["size"]>;
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function isDefaultCanvasImageAsset(
  state: ToolcraftState,
  mediaAsset: ToolcraftMediaAsset,
): mediaAsset is ToolcraftCanvasImageAsset {
  return (
    mediaAsset.assetKind === "image" &&
    mediaAsset.lifecycle !== "unavailable" &&
    mediaAsset.size !== undefined &&
    isToolcraftLayerVisibleInTree(state.layers, mediaAsset.layerId)
  );
}

export function getVisibleCanvasImageAssets(
  state: ToolcraftState,
): ToolcraftCanvasImageAsset[] {
  return state.mediaAssets.filter((mediaAsset) =>
    isDefaultCanvasImageAsset(state, mediaAsset),
  );
}

export function CanvasDefaultMediaLayer({
  canvasFrame,
  dispatch,
  mediaAsset,
  selected,
}: {
  canvasFrame: ToolcraftCanvasFrame;
  dispatch: React.Dispatch<ToolcraftCommand>;
  mediaAsset: ToolcraftCanvasImageAsset;
  selected: boolean;
}): React.JSX.Element {
  const presentationRect = getSceneElementPresentationRect(
    canvasFrame,
    mediaAsset,
  );
  const infinite = canvasFrame.kind === "infinite";
  const mediaAssets = React.useMemo(() => [mediaAsset], [mediaAsset]);
  const previewSrc = useToolcraftMediaPresentationUrls(mediaAssets).get(
    mediaAsset.id,
  );

  return (
    <button
      aria-label={`Select ${mediaAsset.fileName}`}
      className={cn(
        "absolute block cursor-pointer rounded-none border bg-[color:color-mix(in_oklab,var(--background)_84%,transparent)] p-0 shadow-sm transition-[border-color,box-shadow] duration-150 ease-out",
        infinite ? "overflow-visible" : "inset-0 overflow-hidden",
        selected
          ? "border-[color:var(--link)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--link)_48%,transparent)]"
          : "border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_24%,transparent)]",
      )}
      data-canvas-media-layer={mediaAsset.layerId}
      onClick={(event) => {
        event.stopPropagation();
        dispatch({
          layerId: mediaAsset.layerId,
          type: "layers.select",
        });
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={infinite
        ? {
            height: presentationRect.height,
            left: presentationRect.x,
            top: presentationRect.y,
            width: presentationRect.width,
            ...getCanvasMediaTransformStyle(
              mediaAsset.transform,
              mediaAsset.size,
              "element",
            ),
          }
        : undefined}
      type="button"
    >
      {previewSrc ? (
        <img
          alt={mediaAsset.fileName}
          className="block size-full select-none object-cover"
          data-toolcraft-generated-output=""
          draggable={false}
          src={previewSrc}
          style={
            infinite
              ? undefined
              : getCanvasMediaTransformStyle(
                  mediaAsset.transform,
                  canvasFrame.size,
                )
          }
        />
      ) : null}
    </button>
  );
}
