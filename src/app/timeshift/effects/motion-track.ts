// MOTION_TRACK — two trackers in one effect, drawn as a lab overlay and
// composited in-shader so it exports at full resolution.
//
//  · AUTO   — motion detection over a coarse luminance grid.
//  · PUNTOS — real feature tracking around user-placed points.
//
// Both produce "marks" (box + id + value + trail + velocity vector) that share
// the same drawing code. The trackers live in `motion-track-auto.ts` and
// `motion-track-points.ts`, their shared state in `motion-track-state.ts`, and
// the overlay drawing in `motion-track-overlay.ts`.

import type { EffectModule } from "../types";

import {
  findRegions,
  frameActivity,
  motionMask,
  updateTracks,
} from "./motion-track-auto";
import { collectMarks, drawOverlay } from "./motion-track-overlay";
import { syncPoints, updatePoints } from "./motion-track-points";
import {
  AUTO_COLS,
  TRACK_COLS,
  frag,
  trackState,
  type MotionTrackParams,
} from "./motion-track-state";

export type { MotionTrackParams };

const motionTrack: EffectModule<MotionTrackParams> = {
  desc: "Tracker real: detecta el movimiento por sí solo o sigue los puntos que marques en el visor. Colócalo al final de la cadena.",
  frag,
  hasTrackPoints: true,
  label: "Seguimiento de movimiento",
  params: [
    {
      def: "auto",
      help: "Automático detecta zonas en movimiento. Puntos sigue por correlación los que marcas en el visor.",
      key: "mode",
      label: "Modo",
      options: [
        ["auto", "Automático"],
        ["puntos", "Puntos"],
        ["ambos", "Ambos"],
      ],
      type: "select",
    },
    {
      def: "fondo",
      help: "Contra el fondo marca el objeto entero. Contra el frame previo solo marca los bordes que cambian.",
      key: "detect",
      label: "Referencia",
      options: [
        ["fondo", "Modelo de fondo"],
        ["previo", "Frame previo"],
      ],
      type: "select",
    },
    {
      def: 0.08,
      help: "Umbral de cambio para considerar movimiento. Al bajarlo detecta más.",
      key: "sensitivity",
      label: "Sensibilidad",
      max: 0.5,
      min: 0.02,
      step: 0.01,
    },
    {
      def: 5,
      help: "Tamaño mínimo, en celdas, de una zona de movimiento para crear caja.",
      key: "minArea",
      label: "Área mínima",
      max: 60,
      min: 1,
      step: 1,
    },
    { def: 8, key: "maxBoxes", label: "Cajas máximas", max: 24, min: 1, step: 1 },
    {
      def: 0.55,
      help: "Suaviza la posición entre frames. Alto es más estable pero con retardo.",
      key: "smoothing",
      label: "Suavizado",
      max: 0.95,
      min: 0,
      step: 0.01,
    },
    {
      def: 12,
      help: "Frames que una marca sobrevive sin detección, siguiendo por inercia.",
      key: "persistence",
      label: "Persistencia",
      max: 40,
      min: 1,
      step: 1,
      unit: "f",
    },
    {
      def: 0.1,
      help: "Cuánto se busca alrededor de la posición prevista. Súbelo si el sujeto se mueve rápido.",
      key: "search",
      label: "Radio de búsqueda",
      max: 0.3,
      min: 0.02,
      step: 0.005,
    },
    {
      def: 6,
      help: "Tamaño del parche que identifica al punto. Grande es más estable y menos preciso.",
      key: "patch",
      label: "Ventana",
      max: 14,
      min: 3,
      step: 1,
    },
    {
      def: 0.12,
      help: "Cuánto se actualiza el parche cada frame. Alto aguanta cambios de luz, con riesgo de deriva.",
      key: "adapt",
      label: "Adaptación",
      max: 0.6,
      min: 0,
      step: 0.01,
    },
    {
      def: 24,
      help: "Frames de recorrido dibujados detrás de cada marca.",
      key: "trail",
      label: "Estela",
      max: 90,
      min: 0,
      step: 1,
      unit: "f",
    },
    { def: 1, key: "opacity", label: "Opacidad", max: 1, min: 0, step: 0.01 },
    {
      def: "rect",
      key: "style",
      label: "Estilo",
      options: [
        ["rect", "Cajas"],
        ["esquinas", "Esquinas"],
        ["circulo", "Círculos"],
        ["cruz", "Mirillas"],
      ],
      type: "select",
    },
    {
      def: "vecinos",
      key: "lines",
      label: "Líneas",
      options: [
        ["vecinos", "Vecinos"],
        ["vectores", "Vectores"],
        ["no", "Ninguna"],
      ],
      type: "select",
    },
    {
      def: "yes",
      key: "values",
      label: "Lecturas",
      options: [
        ["yes", "Sí"],
        ["no", "No"],
      ],
      type: "select",
    },
    {
      def: "blanco",
      key: "color",
      label: "Color",
      options: [
        ["blanco", "Blanco"],
        ["teal", "Turquesa"],
        ["rojo", "Rojo"],
        ["ambar", "Ámbar"],
      ],
      type: "select",
    },
  ],
  presets: {
    LAB: {
      color: "teal",
      detect: "fondo",
      lines: "vectores",
      maxBoxes: 12,
      mode: "auto",
      sensitivity: 0.07,
      style: "esquinas",
      trail: 40,
    },
    MINIMAL: {
      lines: "no",
      maxBoxes: 4,
      mode: "auto",
      smoothing: 0.85,
      style: "circulo",
      trail: 0,
      values: "no",
    },
    ORGANICO: {
      detect: "fondo",
      lines: "vecinos",
      mode: "auto",
      sensitivity: 0.08,
      smoothing: 0.55,
      style: "rect",
      trail: 24,
      values: "yes",
    },
    PUNTOS: {
      color: "teal",
      lines: "no",
      mode: "puntos",
      patch: 6,
      search: 0.1,
      style: "cruz",
      trail: 40,
      values: "yes",
    },
    VIGILANCIA: {
      color: "ambar",
      detect: "fondo",
      lines: "vecinos",
      maxBoxes: 6,
      mode: "ambos",
      style: "esquinas",
      trail: 30,
    },
  },
  type: "motionTrack",

  analyze(host, fx, ctx) {
    const p = ctx.params(fx) as MotionTrackParams;
    const s = trackState(host, fx);
    const g = host.lumaGrid(AUTO_COLS);

    if (!g) {
      return;
    }

    // Only advance tracking on genuinely new frames; while paused the marks
    // stay frozen instead of decaying against a static image.
    if (s.stamp !== g.stamp) {
      if (p.mode !== "puntos") {
        let mask: Uint8Array | null = null;

        if (s.prev && s.prev.length === g.luma.length) {
          mask = motionMask(s, g, p);

          let regions = findRegions(mask, g.cols, g.rows, p.minArea);

          if (p.detect === "fondo") {
            const prev = s.prev;

            regions = regions.filter(
              (r) => frameActivity(g, prev, r) > p.sensitivity * 0.35,
            );
          }

          // Fast subjects need a wider gate; keep it tied to the search radius.
          updateTracks(s, regions, p, Math.max(0.08, p.search * 2));
        }

        // Selective background update: cells covered by motion barely learn, so
        // the model never swallows the subject and stops leaving a ghost box
        // behind it. The small leak lets a subject that parks become
        // background eventually.
        if (!s.bg || s.bg.length !== g.luma.length) {
          s.bg = g.luma.slice();
        } else {
          for (let i = 0; i < s.bg.length; i += 1) {
            s.bg[i] =
              (s.bg[i] ?? 0) +
              ((g.luma[i] ?? 0) - (s.bg[i] ?? 0)) *
                (mask && mask[i] ? 0.004 : 0.06);
          }
        }

        s.prev = g.luma.slice();
      }

      if (p.mode !== "auto") {
        const fine = host.lumaGrid(TRACK_COLS);

        if (fine) {
          updatePoints(s, fx, fine, p);
        }
      }

      s.stamp = g.stamp;
    } else if (p.mode !== "auto") {
      syncPoints(s, fx); // reflect points added/removed while paused
    }

    const marks = collectMarks(s, p, host.width / Math.max(1, host.height));

    host.uploadTex(
      host.instanceTex(`${fx.id}:ov`),
      drawOverlay(host, marks, p),
    );
    fx.marks = marks;
  },

  delayMap(_p, _ctx, fx) {
    // The time-map shows what the tracker is holding on to.
    const marks = fx?.marks ?? [];

    return (x, y) => {
      const yTop = 1 - y;

      for (const m of marks) {
        if (
          Math.abs(x - m.cx) < m.w / 2 + 0.012 &&
          Math.abs(yTop - m.cy) < m.h / 2 + 0.012
        ) {
          return 1;
        }
      }

      return 0;
    };
  },

  maxReach: () => 1, // only needs the previous frame

  setUniforms(gl, u, p, _ctx, host, fx) {
    const slot = host.instanceTex(`${fx.id}:ov`);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.uniform1i(u("uOverlay"), 2);
    gl.uniform1f(u("uOpacity"), p.opacity);
  },
};

export default motionTrack;
