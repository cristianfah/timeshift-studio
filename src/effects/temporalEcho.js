// TEMPORAL_ECHO — current frame blended with N past frames at decaying
// opacity (motion trails). Blend modes: normal / screen / difference.

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

export default {
  type: 'temporalEcho',
  label: 'TEMPORAL_ECHO',
  desc: 'Estelas de movimiento: el frame actual se funde con N frames pasados de opacidad decreciente.',
  params: [
    { key: 'echoes',  label: 'ECOS', min: 1, max: 16, step: 1, def: 5 },
    { key: 'spacing', label: 'ESPACIADO (f)', min: 1, max: 30, step: 1, def: 4 },
    { key: 'decay',   label: 'DECAY', min: 0.1, max: 0.95, step: 0.01, def: 0.6,
      help: 'Cuánta opacidad pierde cada eco respecto al anterior.' },
    { key: 'blend',   label: 'FUSIÓN', type: 'select', def: 'normal',
      options: [['normal', 'NORMAL'], ['screen', 'SCREEN'], ['difference', 'DIFERENCIA']] },
  ],
  presets: {
    FANTASMA: { echoes: 8, spacing: 3, decay: 0.75, blend: 'normal' },
    ESTELA:   { echoes: 12, spacing: 2, decay: 0.85, blend: 'screen' },
    NEGATIVO: { echoes: 4, spacing: 6, decay: 0.7, blend: 'difference' },
  },
  frag,
  setUniforms(gl, u, p) {
    const modes = { normal: 0, screen: 1, difference: 2 };
    gl.uniform1f(u('uEchoes'), p.echoes);
    gl.uniform1f(u('uSpacing'), p.spacing);
    gl.uniform1f(u('uDecay'), p.decay);
    gl.uniform1i(u('uBlendMode'), modes[p.blend] ?? 0);
  },
  maxReach: (p) => p.echoes * p.spacing,
  delayMap(p) {
    const reach = p.echoes * p.spacing;
    return () => reach * 0.5; // spatially uniform — show mean temporal reach
  },
};
