import { describe, expect, it } from "vitest";

import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";

import { readClipSourceKind } from "./clip-source";

function asset(fileName: string, mimeType: string): ToolcraftMediaAsset {
  return {
    assetKind: "file",
    fileName,
    id: "asset-1",
    layerId: "layer-1",
    lifecycle: "ready",
    mimeType,
    position: { x: 0, y: 0 },
    resourceRef: "ref-1",
    sourceTarget: "clip.source",
  };
}

describe("clip source kind", () => {
  it("routes image MIME types to the still pipeline", () => {
    expect(readClipSourceKind(asset("foto.png", "image/png"))).toBe("image");
    expect(readClipSourceKind(asset("foto.webp", "image/webp"))).toBe("image");
  });

  it("routes video MIME types to the clip pipeline", () => {
    expect(readClipSourceKind(asset("toma.mp4", "video/mp4"))).toBe("video");
    expect(readClipSourceKind(asset("toma.webm", "video/webm"))).toBe("video");
  });

  it("falls back to the extension when the drop reports no MIME type", () => {
    expect(readClipSourceKind(asset("FOTO.JPG", "application/octet-stream"))).toBe(
      "image",
    );
    expect(readClipSourceKind(asset("toma.mov", "application/octet-stream"))).toBe(
      "video",
    );
  });
});
