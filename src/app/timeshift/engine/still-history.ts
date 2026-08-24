// Synthetic history for a still image.
//
// Every effect in this app reads the past: RGB split takes each channel from a
// different frame, echo blends older frames, block shuffle swaps blocks in
// time. A photograph has no past, so a ring filled with identical copies makes
// the whole chain a no-op — the preview shows the untouched picture.
//
// So the still gets an invented past: the current frame is always the original
// image, and older frames drift a little further away from it. The effects then
// behave exactly as they do over a slow-moving shot, and the exported frame
// still resolves to the user's own pixels wherever the chain reads delay 0.

/** How the invented past moves away from the current frame. */
export type StillMotion = "none" | "zoom" | "drift" | "swing";

export const STILL_MOTIONS: readonly { label: string; value: StillMotion }[] = [
  { label: "Sin movimiento", value: "none" },
  { label: "Zoom", value: "zoom" },
  { label: "Barrido", value: "drift" },
  { label: "Bamboleo", value: "swing" },
];

export const DEFAULT_STILL_MOTION: StillMotion = "drift";
export const DEFAULT_STILL_MOTION_AMOUNT = 0.5;

/** Painter for one ring layer. `age` is 0 for the current frame, 1 for the oldest. */
export type StillFramePainter = (
  context: CanvasRenderingContext2D,
  age: number,
) => void;

export function asStillMotion(value: unknown): StillMotion {
  return value === "none" || value === "zoom" || value === "drift" || value === "swing"
    ? value
    : DEFAULT_STILL_MOTION;
}

export function asStillMotionAmount(value: unknown): number {
  const amount = typeof value === "string" ? Number(value) : value;

  return typeof amount === "number" && Number.isFinite(amount)
    ? Math.min(1, Math.max(0, amount))
    : DEFAULT_STILL_MOTION_AMOUNT;
}

/**
 * Draws the still into one ring layer. Every mode overscales enough to keep the
 * frame covered, so an invented past never exposes empty edges.
 */
export function createStillFramePainter(
  image: CanvasImageSource,
  motion: StillMotion,
  amount: number,
): StillFramePainter {
  return (context, age) => {
    const { height, width } = context.canvas;
    const travel = amount * age;

    context.setTransform(1, 0, 0, 1, 0, 0);

    if (motion === "none" || travel === 0) {
      context.drawImage(image, 0, 0, width, height);

      return;
    }

    // Each mode overscales past its own displacement, so the oldest frame
    // still covers the output rectangle.
    const scale =
      motion === "zoom"
        ? 1 + travel * 0.3
        : motion === "drift"
          ? 1 + travel * 0.34
          : 1 + travel * 0.16;
    const shiftX = motion === "drift" ? travel * width * 0.14 : 0;
    const shiftY = motion === "drift" ? travel * height * 0.05 : 0;
    const angle = motion === "swing" ? travel * 0.06 : 0;

    context.translate(width / 2 + shiftX, height / 2 + shiftY);
    context.rotate(angle);
    context.scale(scale, scale);
    context.drawImage(image, -width / 2, -height / 2, width, height);
    context.setTransform(1, 0, 0, 1, 0, 0);
  };
}

/** Reads the two runtime controls that describe the invented past. */
export function createStillPainterFromValues(
  image: CanvasImageSource,
  values: Record<string, unknown>,
  motionTarget: string,
  amountTarget: string,
): StillFramePainter {
  return createStillFramePainter(
    image,
    asStillMotion(values[motionTarget]),
    asStillMotionAmount(values[amountTarget]),
  );
}
