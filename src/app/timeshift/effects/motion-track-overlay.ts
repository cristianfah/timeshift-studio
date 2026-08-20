// MOTION_TRACK · overlay — the lab drawing shared by both trackers.
//
// Marks are rendered into a host-owned 2D canvas and composited in-shader, so
// the overlay exports at full resolution instead of being scaled up.

import type { ChainItem, EffectHost, TrackMark } from "../types";

import {
  COLORS,
  TRACK_COLS,
  WARMUP_FRAMES,
  overlayCanvasByHost,
  type AutoTrack,
  type MotionTrackParams,
  type TrackerState,
} from "./motion-track-state";

/** Deterministic readout per auto track — looks like tracker confidence. */
function readout(tr: AutoTrack): string {
  const spd = Math.hypot(tr.vx, tr.vy);

  return Math.min(1.9999, 0.18 + spd * 42 + tr.mass / 900).toFixed(4);
}

/** Both trackers reduce to the same drawable "mark". */
export function collectMarks(
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

export function drawOverlay(
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
