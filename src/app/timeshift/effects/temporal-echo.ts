// TEMPORAL_ECHO — current frame blended with N past frames at decaying
// opacity (motion trails). Blend modes: normal / screen / difference.

import type { EffectModule } from "../types";

export type TemporalEchoParams = {
  blend: string;
  decay: number;
  echoes: number;
  spacing: number;
};

const frag = `
uniform float uEchoes, uSpacing, uDecay;
uniform int uBlendMode; // 0 normal, 1 screen, 2 difference

void main() {
  vec4 acc = texture(uPrev, v_uv);
  float w = 1.0;
  for (int i = 1; i <= 16; i++) {
    if (float(i) > uEchoes + 0.5) break;
    w *= uDecay;
    vec4 c = frameAt(v_uv, float(i) * uSpacing);
    if (uBlendMode == 0)      acc = mix(acc, c, w * 0.5);
    else if (uBlendMode == 1) acc = 1.0 - (1.0 - acc) * (1.0 - c * w);
    else                      acc = abs(acc - c * w);
  }
  outColor = vec4(acc.rgb, 1.0);
}`;

const BLEND_MODES: Record<string, number> = {
  difference: 2,
  normal: 0,
  screen: 1,
};

const temporalEcho: EffectModule<TemporalEchoParams> = {
  desc: "Estelas de movimiento: el frame actual se funde con varios frames pasados cada vez más tenues.",
  frag,
  label: "Eco temporal",
  params: [
    { def: 5, key: "echoes", label: "Ecos", max: 16, min: 1, step: 1 },
    {
      def: 4,
      key: "spacing",
      label: "Separación",
      max: 30,
      min: 1,
      step: 1,
      unit: "f",
    },
    {
      def: 0.6,
      help: "Cuánta opacidad pierde cada eco respecto al anterior.",
      key: "decay",
      label: "Caída",
      max: 0.95,
      min: 0.1,
      step: 0.01,
    },
    {
      def: "normal",
      key: "blend",
      label: "Fusión",
      options: [
        ["normal", "Normal"],
        ["screen", "Trama"],
        ["difference", "Diferencia"],
      ],
      type: "select",
    },
  ],
  presets: {
    ESTELA: { blend: "screen", decay: 0.85, echoes: 12, spacing: 2 },
    FANTASMA: { blend: "normal", decay: 0.75, echoes: 8, spacing: 3 },
    NEGATIVO: { blend: "difference", decay: 0.7, echoes: 4, spacing: 6 },
  },
  type: "temporalEcho",

  delayMap(p) {
    const reach = p.echoes * p.spacing;

    // Spatially uniform — show the mean temporal reach.
    return () => reach * 0.5;
  },

  maxReach: (p) => p.echoes * p.spacing,

  setUniforms(gl, u, p) {
    gl.uniform1f(u("uEchoes"), p.echoes);
    gl.uniform1f(u("uSpacing"), p.spacing);
    gl.uniform1f(u("uDecay"), p.decay);
    gl.uniform1i(u("uBlendMode"), BLEND_MODES[p.blend] ?? 0);
  },
};

export default temporalEcho;
