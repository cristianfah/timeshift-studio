import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  executeToolcraftDeliveryLifecycleCore,
  loadToolcraftDeliveryPlanningInputs,
} from "./toolcraft-delivery-lifecycle.mjs";
import {
  collectToolcraftDeliveryFunctionalContext,
} from "./toolcraft-delivery-functional-context.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModelHash,
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createToolcraftDeliveryPlan,
} from "./toolcraft-delivery-plan.mjs";
import {
  createToolcraftVerificationSourceHash,
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  createDeliveryFixture,
  removeDeliveryFixture,
} from "./run-delivery-verification-test-helpers.mjs";

const hash = (character) => character.repeat(64);
const pathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
const performanceTestName = `browser perf: toolcraft path ${pathId}`;
const catalog = Object.freeze({
  acceptance: Object.freeze([Object.freeze({
    acceptanceId: "output.updates",
    contractHash: hash("b"),
    domainId: "output",
    file: "app-controls.spec.ts",
    testName: "browser: output updates",
  })]),
  performance: Object.freeze([Object.freeze({
    passIds: Object.freeze(["composite"]),
    pathId,
    testName: performanceTestName,
  })]),
  version: 2,
});

function proofModel(ownerPath) {
  return createToolcraftFunctionalProofModel({
    catalog,
    inventory: {
      owners: [{
        acceptanceIds: ["output.updates"],
        kind: "functional",
        path: ownerPath,
      }],
      version: 3,
    },
  });
}

function inventory(character) {
  const entries = Object.freeze([
    Object.freeze({
      path: "src/app/output.tsx",
      sha256: hash(character),
    }),
  ]);
  return Object.freeze({
    entries,
    sourceHash: createToolcraftVerificationSourceHash(entries),
  });
}

function impact(kind) {
  return Object.freeze({
    acceptanceIds: Object.freeze(["output.updates"]),
    browserTestNames: Object.freeze(["browser: output updates"]),
    buildRequired: true,
    performanceCandidates: Object.freeze({
      passIds:
        kind === "performance"
          ? Object.freeze(["composite"])
          : Object.freeze([]),
      pathIds:
        kind === "performance"
          ? Object.freeze([pathId])
          : Object.freeze([]),
      testNames:
        kind === "performance"
          ? Object.freeze([performanceTestName])
          : Object.freeze([]),
    }),
    productTestFiles: Object.freeze(["src/app/output.test.tsx"]),
  });
}

function planningInputs({ current, previous, kind = "functional" }) {
  const resolvedImpact = impact(kind);
  const currentFunctionalProofModel = proofModel(
    "src/app/output.tsx",
  );
  return Object.freeze({
    allProductTestFiles: Object.freeze(["src/app/output.test.tsx"]),
    authority: null,
    catalog,
    changeSet: Object.freeze({
      dependencyChanged: false,
      docsChanged: false,
      frameworkChanged: false,
      impact: resolvedImpact,
      platformChanged: false,
      productInputsChanged: true,
    }),
    comparisonInventory: Object.freeze({
      entries: previous.anchor.files,
      sourceHash: previous.anchor.sourceHash,
    }),
    currentFunctionalProofModel,
    currentInventory: current,
    integrity: Object.freeze({
      manifestHash: hash("a"),
      sourceHash: current.sourceHash,
    }),
    packageManager: "pnpm",
    previousFunctionalProofModel:
      previous.anchor.functionalProofModel,
    previousLifecycle: previous.anchor.lifecycle,
    previousPerformance: Object.freeze({ kind: "none" }),
  });
}

function dependencies({ current, kind = "functional", onCommit, onExecute }) {
  const previousFunctionalProofModel = proofModel(
    "src/app/previous-output.tsx",
  );
  const previous = Object.freeze({
    anchor: Object.freeze({
      files: inventory("1").entries,
      functionalProofModel: previousFunctionalProofModel,
      functionalProofModelHash:
        createToolcraftFunctionalProofModelHash(
          previousFunctionalProofModel,
        ),
      lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
      performance: Object.freeze({ kind: "none" }),
      sourceHash: inventory("1").sourceHash,
    }),
    receipt: Object.freeze({ version: 7 }),
  });
  const inputs = planningInputs({ current, kind, previous });
  return Object.freeze({
    collectInventory: async () => current,
    collectFunctionalContext: async () =>
      Object.freeze({
        currentFunctionalProofModel:
          inputs.currentFunctionalProofModel,
      }),
    commit: async (value) => onCommit?.(value),
    createPlan: createToolcraftDeliveryPlan,
    createReceipt: ({ functionalProofModel, plan, result }) =>
      Object.freeze({
        functionalProofModel,
        plan,
        result,
        version: 7,
      }),
    evaluateIntegrity: async () =>
      inputs.integrity,
    executePlan: async (options) => {
      onExecute?.(options);
      return Object.freeze({
        evidence: Object.freeze([]),
        finalInventory: current,
        planExecutionAuthority: Object.freeze(Object.create(null)),
      });
    },
    formatEscalationRecommendation: () => "",
    getEscalationRecommendation: () => null,
    loadPlanningInputs: async () =>
      inputs,
    readDeliveryAnchor: async () => previous,
  });
}

test("bare changed delivery automatically executes exact functional ownership proof", async () => {
  const current = inventory("2");
  let executed;
  let committed;
  const receipt = await executeToolcraftDeliveryLifecycleCore({
    dependencies: dependencies({
      current,
      onCommit: (value) => { committed = value; },
      onExecute: (value) => { executed = value; },
    }),
    projectDir: "/tmp/toolcraft-functional-changed",
  });

  assert.deepEqual(Object.keys(executed), ["plan", "projectDir"]);
  assert.equal(executed.plan.kind, "functional");
  assert.deepEqual(executed.plan.basis.changedFiles, ["src/app/output.tsx"]);
  assert.deepEqual(executed.plan.steps, [
    { kind: "code-health" },
    {
      files: ["src/app/output.test.tsx"],
      kind: "product-tests",
    },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: ["browser: output updates"],
    },
  ]);
  assert.equal(Object.hasOwn(executed.plan, "selectors"), false);
  assert.equal(committed.receipt, receipt);
});

test("performance-owned change stays functional without performance authority", async () => {
  const current = inventory("3");
  let plan;
  await executeToolcraftDeliveryLifecycleCore({
    dependencies: dependencies({
      current,
      kind: "performance",
      onExecute: ({ plan: value }) => { plan = value; },
    }),
    projectDir: "/tmp/toolcraft-functional-changed-performance",
  });

  assert.equal(plan.kind, "functional");
  assert.deepEqual(plan.steps.filter(
    ({ kind }) => kind === "browser-performance"), []);
  assert.equal(
    plan.steps.some(({ kind }) => kind === "browser-functional"),
    true,
  );
});

test("failed changed functional execution never reaches receipt construction or commit", async () => {
  const current = inventory("4");
  const base = dependencies({ current });
  let receipts = 0;
  let commits = 0;
  await assert.rejects(
    executeToolcraftDeliveryLifecycleCore({
      dependencies: Object.freeze({
        ...base,
        commit: async () => { commits += 1; },
        createReceipt: () => {
          receipts += 1;
          return {};
        },
        executePlan: async () => {
          throw new Error("targeted proof failed");
        },
      }),
      projectDir: "/tmp/toolcraft-functional-changed-failure",
    }),
    /targeted proof failed/iu,
  );
  assert.equal(receipts, 0);
  assert.equal(commits, 0);
});

test("planning input loader owns catalog, graph, ownership, and optional domain authority", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  const productPulsePath = path.join(rootDir, "public", "product-pulse.svg");
  const unownedTexturePath = path.join(rootDir, "public", "unowned-texture.svg");
  mkdirSync(path.dirname(productPulsePath), { recursive: true });
  writeFileSync(productPulsePath, "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
  writeFileSync(unownedTexturePath, "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
  const impactPath = path.join(
    rootDir,
    "src",
    "app",
    "app-verification-impact.json",
  );
  const impactInventory = JSON.parse(readFileSync(impactPath, "utf8"));
  impactInventory.owners.push({
    acceptanceIds: ["persistence.reload"],
    kind: "presentation",
    path: "public/product-pulse.svg",
  });
  impactInventory.owners.push({
    acceptanceIds: ["persistence.reload"],
    kind: "presentation",
    path: "public/unowned-texture.svg",
  });
  writeFileSync(impactPath, `${JSON.stringify(impactInventory)}\n`);
  const comparisonInventory =
    await collectToolcraftVerificationInputs(rootDir);
  writeFileSync(
    path.join(rootDir, "src", "app", "schema.ts"),
    "export const schema = 2;\n",
  );
  writeFileSync(
    path.join(rootDir, "docs", "toolcraft", "agent-worklog.md"),
    `# Agent Worklog

## Decision Trail

### Changed delivery 2
- Request: Update the schema behavior.
- Performance intent: ordinary-product-work
- Verification: ${TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE}

## Verification
Protected receipts own checks and evidence.
`,
  );
  const currentInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const functionalContext =
    await collectToolcraftDeliveryFunctionalContext(rootDir);
  const integrity = Object.freeze({
    manifestHash: hash("a"),
    sourceHash: currentInventory.sourceHash,
  });
  const inputs = await loadToolcraftDeliveryPlanningInputs({
    currentInventory,
    functionalContext,
    integrity,
    previous: {
      anchor: {
        files: comparisonInventory.entries,
        functionalProofModel:
          functionalContext.currentFunctionalProofModel,
        functionalProofModelHash:
          createToolcraftFunctionalProofModelHash(
            functionalContext.currentFunctionalProofModel,
          ),
        lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
        performance: { kind: "none" },
        sourceHash: comparisonInventory.sourceHash,
      },
      receipt: { version: 7 },
    },
    projectDir: rootDir,
  });

  assert.equal(inputs.authority, null);
  assert.equal(inputs.changeSet.docsChanged, true);
  assert.equal(inputs.changeSet.productInputsChanged, true);
  assert.equal("kind" in inputs.changeSet.impact, false);
  assert.deepEqual(
    inputs.changeSet.impact.browserTestNames,
    ["browser: focused acceptance"],
  );
  assert.equal(Object.hasOwn(inputs, "selectors"), false);
  assert.equal(Object.hasOwn(inputs, "executionContext"), false);
});

test("planning input loader rejects obsolete previous targeted reports", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  const currentInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const functionalContext =
    await collectToolcraftDeliveryFunctionalContext(rootDir);
  const integrity = Object.freeze({
    manifestHash: hash("a"),
    sourceHash: currentInventory.sourceHash,
  });

  for (const version of [1, 2]) {
    await t.test(`version ${version}`, async () => {
      await assert.rejects(
        loadToolcraftDeliveryPlanningInputs({
          currentInventory,
          functionalContext,
          integrity,
          previous: {
            anchor: {
              files: currentInventory.entries,
              functionalProofModel:
                functionalContext.currentFunctionalProofModel,
              functionalProofModelHash:
                createToolcraftFunctionalProofModelHash(
                  functionalContext.currentFunctionalProofModel,
                ),
              lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
              performance: {
                kind: "performance-iteration-report",
                requestAuthorityHash: hash("c"),
                report: { version },
                comparisonHash: hash("b"),
              },
              sourceHash: currentInventory.sourceHash,
            },
            receipt: { version: 7 },
          },
          projectDir: rootDir,
        }),
        /Previous targeted performance report is malformed/iu,
      );
    });
  }
});

test("planning separates signed framework refresh from copied runtime changes", async (t) => {
  const rootDir = createDeliveryFixture();
  t.after(() => removeDeliveryFixture(rootDir));
  const comparisonInventory =
    await collectToolcraftVerificationInputs(rootDir);
  writeFileSync(
    path.join(rootDir, "scripts", "toolcraft-source-inventory.mjs"),
    `${readFileSync(
      path.join(rootDir, "scripts", "toolcraft-source-inventory.mjs"),
      "utf8",
    )}\n// refreshed framework script\n`,
  );
  mkdirSync(
    path.join(rootDir, "src", "toolcraft", "runtime"),
    { recursive: true },
  );
  writeFileSync(
    path.join(rootDir, "src", "toolcraft", "runtime", "index.ts"),
    "export const refreshedCopiedRuntime = true;\n",
  );
  writeFileSync(path.join(rootDir, ".gitignore"), "dist\n");
  const currentInventory =
    await collectToolcraftVerificationInputs(rootDir);
  const collectedContext =
    await collectToolcraftDeliveryFunctionalContext(rootDir);
  const functionalContext = Object.freeze({
    ...collectedContext,
    frameworkOwnedPaths: Object.freeze([
      "scripts/toolcraft-source-inventory.mjs",
    ]),
  });
  const inputs = await loadToolcraftDeliveryPlanningInputs({
    currentInventory,
    functionalContext,
    integrity: Object.freeze({
      manifestHash: hash("a"),
      sourceHash: currentInventory.sourceHash,
    }),
    previous: {
      anchor: {
        files: comparisonInventory.entries,
        functionalProofModel:
          functionalContext.currentFunctionalProofModel,
        functionalProofModelHash:
          createToolcraftFunctionalProofModelHash(
            functionalContext.currentFunctionalProofModel,
          ),
        lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
        performance: { kind: "none" },
        sourceHash: comparisonInventory.sourceHash,
      },
      receipt: { version: 7 },
    },
    projectDir: rootDir,
  });

  assert.equal(inputs.changeSet.frameworkChanged, true);
  assert.equal(inputs.changeSet.platformChanged, true);
  assert.equal(inputs.changeSet.productInputsChanged, false);
  assert.equal(inputs.changeSet.impact, null);
});
