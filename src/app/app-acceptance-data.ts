import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import { appSchema } from "./app-schema";
import { buildChainAcceptance } from "./timeshift/acceptance/chain-rows";
import { buildProductAcceptance } from "./timeshift/acceptance/product-rows";
import { buildSectionInventory } from "./timeshift/schema/section-inventory";

const productPersistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence:
        "El clip importado fija la duración; sin clip, la app arranca con el bucle de 8 s del esquema para que los LFO y los keyframes tengan un ciclo sobre una imagen fija.",
      seconds: 8,
      source: "product-derived",
    },
    mode: "timeline-keyframes",
  },
  mode: "new-toolcraft-app",
};

export const appProductReadiness: ToolcraftProductReadiness = {
  mode: "product",
  productName: "Timeshift Studio",
  productSummary:
    "Editor de efectos temporales: cadena de 8 slots sobre un clip de video o una imagen fija, timeline con keyframes y export PNG/JPG y video.",
  requestedBehavior:
    "Arrastrar un clip o una imagen, verla en canvas, aplicarle efectos en cadena (8 slots × 11 tipos), modular parámetros con LFO, editar keyframes en timeline y exportar el resultado.",
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: {
      evidence:
        "El producto se pidió como editor de video con export de video («exportar resultado» sobre un clip) y el usuario mantiene «Exportar vídeo» junto al export de imagen.",
      mode: "user-requested",
    },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "El canvas es el resultado renderizado; superponerle una parrilla de efectos taparía el propio producto.",
        surface: "canvas",
      },
      capability: "structured-selection",
      evidence: {
        detail:
          "El usuario elige efectos desde una parrilla con vista previa, no desde el visor.",
        source: "user-request",
      },
      id: "chain-effect-browser",
      reason:
        "El explorador de efectos vive en el panel, junto a la cadena que edita.",
      surface: "panel",
      target: "chain.browser",
    },
  ],
  viewInteraction: {
    mode: "non-spatial",
    reason:
      "La salida es un plano 2D renderizado sobre la fuente importada; no hay escena tridimensional que orbitar ni pose que editar.",
  },
};

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  ...buildProductAcceptance(productPersistenceSlices),
  ...buildChainAcceptance(),
];

// Product entries use the same explicit stable section IDs as appSchema.
export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] =
  buildSectionInventory(appSchema);
