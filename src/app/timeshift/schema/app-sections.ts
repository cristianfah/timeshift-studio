// Static product sections: everything that is not a per-slot effect.

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import {
  DEFAULT_STILL_MOTION,
  DEFAULT_STILL_MOTION_AMOUNT,
  STILL_MOTIONS,
} from "../engine/still-history";
import { LOOKS } from "../effects/looks";
import { targets } from "../targets";

export const previewWidthOptions = [
  { label: "640 px", value: "640" },
  { label: "854 px", value: "854" },
  { label: "1280 px", value: "1280" },
];

export const bufferSecondsOptions = [
  { label: "2 s", value: "2" },
  { label: "3 s", value: "3" },
  { label: "5 s", value: "5" },
  { label: "8 s", value: "8" },
];

export function buildAppSections(): ToolcraftControlSectionSchema[] {
  return [
    // --- Fuente: el video o la imagen sobre la que corre la cadena ---
    {
      controls: {
        source: {
          // Un solo cargador para ambos tipos: la cadena de efectos es la
          // misma, solo cambia de dónde salen los fotogramas.
          accept: "video/*,image/*",
          assetKind: "file",
          description:
            "Video o imagen. Se decodifica en tu equipo; no se sube a ningún servidor.",
          label: "Fuente",
          target: targets.source,
          type: "fileDrop",
        },
      },
      id: "clip-source",
      title: "Fuente",
    },
    // --- Imagen fija: el pasado que la cadena necesita para tener efecto ---
    {
      controls: {
        motion: {
          applicability: { mode: "always" as const },
          defaultValue: DEFAULT_STILL_MOTION,
          description:
            "Una foto no tiene pasado y los efectos leen el pasado. El fotograma actual sigue siendo tu imagen intacta; los fotogramas anteriores se alejan con este movimiento.",
          label: "Movimiento inventado",
          options: [...STILL_MOTIONS],
          performanceReason:
            "Repinta el historial una sola vez al cambiar; no añade trabajo por frame.",
          performanceRole: "responsiveness",
          target: targets.stillMotion,
          type: "select",
        },
        amount: {
          applicability: { mode: "always" as const },
          defaultValue: DEFAULT_STILL_MOTION_AMOUNT,
          description:
            "Cuánto se alejan los fotogramas inventados. En 0 los efectos temporales no tienen nada que mostrar.",
          // Un keyframe aquí obligaría a repintar el anillo en cada frame.
          keyframeable: false,
          label: "Intensidad",
          max: 1,
          min: 0,
          performanceReason:
            "Repinta el historial una sola vez al cambiar; no añade trabajo por frame.",
          performanceRole: "responsiveness",
          step: 0.01,
          target: targets.stillMotionAmount,
          type: "slider",
        },
      },
      id: "still-motion",
      title: "Imagen fija",
    },
    // --- Looks: selector de efectos tipo vanilla (grid de 9 looks) ---
    {
      controls: {
        apply: {
          actions: Object.entries(LOOKS).map(([value, look]) => ({
            label: look.label,
            value,
            variant: "outline" as const,
          })),
          description:
            "Cada look reemplaza la cadena por una combinación ya montada.",
          label: "Aplicar look",
          target: "looks.apply",
          type: "actions",
        },
      },
      id: "looks",
      title: "Looks",
    },
    // --- Cadena de efectos: explorador + limpiar ---
    {
      controls: {
        browser: {
          defaultValue: "",
          label: false,
          target: "chain.browser",
          type: "effectBrowser",
        },
        manage: {
          actions: [
            {
              icon: "eraser" as const,
              label: "Vaciar cadena",
              value: "clear",
              variant: "outline" as const,
            },
          ],
          label: "Cadena completa",
          target: "chain.manage",
          type: "actions",
        },
      },
      id: "chain-manage",
      title: "Cadena de efectos",
    },
    // --- Motor de previsualización ---
    {
      controls: {
        previewWidth: {
          defaultValue: "854",
          description:
            "Resolución interna del motor. El export siempre sale a resolución nativa.",
          label: "Previsualización",
          options: previewWidthOptions,
          performanceReason:
            "Fija cuántos píxeles procesa cada pase del shader por frame.",
          performanceRole: "workload",
          target: targets.previewWidth,
          type: "select",
        },
        bufferSeconds: {
          defaultValue: "3",
          description:
            "Cuánto pasado guarda el motor. Los efectos no pueden mirar más atrás de este margen.",
          label: "Historia",
          options: bufferSecondsOptions,
          performanceReason:
            "Determina la memoria de GPU del ring buffer de frames.",
          performanceRole: "workload",
          target: targets.bufferSeconds,
          type: "select",
        },
      },
      id: "engine-budget",
      title: "Motor de previsualización",
    },
    // --- Reproducción ---
    {
      controls: {
        muted: {
          defaultValue: true,
          description: "El audio original se conserva en el export aunque lo silencies aquí.",
          label: "Silenciar",
          target: targets.muted,
          type: "switch",
        },
        trimIn: {
          defaultValue: 0,
          description:
            "Inicio de la región que se reproduce en bucle y se exporta. Solo aplica a clips de video.",
          label: "Entrada",
          max: 1,
          min: 0,
          step: 0.001,
          target: targets.trimIn,
          type: "slider",
        },
        trimOut: {
          defaultValue: 1,
          description: "Fin de la región que se reproduce en bucle y se exporta.",
          label: "Salida",
          max: 1,
          min: 0,
          step: 0.001,
          target: targets.trimOut,
          type: "slider",
        },
      },
      id: "clip-playback",
      title: "Reproducción del clip",
    },
  ];
}

/** Background, image export, video export and the sticky delivery actions. */
export function buildExportSections(): ToolcraftControlSectionSchema[] {
  return [
    {
      controls: {
        include: {
          defaultValue: true,
          label: "Incluir",
          target: targets.exportIncludeBackground,
          type: "switch",
        },
        color: {
          defaultValue: "#0b0d11",
          label: false,
          target: "appearance.background",
          type: "color",
        },
      },
      id: "background",
      layoutGroups: [{ controls: ["include", "color"], layout: "inline" }],
      title: "Background",
    },
    {
      controls: {
        format: {
          defaultValue: "png",
          label: "Formato",
          options: [
            { label: "PNG", value: "png" },
            { label: "JPG", value: "jpg" },
          ],
          target: "export.image.format",
          type: "select",
        },
        resolution: {
          defaultValue: "4k",
          label: "Resolución",
          options: [
            { label: "2K", value: "2k" },
            { label: "4K", value: "4k" },
            { label: "8K", value: "8k" },
          ],
          target: "export.image.resolution",
          type: "select",
        },
      },
      id: "image-export",
      layoutGroups: [{ columns: 2, controls: ["format", "resolution"], layout: "inline" }],
      title: "Image Export",
    },
    {
      controls: {
        format: {
          defaultValue: "mp4",
          label: "Formato",
          options: [
            { label: "MP4", value: "mp4" },
            { label: "WebM", value: "webm" },
          ],
          target: targets.exportVideoFormat,
          type: "select",
        },
        resolution: {
          defaultValue: "current",
          label: "Resolución",
          options: [
            { label: "Nativa", value: "current" },
            { label: "4K", value: "4k" },
          ],
          target: targets.exportVideoResolution,
          type: "select",
        },
        audio: {
          defaultValue: true,
          description: "Incluye la pista original del clip, recortada a la región.",
          label: "Audio original",
          target: targets.exportAudio,
          type: "switch",
        },
      },
      id: "video-export",
      layoutGroups: [{ columns: 2, controls: ["format", "resolution"], layout: "inline" }],
      title: "Video Export",
    },
    {
      actionGroup: "primary",
      controls: {
        deliver: {
          actions: [
            {
              icon: "upload-simple" as const,
              label: "Exportar vídeo",
              role: "export-video" as const,
              value: "export-video",
            },
            {
              icon: "upload-simple" as const,
              label: "Exportar PNG",
              role: "export-image" as const,
              value: "export-png",
            },
          ],
          target: "panel.actions",
          type: "panelActions",
        },
      },
      id: "deliver",
    },
  ];
}