import { describe, expect, it } from "vitest";

import {
  asStillMotion,
  asStillMotionAmount,
  createStillFramePainter,
} from "./still-history";

type PaintCall =
  | { args: readonly number[]; op: "drawImage" | "scale" | "translate" }
  | { args: readonly number[]; op: "rotate" };

function recordingContext(width: number, height: number): {
  calls: PaintCall[];
  context: CanvasRenderingContext2D;
} {
  const calls: PaintCall[] = [];
  const context = {
    canvas: { height, width },
    drawImage: (_image: unknown, ...args: number[]) => {
      calls.push({ args, op: "drawImage" });
    },
    rotate: (angle: number) => {
      calls.push({ args: [angle], op: "rotate" });
    },
    scale: (x: number, y: number) => {
      calls.push({ args: [x, y], op: "scale" });
    },
    setTransform: () => undefined,
    translate: (x: number, y: number) => {
      calls.push({ args: [x, y], op: "translate" });
    },
  } as unknown as CanvasRenderingContext2D;

  return { calls, context };
}

const image = {} as CanvasImageSource;

describe("invented past for a still", () => {
  it("keeps the current frame identical to the uploaded image", () => {
    const { calls, context } = recordingContext(800, 450);

    createStillFramePainter(image, "drift", 1)(context, 0);

    expect(calls).toEqual([{ args: [0, 0, 800, 450], op: "drawImage" }]);
  });

  it("moves older frames further away from the current one", () => {
    const { calls, context } = recordingContext(800, 450);
    const paint = createStillFramePainter(image, "drift", 1);

    paint(context, 0.5);
    paint(context, 1);

    const shifts = calls
      .filter((call) => call.op === "translate")
      .map((call) => call.args[0] ?? 0);

    expect(shifts).toHaveLength(2);
    expect(shifts[1]).toBeGreaterThan(shifts[0] ?? 0);
  });

  it("treats no motion and zero intensity as the untouched frame", () => {
    const { calls: withoutMotion, context: a } = recordingContext(800, 450);
    const { calls: withoutIntensity, context: b } = recordingContext(800, 450);

    createStillFramePainter(image, "none", 1)(a, 1);
    createStillFramePainter(image, "zoom", 0)(b, 1);

    expect(withoutMotion).toEqual([{ args: [0, 0, 800, 450], op: "drawImage" }]);
    expect(withoutIntensity).toEqual(withoutMotion);
  });

  it("overscales rotated and zoomed frames so the output stays covered", () => {
    const { calls, context } = recordingContext(800, 450);

    createStillFramePainter(image, "swing", 1)(context, 1);

    const scale = calls.find((call) => call.op === "scale")?.args[0] ?? 0;
    const angle = calls.find((call) => call.op === "rotate")?.args[0] ?? 0;

    expect(angle).toBeGreaterThan(0);
    expect(scale).toBeGreaterThan(Math.cos(angle) + (450 / 800) * Math.sin(angle));
  });

  it("keeps stored values inside the supported range", () => {
    expect(asStillMotion("swing")).toBe("swing");
    expect(asStillMotion("nope")).toBe("drift");
    expect(asStillMotionAmount("0.25")).toBe(0.25);
    expect(asStillMotionAmount(4)).toBe(1);
    expect(asStillMotionAmount("x")).toBe(0.5);
  });
});
