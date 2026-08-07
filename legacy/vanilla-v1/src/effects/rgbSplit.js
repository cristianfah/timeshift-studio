// RGB_TIME_SPLIT — R, G and B channels sampled from three different
// points in time.

const frag = `
uniform float uDelayR, uDelayG, uDelayB;

void main() {
  float r = chainAt(v_uv, uDelayR).r;
  float g = chainAt(v_uv, uDelayG).g;
  float b = chainAt(v_uv, uDelayB).b;
  outColor = vec4(r, g, b, 1.0);
}`;

export default {
  type: 'rgbSplit',
  label: 'RGB_TIME_SPLIT',
  desc: 'Los canales rojo, verde y azul se toman de tres momentos distintos del clip.',
  params: [
    { key: 'delayR', label: 'DELAY R (f)', min: 0, max: 90, step: 1, def: 0 },
    { key: 'delayG', label: 'DELAY G (f)', min: 0, max: 90, step: 1, def: 8 },
    { key: 'delayB', label: 'DELAY B (f)', min: 0, max: 90, step: 1, def: 16 },
  ],
  presets: {
    CROMA_SUAVE: { delayR: 0, delayG: 4, delayB: 8 },
    ANAGLIFO:    { delayR: 12, delayG: 0, delayB: 12 },
    ACIDO:       { delayR: 0, delayG: 20, delayB: 45 },
  },
  frag,
  setUniforms(gl, u, p) {
    gl.uniform1f(u('uDelayR'), p.delayR);
    gl.uniform1f(u('uDelayG'), p.delayG);
    gl.uniform1f(u('uDelayB'), p.delayB);
  },
  maxReach: (p) => Math.max(p.delayR, p.delayG, p.delayB),
  delayMap(p) {
    const reach = Math.max(p.delayR, p.delayG, p.delayB);
    return () => reach;
  },
};
