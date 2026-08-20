// One scenario per canonical performance path.
//
// Path ids are derived from the render plan, never authored: the plan below is
// the same configuration `app-performance.ts` exports, minus the scenarios
// themselves, so a new pass or interaction shows up here as a missing scenario
// instead of a stale hand-written id.

import {
  deriveToolcraftPerformancePaths,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import { appSchema } from "../../app-schema";
import { timeshiftRendererPipeline } from "./pipeline";
import { timeshiftRendererTechnique } from "./technique";
import { timeshiftWorkloadEnvelope } from "./envelope";

const planWithoutScenarios: ToolcraftEnvelopePerformanceConfig = {
  rendererPipeline: timeshiftRendererPipeline,
  rendererStrategy: "webgl",
  rendererTechnique: timeshiftRendererTechnique,
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: timeshiftWorkloadEnvelope,
};

type ScenarioBlueprint = {
  actionValue?: string;
  controlLabel?: string;
  expectedObservable: string;
  fixture: string;
  id: string;
  test: string;
  uiSelector?: string;
};

/** What each canonical interaction means for a user, keyed by interaction. */
const BLUEPRINTS: Record<string, ScenarioBlueprint> = {
  "control-change": {
    expectedObservable:
      "Cambiar la resolución interna o la historia reasigna el anillo y el canvas sigue mostrando el resultado de la cadena.",
    fixture: "clip de prueba con la cadena Datamosh",
    id: "engine-budget-change",
    test: "cambiar el presupuesto del motor mantiene vivo el preview",
    uiSelector: 'canvas[data-toolcraft-product-output="timeshift-preview"]',
  },
  "control-drag": {
    controlLabel: "Entrada",
    expectedObservable:
      "Arrastrar el recorte reevalúa la cadena en cada frame del gesto, sin volver a subir el fotograma al anillo.",
    fixture: "clip de prueba con la cadena Datamosh",
    id: "trim-drag",
    test: "arrastrar el recorte mantiene el render en vivo",
    uiSelector: 'canvas[data-toolcraft-product-output="timeshift-preview"]',
  },
  export: {
    actionValue: "export-png",
    controlLabel: "Exportar PNG",
    expectedObservable:
      "Exportar PNG entrega un archivo con el resultado de la cadena a la resolución elegida.",
    fixture: "foto de prueba con la cadena Datamosh",
    id: "image-export",
    test: "el export de imagen entrega el archivo",
  },
  "initial-render": {
    expectedObservable:
      "Con la fuente cargada, el primer frame ya muestra la cadena aplicada en el canvas de producto.",
    fixture: "clip de prueba con la cadena Datamosh",
    id: "first-frame",
    test: "el primer frame muestra la cadena aplicada",
    uiSelector: 'canvas[data-toolcraft-product-output="timeshift-preview"]',
  },
  "media-import": {
    expectedObservable:
      "Importar una fuente reasigna el anillo, lo llena y el canvas pasa a mostrarla con la cadena aplicada.",
    fixture: "clip de prueba y foto de prueba",
    id: "source-import",
    test: "importar una fuente deja el canvas renderizando",
    uiSelector: 'canvas[data-toolcraft-product-output="timeshift-preview"]',
  },
};

function buildScenarios(): readonly ToolcraftPerformanceScenario[] {
  return deriveToolcraftPerformancePaths(appSchema, planWithoutScenarios).map(
    (path): ToolcraftPerformanceScenario => {
      const blueprint = BLUEPRINTS[path.interaction];

      if (!blueprint) {
        throw new Error(
          `Missing performance scenario blueprint for interaction "${path.interaction}".`,
        );
      }

      const base = {
        automated: true,
        automatedTestName: blueprint.test,
        browser: true,
        browserTestName: `browser: ${blueprint.test}`,
        coversTargets: path.targets,
        expectedObservable: blueprint.expectedObservable,
        fixture: blueprint.fixture,
        id: blueprint.id,
        pathId: path.id,
        ...(blueprint.uiSelector ? { uiSelector: blueprint.uiSelector } : {}),
      };

      return path.interaction === "export"
        ? {
            ...base,
            actionValue: blueprint.actionValue ?? "export-png",
            completionEvidence: "download",
            controlLabel: blueprint.controlLabel ?? "Exportar PNG",
            interaction: "export",
          }
        : {
            ...base,
            ...(blueprint.controlLabel
              ? { controlLabel: blueprint.controlLabel }
              : {}),
            interaction: path.interaction,
          };
    },
  );
}

export const appPerformanceScenarios = buildScenarios();
