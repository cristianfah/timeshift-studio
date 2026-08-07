// RGB_TIME_SPLIT — R, G and B channels sampled from three different points
// in time.

import type { EffectModule } from "../types";

export type RgbSplitParams = {
  delayB: number;
  delayG: number;
  delayR: number;
};

const frag = `
uniform float uDelayR, uDelayG, uDelayB;

void main() {
  float r = chainAt(v_uv, uDelayR).r;
  float g = chainAt(v_uv, uDelayG).g;
  float b = chainAt(v_uv, uDelayB).b;
  outColor = vec4(r, g, b, 1.0);
}`;

const rgbSplit: EffectModule<RgbSplitParams> = {
  desc: "Los canales rojo, verde y azul se toman de tres momentos distintos del clip.",
  frag,
  label: "Desfase RGB",
  params: [
    { def: 0, key: "delayR", label: "Rojo", max: 90, min: 0, step: 1, unit: "f" },
    { def: 8, key: "delayG", label: "Verde", max: 90, min: 0, step: 1, unit: "f" },
    { def: 16, key: "delayB", label: "Azul", max: 90, min: 0, step: 1, unit: "f" },
  ],
  presets: {
    ACIDO: { delayB: 45, delayG: 20, delayR: 0 },
    ANAGLIFO: { delayB: 12, delayG: 0, delayR: 12 },
    CROMA_SUAVE: { delayB: 8, delayG: 4, delayR: 0 },
  },
  type: "rgbSplit",

  delayMap(p) {
    const reach = Math.max(p.delayR, p.delayG, p.delayB);

    return () => reach;
  },

  maxReach: (p) => Math.max(p.delayR, p.delayG, p.delayB),

  setUniforms(gl, u, p) {
    gl.uniform1f(u("uDelayR"), p.delayR);
    gl.uniform1f(u("uDelayG"), p.delayG);
    gl.uniform1f(u("uDelayB"), p.delayB);
  },
};

export default rgbSplit;
