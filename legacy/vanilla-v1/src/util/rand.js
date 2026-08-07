// JS mirrors of the GLSL hash/noise in the shader prelude — the time-map
// visualization computes the same per-pixel delays on the CPU, so both
// views must agree bit-for-bit-ish.

export function fract(x) {
  return x - Math.floor(x);
}

export function tsHash(n) {
  return fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
}

export function tsHash2(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** 3D value noise, matching vnoise3() in GLSL. */
export function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const n = ix + iy * 57 + iz * 113;
  const a = lerp(
    lerp(tsHash(n), tsHash(n + 1), fx),
    lerp(tsHash(n + 57), tsHash(n + 58), fx), fy);
  const b = lerp(
    lerp(tsHash(n + 113), tsHash(n + 114), fx),
    lerp(tsHash(n + 170), tsHash(n + 171), fx), fy);
  return lerp(a, b, fz);
}

export function fbm3(x, y, z) {
  return vnoise3(x, y, z) * 0.6
    + vnoise3(x * 2.13, y * 2.13, z * 1.7) * 0.28
    + vnoise3(x * 4.7, y * 4.7, z * 2.9) * 0.12;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
