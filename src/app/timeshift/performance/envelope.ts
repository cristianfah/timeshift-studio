// Workload envelope: the numeric dimensions that decide how much work the
// engine does. Only four controls change the size of the work; every other
// control changes what the shader computes, not how much.

import type { ToolcraftWorkloadEnvelope } from "@/toolcraft/runtime";

import { targets } from "../targets";

export const PREVIEW_WIDTH_DIMENSION = "preview-width";
export const RING_DEPTH_DIMENSION = "ring-depth";
export const IMAGE_EXPORT_EDGE_DIMENSION = "image-export-edge";
export const VIDEO_EXPORT_EDGE_DIMENSION = "video-export-edge";

/** Long edge in pixels for each image export option. */
export const IMAGE_EXPORT_EDGES: Readonly<Record<string, number>> = {
  "2k": 2048,
  "4k": 4096,
  "8k": 8192,
};

/** Long edge in pixels for each video export option. */
export const VIDEO_EXPORT_EDGES: Readonly<Record<string, number>> = {
  "4k": 3840,
  // "Current" encodes at the imported source size; 1920 is the default canvas.
  current: 1920,
};

/** Ring buffer layers for each history option, at the engine's 30 fps. */
export const RING_DEPTHS: Readonly<Record<string, number>> = {
  "2": 60,
  "3": 90,
  "5": 150,
  "8": 240,
};

export const PREVIEW_WIDTHS: Readonly<Record<string, number>> = {
  "1280": 1280,
  "640": 640,
  "854": 854,
};

export const timeshiftWorkloadEnvelope: ToolcraftWorkloadEnvelope = {
  dimensions: [
    {
      defaultValue: 854,
      id: PREVIEW_WIDTH_DIMENSION,
      // Every shader pass runs once per pixel of the internal frame, and the
      // frame area grows with the square of its width at a fixed aspect.
      interactiveMax: 1280,
      mapping: "area",
      // The option values carry the domain, so the boundary comes from the
      // fixture adapter instead of a numeric schema range.
      source: { kind: "schema-target", target: targets.previewWidth },
      unit: "px",
    },
    {
      batchMax: 240,
      defaultValue: 90,
      id: RING_DEPTH_DIMENSION,
      // Layers of the frame ring: GPU memory, and how far back a pass may read.
      interactiveMax: 240,
      mapping: "direct",
      source: { kind: "schema-target", target: targets.bufferSeconds },
      unit: "frames",
    },
    {
      batchMax: 8192,
      defaultValue: 4096,
      id: IMAGE_EXPORT_EDGE_DIMENSION,
      mapping: "area",
      source: { kind: "schema-target", target: "export.image.resolution" },
      unit: "px",
    },
    {
      batchMax: 3840,
      defaultValue: 1920,
      id: VIDEO_EXPORT_EDGE_DIMENSION,
      mapping: "area",
      source: { kind: "schema-target", target: targets.exportVideoResolution },
      unit: "px",
    },
  ],
};
