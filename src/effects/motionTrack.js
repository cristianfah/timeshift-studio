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

const AUTO_COLS = 96;        // motion-detection grid
const TRACK_COLS = 256;      // patch-tracking grid (finer: real features)
const WARMUP_FRAMES = 2;     // frames an auto region must live before drawing
const MIN_ENERGY = 0.02;     // patch texture below this has nothing to lock onto
const ACCEPT_CONF = 0.4;     // weaker matches never move a point (they coast)

const frag = `
uniform sampler2D uOverlay;
uniform float uOpacity;

void main() {
  vec4 base = texture(uPrev, v_uv);
  vec4 ov = texture(uOverlay, vec2(v_uv.x, 1.0 - v_uv.y)); // canvas is top-down
  outColor = vec4(mix(base.rgb, ov.rgb, clamp(ov.a * uOpacity, 0.0, 1.0)), 1.0);
}`;

const COLORS = {
  blanco: '#f2f2f2',
  teal: '#4fd8c7',
  rojo: '#ff4633',
  ambar: '#f5a623',
};

const clampI = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Tracking state is per (engine × instance): preview and export run the
// same effect concurrently and must never share history.
const stateByEngine = new WeakMap();

function trackState(engine, fx) {
  let byId = stateByEngine.get(engine);
  if (!byId) {
    byId = new Map();
    stateByEngine.set(engine, byId);
  }
  let s = byId.get(fx.id);
  if (!s) {
    s = {
      prev: null,          // previous luma grid (auto)
      bg: null,            // background model (auto, EMA)
      tracks: [],          // { id, cx, cy, w, h, vx, vy, life, age, mass, trail }
      nextId: 1,
      stamp: -1,           // engine push stamp of the last analysed frame
      points: new Map(),   // seedId → patch tracker
    };
    byId.set(fx.id, s);
  }
  return s;
}

// ---------------------------------------------------------------- AUTO mode

/** Motion mask against the previous frame or the background model. */
function motionMask(s, g, p) {
  const n = g.luma.length;
  const ref = p.detect === 'fondo' ? s.bg : s.prev;
  const mask = new Uint8Array(n);
  if (!ref || ref.length !== n) return mask;
  for (let i = 0; i < n; i++) {
    mask[i] = Math.abs(g.luma[i] - ref[i]) > p.sensitivity ? 1 : 0;
  }
  return denoise(mask, g.cols, g.rows);
}

/**
 * Erode-then-dilate: a lone flickering cell dies, a real moving object keeps
 * its silhouette. This is what stops the boxes from chasing sensor noise.
 */
function denoise(mask, cols, rows) {
  const eroded = new Uint8Array(mask.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!mask[i]) continue;
      let n = 0;
      if (x > 0 && mask[i - 1]) n++;
      if (x < cols - 1 && mask[i + 1]) n++;
      if (y > 0 && mask[i - cols]) n++;
      if (y < rows - 1 && mask[i + cols]) n++;
      if (n >= 2) eroded[i] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!eroded[i]) continue;
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
 * flagging the spot an object just left ("ghosts") until the model catches
 * up; those regions have no live change, so this is what filters them out.
 */
function frameActivity(g, prev, r) {
  const x0 = Math.max(0, Math.floor((r.cx - r.w / 2) * g.cols));
  const x1 = Math.min(g.cols - 1, Math.ceil((r.cx + r.w / 2) * g.cols));
  const y0 = Math.max(0, Math.floor((r.cy - r.h / 2) * g.rows));
  const y1 = Math.min(g.rows - 1, Math.ceil((r.cy + r.h / 2) * g.rows));
  let sum = 0, n = 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * g.cols;
    for (let x = x0; x <= x1; x++) {
      sum += Math.abs(g.luma[row + x] - prev[row + x]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Connected components (4-neighbour) over a binary motion mask. */
function findRegions(mask, cols, rows, minMass) {
  const seen = new Uint8Array(mask.length);
  const regions = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let mass = 0, sx = 0, sy = 0;
    let minx = cols, maxx = 0, miny = rows, maxy = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % cols, y = (i / cols) | 0;
      mass++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < cols - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - cols] && !seen[i - cols]) { seen[i - cols] = 1; stack.push(i - cols); }
      if (y < rows - 1 && mask[i + cols] && !seen[i + cols]) { seen[i + cols] = 1; stack.push(i + cols); }
    }
    if (mass >= minMass) {
      regions.push({
        cx: (sx / mass + 0.5) / cols,
        cy: (sy / mass + 0.5) / rows,
        w: (maxx - minx + 1) / cols,
        h: (maxy - miny + 1) / rows,
        mass,
      });
    }
  }
  return regions.sort((a, b) => b.mass - a.mass);
}

/**
 * Greedy nearest-neighbour association. Detections are matched against the
 * track's *predicted* position (constant velocity), which is what lets an
 * ID survive a fast-moving subject instead of being reborn every frame.
 */
function updateTracks(s, regions, p, matchRadius) {
  const smoothing = Math.min(p.smoothing, 0.95);
  const alpha = 1 - smoothing;
  const freeDet = new Set(regions.map((_, i) => i));
  const pairs = [];
  for (const tr of s.tracks) {
    const px = tr.cx + tr.vx;
    const py = tr.cy + tr.vy;
    for (const i of freeDet) {
      const d = Math.hypot(regions[i].cx - px, regions[i].cy - py);
      if (d < matchRadius) pairs.push([d, tr, i]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const usedTracks = new Set();
  for (const [, tr, i] of pairs) {
    if (usedTracks.has(tr) || !freeDet.has(i)) continue;
    usedTracks.add(tr);
    freeDet.delete(i);
    const r = regions[i];
    tr.vx = tr.vx * smoothing + (r.cx - tr.cx) * alpha;
    tr.vy = tr.vy * smoothing + (r.cy - tr.cy) * alpha;
    tr.cx += (r.cx - tr.cx) * alpha;
    tr.cy += (r.cy - tr.cy) * alpha;
    tr.w += (r.w - tr.w) * alpha;
    tr.h += (r.h - tr.h) * alpha;
    tr.mass = r.mass;
    tr.life = p.persistence;
    tr.age++;
  }
  for (const tr of s.tracks) {
    if (!usedTracks.has(tr)) {
      tr.life--;
      tr.cx += tr.vx; // coast on inertia while persisting
      tr.cy += tr.vy;
    }
  }
  s.tracks = s.tracks.filter((tr) => tr.life > 0 && tr.cx > -0.1 && tr.cx < 1.1);
  for (const i of freeDet) {
    if (s.tracks.length >= p.maxBoxes * 2) break;
    const r = regions[i];
    s.tracks.push({ id: s.nextId++, ...r, vx: 0, vy: 0, life: p.persistence, age: 1, trail: [] });
  }
  for (const tr of s.tracks) pushTrail(tr, p.trail);
}

// -------------------------------------------------------------- POINTS mode

/** Summed-area table so a candidate patch mean costs O(1) during the search. */
function integral(g) {
  const { cols, rows, luma } = g;
  const w = cols + 1;
  const sat = new Float64Array(w * (rows + 1));
  for (let y = 0; y < rows; y++) {
    let rowSum = 0;
    for (let x = 0; x < cols; x++) {
      rowSum += luma[y * cols + x];
      sat[(y + 1) * w + x + 1] = sat[y * w + x + 1] + rowSum;
    }
  }
  return { sat, w };
}

function windowMean(I, px, py, H, area) {
  const x0 = px - H, y0 = py - H, x1 = px + H + 1, y1 = py + H + 1;
  const { sat, w } = I;
  return (sat[y1 * w + x1] - sat[y0 * w + x1] - sat[y1 * w + x0] + sat[y0 * w + x0]) / area;
}

/** Mean-normalized patch — brightness changes don't break the match. */
function samplePatch(g, px, py, H) {
  const n = 2 * H + 1;
  const out = new Float32Array(n * n);
  let sum = 0;
  for (let j = 0; j < n; j++) {
    const row = (py - H + j) * g.cols;
    for (let i = 0; i < n; i++) {
      const v = g.luma[row + px - H + i];
      out[j * n + i] = v;
      sum += v;
    }
  }
  const mean = sum / out.length;
  for (let k = 0; k < out.length; k++) out[k] -= mean;
  return out;
}

/** How much detail a template carries — a flat patch matches everything. */
function patchEnergy(tmpl) {
  let s = 0;
  for (let i = 0; i < tmpl.length; i++) s += Math.abs(tmpl[i]);
  return s / tmpl.length;
}

/**
 * Snap a click to the most trackable spot nearby: the window with the highest
 * gradient energy (a corner or edge, never flat wall). Clicking roughly on
 * the subject is then good enough to get a point that actually holds.
 */
function pickFeature(g, cx, cy, H, R) {
  const loX = H, hiX = g.cols - 1 - H;
  const loY = H, hiY = g.rows - 1 - H;
  const ox = clampI(cx, loX, hiX);
  const oy = clampI(cy, loY, hiY);

  const energy = (px, py) => {
    let e = 0;
    for (let j = -H; j <= H; j++) {
      const row = (py + j) * g.cols + px - H;
      for (let i = 0; i < 2 * H; i++) e += Math.abs(g.luma[row + i + 1] - g.luma[row + i]);
      if (j < H) {
        for (let i = 0; i <= 2 * H; i++) e += Math.abs(g.luma[row + i + g.cols] - g.luma[row + i]);
      }
    }
    return e;
  };

  let bx = ox, by = oy;
  // the click itself wins ties: a candidate must be clearly better to steal it
  let best = energy(ox, oy) * 1.15;
  for (let dy = -R; dy <= R; dy++) {
    const py = clampI(oy + dy, loY, hiY);
    for (let dx = -R; dx <= R; dx++) {
      const px = clampI(ox + dx, loX, hiX);
      const e = energy(px, py);
      if (e > best) { best = e; bx = px; by = py; }
    }
  }
  return { x: bx, y: by };
}

/**
 * Coarse-to-fine SAD search for `tmpl` around (cx, cy) within radius R.
 *
 * `bias` adds a penalty proportional to the distance from the prediction, so
 * a far-away lookalike (repeating texture, a second identical object) has to
 * be clearly better to steal the point. It only affects which candidate wins
 * — the reported `mad` is always the raw match error.
 *
 * @returns {{x, y, mad}} best integer position and its mean abs. difference.
 */
function matchPatch(g, I, tmpl, H, cx, cy, R, bias = 0) {
  const n = 2 * H + 1;
  const area = n * n;
  const loX = H, hiX = g.cols - 1 - H;
  const loY = H, hiY = g.rows - 1 - H;
  const ax = clampI(cx, loX, hiX);
  const ay = clampI(cy, loY, hiY);

  const mad = (px, py) => {
    const mean = windowMean(I, px, py, H, area);
    let sad = 0;
    for (let j = 0; j < n; j++) {
      const row = (py - H + j) * g.cols + px - H;
      const trow = j * n;
      for (let i = 0; i < n; i++) {
        const d = (g.luma[row + i] - mean) - tmpl[trow + i];
        sad += d < 0 ? -d : d;
      }
    }
    return sad / area;
  };
  const penalty = (px, py) =>
    (bias > 0 ? (bias * Math.hypot(px - ax, py - ay)) / R : 0);

  let bx = ax, by = ay;
  let bestRaw = mad(bx, by);
  let best = bestRaw;

  // Coarse pass over the whole radius, then a fine pass around its winner.
  // The coarse step grows with the radius so a wide recovery search costs
  // roughly the same as a normal one.
  const coarse = Math.max(2, Math.round(R / 10));
  for (const [step, radius] of [[coarse, R], [1, coarse]]) {
    const ox = bx, oy = by;
    for (let dy = -radius; dy <= radius; dy += step) {
      const py = clampI(oy + dy, loY, hiY);
      for (let dx = -radius; dx <= radius; dx += step) {
        const px = clampI(ox + dx, loX, hiX);
        const raw = mad(px, py);
        const m = raw + penalty(px, py);
        if (m < best) { best = m; bestRaw = raw; bx = px; by = py; }
      }
    }
  }
  return { x: bx, y: by, mad: bestRaw };
}

/**
 * Whole-frame re-acquisition. Only runs for a point that has been lost for a
 * while (occlusion, a cut, a subject that left and came back) — a local
 * search can never recover from that, a global one can.
 */
function matchGlobal(g, I, tmpl, H, step) {
  const n = 2 * H + 1;
  const area = n * n;
  let bx = H, by = H, best = Infinity;
  for (let py = H; py <= g.rows - 1 - H; py += step) {
    for (let px = H; px <= g.cols - 1 - H; px += step) {
      const mean = windowMean(I, px, py, H, area);
      let sad = 0;
      for (let j = 0; j < n; j++) {
        const row = (py - H + j) * g.cols + px - H;
        const trow = j * n;
        for (let i = 0; i < n; i++) {
          const d = (g.luma[row + i] - mean) - tmpl[trow + i];
          sad += d < 0 ? -d : d;
        }
      }
      if (sad < best) { best = sad; bx = px; by = py; }
    }
  }
  return matchPatch(g, I, tmpl, H, bx, by, step); // refine around the winner
}

/** Sync tracker entries with the seed list the UI owns (fx._points). */
function syncPoints(s, fx) {
  const seeds = fx._points ?? [];
  const alive = new Set(seeds.map((sd) => sd.id));
  for (const id of [...s.points.keys()]) {
    if (!alive.has(id)) s.points.delete(id);
  }
  for (const sd of seeds) {
    const pt = s.points.get(sd.id);
    if (!pt || pt.anchor !== (sd.anchor ?? 0)) {
      // new point, or the user re-anchored it: forget the old template
      s.points.set(sd.id, {
        id: sd.id, x: sd.x, y: sd.y, vx: 0, vy: 0,
        conf: 1, lost: 0, trail: [], tmpl: null, H: 0,
        anchor: sd.anchor ?? 0,
      });
    }
  }
  return seeds;
}

function updatePoints(s, fx, g, p) {
  const seeds = syncPoints(s, fx);
  if (seeds.length === 0) return;

  const H = clampI(Math.round(p.patch), 2, Math.floor(Math.min(g.cols, g.rows) / 3));
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
      pt.vx = 0; pt.vy = 0;
      pt.conf = pt.weak ? 0 : 1;
      pt.lost = 0;
      pushTrail(pt, p.trail);
      continue;
    }

    // Predict with the current velocity, then search around the prediction.
    // After a miss the radius widens: a subject that jumped (fast motion, a
    // dropped frame, an occlusion) is re-acquired instead of lost for good.
    const qx = clampI(Math.round((pt.x + pt.vx) * g.cols), H, g.cols - 1 - H);
    const qy = clampI(Math.round((pt.y + pt.vy) * g.rows), H, g.rows - 1 - H);
    // Score matches against how much detail the template has: a residual of
    // 0.02 is excellent on a flat patch and mediocre on a busy one.
    const tolerance = Math.max(MIN_ENERGY, pt.energy) * 0.7;
    const hit = pt.lost > p.persistence && pt.lost % 4 === 0
      ? matchGlobal(g, I, pt.tmpl, H, Math.max(2, H >> 1))
      : matchPatch(g, I, pt.tmpl, H, qx, qy,
        R * (1 + Math.min(pt.lost, 3)), tolerance * 0.5);
    const conf = pt.weak ? 0 : clampI(1 - hit.mad / tolerance, 0, 1);
    pt.conf = pt.conf * 0.5 + conf * 0.5;

    if (conf > ACCEPT_CONF) {
      const nx = (hit.x + 0.5) / g.cols;
      const ny = (hit.y + 0.5) / g.rows;
      if (Math.hypot(nx - pt.x, ny - pt.y) > p.search * 1.5) {
        pt.vx = 0; pt.vy = 0;   // re-acquired somewhere else: no stale inertia
      } else {
        pt.vx = pt.vx * smoothing + (nx - pt.x) * (1 - smoothing);
        pt.vy = pt.vy * smoothing + (ny - pt.y) * (1 - smoothing);
      }
      pt.x = nx;
      pt.y = ny;
      pt.lost = 0;
      // Slow template adaptation: follows lighting/pose drift without
      // letting the patch slide onto the background.
      if (p.adapt > 0.001) {
        const fresh = samplePatch(g, hit.x, hit.y, H);
        const a = p.adapt * conf;
        for (let k = 0; k < pt.tmpl.length; k++) {
          pt.tmpl[k] += (fresh[k] - pt.tmpl[k]) * a;
        }
        pt.energy = patchEnergy(pt.tmpl);
      }
    } else {
      pt.lost++;
      pt.x = clampI(pt.x + pt.vx, 0, 1); // coast while the match is missing
      pt.y = clampI(pt.y + pt.vy, 0, 1);
      pt.vx *= 0.85;
      pt.vy *= 0.85;
    }
    pushTrail(pt, p.trail);
  }
}

function pushTrail(item, len) {
  const n = Math.round(len);
  if (n <= 0) { item.trail.length = 0; return; }
  item.trail.push(item.cx ?? item.x, item.cy ?? item.y);
  const max = n * 2;
  if (item.trail.length > max) item.trail.splice(0, item.trail.length - max);
}

// ------------------------------------------------------------------ drawing

/** Deterministic readout per auto track — looks like tracker confidence. */
function readout(tr) {
  const spd = Math.hypot(tr.vx, tr.vy);
  return Math.min(1.9999, 0.18 + spd * 42 + tr.mass / 900).toFixed(4);
}

/** Both trackers reduce to the same drawable "mark". */
function collectMarks(s, p, aspect) {
  const marks = [];
  if (p.mode !== 'puntos') {
    const auto = s.tracks
      .filter((tr) => tr.age >= WARMUP_FRAMES)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, Math.round(p.maxBoxes));
    for (const tr of auto) {
      marks.push({
        id: tr.id, tag: `M${String(tr.id).padStart(2, '0')}`,
        cx: tr.cx, cy: tr.cy,
        w: tr.w + 0.024, h: tr.h + 0.024,
        vx: tr.vx, vy: tr.vy,
        value: readout(tr), trail: tr.trail, lost: false, manual: false,
      });
    }
  }
  if (p.mode !== 'auto') {
    let i = 0;
    for (const pt of s.points.values()) {
      const H = pt.H || Math.round(p.patch);
      const size = (H * 2 + 1) / TRACK_COLS * 1.8;
      marks.push({
        id: 10000 + i, sid: pt.id, tag: `P${String(++i).padStart(2, '0')}`,
        cx: pt.x, cy: pt.y,
        w: size, h: size * aspect, // square on screen
        vx: pt.vx, vy: pt.vy,
        value: pt.weak ? 'SIN TEXTURA' : pt.conf.toFixed(3), trail: pt.trail,
        lost: pt.weak || pt.lost > p.persistence, manual: true,
      });
    }
  }
  return marks;
}

function drawOverlay(engine, marks, p) {
  const W = engine.width, H = engine.height;
  const cv = engine._mtCanvas ?? (engine._mtCanvas = document.createElement('canvas'));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);

  const col = COLORS[p.color] ?? COLORS.blanco;
  const sc = Math.max(0.6, H / 540);
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = Math.max(1, 1.1 * sc);
  c.font = `${Math.round(9 * sc)}px 'JetBrains Mono', Consolas, monospace`;

  // trails: where each mark has been — the clearest proof it is tracking
  for (const m of marks) {
    if (m.trail.length < 4) continue;
    c.save();
    c.lineWidth = Math.max(1, 0.9 * sc);
    const pts = m.trail.length / 2;
    for (let i = 1; i < pts; i++) {
      c.globalAlpha = (i / pts) * 0.55;
      c.beginPath();
      c.moveTo(m.trail[(i - 1) * 2] * W, m.trail[(i - 1) * 2 + 1] * H);
      c.lineTo(m.trail[i * 2] * W, m.trail[i * 2 + 1] * H);
      c.stroke();
    }
    c.restore();
  }

  // neighbor lines: connect each mark to its nearest peer (deduped)
  if (p.lines === 'vecinos' && marks.length > 1) {
    c.save();
    c.globalAlpha = 0.75;
    const drawn = new Set();
    for (const a of marks) {
      let best = null, bd = Infinity;
      for (const b of marks) {
        if (b === a) continue;
        const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        if (d < bd) { bd = d; best = b; }
      }
      if (!best) continue;
      const key = a.id < best.id ? `${a.id}-${best.id}` : `${best.id}-${a.id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      c.beginPath();
      c.moveTo(a.cx * W, a.cy * H);
      c.lineTo(best.cx * W, best.cy * H);
      c.stroke();
      if (p.values === 'yes') {
        c.fillText(bd.toFixed(4), ((a.cx + best.cx) / 2) * W + 3 * sc, ((a.cy + best.cy) / 2) * H - 3 * sc);
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
    const style = m.manual && p.style === 'rect' ? 'cruz' : p.style;
    if (style === 'circulo') {
      c.beginPath();
      c.ellipse(m.cx * W, m.cy * H, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (style === 'esquinas') {
      const t = Math.min(w, h) * 0.28;
      c.beginPath();
      c.moveTo(x, y + t); c.lineTo(x, y); c.lineTo(x + t, y);
      c.moveTo(x + w - t, y); c.lineTo(x + w, y); c.lineTo(x + w, y + t);
      c.moveTo(x + w, y + h - t); c.lineTo(x + w, y + h); c.lineTo(x + w - t, y + h);
      c.moveTo(x + t, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - t);
      c.stroke();
    } else if (style === 'cruz') {
      const r = Math.max(w, h) / 2;
      const gap = r * 0.35;
      c.beginPath();
      c.moveTo(m.cx * W - r, m.cy * H); c.lineTo(m.cx * W - gap, m.cy * H);
      c.moveTo(m.cx * W + gap, m.cy * H); c.lineTo(m.cx * W + r, m.cy * H);
      c.moveTo(m.cx * W, m.cy * H - r); c.lineTo(m.cx * W, m.cy * H - gap);
      c.moveTo(m.cx * W, m.cy * H + gap); c.lineTo(m.cx * W, m.cy * H + r);
      c.stroke();
      c.strokeRect(x, y, w, h);
    } else {
      c.strokeRect(x, y, w, h);
    }
    c.restore();

    if (p.lines === 'vectores') {
      const k = 14;
      c.save();
      c.globalAlpha = 0.8;
      c.beginPath();
      c.moveTo((m.cx - m.vx * k) * W, (m.cy - m.vy * k) * H);
      c.lineTo(m.cx * W, m.cy * H);
      c.stroke();
      c.restore();
    }
    if (p.values === 'yes') {
      c.fillText(m.value, x + w + 3 * sc, y + 8 * sc);
      c.save();
      c.globalAlpha = 0.75;
      c.fillText(m.lost ? `${m.tag} LOST` : m.tag, x, y - 3 * sc);
      c.restore();
    }
  }
  return cv;
}

export default {
  type: 'motionTrack',
  label: 'MOTION_TRACK',
  desc: 'Tracker real: AUTO detecta movimiento solo; PUNTOS sigue los puntos que marques en el visor (clic en el visor con «ELEGIR PUNTOS»). Colócalo al final de la cadena.',
  hasTrackPoints: true,
  params: [
    { key: 'mode', label: 'MODO', type: 'select', def: 'auto',
      options: [['auto', 'AUTO (movimiento)'], ['puntos', 'PUNTOS (manual)'], ['ambos', 'AMBOS']],
      help: 'AUTO detecta zonas en movimiento. PUNTOS sigue por correlación los puntos que marcas en el visor.' },
    { key: 'detect', label: 'REFERENCIA', type: 'select', def: 'fondo',
      options: [['fondo', 'FONDO (objeto)'], ['previo', 'FRAME PREVIO']],
      help: 'FONDO compara contra un modelo de fondo acumulado: marca el objeto entero. FRAME PREVIO sólo marca los bordes que cambian.' },
    { key: 'sensitivity', label: 'SENSIBILIDAD', min: 0.02, max: 0.5, step: 0.01, def: 0.08,
      help: 'Umbral de cambio para considerar movimiento. Bajo = detecta más.' },
    { key: 'minArea',     label: 'ÁREA MÍN', min: 1, max: 60, step: 1, def: 5,
      help: 'Tamaño mínimo de una zona de movimiento (en celdas) para crear caja.' },
    { key: 'maxBoxes',    label: 'CAJAS MÁX', min: 1, max: 24, step: 1, def: 8 },
    { key: 'smoothing',   label: 'SUAVIZADO', min: 0, max: 0.95, step: 0.01, def: 0.55,
      help: 'Suaviza la posición entre frames. Alto = más estable pero con retardo.' },
    { key: 'persistence', label: 'PERSISTENCIA (f)', min: 1, max: 40, step: 1, def: 12,
      help: 'Frames que una marca sobrevive sin detección (sigue por inercia).' },
    { key: 'search',      label: 'RADIO BÚSQUEDA', min: 0.02, max: 0.3, step: 0.005, def: 0.10,
      help: 'PUNTOS: cuánto se busca alrededor de la posición prevista. Súbelo si el sujeto se mueve rápido.' },
    { key: 'patch',       label: 'VENTANA', min: 3, max: 14, step: 1, def: 6,
      help: 'PUNTOS: tamaño del parche que identifica al punto. Grande = más estable, menos preciso.' },
    { key: 'adapt',       label: 'ADAPTACIÓN', min: 0, max: 0.6, step: 0.01, def: 0.12,
      help: 'PUNTOS: cuánto se actualiza el parche cada frame. Alto = aguanta cambios de luz, riesgo de deriva.' },
    { key: 'trail',       label: 'ESTELA (f)', min: 0, max: 90, step: 1, def: 24,
      help: 'Frames de recorrido dibujados detrás de cada marca.' },
    { key: 'opacity',     label: 'OPACIDAD', min: 0, max: 1, step: 0.01, def: 1 },
    { key: 'style',       label: 'ESTILO', type: 'select', def: 'rect',
      options: [['rect', 'CAJAS'], ['esquinas', 'ESQUINAS'], ['circulo', 'CÍRCULOS'], ['cruz', 'MIRILLAS']] },
    { key: 'lines',       label: 'LÍNEAS', type: 'select', def: 'vecinos',
      options: [['vecinos', 'VECINOS'], ['vectores', 'VECTORES'], ['no', 'NO']] },
    { key: 'values',      label: 'VALORES', type: 'select', def: 'yes',
      options: [['yes', 'SÍ'], ['no', 'NO']] },
    { key: 'color',       label: 'COLOR', type: 'select', def: 'blanco',
      options: [['blanco', 'BLANCO'], ['teal', 'TEAL'], ['rojo', 'ROJO'], ['ambar', 'ÁMBAR']] },
  ],
  presets: {
    ORGANICO: { mode: 'auto', detect: 'fondo', style: 'rect', lines: 'vecinos', values: 'yes', sensitivity: 0.08, smoothing: 0.55, trail: 24 },
    LAB:      { mode: 'auto', detect: 'fondo', style: 'esquinas', lines: 'vectores', color: 'teal', sensitivity: 0.07, maxBoxes: 12, trail: 40 },
    MINIMAL:  { mode: 'auto', style: 'circulo', lines: 'no', values: 'no', maxBoxes: 4, smoothing: 0.85, trail: 0 },
    PUNTOS:   { mode: 'puntos', style: 'cruz', lines: 'no', values: 'yes', color: 'teal', trail: 40, search: 0.10, patch: 6 },
    VIGILANCIA: { mode: 'ambos', detect: 'fondo', style: 'esquinas', lines: 'vecinos', color: 'ambar', trail: 30, maxBoxes: 6 },
  },
  frag,

  analyze(engine, fx, ctx) {
    const p = ctx.params(fx);
    const s = trackState(engine, fx);
    const g = engine.lumaGrid(AUTO_COLS);
    if (!g) return;

    // Only advance tracking on genuinely new frames; while paused the marks
    // stay frozen instead of decaying against a static image.
    if (s.stamp !== g.stamp) {
      if (p.mode !== 'puntos') {
        let mask = null;
        if (s.prev && s.prev.length === g.luma.length) {
          mask = motionMask(s, g, p);
          let regions = findRegions(mask, g.cols, g.rows, p.minArea);
          if (p.detect === 'fondo') {
            regions = regions.filter(
              (r) => frameActivity(g, s.prev, r) > p.sensitivity * 0.35);
          }
          // fast subjects need a wider gate; keep it tied to the search radius
          updateTracks(s, regions, p, Math.max(0.08, p.search * 2));
        }
        // Selective background update: cells covered by motion barely learn,
        // so the model never swallows the subject and stops leaving a ghost
        // box behind it. The small leak lets a subject that parks become
        // background eventually.
        if (!s.bg || s.bg.length !== g.luma.length) s.bg = g.luma.slice();
        else {
          for (let i = 0; i < s.bg.length; i++) {
            s.bg[i] += (g.luma[i] - s.bg[i]) * (mask && mask[i] ? 0.004 : 0.06);
          }
        }
        s.prev = g.luma.slice();
      }
      if (p.mode !== 'auto') {
        const fine = engine.lumaGrid(TRACK_COLS);
        if (fine) updatePoints(s, fx, fine, p);
      }
      s.stamp = g.stamp;
    } else if (p.mode !== 'auto') {
      syncPoints(s, fx); // reflect points added/removed while paused
    }

    const marks = collectMarks(s, p, engine.width / Math.max(1, engine.height));
    engine.uploadTex(engine.instanceTex(`${fx.id}:ov`), drawOverlay(engine, marks, p));
    fx._vizRegions = marks;                              // time-map panel
    fx._vizPoints = marks.filter((m) => m.manual);       // viewport markers
  },

  setUniforms(gl, u, p, ctx, engine, fx) {
    const slot = engine.instanceTex(`${fx.id}:ov`);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.uniform1i(u('uOverlay'), 2);
    gl.uniform1f(u('uOpacity'), p.opacity);
  },
  maxReach: () => 1, // only needs the previous frame
  delayMap(p, ctx, fx) {
    // The time-map shows what the tracker is holding on to.
    const marks = fx?._vizRegions ?? [];
    return (x, y) => {
      const yTop = 1 - y;
      for (const m of marks) {
        if (Math.abs(x - m.cx) < m.w / 2 + 0.012 && Math.abs(yTop - m.cy) < m.h / 2 + 0.012) return 1;
      }
      return 0;
    };
  },
};
