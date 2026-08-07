import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";

import {
  collectToolcraftPlaywrightTestTitles,
  createToolcraftDeliveryCatalog,
  getToolcraftPlaywrightExactGrepPattern,
  resolveToolcraftPlaywrightTestTitles,
  validateToolcraftDeliveryCatalog,
} from "./playwright-test-title-selection.mjs";
import {
  createToolcraftAcceptanceContractHash,
  deriveToolcraftAcceptanceDomainId,
} from "./toolcraft-functional-proof-model.mjs";
import {
  getToolcraftPlaywrightContainingFile,
} from "./playwright-containing-file.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightBin = path.join(
  projectDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);

function createRealPlaywrightFixture({ projectName } = {}) {
  const rootDir = mkdtempSync(path.join(tmpdir(), "toolcraft-playwright-titles-"));
  mkdirSync(path.join(rootDir, "node_modules"), { recursive: true });
  symlinkSync(
    path.join(projectDir, "node_modules", "@playwright"),
    path.join(rootDir, "node_modules", "@playwright"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(
    path.join(rootDir, "playwright.config.mjs"),
    projectName
      ? `export default { projects: [{ name: ${JSON.stringify(projectName)} }], testDir: "." };\n`
      : 'export default { testDir: "." };\n',
  );
  writeFileSync(
    path.join(rootDir, "titles.spec.mjs"),
    [
      'import { test } from "@playwright/test";',
      'test("browser: requested", () => {});',
      'test("prefix browser: requested", () => {});',
      'test.describe("suite one", () => test("shared leaf", () => {}));',
      'test.describe("suite two", () => test("shared leaf", () => {}));',
      'test.describe("suite one", () => test("unique suite leaf", () => {}));',
      "",
    ].join("\n"),
  );
  return rootDir;
}

function invokeRealPlaywright(rootDir, { grepPattern, list = false } = {}) {
  const args = ["test", "--reporter=json"];
  if (list) args.push("--list");
  if (grepPattern) args.push("--grep", grepPattern);
  const result = spawn.sync(playwrightBin, args, {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function listWithRealPlaywright(rootDir, grepPattern) {
  return invokeRealPlaywright(rootDir, { grepPattern, list: true });
}

test("unnamed Playwright project runs the exact selected leaf", (t) => {
  const rootDir = createRealPlaywrightFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));
  const selections = resolveToolcraftPlaywrightTestTitles(titles, ["browser: requested"]);

  assert.equal(selections.length, 1);
  assert.equal(selections[0].leafTitle, "browser: requested");
  assert.doesNotMatch(selections[0].fullTitle, /prefix browser: requested/u);
  const grepPattern = getToolcraftPlaywrightExactGrepPattern(selections);
  const selectedReport = invokeRealPlaywright(rootDir, { grepPattern });
  assert.deepEqual(
    collectToolcraftPlaywrightTestTitles(selectedReport).map(({ leafTitle }) => leafTitle),
    ["browser: requested"],
  );
});

test("named Playwright project runs the exact selected leaf", (t) => {
  const rootDir = createRealPlaywrightFixture({ projectName: "chromium" });
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));
  const selections = resolveToolcraftPlaywrightTestTitles(titles, ["browser: requested"]);

  const selectedReport = invokeRealPlaywright(rootDir, {
    grepPattern: getToolcraftPlaywrightExactGrepPattern(selections),
  });
  assert.deepEqual(
    collectToolcraftPlaywrightTestTitles(selectedReport).map(({ leafTitle }) => leafTitle),
    ["browser: requested"],
  );
});

test("full Playwright title runs one test inside a suite", (t) => {
  const rootDir = createRealPlaywrightFixture({ projectName: "chromium" });
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));
  const expected = titles.find(({ leafTitle }) => leafTitle === "unique suite leaf");
  assert.ok(expected);

  const selections = resolveToolcraftPlaywrightTestTitles(
    titles,
    [expected.fullTitle],
  );
  const selectedReport = invokeRealPlaywright(rootDir, {
    grepPattern: getToolcraftPlaywrightExactGrepPattern(selections),
  });
  assert.deepEqual(
    collectToolcraftPlaywrightTestTitles(selectedReport).map(({ fullTitle }) => fullTitle),
    [expected.fullTitle],
  );
});

test("leaf resolution rejects zero and multiple exact matches", (t) => {
  const rootDir = createRealPlaywrightFixture({ projectName: "chromium" });
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const titles = collectToolcraftPlaywrightTestTitles(listWithRealPlaywright(rootDir));

  assert.throws(
    () => resolveToolcraftPlaywrightTestTitles(titles, ["missing leaf"]),
    /did not match any Playwright test/u,
  );
  assert.throws(
    () => resolveToolcraftPlaywrightTestTitles(titles, ["shared leaf"]),
    /matched 2 Playwright tests/u,
  );
});

const pathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
const performanceTestName = `browser perf: toolcraft path ${pathId}`;
const acceptance = [
  {
    browser: true,
    browserTestName: "browser: background color changes preview and exported image",
    id: "appearance.background",
  },
];
const catalogAcceptanceRow = (entry, file) => ({
  acceptanceId: entry.id,
  contractHash: createToolcraftAcceptanceContractHash(entry),
  domainId: deriveToolcraftAcceptanceDomainId(entry.id),
  file,
  testName: entry.browserTestName,
});
const performancePaths = [
  {
    id: pathId,
    invalidates: ["preview-composite"],
  },
];
const catalogRoot = path.join(tmpdir(), "toolcraft-delivery-catalog-root", "e2e");
const availableTests = [
  {
    file: path.join(catalogRoot, "background-output.spec.ts"),
    testName: acceptance[0].browserTestName,
  },
  {
    file: path.join(catalogRoot, "performance", "renderer.spec.ts"),
    testName: performanceTestName,
  },
];
const availableMetadata = (...testNames) =>
  testNames.map((testName, index) => ({
    file: path.join(catalogRoot, `available-${index}.spec.ts`),
    testName,
  }));

test("catalog attributes helper-registered tests to their containing specs", () => {
  const rootSuite = { parent: undefined, type: "root" };
  const projectSuite = { parent: rootSuite, type: "project" };
  const fileSuite = (file) => ({
    location: { file: path.join(catalogRoot, file), line: 1, column: 1 },
    parent: projectSuite,
    type: "file",
  });
  const helperLocation = {
    file: path.join(catalogRoot, "toolcraft-product-test.ts"),
    line: 22,
    column: 1,
  };
  const persistenceFile = fileSuite("app-persistence.spec.ts");
  const nestedDescribe = {
    location: helperLocation,
    parent: persistenceFile,
    type: "describe",
  };
  const persistenceTest = {
    location: helperLocation,
    parent: nestedDescribe,
    title: "browser: persistence reload",
  };
  const backgroundTest = {
    location: path.join(catalogRoot, "app-controls.spec.ts"),
    parent: fileSuite("app-controls.spec.ts"),
    title: acceptance[0].browserTestName,
  };

  assert.equal(
    getToolcraftPlaywrightContainingFile(persistenceTest, catalogRoot),
    "app-persistence.spec.ts",
  );
  assert.equal(
    getToolcraftPlaywrightContainingFile(backgroundTest, catalogRoot),
    "app-controls.spec.ts",
  );
  assert.deepEqual(
    createToolcraftDeliveryCatalog({
      acceptance: [{
        browser: true,
        browserTestName: persistenceTest.title,
        id: "persistence.reload",
      }],
      availableTests: [{
        file: getToolcraftPlaywrightContainingFile(persistenceTest, catalogRoot),
        testName: persistenceTest.title,
      }],
      performancePaths: [],
      rootDir: catalogRoot,
    }).acceptance,
    [catalogAcceptanceRow({
      browser: true,
      browserTestName: persistenceTest.title,
      id: "persistence.reload",
    }, "app-persistence.spec.ts")],
  );
  assert.throws(
    () =>
      createToolcraftDeliveryCatalog({
        acceptance: [{
          browser: true,
          browserTestName: persistenceTest.title,
          id: "persistence.reload",
        }],
        availableTests: [
          persistenceTest,
          {
            ...persistenceTest,
            parent: fileSuite("duplicate-persistence.spec.ts"),
          },
        ].map((entry) => ({
          file: getToolcraftPlaywrightContainingFile(entry, catalogRoot),
          testName: entry.title,
        })),
        performancePaths: [],
        rootDir: catalogRoot,
      }),
    /ambiguous in the Playwright suite/iu,
  );
  assert.throws(
    () =>
      getToolcraftPlaywrightContainingFile(
        { location: helperLocation, parent: nestedDescribe.parent.parent },
        catalogRoot,
      ),
    /containing Playwright file suite/iu,
  );
  assert.throws(
    () =>
      getToolcraftPlaywrightContainingFile(
        {
          location: helperLocation,
          parent: {
            location: { file: path.join(catalogRoot, "second.spec.ts") },
            parent: persistenceFile,
            type: "file",
          },
        },
        catalogRoot,
      ),
    /ambiguous containing Playwright file suites/iu,
  );
});

test("catalog uses each matched Playwright test's actual canonical file", () => {
  const persistence = {
    browser: true,
    browserTestName: "browser: persistence reload",
    id: "persistence.reload",
  };
  const catalog = createToolcraftDeliveryCatalog({
    acceptance: [persistence, ...acceptance],
    availableTests: [
      ...availableTests,
      {
        file: path.join(catalogRoot, "persistence", "reload.spec.ts"),
        testName: persistence.browserTestName,
      },
    ],
    performancePaths,
    rootDir: catalogRoot,
  });

  assert.deepEqual(catalog.acceptance, [
    catalogAcceptanceRow(acceptance[0], "background-output.spec.ts"),
    catalogAcceptanceRow(persistence, "persistence/reload.spec.ts"),
  ]);
});

test("catalog rejects absent or ambiguous acceptance and performance locations", () => {
  assert.throws(
    () =>
      createToolcraftDeliveryCatalog({
        acceptance,
        availableTests: availableTests.filter(
          ({ testName }) => testName !== acceptance[0].browserTestName,
        ),
        performancePaths,
        rootDir: catalogRoot,
      }),
    /absent from the Playwright suite/iu,
  );
  for (const testName of [
    acceptance[0].browserTestName,
    performanceTestName,
  ]) {
    assert.throws(
      () =>
        createToolcraftDeliveryCatalog({
          acceptance,
          availableTests: [
            ...availableTests,
            {
              file: path.join(catalogRoot, "duplicate.spec.ts"),
              testName,
            },
          ],
          performancePaths,
          rootDir: catalogRoot,
        }),
      /ambiguous in the Playwright suite/iu,
    );
  }
});

test("creates a sorted immutable delivery catalog from protected inputs", () => {
  const catalog = createToolcraftDeliveryCatalog({
    acceptance,
    availableTests: availableMetadata(
      performanceTestName,
      acceptance[0].browserTestName,
    ),
    performancePaths,
    rootDir: catalogRoot,
  });

  assert.deepEqual(catalog, {
    acceptance: [
      catalogAcceptanceRow(acceptance[0], "available-1.spec.ts"),
    ],
    performance: [
      {
        passIds: ["preview-composite"],
        pathId,
        testName: performanceTestName,
      },
    ],
    version: 2,
  });
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.acceptance[0]), true);
  assert.equal(Object.isFrozen(catalog.performance[0].passIds), true);
});

test("catalog rejects duplicate ids, duplicate names, absent tests, and ambiguity", () => {
  assert.throws(
    () =>
      createToolcraftDeliveryCatalog({
        acceptance: [...acceptance, { ...acceptance[0] }],
        availableTests: availableMetadata(acceptance[0].browserTestName),
        performancePaths: [],
        rootDir: catalogRoot,
      }),
    /duplicate acceptance id/iu,
  );
  assert.throws(
    () =>
      createToolcraftDeliveryCatalog({
        acceptance: [
          ...acceptance,
          {
            ...acceptance[0],
            id: "other",
          },
        ],
        availableTests: availableMetadata(acceptance[0].browserTestName),
        performancePaths: [],
        rootDir: catalogRoot,
      }),
    /duplicate test name/iu,
  );
  assert.throws(
    () =>
      createToolcraftDeliveryCatalog({
        acceptance,
        availableTests: [],
        performancePaths,
        rootDir: catalogRoot,
      }),
    /absent from the Playwright suite/iu,
  );
  assert.throws(
    () =>
      createToolcraftDeliveryCatalog({
        acceptance,
        availableTests: availableMetadata(
          acceptance[0].browserTestName,
          acceptance[0].browserTestName,
        ),
        performancePaths: [],
        rootDir: catalogRoot,
      }),
    /ambiguous/iu,
  );
});

test("catalog accepts nested root-relative files and rejects every noncanonical file form", () => {
  const validCatalog = {
    acceptance: [
      catalogAcceptanceRow(acceptance[0], "nested/background.spec.ts"),
    ],
    performance: [],
    version: 2,
  };
  assert.deepEqual(validateToolcraftDeliveryCatalog(validCatalog).errors, []);

  for (const invalidFile of [
    "../outside.spec.ts",
    "e2e/../outside.spec.ts",
    "e2e//background.spec.ts",
    "./e2e/background.spec.ts",
    "e2e\\background.spec.ts",
    "/e2e/background.spec.ts",
  ]) {
    const invalidCatalog = structuredClone(validCatalog);
    invalidCatalog.acceptance[0].file = invalidFile;
    assert.match(
      validateToolcraftDeliveryCatalog(invalidCatalog).errors.join("\n"),
      /canonical.*Playwright root/iu,
      invalidFile,
    );
  }
});
