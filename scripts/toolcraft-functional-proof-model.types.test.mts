import type {
  ToolcraftFunctionalProofOwner,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import type {
  ToolcraftDeliveryCatalog,
  ToolcraftVerificationImpactOwner,
} from "./toolcraft-verification-impact.mjs";

const functionalOwner: ToolcraftFunctionalProofOwner = {
  acceptanceIds: ["material.shape"],
  kind: "functional",
  path: "src/material.ts",
};
const presentationOwner: ToolcraftFunctionalProofOwner = {
  acceptanceIds: ["appearance.background"],
  kind: "presentation",
  path: "public/background.png",
};
const performanceOwner: ToolcraftFunctionalProofOwner = {
  acceptanceIds: ["material.shape"],
  kind: "performance",
  passIds: ["preview-composite"],
  path: "src/output.ts",
};
const invalidFunctional: ToolcraftFunctionalProofOwner = {
  acceptanceIds: ["material.shape"],
  kind: "functional",
  // @ts-expect-error Functional owners cannot carry renderer passes.
  passIds: ["preview-composite"],
  path: "src/material.ts",
};
const invalidPresentation: ToolcraftFunctionalProofOwner = {
  acceptanceIds: ["appearance.background"],
  kind: "presentation",
  // @ts-expect-error Presentation owners cannot carry renderer passes.
  passIds: ["preview-composite"],
  path: "public/background.png",
};
// @ts-expect-error Performance owners require renderer passes.
const invalidPerformance: ToolcraftFunctionalProofOwner = {
  acceptanceIds: ["material.shape"],
  kind: "performance",
  path: "src/output.ts",
};
const publicFunctionalOwner: ToolcraftVerificationImpactOwner = {
  acceptanceIds: ["material.shape"],
  kind: "functional",
  path: "src/material.ts",
};
const invalidPublicFunctionalOwner: ToolcraftVerificationImpactOwner = {
  acceptanceIds: ["material.shape"],
  kind: "functional",
  // @ts-expect-error Functional impact owners cannot carry passIds.
  passIds: ["preview-composite"],
  path: "src/material.ts",
};
// @ts-expect-error Performance impact owners require passIds.
const invalidPublicPerformanceOwner: ToolcraftVerificationImpactOwner = {
  acceptanceIds: ["material.shape"],
  kind: "performance",
  path: "src/output.ts",
};
const sharedCurrentCatalog: ToolcraftDeliveryCatalog = {
  acceptance: [],
  performance: [],
  version: 2,
};
const validCurrentModel = createToolcraftFunctionalProofModel({
  catalog: sharedCurrentCatalog,
  inventory: {
    owners: [],
    version: 3,
  },
});
createToolcraftFunctionalProofModel({
  catalog: {
    acceptance: [],
    performance: [],
    // @ts-expect-error Delivery catalog is current-only v2.
    version: 3,
  },
  inventory: {
    owners: [],
    version: 3,
  },
});

void [
  functionalOwner,
  presentationOwner,
  performanceOwner,
  invalidFunctional,
  invalidPresentation,
  invalidPerformance,
  publicFunctionalOwner,
  invalidPublicFunctionalOwner,
  invalidPublicPerformanceOwner,
  validCurrentModel,
];
