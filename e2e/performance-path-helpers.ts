import type { Page } from "@playwright/test";

import {
  TOOLCRAFT_CANVAS_RENDER_SCALE,
  compileToolcraftPerformanceFixturePlan,
  deriveToolcraftPerformancePaths,
  type ResolvedToolcraftAppSchema,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import {
  expectToolcraftCanvasBackingPixelsForRenderScale,
  expectToolcraftPerformanceRenderScaleBackingEvidence,
} from "./browser-render-scale-evidence";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import { expectToolcraftPerformanceBudget } from "./performance-budget-helpers";
import { applyToolcraftPerformancePathCompiledFixture } from "./performance-fixture-helpers";
import {
  readToolcraftPerformanceFixtureResolutionMode,
  readToolcraftPerformanceFixtureSelector,
  resolveToolcraftPerformanceFixtureSelector,
} from "./performance-fixture-selection";
import {
  measureToolcraftClipboardActionByLabel,
  measureToolcraftDownloadActionByLabel,
} from "./performance-output-action-helpers";
import {
  createToolcraftPerformanceCanvasQualityGuard,
} from "./performance-canvas-quality-guard";
import type {
  ToolcraftPerformanceCanvasBacking,
  ToolcraftPerformancePathAdapter,
} from "./performance-path-adapter-contract";
import { expectToolcraftPipelineInvariant } from "./performance-pipeline-evidence";
import { getToolcraftPerformancePathBudget } from "./performance-profile-helpers";
import {
  measureToolcraftAnimationFrames,
  measureToolcraftInteraction,
} from "./performance-probe-helpers";

export type ToolcraftCompiledPerformancePathAdapter = Readonly<{
  adapter: ToolcraftPerformancePathAdapter;
  canvasBacking: ToolcraftPerformanceCanvasBacking | undefined;
  path: ToolcraftPerformancePath;
  testName: string;
}>;

type ToolcraftPerformancePathAdapterMatrixInput = Readonly<{
  adapters: readonly ToolcraftPerformancePathAdapter[];
  canvasBacking: ToolcraftPerformanceCanvasBacking | undefined;
  paths: readonly ToolcraftPerformancePath[];
  schema: ResolvedToolcraftAppSchema;
}>;

function compileToolcraftPerformanceCanvasBackingConfig(
  canvasBacking: unknown,
): ToolcraftPerformanceCanvasBacking {
  if (
    typeof canvasBacking !== "object" ||
    canvasBacking === null ||
    Array.isArray(canvasBacking)
  ) {
    throw new Error(
      "Toolcraft performance canvas backing must be a non-null object.",
    );
  }
  const keys = Reflect.ownKeys(canvasBacking);
  if (keys.length !== 1 || keys[0] !== "canvasSelector") {
    throw new Error(
      'Toolcraft performance canvas backing must contain exactly one "canvasSelector" field.',
    );
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    canvasBacking,
    "canvasSelector",
  );
  if (!descriptor || !("value" in descriptor)) {
    throw new Error(
      "Toolcraft performance canvas backing canvasSelector must be a data property.",
    );
  }
  const canvasSelector = descriptor.value;
  if (
    typeof canvasSelector !== "string" ||
    canvasSelector.length === 0 ||
    canvasSelector.trim() !== canvasSelector
  ) {
    throw new Error(
      "Toolcraft performance canvas backing canvasSelector must be a non-empty trimmed string.",
    );
  }
  return Object.freeze({ canvasSelector });
}

function compilePerformanceCanvasBackingBoundary({
  canvasBacking,
  schema,
}: Pick<
  ToolcraftPerformancePathAdapterMatrixInput,
  "canvasBacking" | "schema"
>): ToolcraftPerformanceCanvasBacking | undefined {
  if (canvasBacking === undefined) {
    if (!schema.canvas.renderScale.enabled) {
      return undefined;
    }
    throw new Error(
      "Toolcraft render-scale-enabled performance catalogs require one product canvas selector for 2x backing proof.",
    );
  }
  if (!schema.canvas.renderScale.enabled) {
    throw new Error(
      "Toolcraft performance canvas backing proof must be omitted when canvas render scale is disabled.",
    );
  }
  return compileToolcraftPerformanceCanvasBackingConfig(canvasBacking);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function getToolcraftPerformancePathTestName(
  path: Pick<ToolcraftPerformancePath, "id">,
): string {
  return `browser perf: toolcraft path ${path.id}`;
}

export function getToolcraftPerformancePathSettleFrames(
  path: Pick<ToolcraftPerformancePath, "interaction">,
): number | undefined {
  // A p95 distribution needs at least 20 samples to remain distinct from max.
  return path.interaction === "animation-frame" ||
    path.interaction === "export"
    ? undefined
    : 20;
}

export function compileToolcraftPerformancePathAdapterMatrix(
  input: ToolcraftPerformancePathAdapterMatrixInput,
): readonly ToolcraftCompiledPerformancePathAdapter[] {
  const compiledCanvasBacking = compilePerformanceCanvasBackingBoundary(input);
  const { adapters, paths } = input;
  const canonicalPaths = [...paths].sort((left, right) =>
    compareCodeUnits(left.id, right.id),
  );
  const canonicalPathIds = new Set(canonicalPaths.map((path) => path.id));
  if (canonicalPathIds.size !== canonicalPaths.length) {
    throw new Error(
      "Toolcraft performance path matrix received duplicate canonical path ids.",
    );
  }
  const adaptersByPathId = new Map<string, ToolcraftPerformancePathAdapter>();

  for (const adapter of adapters) {
    if (adaptersByPathId.has(adapter.pathId)) {
      throw new Error(
        `Toolcraft performance path matrix has a duplicate adapter for "${adapter.pathId}".`,
      );
    }
    if (!canonicalPathIds.has(adapter.pathId)) {
      throw new Error(
        `Toolcraft performance path matrix has an orphan adapter for "${adapter.pathId}".`,
      );
    }
    adaptersByPathId.set(adapter.pathId, adapter);
  }

  const missingPathIds = canonicalPaths
    .map((path) => path.id)
    .filter((pathId) => !adaptersByPathId.has(pathId));
  if (missingPathIds.length > 0) {
    throw new Error(
      `Toolcraft performance path matrix is missing adapter${missingPathIds.length === 1 ? "" : "s"} for: ${missingPathIds.join(", ")}.`,
    );
  }

  for (const path of canonicalPaths) {
    const adapter = adaptersByPathId.get(path.id)!;
    if (path.interaction === "export" && !adapter.output) {
      throw new Error(
        `Toolcraft export performance path "${path.id}" requires a protected output completion adapter.`,
      );
    }
    if (path.interaction !== "export" && adapter.output) {
      throw new Error(
        `Toolcraft non-export performance path "${path.id}" must use an interaction action.`,
      );
    }
    if (
      pathProductOutcomeInteractions.has(path.interaction) &&
      !adapter.observeOutcome
    ) {
      throw new Error(
        `Toolcraft performance path "${path.id}" requires an observable product outcome.`,
      );
    }
  }

  return Object.freeze(
    canonicalPaths.map((path) =>
      Object.freeze({
        adapter: adaptersByPathId.get(path.id)!,
        canvasBacking: compiledCanvasBacking,
        path,
        testName: getToolcraftPerformancePathTestName(path),
      }),
    ),
  );
}

const pathProductOutcomeInteractions = new Set<
  ToolcraftPerformancePath["interaction"]
>([
  "control-change",
  "control-drag",
  "mask-drag",
  "media-import",
  "timeline-playback",
  "timeline-scrub",
]);

function getPathTarget(path: ToolcraftPerformancePath): string | undefined {
  return path.targets.length === 1 ? path.targets[0] : undefined;
}

async function attachPathEvidence(
  evidenceType:
    | "performance-budget"
    | "performance-control-drag"
    | "performance-viewport",
  path: ToolcraftPerformancePath,
): Promise<void> {
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType,
    requirementId: path.id,
    target: getPathTarget(path),
  });
}

export async function runToolcraftPerformancePath(
  page: Page,
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftEnvelopePerformanceConfig,
  entry: ToolcraftCompiledPerformancePathAdapter,
): Promise<void> {
  const fixtureResolutionMode =
    readToolcraftPerformanceFixtureResolutionMode();
  const { adapter, canvasBacking, path } = entry;
  const canonicalPath = deriveToolcraftPerformancePaths(schema, config).find(
    (candidate) => candidate.id === path.id,
  );
  if (!canonicalPath || JSON.stringify(canonicalPath) !== JSON.stringify(path)) {
    throw new Error(
      `Toolcraft performance path adapter "${adapter.pathId}" no longer matches the canonical derived path.`,
    );
  }

  await adapter.prepare(page);
  const fixturePlan = compileToolcraftPerformanceFixturePlan(config, path);
  if (fixturePlan.dimensionIds.length > 0) {
    if (!adapter.fixtureApplications) {
      throw new Error(
        `Toolcraft performance path adapter "${adapter.pathId}" must implement all compiled fixture dimensions: ${fixturePlan.dimensionIds.join(", ")}.`,
      );
    }
    const fixtureSelector = resolveToolcraftPerformanceFixtureSelector(
      fixturePlan,
      readToolcraftPerformanceFixtureSelector(),
      { mode: fixtureResolutionMode },
    );
    await applyToolcraftPerformancePathCompiledFixture(
      config,
      path.id,
      fixturePlan,
      fixtureSelector,
      adapter.fixtureApplications(page),
      getPathTarget(path),
    );
  } else if (adapter.fixtureApplications) {
    throw new Error(
      `Toolcraft performance path adapter "${adapter.pathId}" cannot declare fixture applications because the compiled path has no workload dimensions.`,
    );
  }

  const renderScaleEnabled = schema.canvas.renderScale.enabled;
  if (renderScaleEnabled !== (canvasBacking !== undefined)) {
    throw new Error(
      "Toolcraft performance canvas backing presence must match the resolved render-scale schema.",
    );
  }
  const baselineCssSize = renderScaleEnabled
    ? await expectToolcraftCanvasBackingPixelsForRenderScale(
        page,
        canvasBacking!.canvasSelector,
        TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue,
        { state: "performance-baseline" },
      )
    : undefined;
  const canvasQualityGuard = baselineCssSize
    ? await createToolcraftPerformanceCanvasQualityGuard(page, {
        baselineCssSize,
        canvasSelector: canvasBacking!.canvasSelector,
        cssSizePolicy:
          path.interaction === "viewport-zoom" ? "viewport-driven" : "fixed",
        pathId: path.id,
      })
    : undefined;

  const budget = getToolcraftPerformancePathBudget(path, config.scenarios);
  const target = getPathTarget(path);
  let hasPrimaryFailure = false;
  try {
    await expectToolcraftPipelineInvariant(
      page,
      config,
      path.id,
      async (phase) => {
        const context = Object.freeze({ page, path, phase });
        const measurePhase = async () => {
          if (adapter.output?.kind === "download") {
            const measured = await measureToolcraftDownloadActionByLabel(
              page,
              adapter.output.label,
              { pathId: path.id, phase, profile: path.profile, target },
            );
            await adapter.output.verify(measured.completion, page);
            return measured.result;
          }
          if (adapter.output?.kind === "clipboard") {
            const measured = await measureToolcraftClipboardActionByLabel(
              page,
              adapter.output.label,
              { pathId: path.id, phase, profile: path.profile, target },
            );
            await adapter.output.verify(measured.completion, page);
            return measured.result;
          }
          if (path.interaction === "animation-frame") {
            await adapter.action(context);
            const result = await measureToolcraftAnimationFrames(page, 120, {
              pathId: path.id,
              phase,
              profile: path.profile,
              target,
            });
            await adapter.verifyOutcome?.(context);
            return result;
          }
          const result = await measureToolcraftInteraction(
            page,
            () => adapter.action(context),
            {
              ...(adapter.observeOutcome
                ? { observeOutcome: () => adapter.observeOutcome!(context) }
                : {}),
              pathId: path.id,
              phase,
              profile: path.profile,
              settleFrames: getToolcraftPerformancePathSettleFrames(path),
              target,
            },
          );
          await adapter.verifyOutcome?.(context);
          return result;
        };
        const result = canvasQualityGuard
          ? await canvasQualityGuard.runPhase(phase, measurePhase)
          : await measurePhase();
        expectToolcraftPerformanceBudget(result, budget);
        await attachPathEvidence("performance-budget", path);

        if (
          path.interaction === "control-drag" ||
          path.interaction === "mask-drag"
        ) {
          await attachPathEvidence("performance-control-drag", path);
        }
        if (
          path.interaction === "viewport-drag" ||
          path.interaction === "viewport-zoom"
        ) {
          await attachPathEvidence("performance-viewport", path);
        }
        if (canvasBacking) {
          await expectToolcraftPerformanceRenderScaleBackingEvidence(page, {
            baselineCssSize: baselineCssSize!,
            canvasSelector: canvasBacking.canvasSelector,
            cssSizePolicy:
              path.interaction === "viewport-zoom"
                ? "viewport-driven"
                : "fixed",
            pathId: path.id,
            phase,
            target,
          });
        }
      },
    );
  } catch (error) {
    hasPrimaryFailure = true;
    throw error;
  } finally {
    try {
      await canvasQualityGuard?.dispose();
    } catch (error) {
      if (!hasPrimaryFailure) throw error;
    }
  }
}
