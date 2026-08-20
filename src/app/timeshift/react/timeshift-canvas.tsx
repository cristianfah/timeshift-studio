// Product output: the WebGL2 chain rendered over the loaded source.
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
import { ENGINE_FPS, isClipMuted } from "../engine/budget";
import { resolveClipWindow, toSourceTime, toTimelineTime } from "../engine/clip-window";
import { Engine } from "../engine/renderer";
import { supportsVideoFrameCallback } from "../engine/video";
import { registry } from "../effects/registry";
import { clipSourceRef, readClipSourceKind } from "./clip-source";
import type { ClipSource } from "./clip-source";
import { targets } from "../targets";
import type { ChainItem, EffectParamValues, RingBufferInfo } from "../types";
import { previewSourceSize, usePreviewSource } from "./use-preview-source";
import { useChain, useChainItems, useSelectedChainEntry, useSelectionSync } from "./use-chain";

const selectMediaAssets = (state: ToolcraftState): readonly ToolcraftMediaAsset[] =>
  state.mediaAssets;
const selectValues = (state: ToolcraftState): Record<string, unknown> =>
  state.values;
const selectTimeline = (state: ToolcraftState) => state.timeline;

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
    duration: timeline.durationSeconds,
    evaluated,
    isPlaying: timeline.isPlaying,
    time: timeline.currentTimeSeconds,
    values,
  });

  frameRef.current = {
    chainItems,
    duration: timeline.durationSeconds,
    evaluated,
    isPlaying: timeline.isPlaying,
    time: timeline.currentTimeSeconds,
    values,
  };

  // Read inside effects and the loop so neither has to depend on `values`.
  const getValues = React.useCallback(
    (): Record<string, unknown> => frameRef.current.values,
    [],
  );

  const clipSource = React.useMemo((): ClipSource | null => {
    const asset = mediaAssets.find(
      (candidate) => candidate.sourceTarget === targets.source,
    );
    const url = asset ? (mediaUrls.get(asset.id) ?? null) : null;

    return asset && url ? { kind: readClipSourceKind(asset), url } : null;
  }, [mediaAssets, mediaUrls]);

  // The export renderer runs outside React and needs the same source.
  clipSourceRef.current = clipSource;

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

  // ---- source loading ---------------------------------------------------
  const sourceRef = usePreviewSource({
    bufferSeconds: values[targets.bufferSeconds],
    clipSource,
    dispatch,
    engineRef,
    getValues,
    previewWidth: values[targets.previewWidth],
    stillMotion: values[targets.stillMotion],
    stillMotionAmount: values[targets.stillMotionAmount],
    trimIn: values[targets.trimIn],
    trimOut: values[targets.trimOut],
  });

  // ---- transport (clips only) -------------------------------------------
  // The element is created by the loading effect above, in this same commit,
  // so transport always reads it from the ref rather than from render output.
  const currentVideo = React.useCallback((): HTMLVideoElement | null => {
    const source = sourceRef.current;

    return source?.kind === "video" ? source.element : null;
  }, [sourceRef]);

  React.useEffect(() => {
    const video = currentVideo();

    if (video) {
      video.muted = isClipMuted(values);
    }
  }, [clipSource, currentVideo, values]);

  React.useEffect(() => {
    const video = currentVideo();

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
  }, [clipSource, currentVideo, timeline.isPlaying]);

  React.useEffect(() => {
    const video = currentVideo();

    if (!video || timeline.isPlaying) {
      return;
    }

    const target = toSourceTime(
      resolveClipWindow(values, video.duration || null),
      timeline.currentTimeSeconds,
    );

    if (Math.abs(video.currentTime - target) > 0.02) {
      video.currentTime = target;
    }
  }, [
    values,
    clipSource,
    currentVideo,
    timeline.currentTimeSeconds,
    timeline.isPlaying,
  ]);

  // ---- render loop ------------------------------------------------------
  React.useEffect(() => {
    let raf = 0;
    let lastReported = -1;

    const tick = (): void => {
      raf = requestAnimationFrame(tick);

      const engine = engineRef.current;
      const source = sourceRef.current;

      if (!engine || !source || !previewSourceSize(source)) {
        return;
      }

      const {
        chainItems: items,
        evaluated: evaluatedValues,
        values: stateValues,
      } = frameRef.current;

      // A clip carries its own clock; a still is driven by the timeline, which
      // is what makes the modulators animate over a photo. Effects always read
      // source time so preview and export resolve the same frame.
      const isVideo = source.kind === "video";
      const window = isVideo
        ? resolveClipWindow(stateValues, source.element.duration || null)
        : null;
      const time = isVideo ? source.element.currentTime : frameRef.current.time;
      const duration = window
        ? window.lengthSeconds
        : frameRef.current.duration || 1;

      // Playback loops inside the trimmed region instead of running to the
      // end of the source.
      if (
        window &&
        source.kind === "video" &&
        frameRef.current.isPlaying &&
        time >= window.inSeconds + window.lengthSeconds
      ) {
        source.element.currentTime = window.inSeconds;
      }

      if (isVideo && !supportsVideoFrameCallback() && frameRef.current.isPlaying) {
        engine.pushFrame(source.element);
      }

      const fps = ENGINE_FPS;
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
        duration,
        fps,
        params: paramsFor,
        time,
      });

      // Feed playback position back to the timeline, throttled to real change.
      // A still needs no feedback: the runtime timeline owns that clock.
      if (
        window &&
        frameRef.current.isPlaying &&
        Math.abs(time - lastReported) > 1 / 60
      ) {
        lastReported = time;
        dispatch({
          currentTimeSeconds: toTimelineTime(window, time),
          type: "timeline.setCurrentTime",
        });
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [dispatch, sourceRef]);

  return (
    <canvas
      className="h-full w-full object-contain"
      data-toolcraft-product-output="timeshift-preview"
      ref={canvasRef}
    />
  );
}
