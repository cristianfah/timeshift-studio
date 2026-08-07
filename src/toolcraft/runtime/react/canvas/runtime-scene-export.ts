import type { ToolcraftExportFrame } from "../../export/export-frame";
import type { ToolcraftRuntimeSceneVisibility } from "../../scene";
import type { ToolcraftCanvasFrame } from "../../state/canvas-frame";
import type { ToolcraftImageAsset, ToolcraftState } from "../../state/types";
import type { ToolcraftModelRenderHost } from "../model-rendering/model-render-binding";
import { renderToolcraftModelsToCanvas } from "../model-rendering/model-export";
import { getVisibleCanvasImageAssets } from "./canvas-default-media-layer";
import { normalizeCanvasMediaRotation } from "./canvas-media-transform";
import { getSceneElementPresentation } from "./scene-element-presentation-rect";

export type ToolcraftRuntimeSceneExportResult = Readonly<{
  imageCount: number;
  modelCount: number;
}>;

export type ToolcraftCanvasImageLoader = (
  asset: ToolcraftImageAsset,
) => Promise<CanvasImageSource>;

export type ToolcraftCanvasImageResourceResolver = (
  resourceRef: string,
  options: Readonly<{ signal: AbortSignal }>,
) => Promise<Uint8Array | null>;

function loadCanvasImageUrl(
  fileName: string,
  url: string,
): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not decode ${fileName}.`));
    image.src = url;
  });
}

async function loadCanvasImage(
  asset: ToolcraftImageAsset,
  resolveResource: ToolcraftCanvasImageResourceResolver,
): Promise<CanvasImageSource> {
  if (asset.lifecycle !== "ready") {
    throw new Error(`Could not load ${asset.fileName} for export.`);
  }

  const bytes = await resolveResource(asset.resourceRef, {
    signal: new AbortController().signal,
  });

  if (!bytes) {
    throw new Error(`Could not load ${asset.fileName} for export.`);
  }

  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], { type: asset.mimeType }),
  );

  try {
    return await loadCanvasImageUrl(asset.fileName, url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawImageAsset(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  asset: ToolcraftImageAsset & { size: NonNullable<ToolcraftImageAsset["size"]> },
  canvasFrame: ToolcraftCanvasFrame,
  exportFrame: ToolcraftExportFrame,
  output: Readonly<{ height: number; width: number }>,
): void {
  const presentation = getSceneElementPresentation(canvasFrame, asset);
  const rect = presentation.rect;
  const ratioX = output.width / exportFrame.width;
  const ratioY = output.height / exportFrame.height;
  const centerX = (rect.x + rect.width / 2 - exportFrame.x) * ratioX;
  const centerY = (rect.y + rect.height / 2 - exportFrame.y) * ratioY;
  const coverScale = presentation.fit === "cover"
    ? Math.max(rect.width / asset.size.width, rect.height / asset.size.height)
    : 1;
  const rotation = normalizeCanvasMediaRotation(asset.transform?.rotationDeg);
  const quarterTurnScale =
    presentation.fit === "cover" && (rotation === 90 || rotation === 270)
      ? Math.max(rect.width / rect.height, rect.height / rect.width)
      : 1;
  const width = asset.size.width * coverScale * ratioX;
  const height = asset.size.height * coverScale * ratioY;

  context.save();
  context.translate(centerX, centerY);
  if (presentation.fit === "cover") {
    context.beginPath();
    context.rect(
      (-rect.width / 2) * ratioX,
      (-rect.height / 2) * ratioY,
      rect.width * ratioX,
      rect.height * ratioY,
    );
    context.clip();
  }
  context.rotate((rotation * Math.PI) / 180);
  context.scale(
    (asset.transform?.flipHorizontal ? -1 : 1) * quarterTurnScale,
    (asset.transform?.flipVertical ? -1 : 1) * quarterTurnScale,
  );
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();
}

export async function renderToolcraftRuntimeSceneToCanvas({
  canvas,
  canvasFrame,
  exportFrame,
  host,
  loadImage,
  resolveImageResource,
  state,
  visibility,
}: Readonly<{
  canvas: HTMLCanvasElement;
  canvasFrame: ToolcraftCanvasFrame;
  exportFrame: ToolcraftExportFrame;
  host: ToolcraftModelRenderHost | null;
  loadImage?: ToolcraftCanvasImageLoader;
  resolveImageResource?: ToolcraftCanvasImageResourceResolver;
  state: ToolcraftState;
  visibility: ToolcraftRuntimeSceneVisibility;
}>): Promise<ToolcraftRuntimeSceneExportResult> {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Toolcraft scene export requires a 2D target canvas.");
  }

  const modelCount = await renderToolcraftModelsToCanvas(host, state, canvas, {
    canvasFrame,
    exportFrame,
    suppressedTargets: visibility.suppressedModelTargets,
  });
  const images = visibility.renderDefaultImages
    ? getVisibleCanvasImageAssets(state)
    : [];
  const imageLoader =
    loadImage ??
    (resolveImageResource
      ? (asset: ToolcraftImageAsset) =>
          loadCanvasImage(asset, resolveImageResource)
      : null);

  if (images.length > 0 && !imageLoader) {
    throw new Error("Toolcraft scene export cannot resolve image resources.");
  }

  if (imageLoader) {
    for (const asset of images) {
      drawImageAsset(
        context,
        await imageLoader(asset),
        asset,
        canvasFrame,
        exportFrame,
        canvas,
      );
    }
  }

  return { imageCount: images.length, modelCount };
}
