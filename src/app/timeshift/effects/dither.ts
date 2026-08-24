// DITHER — quantización con trama: la imagen se reduce a pocos niveles y el
// error se reparte con un patrón (Bayer ordenado, ruido, semitono o líneas),
// que es lo que produce el grano de puntos del dithering clásico de 1 bit.
//
// Funciona igual sobre vídeo y sobre foto: la fuente entra por `chainAt`, así
// que la imagen fija usa el mismo pase y el retardo puede tomar la trama de un
// frame anterior cuando hay clip de vídeo.

import type { EffectModule } from "../types";

/**
 * Ancho de referencia del que sale la rejilla de trama.
 *
 * El punto no puede medirse en píxeles del render: el preview corre a la
 * resolución del motor (640 px, 854 px…) y el export a la nativa del clip, así
 * que una rejilla `ancho / punto` daría muchos más puntos en el archivo
 * exportado que en el visor y el resultado no se parecería a lo ajustado.
 * Fijando el número de celdas contra un ancho de referencia, la trama ocupa la
 * misma fracción de la imagen en las dos resoluciones y el export reproduce lo
 * que se ve.
 */
const REFERENCE_WIDTH = 1000;

export type DitherParams = {
  amount: number;
  bias: number;
  cell: number;
  color: string;
  contrast: number;
  delay: number;
  drift: number;
  hue: number;
  invert: string;
  levels: number;
  pattern: string;
  sat: number;
  spread: number;
};

const frag = `
uniform vec2 uGrid;
uniform float uDelayF, uLevels, uContrast, uBias, uSpread, uAmount;
uniform float uHue, uSat, uDrift;
uniform int uPattern;    // 0 bayer2, 1 bayer4, 2 bayer8, 3 ruido, 4 semitono, 5 lineas
uniform int uColorMode;  // 0 mono, 1 tinta, 2 color de origen
uniform int uInvert;

// Bayer ordenado por recursión: cada nivel añade un cuarto del anterior.
float bayer2v(vec2 a) { vec2 f = floor(a); return fract(f.x / 2.0 + f.y * f.y * 0.75); }
float bayer4v(vec2 a) { return bayer2v(a * 0.5) * 0.25 + bayer2v(a); }
float bayer8v(vec2 a) { return bayer4v(a * 0.5) * 0.25 + bayer2v(a); }

vec2 rot45(vec2 p) { return vec2(p.x + p.y, p.y - p.x) * 0.70710678; }

// Punto de trama: el umbral crece con la distancia al centro del clúster, así
// que los puntos engordan desde el centro como en un semitono impreso.
float halftoneV(vec2 p) { vec2 q = fract(rot45(p) / 4.0) - 0.5; return clamp(length(q) * 2.0, 0.0, 1.0); }

float linesV(vec2 p) { return fract(rot45(p).x / 4.0); }

float thresholdAt(vec2 p) {
  if (uPattern == 0) return bayer2v(p);
  if (uPattern == 1) return bayer4v(p);
  if (uPattern == 2) return bayer8v(p);
  if (uPattern == 3) return tsHash2(p);
  if (uPattern == 4) return halftoneV(p);
  return linesV(p);
}

// Cuantiza un canal empujándolo con el umbral de la trama: con dispersión 0 es
// posterización limpia, y al subirla aparece el grano que simula los niveles
// intermedios que la paleta ya no tiene.
float quant(float c, float m) {
  float steps = max(uLevels - 1.0, 1.0);
  float v = c + (m - 0.5) * uSpread / steps;
  return clamp(floor(v * steps + 0.5) / steps, 0.0, 1.0);
}

vec3 hsv2rgb(float h, float s, float v) {
  vec3 k = fract(vec3(h) + vec3(1.0, 0.6666667, 0.3333333));
  vec3 p = abs(k * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s);
}

void main() {
  vec2 cellIdx = floor(v_uv * uGrid);
  vec2 center = (cellIdx + 0.5) / uGrid;

  vec3 prev = texture(uPrev, v_uv).rgb;
  vec3 src = chainAt(center, uDelayF).rgb;
  vec3 c = clamp((src - 0.5) * uContrast + 0.5 + uBias, 0.0, 1.0);
  if (uInvert == 1) c = 1.0 - c;

  // El ruido temporal desplaza la trama por frame: en 0 queda clavada a la
  // rejilla, y al subirlo el grano hierve como en una copia analógica.
  float tick = floor(uFrame * uDrift);
  vec2 p = cellIdx + vec2(tick * 17.0, tick * 29.0);
  float m = thresholdAt(p);

  vec3 dithered;
  if (uColorMode == 2) {
    dithered = vec3(quant(c.r, m), quant(c.g, m), quant(c.b, m));
  } else {
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 ink = (uColorMode == 1) ? hsv2rgb(uHue / 360.0, uSat, 0.74) : vec3(0.04);
    dithered = mix(ink, vec3(0.97), quant(luma, m));
  }

  outColor = vec4(mix(prev, dithered, uAmount), 1.0);
}`;

const dither: EffectModule<DitherParams> = {
  desc: "Reduce la imagen a pocos niveles y reparte el error con una trama de puntos, ruido o semitono.",
  frag,
  label: "Dither",
  params: [
    {
      def: 3,
      help: "Grosor del punto de trama, relativo a la imagen: el visor y el archivo exportado enseñan el mismo grano aunque cambies la resolución de previsualización.",
      key: "cell",
      label: "Punto",
      max: 32,
      min: 1,
      step: 1,
    },
    {
      def: 2,
      help: "Cuántos tonos quedan por canal. En 2 es dithering de 1 bit; al subirlo la trama sólo aparece entre niveles.",
      key: "levels",
      label: "Niveles",
      max: 8,
      min: 2,
      step: 1,
    },
    {
      def: 1,
      help: "Cuánto empuja la trama al cuantizar. En 0 es posterización limpia sin grano; por encima de 1 el grano invade los tonos planos.",
      key: "spread",
      label: "Dispersión",
      max: 2,
      min: 0,
      step: 0.01,
    },
    {
      def: 1.15,
      help: "Separa luces y sombras antes de cuantizar, que es lo que decide cuánta superficie queda en cada nivel.",
      key: "contrast",
      label: "Contraste",
      max: 3,
      min: 0.2,
      step: 0.05,
    },
    {
      def: 0,
      help: "Desplaza el brillo antes de la trama: hacia abajo cierra los puntos y hacia arriba abre la imagen.",
      key: "bias",
      label: "Umbral",
      max: 0.5,
      min: -0.5,
      step: 0.01,
    },
    {
      def: 1,
      help: "Mezcla con la imagen que llega de la cadena. Bájalo para dejar el dither como textura sobre el original.",
      key: "amount",
      label: "Mezcla",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      def: "bayer4",
      help: "Bayer da la retícula ordenada clásica, Ruido un grano suelto, Semitono puntos de imprenta y Líneas una trama diagonal.",
      key: "pattern",
      label: "Trama",
      options: [
        ["bayer2", "Bayer 2×2"],
        ["bayer4", "Bayer 4×4"],
        ["bayer8", "Bayer 8×8"],
        ["ruido", "Ruido"],
        ["semitono", "Semitono"],
        ["lineas", "Líneas"],
      ],
      type: "select",
    },
    {
      def: "mono",
      help: "Mono deja tinta negra sobre papel, Tinta usa el tono elegido y Origen cuantiza los tres canales del vídeo.",
      key: "color",
      label: "Color",
      options: [
        ["mono", "Mono"],
        ["tinta", "Tinta"],
        ["fuente", "Origen"],
      ],
      type: "select",
    },
    {
      def: 214,
      help: "Tono de la tinta cuando Color está en Tinta.",
      key: "hue",
      label: "Tono de tinta",
      max: 360,
      min: 0,
      step: 1,
      unit: "°",
    },
    {
      def: 0.85,
      help: "Saturación de la tinta cuando Color está en Tinta. En 0 la tinta es gris.",
      key: "sat",
      label: "Saturación",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      def: 0,
      help: "Mueve la trama cada frame en vez de dejarla fija a la rejilla, que es lo que hace hervir el grano en vídeo.",
      key: "drift",
      label: "Ruido temporal",
      max: 1,
      min: 0,
      step: 0.01,
    },
    {
      def: 0,
      help: "Toma la imagen que se tramar de un frame del pasado en lugar del actual.",
      key: "delay",
      label: "Retardo",
      max: 150,
      min: 0,
      step: 1,
      unit: "f",
    },
    {
      def: "no",
      key: "invert",
      label: "Invertir",
      options: [
        ["no", "No"],
        ["si", "Sí"],
      ],
      type: "select",
    },
  ],
  presets: {
    "1BIT": {
      cell: 2,
      color: "mono",
      contrast: 1.3,
      levels: 2,
      pattern: "bayer8",
      spread: 1,
    },
    GAMEBOY: {
      cell: 4,
      color: "tinta",
      contrast: 1.2,
      hue: 96,
      levels: 4,
      pattern: "bayer4",
      sat: 0.6,
    },
    HERVIDO: {
      cell: 3,
      color: "mono",
      drift: 1,
      levels: 2,
      pattern: "ruido",
      spread: 1.2,
    },
    PRENSA: {
      cell: 6,
      color: "mono",
      contrast: 1.4,
      levels: 2,
      pattern: "semitono",
      spread: 0.8,
    },
    RETRO: {
      cell: 4,
      color: "fuente",
      contrast: 1.1,
      levels: 3,
      pattern: "bayer4",
      spread: 1.1,
    },
    RISO: {
      cell: 3,
      color: "tinta",
      contrast: 1.25,
      hue: 214,
      levels: 2,
      pattern: "bayer8",
      sat: 0.9,
    },
    TRAMA: {
      cell: 5,
      color: "mono",
      contrast: 1.5,
      levels: 2,
      pattern: "lineas",
      spread: 0.9,
    },
  },
  type: "dither",

  delayMap(p) {
    // El retardo es uniforme en toda la imagen.
    return () => p.delay;
  },

  maxReach: (p) => p.delay,

  setUniforms(gl, u, p, _ctx, host) {
    const cell = Math.max(1, p.cell);
    // Celdas por ancho de imagen, no por píxeles del render: así el preview a
    // 640 px y el export a resolución nativa dibujan la misma trama.
    const cols = Math.max(2, Math.round(REFERENCE_WIDTH / cell));
    const rows = Math.max(
      2,
      Math.round((cols * host.height) / Math.max(host.width, 1)),
    );

    gl.uniform2f(u("uGrid"), cols, rows);
    gl.uniform1f(u("uDelayF"), p.delay);
    gl.uniform1f(u("uLevels"), Math.max(2, Math.round(p.levels)));
    gl.uniform1f(u("uContrast"), p.contrast);
    gl.uniform1f(u("uBias"), p.bias);
    gl.uniform1f(u("uSpread"), p.spread);
    gl.uniform1f(u("uAmount"), p.amount);
    gl.uniform1f(u("uHue"), p.hue);
    gl.uniform1f(u("uSat"), p.sat);
    gl.uniform1f(u("uDrift"), p.drift);
    gl.uniform1i(
      u("uPattern"),
      { bayer2: 0, bayer4: 1, bayer8: 2, lineas: 5, ruido: 3, semitono: 4 }[
        p.pattern
      ] ?? 1,
    );
    gl.uniform1i(
      u("uColorMode"),
      p.color === "fuente" ? 2 : p.color === "tinta" ? 1 : 0,
    );
    gl.uniform1i(u("uInvert"), p.invert === "si" ? 1 : 0);
  },
};

export default dither;
