import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  resolveToolcraftChangedVerificationImpact,
} from "./toolcraft-verification-impact.mjs";
import {
  toolcraftVerificationInputRootFamilies,
} from "./toolcraft-verification-input-roles.mjs";

const hash = (value) => value.repeat(64);
const acceptance = (acceptanceId, file, testName, contract = "a") => ({
  acceptanceId,
  contractHash: hash(contract),
  domainId: acceptanceId.split(".")[0],
  file,
  testName,
});
const rows = Object.freeze({
  background: acceptance(
    "appearance.background",
    "app-appearance.spec.ts",
    "browser: background",
  ),
  foreground: acceptance(
    "appearance.foreground",
    "app-appearance.spec.ts",
    "browser: foreground",
  ),
  persistence: acceptance(
    "persistence.reload",
    "app-persistence.spec.ts",
    "browser: persistence",
  ),
});
const performanceRow = Object.freeze({
  passIds: Object.freeze(["preview-composite"]),
  pathId:
    "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D",
  testName:
    "browser perf: toolcraft path performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D",
});

function catalog(acceptanceRows = Object.values(rows)) {
  return {
    acceptance: acceptanceRows,
    performance: [performanceRow],
    version: 2,
  };
}

function owner(path, acceptanceIds, extra = {}) {
  return { acceptanceIds, kind: "functional", path, ...extra };
}

function model(deliveryCatalog, owners) {
  return createToolcraftFunctionalProofModel({
    catalog: deliveryCatalog,
    inventory: { owners, version: 3 },
  });
}

function graph(entries, reverse = {}) {
  return Object.freeze({
    entries: Object.freeze(entries),
    reverse: new Map(
      entries.map(({ repoPath }) => [
        repoPath,
        Object.freeze([...(reverse[repoPath] ?? [])]),
      ]),
    ),
  });
}

function roles(roleByPath) {
  return Object.freeze({
    impactInventoryPath: "src/app/app-verification-impact.json",
    productResourcePaths: Object.freeze(
      Object.keys(roleByPath).filter(
        (repoPath) => roleByPath[repoPath] === "product-resource",
      ),
    ),
    productTestPaths: Object.freeze([]),
    proofModelPaths: Object.freeze(
      Object.keys(roleByPath).filter(
        (repoPath) => roleByPath[repoPath] === "proof-model",
      ),
    ),
    roleByPath: Object.freeze({ ...roleByPath }),
    rootFamily: "generated",
    runtimeProductionPaths: Object.freeze(
      Object.keys(roleByPath).filter(
        (repoPath) => roleByPath[repoPath] === "runtime-production",
      ),
    ),
    semanticProofRootPaths:
      toolcraftVerificationInputRootFamilies.generated
        .semanticProofRootPaths,
  });
}

function resolve({
  changedFiles,
  currentCatalog,
  currentModelCatalog = currentCatalog,
  currentOwners,
  entries = [],
  previousCatalog = currentCatalog,
  previousOwners = currentOwners,
  reverse,
  roleByPath,
}) {
  return resolveToolcraftChangedVerificationImpact({
    catalog: currentCatalog,
    changedFiles,
    currentModel: model(currentModelCatalog, currentOwners),
    graph: graph(entries, reverse),
    previousModel: model(previousCatalog, previousOwners),
    roles: roles(roleByPath),
  });
}

test("runtime and resource changes use direct previous/current ownership", () => {
  const currentCatalog = catalog();
  const previousOwners = [
    owner("public/deleted.png", ["appearance.foreground"]),
    owner("src/features/output.tsx", ["appearance.background"], {
      kind: "performance",
      passIds: ["preview-composite"],
    }),
  ];
  const currentOwners = [
    owner("public/current.png", ["appearance.background"]),
    owner("src/features/output.tsx", ["appearance.foreground"], {
      kind: "performance",
      passIds: ["preview-composite"],
    }),
  ];
  const roleByPath = {
    "public/current.png": "product-resource",
    "src/features/output.tsx": "runtime-production",
  };
  const entries = Object.keys(roleByPath).map((repoPath) => ({
    owner: "product",
    repoPath,
    role: "production",
  }));

  const runtime = resolve({
    changedFiles: ["src/features/output.tsx"],
    currentCatalog,
    currentOwners,
    entries,
    previousOwners,
    roleByPath,
  });
  assert.deepEqual(runtime.acceptanceIds, [
    "appearance.background",
    "appearance.foreground",
  ]);
  assert.equal(runtime.buildRequired, true);
  assert.deepEqual(runtime.performanceCandidates.passIds, [
    "preview-composite",
  ]);

  const currentResource = resolve({
    changedFiles: ["public/current.png"],
    currentCatalog,
    currentOwners: [
      owner("public/current.png", ["appearance.background"]),
    ],
    entries,
    previousOwners: [
      owner("public/current.png", ["appearance.background"]),
    ],
    roleByPath,
  });
  assert.deepEqual(currentResource.acceptanceIds, [
    "appearance.background",
  ]);

  for (const deletedPath of [
    "public/deleted.png",
    "src/features/deleted.tsx",
  ]) {
    const deleted = resolve({
      changedFiles: [deletedPath],
      currentCatalog,
      currentOwners: [],
      entries,
      previousOwners: [
        owner(deletedPath, ["appearance.foreground"]),
      ],
      roleByPath,
    });
    assert.deepEqual(deleted.acceptanceIds, [
      "appearance.foreground",
    ]);
  }
});

test("a new unowned runtime or resource path fails with its exact path", () => {
  const currentCatalog = catalog();
  for (const [repoPath, role] of [
    ["src/features/unowned.tsx", "runtime-production"],
    ["public/unowned.png", "product-resource"],
  ]) {
    assert.throws(
      () =>
        resolve({
          changedFiles: [repoPath],
          currentCatalog,
          currentOwners: [],
          entries: [{
            owner: "product",
            repoPath,
            role: "production",
          }],
          previousOwners: [],
          roleByPath: { [repoPath]: role },
        }),
      new RegExp(repoPath.replaceAll(".", "\\."), "u"),
    );
  }
});

test("proof configuration selects only semantic owner and acceptance deltas", () => {
  const currentCatalog = catalog([
    { ...rows.background, contractHash: hash("b") },
    rows.foreground,
    rows.persistence,
  ]);
  const previousCatalog = catalog();
  const previousOwners = [
    owner("src/features/output.tsx", ["appearance.background"]),
  ];
  const currentOwners = [
    owner("src/features/output.tsx", ["appearance.foreground"]),
  ];
  const roleByPath = {
    "src/app/app-acceptance-data.ts": "proof-model",
    "src/app/app-verification-impact.json": "proof-model",
    "src/features/output.tsx": "runtime-production",
  };
  const contractTest = "src/app/app-acceptance-contract.test.ts";
  const entries = [
    {
      owner: "product",
      repoPath: "src/app/app-acceptance-data.ts",
      role: "production",
    },
    {
      owner: "product",
      repoPath: "src/app/app-verification-impact.json",
      role: "production",
    },
    { owner: "product", repoPath: contractTest, role: "test" },
  ];
  const reverse = {
    "src/app/app-acceptance-data.ts": [contractTest],
    "src/app/app-verification-impact.json": [contractTest],
  };

  const ownerDelta = resolve({
    changedFiles: ["src/app/app-verification-impact.json"],
    currentCatalog,
    currentOwners,
    entries,
    previousCatalog: currentCatalog,
    previousOwners,
    reverse,
    roleByPath,
  });
  assert.deepEqual(ownerDelta.acceptanceIds, [
    "appearance.background",
    "appearance.foreground",
  ]);
  assert.equal(
    ownerDelta.acceptanceIds.includes("persistence.reload"),
    false,
  );
  assert.deepEqual(ownerDelta.productTestFiles, []);

  const acceptanceDelta = resolve({
    changedFiles: ["src/app/app-acceptance-data.ts"],
    currentCatalog,
    currentOwners: previousOwners,
    entries,
    previousCatalog,
    previousOwners,
    reverse,
    roleByPath,
  });
  assert.deepEqual(acceptanceDelta.acceptanceIds, [
    "appearance.background",
  ]);
  assert.deepEqual(acceptanceDelta.productTestFiles, []);

  const helperPath = "src/app/acceptance-helper.ts";
  const helperDelta = resolve({
    changedFiles: [
      "src/app/app-acceptance-data.ts",
      helperPath,
    ],
    currentCatalog,
    currentOwners: previousOwners,
    entries: [
      ...entries,
      { owner: "product", repoPath: helperPath, role: "production" },
    ],
    previousCatalog,
    previousOwners,
    reverse: {
      ...reverse,
      [helperPath]: [contractTest],
    },
    roleByPath: {
      ...roleByPath,
      [helperPath]: "proof-model",
    },
  });
  assert.deepEqual(helperDelta.acceptanceIds, [
    "appearance.background",
  ]);
  assert.deepEqual(helperDelta.productTestFiles, [contractTest]);
});

test("proof helper byte changes with no model delta select only Vitest", () => {
  const currentCatalog = catalog();
  const owners = [
    owner("src/features/output.tsx", ["appearance.background"]),
  ];
  const helperPath = "src/app/acceptance-helper.ts";
  const testPath = "src/app/app-acceptance-data.test.ts";
  const result = resolve({
    changedFiles: [helperPath],
    currentCatalog,
    currentOwners: owners,
    entries: [
      { owner: "product", repoPath: helperPath, role: "production" },
      { owner: "product", repoPath: testPath, role: "test" },
    ],
    previousOwners: owners,
    reverse: { [helperPath]: [testPath] },
    roleByPath: { [helperPath]: "proof-model" },
  });

  assert.deepEqual(result, {
    acceptanceIds: [],
    browserTestNames: [],
    buildRequired: false,
    performanceCandidates: {
      passIds: [],
      pathIds: [],
      testNames: [],
    },
    productTestFiles: [testPath],
  });
});

test("canonical performance root byte changes with no model delta select affected Vitest", () => {
  const currentCatalog = catalog();
  const owners = [
    owner("src/features/output.tsx", ["appearance.background"]),
  ];
  const performancePath = "src/app/app-performance.ts";
  const testPath = "src/app/app-performance.gates.test.ts";
  const result = resolve({
    changedFiles: [performancePath],
    currentCatalog,
    currentOwners: owners,
    entries: [
      {
        owner: "product",
        repoPath: performancePath,
        role: "production",
      },
      { owner: "product", repoPath: testPath, role: "test" },
    ],
    previousOwners: owners,
    reverse: { [performancePath]: [testPath] },
    roleByPath: { [performancePath]: "proof-model" },
  });

  assert.deepEqual(result, {
    acceptanceIds: [],
    browserTestNames: [],
    buildRequired: false,
    performanceCandidates: {
      passIds: [],
      pathIds: [],
      testNames: [],
    },
    productTestFiles: [testPath],
  });
});

test("removed acceptance ids are never mapped to current Playwright names", () => {
  const currentCatalog = catalog([rows.persistence]);
  const previousCatalog = catalog([rows.background, rows.persistence]);
  const previousOwners = [
    owner("src/features/output.tsx", ["appearance.background"]),
  ];
  const result = resolve({
    changedFiles: ["src/app/app-acceptance-data.ts"],
    currentCatalog,
    currentOwners: [],
    previousCatalog,
    previousOwners,
    roleByPath: {
      "src/app/app-acceptance-data.ts": "proof-model",
    },
  });

  assert.deepEqual(result.acceptanceIds, []);
  assert.deepEqual(result.browserTestNames, []);
});

test("a valid stale catalog cannot filter current model proof silently", () => {
  const currentCatalog = catalog([rows.persistence]);
  const staleModelCatalog = catalog([
    rows.background,
    rows.persistence,
  ]);
  const runtimePath = "src/features/output.tsx";

  assert.throws(
    () =>
      resolve({
        changedFiles: [runtimePath],
        currentCatalog,
        currentModelCatalog: staleModelCatalog,
        currentOwners: [
          owner(runtimePath, ["appearance.background"]),
        ],
        entries: [{
          owner: "product",
          repoPath: runtimePath,
          role: "production",
        }],
        previousCatalog: staleModelCatalog,
        roleByPath: { [runtimePath]: "runtime-production" },
      }),
    /current catalog.*functional proof model/iu,
  );
});
