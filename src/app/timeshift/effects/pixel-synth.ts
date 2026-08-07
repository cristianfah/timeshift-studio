// PIXEL_SYNTH — brightness becomes layered texture composition: each cell is
// replaced by a glyph (symbols / ASCII / code chars / blocks) picked by its
// luminance. Text density is fully controllable: cell size, glyph density
// (sparse scatter -> full grid), up to 3 overlaid grids at different scales,
// and random glyph variation. A luma band (range) lets several stacked
// instances build compositions; delay pulls the pattern from the source's past.

import type { EffectHost, EffectModule, InstanceTextureSlot } from "../types";

export type PixelSynthParams = {
  bg: string;
  cell: number;
  charset: string;
  delay: number;
  density: number;
  ink: string;
  invert: string;
  layers: number;
  rangeMax: number;
  rangeMin: number;
  variation: number;
};

const CHARSETS: Record<string, readonly string[]> = {
  ascii: [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"],
  codigo: [" ", "/", "I", "4", "H", "S", "X", "M", "8", "#", "@"],
  simbolos: [" ", "·", "◦", "+", "○", "◎", "●", "@", "■"],
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
  // Paint order coarse -> base -> fine so smaller glyphs land on top.
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
  // Fondo=negro fully covers the video, even outside the luma band.
  // Fondo=video keeps out-of-band cells transparent to the chain so stacked
  // instances with different ranges compose.
  outColor = vec4((uBgMode == 0 || anyBand > 0.0) ? col : texture(uPrev, v_uv).rgb, 1.0);
}`;

/** Build (once per engine+charset) a 1-row glyph atlas canvas. */
function atlasSlot(host: EffectHost, charset: string): InstanceTextureSlot {
  const slot = host.instanceTex(`glyphs:${charset}`);

  if (slot.stamp < 0) {
    const chars = CHARSETS[charset] ?? CHARSETS.simbolos ?? [];
    const CELL = 64;
    const canvas = document.createElement("canvas");

    canvas.width = CELL * chars.length;
    canvas.height = CELL;

    const c2d = canvas.getContext("2d");

    if (!c2d) {
      throw new Error("Glyph atlas context creation failed");
    }

    c2d.clearRect(0, 0, canvas.width, CELL);
    c2d.fillStyle = "#fff";
    c2d.font = `${CELL * 0.82}px 'JetBrains Mono', Consolas, monospace`;
    c2d.textAlign = "center";
    c2d.textBaseline = "middle";

    for (let i = 0; i < chars.length; i += 1) {
      c2d.fillText(chars[i] ?? " ", (i + 0.5) * CELL, CELL * 0.54);
    }

    host.uploadTex(slot, canvas);
    slot.stamp = 1;
    slot.count = chars.length;
  }

  return slot;
}

const pixelSynth: EffectModule<PixelSynthParams> = {
  desc: "El brillo del vídeo se convierte en texto o símbolos por celda.",
  frag,
  label: "Síntesis de píxel",
  params: [
    {
      def: 12,
      help: "Tamaño de cada carácter. Cuanto menor, más texto por imagen.",
      key: "cell",
      label: "Celda",
      max: 64,
      min: 4,
      step: 1,
      unit: "px",
    },
    {
      def: 1,
      help: "Cuántas celdas dibujan carácter. Al bajarla quedan símbolos sueltos, y las zonas brillantes sobreviven más.",
      key: "density",
      label: "Densidad",
      max: 1,
      min: 0.05,
      step: 0.01,
    },
    {
      def: 1,
      help: "Rejillas superpuestas a distintas escalas: 2 añade una fina encima, 3 añade también una gruesa debajo.",
      key: "layers",
      label: "Rejillas",
      max: 3,
      min: 1,
      step: 1,
    },
    {
      def: 0,
      help: "Sustituye caracteres al azar para que zonas de igual brillo no repitan el mismo glifo.",
      key: "variation",
      label: "Variación",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      def: "simbolos",
      key: "charset",
      label: "Caracteres",
      options: [
        ["simbolos", "Símbolos"],
        ["ascii", "ASCII"],
        ["codigo", "Código"],
        ["bloques", "Bloques"],
      ],
      type: "select",
    },
    {
      def: "blanco",
      key: "ink",
      label: "Tinta",
      options: [
        ["blanco", "Blanca"],
        ["fuente", "Color de origen"],
      ],
      type: "select",
    },
    {
      def: "negro",
      help: "En negro el efecto reemplaza el vídeo por completo. En vídeo se ve la imagen entre los caracteres.",
      key: "bg",
      label: "Fondo",
      options: [
        ["negro", "Negro"],
        ["video", "Vídeo visible"],
      ],
      type: "select",
    },
    {
      def: 0,
      help: "Toma el patrón de texto de un frame del pasado en lugar del actual.",
      key: "delay",
      label: "Retardo",
      max: 150,
      min: 0,
      step: 1,
      unit: "f",
    },
    {
      def: 0,
      help: "Brillo mínimo que dibuja texto. Apila varias instancias con rangos distintos para componer por capas.",
      key: "rangeMin",
      label: "Brillo mínimo",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      def: 1,
      help: "Brillo máximo que dibuja texto. Por encima, la imagen pasa sin tocar.",
      key: "rangeMax",
      label: "Brillo máximo",
      max: 1,
      min: 0,
      step: 0.01,
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
    ASCII: {
      bg: "negro",
      cell: 12,
      charset: "ascii",
      density: 1,
      ink: "blanco",
      layers: 1,
      variation: 0.15,
    },
    CRASH: {
      bg: "negro",
      cell: 10,
      charset: "codigo",
      density: 1,
      ink: "fuente",
      layers: 1,
      rangeMin: 0.05,
      variation: 0.6,
    },
    DENSO: {
      bg: "negro",
      cell: 7,
      charset: "codigo",
      density: 1,
      ink: "blanco",
      layers: 3,
      variation: 0.5,
    },
    DISPERSO: {
      bg: "negro",
      cell: 18,
      charset: "simbolos",
      density: 0.3,
      ink: "blanco",
      layers: 1,
      variation: 0.4,
    },
    HIBRIDO: {
      bg: "video",
      cell: 16,
      charset: "simbolos",
      density: 0.5,
      ink: "blanco",
      layers: 1,
      variation: 0.3,
    },
    MOSAICO: {
      bg: "negro",
      cell: 16,
      charset: "bloques",
      density: 1,
      ink: "fuente",
      layers: 1,
    },
    PIXELSYNTH: {
      bg: "negro",
      cell: 14,
      charset: "simbolos",
      density: 0.85,
      ink: "blanco",
      layers: 2,
      variation: 0.25,
    },
  },
  type: "pixelSynth",

  delayMap(p) {
    // Spatially uniform time reach.
    return () => p.delay;
  },

  maxReach: (p) => p.delay,

  setUniforms(gl, u, p, _ctx, host) {
    const cell = Math.max(4, p.cell);

    gl.uniform2f(
      u("uGrid"),
      Math.max(2, Math.round(host.width / cell)),
      Math.max(2, Math.round(host.height / cell)),
    );
    gl.uniform1f(u("uDelayF"), p.delay);
    gl.uniform1f(u("uRangeMin"), Math.min(p.rangeMin, p.rangeMax));
    gl.uniform1f(u("uRangeMax"), Math.max(p.rangeMin, p.rangeMax));
    gl.uniform1f(u("uDensity"), p.density);
    gl.uniform1f(u("uVariation"), p.variation);
    gl.uniform1f(u("uLayers"), Math.round(p.layers));
    gl.uniform1i(u("uInvert"), p.invert === "yes" ? 1 : 0);
    gl.uniform1i(u("uColorMode"), p.ink === "fuente" ? 1 : 0);
    // p.ink === "video" is the pre-Fondo name for a see-through background.
    gl.uniform1i(u("uBgMode"), p.bg === "video" || p.ink === "video" ? 1 : 0);

    if (p.charset === "bloques") {
      gl.uniform1i(u("uCharMode"), 1);
      gl.uniform1f(u("uGlyphCount"), 1);
    } else {
      const slot = atlasSlot(host, p.charset);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
      gl.uniform1i(u("uCharMode"), 0);
      gl.uniform1f(u("uGlyphCount"), slot.count ?? 1);
    }

    gl.uniform1i(u("uAtlas"), 2);
  },
};

export default pixelSynth;
