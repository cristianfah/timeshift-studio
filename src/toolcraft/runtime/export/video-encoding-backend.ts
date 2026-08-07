import type { ToolcraftVideoExportFormat } from "./artifact-export-settings";
import { ToolcraftArtifactExportError } from "./export-error";
import {
  TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES,
  resolveToolcraftVideoEncodingPolicy,
  type ToolcraftVideoCodec,
} from "./video-encoding-policy";

export type ToolcraftVideoEncoderBackend = Readonly<{
  addFrame: (
    timeSeconds: number,
    durationSeconds: number,
    keyFrame: boolean,
  ) => Promise<void>;
  cancel: () => Promise<void>;
  extension: ".mp4" | ".webm";
  finalize: () => Promise<Blob>;
  mediaType: "video/mp4" | "video/webm";
}>;

export type ToolcraftVideoEncoderBackendFactoryRequest = Readonly<{
  canvas: HTMLCanvasElement;
  durationSeconds: number;
  height: number;
  requestedFormat: ToolcraftVideoExportFormat;
  width: number;
}>;

export type ToolcraftVideoEncoderBackendFactory = (
  request: ToolcraftVideoEncoderBackendFactoryRequest,
) => Promise<ToolcraftVideoEncoderBackend>;

export async function createToolcraftVideoEncoderBackend(
  request: ToolcraftVideoEncoderBackendFactoryRequest,
): Promise<ToolcraftVideoEncoderBackend> {
  const mediabunny = await import("mediabunny");
  const codecs: readonly ToolcraftVideoCodec[] = ["avc", "vp9", "vp8"];
  const supportResults = await Promise.all(
    codecs.map((codec) =>
      mediabunny.canEncodeVideo(codec, {
        bitrate: 12_000_000,
        height: request.height,
        width: request.width,
      }),
    ),
  );
  const policy = resolveToolcraftVideoEncodingPolicy({
    durationSeconds: request.durationSeconds,
    height: request.height,
    requestedFormat: request.requestedFormat,
    support: {
      avc: supportResults[0] === true,
      vp8: supportResults[2] === true,
      vp9: supportResults[1] === true,
    },
    width: request.width,
  });
  const format =
    policy.mediaType === "video/mp4"
      ? new mediabunny.Mp4OutputFormat()
      : new mediabunny.WebMOutputFormat();
  const target = new mediabunny.BufferTarget();
  let overflowError: ToolcraftArtifactExportError | null = null;
  target.on("write", ({ end }) => {
    if (end > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES && !overflowError) {
      overflowError = new ToolcraftArtifactExportError({
        code: "video-artifact-too-large",
        message: "The encoded video exceeds Toolcraft's artifact limit.",
      });
    }
  });
  const output = new mediabunny.Output({ format, target });
  const source = new mediabunny.CanvasSource(request.canvas, {
    bitrate: policy.bitrate,
    codec: policy.codec,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: 30 });
  await output.start();
  let closed = false;
  let finalized = false;

  function closeSource(): void {
    if (!closed) {
      source.close();
      closed = true;
    }
  }

  return Object.freeze({
    addFrame: async (timeSeconds, durationSeconds, keyFrame) => {
      await source.add(timeSeconds, durationSeconds, { keyFrame });
      if (overflowError) throw overflowError;
    },
    cancel: async () => {
      if (finalized || output.state === "canceled") {
        return;
      }
      closeSource();
      await output.cancel();
    },
    extension: policy.extension,
    finalize: async () => {
      closeSource();
      await output.finalize();
      finalized = true;
      if (overflowError) throw overflowError;
      if (!target.buffer) {
        throw new ToolcraftArtifactExportError({
          code: "video-encode-failed",
          message: "Toolcraft video encoding produced no artifact.",
        });
      }
      if (target.buffer.byteLength > TOOLCRAFT_MAX_VIDEO_ARTIFACT_BYTES) {
        throw new ToolcraftArtifactExportError({
          code: "video-artifact-too-large",
          message: "The encoded video exceeds Toolcraft's artifact limit.",
        });
      }
      return new Blob([target.buffer], { type: policy.mediaType });
    },
    mediaType: policy.mediaType,
  });
}
