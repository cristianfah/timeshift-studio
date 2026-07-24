// PIXEL_SYNTH — brightness becomes layered texture composition: each cell
// is replaced by a glyph (symbols / ASCII / code chars / blocks) picked by
// its luminance. Text density is fully controllable: cell size, glyph
// density (sparse scatter → full grid), up to 3 overlaid grids at
// different scales, and random glyph variation. A luma band (range) lets
// several stacked instances build compositions; delay pulls the pattern
// from the source's past.

const CHARSETS = {
  simbolos: [' ', '·', '◦', '+', '○', '◎', '●', '@', '■'],
  ascii:    [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'],
  codigo:   [' ', '/', 'I', '4', 'H', 'S', 'X', 'M', '8', '#', '@'],
};

const frag = `
uniform vec2 uGrid;
uniform float uDelayF, uRangeMin, uRangeMax, uGlyphCount;
uniform float uDensity, uVariation, uLayers;
uniform int uCharMode;   // 0 atlas glyphs, 1 procedural blocks
uniform int uColorMode;  // 0 white ink, 1 source color
uniform int uBgMode;     // 0 solid black (covers the video), 1 video shows through
uniform int uInvert;
uniform sampler2D uAtlas;

// One glyph grid at a given scale. Returns coverage; outputs ink color and
// whether the cell's luma fell inside the active band.
float layerGlyph(vec2 grid, float layerId, out vec3 ink, out float inBand) {
  vec2 cellIdx = floor(v_uv * grid);
  vec2 center = (cellIdx + 0.5) / grid;
  vec2 cuv = fract(v_uv * grid);

  vec4 src = chainAt(center, uDelayF);
  float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  if (uInvert == 1) luma = 1.0 - luma;

  ink = (uColorMode == 1) ? src.rgb : vec3(0.90);
  inBand = 0.0;
  if (luma < uRangeMin || luma > uRangeMax) return 0.0;
  inBand = 1.0;
  float t = clamp((luma - uRangeMin) / max(uRangeMax - uRangeMin, 0.001), 0.0, 1.0);

  // Density gate: fewer glyphs as density drops; bright cells survive longest.
  if (uDensity < 0.999) {
    float gate = tsHash2(cellIdx + vec2(layerId * 91.7, layerId * 37.3));
    if (gate > uDensity * (0.25 + 0.75 * t)) return 0.0;
  }

  if (uCharMode == 1) {
    vec2 d = abs(cuv - 0.5);
    return step(max(d.x, d.y), t * 0.48); // block grows with brightness
  }
  float idx = floor(t * (uGlyphCount - 1.0) + 0.5);
  if (uVariation > 0.001) {
    float rv = (tsHash2(cellIdx * 3.1 + vec2(7.0 + layerId * 5.0, 13.0)) - 0.5)
             * uVariation * uGlyphCount * 0.6;
    idx = clamp(idx + floor(rv + 0.5), 0.0, uGlyphCount - 1.0);
  }
  // atlas canvas is top-down; cell uv is bottom-up
  vec2 auv = vec2((idx + cuv.x) / uGlyphCount, 1.0 - cuv.y);
  return texture(uAtlas, auv).a;
}

void main() {
  vec3 bg = (uBgMode == 1) ? texture(uPrev, v_uv).rgb : vec3(0.024, 0.031, 0.043);
  vec3 col = bg;
  float anyBand = 0.0;
  // Paint order coarse → base → fine so smaller glyphs land on top.
  for (int i = 0; i < 3; i++) {
    if (float(i) >= uLayers) break;
    float scale =
      (i == 0) ? ((uLayers > 2.5) ? 0.5 : 1.0) :
      (i == 1) ? ((uLayers > 2.5) ? 1.0 : 2.0) : 2.0;
    vec3 ink; float inBand;
    float g = layerGlyph(uGrid * scale, scale * 10.0, ink, inBand);
    col = mix(col, ink, g);
    anyBand = max(anyBand, inBand);
  }
  // FONDO=NEGRO fully covers the video, even outside the luma band.
  // FONDO=VIDEO keeps out-of-band cells transparent to the chain so
  // stacked instances with different ranges compose.
  outColor = vec4((uBgMode == 0 || anyBand > 0.0) ? col : texture(uPrev, v_uv).rgb, 1.0);
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
  desc: 'El brillo del video se convierte en texto/símbolos por celda. CELDA y DENSIDAD controlan cuánto texto hay; CAPAS superpone rejillas a distintas escalas.',
  params: [
    { key: 'cell',      label: 'CELDA (px)', min: 4, max: 64, step: 1, def: 12,
      help: 'Tamaño de cada carácter. Más pequeño = más texto por imagen.' },
    { key: 'density',   label: 'DENSIDAD', min: 0.05, max: 1, step: 0.01, def: 1,
      help: 'Cuántas celdas dibujan carácter. Bajo = dispersión de símbolos sueltos (las zonas brillantes sobreviven más).' },
    { key: 'layers',    label: 'CAPAS', min: 1, max: 3, step: 1, def: 1,
      help: '1 = una rejilla · 2 = añade rejilla fina (2×) encima · 3 = añade también rejilla gruesa (½×) debajo.' },
    { key: 'variation', label: 'VARIACIÓN', min: 0, max: 1, step: 0.01, def: 0,
      help: 'Sustituye caracteres al azar para que zonas de igual brillo no repitan el mismo glifo.' },
    { key: 'charset',   label: 'CARACTERES', type: 'select', def: 'simbolos',
      options: [['simbolos', 'SÍMBOLOS'], ['ascii', 'ASCII'], ['codigo', 'CÓDIGO'], ['bloques', 'BLOQUES']] },
    { key: 'ink',       label: 'TINTA', type: 'select', def: 'blanco',
      options: [['blanco', 'BLANCO'], ['fuente', 'COLOR FUENTE']] },
    { key: 'bg',        label: 'FONDO', type: 'select', def: 'negro',
      options: [['negro', 'NEGRO (tapa video)'], ['video', 'VIDEO VISIBLE']],
      help: 'NEGRO: el efecto reemplaza el video por completo. VIDEO: el video se ve detrás/entre los caracteres.' },
    { key: 'delay',     label: 'DELAY (f)', min: 0, max: 150, step: 1, def: 0,
      help: 'El patrón de texto se toma de un frame del pasado en vez del actual.' },
    { key: 'rangeMin',  label: 'RANGO MÍN', min: 0, max: 1, step: 0.01, def: 0,
      help: 'Luminancia mínima que dibuja texto. Apila varias instancias con rangos distintos para composiciones por capas.' },
    { key: 'rangeMax',  label: 'RANGO MÁX', min: 0, max: 1, step: 0.01, def: 1,
      help: 'Luminancia máxima que dibuja texto; por encima, la imagen pasa sin tocar.' },
    { key: 'invert',    label: 'INVERTIR', type: 'select', def: 'no',
      options: [['no', 'NO'], ['yes', 'SÍ']] },
  ],
  presets: {
    PIXELSYNTH: { charset: 'simbolos', cell: 14, ink: 'blanco', bg: 'negro', layers: 2, density: 0.85, variation: 0.25 },
    CRASH:      { charset: 'codigo', cell: 10, ink: 'fuente', bg: 'negro', rangeMin: 0.05, variation: 0.6, layers: 1, density: 1 },
    ASCII:      { charset: 'ascii', cell: 12, ink: 'blanco', bg: 'negro', variation: 0.15, layers: 1, density: 1 },
    DENSO:      { charset: 'codigo', cell: 7, ink: 'blanco', bg: 'negro', layers: 3, density: 1, variation: 0.5 },
    DISPERSO:   { charset: 'simbolos', cell: 18, ink: 'blanco', bg: 'negro', density: 0.3, variation: 0.4, layers: 1 },
    HIBRIDO:    { charset: 'simbolos', cell: 16, ink: 'blanco', bg: 'video', density: 0.5, variation: 0.3, layers: 1 },
    MOSAICO:    { charset: 'bloques', cell: 16, ink: 'fuente', bg: 'negro', layers: 1, density: 1 },
  },
  frag,
  setUniforms(gl, u, p, ctx, engine) {
    const cell = Math.max(4, p.cell);
    gl.uniform2f(u('uGrid'),
      Math.max(2, Math.round(engine.width / cell)),
      Math.max(2, Math.round(engine.height / cell)));
    gl.uniform1f(u('uDelayF'), p.delay);
    gl.uniform1f(u('uRangeMin'), Math.min(p.rangeMin, p.rangeMax));
    gl.uniform1f(u('uRangeMax'), Math.max(p.rangeMin, p.rangeMax));
    gl.uniform1f(u('uDensity'), p.density);
    gl.uniform1f(u('uVariation'), p.variation);
    gl.uniform1f(u('uLayers'), Math.round(p.layers));
    gl.uniform1i(u('uInvert'), p.invert === 'yes' ? 1 : 0);
    gl.uniform1i(u('uColorMode'), p.ink === 'fuente' ? 1 : 0);
    // p.ink === 'video' is the pre-FONDO name for a see-through background
    gl.uniform1i(u('uBgMode'), (p.bg === 'video' || p.ink === 'video') ? 1 : 0);

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
