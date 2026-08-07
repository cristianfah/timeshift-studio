import { isDeepStrictEqual } from "node:util";

import {
  createToolcraftDeliveryPlanLifecycle,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  getToolcraftChangedVerificationFiles,
} from "./toolcraft-verification-inventory.mjs";

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function fixedSteps(inputs, dependencies) {
  return [
    ...(dependencies
      ? [{ kind: "dependencies", packageManager: inputs.packageManager }]
      : []),
    { kind: "docs" },
    { kind: "code-health" },
    { kind: "product-tests", files: inputs.allProductTestFiles },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: inputs.catalog.acceptance
        .map((row) => row.testName)
        .sort(compare),
    },
  ];
}

function performanceStep(selection) {
  return {
    kind: "browser-performance",
    passIds: selection.passIds,
    pathIds: selection.pathIds,
    testNames: selection.testNames,
  };
}

function authorityPerformanceSelection(inputs) {
  const rows = inputs.catalog.performance.filter(({ pathId }) =>
    inputs.authority.pathIds.includes(pathId),
  );
  return {
    passIds: [
      ...new Set(rows.flatMap(({ passIds }) => passIds)),
    ].sort(compare),
    pathIds: rows.map(({ pathId }) => pathId).sort(compare),
    testNames: rows.map(({ testName }) => testName).sort(compare),
  };
}

function performanceComparison(inputs, selection) {
  const previous = inputs.previousPerformance;
  if (
    previous.kind === "none" ||
    previous.report.fixtureResolutionMode !== "strict-development" ||
    previous.report.sourceHash !== inputs.comparisonInventory.sourceHash ||
    !isDeepStrictEqual(
      previous.report.performancePathIds,
      selection.pathIds,
    ) ||
    !isDeepStrictEqual(
      previous.report.performancePassIds,
      selection.passIds,
    ) ||
    !isDeepStrictEqual(
      previous.report.testNames,
      selection.testNames,
    )
  ) {
    return { kind: "none" };
  }
  return {
    comparisonHash: previous.comparisonHash,
    kind: "compatible-targeted-report",
    report: previous.report,
  };
}

function changedSteps(inputs) {
  const steps = [];
  const full =
    inputs.changeSet.dependencyChanged ||
    inputs.changeSet.platformChanged;
  const impact = inputs.changeSet.impact;
  if (full) {
    return fixedSteps(inputs, inputs.changeSet.dependencyChanged);
  }
  if (inputs.changeSet.docsChanged) steps.push({ kind: "docs" });
  if (inputs.changeSet.frameworkChanged || impact) {
    steps.push({ kind: "code-health" });
  }
  if (impact?.productTestFiles.length) {
    steps.push({
      files: impact.productTestFiles,
      kind: "product-tests",
    });
  }
  if (impact?.buildRequired) {
    steps.push({ kind: "build" });
  }
  if (impact?.browserTestNames.length) {
    steps.push({
      kind: "browser-functional",
      testNames: impact.browserTestNames,
    });
  }
  return steps;
}

export function constructToolcraftDeliveryPlan(inputs) {
  const initial = inputs.comparisonInventory === null;
  const basis = initial
    ? { kind: "initial" }
    : {
        changedFiles: getToolcraftChangedVerificationFiles(
          inputs.comparisonInventory.entries,
          inputs.currentInventory.entries,
        ),
        comparisonFunctionalProofModelHash:
          createToolcraftFunctionalProofModelHash(
            inputs.previousFunctionalProofModel,
          ),
        comparisonInventory: inputs.comparisonInventory,
        kind: "changed",
      };
  const steps = initial ? fixedSteps(inputs, false) : changedSteps(inputs);
  const common = {
    basis,
    functionalProofModelHash: createToolcraftFunctionalProofModelHash(
      inputs.currentFunctionalProofModel,
    ),
    manifestHash: inputs.integrity.manifestHash,
    sourceHash: inputs.currentInventory.sourceHash,
  };
  if (inputs.authority === null) {
    return {
      ...common,
      kind: "functional",
      lifecycle: createToolcraftDeliveryPlanLifecycle({
        kind: "functional",
        previous: inputs.previousLifecycle,
      }),
      steps,
    };
  }
  const selectedPerformance = authorityPerformanceSelection(inputs);
  steps.push(performanceStep(selectedPerformance));
  const comparison = performanceComparison(inputs, selectedPerformance);
  return {
    ...common,
    kind: "performance-iteration",
    lifecycle: createToolcraftDeliveryPlanLifecycle({
      kind: "performance-iteration",
      performanceComparison: comparison,
      previous: inputs.previousLifecycle,
      requestAuthorityHash: inputs.authority.hash,
    }),
    performanceComparison: comparison,
    requestAuthorityHash: inputs.authority.hash,
    steps,
  };
}
