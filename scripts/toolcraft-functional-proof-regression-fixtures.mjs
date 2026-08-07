import {
  validateToolcraftDeliveryCatalog,
} from "./playwright-test-title-selection.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  toolcraftVerificationInputRootFamilies,
} from "./toolcraft-verification-input-roles.mjs";
import {
  createToolcraftVerificationSourceHash,
} from "./toolcraft-verification-inventory.mjs";

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const hash = (character) => character.repeat(64);

const materialRows = Object.freeze([
  ["material.bake", "browser: material bake changes rendered output"],
  ["material.color", "browser: material color changes rendered output"],
  [
    "material.exportedAppearance",
    "browser: material exported appearance matches preview",
  ],
  [
    "material.roughness",
    "browser: material roughness changes rendered output",
  ],
  ["material.shape", "browser: material shape changes rendered output"],
  ["material.texture", "browser: material texture changes rendered output"],
  ["material.topping", "browser: material topping changes rendered output"],
]);

const unrelatedRows = Object.freeze([
  [
    "canvas.infinity",
    "app-canvas.spec.ts",
    "browser: infinity canvas changes viewport",
  ],
  [
    "export.background",
    "app-export.spec.ts",
    "browser: export background changes rendered output",
  ],
  [
    "export.imageFormat",
    "app-export.spec.ts",
    "browser: export image format changes output",
  ],
  [
    "export.resolution",
    "app-export.spec.ts",
    "browser: export resolution changes output",
  ],
  [
    "persistence.reload",
    "app-persistence.spec.ts",
    "browser: persistence restores workspace",
  ],
  [
    "runtime.settingsTransfer",
    "app-runtime.spec.ts",
    "browser: runtime settings transfer preserves values",
  ],
  [
    "scene.orientation",
    "app-scene.spec.ts",
    "browser: scene orientation changes rendered output",
  ],
]);

const materialAcceptanceIds = Object.freeze(
  materialRows.map(([acceptanceId]) => acceptanceId),
);
const materialProductTestFiles = Object.freeze([
  "src/features/material/material-controls.test.ts",
  "src/features/material/material-export.test.ts",
  "src/features/material/material-renderer.test.ts",
]);
const changedFiles = Object.freeze([
  "e2e/app-material.spec.ts",
  "public/material-texture-a.png",
  "public/material-texture-b.png",
  "public/material-texture-c.png",
  "src/app/app-acceptance-data.ts",
  "src/app/app-performance.ts",
  "src/app/app-verification-impact.json",
  "src/features/material/material-runtime.ts",
]);
const performancePathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";

function acceptanceRow([acceptanceId, file, testName], index) {
  return {
    acceptanceId,
    contractHash: hash((index + 1).toString(16)),
    domainId: acceptanceId.split(".")[0],
    file,
    testName,
  };
}

function catalog(includeMaterial) {
  const rows = [
    ...unrelatedRows.map(acceptanceRow),
    ...(includeMaterial
      ? materialRows.map(([acceptanceId, testName], index) =>
          acceptanceRow(
            [acceptanceId, "app-material.spec.ts", testName],
            unrelatedRows.length + index,
          ),
        )
      : []),
  ];
  const validation = validateToolcraftDeliveryCatalog({
    acceptance: rows,
    performance: [{
      passIds: ["preview-composite"],
      pathId: performancePathId,
      testName: `browser perf: toolcraft path ${performancePathId}`,
    }],
    version: 2,
  });
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join("\n"));
  }
  return validation.catalog;
}

function currentOwners() {
  const textureAcceptance = [
    "material.exportedAppearance",
    "material.texture",
  ];
  return [
    {
      acceptanceIds: textureAcceptance,
      kind: "functional",
      path: "public/material-texture-a.png",
    },
    {
      acceptanceIds: textureAcceptance,
      kind: "functional",
      path: "public/material-texture-b.png",
    },
    {
      acceptanceIds: textureAcceptance,
      kind: "functional",
      path: "public/material-texture-c.png",
    },
    {
      acceptanceIds: materialAcceptanceIds,
      kind: "performance",
      passIds: ["preview-composite"],
      path: "src/features/material/material-runtime.ts",
    },
  ];
}

function proofModel(deliveryCatalog, owners) {
  return createToolcraftFunctionalProofModel({
    catalog: deliveryCatalog,
    inventory: { owners, version: 3 },
  });
}

function inventory(characterOffset) {
  const entries = changedFiles.map((filePath, index) => ({
    path: filePath,
    sha256: hash((characterOffset + index).toString(16)),
  }));
  return Object.freeze({
    entries: Object.freeze(entries.map(Object.freeze)),
    sourceHash: createToolcraftVerificationSourceHash(entries),
  });
}

function createGraph() {
  const runtimePath = "src/features/material/material-runtime.ts";
  const entries = [
    ...changedFiles.map((repoPath) => ({
      owner: "product",
      repoPath,
      role: repoPath.endsWith(".spec.ts") ? "test" : "production",
    })),
    ...materialProductTestFiles.map((repoPath) => ({
      owner: "product",
      repoPath,
      role: "test",
    })),
  ].sort((left, right) => compareCodeUnits(left.repoPath, right.repoPath));
  const reverse = new Map(
    entries.map(({ repoPath }) => [repoPath, Object.freeze([])]),
  );
  reverse.set(runtimePath, materialProductTestFiles);
  for (const texturePath of changedFiles.filter((repoPath) =>
    repoPath.startsWith("public/"))) {
    reverse.set(texturePath, Object.freeze([
      "src/features/material/material-export.test.ts",
      "src/features/material/material-renderer.test.ts",
    ]));
  }
  return Object.freeze({
    entries: Object.freeze(entries.map(Object.freeze)),
    reverse,
  });
}

function createRoles() {
  const resourcePaths = changedFiles.filter((repoPath) =>
    repoPath.startsWith("public/"));
  const proofModelPaths = [
    "src/app/app-acceptance-data.ts",
    "src/app/app-performance.ts",
    "src/app/app-verification-impact.json",
  ];
  const roleByPath = Object.fromEntries([
    ...resourcePaths.map((repoPath) => [repoPath, "product-resource"]),
    ...proofModelPaths.map((repoPath) => [repoPath, "proof-model"]),
    ...materialProductTestFiles.map((repoPath) => [repoPath, "product-test"]),
    ["e2e/app-material.spec.ts", "product-test"],
    [
      "src/features/material/material-runtime.ts",
      "runtime-production",
    ],
  ]);
  return Object.freeze({
    impactInventoryPath: "src/app/app-verification-impact.json",
    productResourcePaths: Object.freeze(resourcePaths),
    productTestPaths: Object.freeze([
      "e2e/app-material.spec.ts",
      ...materialProductTestFiles,
    ]),
    proofModelPaths: Object.freeze(proofModelPaths),
    roleByPath: Object.freeze(roleByPath),
    rootFamily: "generated",
    runtimeProductionPaths: Object.freeze([
      "src/features/material/material-runtime.ts",
    ]),
    semanticProofRootPaths:
      toolcraftVerificationInputRootFamilies.generated
        .semanticProofRootPaths,
  });
}

export function createToolcraftFunctionalProofRegressionFixture() {
  const previousCatalog = catalog(false);
  const currentCatalog = catalog(true);
  const previousFunctionalProofModel = proofModel(previousCatalog, []);
  const currentFunctionalProofModel = proofModel(
    currentCatalog,
    currentOwners(),
  );
  const comparisonInventory = inventory(0);
  const currentInventory = inventory(8);
  const resolutionInputs = Object.freeze({
    catalog: currentCatalog,
    changedFiles,
    currentModel: currentFunctionalProofModel,
    graph: createGraph(),
    previousModel: previousFunctionalProofModel,
    roles: createRoles(),
  });

  return Object.freeze({
    changedFiles,
    createPlanningInputs: (impact) => ({
      allProductTestFiles: materialProductTestFiles,
      authority: null,
      catalog: currentCatalog,
      changeSet: {
        dependencyChanged: false,
        docsChanged: false,
        frameworkChanged: false,
        impact,
        platformChanged: false,
        productInputsChanged: true,
      },
      comparisonInventory,
      currentFunctionalProofModel,
      currentInventory,
      integrity: {
        manifestHash: hash("f"),
        sourceHash: currentInventory.sourceHash,
      },
      packageManager: "pnpm",
      previousFunctionalProofModel,
      previousLifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
      previousPerformance: { kind: "none" },
    }),
    materialAcceptanceIds,
    materialProductTestFiles,
    resolutionInputs,
  });
}
