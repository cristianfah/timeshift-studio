// Product output: the WebGL2 chain rendered over the loaded clip.
//
// The render loop lives in requestAnimationFrame outside React — the engine
// draws every frame, so a React render per frame would be pure overhead. State
// the loop needs is mirrored into a ref, which React updates as usual.

import * as React from "react";

import {
  useToolcraftDispatch,
  useToolcraftEvaluatedValues,
  useToolcraftMediaPresentationUrls,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";
import type { ToolcraftMediaAsset, ToolcraftState } from "@/toolcraft/runtime";

import { resolveSlotParams } from "../animation/resolve";
import { Engine } from "../engine/renderer";
import {
  asFrameCallbackHost,
  supportsVideoFrameCallback,
} from "../engine/video";
import { registry } from "../effects/registry";
import { clipUrlRef } from "./clip-url";
import { targets } from "../targets";
import type { ChainItem, EffectParamValues, RingBufferInfo } from "../types";
import { useChain, useChainItems, useSelectedChainEntry, useSelectionSync } from "./use-chain";

const selectMediaAssets = (state: ToolcraftState): readonly ToolcraftMediaAsset[] =>
  state.mediaAssets;
const selectValues = (state: ToolcraftState): Record<string, unknown> =>
  state.values;
const selectTimeline = (state: ToolcraftState) => state.timeline;

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;

  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export type TimeshiftEngineStatus = {
  buffer: RingBufferInfo | null;
  fps: number;
  ready: boolean;
};

export const TimeshiftEngineContext =
  React.createContext<TimeshiftEngineStatus | null>(null);

export function TimeshiftCanvas(): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engineRef = React.useRef<Engine | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const sideDataRef = React.useRef(new Map<string, ChainItem>());

  const dispatch = useToolcraftDispatch();
  const mediaAssets = useToolcraftSelector(selectMediaAssets);
  const values = useToolcraftSelector(selectValues);
  const timeline = useToolcraftSelector(selectTimeline);
  const mediaUrls = useToolcraftMediaPresentationUrls(mediaAssets);

  const chain = useChain();
  const selected = useSelectedChainEntry(chain);
  const chainItems = useChainItems(chain, sideDataRef);

  useSelectionSync(selected);

  const evaluated = useToolcraftEvaluatedValues(timeline.currentTimeSeconds);

  // Everything the rAF loop reads, refreshed on every React render.
  const frameRef = React.useRef({
    chainItems,
    evaluated,
    isPlaying: timeline.isPlaying,
    values,
  });

  frameRef.current = {
    chainItems,
    evaluated,
    isPlaying: timeline.isPlaying,
    values,
  };

  const clipUrl = React.useMemo(() => {
    const asset = mediaAssets.find(
      (candidate) => candidate.sourceTarget === targets.source,
    );

    return asset ? (mediaUrls.get(asset.id) ?? null) : null;
  }, [mediaAssets, mediaUrls]);

  // The export renderer runs outside React and needs the same clip.
  clipUrlRef.current = clipUrl;

  // ---- engine lifecycle -------------------------------------------------
  React.useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || engineRef.current) {
      return undefined;
    }

    try {
      engineRef.current = new Engine(canvas);
    } catch {
      // WebGL2 unavailable: the canvas stays blank and the app still loads.
      return undefined;
    }

    const engine = engineRef.current;

    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ---- clip loading -----------------------------------------------------
  React.useEffect(() => {
    if (!clipUrl) {
      videoRef.current = null;
      return undefined;
    }

    const video = document.createElement("video");

    video.preload = "auto";
    video.muted = values[targets.muted] !== false;
    video.playsInline = true;
    video.src = clipUrl;
    videoRef.current = video;

    const handleMetadata = (): void => {
      const engine = engineRef.current;

      if (!engine || !video.videoWidth) {
        return;
      }

      configureEngine(engine, video, frameRef.current.values);
      dispatch({
        durationSeconds: Math.max(0.1, video.duration),
        type: "timeline.setDuration",
      });
      // `intrinsic-media` sizing expects the imported media to own the canvas
      // size, but the runtime only measures images. A clip has to report its
      // own dimensions or the output frame stays at the default size.
      dispatch({
        size: {
          height: video.videoHeight,
          unit: "px",
          width: video.videoWidth,
        },
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
        if (videoRef.current !== video) {
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

      if (videoRef.current === video) {
        videoRef.current = null;
      }
    };
    // `values` is intentionally read through the ref inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipUrl, dispatch]);

  // ---- engine reconfiguration on budget changes -------------------------
  const previewWidth = values[targets.previewWidth];
  const bufferSeconds = values[targets.bufferSeconds];

  React.useEffect(() => {
    const engine = engineRef.current;
    const video = videoRef.current;

    if (engine && video?.videoWidth) {
      configureEngine(engine, video, frameRef.current.values);
    }
  }, [bufferSeconds, previewWidth]);

  React.useEffect(() => {
    const video = videoRef.current;

    if (video) {
      video.muted = values[targets.muted] !== false;
    }
  }, [values]);

  // ---- transport --------------------------------------------------------
  React.useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (timeline.isPlaying) {
      void video.play().catch(() => {
        // Autoplay policy: a user gesture always precedes playback here.
      });
    } else {
      video.pause();
    }
  }, [timeline.isPlaying]);

  React.useEffect(() => {
    const video = videoRef.current;

    if (!video || timeline.isPlaying) {
      return;
    }

    if (Math.abs(video.currentTime - timeline.currentTimeSeconds) > 0.02) {
      video.currentTime = timeline.currentTimeSeconds;
    }
  }, [timeline.currentTimeSeconds, timeline.isPlaying]);

  // ---- render loop ------------------------------------------------------
  React.useEffect(() => {
    let raf = 0;
    let lastReported = -1;

    const tick = (): void => {
      raf = requestAnimationFrame(tick);

      const engine = engineRef.current;
      const video = videoRef.current;

      if (!engine || !video || !video.videoWidth) {
        return;
      }

      const time = video.currentTime;
      const { chainItems: items, evaluated: evaluatedValues, values: stateValues } =
        frameRef.current;

      if (!supportsVideoFrameCallback() && frameRef.current.isPlaying) {
        engine.pushFrame(video);
      }

      const fps = 30;
      const paramsFor = (fx: ChainItem): EffectParamValues => {
        const slot = Number(fx.id.replace("slot-", ""));

        return resolveSlotParams({
          evaluated: (target) => evaluatedValues[target] ?? stateValues[target],
          raw: (target) => stateValues[target],
          slot,
          time,
          type: fx.type,
        });
      };

      engine.render(items, registry, {
        duration: video.duration || 1,
        fps,
        params: paramsFor,
        time,
      });

      // Feed playback position back to the timeline, throttled to real change.
      if (frameRef.current.isPlaying && Math.abs(time - lastReported) > 1 / 60) {
        lastReported = time;
        dispatch({
          currentTimeSeconds: time,
          type: "timeline.setCurrentTime",
        });
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [dispatch]);

  return (
    <canvas
      className="h-full w-full object-contain"
      data-toolcraft-product-output="timeshift-preview"
      ref={canvasRef}
    />
  );
}

function configureEngine(
  engine: Engine,
  video: HTMLVideoElement,
  values: Record<string, unknown>,
): RingBufferInfo {
  const fps = 30;
  const targetWidth = asNumber(values[targets.previewWidth], 854);
  const seconds = asNumber(values[targets.bufferSeconds], 3);

  return engine.configure({
    depth: Math.min(300, Math.max(8, Math.round(seconds * fps))),
    srcHeight: video.videoHeight,
    srcWidth: video.videoWidth,
    targetWidth,
  });
}
