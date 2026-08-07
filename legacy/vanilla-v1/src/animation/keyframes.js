// Keyframe track operations. Keys: { t: seconds, v: value, ease: mode }.
// `ease` shapes the segment LEAVING that key: linear | in | out | inout.

export const EASE_MODES = ['linear', 'in', 'out', 'inout'];

export function addKey(keys, t, v, ease = 'linear') {
  // Replace a key when landing within half a frame of an existing one.
  const existing = keys.find((k) => Math.abs(k.t - t) < 0.02);
  if (existing) {
    existing.v = v;
    return existing;
  }
  const key = { t, v, ease };
  keys.push(key);
  sortKeys(keys);
  return key;
}

export function sortKeys(keys) {
  keys.sort((a, b) => a.t - b.t);
}

export function cycleEase(key) {
  const i = EASE_MODES.indexOf(key.ease);
  key.ease = EASE_MODES[(i + 1) % EASE_MODES.length];
  return key.ease;
}

function applyEase(u, mode) {
  switch (mode) {
    case 'in': return u * u;
    case 'out': return 1 - (1 - u) * (1 - u);
    case 'inout': return u * u * (3 - 2 * u);
    default: return u;
  }
}

/** Evaluate a keyframe track at clip time t. Returns null when empty. */
export function interpKeys(keys, t) {
  if (!keys || keys.length === 0) return null;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = Math.max(b.t - a.t, 1e-6);
      const u = applyEase((t - a.t) / span, a.ease);
      return a.v + (b.v - a.v) * u;
    }
  }
  return last.v;
}
