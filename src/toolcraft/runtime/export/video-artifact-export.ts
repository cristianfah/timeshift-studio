import { getToolcraftRuntimeBackgroundColor } from "../state/canvas-background-state";
import {
  downloadToolcraftArtifact,
  type ToolcraftArtifactDownloadRequest,
  type ToolcraftArtifactDownloadResult,
} from "./artifact-download";
import type { ToolcraftArtifactExportRequest } from "./artifact-export-request";
import { resolveToolcraftVideoExportSettings } from "./artifact-export-settings";
import { renderToolcraftArtifactFrame } from "./artifact-frame-renderer";
import { resolveToolcraftVideoArtifactFrame } from "./artifact-scene-frame";
import { createToolcraftVideoArtifactFramePlan } from "./artifact-frame-state";
import {
  ToolcraftSceneExportError,
  validateToolcraftArtifactSize,
} from "./export-frame";
import {
  normalizeToolcraftExportError,
  ToolcraftArtifactExportError,
} from "./export-error";
import { getToolcraftVideoExportSize } from "./export-sizing";
import {
  createToolcraftVideoEncoderBackend,
  type ToolcraftVideoEncoderBackend,
  type ToolcraftVideoEncoderBackendFactory,
} from "./video-encoding-backend";
import { TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES } from "./video-encoding-policy";
import { createToolcraftVideoFrameSchedule } from "./video-frame-schedule";

export type ToolcraftVideoArtifactExportResult = Readonly<{
  byteLength: number;
  durationSeconds: number;
  extension: ".mp4" | ".webm";
  frameCount: number;
  height: number;
  mediaType: "video/mp4" | "video/webm";
  width: number;
}>;

export type ToolcraftVideoArtifactExportRequest = ToolcraftArtifactExportRequest &
  Readonly<{
    backendFactory?: ToolcraftVideoEncoderBackendFactory;
    canvasFactory?: () => HTMLCanvasElement;
    downloadArtifact?: (
      request: ToolcraftArtifactDownloadRequest,
    ) => ToolcraftArtifactDownloadResult;
    yieldToBrowser?: () => Promise<void>;
  }>;

async function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  if (scheduler?.yield) {
    await scheduler.yield();
    return;
  }

  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

export async function exportToolcraftVideoArtifact(
  request: ToolcraftVideoArtifactExportRequest,
): Promise<ToolcraftVideoArtifactExportResult> {
  const settings = resolveToolcraftVideoExportSettings(request.state);
  const durationSeconds = request.state.timeline.durationSeconds;
  const schedule = createToolcraftVideoFrameSchedule(durationSeconds);
  const framePlan = createToolcraftVideoArtifactFramePlan(request.state, schedule);
  const frame = resolveToolcraftVideoArtifactFrame({
    boundsProvider: request.boundsProvider,
    framePlan,
    productSceneRequired: request.productSceneRequired,
    visibility: request.visibility,
  });
  const size = getToolcraftVideoExportSize({
    frame,
    resolution: settings.resolution,
    state: request.state,
  });
  const sizeValidation = validateToolcraftArtifactSize(size);
  if (!sizeValidation.ok) {
    throw new ToolcraftSceneExportError(sizeValidation);
  }

  const canvas = (request.canvasFactory ?? (() => document.createElement("canvas")))();
  let backend: ToolcraftVideoEncoderBackend | null = null;
  let finalized = false;

  try {
    canvas.width = size.width;
    canvas.height = size.height;
    backend = await (request.backendFactory ??
      createToolcraftVideoEncoderBackend)({
      canvas,
      durationSeconds,
      height: size.height,
      requestedFormat: settings.format,
      width: size.width,
    });
    for (const entry of framePlan) {
      await renderToolcraftArtifactFrame({
        backgroundColor:
          getToolcraftRuntimeBackgroundColor(entry.state) ?? "#000000",
        canvas,
        frame,
        includeBackground: true,
        pixelRatio: size.pixelRatio,
        renderProductFrame: request.exportRenderer?.renderFrame ?? null,
        renderRuntimeScene: request.renderRuntimeScene,
        rendererPipeline: request.rendererPipeline,
        state: entry.state,
      });
      await backend.addFrame(
        entry.scheduleEntry.timeSeconds,
        entry.scheduleEntry.durationSeconds,
        entry.scheduleEntry.index === 0 || entry.scheduleEntry.index % 60 === 0,
      );
      request.reportProgress(
        ((entry.scheduleEntry.index + 1) / framePlan.length) * 0.95,
      );
      await (request.yieldToBrowser ?? yieldToBrowser)();
    }

    request.reportProgress(0.98);
    const blob = await backend.finalize();
    finalized = true;
    if (blob.size > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES) {
      throw new ToolcraftArtifactExportError({
        code: "video-artifact-too-large",
        message: "The encoded video exceeds Toolcraft's artifact limit.",
      });
    }
    (request.downloadArtifact ?? downloadToolcraftArtifact)({
      blob,
      extension: backend.extension,
      rawBaseFileName: request.exportRenderer?.baseFileName ?? "toolcraft-export",
    });
    request.reportProgress(1);

    return {
      byteLength: blob.size,
      durationSeconds,
      extension: backend.extension,
      frameCount: framePlan.length,
      height: size.height,
      mediaType: backend.mediaType,
      width: size.width,
    };
  } catch (error) {
    if (!finalized && backend) {
      try {
        await backend.cancel();
      } catch {
        // Preserve the actionable render/encode error.
      }
    }
    throw normalizeToolcraftExportError(error, {
      code: "video-encode-failed",
      message: "Toolcraft could not encode the video export.",
    });
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
