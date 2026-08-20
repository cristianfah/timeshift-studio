// Product export: renders the chain at full source resolution for one frame.
//
// The runtime owns encoding and download (PNG and video alike); this only has
// to paint the requested time into a 2D context. A dedicated engine keeps
// export completely independent from the preview: for a clip a SeekStepper
// primes the export ring with the real frames preceding the requested time, so
// temporal effects see true history instead of whatever the preview happened
// to hold. A still has no history to seek, so its ring is filled once with the
// decoded image and every exported frame reuses it.

import type {
  ToolcraftProductExportFrameContext,
  ToolcraftProductExportRenderer,
  ToolcraftState,
} from "@/toolcraft/runtime";

import { resolveSlotParams } from "../animation/resolve";
import { ENGINE_FPS } from "../engine/budget";
import { resolveClipWindow, toSourceTime } from "../engine/clip-window";
import { chainMaxReach, registry } from "../effects/registry";
import { Engine } from "../engine/renderer";
import { createStillPainterFromValues } from "../engine/still-history";
import { SeekStepper } from "../engine/video";
import {
  CHAIN_SLOTS,
  slotEnabledTarget,
  slotTypeTarget,
  targets,
} from "../targets";
import type { ClipSource } from "./clip-source";
import type { ChainItem, EffectParamValues } from "../types";

type ExportSession = {
  canvas: HTMLCanvasElement;
  engine: Engine;
  /** Source duration of the clip, needed to resolve the trimmed region. */
  duration: number;
  headTime: number;
  height: number;
  /** Only a clip owns a stepper; a still is already fully decoded. */
  stepper: SeekStepper | null;
  /** Invented-past settings baked into a still's ring, empty for a clip. */
  stillKey: string;
  url: string;
  width: number;
};

function readStillKey(source: ClipSource, state: ToolcraftState): string {
  return source.kind === "image"
    ? `${String(state.values[targets.stillMotion])}:${String(
        state.values[targets.stillMotionAmount],
      )}`
    : "";
}

let session: ExportSession | null = null;

function disposeSession(): void {
  session?.engine.dispose();
  session?.stepper?.dispose();
  session = null;
}

function chainFromState(state: ToolcraftState): ChainItem[] {
  const order = readOrder(state);

  return order.flatMap((slot) => {
    const type = state.values[slotTypeTarget(slot)];

    if (typeof type !== "string" || !registry[type]) {
      return [];
    }

    return [
      {
        enabled: state.values[slotEnabledTarget(slot)] !== false,
        id: `slot-${slot}`,
        type,
      },
    ];
  });
}

function readOrder(state: ToolcraftState): number[] {
  const raw = state.values["chain.order"];

  if (typeof raw !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (n): n is number =>
            typeof n === "number" && Number.isInteger(n) && n >= 0 && n < CHAIN_SLOTS,
        )
      : [];
  } catch {
    return [];
  }
}

function paramsResolver(
  state: ToolcraftState,
  time: number,
): (fx: ChainItem) => EffectParamValues {
  return (fx) =>
    resolveSlotParams({
      // Export reads plain values: the runtime hands us the state already
      // evaluated at the requested time.
      evaluated: (target) => state.values[target],
      raw: (target) => state.values[target],
      slot: Number(fx.id.replace("slot-", "")),
      time,
      type: fx.type,
    });
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("decode")), {
      once: true,
    });
    image.src = url;
  });
}

/**
 * One engine per source and output size. The size is part of the identity
 * because the ring is allocated at export resolution: switching 2K to 8K
 * between exports has to reallocate instead of upscaling stale layers.
 */
async function ensureSession(
  source: ClipSource,
  state: ToolcraftState,
  width: number,
  height: number,
  depth: number,
): Promise<ExportSession> {
  const stillKey = readStillKey(source, state);

  if (
    session &&
    session.url === source.url &&
    session.width === width &&
    session.height === height &&
    session.stillKey === stillKey
  ) {
    return session;
  }

  disposeSession();

  const canvas = document.createElement("canvas");
  const engine = new Engine(canvas, { preserveDrawingBuffer: true });
  const stepper = source.kind === "video" ? new SeekStepper(source.url) : null;

  await stepper?.ready();
  engine.configure({
    depth,
    srcHeight: height,
    srcWidth: width,
    targetWidth: width,
  });

  if (source.kind === "image") {
    // Same invented past as the preview, at export resolution.
    engine.fillHistory(
      createStillPainterFromValues(
        await decodeImage(source.url),
        state.values,
        targets.stillMotion,
        targets.stillMotionAmount,
      ),
    );
  }

  session = {
    canvas,
    duration: stepper?.video.duration ?? 0,
    engine,
    headTime: Number.NaN,
    height,
    stepper,
    stillKey,
    url: source.url,
    width,
  };

  return session;
}

/** Decode the frames the requested time needs that the ring does not hold. */
async function primeClipHistory(
  active: ExportSession,
  stepper: SeekStepper,
  fps: number,
  reach: number,
  timeSeconds: number,
): Promise<void> {
  // Sequential export: the previous frame already primed the ring, so only
  // the frames actually missing are decoded again.
  const step = 1 / fps;
  const behind = timeSeconds - active.headTime;
  const rebuild =
    !Number.isFinite(active.headTime) || behind < 0 || behind > step * 2;
  const firstMissing = rebuild ? Math.min(reach, Math.floor(timeSeconds * fps)) : 0;

  if (rebuild) {
    active.engine.resetHistory();
  }

  for (let i = firstMissing; i >= 0; i -= 1) {
    const frameTime = Math.max(0, timeSeconds - i * step);

    await stepper.seek(frameTime);
    active.engine.pushFrame(stepper.video);
  }

  active.headTime = timeSeconds;
}

export function createExportRenderer(
  getSource: () => ClipSource | null,
): ToolcraftProductExportRenderer {
  return {
    baseFileName: "timeshift",

    async renderFrame({
      context,
      frame,
      state,
      timeSeconds,
    }: ToolcraftProductExportFrameContext): Promise<void> {
      const source = getSource();

      if (!source) {
        return;
      }

      const chain = chainFromState(state);
      const fps = ENGINE_FPS;
      const duration = state.timeline.durationSeconds || 1;
      const reach = chainMaxReach(
        chain,
        { duration, fps },
        (fx, time) => paramsResolver(state, time)(fx),
      );
      const active = await ensureSession(
        source,
        state,
        Math.max(2, Math.round(frame.width)),
        Math.max(2, Math.round(frame.height)),
        Math.max(8, Math.min(300, reach + 2)),
      );

      // The runtime schedules frames over the timeline, which spans the
      // trimmed region; the clip itself is read at source time.
      const sourceTime = active.stepper
        ? toSourceTime(
            resolveClipWindow(state.values, active.duration || null),
            timeSeconds,
          )
        : timeSeconds;

      if (active.stepper) {
        await primeClipHistory(active, active.stepper, fps, reach, sourceTime);
      }

      active.engine.render(chain, registry, {
        duration,
        fps,
        params: paramsResolver(state, sourceTime),
        time: sourceTime,
      });

      context.drawImage(
        active.engine.canvas,
        0,
        0,
        Math.max(1, Math.round(frame.width)),
        Math.max(1, Math.round(frame.height)),
      );
    },
  };
}

export function disposeExportSession(): void {
  disposeSession();
}

export { targets };
