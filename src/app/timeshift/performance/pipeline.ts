// Render plan: what the engine does per frame, what forces a pass to run
// again, and which workload dimensions decide its cost.
//
// The engine is one WebGL2 context with a frame ring and a ping-pong chain
// (`engine/renderer.ts`); export runs the same passes on a second context at
// output resolution (`react/export-renderer.ts`). The registration below binds
// each declared pass to the resource it actually retains, so the plan cannot
// drift away from the code that owns those resources.
//
// Playback is deliberately absent from `interactionInvalidation`: the chain
// does not run again because playback invalidated a cache, it runs once per
// frame by construction, which is what `cost.frequency: "frame"` declares.

import { registerToolcraftRendererPipeline } from "@/toolcraft/runtime";

import type { Engine } from "../engine/renderer";
import type { FrameRing } from "../engine/ringbuffer";
import { targets } from "../targets";
import {
  IMAGE_EXPORT_EDGE_DIMENSION,
  PREVIEW_WIDTH_DIMENSION,
  RING_DEPTH_DIMENSION,
  VIDEO_EXPORT_EDGE_DIMENSION,
} from "./envelope";

type TimeshiftPipelineContracts = {
  "canvas-composite": {
    resource: never;
    resourceKey: never;
    result: HTMLCanvasElement;
  };
  "chain-pass": {
    resource: Engine;
    resourceKey: readonly [string, number, number];
    result: WebGLTexture | null;
  };
  "export-frame": {
    resource: Engine;
    resourceKey: readonly [string, number, number];
    result: HTMLCanvasElement;
  };
  "frame-upload": {
    resource: FrameRing;
    resourceKey: readonly [string, number, number];
    result: number;
  };
};

export const timeshiftRendererPipeline =
  registerToolcraftRendererPipeline<TimeshiftPipelineContracts>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: ["frame-upload", "chain-pass", "canvas-composite"],
        targets: [targets.source],
      },
      {
        interaction: "media-import",
        invalidates: ["frame-upload", "chain-pass", "canvas-composite"],
        targets: [
          targets.source,
          targets.stillMotion,
          targets.stillMotionAmount,
        ],
      },
      {
        // Reallocating the ring is the one control change that throws away the
        // retained source resource.
        interaction: "control-change",
        invalidates: ["frame-upload", "chain-pass", "canvas-composite"],
        targets: [targets.previewWidth, targets.bufferSeconds],
      },
      {
        // Effect parameters only change uniforms: the ring survives the drag.
        interaction: "control-drag",
        invalidates: ["chain-pass", "canvas-composite"],
        mustNotInvalidate: ["frame-upload"],
        targets: [targets.trimIn, targets.trimOut],
      },
      {
        interaction: "export",
        invalidates: ["export-frame"],
        mustNotInvalidate: ["chain-pass", "canvas-composite", "frame-upload"],
        targets: ["panel.actions"],
      },
    ],
    passes: [
      {
        // Scales the current source frame and uploads it as the ring head.
        cacheKey: [targets.source, targets.previewWidth, targets.bufferSeconds],
        cost: {
          dimensions: [PREVIEW_WIDTH_DIMENSION],
          frequency: "frame",
          relationship: "quadratic",
        },
        id: "frame-upload",
        inputs: [targets.source],
        invalidatedBy: [
          targets.source,
          targets.previewWidth,
          targets.bufferSeconds,
        ],
        kind: "pixel-transform",
        lifecycle: { cache: "retained-resource", resourceScope: "source" },
        output: "source",
        quality: "preview",
        runsOn: "main",
      },
      {
        // One full-screen shader pass per enabled effect, sampling the ring.
        cacheKey: ["chain.order", targets.previewWidth, targets.bufferSeconds],
        cost: {
          dimensions: [PREVIEW_WIDTH_DIMENSION, RING_DEPTH_DIMENSION],
          frequency: "frame",
          relationship: "product",
        },
        id: "chain-pass",
        inputs: ["frame-upload"],
        invalidatedBy: [
          "chain.order",
          targets.previewWidth,
          targets.bufferSeconds,
        ],
        kind: "pixel-transform",
        lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        output: "intermediate",
        quality: "preview",
        runsOn: "gpu",
      },
      {
        cost: {
          dimensions: [PREVIEW_WIDTH_DIMENSION],
          frequency: "frame",
          relationship: "linear",
        },
        id: "canvas-composite",
        inputs: ["chain-pass"],
        invalidatedBy: ["chain-pass"],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "preview",
        runsOn: "gpu",
      },
      {
        // A second engine at output resolution, primed with real history.
        cacheKey: [
          targets.source,
          "export.image.resolution",
          targets.exportVideoResolution,
        ],
        cost: {
          dimensions: [
            IMAGE_EXPORT_EDGE_DIMENSION,
            VIDEO_EXPORT_EDGE_DIMENSION,
            RING_DEPTH_DIMENSION,
          ],
          frequency: "batch",
          relationship: "product",
        },
        id: "export-frame",
        inputs: [targets.source],
        invalidatedBy: [
          "export.image.resolution",
          targets.exportVideoResolution,
          targets.source,
        ],
        kind: "export",
        lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        output: "export",
        quality: "export",
        runsOn: "export-only",
      },
    ],
    runtimeId: "timeshift-webgl2-chain",
  });
