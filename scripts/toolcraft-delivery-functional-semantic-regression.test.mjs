import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_DELIVERY_PLAN_VERSION,
  createToolcraftDeliveryPlan,
} from "./toolcraft-delivery-plan.mjs";
import {
  resolveToolcraftChangedVerificationImpact,
} from "./toolcraft-verification-impact.mjs";
import {
  createToolcraftFunctionalProofRegressionFixture,
} from "./toolcraft-functional-proof-regression-fixtures.mjs";

const materialBrowserTestNames = Object.freeze([
  "browser: material bake changes rendered output",
  "browser: material color changes rendered output",
  "browser: material exported appearance matches preview",
  "browser: material roughness changes rendered output",
  "browser: material shape changes rendered output",
  "browser: material texture changes rendered output",
  "browser: material topping changes rendered output",
]);

const materialAcceptanceIds = Object.freeze([
  "material.bake",
  "material.color",
  "material.exportedAppearance",
  "material.roughness",
  "material.shape",
  "material.texture",
  "material.topping",
]);

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

const unrelatedAcceptanceIds = Object.freeze([
  "canvas.infinity",
  "export.background",
  "export.imageFormat",
  "export.resolution",
  "persistence.reload",
  "runtime.settingsTransfer",
  "scene.orientation",
]);

const unrelatedBrowserTestNames = Object.freeze([
  "browser: export background changes rendered output",
  "browser: export image format changes output",
  "browser: export resolution changes output",
  "browser: infinity canvas changes viewport",
  "browser: persistence restores workspace",
  "browser: runtime settings transfer preserves values",
  "browser: scene orientation changes rendered output",
]);

test("a broad material batch plans only exact semantic functional proof", () => {
  const fixture = createToolcraftFunctionalProofRegressionFixture();
  const impact = resolveToolcraftChangedVerificationImpact(
    fixture.resolutionInputs,
  );
  const plan = createToolcraftDeliveryPlan(
    fixture.createPlanningInputs(impact),
  );

  assert.equal(TOOLCRAFT_DELIVERY_PLAN_VERSION, 4);
  assert.deepEqual(fixture.changedFiles, changedFiles);
  assert.deepEqual(fixture.materialAcceptanceIds, materialAcceptanceIds);
  assert.deepEqual(impact.acceptanceIds, materialAcceptanceIds);
  assert.deepEqual(impact.browserTestNames, materialBrowserTestNames);
  assert.deepEqual(fixture.materialProductTestFiles, materialProductTestFiles);
  assert.deepEqual(impact.productTestFiles, materialProductTestFiles);
  assert.equal(impact.buildRequired, true);
  assert.deepEqual(
    impact.performanceCandidates.passIds,
    ["preview-composite"],
  );

  assert.equal(plan.kind, "functional");
  assert.deepEqual(plan.basis.changedFiles, fixture.changedFiles);
  assert.deepEqual(plan.steps, [
    { kind: "code-health" },
    {
      files: materialProductTestFiles,
      kind: "product-tests",
    },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: materialBrowserTestNames,
    },
  ]);
  assert.equal(
    plan.steps.filter(({ kind }) => kind === "build").length,
    1,
  );
  assert.equal(
    plan.steps.some(({ kind }) => kind === "browser-performance"),
    false,
  );
  assert.equal(
    plan.steps.some(({ kind }) => kind.includes("performance")),
    false,
  );

  for (const acceptanceId of unrelatedAcceptanceIds) {
    assert.equal(
      impact.acceptanceIds.includes(acceptanceId),
      false,
      `unexpected acceptance id: ${acceptanceId}`,
    );
  }
  for (const testName of unrelatedBrowserTestNames) {
    assert.equal(
      impact.browserTestNames.includes(testName),
      false,
      `unexpected browser proof: ${testName}`,
    );
  }
});
