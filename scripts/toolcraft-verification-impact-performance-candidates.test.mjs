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
const paths = Object.freeze([
  "performance-path:%5B%22interactive-continuous%22%2C%22viewport-drag%22%2C%5B%22viewport-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D",
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D",
]);
const catalog = Object.freeze({
  acceptance: Object.freeze([
    Object.freeze({
      acceptanceId: "output.updates",
      contractHash: hash("a"),
      domainId: "output",
      file: "app-output.spec.ts",
      testName: "browser: output updates",
    }),
    Object.freeze({
      acceptanceId: "viewport.pans",
      contractHash: hash("b"),
      domainId: "viewport",
      file: "app-viewport.spec.ts",
      testName: "browser: viewport pans",
    }),
  ]),
  performance: Object.freeze([
    Object.freeze({
      passIds: Object.freeze(["viewport-composite"]),
      pathId: paths[0],
      testName: `browser perf: toolcraft path ${paths[0]}`,
    }),
    Object.freeze({
      passIds: Object.freeze(["preview-composite"]),
      pathId: paths[1],
      testName: `browser perf: toolcraft path ${paths[1]}`,
    }),
  ]),
  version: 2,
});

function model(owners) {
  return createToolcraftFunctionalProofModel({
    catalog,
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
    productResourcePaths: Object.freeze([]),
    productTestPaths: Object.freeze([]),
    proofModelPaths: Object.freeze([]),
    roleByPath: Object.freeze({ ...roleByPath }),
    rootFamily: "generated",
    runtimeProductionPaths: Object.freeze([]),
    semanticProofRootPaths:
      toolcraftVerificationInputRootFamilies.generated
        .semanticProofRootPaths,
  });
}

function resolve({
  changedFiles,
  currentOwners = [],
  entries,
  previousOwners = currentOwners,
  reverse,
  roleByPath,
}) {
  return resolveToolcraftChangedVerificationImpact({
    catalog,
    changedFiles,
    currentModel: model(currentOwners),
    graph: graph(entries, reverse),
    previousModel: model(previousOwners),
    roles: roles(roleByPath),
  });
}

function candidates(rows = catalog.performance) {
  return {
    passIds: [...new Set(rows.flatMap(({ passIds }) => passIds))].sort(),
    pathIds: rows.map(({ pathId }) => pathId).sort(),
    testNames: rows.map(({ testName }) => testName).sort(),
  };
}

test("a performance owner selects functional proof and current pass candidates", () => {
  const runtimePath = "src/features/output.tsx";
  const owners = [{
    acceptanceIds: ["output.updates"],
    kind: "performance",
    passIds: ["preview-composite"],
    path: runtimePath,
  }];
  const result = resolve({
    changedFiles: [runtimePath],
    currentOwners: owners,
    entries: [{
      owner: "product",
      repoPath: runtimePath,
      role: "production",
    }],
    roleByPath: { [runtimePath]: "runtime-production" },
  });

  assert.deepEqual(result.acceptanceIds, ["output.updates"]);
  assert.deepEqual(
    result.performanceCandidates,
    candidates([catalog.performance[1]]),
  );
  assert.equal(result.buildRequired, true);
});

test("the performance spec selects candidates but no functional browser proof", () => {
  const performancePath = "e2e/app-performance.spec.ts";
  const result = resolve({
    changedFiles: [performancePath],
    entries: [{
      owner: "product",
      repoPath: performancePath,
      role: "test",
    }],
    roleByPath: { [performancePath]: "product-test" },
  });

  assert.deepEqual(result.acceptanceIds, []);
  assert.deepEqual(result.browserTestNames, []);
  assert.deepEqual(result.performanceCandidates, candidates());
  assert.deepEqual(result.productTestFiles, []);
  assert.equal(result.buildRequired, false);
});

test("a performance-only helper preserves candidates without functional widening", () => {
  const helperPath = "e2e/test-support/performance-fixture.ts";
  const performancePath = "e2e/app-performance.spec.ts";
  const result = resolve({
    changedFiles: [helperPath],
    entries: [
      { owner: "product", repoPath: helperPath, role: "test-support" },
      {
        owner: "product",
        repoPath: performancePath,
        role: "test",
      },
    ],
    reverse: { [helperPath]: [performancePath] },
    roleByPath: {
      [helperPath]: "product-test",
      [performancePath]: "product-test",
    },
  });

  assert.deepEqual(result.browserTestNames, []);
  assert.deepEqual(result.performanceCandidates, candidates());
  assert.equal(result.buildRequired, false);
});

test("a performance helper still selects directly affected Vitest", () => {
  const helperPath = "e2e/test-support/performance-fixture.ts";
  const performancePath = "e2e/app-performance.spec.ts";
  const unitPath = "src/features/performance-contract.test.ts";
  const result = resolve({
    changedFiles: [helperPath],
    entries: [
      { owner: "product", repoPath: helperPath, role: "test-support" },
      {
        owner: "product",
        repoPath: performancePath,
        role: "test",
      },
      { owner: "product", repoPath: unitPath, role: "test" },
    ],
    reverse: {
      [helperPath]: [performancePath, unitPath],
    },
    roleByPath: {
      [helperPath]: "product-test",
      [performancePath]: "product-test",
      [unitPath]: "product-test",
    },
  });

  assert.deepEqual(result.productTestFiles, [unitPath]);
  assert.deepEqual(result.browserTestNames, []);
  assert.deepEqual(result.performanceCandidates, candidates());
});
