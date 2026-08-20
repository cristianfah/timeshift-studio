// MOTION_TRACK · PUNTOS — feature tracking.
//
// Each user-placed point keeps a mean-normalized luminance patch that is
// re-located every frame by a coarse-to-fine SAD search around the
// motion-predicted position. Templates adapt slowly, so a point sticks to the
// thing it was placed on.

import type { ChainItem, LumaGrid, TrackPoint } from "../types";

import {
  ACCEPT_CONF,
  clampI,
  MIN_ENERGY,
  pushTrail,
  type MotionTrackParams,
  type PointTracker,
  type TrackerState,
} from "./motion-track-state";

type Integral = {
  sat: Float64Array;
  w: number;
};

/** Summed-area table so a candidate patch mean costs O(1) during the search. */
function integral(g: LumaGrid): Integral {
  const { cols, luma, rows } = g;
  const w = cols + 1;
  const sat = new Float64Array(w * (rows + 1));

  for (let y = 0; y < rows; y += 1) {
    let rowSum = 0;

    for (let x = 0; x < cols; x += 1) {
      rowSum += luma[y * cols + x] ?? 0;
      sat[(y + 1) * w + x + 1] = (sat[y * w + x + 1] ?? 0) + rowSum;
    }
  }

  return { sat, w };
}

function windowMean(
  I: Integral,
  px: number,
  py: number,
  H: number,
  area: number,
): number {
  const x0 = px - H;
  const y0 = py - H;
  const x1 = px + H + 1;
  const y1 = py + H + 1;
  const { sat, w } = I;

  return (
    ((sat[y1 * w + x1] ?? 0) -
      (sat[y0 * w + x1] ?? 0) -
      (sat[y1 * w + x0] ?? 0) +
      (sat[y0 * w + x0] ?? 0)) /
    area
  );
}

/** Mean-normalized patch — brightness changes don't break the match. */
function samplePatch(
  g: LumaGrid,
  px: number,
  py: number,
  H: number,
): Float32Array {
  const n = 2 * H + 1;
  const out = new Float32Array(n * n);
  let sum = 0;

  for (let j = 0; j < n; j += 1) {
    const row = (py - H + j) * g.cols;

    for (let i = 0; i < n; i += 1) {
      const v = g.luma[row + px - H + i] ?? 0;

      out[j * n + i] = v;
      sum += v;
    }
  }

  const mean = sum / out.length;

  for (let k = 0; k < out.length; k += 1) {
    out[k] = (out[k] ?? 0) - mean;
  }

  return out;
}

/** How much detail a template carries — a flat patch matches everything. */
function patchEnergy(tmpl: Float32Array): number {
  let s = 0;

  for (let i = 0; i < tmpl.length; i += 1) {
    s += Math.abs(tmpl[i] ?? 0);
  }

  return s / tmpl.length;
}

/**
 * Snap a click to the most trackable spot nearby: the window with the highest
 * gradient energy (a corner or edge, never flat wall). Clicking roughly on the
 * subject is then good enough to get a point that actually holds.
 */
function pickFeature(
  g: LumaGrid,
  cx: number,
  cy: number,
  H: number,
  R: number,
): { x: number; y: number } {
  const loX = H;
  const hiX = g.cols - 1 - H;
  const loY = H;
  const hiY = g.rows - 1 - H;
  const ox = clampI(cx, loX, hiX);
  const oy = clampI(cy, loY, hiY);

  const energy = (px: number, py: number): number => {
    let e = 0;

    for (let j = -H; j <= H; j += 1) {
      const row = (py + j) * g.cols + px - H;

      for (let i = 0; i < 2 * H; i += 1) {
        e += Math.abs((g.luma[row + i + 1] ?? 0) - (g.luma[row + i] ?? 0));
      }

      if (j < H) {
        for (let i = 0; i <= 2 * H; i += 1) {
          e += Math.abs(
            (g.luma[row + i + g.cols] ?? 0) - (g.luma[row + i] ?? 0),
          );
        }
      }
    }

    return e;
  };

  let bx = ox;
  let by = oy;
  // The click itself wins ties: a candidate must be clearly better to steal it.
  let best = energy(ox, oy) * 1.15;

  for (let dy = -R; dy <= R; dy += 1) {
    const py = clampI(oy + dy, loY, hiY);

    for (let dx = -R; dx <= R; dx += 1) {
      const px = clampI(ox + dx, loX, hiX);
      const e = energy(px, py);

      if (e > best) {
        best = e;
        bx = px;
        by = py;
      }
    }
  }

  return { x: bx, y: by };
}

/**
 * Coarse-to-fine SAD search for `tmpl` around (cx, cy) within radius R.
 *
 * `bias` adds a penalty proportional to the distance from the prediction, so a
 * far-away lookalike (repeating texture, a second identical object) has to be
 * clearly better to steal the point. It only affects which candidate wins —
 * the reported `mad` is always the raw match error.
 */
function matchPatch(
  g: LumaGrid,
  I: Integral,
  tmpl: Float32Array,
  H: number,
  cx: number,
  cy: number,
  R: number,
  bias = 0,
): { mad: number; x: number; y: number } {
  const n = 2 * H + 1;
  const area = n * n;
  const loX = H;
  const hiX = g.cols - 1 - H;
  const loY = H;
  const hiY = g.rows - 1 - H;
  const ax = clampI(cx, loX, hiX);
  const ay = clampI(cy, loY, hiY);

  const mad = (px: number, py: number): number => {
    const mean = windowMean(I, px, py, H, area);
    let sad = 0;

    for (let j = 0; j < n; j += 1) {
      const row = (py - H + j) * g.cols + px - H;
      const trow = j * n;

      for (let i = 0; i < n; i += 1) {
        const d = (g.luma[row + i] ?? 0) - mean - (tmpl[trow + i] ?? 0);

        sad += d < 0 ? -d : d;
      }
    }

    return sad / area;
  };
  const penalty = (px: number, py: number): number =>
    bias > 0 ? (bias * Math.hypot(px - ax, py - ay)) / R : 0;

  let bx = ax;
  let by = ay;
  let bestRaw = mad(bx, by);
  let best = bestRaw;

  // Coarse pass over the whole radius, then a fine pass around its winner. The
  // coarse step grows with the radius so a wide recovery search costs roughly
  // the same as a normal one.
  const coarse = Math.max(2, Math.round(R / 10));

  for (const [step, radius] of [
    [coarse, R],
    [1, coarse],
  ] as const) {
    const ox = bx;
    const oy = by;

    for (let dy = -radius; dy <= radius; dy += step) {
      const py = clampI(oy + dy, loY, hiY);

      for (let dx = -radius; dx <= radius; dx += step) {
        const px = clampI(ox + dx, loX, hiX);
        const raw = mad(px, py);
        const m = raw + penalty(px, py);

        if (m < best) {
          best = m;
          bestRaw = raw;
          bx = px;
          by = py;
        }
      }
    }
  }

  return { mad: bestRaw, x: bx, y: by };
}

/**
 * Whole-frame re-acquisition. Only runs for a point that has been lost for a
 * while (occlusion, a cut, a subject that left and came back) — a local search
 * can never recover from that, a global one can.
 */
function matchGlobal(
  g: LumaGrid,
  I: Integral,
  tmpl: Float32Array,
  H: number,
  step: number,
): { mad: number; x: number; y: number } {
  const n = 2 * H + 1;
  const area = n * n;
  let bx = H;
  let by = H;
  let best = Infinity;

  for (let py = H; py <= g.rows - 1 - H; py += step) {
    for (let px = H; px <= g.cols - 1 - H; px += step) {
      const mean = windowMean(I, px, py, H, area);
      let sad = 0;

      for (let j = 0; j < n; j += 1) {
        const row = (py - H + j) * g.cols + px - H;
        const trow = j * n;

        for (let i = 0; i < n; i += 1) {
          const d = (g.luma[row + i] ?? 0) - mean - (tmpl[trow + i] ?? 0);

          sad += d < 0 ? -d : d;
        }
      }

      if (sad < best) {
        best = sad;
        bx = px;
        by = py;
      }
    }
  }

  return matchPatch(g, I, tmpl, H, bx, by, step); // refine around the winner
}

/** Sync tracker entries with the seed list the app owns (fx.points). */
export function syncPoints(s: TrackerState, fx: ChainItem) {
  const seeds = fx.points ?? [];
  const alive = new Set(seeds.map((sd) => sd.id));

  for (const id of [...s.points.keys()]) {
    if (!alive.has(id)) {
      s.points.delete(id);
    }
  }

  for (const sd of seeds) {
    const pt = s.points.get(sd.id);

    if (!pt || pt.anchor !== (sd.anchor ?? 0)) {
      // New point, or the user re-anchored it: forget the old template.
      s.points.set(sd.id, {
        anchor: sd.anchor ?? 0,
        conf: 1,
        energy: 0,
        H: 0,
        id: sd.id,
        lost: 0,
        tmpl: null,
        trail: [],
        vx: 0,
        vy: 0,
        weak: false,
        x: sd.x,
        y: sd.y,
      });
    }
  }

  return seeds;
}

export function updatePoints(
  s: TrackerState,
  fx: ChainItem,
  g: LumaGrid,
  p: MotionTrackParams,
): void {
  const seeds = syncPoints(s, fx);

  if (seeds.length === 0) {
    return;
  }

  const H = clampI(
    Math.round(p.patch),
    2,
    Math.floor(Math.min(g.cols, g.rows) / 3),
  );
  const R = Math.max(2, Math.round(p.search * g.cols));
  const I = integral(g);
  const smoothing = Math.min(p.smoothing, 0.95);

  for (const pt of s.points.values()) {
    const px = clampI(Math.round(pt.x * g.cols), H, g.cols - 1 - H);
    const py = clampI(Math.round(pt.y * g.rows), H, g.rows - 1 - H);

    if (!pt.tmpl || pt.H !== H) {
      // Anchor on the most trackable window near the click, not on the exact
      // pixel — clicking near an edge or corner is then good enough.
      const f = pickFeature(g, px, py, H, Math.min(R, 10));

      pt.tmpl = samplePatch(g, f.x, f.y, H);
      pt.energy = patchEnergy(pt.tmpl);
      pt.weak = pt.energy < MIN_ENERGY;
      pt.x = (f.x + 0.5) / g.cols;
      pt.y = (f.y + 0.5) / g.rows;
      pt.H = H;
      pt.vx = 0;
      pt.vy = 0;
      pt.conf = pt.weak ? 0 : 1;
      pt.lost = 0;
      pushTrail(pt.trail, pt.x, pt.y, p.trail);
      continue;
    }

    // Predict with the current velocity, then search around the prediction.
    // After a miss the radius widens: a subject that jumped (fast motion, a
    // dropped frame, an occlusion) is re-acquired instead of lost for good.
    const qx = clampI(
      Math.round((pt.x + pt.vx) * g.cols),
      H,
      g.cols - 1 - H,
    );
    const qy = clampI(
      Math.round((pt.y + pt.vy) * g.rows),
      H,
      g.rows - 1 - H,
    );
    // Score matches against how much detail the template has: a residual of
    // 0.02 is excellent on a flat patch and mediocre on a busy one.
    const tolerance = Math.max(MIN_ENERGY, pt.energy) * 0.7;
    const hit =
      pt.lost > p.persistence && pt.lost % 4 === 0
        ? matchGlobal(g, I, pt.tmpl, H, Math.max(2, H >> 1))
        : matchPatch(
            g,
            I,
            pt.tmpl,
            H,
            qx,
            qy,
            R * (1 + Math.min(pt.lost, 3)),
            tolerance * 0.5,
          );
    const conf = pt.weak ? 0 : clampI(1 - hit.mad / tolerance, 0, 1);

    pt.conf = pt.conf * 0.5 + conf * 0.5;

    if (conf > ACCEPT_CONF) {
      const nx = (hit.x + 0.5) / g.cols;
      const ny = (hit.y + 0.5) / g.rows;

      if (Math.hypot(nx - pt.x, ny - pt.y) > p.search * 1.5) {
        // Re-acquired somewhere else: no stale inertia.
        pt.vx = 0;
        pt.vy = 0;
      } else {
        pt.vx = pt.vx * smoothing + (nx - pt.x) * (1 - smoothing);
        pt.vy = pt.vy * smoothing + (ny - pt.y) * (1 - smoothing);
      }

      pt.x = nx;
      pt.y = ny;
      pt.lost = 0;

      // Slow template adaptation: follows lighting/pose drift without letting
      // the patch slide onto the background.
      if (p.adapt > 0.001) {
        const fresh = samplePatch(g, hit.x, hit.y, H);
        const a = p.adapt * conf;

        for (let k = 0; k < pt.tmpl.length; k += 1) {
          pt.tmpl[k] = (pt.tmpl[k] ?? 0) + ((fresh[k] ?? 0) - (pt.tmpl[k] ?? 0)) * a;
        }

        pt.energy = patchEnergy(pt.tmpl);
      }
    } else {
      pt.lost += 1;
      pt.x = clampI(pt.x + pt.vx, 0, 1); // coast while the match is missing
      pt.y = clampI(pt.y + pt.vy, 0, 1);
      pt.vx *= 0.85;
      pt.vy *= 0.85;
    }

    pushTrail(pt.trail, pt.x, pt.y, p.trail);
  }
}
