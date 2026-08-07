import { evaluateToolcraftIntegrity } from "./check-toolcraft-integrity.mjs";
import { commitToolcraftDeliveryCheckpoint } from "./toolcraft-checkpoint-transaction.mjs";
import { readToolcraftDeliveryAnchor } from "./toolcraft-delivery-anchor.mjs";
import { executeToolcraftDeliveryPlan } from "./toolcraft-delivery-executor.mjs";
import {
  collectToolcraftDeliveryFunctionalContext,
} from "./toolcraft-delivery-functional-context.mjs";
import {
  createToolcraftFunctionalProofModelHash,
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
  getToolcraftPreviousPerformanceError,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import { createToolcraftDeliveryPlan } from "./toolcraft-delivery-plan.mjs";
import { createToolcraftDeliveryReceipt } from "./toolcraft-delivery-receipt.mjs";
import {
  formatToolcraftPerformanceEscalationRecommendation,
  getToolcraftPerformanceEscalationRecommendation,
} from "./toolcraft-performance-escalation-policy.mjs";
import {
  readToolcraftPerformanceRequestAuthority,
} from "./toolcraft-performance-request-authority.mjs";
import {
  detectToolcraftPackageManager,
} from "./toolcraft-proof-process.mjs";
import {
  resolveToolcraftChangedVerificationImpact,
} from "./toolcraft-verification-impact.mjs";
import {
  collectToolcraftVerificationInputs,
  getToolcraftChangedVerificationFiles,
} from "./toolcraft-verification-inventory.mjs";

const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const dependencyPaths = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const platformConfigPattern =
  /(?:^|\/)(?:playwright|vite|vitest)\.config\.[cm]?[jt]s$/u;
const tsconfigPattern = /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/u;
const editablePlatformRootPaths = new Set([
  ".gitignore",
]);
const integrityManifestPath = "src/toolcraft/.toolcraft-manifest.json";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareCodeUnits);
}

function getAllProductTestFiles(inventory) {
  return inventory.entries
    .map(({ path: filePath }) => filePath)
    .filter(
      (filePath) =>
        filePath.startsWith("src/") &&
        !filePath.startsWith("src/toolcraft/") &&
        testFilePattern.test(filePath),
    )
    .sort(compareCodeUnits);
}

function isEditableDocumentation(filePath) {
  return (
    filePath === "docs/toolcraft/agent-worklog.md" ||
    (filePath.startsWith("docs/") &&
      !filePath.startsWith("docs/toolcraft/")) ||
    /(?:^|\/)(?:README|CHANGELOG)\.md$/iu.test(filePath)
  );
}

function isEditablePlatformConfig(filePath) {
  return editablePlatformRootPaths.has(filePath) ||
    platformConfigPattern.test(filePath) ||
    tsconfigPattern.test(filePath);
}

function hasSelectedProof(impact) {
  return [
    impact.acceptanceIds,
    impact.browserTestNames,
    impact.productTestFiles,
    impact.performanceCandidates.passIds,
    impact.performanceCandidates.pathIds,
    impact.performanceCandidates.testNames,
  ].some((values) => values.length > 0);
}

function assertCurrentPreviousPerformance(performance) {
  const error = getToolcraftPreviousPerformanceError(performance);
  if (error) throw new Error(error);
  return performance;
}

function classifyChangedFiles(changedFiles, frameworkOwnedPaths) {
  const frameworkOwnedPathSet = new Set(frameworkOwnedPaths);
  const dependency = [];
  const docs = [];
  const framework = [];
  const platform = [];
  const product = [];
  for (const filePath of changedFiles) {
    if (dependencyPaths.has(filePath)) {
      dependency.push(filePath);
    } else if (isEditableDocumentation(filePath)) {
      docs.push(filePath);
    } else if (
      isEditablePlatformConfig(filePath) ||
      (
        filePath.startsWith("src/toolcraft/") &&
        filePath !== integrityManifestPath
      )
    ) {
      platform.push(filePath);
    } else if (
      filePath === integrityManifestPath ||
      frameworkOwnedPathSet.has(filePath)
    ) {
      framework.push(filePath);
    } else if (filePath.startsWith("scripts/")) {
      platform.push(filePath);
    } else {
      product.push(filePath);
    }
  }
  return { dependency, docs, framework, platform, product };
}

export async function loadToolcraftDeliveryPlanningInputs({
  currentInventory,
  functionalContext,
  integrity,
  previous,
  projectDir,
}) {
  const previousPerformance = previous.missing
    ? Object.freeze({ kind: "none" })
    : assertCurrentPreviousPerformance(previous.anchor.performance);
  const {
    catalog,
    currentFunctionalProofModel,
    frameworkOwnedPaths,
    graph,
    inputRoles,
  } = functionalContext;
  const currentModelError = getToolcraftFunctionalProofModelError(
    currentFunctionalProofModel,
  );
  if (currentModelError) {
    throw new Error(
      `Current functional proof model is invalid: ${currentModelError}`,
    );
  }
  const common = {
    allProductTestFiles: getAllProductTestFiles(currentInventory),
    catalog,
    currentFunctionalProofModel,
    currentInventory,
    integrity,
    packageManager: detectToolcraftPackageManager(projectDir),
  };
  const authority =
    await readToolcraftPerformanceRequestAuthority(projectDir);
  if (previous.missing) {
    return Object.freeze({
      ...common,
      authority,
      changeSet: Object.freeze({
        dependencyChanged: false,
        docsChanged: false,
        frameworkChanged: false,
        impact: null,
        platformChanged: false,
        productInputsChanged: false,
      }),
      comparisonInventory: null,
      previousFunctionalProofModel: null,
      previousLifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
      previousPerformance,
    });
  }

  const previousFunctionalProofModel =
    previous.anchor.functionalProofModel;
  const previousModelError = getToolcraftFunctionalProofModelError(
    previousFunctionalProofModel,
  );
  if (previousModelError) {
    throw new Error(
      `Previous functional proof model is invalid: ${previousModelError}`,
    );
  }
  if (
    previous.anchor.functionalProofModelHash !==
    createToolcraftFunctionalProofModelHash(previousFunctionalProofModel)
  ) {
    throw new Error(
      "Previous functional proof model hash does not match its model.",
    );
  }
  const comparisonInventory = Object.freeze({
    entries: previous.anchor.files,
    sourceHash: previous.anchor.sourceHash,
  });
  const changedFiles = getToolcraftChangedVerificationFiles(
    comparisonInventory.entries,
    currentInventory.entries,
  );
  const classified = classifyChangedFiles(
    changedFiles,
    frameworkOwnedPaths,
  );
  let impact = null;
  if (classified.product.length > 0) {
    const resolved = resolveToolcraftChangedVerificationImpact({
      catalog,
      changedFiles: classified.product,
      currentModel: currentFunctionalProofModel,
      graph,
      previousModel: previousFunctionalProofModel,
      roles: inputRoles,
    });
    impact = hasSelectedProof(resolved) ? resolved : null;
  }
  return Object.freeze({
    ...common,
    authority,
    changeSet: Object.freeze({
      dependencyChanged: classified.dependency.length > 0,
      docsChanged: classified.docs.length > 0,
      frameworkChanged: classified.framework.length > 0,
      impact,
      platformChanged: classified.platform.length > 0,
      productInputsChanged: impact !== null,
    }),
    comparisonInventory,
    previousFunctionalProofModel,
    previousLifecycle: previous.anchor.lifecycle,
    previousPerformance,
  });
}

const defaultDeliveryDependencies = Object.freeze({
  collectInventory: collectToolcraftVerificationInputs,
  collectFunctionalContext: collectToolcraftDeliveryFunctionalContext,
  commit: async ({ receipt, result, projectDir }) =>
    commitToolcraftDeliveryCheckpoint({
      deliveryReceipt: receipt,
      finalInventory: result.finalInventory,
      planExecutionAuthority: result.planExecutionAuthority,
      projectDir,
    }),
  createPlan: createToolcraftDeliveryPlan,
  createReceipt: createToolcraftDeliveryReceipt,
  evaluateIntegrity: evaluateToolcraftIntegrity,
  executePlan: executeToolcraftDeliveryPlan,
  formatEscalationRecommendation:
    formatToolcraftPerformanceEscalationRecommendation,
  getEscalationRecommendation:
    getToolcraftPerformanceEscalationRecommendation,
  loadPlanningInputs: loadToolcraftDeliveryPlanningInputs,
  readDeliveryAnchor: readToolcraftDeliveryAnchor,
});

export async function executeToolcraftDeliveryLifecycleCore({
  dependencies,
  projectDir,
}) {
  const previous = await dependencies.readDeliveryAnchor(projectDir);
  if (previous.error) throw new Error(previous.error);
  const currentInventory =
    await dependencies.collectInventory(projectDir);
  if (
    !previous.missing &&
    previous.anchor.sourceHash === currentInventory.sourceHash
  ) {
    console.log(
      "Toolcraft delivery inputs are unchanged; delivery remains current.",
    );
    return previous.receipt;
  }

  const integrity = await dependencies.evaluateIntegrity({
    inventory: currentInventory,
    platformOnly: true,
    rootDir: projectDir,
  });
  const functionalContext =
    await dependencies.collectFunctionalContext(projectDir);
  const planningInputs = await dependencies.loadPlanningInputs({
    currentInventory,
    functionalContext,
    integrity,
    previous,
    projectDir,
  });
  const plan = dependencies.createPlan(planningInputs);
  const result = await dependencies.executePlan({ plan, projectDir });
  const receipt = dependencies.createReceipt({
    functionalProofModel:
      functionalContext.currentFunctionalProofModel,
    plan,
    result,
  });
  await dependencies.commit({
    plan,
    projectDir,
    receipt,
    result,
  });
  if (plan.kind === "performance-iteration") {
    const recommendation = dependencies.getEscalationRecommendation({
      currentReceipt: receipt,
      previousAnchor: previous.anchor,
    });
    if (recommendation) {
      console.log(
        dependencies.formatEscalationRecommendation(recommendation),
      );
    }
  }
  return receipt;
}

export function executeToolcraftDeliveryLifecycle({ projectDir }) {
  return executeToolcraftDeliveryLifecycleCore({
    dependencies: defaultDeliveryDependencies,
    projectDir,
  });
}
