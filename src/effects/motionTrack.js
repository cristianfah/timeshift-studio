// MOTION_TRACK — real motion tracking rendered as a lab overlay: frame
// differencing on a low-res luma grid → connected regions → tracks with
// stable IDs, EMA smoothing, persistence and velocity estimates. Drawn as
// boxes + neighbor lines + numeric readouts, composited in-shader so it
// exports at full resolution like any other effect.

const GRID_COLS = 96;
const MATCH_RADIUS = 0.16;   // max normalized centroid distance to keep an ID
const WARMUP_FRAMES = 2;     // frames a region must live before being drawn

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
};

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
      prev: null,          // previous luma grid
      tracks: [],          // { id, cx, cy, w, h, vx, vy, life, age, mass }
      nextId: 1,
      stamp: -1,           // engine push stamp of the last analysed frame
      canvas: document.createElement('canvas'),
    };
    byId.set(fx.id, s);
  }
  return s;
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

/** Greedy nearest-neighbour matching of detections onto existing tracks. */
function updateTracks(s, regions, p) {
  const smoothing = Math.min(p.smoothing, 0.95);
  const alpha = 1 - smoothing;
  const freeDet = new Set(regions.map((_, i) => i));
  const pairs = [];
  for (const tr of s.tracks) {
    for (const i of freeDet) {
      const d = Math.hypot(regions[i].cx - tr.cx, regions[i].cy - tr.cy);
      if (d < MATCH_RADIUS) pairs.push([d, tr, i]);
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
    s.tracks.push({ id: s.nextId++, ...r, vx: 0, vy: 0, life: p.persistence, age: 1 });
  }
}

/** Deterministic readout value per track — looks like tracker confidence. */
function readout(tr) {
  const spd = Math.hypot(tr.vx, tr.vy);
  return Math.min(1.9999, 0.18 + spd * 42 + tr.mass / 900).toFixed(4);
}

function visibleTracks(s, p) {
  return s.tracks
    .filter((tr) => tr.age >= WARMUP_FRAMES)
    .sort((a, b) => b.mass - a.mass)
    .slice(0, p.maxBoxes);
}

function drawOverlay(engine, s, p) {
  const W = engine.width, H = engine.height;
  const cv = s.canvas;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);

  const col = COLORS[p.color] ?? COLORS.blanco;
  const sc = Math.max(0.6, H / 540);
  const tracks = visibleTracks(s, p);
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = Math.max(1, 1.1 * sc);
  c.font = `${Math.round(9 * sc)}px 'JetBrains Mono', Consolas, monospace`;

  // neighbor lines: connect each region to its nearest peer (deduped)
  if (p.lines === 'vecinos' && tracks.length > 1) {
    c.save();
    c.globalAlpha = 0.75;
    const drawn = new Set();
    for (const a of tracks) {
      let best = null, bd = Infinity;
      for (const b of tracks) {
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

  for (const tr of tracks) {
    const pad = 0.012;
    const w = (tr.w + pad * 2) * W;
    const h = (tr.h + pad * 2) * H;
    const x = tr.cx * W - w / 2;
    const y = tr.cy * H - h / 2;

    if (p.style === 'circulo') {
      c.beginPath();
      c.ellipse(tr.cx * W, tr.cy * H, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (p.style === 'esquinas') {
      const t = Math.min(w, h) * 0.28;
      c.beginPath();
      c.moveTo(x, y + t); c.lineTo(x, y); c.lineTo(x + t, y);
      c.moveTo(x + w - t, y); c.lineTo(x + w, y); c.lineTo(x + w, y + t);
      c.moveTo(x + w, y + h - t); c.lineTo(x + w, y + h); c.lineTo(x + w - t, y + h);
      c.moveTo(x + t, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - t);
      c.stroke();
    } else {
      c.strokeRect(x, y, w, h);
    }

    if (p.lines === 'vectores') {
      const k = 14;
      c.save();
      c.globalAlpha = 0.8;
      c.beginPath();
      c.moveTo((tr.cx - tr.vx * k) * W, (tr.cy - tr.vy * k) * H);
      c.lineTo(tr.cx * W, tr.cy * H);
      c.stroke();
      c.restore();
    }
    if (p.values === 'yes') {
      c.fillText(readout(tr), x + w + 3 * sc, y + 8 * sc);
    }
  }
}

export default {
  type: 'motionTrack',
  label: 'MOTION_TRACK',
  params: [
    { key: 'sensitivity', label: 'SENSIBILIDAD', min: 0.02, max: 0.5, step: 0.01, def: 0.10 },
    { key: 'minArea',     label: 'ÁREA MÍN', min: 1, max: 60, step: 1, def: 6 },
    { key: 'maxBoxes',    label: 'CAJAS MÁX', min: 1, max: 24, step: 1, def: 8 },
    { key: 'smoothing',   label: 'SUAVIZADO', min: 0, max: 0.95, step: 0.01, def: 0.65 },
    { key: 'persistence', label: 'PERSISTENCIA (f)', min: 1, max: 40, step: 1, def: 10 },
    { key: 'opacity',     label: 'OPACIDAD', min: 0, max: 1, step: 0.01, def: 1 },
    { key: 'style',       label: 'ESTILO', type: 'select', def: 'rect',
      options: [['rect', 'CAJAS'], ['esquinas', 'ESQUINAS'], ['circulo', 'CÍRCULOS']] },
    { key: 'lines',       label: 'LÍNEAS', type: 'select', def: 'vecinos',
      options: [['vecinos', 'VECINOS'], ['vectores', 'VECTORES'], ['no', 'NO']] },
    { key: 'values',      label: 'VALORES', type: 'select', def: 'yes',
      options: [['yes', 'SÍ'], ['no', 'NO']] },
    { key: 'color',       label: 'COLOR', type: 'select', def: 'blanco',
      options: [['blanco', 'BLANCO'], ['teal', 'TEAL'], ['rojo', 'ROJO']] },
  ],
  presets: {
    ORGANICO: { style: 'rect', lines: 'vecinos', values: 'yes', sensitivity: 0.10, smoothing: 0.65 },
    LAB:      { style: 'esquinas', lines: 'vectores', color: 'teal', sensitivity: 0.08, maxBoxes: 12 },
    MINIMAL:  { style: 'circulo', lines: 'no', values: 'no', maxBoxes: 4, smoothing: 0.85 },
  },
  frag,

  analyze(engine, fx, ctx) {
    const p = ctx.params(fx);
    const s = trackState(engine, fx);
    const g = engine.lumaGrid(GRID_COLS);
    if (!g) return;

    // Only advance tracking on genuinely new frames; while paused the
    // boxes stay frozen instead of decaying against a static image.
    if (s.stamp !== g.stamp) {
      if (s.prev && s.prev.length === g.luma.length) {
        const mask = new Uint8Array(g.luma.length);
        for (let i = 0; i < mask.length; i++) {
          mask[i] = Math.abs(g.luma[i] - s.prev[i]) > p.sensitivity ? 1 : 0;
        }
        const regions = findRegions(mask, g.cols, g.rows, p.minArea);
        updateTracks(s, regions, p);
      }
      s.prev = g.luma.slice();
      s.stamp = g.stamp;
    }
    drawOverlay(engine, s, p);
    engine.uploadTex(engine.instanceTex(`${fx.id}:ov`), s.canvas);
    fx._vizRegions = visibleTracks(s, p); // for the time-map panel
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
    // The time-map shows the live motion mask: tracked regions light up.
    const regions = fx?._vizRegions ?? [];
    return (x, y) => {
      const yTop = 1 - y;
      for (const r of regions) {
        if (Math.abs(x - r.cx) < r.w / 2 + 0.012 && Math.abs(yTop - r.cy) < r.h / 2 + 0.012) return 1;
      }
      return 0;
    };
  },
};
