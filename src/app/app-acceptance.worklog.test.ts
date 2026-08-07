import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  agentWorklogPath,
  createAgentWorklogFixture,
  getAgentWorklogValidationErrors,
  readToolcraftDoc,
} from "./app-acceptance.worklog-test-utils";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} from "../../scripts/toolcraft-performance-authority-policy.mjs";

function appendDecisionTrailIteration(
  worklog: string,
  trailFields: NonNullable<
    Parameters<typeof createAgentWorklogFixture>[0]
  >["trailFields"],
): string {
  const fixture = createAgentWorklogFixture({
    trailFields,
    trailHeading: "Delivery 2 - Later product edit",
  });
  const latestIteration = /## Decision Trail\n\n([\s\S]*?)\n\n## Evidence/u.exec(
    fixture,
  )?.[1];
  if (!latestIteration) throw new Error("Expected a rendered decision-trail iteration.");
  return worklog.replace("\n## Evidence", `\n${latestIteration}\n\n## Evidence`);
}

describe("starter acceptance worklog contract", () => {
  it("does not treat fenced Decision Trail headings as iterations", () => {
    const worklog = createAgentWorklogFixture().replace(
      "\n## Evidence",
      `
\`\`\`md
### Not a delivery iteration
- Request: Forged request.
\`\`\`

## Evidence`,
    );

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("rejects duplicate Decision Trail sections", () => {
    const worklog = `${createAgentWorklogFixture()}

## Decision Trail

### Delivery 2 - Duplicate section
- Request: Forged request.
`;

    expect(getAgentWorklogValidationErrors(worklog)).toContain(
      "agent-worklog.md must include exactly one Decision Trail section.",
    );
  });

  it("rejects unscoped content before the first Decision Trail iteration", () => {
    const worklog = createAgentWorklogFixture().replace(
      "## Decision Trail\n",
      "## Decision Trail\n\nUnscoped authority prose.\n",
    );

    expect(getAgentWorklogValidationErrors(worklog)).toContain(
      "agent-worklog.md Decision Trail cannot contain content before its first iteration heading.",
    );
  });

  it("keeps an implementation worklog available for generated app decisions", () => {
    expect(
      existsSync(agentWorklogPath),
      "Generated apps must include docs/toolcraft/agent-worklog.md so implementation decisions and evidence survive the chat context.",
    ).toBe(true);
  });

  it("documents control selection inventory and custom built-in fit checks", () => {
    const coreControlSelection = readToolcraftDoc("core/control-selection.md");
    const componentRules = readToolcraftDoc("component-rules.md");
    const acceptanceTesting = readToolcraftDoc("acceptance-testing.md");

    expect(coreControlSelection).toContain("Control Selection Inventory");
    expect(coreControlSelection).toContain("Product need:");
    expect(coreControlSelection).toContain("Candidate built-ins checked:");
    expect(coreControlSelection).toContain("Best built-in:");
    expect(coreControlSelection).toContain("Rejected alternatives:");
    expect(coreControlSelection).toContain("Target:");
    expect(coreControlSelection).toContain("Custom Control Gate");

    expect(componentRules).toContain("Control Decision Catalog");
    expect(componentRules).toContain("core/control-selection.md");

    expect(acceptanceTesting).toContain("wrong-substitution");
    expect(acceptanceTesting).toContain("built-in fit check");
    expect(acceptanceTesting).toContain("builtInFitCheck");
  });

  it("requires product worklogs to record storyboard evidence for video references", () => {
    const worklog = createAgentWorklogFixture({
      evidenceLines: [
        "- Source reviewed: user prompt, ref.mp4, src/app/product-renderer.tsx.",
        "- Contract applied: Toolcraft workflow.",
      ],
      trailFields: {
        "Reference inputs": "/fixtures/reference-motion/ref.mp4 video reference.",
        "Source/reference checked": "User prompt and /fixtures/reference-motion/ref.mp4 video.",
      },
    });

    expect(getAgentWorklogValidationErrors(worklog)).toContain(
      "agent-worklog.md cites a video reference, screen recording, GIF, extracted frames, or contact sheet; record a Video Reference Study with storyboard frames and frame-to-frame transition analysis.",
    );
  });

  it("accepts product worklogs that record video reference storyboard and transition evidence", () => {
    const worklog = createAgentWorklogFixture({
      evidenceLines: [
        "- Source reviewed: user prompt, ref.mp4, extracted frames, contact sheet, src/app/product-renderer.tsx.",
        "- Contract applied: Toolcraft workflow and video-reference-analysis.",
      ],
      extraDecisionSections: [
        [
          "### Video Reference Study",
          "- Decision: Implement from storyboard frames and frame-to-frame transition analysis.",
          "- Reason: The video reference defines behavior, not only a static visual state.",
          "- Evidence: extracted frames f000/f012/f024/f036 and transition analysis between adjacent frames.",
        ].join("\n"),
      ],
      trailFields: {
        "Alternatives rejected": "Single screenshot implementation because the video behavior changes frame to frame.",
        "Contract rules applied": "video-reference-analysis and acceptance-product-observable.",
        "Reference inputs": "/fixtures/reference-motion/ref.mp4 video reference, extracted frames, contact sheet.",
        "Source/reference checked": "User prompt, /fixtures/reference-motion/ref.mp4 video, extracted frames, and contact sheet.",
      },
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("does not treat ordinary video export worklog evidence as a video reference", () => {
    const worklog = createAgentWorklogFixture({
      decisions: {
        Export: {
          decision: "Expose Export PNG and Export Video.",
          evidence: "src/app/export.ts.",
          reason: "Animated products need still and video output.",
        },
        Renderer: {
          decision: "Use Canvas 2D.",
          evidence: "src/app/product-renderer.tsx.",
          reason: "Product output is simple animated geometry.",
        },
        Timeline: {
          decision: "Use playback.",
          evidence: "src/app/app-schema.ts.",
          reason: "Export Video requires runtime timeline time.",
        },
      },
      evidenceLines: [
        "- Source reviewed: user prompt, app schema, export handler, browser export behavior.",
        "- Contract applied: Toolcraft workflow.",
      ],
      trailFields: {
        Decision: "Use Toolcraft export helpers.",
        "Reference inputs": "None.",
        "Source/reference checked": "User prompt, app schema, export handler, and browser export behavior.",
        "State/output mapping": "Runtime timeline state drives preview and export frames.",
        "User-visible result": "The product renders and exports video.",
      },
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("rejects stale or incomplete product worklogs", () => {
    const errors = getAgentWorklogValidationErrors(
      createAgentWorklogFixture({ mode: "starter" }),
    );

    expect(errors).toContain(
      'agent-worklog.md Status must declare "Mode: product" before final delivery.',
    );
    expect(errors).toContain(
      'agent-worklog.md still declares "Mode: starter"; replace the starter template with product decisions.',
    );
  });

  it("accepts product worklogs with concrete decisions, evidence, verification, and risk state", () => {
    expect(getAgentWorklogValidationErrors(createAgentWorklogFixture())).toEqual([]);
  });

  it("keeps receipt-owned Run ledgers out of human-intent worklog fixtures", () => {
    expect(createAgentWorklogFixture()).not.toContain("- Run:");
  });

  it("ignores receipt-owned execution prose outside the Decision Trail", () => {
    const worklog = createAgentWorklogFixture({
      verificationLines: [
        "- Run: an obsolete command ledger entry.",
        "- Measurements: receipt-owned evidence.",
      ],
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("accepts a later functional delivery with human intent and bare verification", () => {
    const worklog = appendDecisionTrailIteration(
      createAgentWorklogFixture({
        decisions: {
          Performance: {
            decision: "Use targeted renderer verification without repeating the full suite.",
            evidence: "Prior delivery anchor plus the current protected delivery receipt.",
            reason: "The user did not request performance work.",
          },
        },
      }),
      {
        "Alternatives rejected":
          "Repeating unrelated product work in the same delivery.",
        Decision:
          "Refine the renderer behavior and let protected planning derive proof.",
        Request: "Refine one renderer behavior in an already delivered app.",
        Risks: "Renderer responsiveness is covered by its targeted scenario.",
        "State/output mapping": "The changed renderer path updates product output directly.",
        "Task type": "Renderer update after the first working version.",
        "User-visible result": "The renderer behavior is corrected.",
        Verification: TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
      },
    );

    expect(getAgentWorklogValidationErrors(worklog)).toEqual([]);
  });

  it("rejects product worklogs without an actionable decision trail", () => {
    const worklog = createAgentWorklogFixture({
      omitDecisionTrailFields: [
        "Alternatives rejected",
        "Contract rules applied",
        "Reference inputs",
        "Source/reference checked",
        "State/output mapping",
        "User-visible result",
      ],
    });

    expect(getAgentWorklogValidationErrors(worklog)).toEqual(
      expect.arrayContaining([
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "User-visible result:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Source/reference checked:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Reference inputs:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Contract rules applied:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "Alternatives rejected:".',
        'agent-worklog.md Decision Trail iteration "Delivery 1 - Product build" must include "State/output mapping:".',
      ]),
    );
  });
});
