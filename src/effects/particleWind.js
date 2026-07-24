// VIENTO — directional particle dissolution: the image smears along a wind
// direction through space AND time (each streak tap samples an older
// frame), gated by a flickering grain mask. The "subject dissolving into
// wind" look.

import { fbm3, tsHash2 } from './common.js';

const frag = `
uniform float uAngle, uPower, uTurb, uStepF, uGrain, uMixAmt, uSeed;

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

void main() {
  float a = radians(uAngle);
  vec2 dir = vec2(cos(a), sin(a));
  float n0 = fbm3(vec3(v_uv * uTurb, uTime * 0.35 + uSeed * 7.0));

  // 9-tap streak: spatial offset + temporal reach grow along the wind.
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i) / 8.0;
    float jit = fbm3(vec3(v_uv * uTurb * 2.0 + fi * 13.7, uTime * 0.5 + uSeed)) - 0.5;
    vec2 off = dir * uPower * fi * (0.35 + 0.65 * n0)
             + vec2(dir.y, -dir.x) * jit * uPower * 0.35;
    float w = 1.0 - fi * 0.8;
    acc += chainAt(v_uv - off, float(i) * uStepF) * w;
    wsum += w;
  }
  vec4 smear = acc / wsum;

  // Particle grain: ~3px cells flickering in time.
  vec2 gcell = floor(v_uv * uRes / 3.0);
  float epoch = floor(uTime * 12.0);
  float gr = tsHash2(gcell + vec2(epoch * 17.0, uSeed * 29.0));
  float gate = step(gr, uGrain);

  vec3 base = texture(uPrev, v_uv).rgb;
  outColor = vec4(mix(base, smear.rgb, uMixAmt * (0.35 + 0.65 * gate)), 1.0);
}`;

export default {
  type: 'particleWind',
  label: 'VIENTO',
  desc: 'Disolución direccional: la imagen se arrastra por el espacio y por frames antiguos a lo largo del viento, con grano parpadeante.',
  params: [
    { key: 'angle', label: 'ÁNGULO', min: 0, max: 360, step: 1, def: 0 },
    { key: 'power', label: 'FUERZA', min: 0, max: 0.5, step: 0.005, def: 0.15,
      help: 'Distancia del arrastre en pantalla.' },
    { key: 'turb',  label: 'TURBULENCIA', min: 0.5, max: 10, step: 0.1, def: 3 },
    { key: 'stepF', label: 'PASO T (f)', min: 0, max: 15, step: 1, def: 3,
      help: 'Cuántos frames retrocede cada paso de la estela (0 = solo smear espacial).' },
    { key: 'grain', label: 'GRANO', min: 0, max: 1, step: 0.01, def: 0.55,
      help: 'Densidad del parpadeo de partículas.' },
    { key: 'mix',   label: 'MEZCLA', min: 0, max: 1, step: 0.01, def: 0.85 },
    { key: 'seed',  label: 'SEED', min: 0, max: 100, step: 1, def: 3 },
  ],
  presets: {
    BRISA:      { power: 0.06, turb: 4, stepF: 2, grain: 0.7, mix: 0.6 },
    ESTAMPIDA:  { power: 0.3, turb: 2.5, stepF: 6, grain: 0.5, mix: 0.95 },
    POLVO:      { power: 0.12, turb: 8, stepF: 4, grain: 0.3, mix: 0.9 },
  },
  frag,
  setUniforms(gl, u, p) {
    gl.uniform1f(u('uAngle'), p.angle);
    gl.uniform1f(u('uPower'), p.power);
    gl.uniform1f(u('uTurb'), p.turb);
    gl.uniform1f(u('uStepF'), p.stepF);
    gl.uniform1f(u('uGrain'), p.grain);
    gl.uniform1f(u('uMixAmt'), p.mix);
    gl.uniform1f(u('uSeed'), p.seed);
  },
  maxReach: (p) => 8 * p.stepF,
  delayMap(p, ctx) {
    return (x, y) => {
      const n0 = fbm3(x * p.turb, y * p.turb, ctx.time * 0.35 + p.seed * 7);
      return (0.35 + 0.65 * n0) * 4 * p.stepF; // mean streak reach
    };
  },
};
