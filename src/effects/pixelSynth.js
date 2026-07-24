// PIXEL_SYNTH — brightness becomes layered texture composition: each cell
// is replaced by a glyph (symbols / ASCII / code chars / solid blocks)
// picked by its luminance. A luma band (range) lets several stacked
// instances build layered compositions; delay pulls the pattern from the
// source's past.

const CHARSETS = {
  simbolos: [' ', '·', '◦', '+', '○', '◎', '●', '@', '■'],
  ascii:    [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'],
  codigo:   [' ', '/', 'I', '4', 'H', 'S', 'X', 'M', '8', '#', '@'],
};

const frag = `
uniform vec2 uGrid;
uniform float uDelayF, uRangeMin, uRangeMax, uGlyphCount;
uniform int uCharMode;   // 0 atlas glyphs, 1 procedural blocks
uniform int uColorMode;  // 0 white ink, 1 source color, 2 over video
uniform int uInvert;
uniform sampler2D uAtlas;

void main() {
  vec2 cellIdx = floor(v_uv * uGrid);
  vec2 center = (cellIdx + 0.5) / uGrid;
  vec2 cuv = fract(v_uv * uGrid);

  vec4 src = chainAt(center, uDelayF);
  float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  if (uInvert == 1) luma = 1.0 - luma;

  // Outside the luma band the layer is transparent (chain passthrough).
  if (luma < uRangeMin || luma > uRangeMax) {
    outColor = vec4(texture(uPrev, v_uv).rgb, 1.0);
    return;
  }
  float t = clamp((luma - uRangeMin) / max(uRangeMax - uRangeMin, 0.001), 0.0, 1.0);

  float g;
  if (uCharMode == 1) {
    vec2 d = abs(cuv - 0.5);
    g = step(max(d.x, d.y), t * 0.48); // block grows with brightness
  } else {
    float idx = floor(t * (uGlyphCount - 1.0) + 0.5);
    // atlas canvas is top-down; cell uv is bottom-up
    vec2 auv = vec2((idx + cuv.x) / uGlyphCount, 1.0 - cuv.y);
    g = texture(uAtlas, auv).a;
  }

  vec3 bg = (uColorMode == 2) ? texture(uPrev, v_uv).rgb : vec3(0.024, 0.031, 0.043);
  vec3 ink = (uColorMode == 1) ? src.rgb : vec3(0.90);
  outColor = vec4(mix(bg, ink, g), 1.0);
}`;

/** Build (once per engine+charset) a 1-row glyph atlas canvas. */
function atlasSlot(engine, charset) {
  const slot = engine.instanceTex(`glyphs:${charset}`);
  if (slot.stamp < 0) {
    const chars = CHARSETS[charset] ?? CHARSETS.simbolos;
    const CELL = 64;
    const canvas = document.createElement('canvas');
    canvas.width = CELL * chars.length;
    canvas.height = CELL;
    const c2d = canvas.getContext('2d');
    c2d.clearRect(0, 0, canvas.width, CELL);
    c2d.fillStyle = '#fff';
    c2d.font = `${CELL * 0.82}px 'JetBrains Mono', Consolas, monospace`;
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    for (let i = 0; i < chars.length; i++) {
      c2d.fillText(chars[i], (i + 0.5) * CELL, CELL * 0.54);
    }
    engine.uploadTex(slot, canvas);
    slot.stamp = 1;
    slot.count = chars.length;
  }
  return slot;
}

export default {
  type: 'pixelSynth',
  label: 'PIXEL_SYNTH',
  params: [
    { key: 'cell',     label: 'CELDA (px)', min: 4, max: 64, step: 1, def: 12 },
    { key: 'charset',  label: 'CARACTERES', type: 'select', def: 'simbolos',
      options: [['simbolos', 'SÍMBOLOS'], ['ascii', 'ASCII'], ['codigo', 'CÓDIGO'], ['bloques', 'BLOQUES']] },
    { key: 'ink',      label: 'TINTA', type: 'select', def: 'blanco',
      options: [['blanco', 'BLANCO'], ['fuente', 'COLOR FUENTE'], ['video', 'SOBRE VIDEO']] },
    { key: 'delay',    label: 'DELAY (f)', min: 0, max: 150, step: 1, def: 0 },
    { key: 'rangeMin', label: 'RANGO MÍN', min: 0, max: 1, step: 0.01, def: 0 },
    { key: 'rangeMax', label: 'RANGO MÁX', min: 0, max: 1, step: 0.01, def: 1 },
    { key: 'invert',   label: 'INVERTIR', type: 'select', def: 'no',
      options: [['no', 'NO'], ['yes', 'SÍ']] },
  ],
  presets: {
    PIXELSYNTH: { charset: 'simbolos', cell: 14, ink: 'blanco' },
    CRASH:      { charset: 'codigo', cell: 10, ink: 'fuente', rangeMin: 0.05 },
    ASCII:      { charset: 'ascii', cell: 12, ink: 'blanco' },
    MOSAICO:    { charset: 'bloques', cell: 16, ink: 'fuente' },
  },
  frag,
  setUniforms(gl, u, p, ctx, engine) {
    const cell = Math.max(4, p.cell);
    // Square cells at buffer resolution.
    gl.uniform2f(u('uGrid'),
      Math.max(2, Math.round(engine.width / cell)),
      Math.max(2, Math.round(engine.height / cell)));
    gl.uniform1f(u('uDelayF'), p.delay);
    gl.uniform1f(u('uRangeMin'), Math.min(p.rangeMin, p.rangeMax));
    gl.uniform1f(u('uRangeMax'), Math.max(p.rangeMin, p.rangeMax));
    gl.uniform1i(u('uInvert'), p.invert === 'yes' ? 1 : 0);
    gl.uniform1i(u('uColorMode'), p.ink === 'fuente' ? 1 : p.ink === 'video' ? 2 : 0);

    if (p.charset === 'bloques') {
      gl.uniform1i(u('uCharMode'), 1);
      gl.uniform1f(u('uGlyphCount'), 1);
    } else {
      const slot = atlasSlot(engine, p.charset);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
      gl.uniform1i(u('uCharMode'), 0);
      gl.uniform1f(u('uGlyphCount'), slot.count);
    }
    gl.uniform1i(u('uAtlas'), 2);
  },
  maxReach: (p) => p.delay,
  delayMap(p) {
    return () => p.delay; // spatially uniform time reach
  },
};
