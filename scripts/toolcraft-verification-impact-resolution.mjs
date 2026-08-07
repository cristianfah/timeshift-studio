import path from "node:path";

import {
  diffToolcraftFunctionalProofModels,
} from "./toolcraft-functional-proof-model.mjs";
import {
  serializeToolcraftCanonicalJson,
} from "./toolcraft-functional-proof-primitives.mjs";
import {
  getToolcraftAffectedTestFiles,
} from "./toolcraft-local-dependency-graph.mjs";
import {
  validateToolcraftDeliveryCatalog,
} from "./playwright-test-title-selection.mjs";
import {
  selectToolcraftCurrentBrowserImpact,
} from "./toolcraft-browser-impact-selection.mjs";
const performanceSpecPath = "e2e/app-performance.spec.ts";
const testFilePattern = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const testSupportPattern =
  /(?:^|\/)(?:test-evidence|test-support)(?:\/|$)|(?:^|\/)[^/]*(?:fixtures|test-utils)\.[cm]?[jt]sx?$/u;

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const uniqueSorted = (values) =>
  [...new Set(values)].sort(compareCodeUnits);
const toRepoTestFile = (file) =>
  file.startsWith("e2e/") ? file : `e2e/${file}`;

function normalizeChangedPath(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Changed verification input "${value}" is not a canonical relative path.`,
    );
  }
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized !== path.posix.normalize(normalized)
  ) {
    throw new Error(
      `Changed verification input "${value}" is not a canonical relative path.`,
    );
  }
  return normalized;
}

function createPerformanceCandidates(rows) {
  return Object.freeze({
    passIds: Object.freeze(
      uniqueSorted(rows.flatMap(({ passIds }) => passIds)),
    ),
    pathIds: Object.freeze(
      uniqueSorted(rows.map(({ pathId }) => pathId)),
    ),
    testNames: Object.freeze(
      uniqueSorted(rows.map(({ testName }) => testName)),
    ),
  });
}

function createResolvedImpact({
  acceptanceIds,
  buildRequired,
  catalog,
  performanceRows,
  productTestFiles,
}) {
  const currentAcceptanceIds = new Set(
    catalog.acceptance.map(({ acceptanceId }) => acceptanceId),
  );
  const selectedIds = uniqueSorted(
    acceptanceIds.filter((acceptanceId) =>
      currentAcceptanceIds.has(acceptanceId),
    ),
  );
  const selectedIdSet = new Set(selectedIds);
  return Object.freeze({
    acceptanceIds: Object.freeze(selectedIds),
    browserTestNames: Object.freeze(
      uniqueSorted(
        catalog.acceptance
          .filter(({ acceptanceId }) => selectedIdSet.has(acceptanceId))
          .map(({ testName }) => testName),
      ),
    ),
    buildRequired: buildRequired || selectedIds.length > 0,
    performanceCandidates: createPerformanceCandidates(performanceRows),
    productTestFiles: Object.freeze(uniqueSorted(productTestFiles)),
  });
}

function createProofIndex(model) {
  return Object.freeze({
    acceptanceFiles: new Set(
      model.acceptance.map(({ file }) => toRepoTestFile(file)),
    ),
    ownersByPath: new Map(
      model.owners.map((owner) => [owner.path, owner]),
    ),
  });
}

function addOwnerAcceptance(owner, acceptanceIds) {
  owner?.acceptanceIds.forEach((id) => acceptanceIds.add(id));
}

function addPerformancePasses(owner, passIds) {
  if (owner?.kind !== "performance") return;
  owner.passIds.forEach((id) => passIds.add(id));
}

function assertCurrentCatalogMatchesModel(catalog, currentModel) {
  const validation = validateToolcraftDeliveryCatalog(catalog);
  if (validation.errors.length > 0) {
    throw new Error(
      `Invalid current delivery catalog: ${validation.errors.join("\n")}`,
    );
  }
  if (
    serializeToolcraftCanonicalJson(validation.catalog.acceptance) !==
    serializeToolcraftCanonicalJson(currentModel.acceptance)
  ) {
    throw new Error(
      "Current catalog acceptance does not match the current functional proof model.",
    );
  }
  return validation.catalog;
}

function createTestClassifier({ catalog, graph, roles }) {
  const entriesByPath = new Map(
    graph.entries.map((entry) => [entry.repoPath, entry]),
  );
  const currentBrowserFiles = new Set(
    catalog.acceptance.map(({ file }) => toRepoTestFile(file)),
  );
  return Object.freeze({
    isBrowserTest(repoPath) {
      const entry = entriesByPath.get(repoPath);
      return (
        entry?.role === "test" &&
        repoPath.startsWith("e2e/") &&
        testFilePattern.test(repoPath)
      );
    },
    isCurrentBrowserFile(repoPath) {
      return currentBrowserFiles.has(repoPath);
    },
    isPerformanceSpec(repoPath) {
      return repoPath === performanceSpecPath;
    },
    isTestSupport(repoPath) {
      const entry = entriesByPath.get(repoPath);
      return (
        entry?.role === "test-support" ||
        (
          roles.roleByPath[repoPath] === "product-test" &&
          entry?.role !== "test"
        ) ||
        (
          !entry &&
          (
            testSupportPattern.test(repoPath) ||
            (repoPath.startsWith("e2e/") && !testFilePattern.test(repoPath))
          )
        )
      );
    },
    isVitestTest(repoPath) {
      const entry = entriesByPath.get(repoPath);
      return (
        entry?.role === "test" &&
        repoPath.startsWith("src/") &&
        !repoPath.startsWith("src/toolcraft/") &&
        testFilePattern.test(repoPath)
      );
    },
  });
}

function throwUnrecognized(repoPath) {
  throw new Error(
    `Unrecognized changed verification input "${repoPath}" cannot select protected proof.`,
  );
}

export function resolveToolcraftChangedVerificationImpact({
  catalog,
  changedFiles,
  currentModel,
  graph,
  previousModel,
  roles,
}) {
  const changed = uniqueSorted(changedFiles.map(normalizeChangedPath));
  const semanticDelta = diffToolcraftFunctionalProofModels({
    current: currentModel,
    previous: previousModel,
  });
  const currentCatalog = assertCurrentCatalogMatchesModel(
    catalog,
    currentModel,
  );
  const current = createProofIndex(currentModel);
  const previous = createProofIndex(previousModel);
  const classifier = createTestClassifier({
    catalog: currentCatalog,
    graph,
    roles,
  });
  const acceptanceIds = new Set(semanticDelta.acceptanceIds);
  const semanticAcceptanceIds = new Set(semanticDelta.acceptanceIds);
  const performancePassIds = new Set();
  const browserDomains = new Set();
  let buildRequired = false;
  let allPerformanceCandidates = false;

  for (const ownerPath of semanticDelta.changedOwnerPaths) {
    addPerformancePasses(
      current.ownersByPath.get(ownerPath),
      performancePassIds,
    );
  }

  for (const changedPath of changed) {
    const role = roles.roleByPath[changedPath];
    const currentOwner = current.ownersByPath.get(changedPath);
    const previousOwner = previous.ownersByPath.get(changedPath);
    const directRuntime =
      role === "runtime-production" || role === "product-resource";
    if (directRuntime) {
      if (!currentOwner) {
        throw new Error(
          `Changed runtime or resource "${changedPath}" has no current verification impact owner.`,
        );
      }
      addOwnerAcceptance(previousOwner, acceptanceIds);
      addOwnerAcceptance(currentOwner, acceptanceIds);
      addPerformancePasses(currentOwner, performancePassIds);
      buildRequired = true;
      continue;
    }
    if (previousOwner) {
      addOwnerAcceptance(previousOwner, acceptanceIds);
      addOwnerAcceptance(currentOwner, acceptanceIds);
      addPerformancePasses(currentOwner, performancePassIds);
      buildRequired = true;
      continue;
    }
    if (role === "proof-model") continue;

    const affectedTests =
      getToolcraftAffectedTestFiles(graph, [changedPath]);
    if (classifier.isTestSupport(changedPath)) {
      const executable = affectedTests.filter(
        (repoPath) =>
          classifier.isVitestTest(repoPath) ||
          classifier.isBrowserTest(repoPath),
      );
      if (executable.length === 0) {
        throw new Error(
          `Changed test support "${changedPath}" reaches no executable Vitest or Playwright importer.`,
        );
      }
      const impact = selectToolcraftCurrentBrowserImpact({
        files: executable,
        model: currentModel,
        semanticAcceptanceIds,
      });
      impact.acceptanceIds.forEach((id) => acceptanceIds.add(id));
      impact.domainIds.forEach((id) => browserDomains.add(id));
      if (executable.some(classifier.isPerformanceSpec)) {
        allPerformanceCandidates = true;
      }
      continue;
    }
    if (classifier.isPerformanceSpec(changedPath)) {
      allPerformanceCandidates = true;
      continue;
    }
    if (classifier.isCurrentBrowserFile(changedPath)) {
      const impact = selectToolcraftCurrentBrowserImpact({
        files: [changedPath],
        model: currentModel,
        semanticAcceptanceIds,
      });
      impact.acceptanceIds.forEach((id) => acceptanceIds.add(id));
      impact.domainIds.forEach((id) => browserDomains.add(id));
      continue;
    }
    if (previous.acceptanceFiles.has(changedPath)) {
      for (const row of previousModel.acceptance) {
        if (toRepoTestFile(row.file) === changedPath) {
          browserDomains.add(row.domainId);
        }
      }
      continue;
    }
    if (
      classifier.isVitestTest(changedPath) ||
      classifier.isBrowserTest(changedPath)
    ) {
      if (classifier.isBrowserTest(changedPath)) {
        throwUnrecognized(changedPath);
      }
      continue;
    }
    if (changedPath !== "docs/toolcraft/agent-worklog.md") {
      throwUnrecognized(changedPath);
    }
  }

  for (const row of currentModel.acceptance) {
    if (browserDomains.has(row.domainId)) {
      acceptanceIds.add(row.acceptanceId);
    }
  }
  const hasSemanticProofDelta =
    semanticDelta.acceptanceIds.length > 0 ||
    semanticDelta.changedOwnerPaths.length > 0;
  const affectedTestSeeds = hasSemanticProofDelta
    ? changed.filter(
        (repoPath) =>
          !roles.semanticProofRootPaths.includes(repoPath),
      )
    : changed;
  const affectedTests =
    getToolcraftAffectedTestFiles(graph, affectedTestSeeds);
  const productTestFiles = affectedTests.filter(classifier.isVitestTest);
  const performanceRows = allPerformanceCandidates
    ? currentCatalog.performance
    : currentCatalog.performance.filter(({ passIds }) =>
        passIds.some((passId) => performancePassIds.has(passId)),
      );
  return createResolvedImpact({
    acceptanceIds: [...acceptanceIds],
    buildRequired,
    catalog: currentCatalog,
    performanceRows,
    productTestFiles,
  });
}
