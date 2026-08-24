// The current source (video clip or still image), shared between the preview
// renderer (which owns the object URL) and the export renderer, which the
// runtime calls outside React.

import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";

/** A still image runs the same chain as a clip; only the frame feed differs. */
export type ClipSourceKind = "image" | "video";

export type ClipSource = {
  kind: ClipSourceKind;
  url: string;
};

export const clipSourceRef: { current: ClipSource | null } = { current: null };

const IMAGE_EXTENSIONS = [
  ".apng",
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
];

/**
 * The uploader admits both kinds, so the asset itself decides which feed the
 * engine gets. `file` assets carry the browser MIME type; the extension is the
 * fallback for the rare drop that reports an empty type.
 */
export function readClipSourceKind(asset: ToolcraftMediaAsset): ClipSourceKind {
  if (asset.assetKind === "image" || asset.mimeType.startsWith("image/")) {
    return "image";
  }

  if (asset.mimeType.startsWith("video/")) {
    return "video";
  }

  const fileName = asset.fileName.toLowerCase();

  return IMAGE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
    ? "image"
    : "video";
}
