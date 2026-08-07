// TIME_DISPLACEMENT — per-pixel time offset driven by a grayscale map:
// linear gradient / radial / noise / animated noise / user image.

import type { EffectModule } from "../types";
import { clampv, fbm3 } from "../util/rand";

export type TimeDisplacementParams = {
  invert: string;
  mapRotation: number;
  mapScale: number;
  mapType: string;
  maxDelay: number;
};

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

const MAP_TYPES: Record<string, number> = {
  animnoise: 3,
  custom: 4,
  gradient: 0,
  noise: 2,
  radial: 1,
};

function mapValueJS(
  x: number,
  y: number,
  p: TimeDisplacementParams,
  time: number,
): number {
  const r = (p.mapRotation * Math.PI) / 180;
  const cx = x - 0.5;
  const cy = y - 0.5;
  const sc = Math.max(p.mapScale, 0.001);
  const qx = (Math.cos(r) * cx - Math.sin(r) * cy) / sc + 0.5;
  const qy = (Math.sin(r) * cx + Math.cos(r) * cy) / sc + 0.5;
  let m: number;

  switch (p.mapType) {
    case "radial":
      m = clampv(Math.hypot(qx - 0.5, qy - 0.5) * 2, 0, 1);
      break;
    case "noise":
      m = fbm3(qx * 5, qy * 5, 7);
      break;
    case "animnoise":
      m = fbm3(qx * 5, qy * 5, time * 0.6);
      break;
    case "custom":
      m = 0.5; // image content is not mirrored on the CPU
      break;
    default:
      m = clampv(qx, 0, 1);
  }

  return p.invert === "yes" ? 1 - m : m;
}

const timeDisplacement: EffectModule<TimeDisplacementParams> = {
  desc: "Un mapa de grises decide cuánto retrocede en el tiempo cada píxel.",
  frag,
  hasCustomMap: true,
  label: "Desplazamiento temporal",
  params: [
    {
      def: 45,
      help: "Cuántos frames hacia atrás mira el píxel más retrasado del mapa.",
      key: "maxDelay",
      label: "Retardo máximo",
      max: 150,
      min: 0,
      step: 1,
      unit: "f",
    },
    {
      def: "gradient",
      key: "mapType",
      label: "Mapa",
      options: [
        ["gradient", "Degradado"],
        ["radial", "Radial"],
        ["noise", "Ruido"],
        ["animnoise", "Ruido animado"],
        ["custom", "Imagen propia"],
      ],
      type: "select",
    },
    { def: 1, key: "mapScale", label: "Escala", max: 8, min: 0.25, step: 0.05 },
    {
      def: 0,
      key: "mapRotation",
      label: "Rotación",
      max: 360,
      min: 0,
      step: 1,
      unit: "°",
    },
    {
      def: "no",
      key: "invert",
      label: "Invertir",
      options: [
        ["no", "No"],
        ["yes", "Sí"],
      ],
      type: "select",
    },
  ],
  presets: {
    NIEBLA: { mapScale: 2, mapType: "animnoise", maxDelay: 50 },
    OLA: { invert: "no", mapRotation: 90, mapScale: 1, mapType: "gradient", maxDelay: 60 },
    TUNEL: { invert: "yes", mapScale: 1.2, mapType: "radial", maxDelay: 80 },
  },
  type: "timeDisplacement",

  delayMap(p, ctx) {
    return (x, y) => mapValueJS(x, y, p, ctx.time) * p.maxDelay;
  },

  maxReach: (p) => p.maxDelay,

  setUniforms(gl, u, p, _ctx, host, fx) {
    gl.uniform1f(u("uMaxDelay"), p.maxDelay);
    gl.uniform1f(u("uMapScale"), p.mapScale);
    gl.uniform1f(u("uMapRot"), p.mapRotation);
    gl.uniform1i(u("uMapType"), MAP_TYPES[p.mapType] ?? 0);
    gl.uniform1i(u("uInvert"), p.invert === "yes" ? 1 : 0);

    // The custom map image lives on the instance; the GL texture is per-engine
    // (preview and export contexts must never share GL objects).
    if (fx.mapImage) {
      const slot = host.instanceTex(`${fx.id}:map`);
      const stamp = fx.mapStamp ?? 0;

      if (slot.stamp !== stamp) {
        host.uploadTex(slot, fx.mapImage);
        slot.stamp = stamp;
      }

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    }

    gl.uniform1i(u("uMap"), 2);
  },
};

export default timeDisplacement;
