import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { appSchema } from "./app-schema";

const productPersistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
};

export const appProductReadiness: ToolcraftProductReadiness = {
  mode: "product",
  productName: "Timeshift Studio",
  productSummary:
    "Editor de video con cadena de efectos de 8 slots, timeline con keyframes, y export PNG/Video.",
  requestedBehavior:
    "Arrastrar un clip de video, verlo en canvas, aplicarle efectos en cadena (8 slots × 10 tipos), modular parámetros con LFO, editar keyframes en timeline, exportar resultado.",
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      id: "canvas.preview",
      surface: "canvas",
      capability: "direct-spatial-edit",
      reason: "El canvas es el preview del clip renderizado",
      alternative: {
        surface: "panel",
        reason: "El panel no tiene preview del clip",
      },
      evidence: {
        source: "user-request",
        detail: "Usuario quiere ver el clip en canvas",
      },
      target: "canvas.size",
    },
    {
      id: "panel.effects",
      surface: "panel",
      capability: "property-edit",
      reason: "Los efectos se editan desde el panel de controles",
      alternative: {
        surface: "canvas",
        reason: "No hay handles de efecto en canvas",
      },
      evidence: {
        source: "user-request",
        detail: "Efectos en cadena visibles en panel lateral",
      },
      target: "panels.controls",
    },
    {
      id: "panel.timeline",
      surface: "panel",
      capability: "property-edit",
      reason: "La timeline se edita desde el panel inferior",
      alternative: {
        surface: "canvas",
        reason: "No hay controles de timeline en canvas",
      },
      evidence: {
        source: "user-request",
        detail: "Timeline con keyframes en panel inferior",
      },
      target: "panels.timeline",
    },
    {
      id: "panel.export",
      surface: "panel",
      capability: "command",
      reason: "Export se dispara desde sticky footer actions",
      alternative: {
        surface: "canvas",
        reason: "No hay botón de export en canvas",
      },
      evidence: {
        source: "user-request",
        detail: "Botón de export en panel actions",
      },
      target: "onPanelAction",
    },
  ],
  viewInteraction: {
    mode: "orbit",
    orientationTargets: ["canvas.size"],
  },
};

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
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
    persistenceSlices: productPersistenceSlices,
    target: "canvas.size.width",
    userAction: "Upload a clip, select an effect, expand timeline, reload, and verify restored state.",
  },
  {
    automated: true,
    automatedTestName:
      "timeline extended by default on mount",
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
];

// Product entries use the same explicit stable section IDs as appSchema.
export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [];