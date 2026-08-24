// Acceptance rows for the fixed product surfaces: source, still motion, looks,
// chain commands, engine budget, clip playback, background, export settings and
// the runtime panels (layers, timeline, canvas, persistence).
//
// The per-slot effect controls are generated separately in `chain-rows.ts`.

import type { ToolcraftPersistableStateSlice } from "@/toolcraft/runtime";

import type { ToolcraftComponentAcceptance } from "../../acceptance/types";
import { LOOKS } from "../effects/looks";
import { STILL_MOTIONS } from "../engine/still-history";
import { bufferSecondsOptions, previewWidthOptions } from "../schema/app-sections";
import { targets } from "../targets";

const SOURCE_FIXTURE = "clip de prueba y foto de prueba";

type ControlRow = {
  componentType: string;
  keyframeable?: boolean;
  expectedObservable: string;
  id: string;
  optionCoverage?: readonly string[];
  target: string;
  test: string;
  userAction: string;
};

function controlRow(row: ControlRow): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: row.test,
    browser: true,
    browserTestName: `browser: ${row.test}`,
    componentType: row.componentType,
    evidence: "product-output",
    expectedObservable: row.expectedObservable,
    fixture: SOURCE_FIXTURE,
    id: row.id,
    kind: "control",
    target: row.target,
    userAction: row.userAction,
    ...(row.keyframeable ? { timelineCoverage: "keyframes" as const } : {}),
    ...(row.optionCoverage ? { optionCoverage: row.optionCoverage } : {}),
  };
}

function buildControlRows(): ToolcraftComponentAcceptance[] {
  return [
    {
      ...controlRow({
        componentType: "fileDrop",
        expectedObservable:
          "Subir un clip o una imagen los muestra en el canvas a su resolución nativa; quitarlos y Reset dejan el canvas sin fuente.",
        id: "media.source",
        target: targets.source,
        test: "la fuente admite clip e imagen y su ciclo de medios",
        userAction:
          "Subir un video, subir una imagen, quitarla y usar Reset de la sección.",
      }),
      evidence: "media-lifecycle",
      mediaLifecycleCoverage: ["upload", "remove", "reset"],
    },
    controlRow({
      componentType: "select",
      expectedObservable:
        "Cada modo cambia el pasado inventado de la foto y con ello el resultado de los efectos temporales; «Sin movimiento» devuelve la foto original.",
      id: "still.motion",
      optionCoverage: STILL_MOTIONS.map((motion) => motion.value),
      target: targets.stillMotion,
      test: "el movimiento inventado cambia el historial de la imagen fija",
      userAction: "Elegir cada modo de movimiento con una imagen cargada.",
    }),
    controlRow({
      componentType: "slider",
      expectedObservable:
        "Subir la intensidad aleja más los fotogramas inventados y marca más el efecto; en 0 la salida es la foto original.",
      id: "still.motionAmount",
      keyframeable: true,
      target: targets.stillMotionAmount,
      test: "la intensidad del movimiento inventado escala el historial",
      userAction: "Arrastrar Intensidad de 0 a 1 con una imagen cargada.",
    }),
    controlRow({
      componentType: "actions",
      expectedObservable:
        "Cada look reemplaza la cadena por sus efectos y valores, y el render cambia al instante.",
      id: "looks.apply",
      target: "looks.apply",
      test: "aplicar un look reemplaza la cadena por sus efectos y valores",
      userAction: "Pulsar cada look con una fuente cargada.",
    }),
    {
      ...controlRow({
        componentType: "effectBrowser",
        expectedObservable:
          "El explorador lista los once efectos y añadir uno lo agrega a la cadena y al render.",
        id: "chain.browser",
        target: "chain.browser",
        test: "el explorador de efectos añade un efecto a la cadena",
        userAction: "Abrir el explorador, filtrar y añadir un efecto.",
      }),
      builtInFitCheck: {
        capabilities: ["custom-interaction", "custom-visualization"],
        checkedBuiltIns: ["imagePicker", "select", "segmented", "collectionActions"],
        closestBuiltIn: "imagePicker",
        productObservable:
          "Al añadir una tarjeta el efecto aparece en la cadena y el canvas cambia.",
        whyInsufficient:
          "ImagePicker sólo muestra imágenes estáticas y no puede presentar once efectos temporales corriendo sobre la fuente del usuario, que es lo que permite elegir uno.",
      },
      customControlCoverage: "all-custom-control-behavior",
      interactionId: "chain-effect-browser",
    },
    controlRow({
      componentType: "actions",
      expectedObservable:
        "Vaciar cadena borra las capas de efecto y el canvas vuelve a la fuente sin procesar.",
      id: "chain.manage",
      target: "chain.manage",
      test: "vaciar la cadena borra las capas de efecto",
      userAction: "Aplicar un look y pulsar Vaciar cadena.",
    }),
    controlRow({
      componentType: "select",
      expectedObservable:
        "Cada ancho reconfigura el motor: el canvas de producto pasa a tener ese ancho de backing.",
      id: "engine.previewWidth",
      optionCoverage: previewWidthOptions.map((option) => option.value),
      target: targets.previewWidth,
      test: "la resolución de previsualización reconfigura el motor",
      userAction: "Elegir 640, 854 y 1280 px con una fuente cargada.",
    }),
    controlRow({
      componentType: "select",
      expectedObservable:
        "Cada margen de historia cambia la profundidad del ring buffer y hasta dónde pueden mirar atrás los efectos.",
      id: "engine.bufferSeconds",
      optionCoverage: bufferSecondsOptions.map((option) => option.value),
      target: targets.bufferSeconds,
      test: "la historia del motor cambia la profundidad del ring buffer",
      userAction: "Elegir 2, 3, 5 y 8 s con una fuente cargada.",
    }),
    controlRow({
      componentType: "switch",
      expectedObservable:
        "Silenciar apaga el audio del clip en el editor sin tocar el render.",
      id: "clip.muted",
      target: targets.muted,
      test: "silenciar apaga el audio del clip en el editor",
      userAction: "Apagar y encender Silenciar con un clip cargado.",
    }),
    controlRow({
      componentType: "slider",
      expectedObservable:
        "Mover Entrada acorta la timeline y el clip arranca en ese punto; el export entrega ese tramo.",
      id: "clip.trimIn",
      keyframeable: true,
      target: targets.trimIn,
      test: "la entrada recorta la región del clip",
      userAction: "Arrastrar Entrada con un clip cargado y reproducir.",
    }),
    controlRow({
      componentType: "slider",
      expectedObservable:
        "Mover Salida acorta la timeline por el final y el bucle vuelve a la entrada en ese punto.",
      id: "clip.trimOut",
      keyframeable: true,
      target: targets.trimOut,
      test: "la salida recorta la región del clip",
      userAction: "Arrastrar Salida con un clip cargado y reproducir.",
    }),
    {
      ...controlRow({
        componentType: "switch",
        expectedObservable:
          "Apagar Background quita el fondo del producto del preview y deja el PNG con alfa.",
        id: "export.includeBackground",
        target: targets.exportIncludeBackground,
        test: "el interruptor de fondo decide si el fondo entra en el artefacto",
        userAction: "Apagar Background y exportar PNG.",
      }),
      backgroundOutputCoverage: "all-required-background-output",
      evidence: "exported-bytes",
    },
    controlRow({
      componentType: "color",
      expectedObservable:
        "El color elegido es el fondo que se ve detrás del render y el que queda en el artefacto exportado.",
      id: "appearance.background",
      keyframeable: true,
      target: "appearance.background",
      test: "el color de fondo se ve en el preview y en el export",
      userAction: "Elegir otro color de fondo y exportar.",
    }),
    {
      ...controlRow({
        componentType: "select",
        expectedObservable:
          "PNG y JPG cambian el tipo del archivo exportado.",
        id: "export.image.format",
        optionCoverage: ["png", "jpg"],
        target: "export.image.format",
        test: "el formato de imagen cambia el tipo del archivo exportado",
        userAction: "Exportar en PNG y en JPG.",
      }),
      evidence: "exported-bytes",
    },
    {
      ...controlRow({
        componentType: "select",
        expectedObservable:
          "2K, 4K y 8K cambian las dimensiones reales del archivo exportado.",
        id: "export.image.resolution",
        optionCoverage: ["2k", "4k", "8k"],
        target: "export.image.resolution",
        test: "la resolución de imagen cambia las dimensiones exportadas",
        userAction: "Exportar en 2K y en 8K y medir el archivo.",
      }),
      evidence: "exported-bytes",
    },
    {
      ...controlRow({
        componentType: "select",
        expectedObservable:
          "MP4 y WebM cambian el contenedor real del video exportado.",
        id: "export.video.format",
        optionCoverage: ["mp4", "webm"],
        target: targets.exportVideoFormat,
        test: "el formato de video cambia el contenedor exportado",
        userAction: "Exportar video en MP4 y en WebM.",
      }),
      evidence: "exported-bytes",
    },
    {
      ...controlRow({
        componentType: "select",
        expectedObservable:
          "Nativa y 4K cambian las dimensiones reales del video exportado.",
        id: "export.video.resolution",
        optionCoverage: ["current", "4k"],
        target: targets.exportVideoResolution,
        test: "la resolución de video cambia las dimensiones exportadas",
        userAction: "Exportar video en Nativa y en 4K.",
      }),
      evidence: "exported-bytes",
    },
    {
      ...controlRow({
        componentType: "panelActions",
        expectedObservable:
          "Exportar PNG y Exportar vídeo entregan archivos con el resultado de la cadena y con los ajustes elegidos.",
        id: "actions.output",
        target: "panel.actions",
        test: "las acciones sticky entregan imagen y video",
        userAction: "Pulsar Exportar PNG y Exportar vídeo.",
      }),
      actionCoverage: ["export-png", "export-video"],
      evidence: "exported-bytes",
      exportArtifactCoverage: [
        "all-required-image-export-behavior",
        "all-required-video-export-behavior",
      ],
    },
  ];
}

function buildRuntimeRows(
  persistenceSlices: readonly ToolcraftPersistableStateSlice[],
): ToolcraftComponentAcceptance[] {
  const layerRow = (
    coverage: "grouping" | "reorder" | "selection" | "visibility",
    id: string,
    observable: string,
    action: string,
    test: string,
  ): ToolcraftComponentAcceptance => ({
    automated: true,
    automatedTestName: test,
    browser: true,
    browserTestName: `browser: ${test}`,
    componentType: "layers-panel",
    evidence: "product-output",
    expectedObservable: observable,
    fixture: SOURCE_FIXTURE,
    id,
    kind: "runtime",
    layerCoverage: coverage,
    target: "layers",
    userAction: action,
  });

  return [
    {
      automated: true,
      automatedTestName:
        "declares production reload coverage for the product schema",
      browser: true,
      browserTestName:
        "browser: app restores exact canvas, values, and panel workspace slices after reload",
      componentType: "persistence",
      evidence: "persistence-state",
      expectedObservable:
        "Canvas size, clip position, effect slot selections, and expanded timeline remain restored after reload.",
      fixture: "timeshift persisted workspace",
      id: "persistence.reload",
      kind: "runtime",
      persistenceCoverage: "reload",
      persistenceSlices,
      target: "canvas.size.width",
      userAction:
        "Upload a clip, select an effect, expand timeline, reload, and verify restored state.",
    },
    {
      automated: true,
      automatedTestName: "timeline extended by default on mount",
      browser: false,
      browserTestName:
        "(not applicable — browser test not required for mount-only)",
      componentType: "timeline",
      evidence: "viewport-side-effect",
      expectedObservable:
        "Timeline panel is expanded on first render without user interaction.",
      fixture: "timeshift start state",
      id: "timeline.default-on",
      kind: "runtime",
      target: "panels.timeline.extended",
      userAction: "Open the app and observe the timeline panel is expanded.",
    },
    layerRow(
      "selection",
      "layers.selection",
      "Seleccionar una capa muestra los parámetros de ese efecto en el panel.",
      "Seleccionar cada capa de la cadena.",
      "seleccionar una capa cambia el efecto editado",
    ),
    layerRow(
      "visibility",
      "layers.visibility",
      "Ocultar una capa saca ese efecto del render y el canvas cambia.",
      "Ocultar y mostrar una capa de efecto.",
      "ocultar una capa saca su efecto del render",
    ),
    layerRow(
      "reorder",
      "layers.reorder",
      "Reordenar capas cambia el orden de los pases y el resultado del render.",
      "Arrastrar una capa por encima de otra.",
      "reordenar capas cambia el orden de la cadena",
    ),
    layerRow(
      "grouping",
      "layers.grouping",
      "Agrupar capas mantiene el orden de la cadena y el render sigue el grupo.",
      "Agrupar dos capas de efecto.",
      "agrupar capas conserva el orden de la cadena",
    ),
    {
      automated: true,
      automatedTestName: "la reproducción recorre la región y renderiza cada frame",
      browser: true,
      browserTestName:
        "browser: la reproducción recorre la región y renderiza cada frame",
      componentType: "timeline",
      evidence: "timeline-output",
      expectedObservable:
        "Play avanza el playhead, el canvas cambia frame a frame, el scrub salta al frame exacto y el bucle vuelve a la entrada.",
      fixture: SOURCE_FIXTURE,
      id: "timeline.playback",
      kind: "runtime",
      target: "panels.timeline",
      timelineCoverage: "playback",
      timelineLoopProof: {
        direction: "forward-only",
        durationChange: "reproved-after-edit",
        reversePlayback: "forbidden",
        seam: "first-last-match",
      },
      timelinePlaybackCoverage: "all-playback-behavior",
      userAction:
        "Reproducir, pausar, arrastrar el playhead, cambiar la duración y dejar que el bucle vuelva.",
    },
    {
      automated: true,
      automatedTestName: "los keyframes de un parámetro cambian el render en el tiempo",
      browser: true,
      browserTestName:
        "browser: los keyframes de un parámetro cambian el render en el tiempo",
      componentType: "timeline",
      evidence: "timeline-output",
      expectedObservable:
        "Fijar dos keyframes en un parámetro de efecto hace que el render de cada frame use el valor interpolado.",
      fixture: SOURCE_FIXTURE,
      id: "timeline.keyframes",
      kind: "runtime",
      target: "panels.timeline",
      timelineCoverage: "keyframes",
      userAction:
        "Fijar un keyframe al inicio y otro al final de un parámetro y recorrer la timeline.",
    },
    {
      automated: true,
      automatedTestName: "la fuente importada fija el tamaño del canvas",
      browser: true,
      browserTestName: "browser: la fuente importada fija el tamaño del canvas",
      canvasSizingCoverage: "intrinsic-media-size",
      componentType: "canvas",
      evidence: "product-output",
      expectedObservable:
        "El canvas y el artefacto exportado toman las dimensiones nativas del clip o de la foto importada.",
      fixture: SOURCE_FIXTURE,
      id: "canvas.sizing",
      kind: "runtime",
      target: "canvas.size",
      userAction:
        "Subir una fuente vertical y otra horizontal y comparar el tamaño del canvas.",
    },
    {
      automated: true,
      automatedTestName: "la escala de resolución conserva los píxeles de backing",
      browser: true,
      browserTestName:
        "browser: la escala de resolución conserva los píxeles de backing",
      componentType: "canvas",
      evidence: "product-output",
      expectedObservable:
        "El canvas mantiene su tamaño CSS y su backing real es tamaño CSS × devicePixelRatio × escala en interacción, reposo y reproducción.",
      fixture: SOURCE_FIXTURE,
      id: "canvas.render-scale",
      kind: "runtime",
      renderScaleCoverage: {
        kind: "selected-backing-pixels",
        states: ["interaction", "playback", "steady"],
      },
      target: "canvas.renderScale",
      userAction:
        "Mover Resolution scale al máximo y observar el backing en reposo, durante una interacción y reproduciendo.",
    },
  ];
}

export function buildProductAcceptance(
  persistenceSlices: readonly ToolcraftPersistableStateSlice[],
): ToolcraftComponentAcceptance[] {
  return [...buildControlRows(), ...buildRuntimeRows(persistenceSlices)];
}

export const LOOK_ACTION_VALUES: readonly string[] = Object.keys(LOOKS);
