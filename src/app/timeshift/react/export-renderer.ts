// Product export: renders the chain at full source resolution for one frame.
//
// The runtime owns encoding and download (PNG and video alike); this only has
// to paint the requested time into a 2D context. A dedicated engine and a
// SeekStepper keep export completely independent from the preview: the export
// ring buffer is primed with the real frames preceding the requested time, so
// temporal effects see true history instead of whatever the preview happened
// to hold.

import type {
  ToolcraftProductExportFrameContext,
  ToolcraftProductExportRenderer,
  ToolcraftState,
} from "@/toolcraft/runtime";

import { resolveSlotParams } from "../animation/resolve";
import { chainMaxReach, registry } from "../effects/registry";
import { Engine } from "../engine/renderer";
import { SeekStepper } from "../engine/video";
import {
  CHAIN_SLOTS,
  slotEnabledTarget,
  slotTypeTarget,
  targets,
} from "../targets";
import type { ChainItem, EffectParamValues } from "../types";

type ExportSession = {
  canvas: HTMLCanvasElement;
  engine: Engine;
  headTime: number;
  stepper: SeekStepper;
  url: string;
};

let session: ExportSession | null = null;

function disposeSession(): void {
  session?.engine.dispose();
  session?.stepper.dispose();
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

async function ensureSession(
  url: string,
  width: number,
  height: number,
  depth: number,
): Promise<ExportSession> {
  if (session && session.url === url) {
    return session;
  }

  disposeSession();

  const canvas = document.createElement("canvas");
  const engine = new Engine(canvas, { preserveDrawingBuffer: true });
  const stepper = new SeekStepper(url);

  await stepper.ready();
  engine.configure({
    depth,
    srcHeight: height,
    srcWidth: width,
    targetWidth: width,
  });

  session = { canvas, engine, headTime: Number.NaN, stepper, url };

  return session;
}

export function createExportRenderer(
  getClipUrl: () => string | null,
): ToolcraftProductExportRenderer {
  return {
    baseFileName: "timeshift",

    async renderFrame({
      context,
      frame,
      state,
      timeSeconds,
    }: ToolcraftProductExportFrameContext): Promise<void> {
      const url = getClipUrl();

      if (!url) {
        return;
      }

      const chain = chainFromState(state);
      const fps = 30;
      const duration = state.timeline.durationSeconds || 1;
      const reach = chainMaxReach(
        chain,
        { duration, fps },
        (fx, time) => paramsResolver(state, time)(fx),
      );
      const active = await ensureSession(
        url,
        Math.max(2, Math.round(frame.width)),
        Math.max(2, Math.round(frame.height)),
        Math.max(8, Math.min(300, reach + 2)),
      );

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

        await active.stepper.seek(frameTime);
        active.engine.pushFrame(active.stepper.video);
      }

      active.headTime = timeSeconds;

      active.engine.render(chain, registry, {
        duration,
        fps,
        params: paramsResolver(state, timeSeconds),
        time: timeSeconds,
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
