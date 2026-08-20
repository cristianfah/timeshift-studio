// MOTION_TRACK · AUTO — motion detection.
//
// The frame is compared against the previous frame or a running background
// model, the mask is denoised, split into connected regions, and those regions
// are associated across frames into tracks with stable ids.

import type { LumaGrid } from "../types";

import {
  pushTrail,
  type AutoTrack,
  type MotionTrackParams,
  type Region,
  type TrackerState,
} from "./motion-track-state";

/** Motion mask against the previous frame or the background model. */
export function motionMask(
  s: TrackerState,
  g: LumaGrid,
  p: MotionTrackParams,
): Uint8Array {
  const n = g.luma.length;
  const ref = p.detect === "fondo" ? s.bg : s.prev;
  const mask = new Uint8Array(n);

  if (!ref || ref.length !== n) {
    return mask;
  }

  for (let i = 0; i < n; i += 1) {
    mask[i] = Math.abs((g.luma[i] ?? 0) - (ref[i] ?? 0)) > p.sensitivity ? 1 : 0;
  }

  return denoise(mask, g.cols, g.rows);
}

/**
 * Erode-then-dilate: a lone flickering cell dies, a real moving object keeps
 * its silhouette. This is what stops the boxes from chasing sensor noise.
 */
export function denoise(mask: Uint8Array, cols: number, rows: number): Uint8Array {
  const eroded = new Uint8Array(mask.length);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const i = y * cols + x;

      if (!mask[i]) {
        continue;
      }

      let n = 0;

      if (x > 0 && mask[i - 1]) n += 1;
      if (x < cols - 1 && mask[i + 1]) n += 1;
      if (y > 0 && mask[i - cols]) n += 1;
      if (y < rows - 1 && mask[i + cols]) n += 1;
      if (n >= 2) eroded[i] = 1;
    }
  }

  const out = new Uint8Array(mask.length);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const i = y * cols + x;

      if (!eroded[i]) {
        continue;
      }

      out[i] = 1;
      if (x > 0) out[i - 1] = 1;
      if (x < cols - 1) out[i + 1] = 1;
      if (y > 0) out[i - cols] = 1;
      if (y < rows - 1) out[i + cols] = 1;
    }
  }

  return out;
}

/**
 * Mean frame-to-frame change inside a region. The background model keeps
 * flagging the spot an object just left ("ghosts") until the model catches up;
 * those regions have no live change, so this is what filters them out.
 */
export function frameActivity(g: LumaGrid, prev: Float32Array, r: Region): number {
  const x0 = Math.max(0, Math.floor((r.cx - r.w / 2) * g.cols));
  const x1 = Math.min(g.cols - 1, Math.ceil((r.cx + r.w / 2) * g.cols));
  const y0 = Math.max(0, Math.floor((r.cy - r.h / 2) * g.rows));
  const y1 = Math.min(g.rows - 1, Math.ceil((r.cy + r.h / 2) * g.rows));
  let sum = 0;
  let n = 0;

  for (let y = y0; y <= y1; y += 1) {
    const row = y * g.cols;

    for (let x = x0; x <= x1; x += 1) {
      sum += Math.abs((g.luma[row + x] ?? 0) - (prev[row + x] ?? 0));
      n += 1;
    }
  }

  return n ? sum / n : 0;
}

/** Connected components (4-neighbour) over a binary motion mask. */
export function findRegions(
  mask: Uint8Array,
  cols: number,
  rows: number,
  minMass: number,
): Region[] {
  const seen = new Uint8Array(mask.length);
  const regions: Region[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) {
      continue;
    }

    let mass = 0;
    let sx = 0;
    let sy = 0;
    let minx = cols;
    let maxx = 0;
    let miny = rows;
    let maxy = 0;

    stack.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const i = stack.pop() ?? 0;
      const x = i % cols;
      const y = (i / cols) | 0;

      mass += 1;
      sx += x;
      sy += y;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;

      if (x > 0 && mask[i - 1] && !seen[i - 1]) {
        seen[i - 1] = 1;
        stack.push(i - 1);
      }
      if (x < cols - 1 && mask[i + 1] && !seen[i + 1]) {
        seen[i + 1] = 1;
        stack.push(i + 1);
      }
      if (y > 0 && mask[i - cols] && !seen[i - cols]) {
        seen[i - cols] = 1;
        stack.push(i - cols);
      }
      if (y < rows - 1 && mask[i + cols] && !seen[i + cols]) {
        seen[i + cols] = 1;
        stack.push(i + cols);
      }
    }

    if (mass >= minMass) {
      regions.push({
        cx: (sx / mass + 0.5) / cols,
        cy: (sy / mass + 0.5) / rows,
        h: (maxy - miny + 1) / rows,
        mass,
        w: (maxx - minx + 1) / cols,
      });
    }
  }

  return regions.sort((a, b) => b.mass - a.mass);
}

/**
 * Greedy nearest-neighbour association. Detections are matched against the
 * track's *predicted* position (constant velocity), which is what lets an ID
 * survive a fast-moving subject instead of being reborn every frame.
 */
export function updateTracks(
  s: TrackerState,
  regions: Region[],
  p: MotionTrackParams,
  matchRadius: number,
): void {
  const smoothing = Math.min(p.smoothing, 0.95);
  const alpha = 1 - smoothing;
  const freeDet = new Set(regions.map((_, i) => i));
  const pairs: [number, AutoTrack, number][] = [];

  for (const tr of s.tracks) {
    const px = tr.cx + tr.vx;
    const py = tr.cy + tr.vy;

    for (const i of freeDet) {
      const r = regions[i];

      if (!r) {
        continue;
      }

      const d = Math.hypot(r.cx - px, r.cy - py);

      if (d < matchRadius) {
        pairs.push([d, tr, i]);
      }
    }
  }

  pairs.sort((a, b) => a[0] - b[0]);

  const usedTracks = new Set<AutoTrack>();

  for (const [, tr, i] of pairs) {
    if (usedTracks.has(tr) || !freeDet.has(i)) {
      continue;
    }

    const r = regions[i];

    if (!r) {
      continue;
    }

    usedTracks.add(tr);
    freeDet.delete(i);
    tr.vx = tr.vx * smoothing + (r.cx - tr.cx) * alpha;
    tr.vy = tr.vy * smoothing + (r.cy - tr.cy) * alpha;
    tr.cx += (r.cx - tr.cx) * alpha;
    tr.cy += (r.cy - tr.cy) * alpha;
    tr.w += (r.w - tr.w) * alpha;
    tr.h += (r.h - tr.h) * alpha;
    tr.mass = r.mass;
    tr.life = p.persistence;
    tr.age += 1;
  }

  for (const tr of s.tracks) {
    if (!usedTracks.has(tr)) {
      tr.life -= 1;
      tr.cx += tr.vx; // coast on inertia while persisting
      tr.cy += tr.vy;
    }
  }

  s.tracks = s.tracks.filter(
    (tr) => tr.life > 0 && tr.cx > -0.1 && tr.cx < 1.1,
  );

  for (const i of freeDet) {
    if (s.tracks.length >= p.maxBoxes * 2) {
      break;
    }

    const r = regions[i];

    if (!r) {
      continue;
    }

    s.tracks.push({
      age: 1,
      cx: r.cx,
      cy: r.cy,
      h: r.h,
      id: s.nextId,
      life: p.persistence,
      mass: r.mass,
      trail: [],
      vx: 0,
      vy: 0,
      w: r.w,
    });
    s.nextId += 1;
  }

  for (const tr of s.tracks) {
    pushTrail(tr.trail, tr.cx, tr.cy, p.trail);
  }
}
