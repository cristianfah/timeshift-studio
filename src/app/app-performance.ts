import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";

import { appPerformanceScenarios } from "./timeshift/performance/scenarios";
import { timeshiftRendererPipeline } from "./timeshift/performance/pipeline";
import { timeshiftRendererTechnique } from "./timeshift/performance/technique";
import { timeshiftWorkloadEnvelope } from "./timeshift/performance/envelope";

export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    rendererPipeline: timeshiftRendererPipeline,
    rendererStrategy: "webgl",
    rendererTechnique: timeshiftRendererTechnique,
    scenarios: appPerformanceScenarios,
    usesCustomRenderer: true,
    workloadEnvelope: timeshiftWorkloadEnvelope,
  });
