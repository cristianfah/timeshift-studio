import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";

// The engine is a product-owned WebGL2 renderer, so this app still owes the
// full render-plan contract: workload envelope dimensions for the two engine
// budget controls and the export resolutions, an executable pipeline
// registration, one scenario per canonical path, and its fixture adapters.
// See `docs/toolcraft/agent-worklog.md` (Iteration 4) for the open decision:
// the pipeline contract forbids high-frequency interactions from invalidating
// pixel-transform passes, which is exactly what per-frame video playback does.
export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    rendererStrategy: "none",
    scenarios: [],
    usesCustomRenderer: false,
    workloadEnvelope: { dimensions: [] },
  });
