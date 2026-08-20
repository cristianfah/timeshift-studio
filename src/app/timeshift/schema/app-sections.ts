// Static product sections: everything that is not a per-slot effect.

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import {
  DEFAULT_STILL_MOTION,
  DEFAULT_STILL_MOTION_AMOUNT,
  STILL_MOTIONS,
} from "../engine/still-history";
import { LOOKS } from "../effects/looks";
import { targets } from "../targets";

/** Every product control below is usable whenever its section is on screen. */
const ALWAYS = { mode: "always" } as const;

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
          applicability: ALWAYS,
          // Un solo cargador para ambos tipos: la cadena de efectos es la
          // misma, solo cambia de dónde salen los fotogramas.
          accept: "video/*,image/*",
          assetKind: "file",
          description:
            "Video o imagen. Se decodifica en tu equipo; no se sube a ningún servidor.",
          label: "Fuente",
          performanceReason:
            "El tamaño nativo de la fuente decide cuánto hay que escalar en cada subida de fotograma al anillo.",
          performanceRole: "responsiveness",
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
          applicability: ALWAYS,
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
          applicability: ALWAYS,
          defaultValue: DEFAULT_STILL_MOTION_AMOUNT,
          description:
            "Cuánto se alejan los fotogramas inventados. En 0 los efectos temporales no tienen nada que mostrar.",
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
          applicability: ALWAYS,
          actions: Object.entries(LOOKS).map(([value, look]) => ({
            label: look.label,
            value,
            variant: "outline" as const,
          })),
          description:
            "Cada look reemplaza la cadena por una combinación ya montada.",
          label: "Aplicar look",
          performanceReason:
            "Reemplaza la cadena en un solo comando; el coste por frame lo fija la cadena resultante.",
          performanceRole: "responsiveness",
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
          applicability: ALWAYS,
          defaultValue: "",
          performanceReason:
            "Abre el explorador de efectos; no cambia el trabajo del motor por frame.",
          performanceRole: "responsiveness",
          label: false,
          target: "chain.browser",
          type: "effectBrowser",
        },
        manage: {
          applicability: ALWAYS,
          actions: [
            {
              icon: "eraser" as const,
              label: "Vaciar cadena",
              value: "clear",
              variant: "outline" as const,
            },
          ],
          label: "Cadena completa",
          performanceReason:
            "Vaciar la cadena quita pases del bucle de render en un solo comando.",
          performanceRole: "responsiveness",
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
          applicability: ALWAYS,
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
          applicability: ALWAYS,
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
          applicability: ALWAYS,
          defaultValue: true,
          description:
            "Silencia la reproducción del clip en el editor. El export de video no lleva pista de audio.",
          label: "Silenciar",
          performanceReason:
            "Sólo afecta al elemento de video del editor, no al motor.",
          performanceRole: "responsiveness",
          target: targets.muted,
          type: "switch",
        },
        trimIn: {
          applicability: ALWAYS,
          defaultValue: 0,
          description:
            "Inicio de la región del clip. La timeline pasa a durar solo la región y el export entrega ese tramo.",
          label: "Entrada",
          max: 1,
          min: 0,
          performanceReason:
            "Mueve el punto de partida del clip; el trabajo por frame no cambia.",
          performanceRole: "responsiveness",
          step: 0.001,
          target: targets.trimIn,
          type: "slider",
        },
        trimOut: {
          applicability: ALWAYS,
          defaultValue: 1,
          description: "Fin de la región del clip que se reproduce y se exporta.",
          label: "Salida",
          max: 1,
          min: 0,
          performanceReason:
            "Mueve el final del clip; el trabajo por frame no cambia.",
          performanceRole: "responsiveness",
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
          applicability: ALWAYS,
          defaultValue: true,
          label: "Incluir",
          performanceReason:
            "Sólo decide si el fondo entra en el artefacto exportado.",
          performanceRole: "responsiveness",
          target: targets.exportIncludeBackground,
          type: "switch",
        },
        color: {
          applicability: ALWAYS,
          defaultValue: "#0b0d11",
          performanceReason:
            "Pinta el fondo del producto; no cambia el trabajo del motor.",
          performanceRole: "responsiveness",
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
          applicability: ALWAYS,
          defaultValue: "png",
          performanceReason:
            "Elige el códec de imagen del artefacto, sólo en el export.",
          performanceRole: "responsiveness",
          label: "Formato",
          options: [
            { label: "PNG", value: "png" },
            { label: "JPG", value: "jpg" },
          ],
          target: "export.image.format",
          type: "select",
        },
        resolution: {
          applicability: ALWAYS,
          defaultValue: "4k",
          label: "Resolución",
          options: [
            { label: "2K", value: "2k" },
            { label: "4K", value: "4k" },
            { label: "8K", value: "8k" },
          ],
          performanceReason:
            "Fija los píxeles reales del artefacto de imagen: 8K procesa dieciséis veces el área de 2K.",
          performanceRole: "workload",
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
          applicability: ALWAYS,
          defaultValue: "mp4",
          performanceReason:
            "Elige el contenedor de video del artefacto, sólo en el export.",
          performanceRole: "responsiveness",
          label: "Formato",
          options: [
            { label: "MP4", value: "mp4" },
            { label: "WebM", value: "webm" },
          ],
          target: targets.exportVideoFormat,
          type: "select",
        },
        resolution: {
          applicability: ALWAYS,
          defaultValue: "current",
          label: "Resolución",
          options: [
            { label: "Nativa", value: "current" },
            { label: "4K", value: "4k" },
          ],
          performanceReason:
            "Fija los píxeles reales de cada frame codificado en el export de video.",
          performanceRole: "workload",
          target: targets.exportVideoResolution,
          type: "select",
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
          applicability: ALWAYS,
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