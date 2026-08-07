// Video source handling: file loading, metadata, fps estimation and a
// seek-stepper used for offline work (export, buffer priming).

import type { VideoSource } from "../types";

type VideoFrameMetadataLike = {
  mediaTime: number;
};

type VideoFrameCallbackHost = HTMLVideoElement & {
  requestVideoFrameCallback(
    callback: (now: number, metadata: VideoFrameMetadataLike) => void,
  ): number;
};

export function supportsVideoFrameCallback(): boolean {
  return (
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype
  );
}

export function asFrameCallbackHost(
  video: HTMLVideoElement,
): VideoFrameCallbackHost | null {
  return supportsVideoFrameCallback()
    ? (video as VideoFrameCallbackHost)
    : null;
}

/** Load a video File and resolve with element + metadata. */
export function loadVideoFile(file: File): Promise<VideoSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");

    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.crossOrigin = "anonymous";
    el.src = url;
    el.addEventListener(
      "loadedmetadata",
      () => {
        if (!el.videoWidth || !el.videoHeight || !isFinite(el.duration)) {
          reject(new Error("metadata"));
          return;
        }

        resolve({
          duration: el.duration,
          el,
          file,
          fps: 30, // provisional — refined by estimateFps() during playback
          fpsEstimated: false,
          height: el.videoHeight,
          name: file.name,
          url,
          width: el.videoWidth,
        });
      },
      { once: true },
    );
    el.addEventListener("error", () => reject(new Error("decode")), {
      once: true,
    });
  });
}

/**
 * Estimate the real frame rate by sampling requestVideoFrameCallback
 * mediaTime deltas while the video plays. Calls onDone(fps) once stable.
 */
export function estimateFps(
  video: HTMLVideoElement,
  onDone: (fps: number) => void,
  samples = 12,
): void {
  const host = asFrameCallbackHost(video);

  if (!host) {
    onDone(30);
    return;
  }

  const deltas: number[] = [];
  let last = -1;

  const tick = (_now: number, meta: VideoFrameMetadataLike): void => {
    if (last >= 0) {
      const d = meta.mediaTime - last;

      if (d > 0.001 && d < 0.5) {
        deltas.push(d);
      }
    }

    last = meta.mediaTime;

    if (deltas.length < samples) {
      host.requestVideoFrameCallback(tick);
      return;
    }

    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)] ?? 1 / 30;
    // Snap to common rates when close, otherwise use the raw estimate.
    const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
    const raw = 1 / median;
    const snapped = common.find((r) => Math.abs(r - raw) < 0.75);

    onDone(snapped ?? Math.round(raw * 100) / 100);
  };

  host.requestVideoFrameCallback(tick);
}

/**
 * SeekStepper — an off-DOM video element that can be stepped through frame
 * times sequentially via precise seeks. Used by the exporter (full-res,
 * streaming decode) and by buffer priming after a scrub.
 */
export class SeekStepper {
  readonly video: HTMLVideoElement;

  constructor(src: string) {
    this.video = document.createElement("video");
    this.video.preload = "auto";
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.src = src;
  }

  ready(): Promise<void> {
    if (this.video.readyState >= 1) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.video.addEventListener("loadedmetadata", () => resolve(), {
        once: true,
      });
      this.video.addEventListener("error", () => reject(new Error("decode")), {
        once: true,
      });
    });
  }

  /** Precise seek; resolves when the frame at `t` is ready to sample. */
  seek(t: number): Promise<void> {
    const v = this.video;
    const target = Math.max(0, Math.min(t, Math.max(0, v.duration - 0.0001)));

    if (Math.abs(v.currentTime - target) < 0.0001 && v.readyState >= 2) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(stuckSeekGuard);
        v.removeEventListener("seeked", onSeeked);
        v.removeEventListener("error", onError);
      };
      const onSeeked = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error("seek"));
      };
      const stuckSeekGuard = setTimeout(() => {
        cleanup();
        resolve();
      }, 2500);

      v.addEventListener("seeked", onSeeked, { once: true });
      v.addEventListener("error", onError, { once: true });
      v.currentTime = target;
    });
  }

  dispose(): void {
    this.video.removeAttribute("src");
    this.video.load();
  }
}
