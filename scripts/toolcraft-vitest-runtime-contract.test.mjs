import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES,
  TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE,
  evaluateToolcraftVitestRuntimeEvidence,
  getToolcraftProductTestProcessArgs,
  parseToolcraftVitestRuntimeRequirements,
  serializeToolcraftVitestRuntimeRequirements,
} from "./toolcraft-vitest-runtime-contract.mjs";

const requirement = {
  kind: "acceptance",
  requirementId: "appearance.opacity",
  testName: "opacity changes product output",
};

function requiredTest(overrides = {}) {
  return {
    expectedFailure: false,
    filePath: "src/app/app-schema.test.ts",
    name: requirement.testName,
    owner: "product",
    state: "passed",
    ...overrides,
  };
}

test("product-test process args execute only planned files and gate runtime evidence on a planned marker", () => {
  assert.deepEqual(
    getToolcraftProductTestProcessArgs([
      "src/app/app-schema.test.ts",
      "src/features/focused-output.test.tsx",
    ]),
    [
      "run",
      "src/app/app-schema.test.ts",
      "src/features/focused-output.test.tsx",
      "--passWithNoTests",
      "--reporter=default",
    ],
  );

  for (const markerFileName of TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES) {
    const markerPath = `src/app/${markerFileName}`;
    assert.deepEqual(
      getToolcraftProductTestProcessArgs([
        markerPath,
        "src/app/app-schema.test.ts",
      ]),
      [
        "run",
        markerPath,
        "src/app/app-schema.test.ts",
        "--passWithNoTests",
        "--reporter=default",
        "--reporter=./scripts/toolcraft-vitest-runtime-evidence-reporter.mjs",
      ],
    );
  }
});

test("round-trips runtime requirements through a typed annotation", () => {
  assert.deepEqual(
    parseToolcraftVitestRuntimeRequirements({
      message: serializeToolcraftVitestRuntimeRequirements([requirement]),
      type: TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE,
    }),
    [requirement],
  );
});

test("accepts one passed product-owned test", () => {
  assert.deepEqual(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest()],
    }),
    [],
  );
});

test("rejects missing, duplicate, framework-owned, and skipped tests", () => {
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [],
    })[0],
    /Missing required automated test/u,
  );
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest(), requiredTest({ filePath: "src/product.test.ts" })],
    })[0],
    /Duplicate required automated test/u,
  );
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest({ owner: "framework" })],
    })[0],
    /Missing required automated test/u,
  );
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest({ state: "skipped" })],
    })[0],
    /must finish with status "passed"/u,
  );
});

test("rejects expected-failure tests even when Vitest reports them as passed", () => {
  assert.match(
    evaluateToolcraftVitestRuntimeEvidence({
      requirements: [requirement],
      tests: [requiredTest({ expectedFailure: true })],
    })[0],
    /must not use expected-failure mode/u,
  );
});
