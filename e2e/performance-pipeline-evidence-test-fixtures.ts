import type { Page } from "@playwright/test";
import {
  defineToolcraft,
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  serializeToolcraftBrowserPerformanceEvidence,
  type ToolcraftPerformancePipelineEvidence,
  type ToolcraftPerformancePipelinePhase,
  type ToolcraftPerformancePipelineSnapshot,
} from "../src/app/test-evidence/browser-performance-contract";
import { evaluateToolcraftBrowserPerformanceEvidence } from "./browser-performance-report";

export const pipelineEvidenceSchema = defineToolcraft({
  canvas: { enabled: true, sizing: { mode: "editable-output" } },
  panels: {
    controls: {
      sections: [
        {
          controls: {
            strength: {
              defaultValue: 0.5,
              label: "Strength",
              max: 1,
              min: 0,
              performanceRole: "responsiveness",
              target: "effect.strength",
              type: "slider",
            },
            mode: {
              defaultValue: "soft",
              label: "Mode",
              options: [
                { label: "Soft", value: "soft" },
                { label: "Hard", value: "hard" },
              ],
              performanceRole: "responsiveness",
              target: "effect.mode",
              type: "segmented",
            },
          },
          title: "Effect",
        },
      ],
      title: "Controls",
    },
  },
});

type PipelinePasses = {
  composite: ToolcraftRendererPipelinePassContract<void>;
  decode: ToolcraftRendererPipelinePassContract<void>;
};

export const pipelineEvidenceRegistration =
  registerToolcraftRendererPipeline<PipelinePasses>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: ["composite"],
        mustNotInvalidate: ["decode"],
        targets: ["canvas.initial-render"],
      },
      {
        interaction: "animation-frame",
        invalidates: ["composite"],
        mustNotInvalidate: ["decode"],
        targets: ["runtime.animation-frame"],
      },
      {
        interaction: "control-drag",
        invalidates: ["composite"],
        mustNotInvalidate: ["decode"],
        targets: ["effect.strength"],
      },
      {
        interaction: "media-import",
        invalidates: ["decode"],
        mustNotInvalidate: ["composite"],
        targets: ["source.id"],
      },
      {
        interaction: "control-change",
        invalidates: ["decode"],
        mustNotInvalidate: ["composite"],
        targets: ["effect.mode"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: ["decode", "composite"],
        targets: ["canvas.viewport"],
      },
    ],
    passes: [
      {
        cacheKey: ["source.id"],
        cost: {
          dimensions: [],
          frequency: "once",
          relationship: "constant",
        },
        id: "decode",
        inputs: ["source.id"],
        invalidatedBy: ["source.id"],
        kind: "decode",
        lifecycle: { cache: "retained-resource", resourceScope: "source" },
        output: "source",
        quality: "full",
        runsOn: "worker",
      },
      {
        cost: {
          dimensions: [],
          frequency: "interaction",
          relationship: "constant",
        },
        id: "composite",
        inputs: ["decode", "effect.strength", "runtime.animation-frame"],
        invalidatedBy: ["effect.strength", "runtime.animation-frame"],
        kind: "composite",
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
    ],
    runtimeId: "pipeline-evidence-test-v1",
  });

export const pipelineEvidencePerformance = defineToolcraftPerformance({
  rendererPipeline: pipelineEvidenceRegistration,
  rendererStrategy: "webgl",
  scenarios: [],
  usesCustomRenderer: true,
  workloadEnvelope: { dimensions: [] },
});

const performancePaths = deriveToolcraftPerformancePaths(
  pipelineEvidenceSchema,
  pipelineEvidencePerformance,
);
export const activePipelinePath = performancePaths.find(
  (path) => path.interaction === "control-drag",
)!;
export const animationPipelinePath = performancePaths.find(
  (path) => path.interaction === "animation-frame",
)!;
export const initialPipelinePath = performancePaths.find(
  (path) => path.interaction === "initial-render",
)!;
export const cachedPipelinePath = performancePaths.find(
  (path) => path.interaction === "media-import",
)!;
export const stableCachedPipelinePath = performancePaths.find(
  (path) => path.interaction === "control-change",
)!;
export const unchangedPipelinePath = performancePaths.find(
  (path) => path.interaction === "viewport-zoom",
)!;

export const zeroPipelinePassCounters = () => ({
  activeResources: 0,
  cacheHits: 0,
  cacheMisses: 0,
  durationMax: 0,
  durationTotal: 0,
  executions: 0,
  resourceCreations: 0,
  resourceDisposals: 0,
  transfers: 0,
});

export function pipelineSnapshot(
  overrides: Partial<
    Record<
      "composite" | "decode",
      Partial<ReturnType<typeof zeroPipelinePassCounters>>
    >
  > = {},
): ToolcraftPerformancePipelineSnapshot {
  return {
    disposed: false,
    passes: (["decode", "composite"] as const).map((passId) => ({
      passId,
      ...zeroPipelinePassCounters(),
      ...overrides[passId],
    })),
    runtimeId: pipelineEvidenceRegistration.runtimeId,
  };
}

export function pipelineEvidence(
  phase: ToolcraftPerformancePipelinePhase,
  before = pipelineSnapshot(),
  after = pipelineSnapshot(),
  path = activePipelinePath,
): Omit<ToolcraftPerformancePipelineEvidence, "version"> {
  return {
    after,
    before,
    evidenceType: "performance-pipeline",
    pathId: path.id,
    phase,
    profile: path.profile,
  };
}

export function pipelineEvidenceAttachment(
  observation: Omit<ToolcraftPerformancePipelineEvidence, "version">,
) {
  return {
    body: serializeToolcraftBrowserPerformanceEvidence(observation),
    contentType: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  };
}

export function evaluatePipelineEvidence(
  attachments: ReturnType<typeof pipelineEvidenceAttachment>[],
  expectedPathIds: readonly string[] = [activePipelinePath.id],
) {
  return evaluateToolcraftBrowserPerformanceEvidence({
    attachments,
    expectedPathIds,
    performanceConfig: pipelineEvidencePerformance,
    schema: pipelineEvidenceSchema,
  });
}

export function noCacheActivitySnapshot(executions: number) {
  return pipelineSnapshot({
    composite: {
      cacheMisses: executions,
      durationMax: executions === 0 ? 0 : 1,
      durationTotal: executions,
      executions,
    },
  });
}

export function cachedActivitySnapshot({
  hits,
  misses,
}: {
  hits: number;
  misses: number;
}) {
  return pipelineSnapshot({
    decode: {
      cacheHits: hits,
      cacheMisses: misses,
      durationMax: misses === 0 ? 0 : 1,
      durationTotal: misses,
      executions: misses,
      resourceCreations: misses,
      resourceDisposals: Math.max(0, misses - 1),
      activeResources: misses === 0 ? 0 : 1,
    },
  });
}

export function activePipelineAttachments() {
  const snapshots = [0, 1, 2, 3].map(noCacheActivitySnapshot);
  return (["cold", "warm", "sustained"] as const).map((phase, index) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(phase, snapshots[index], snapshots[index + 1]),
    ),
  );
}

export function cachedPipelineAttachments() {
  const snapshots = [0, 1, 2, 3].map((misses) =>
    cachedActivitySnapshot({ hits: 0, misses }),
  );
  return (["cold", "warm", "sustained"] as const).map((phase, index) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        snapshots[index],
        snapshots[index + 1],
        cachedPipelinePath,
      ),
    ),
  );
}

export function stableCachedPipelineAttachments() {
  const coldBefore = cachedActivitySnapshot({ hits: 0, misses: 0 });
  const coldAfter = cachedActivitySnapshot({ hits: 0, misses: 1 });
  const warmAfter = cachedActivitySnapshot({ hits: 1, misses: 1 });
  const sustainedAfter = cachedActivitySnapshot({ hits: 2, misses: 1 });
  return [
    pipelineEvidenceAttachment(
      pipelineEvidence("cold", coldBefore, coldAfter, stableCachedPipelinePath),
    ),
    pipelineEvidenceAttachment(
      pipelineEvidence("warm", coldAfter, warmAfter, stableCachedPipelinePath),
    ),
    pipelineEvidenceAttachment(
      pipelineEvidence(
        "sustained",
        warmAfter,
        sustainedAfter,
        stableCachedPipelinePath,
      ),
    ),
  ];
}

export function unchangedPipelineAttachments() {
  return (["cold", "warm", "sustained"] as const).map((phase) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        pipelineSnapshot(),
        pipelineSnapshot(),
        unchangedPipelinePath,
      ),
    ),
  );
}

export function initialPipelineAttachments() {
  return (["cold", "warm", "sustained"] as const).map((phase) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        pipelineSnapshot(),
        noCacheActivitySnapshot(1),
        initialPipelinePath,
      ),
    ),
  );
}

export async function installPipelineEvidenceBridge(page: Page): Promise<void> {
  await page.setContent(
    `<output hidden data-toolcraft-pipeline-evidence="${pipelineEvidenceRegistration.runtimeId}"></output>`,
  );
  await page.evaluate((runtimeId) => {
    const counters = () => ({
      activeResources: 0,
      cacheHits: 0,
      cacheMisses: 0,
      durationMax: 0,
      durationTotal: 0,
      executions: 0,
      resourceCreations: 0,
      resourceDisposals: 0,
      transfers: 0,
    });
    const state = {
      actionCount: 0,
      snapshot: {
        disposed: false,
        passes: { composite: counters(), decode: counters() },
        runtimeId,
      },
    };
    Reflect.set(globalThis, "__toolcraftPipelineEvidenceTestState", state);
    const bridge = document.querySelector(
      "[data-toolcraft-pipeline-evidence]",
    );
    Object.defineProperty(
      bridge,
      Symbol.for("toolcraft.renderer-pipeline-evidence.snapshot"),
      { value: () => state.snapshot },
    );
  }, pipelineEvidenceRegistration.runtimeId);
}

export async function navigateToFreshInitialPipelineBridge(
  page: Page,
  sampleId: string,
): Promise<void> {
  const runtimeId = pipelineEvidenceRegistration.runtimeId;
  const html = `
    <output hidden data-sample-id=${JSON.stringify(sampleId)} data-toolcraft-pipeline-evidence="${runtimeId}"></output>
    <script>
      const counters = () => ({
        activeResources: 0,
        cacheHits: 0,
        cacheMisses: 0,
        durationMax: 0,
        durationTotal: 0,
        executions: 0,
        resourceCreations: 0,
        resourceDisposals: 0,
        transfers: 0,
      });
      const state = {
        snapshot: {
          disposed: false,
          passes: { composite: counters(), decode: counters() },
          runtimeId: ${JSON.stringify(runtimeId)},
        },
      };
      state.snapshot.passes.composite.cacheMisses = 1;
      state.snapshot.passes.composite.durationMax = 1;
      state.snapshot.passes.composite.durationTotal = 1;
      state.snapshot.passes.composite.executions = 1;
      Object.defineProperty(
        document.querySelector("[data-toolcraft-pipeline-evidence]"),
        Symbol.for("toolcraft.renderer-pipeline-evidence.snapshot"),
        { value: () => state.snapshot },
      );
    </script>
  `;
  await page.goto(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}#${encodeURIComponent(sampleId)}`,
  );
}
