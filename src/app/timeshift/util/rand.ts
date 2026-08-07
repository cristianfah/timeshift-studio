// JS mirrors of the GLSL hash/noise in the shader prelude — the time-map
// readout computes the same per-pixel delays on the CPU, so both views must
// agree bit-for-bit-ish.

export function fract(x: number): number {
  return x - Math.floor(x);
}

export function tsHash(n: number): number {
  return fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
}

export function tsHash2(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clampv(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 3D value noise, matching vnoise3() in GLSL. */
export function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const n = ix + iy * 57 + iz * 113;
  const a = lerp(
    lerp(tsHash(n), tsHash(n + 1), fx),
    lerp(tsHash(n + 57), tsHash(n + 58), fx),
    fy,
  );
  const b = lerp(
    lerp(tsHash(n + 113), tsHash(n + 114), fx),
    lerp(tsHash(n + 170), tsHash(n + 171), fx),
    fy,
  );
  return lerp(a, b, fz);
}

export function fbm3(x: number, y: number, z: number): number {
  return (
    vnoise3(x, y, z) * 0.6 +
    vnoise3(x * 2.13, y * 2.13, z * 1.7) * 0.28 +
    vnoise3(x * 4.7, y * 4.7, z * 2.9) * 0.12
  );
}
