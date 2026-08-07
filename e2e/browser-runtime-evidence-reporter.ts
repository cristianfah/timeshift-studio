import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
} from "@playwright/test/reporter";
import {
  deriveToolcraftPerformancePaths,
  type ResolvedToolcraftAppSchema,
  type ToolcraftPerformanceConfig,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";
import {
  TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_FILE_NAME,
  TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME,
  evaluateToolcraftBrowserRuntimeEvidence,
  type ToolcraftBrowserRuntimeRequirement,
  type ToolcraftBrowserRuntimeTest,
} from "../src/app/test-evidence/browser-runtime-contract";
import {
  appAcceptance,
  appControlSectionInventory,
} from "../src/app/app-acceptance";
import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";
import {
  deriveToolcraftBrowserRuntimeRequirements,
  deriveToolcraftPerformancePathRuntimeRequirements,
} from "./browser-runtime-evidence-requirements";
import {
  createToolcraftBrowserExecutionLedger,
  createToolcraftBrowserExecutionLedgerTest,
  writeToolcraftBrowserExecutionLedgerSync,
  type ToolcraftBrowserExecutionLedgerTarget,
} from "./browser-execution-ledger";
import {
  type ToolcraftBrowserPerformanceReport,
} from "./browser-performance-report";
import {
  evaluateToolcraftBrowserPerformanceRun,
  type ToolcraftCheckpointReportTarget,
  type ToolcraftTargetedPerformanceReportTarget,
} from "./browser-performance-reporter-evaluation";
import {
  writeToolcraftPerformanceCheckpointReport,
  type ToolcraftPerformanceCheckpointReport,
} from "./performance-checkpoint-report";
import { getToolcraftPerformancePathTestName } from "./performance-path-helpers";
import { writeToolcraftTargetedPerformanceReportSync } from "../scripts/toolcraft-targeted-performance-report.mjs";

type ToolcraftBrowserRuntimeEvidenceReporterOptions = {
  acceptanceRequirements?: readonly ToolcraftBrowserRuntimeRequirement[];
  browserExecutionLedger?: ToolcraftBrowserExecutionLedgerTarget;
  checkpointReport?: ToolcraftCheckpointReportTarget;
  performanceConfig?: ToolcraftPerformanceConfig;
  performanceRequirements?: readonly ToolcraftBrowserRuntimeRequirement[];
  performanceSchema?: ResolvedToolcraftAppSchema;
  reportError?: (error: string) => void;
  reportPerformance?: (report: ToolcraftBrowserPerformanceReport) => void;
  reportCheckpoint?: (report: ToolcraftPerformanceCheckpointReport) => void;
  targetedPerformanceReport?: ToolcraftTargetedPerformanceReportTarget;
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function isProtectedAcceptanceMarker(test: TestCase): boolean {
  const normalizedFile = test.location.file.replaceAll("\\", "/");

  return (
    test.title === TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_TEST_NAME &&
    normalizedFile.endsWith(
      `/e2e/${TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_FILE_NAME}`,
    )
  );
}

function isProtectedPerformanceMarker(test: TestCase): boolean {
  const normalizedFile = test.location.file.replaceAll("\\", "/");
  return (
    test.title === TOOLCRAFT_BROWSER_PERFORMANCE_MARKER_TEST_NAME &&
    normalizedFile.endsWith(
      `/e2e/${TOOLCRAFT_BROWSER_ACCEPTANCE_MARKER_FILE_NAME}`,
    )
  );
}

function toRuntimeTest(test: TestCase): ToolcraftBrowserRuntimeTest {
  return {
    expectedStatus: test.expectedStatus,
    results: test.results.map((result) => ({
      attachments: result.attachments,
      retry: result.retry,
      status: result.status,
    })),
    title: test.title,
  };
}

export default class ToolcraftBrowserRuntimeEvidenceReporter implements Reporter {
  private readonly acceptanceRequirementsOverride:
    | readonly ToolcraftBrowserRuntimeRequirement[]
    | undefined;
  private readonly browserExecutionLedger:
    | ToolcraftBrowserExecutionLedgerTarget
    | undefined;
  private readonly checkpointReport:
    | ToolcraftBrowserRuntimeEvidenceReporterOptions["checkpointReport"]
    | undefined;
  private readonly reportError: (error: string) => void;
  private readonly reportPerformance:
    | ((report: ToolcraftBrowserPerformanceReport) => void)
    | undefined;
  private readonly reportCheckpoint:
    | ((report: ToolcraftPerformanceCheckpointReport) => void)
    | undefined;
  private readonly targetedPerformanceReport:
    | ToolcraftBrowserRuntimeEvidenceReporterOptions["targetedPerformanceReport"]
    | undefined;
  private readonly performanceConfigOverride: ToolcraftPerformanceConfig | undefined;
  private readonly performanceRequirementsOverride:
    | readonly ToolcraftBrowserRuntimeRequirement[]
    | undefined;
  private readonly performanceSchemaOverride: ResolvedToolcraftAppSchema | undefined;

  private acceptanceRequirements: readonly ToolcraftBrowserRuntimeRequirement[] = [];
  private canonicalPaths: readonly ToolcraftPerformancePath[] = [];

  private performanceConfig: ToolcraftPerformanceConfig = appPerformance;
  private selectedTests: TestCase[] = [];
  private performanceRequirements: readonly ToolcraftBrowserRuntimeRequirement[] = [];
  private performanceSchema: ResolvedToolcraftAppSchema = appSchema;

  private validateFullAcceptance = false;
  private validateFullPerformance = false;
  private rootDir = "";

  constructor(options: ToolcraftBrowserRuntimeEvidenceReporterOptions = {}) {
    this.acceptanceRequirementsOverride = options.acceptanceRequirements;
    this.browserExecutionLedger = options.browserExecutionLedger;
    this.checkpointReport = options.checkpointReport;
    this.performanceConfigOverride = options.performanceConfig;
    this.performanceRequirementsOverride = options.performanceRequirements;
    this.performanceSchemaOverride = options.performanceSchema;
    this.reportError =
      options.reportError ??
      ((error) => console.error(`[toolcraft browser evidence] ${error}`));
    this.reportPerformance = options.reportPerformance;
    this.reportCheckpoint = options.reportCheckpoint;
    this.targetedPerformanceReport = options.targetedPerformanceReport;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.rootDir = config.rootDir;
    this.selectedTests = suite.allTests();
    this.validateFullAcceptance = this.selectedTests.some(
      isProtectedAcceptanceMarker,
    );
    this.validateFullPerformance = this.selectedTests.some(
      isProtectedPerformanceMarker,
    );
    this.performanceConfig =
      this.performanceConfigOverride ?? appPerformance;
    this.performanceSchema = this.performanceSchemaOverride ?? appSchema;
    this.acceptanceRequirements =
      this.acceptanceRequirementsOverride ??
      deriveToolcraftBrowserRuntimeRequirements(
        appAcceptance,
        appSchema,
        appControlSectionInventory,
      );
    this.canonicalPaths = deriveToolcraftPerformancePaths(
      this.performanceSchema,
      this.performanceConfig,
    );
    this.performanceRequirements =
      this.performanceRequirementsOverride ??
      deriveToolcraftPerformancePathRuntimeRequirements(
        this.canonicalPaths,
        this.performanceSchema,
      );
  }

  onEnd(_result: FullResult): { status: "failed" } | undefined {
    const selectedTitles = new Set(this.selectedTests.map((test) => test.title));
    const acceptanceRequirements = this.validateFullAcceptance
      ? this.acceptanceRequirements
      : this.acceptanceRequirements.filter((requirement) =>
          selectedTitles.has(requirement.testName),
        );
    const performanceRequirements = this.validateFullPerformance
      ? this.performanceRequirements
      : this.performanceRequirements.filter((requirement) =>
          selectedTitles.has(requirement.testName),
        );
    const errors = evaluateToolcraftBrowserRuntimeEvidence({
      requirements: [...acceptanceRequirements, ...performanceRequirements],
      tests: this.selectedTests.map(toRuntimeTest),
    });
    const performanceEvaluation = evaluateToolcraftBrowserPerformanceRun({
      canonicalPaths: this.canonicalPaths,
      checkpointReport: this.checkpointReport,
      performanceConfig: this.performanceConfig,
      performanceRequirements,
      performanceSchema: this.performanceSchema,
      resultStatus: _result.status,
      selectedTests: this.selectedTests,
      targetedPerformanceReport: this.targetedPerformanceReport,
      validateFullPerformance: this.validateFullPerformance,
    });
    errors.push(...performanceEvaluation.errors);

    if (errors.length === 0) {
      if (performanceEvaluation.performance) {
        this.reportPerformance?.(performanceEvaluation.performance);
      }
      if (this.checkpointReport && performanceEvaluation.checkpoint) {
        writeToolcraftPerformanceCheckpointReport(
          this.checkpointReport.path,
          performanceEvaluation.checkpoint,
        );
        this.reportCheckpoint?.(performanceEvaluation.checkpoint);
      }
      if (
        this.targetedPerformanceReport &&
        performanceEvaluation.measurements &&
        performanceEvaluation.targetedPaths
      ) {
        writeToolcraftTargetedPerformanceReportSync(
          this.targetedPerformanceReport.path,
          {
            fixtureResolutionMode:
              this.targetedPerformanceReport.fixtureResolutionMode,
            fixtureSelector: this.targetedPerformanceReport.fixtureSelector,
            nonce: this.targetedPerformanceReport.nonce,
            measurements: performanceEvaluation.measurements.observations,
            performancePassIds: uniqueSorted(
              this.targetedPerformanceReport.passIds,
            ),
            performancePathIds: uniqueSorted(
              performanceEvaluation.targetedPaths.map((path) => path.id),
            ),
            requestAuthorityHash:
              this.targetedPerformanceReport.requestAuthorityHash,
            sourceHash: this.targetedPerformanceReport.sourceHash,
            testNames: uniqueSorted(
              performanceEvaluation.targetedPaths.map(
                getToolcraftPerformancePathTestName,
              ),
            ),
          },
        );
      }
      if (this.browserExecutionLedger) {
        const ledger = createToolcraftBrowserExecutionLedger({
          nonce: this.browserExecutionLedger.nonce,
          resultStatus: _result.status,
          tests: this.selectedTests.map((test) =>
            createToolcraftBrowserExecutionLedgerTest(
              test,
              this.rootDir,
            ),
          ),
        });
        writeToolcraftBrowserExecutionLedgerSync(
          this.browserExecutionLedger,
          ledger,
        );
      }
      return undefined;
    }

    for (const error of errors) {
      this.reportError(error);
    }

    return { status: "failed" };
  }

  printsToStdio(): boolean {
    return false;
  }
}
