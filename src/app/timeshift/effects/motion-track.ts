// MOTION_TRACK — two trackers in one effect, drawn as a lab overlay and
// composited in-shader so it exports at full resolution.
//
//  · AUTO   — motion detection: the frame is compared against either the
//             previous frame or a running background model, the mask is
//             denoised, split into connected regions and those regions are
//             associated across frames into tracks with stable IDs.
//  · PUNTOS — real feature tracking: the user clicks points on the viewport
//             and each one keeps a mean-normalized luminance patch that is
//             re-located every frame by a coarse-to-fine SAD search around
//             the motion-predicted position. Templates adapt slowly, so a
//             point sticks to the thing it was placed on.
//
// Both produce "marks" (box + id + value + trail + velocity vector) that
// share the same drawing code.

import type {
  ChainItem,
  EffectHost,
  EffectModule,
  LumaGrid,
  TrackMark,
} from "../types";

export type MotionTrackParams = {
  adapt: number;
  color: string;
  detect: string;
  lines: string;
  maxBoxes: number;
  minArea: number;
  mode: string;
  opacity: number;
  patch: number;
  persistence: number;
  search: number;
  sensitivity: number;
  smoothing: number;
  style: string;
  trail: number;
  values: string;
};

const AUTO_COLS = 96; // motion-detection grid
const TRACK_COLS = 256; // patch-tracking grid (finer: real features)
const WARMUP_FRAMES = 2; // frames an auto region must live before drawing
const MIN_ENERGY = 0.02; // patch texture below this has nothing to lock onto
const ACCEPT_CONF = 0.4; // weaker matches never move a point (they coast)

const frag = `
uniform sampler2D uOverlay;
uniform float uOpacity;

void main() {
  vec4 base = texture(uPrev, v_uv);
  vec4 ov = texture(uOverlay, vec2(v_uv.x, 1.0 - v_uv.y)); // canvas is top-down
  outColor = vec4(mix(base.rgb, ov.rgb, clamp(ov.a * uOpacity, 0.0, 1.0)), 1.0);
}`;

const COLORS: Record<string, string> = {
  ambar: "#f5a623",
  blanco: "#f2f2f2",
  rojo: "#ff4633",
  teal: "#4fd8c7",
};

const clampI = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

type AutoTrack = {
  age: number;
  cx: number;
  cy: number;
  h: number;
  id: number;
  life: number;
  mass: number;
  trail: number[];
  vx: number;
  vy: number;
  w: number;
};

type Region = {
  cx: number;
  cy: number;
  h: number;
  mass: number;
  w: number;
};

type PointTracker = {
  anchor: number;
  conf: number;
  energy: number;
  H: number;
  id: string;
  lost: number;
  tmpl: Float32Array | null;
  trail: number[];
  vx: number;
  vy: number;
  weak: boolean;
  x: number;
  y: number;
};

type TrackerState = {
  bg: Float32Array | null;
  nextId: number;
  points: Map<string, PointTracker>;
  prev: Float32Array | null;
  stamp: number;
  tracks: AutoTrack[];
};

// Tracking state is per (engine x instance): preview and export run the same
// effect concurrently and must never share history.
const stateByEngine = new WeakMap<EffectHost, Map<string, TrackerState>>();
const overlayCanvasByHost = new WeakMap<EffectHost, HTMLCanvasElement>();

function trackState(host: EffectHost, fx: ChainItem): TrackerState {
  let byId = stateByEngine.get(host);

  if (!byId) {
    byId = new Map();
    stateByEngine.set(host, byId);
  }

  let s = byId.get(fx.id);

  if (!s) {
    s = {
      bg: null,
      nextId: 1,
      points: new Map(),
      prev: null,
      stamp: -1,
      tracks: [],
    };
    byId.set(fx.id, s);
  }

  return s;
}

// ---------------------------------------------------------------- AUTO mode

/** Motion mask against the previous frame or the background model. */
function motionMask(
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
function denoise(mask: Uint8Array, cols: number, rows: number): Uint8Array {
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
function frameActivity(g: LumaGrid, prev: Float32Array, r: Region): number {
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
function findRegions(
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
function updateTracks(
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

// -------------------------------------------------------------- POINTS mode

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
function syncPoints(s: TrackerState, fx: ChainItem) {
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

function updatePoints(
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

function pushTrail(
  trail: number[],
  x: number,
  y: number,
  len: number,
): void {
  const n = Math.round(len);

  if (n <= 0) {
    trail.length = 0;
    return;
  }

  trail.push(x, y);

  const max = n * 2;

  if (trail.length > max) {
    trail.splice(0, trail.length - max);
  }
}

// ------------------------------------------------------------------ drawing

/** Deterministic readout per auto track — looks like tracker confidence. */
function readout(tr: AutoTrack): string {
  const spd = Math.hypot(tr.vx, tr.vy);

  return Math.min(1.9999, 0.18 + spd * 42 + tr.mass / 900).toFixed(4);
}

/** Both trackers reduce to the same drawable "mark". */
function collectMarks(
  s: TrackerState,
  p: MotionTrackParams,
  aspect: number,
): TrackMark[] {
  const marks: TrackMark[] = [];

  if (p.mode !== "puntos") {
    const auto = s.tracks
      .filter((tr) => tr.age >= WARMUP_FRAMES)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, Math.round(p.maxBoxes));

    for (const tr of auto) {
      marks.push({
        cx: tr.cx,
        cy: tr.cy,
        h: tr.h + 0.024,
        id: tr.id,
        lost: false,
        manual: false,
        tag: `M${String(tr.id).padStart(2, "0")}`,
        trail: tr.trail,
        value: readout(tr),
        vx: tr.vx,
        vy: tr.vy,
        w: tr.w + 0.024,
      });
    }
  }

  if (p.mode !== "auto") {
    let i = 0;

    for (const pt of s.points.values()) {
      const H = pt.H || Math.round(p.patch);
      const size = ((H * 2 + 1) / TRACK_COLS) * 1.8;

      i += 1;
      marks.push({
        cx: pt.x,
        cy: pt.y,
        h: size * aspect, // square on screen
        id: 10000 + i - 1,
        lost: pt.weak || pt.lost > p.persistence,
        manual: true,
        sid: pt.id,
        tag: `P${String(i).padStart(2, "0")}`,
        trail: pt.trail,
        value: pt.weak ? "SIN TEXTURA" : pt.conf.toFixed(3),
        vx: pt.vx,
        vy: pt.vy,
        w: size,
      });
    }
  }

  return marks;
}

function drawOverlay(
  host: EffectHost,
  marks: TrackMark[],
  p: MotionTrackParams,
): HTMLCanvasElement {
  const W = host.width;
  const H = host.height;
  let cv = overlayCanvasByHost.get(host);

  if (!cv) {
    cv = document.createElement("canvas");
    overlayCanvasByHost.set(host, cv);
  }

  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }

  const c = cv.getContext("2d");

  if (!c) {
    return cv;
  }

  c.clearRect(0, 0, W, H);

  const col = COLORS[p.color] ?? COLORS.blanco ?? "#f2f2f2";
  const sc = Math.max(0.6, H / 540);

  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = Math.max(1, 1.1 * sc);
  c.font = `${Math.round(9 * sc)}px 'JetBrains Mono', Consolas, monospace`;

  // Trails: where each mark has been — the clearest proof it is tracking.
  for (const m of marks) {
    if (m.trail.length < 4) {
      continue;
    }

    c.save();
    c.lineWidth = Math.max(1, 0.9 * sc);

    const pts = m.trail.length / 2;

    for (let i = 1; i < pts; i += 1) {
      c.globalAlpha = (i / pts) * 0.55;
      c.beginPath();
      c.moveTo((m.trail[(i - 1) * 2] ?? 0) * W, (m.trail[(i - 1) * 2 + 1] ?? 0) * H);
      c.lineTo((m.trail[i * 2] ?? 0) * W, (m.trail[i * 2 + 1] ?? 0) * H);
      c.stroke();
    }

    c.restore();
  }

  // Neighbour lines: connect each mark to its nearest peer (deduped).
  if (p.lines === "vecinos" && marks.length > 1) {
    c.save();
    c.globalAlpha = 0.75;

    const drawn = new Set<string>();

    for (const a of marks) {
      let best: TrackMark | null = null;
      let bd = Infinity;

      for (const b of marks) {
        if (b === a) {
          continue;
        }

        const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);

        if (d < bd) {
          bd = d;
          best = b;
        }
      }

      if (!best) {
        continue;
      }

      const key =
        a.id < best.id ? `${a.id}-${best.id}` : `${best.id}-${a.id}`;

      if (drawn.has(key)) {
        continue;
      }

      drawn.add(key);
      c.beginPath();
      c.moveTo(a.cx * W, a.cy * H);
      c.lineTo(best.cx * W, best.cy * H);
      c.stroke();

      if (p.values === "yes") {
        c.fillText(
          bd.toFixed(4),
          ((a.cx + best.cx) / 2) * W + 3 * sc,
          ((a.cy + best.cy) / 2) * H - 3 * sc,
        );
      }
    }

    c.restore();
  }

  for (const m of marks) {
    const w = m.w * W;
    const h = m.h * H;
    const x = m.cx * W - w / 2;
    const y = m.cy * H - h / 2;

    c.save();

    if (m.lost) {
      c.setLineDash([3 * sc, 3 * sc]);
      c.globalAlpha = 0.5;
    }

    const style = m.manual && p.style === "rect" ? "cruz" : p.style;

    if (style === "circulo") {
      c.beginPath();
      c.ellipse(m.cx * W, m.cy * H, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (style === "esquinas") {
      const t = Math.min(w, h) * 0.28;

      c.beginPath();
      c.moveTo(x, y + t);
      c.lineTo(x, y);
      c.lineTo(x + t, y);
      c.moveTo(x + w - t, y);
      c.lineTo(x + w, y);
      c.lineTo(x + w, y + t);
      c.moveTo(x + w, y + h - t);
      c.lineTo(x + w, y + h);
      c.lineTo(x + w - t, y + h);
      c.moveTo(x + t, y + h);
      c.lineTo(x, y + h);
      c.lineTo(x, y + h - t);
      c.stroke();
    } else if (style === "cruz") {
      const r = Math.max(w, h) / 2;
      const gap = r * 0.35;

      c.beginPath();
      c.moveTo(m.cx * W - r, m.cy * H);
      c.lineTo(m.cx * W - gap, m.cy * H);
      c.moveTo(m.cx * W + gap, m.cy * H);
      c.lineTo(m.cx * W + r, m.cy * H);
      c.moveTo(m.cx * W, m.cy * H - r);
      c.lineTo(m.cx * W, m.cy * H - gap);
      c.moveTo(m.cx * W, m.cy * H + gap);
      c.lineTo(m.cx * W, m.cy * H + r);
      c.stroke();
      c.strokeRect(x, y, w, h);
    } else {
      c.strokeRect(x, y, w, h);
    }

    c.restore();

    if (p.lines === "vectores") {
      const k = 14;

      c.save();
      c.globalAlpha = 0.8;
      c.beginPath();
      c.moveTo((m.cx - m.vx * k) * W, (m.cy - m.vy * k) * H);
      c.lineTo(m.cx * W, m.cy * H);
      c.stroke();
      c.restore();
    }

    if (p.values === "yes") {
      c.fillText(m.value, x + w + 3 * sc, y + 8 * sc);
      c.save();
      c.globalAlpha = 0.75;
      c.fillText(m.lost ? `${m.tag} LOST` : m.tag, x, y - 3 * sc);
      c.restore();
    }
  }

  return cv;
}

const motionTrack: EffectModule<MotionTrackParams> = {
  desc: "Tracker real: detecta el movimiento por sí solo o sigue los puntos que marques en el visor. Colócalo al final de la cadena.",
  frag,
  hasTrackPoints: true,
  label: "Seguimiento de movimiento",
  params: [
    {
      def: "auto",
      help: "Automático detecta zonas en movimiento. Puntos sigue por correlación los que marcas en el visor.",
      key: "mode",
      label: "Modo",
      options: [
        ["auto", "Automático"],
        ["puntos", "Puntos"],
        ["ambos", "Ambos"],
      ],
      type: "select",
    },
    {
      def: "fondo",
      help: "Contra el fondo marca el objeto entero. Contra el frame previo solo marca los bordes que cambian.",
      key: "detect",
      label: "Referencia",
      options: [
        ["fondo", "Modelo de fondo"],
        ["previo", "Frame previo"],
      ],
      type: "select",
    },
    {
      def: 0.08,
      help: "Umbral de cambio para considerar movimiento. Al bajarlo detecta más.",
      key: "sensitivity",
      label: "Sensibilidad",
      max: 0.5,
      min: 0.02,
      step: 0.01,
    },
    {
      def: 5,
      help: "Tamaño mínimo, en celdas, de una zona de movimiento para crear caja.",
      key: "minArea",
      label: "Área mínima",
      max: 60,
      min: 1,
      step: 1,
    },
    { def: 8, key: "maxBoxes", label: "Cajas máximas", max: 24, min: 1, step: 1 },
    {
      def: 0.55,
      help: "Suaviza la posición entre frames. Alto es más estable pero con retardo.",
      key: "smoothing",
      label: "Suavizado",
      max: 0.95,
      min: 0,
      step: 0.01,
    },
    {
      def: 12,
      help: "Frames que una marca sobrevive sin detección, siguiendo por inercia.",
      key: "persistence",
      label: "Persistencia",
      max: 40,
      min: 1,
      step: 1,
      unit: "f",
    },
    {
      def: 0.1,
      help: "Cuánto se busca alrededor de la posición prevista. Súbelo si el sujeto se mueve rápido.",
      key: "search",
      label: "Radio de búsqueda",
      max: 0.3,
      min: 0.02,
      step: 0.005,
    },
    {
      def: 6,
      help: "Tamaño del parche que identifica al punto. Grande es más estable y menos preciso.",
      key: "patch",
      label: "Ventana",
      max: 14,
      min: 3,
      step: 1,
    },
    {
      def: 0.12,
      help: "Cuánto se actualiza el parche cada frame. Alto aguanta cambios de luz, con riesgo de deriva.",
      key: "adapt",
      label: "Adaptación",
      max: 0.6,
      min: 0,
      step: 0.01,
    },
    {
      def: 24,
      help: "Frames de recorrido dibujados detrás de cada marca.",
      key: "trail",
      label: "Estela",
      max: 90,
      min: 0,
      step: 1,
      unit: "f",
    },
    { def: 1, key: "opacity", label: "Opacidad", max: 1, min: 0, step: 0.01 },
    {
      def: "rect",
      key: "style",
      label: "Estilo",
      options: [
        ["rect", "Cajas"],
        ["esquinas", "Esquinas"],
        ["circulo", "Círculos"],
        ["cruz", "Mirillas"],
      ],
      type: "select",
    },
    {
      def: "vecinos",
      key: "lines",
      label: "Líneas",
      options: [
        ["vecinos", "Vecinos"],
        ["vectores", "Vectores"],
        ["no", "Ninguna"],
      ],
      type: "select",
    },
    {
      def: "yes",
      key: "values",
      label: "Lecturas",
      options: [
        ["yes", "Sí"],
        ["no", "No"],
      ],
      type: "select",
    },
    {
      def: "blanco",
      key: "color",
      label: "Color",
      options: [
        ["blanco", "Blanco"],
        ["teal", "Turquesa"],
        ["rojo", "Rojo"],
        ["ambar", "Ámbar"],
      ],
      type: "select",
    },
  ],
  presets: {
    LAB: {
      color: "teal",
      detect: "fondo",
      lines: "vectores",
      maxBoxes: 12,
      mode: "auto",
      sensitivity: 0.07,
      style: "esquinas",
      trail: 40,
    },
    MINIMAL: {
      lines: "no",
      maxBoxes: 4,
      mode: "auto",
      smoothing: 0.85,
      style: "circulo",
      trail: 0,
      values: "no",
    },
    ORGANICO: {
      detect: "fondo",
      lines: "vecinos",
      mode: "auto",
      sensitivity: 0.08,
      smoothing: 0.55,
      style: "rect",
      trail: 24,
      values: "yes",
    },
    PUNTOS: {
      color: "teal",
      lines: "no",
      mode: "puntos",
      patch: 6,
      search: 0.1,
      style: "cruz",
      trail: 40,
      values: "yes",
    },
    VIGILANCIA: {
      color: "ambar",
      detect: "fondo",
      lines: "vecinos",
      maxBoxes: 6,
      mode: "ambos",
      style: "esquinas",
      trail: 30,
    },
  },
  type: "motionTrack",

  analyze(host, fx, ctx) {
    const p = ctx.params(fx) as MotionTrackParams;
    const s = trackState(host, fx);
    const g = host.lumaGrid(AUTO_COLS);

    if (!g) {
      return;
    }

    // Only advance tracking on genuinely new frames; while paused the marks
    // stay frozen instead of decaying against a static image.
    if (s.stamp !== g.stamp) {
      if (p.mode !== "puntos") {
        let mask: Uint8Array | null = null;

        if (s.prev && s.prev.length === g.luma.length) {
          mask = motionMask(s, g, p);

          let regions = findRegions(mask, g.cols, g.rows, p.minArea);

          if (p.detect === "fondo") {
            const prev = s.prev;

            regions = regions.filter(
              (r) => frameActivity(g, prev, r) > p.sensitivity * 0.35,
            );
          }

          // Fast subjects need a wider gate; keep it tied to the search radius.
          updateTracks(s, regions, p, Math.max(0.08, p.search * 2));
        }

        // Selective background update: cells covered by motion barely learn, so
        // the model never swallows the subject and stops leaving a ghost box
        // behind it. The small leak lets a subject that parks become
        // background eventually.
        if (!s.bg || s.bg.length !== g.luma.length) {
          s.bg = g.luma.slice();
        } else {
          for (let i = 0; i < s.bg.length; i += 1) {
            s.bg[i] =
              (s.bg[i] ?? 0) +
              ((g.luma[i] ?? 0) - (s.bg[i] ?? 0)) *
                (mask && mask[i] ? 0.004 : 0.06);
          }
        }

        s.prev = g.luma.slice();
      }

      if (p.mode !== "auto") {
        const fine = host.lumaGrid(TRACK_COLS);

        if (fine) {
          updatePoints(s, fx, fine, p);
        }
      }

      s.stamp = g.stamp;
    } else if (p.mode !== "auto") {
      syncPoints(s, fx); // reflect points added/removed while paused
    }

    const marks = collectMarks(s, p, host.width / Math.max(1, host.height));

    host.uploadTex(
      host.instanceTex(`${fx.id}:ov`),
      drawOverlay(host, marks, p),
    );
    fx.marks = marks;
  },

  delayMap(_p, _ctx, fx) {
    // The time-map shows what the tracker is holding on to.
    const marks = fx?.marks ?? [];

    return (x, y) => {
      const yTop = 1 - y;

      for (const m of marks) {
        if (
          Math.abs(x - m.cx) < m.w / 2 + 0.012 &&
          Math.abs(yTop - m.cy) < m.h / 2 + 0.012
        ) {
          return 1;
        }
      }

      return 0;
    };
  },

  maxReach: () => 1, // only needs the previous frame

  setUniforms(gl, u, p, _ctx, host, fx) {
    const slot = host.instanceTex(`${fx.id}:ov`);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.uniform1i(u("uOverlay"), 2);
    gl.uniform1f(u("uOpacity"), p.opacity);
  },
};

export default motionTrack;
