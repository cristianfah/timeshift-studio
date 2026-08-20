// Source loading for the preview engine: one decoded clip or one still image.
//
// A clip feeds the ring buffer frame by frame as it plays; a still fills the
// whole ring once and then never changes. Everything downstream — the chain,
// the modulators, the timeline — is identical, which is why both live behind
// the same `PreviewSource` union instead of two parallel canvases.

import * as React from "react";

import type { ToolcraftCommand } from "@/toolcraft/runtime";

import { ENGINE_FPS, isClipMuted, resolveEngineBudget } from "../engine/budget";
import { resolveClipWindow } from "../engine/clip-window";
import { Engine } from "../engine/renderer";
import { createStillPainterFromValues } from "../engine/still-history";
import { asFrameCallbackHost } from "../engine/video";
import { targets } from "../targets";
import type { ClipSource } from "./clip-source";
import type { RingBufferInfo } from "../types";

export type PreviewSource =
  | { element: HTMLImageElement; kind: "image" }
  | { element: HTMLVideoElement; kind: "video" };

export type PreviewSourceRef = React.MutableRefObject<PreviewSource | null>;

type Dispatch = (command: ToolcraftCommand) => void;
type GetValues = () => Record<string, unknown>;

type MountContext = {
  dispatch: Dispatch;
  engineRef: React.MutableRefObject<Engine | null>;
  getValues: GetValues;
  sourceRef: PreviewSourceRef;
  url: string;
};

/** Natural pixel size of the loaded source, or null while it is still loading. */
export function previewSourceSize(
  source: PreviewSource,
): { height: number; width: number } | null {
  const width =
    source.kind === "video"
      ? source.element.videoWidth
      : source.element.naturalWidth;
  const height =
    source.kind === "video"
      ? source.element.videoHeight
      : source.element.naturalHeight;

  return width > 0 && height > 0 ? { height, width } : null;
}

function configureEngine(
  engine: Engine,
  source: PreviewSource,
  values: Record<string, unknown>,
): RingBufferInfo | null {
  const size = previewSourceSize(source);

  if (!size) {
    return null;
  }

  const budget = resolveEngineBudget(values);

  const info = engine.configure({
    depth: budget.depth,
    srcHeight: size.height,
    srcWidth: size.width,
    targetWidth: budget.targetWidth,
  });

  // A reallocated ring is empty. A clip refills it as it plays; a still has to
  // be re-primed by hand or the canvas clears to black.
  if (source.kind === "image") {
    engine.fillHistory(
      createStillPainterFromValues(
        source.element,
        values,
        targets.stillMotion,
        targets.stillMotionAmount,
      ),
    );
  }

  return info;
}

function mountImage({
  dispatch,
  engineRef,
  getValues,
  sourceRef,
  url,
}: MountContext): () => void {
  const image = new Image();
  const source: PreviewSource = { element: image, kind: "image" };

  const handleLoad = (): void => {
    if (sourceRef.current !== source) {
      return;
    }

    const engine = engineRef.current;

    if (engine) {
      configureEngine(engine, source, getValues());
    }

    // `intrinsic-media` sizing: the imported still owns the output size, so
    // exports come out at the photo's own resolution.
    dispatch({
      size: { height: image.naturalHeight, unit: "px", width: image.naturalWidth },
      type: "canvas.setSize",
    });
    // A still has no duration of its own: the timeline keeps whatever loop
    // length the user set, and modulators animate the effects over it.
  };

  image.addEventListener("load", handleLoad, { once: true });
  image.src = url;
  sourceRef.current = source;

  return () => {
    image.removeEventListener("load", handleLoad);

    if (sourceRef.current === source) {
      sourceRef.current = null;
    }
  };
}

function mountVideo({
  dispatch,
  engineRef,
  getValues,
  sourceRef,
  url,
}: MountContext): () => void {
  const video = document.createElement("video");
  const source: PreviewSource = { element: video, kind: "video" };

  video.preload = "auto";
  video.muted = isClipMuted(getValues());
  video.playsInline = true;
  video.src = url;
  sourceRef.current = source;

  const handleMetadata = (): void => {
    const engine = engineRef.current;

    if (!engine || !video.videoWidth) {
      return;
    }

    const values = getValues();

    configureEngine(engine, source, values);
    // The timeline runs over the trimmed region, so its duration is the
    // region's length rather than the whole clip.
    dispatch({
      durationSeconds: resolveClipWindow(values, video.duration).lengthSeconds,
      type: "timeline.setDuration",
    });
    // `intrinsic-media` sizing expects the imported media to own the canvas
    // size, but the runtime only measures images. A clip has to report its
    // own dimensions or the output frame stays at the default size.
    dispatch({
      size: { height: video.videoHeight, unit: "px", width: video.videoWidth },
      type: "canvas.setSize",
    });
  };

  video.addEventListener("loadedmetadata", handleMetadata, { once: true });

  // A paused clip never fires rVFC, so the first frame has to be pushed by
  // hand — otherwise the ring stays empty and the canvas clears to black.
  const handleLoadedData = (): void => {
    handleMetadata();
    engineRef.current?.pushFrame(video);
  };

  video.addEventListener("loadeddata", handleLoadedData);

  const host = asFrameCallbackHost(video);

  if (host) {
    const pump = (): void => {
      if (sourceRef.current !== source) {
        return;
      }

      engineRef.current?.pushFrame(video);
      host.requestVideoFrameCallback(pump);
    };

    host.requestVideoFrameCallback(pump);
  }

  // A seek also delivers a frame; without rVFC this is the only signal.
  const handleSeeked = (): void => {
    engineRef.current?.pushFrame(video);
  };

  video.addEventListener("seeked", handleSeeked);

  return () => {
    video.removeEventListener("loadeddata", handleLoadedData);
    video.removeEventListener("seeked", handleSeeked);
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (sourceRef.current === source) {
      sourceRef.current = null;
    }
  };
}

/**
 * Loads the uploaded source into the engine and keeps it configured while the
 * engine budget changes. Returns the ref the render loop reads every frame.
 */
export function usePreviewSource({
  bufferSeconds,
  clipSource,
  dispatch,
  engineRef,
  getValues,
  previewWidth,
  stillMotion,
  stillMotionAmount,
  trimIn,
  trimOut,
}: {
  bufferSeconds: unknown;
  clipSource: ClipSource | null;
  dispatch: Dispatch;
  engineRef: React.MutableRefObject<Engine | null>;
  getValues: GetValues;
  previewWidth: unknown;
  stillMotion: unknown;
  stillMotionAmount: unknown;
  trimIn: unknown;
  trimOut: unknown;
}): PreviewSourceRef {
  const sourceRef = React.useRef<PreviewSource | null>(null);
  const kind = clipSource?.kind ?? null;
  const url = clipSource?.url ?? null;

  React.useEffect(() => {
    if (!url || !kind) {
      sourceRef.current = null;

      return undefined;
    }

    const context: MountContext = {
      dispatch,
      engineRef,
      getValues,
      sourceRef,
      url,
    };

    return kind === "image" ? mountImage(context) : mountVideo(context);
  }, [dispatch, engineRef, getValues, kind, url]);

  // The engine budget reallocates the ring; the still-motion controls only
  // repaint it. Both end in the same place, so one effect owns both.
  React.useEffect(() => {
    const engine = engineRef.current;
    const source = sourceRef.current;

    if (engine && source) {
      configureEngine(engine, source, getValues());
    }
  }, [
    bufferSeconds,
    engineRef,
    getValues,
    previewWidth,
    stillMotion,
    stillMotionAmount,
  ]);

  // Trimming republishes the timeline duration: the region is what the user
  // scrubs, loops and exports.
  React.useEffect(() => {
    const source = sourceRef.current;

    if (source?.kind !== "video" || !source.element.duration) {
      return;
    }

    const window = resolveClipWindow(getValues(), source.element.duration);

    dispatch({
      durationSeconds: window.lengthSeconds,
      type: "timeline.setDuration",
    });

    if (source.element.currentTime < window.inSeconds) {
      source.element.currentTime = window.inSeconds;
    }
  }, [clipSource, dispatch, getValues, trimIn, trimOut]);

  return sourceRef;
}
