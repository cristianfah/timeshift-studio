import { describe, expect, it } from "vitest";

import { getToolcraftViewInteractionErrors } from "./acceptance/view-interaction";
import type {
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
  ToolcraftViewInteractionIntent,
} from "./acceptance/types";
import {
  defineContractSchemaFixture,
  validateContractAcceptance,
  validateContractAcceptanceDiagnostics,
} from "./app-acceptance.contract-fixtures";

const defaultPose = {
  position: [0, 0, 5],
  up: [0, 1, 0],
} as const;

const noAnimation: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
};

const timelineAnimation: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence: "The requested camera path completes one seamless cycle in six seconds.",
      seconds: 6,
      source: "user-request",
    },
    mode: "timeline-playback",
  },
  mode: "new-toolcraft-app",
};

function createProductReadiness(
  viewInteraction: ToolcraftViewInteractionIntent,
): ToolcraftProductReadiness {
  return {
    exportIntent: {
      image: { mode: "toolcraft-default" },
      video: { mode: "not-requested" },
    },
    interactionOwnership: [],
    mode: "product",
    productName: "Spatial fixture",
    productSummary: "A fixture used to validate spatial view ownership.",
    requestedBehavior: "Render and interact with the configured product output.",
    viewInteraction,
  };
}

function createSchema({
  orientationTargets = [],
  timeline = false,
}: {
  orientationTargets?: readonly string[];
  timeline?: boolean;
} = {}) {
  return defineContractSchemaFixture({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              material: {
                defaultValue: 0.5,
                label: "Metalness",
                max: 1,
                min: 0,
                target: "model.metalness",
                type: "slider",
              },
              ...Object.fromEntries(
                orientationTargets.map((target, index) => [
                  `orientation${index + 1}`,
                  {
                    defaultValue: defaultPose,
                    keyframeable: false,
                    label: false,
                    target,
                    type: "orientationGizmo" as const,
                    ...(orientationTargets.length > 1
                      ? {
                          visibleWhen: {
                            equals: `model-${index + 1}`,
                            target: "model.active",
                          },
                        }
                      : {}),
                  },
                ]),
              ),
            },
            title: "Model",
          },
        ],
        title: "Controls",
      },
      ...(timeline
        ? {
            timeline: {
              defaultDurationSeconds: 6,
              enabled: true,
              mode: "playback" as const,
            },
          }
        : {}),
    },
  });
}

describe("Toolcraft spatial view interaction intent", () => {
  it("rejects stale product readiness that omits the typed intent", () => {
    const productReadiness = {
      exportIntent: {
        image: { mode: "toolcraft-default" },
        video: { mode: "not-requested" },
      },
      mode: "product",
      productName: "Legacy fixture",
      productSummary: "An old product declaration.",
      requestedBehavior: "Render output.",
    } as unknown as ToolcraftProductReadiness;

    expect(
      getToolcraftViewInteractionErrors({
        productReadiness,
        schema: createSchema(),
        transferMode: noAnimation,
      }),
    ).toEqual([
      expect.stringContaining("must declare viewInteraction before controls or renderer code"),
    ]);
  });

  it("rejects an orbit scene that silently omits the orientation gizmo", () => {
    const errors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "orbit",
        orientationTargets: ["view.orbit"],
      }),
      schema: createSchema(),
      transferMode: noAnimation,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'orbit target "view.orbit" requires a matching orientationGizmo',
        ),
      ]),
    );
  });

  it("accepts orbit intent only when declared targets match schema gizmos", () => {
    const validErrors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "orbit",
        orientationTargets: ["view.orbit"],
      }),
      schema: createSchema({ orientationTargets: ["view.orbit"] }),
      transferMode: noAnimation,
    });
    const mismatchedErrors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "orbit",
        orientationTargets: ["view.orbit", "view.orbit"],
      }),
      schema: createSchema({ orientationTargets: ["model.orbit"] }),
      transferMode: noAnimation,
    });

    expect(validErrors).toEqual([]);
    expect(mismatchedErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("orientationTargets must be unique"),
        expect.stringContaining(
          'orbit target "view.orbit" requires a matching orientationGizmo',
        ),
        expect.stringContaining(
          'orientationGizmo target "model.orbit" is missing from orbit orientationTargets',
        ),
      ]),
    );
  });

  it("rejects orientation gizmos for products classified as non-spatial", () => {
    const errors = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        mode: "non-spatial",
        reason: "The output is a two-dimensional image compositor.",
      }),
      schema: createSchema({ orientationTargets: ["view.orbit"] }),
      transferMode: noAnimation,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "non-spatial viewInteraction cannot declare orientationGizmo",
        ),
      ]),
    );
  });

  it("allows fixed framing only with explicit request or reference evidence", () => {
    const missingEvidence = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        evidence: " ",
        mode: "fixed-camera",
        source: "explicit-user-request",
      }),
      schema: createSchema(),
      transferMode: noAnimation,
    });
    const explicitEvidence = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness({
        evidence: "The user requested a locked isometric product view.",
        mode: "fixed-camera",
        source: "explicit-user-request",
      }),
      schema: createSchema(),
      transferMode: noAnimation,
    });

    expect(missingEvidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fixed-camera evidence must be non-empty"),
      ]),
    );
    expect(explicitEvidence).toEqual([]);
  });

  it("allows timeline-owned camera motion only with a real Toolcraft timeline intent", () => {
    const intent: ToolcraftViewInteractionIntent = {
      evidence: "The inspected reference animates one authored camera path.",
      mode: "timeline-camera",
      source: "inspected-reference",
    };
    const missingTimeline = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness(intent),
      schema: createSchema(),
      transferMode: noAnimation,
    });
    const validTimeline = getToolcraftViewInteractionErrors({
      productReadiness: createProductReadiness(intent),
      schema: createSchema({ timeline: true }),
      transferMode: timelineAnimation,
    });

    expect(missingTimeline).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "timeline-camera requires timeline-playback or timeline-keyframes animation intent",
        ),
        expect.stringContaining(
          "timeline-camera requires an enabled Toolcraft timeline",
        ),
      ]),
    );
    expect(validTimeline).toEqual([]);
  });

  it("registers orbit omission as a blocking renderer-view-interaction diagnostic", () => {
    const productReadiness = createProductReadiness({
      mode: "orbit",
      orientationTargets: ["view.orbit"],
    });
    const errors = validateContractAcceptance({ productReadiness });
    const diagnostics = validateContractAcceptanceDiagnostics({ productReadiness });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("requires a matching orientationGizmo"),
      ]),
    );
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "appProductReadiness.viewInteraction",
          ruleId: "renderer-view-interaction",
          severity: "error",
        }),
      ]),
    );
  });
});
