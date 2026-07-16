// TIME_DISPLACEMENT — per-pixel time offset driven by a grayscale map:
// linear gradient / radial / noise / animated noise / user image.

import { fbm3, clampv } from './common.js';

const frag = `
uniform float uMaxDelay, uMapScale, uMapRot;
uniform int uMapType;  // 0 gradient, 1 radial, 2 noise, 3 animated noise, 4 custom
uniform int uInvert;
uniform sampler2D uMap;

float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + i.z * 113.0;
  float a = mix(mix(tsHash(n), tsHash(n + 1.0), f.x),
                mix(tsHash(n + 57.0), tsHash(n + 58.0), f.x), f.y);
  float b = mix(mix(tsHash(n + 113.0), tsHash(n + 114.0), f.x),
                mix(tsHash(n + 170.0), tsHash(n + 171.0), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm3(vec3 p) {
  return vnoise3(p) * 0.6
       + vnoise3(vec3(p.xy * 2.13, p.z * 1.7)) * 0.28
       + vnoise3(vec3(p.xy * 4.7, p.z * 2.9)) * 0.12;
}

float mapValue(vec2 uv) {
  float r = radians(uMapRot);
  mat2 rot = mat2(cos(r), -sin(r), sin(r), cos(r));
  vec2 q = rot * (uv - 0.5) / max(uMapScale, 0.001) + 0.5;
  float m;
  if (uMapType == 0)      m = clamp(q.x, 0.0, 1.0);
  else if (uMapType == 1) m = clamp(length(q - 0.5) * 2.0, 0.0, 1.0);
  else if (uMapType == 2) m = fbm3(vec3(q * 5.0, 7.0));
  else if (uMapType == 3) m = fbm3(vec3(q * 5.0, uTime * 0.6));
  else {
    vec3 c = texture(uMap, vec2(q.x, 1.0 - q.y)).rgb;
    m = dot(c, vec3(0.299, 0.587, 0.114));
  }
  return (uInvert == 1) ? 1.0 - m : m;
}

void main() {
  float delay = mapValue(v_uv) * uMaxDelay;
  vec4 c = (delay < 0.5) ? texture(uPrev, v_uv) : frameAtSmooth(v_uv, delay);
  outColor = vec4(c.rgb, 1.0);
}`;

const MAP_TYPES = { gradient: 0, radial: 1, noise: 2, animnoise: 3, custom: 4 };

function mapValueJS(x, y, p, time) {
  const r = (p.mapRotation * Math.PI) / 180;
  const cx = x - 0.5, cy = y - 0.5;
  const sc = Math.max(p.mapScale, 0.001);
  const qx = (Math.cos(r) * cx - Math.sin(r) * cy) / sc + 0.5;
  const qy = (Math.sin(r) * cx + Math.cos(r) * cy) / sc + 0.5;
  let m;
  switch (p.mapType) {
    case 'radial': m = clampv(Math.hypot(qx - 0.5, qy - 0.5) * 2, 0, 1); break;
    case 'noise': m = fbm3(qx * 5, qy * 5, 7); break;
    case 'animnoise': m = fbm3(qx * 5, qy * 5, time * 0.6); break;
    case 'custom': m = 0.5; break; // image content not mirrored on CPU
    default: m = clampv(qx, 0, 1);
  }
  return p.invert === 'yes' ? 1 - m : m;
}

export default {
  type: 'timeDisplacement',
  label: 'TIME_DISPLACEMENT',
  params: [
    { key: 'maxDelay',    label: 'DELAY MÁX (f)', min: 0, max: 150, step: 1, def: 45 },
    { key: 'mapType',     label: 'MAPA', type: 'select', def: 'gradient',
      options: [['gradient', 'GRADIENTE'], ['radial', 'RADIAL'], ['noise', 'RUIDO'],
                ['animnoise', 'RUIDO ANIMADO'], ['custom', 'IMAGEN PROPIA']] },
    { key: 'mapScale',    label: 'ESCALA MAPA', min: 0.25, max: 8, step: 0.05, def: 1 },
    { key: 'mapRotation', label: 'ROTACIÓN', min: 0, max: 360, step: 1, def: 0 },
    { key: 'invert',      label: 'INVERTIR', type: 'select', def: 'no',
      options: [['no', 'NO'], ['yes', 'SÍ']] },
  ],
  presets: {
    OLA:    { mapType: 'gradient', maxDelay: 60, mapRotation: 90, mapScale: 1, invert: 'no' },
    TUNEL:  { mapType: 'radial', maxDelay: 80, invert: 'yes', mapScale: 1.2 },
    NIEBLA: { mapType: 'animnoise', maxDelay: 50, mapScale: 2 },
  },
  hasCustomMap: true,
  frag,
  setUniforms(gl, u, p, ctx, engine, fx) {
    gl.uniform1f(u('uMaxDelay'), p.maxDelay);
    gl.uniform1f(u('uMapScale'), p.mapScale);
    gl.uniform1f(u('uMapRot'), p.mapRotation);
    gl.uniform1i(u('uMapType'), MAP_TYPES[p.mapType] ?? 0);
    gl.uniform1i(u('uInvert'), p.invert === 'yes' ? 1 : 0);

    // Custom map image lives on the instance; upload lazily to unit 2.
    if (fx._mapImage && (fx._mapDirty || !fx._mapTex)) {
      fx._mapTex ??= gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, fx._mapTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fx._mapImage);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      fx._mapDirty = false;
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fx._mapTex ?? null);
    gl.uniform1i(u('uMap'), 2);
  },
  maxReach: (p) => p.maxDelay,
  delayMap(p, ctx) {
    return (x, y) => mapValueJS(x, y, p, ctx.time) * p.maxDelay;
  },
};
