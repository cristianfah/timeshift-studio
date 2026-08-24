// Shared state and vocabulary for MOTION_TRACK.
//
// Both trackers — automatic motion regions and user-placed points — live in
// one per-engine, per-instance state object so preview and export never share
// history, and both produce the same drawable marks.

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

export const AUTO_COLS = 96; // motion-detection grid
export const TRACK_COLS = 256; // patch-tracking grid (finer: real features)
export const WARMUP_FRAMES = 2; // frames an auto region must live before drawing
export const MIN_ENERGY = 0.02; // patch texture below this has nothing to lock onto
export const ACCEPT_CONF = 0.4; // weaker matches never move a point (they coast)

export const frag = `
uniform sampler2D uOverlay;
uniform float uOpacity;

void main() {
  vec4 base = texture(uPrev, v_uv);
  vec4 ov = texture(uOverlay, vec2(v_uv.x, 1.0 - v_uv.y)); // canvas is top-down
  outColor = vec4(mix(base.rgb, ov.rgb, clamp(ov.a * uOpacity, 0.0, 1.0)), 1.0);
}`;

export const COLORS: Record<string, string> = {
  ambar: "#f5a623",
  blanco: "#f2f2f2",
  rojo: "#ff4633",
  teal: "#4fd8c7",
};

export const clampI = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export type AutoTrack = {
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

export type Region = {
  cx: number;
  cy: number;
  h: number;
  mass: number;
  w: number;
};

export type PointTracker = {
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

export type TrackerState = {
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
export const overlayCanvasByHost = new WeakMap<EffectHost, HTMLCanvasElement>();

export function trackState(host: EffectHost, fx: ChainItem): TrackerState {
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

/** Appends a point to a trail and trims it to the requested length. */
export function pushTrail(
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

