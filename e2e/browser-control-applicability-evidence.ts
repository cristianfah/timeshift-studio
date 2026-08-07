import { expect, type Page } from "@playwright/test";

import {
  getToolcraftApplicabilityRequirementId,
  type ToolcraftControlApplicabilityCase,
} from "../src/app/app-acceptance";
import {
  countToolcraftControlOwnersByTarget,
  getToolcraftControlFieldByTarget,
} from "./browser-control-target-helpers";
import {
  assertToolcraftBrowserActionForSession,
  getToolcraftBrowserActionTarget,
  getToolcraftBrowserProofPage,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";

function requireSelectorOptionLabel(
  applicabilityCase: ToolcraftControlApplicabilityCase,
): string {
  if (!applicabilityCase.selectorOptionLabel) {
    throw new Error(
      `Applicability case for ${applicabilityCase.selectorTarget} requires a selector option label.`,
    );
  }

  return applicabilityCase.selectorOptionLabel;
}

async function expectToolcraftApplicabilitySelectorState(
  page: Page,
  applicabilityCase: ToolcraftControlApplicabilityCase,
): Promise<void> {
  const control = await getToolcraftControlFieldByTarget(
    page,
    applicabilityCase.selectorTarget,
  );

  switch (applicabilityCase.selectorControlType) {
    case "checkbox":
    case "switch":
      await expect(
        control.getByRole(applicabilityCase.selectorControlType),
      ).toHaveAttribute("aria-checked", String(applicabilityCase.selectorValue));
      return;
    case "imagePicker":
    case "segmented":
      await expect(
        control.getByRole("button", {
          name: requireSelectorOptionLabel(applicabilityCase),
        }),
      ).toHaveAttribute("aria-pressed", "true");
      return;
    case "select":
      await expect(control.getByRole("combobox")).toContainText(
        requireSelectorOptionLabel(applicabilityCase),
      );
      return;
    case "slider":
      await expect(control.getByRole("slider")).toHaveAttribute(
        "aria-valuenow",
        String(applicabilityCase.selectorValue),
      );
      return;
    case "tabs":
      await expect(
        control.getByRole("tab", {
          name: requireSelectorOptionLabel(applicabilityCase),
        }),
      ).toHaveAttribute("aria-selected", "true");
  }
}

export async function expectToolcraftControlApplicabilityState(
  session: ToolcraftBrowserProofSession,
  selectBranch: ToolcraftBrowserAction,
  applicabilityCase: ToolcraftControlApplicabilityCase,
  options: { baseRequirementId: string; timeoutMs?: number },
): Promise<void> {
  const selectorTarget = getToolcraftBrowserActionTarget(selectBranch)?.trim();
  expect(
    selectorTarget,
    "Control-applicability evidence requires a target-scoped selector action.",
  ).toBe(applicabilityCase.selectorTarget);
  assertToolcraftBrowserActionForSession(session, selectBranch);

  const page = await getToolcraftBrowserProofPage(session);
  await runToolcraftBrowserAction(selectBranch);
  await expectToolcraftApplicabilitySelectorState(page, applicabilityCase);
  await expect
    .poll(
      () => countToolcraftControlOwnersByTarget(page, applicabilityCase.target),
      {
        message: `Control "${applicabilityCase.target}" should be ${applicabilityCase.expectation} for ${applicabilityCase.selectorTarget}=${JSON.stringify(applicabilityCase.selectorValue)}.`,
        timeout: options.timeoutMs ?? 5_000,
      },
    )
    .toBe(applicabilityCase.expectation === "hidden" ? 0 : 1);

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType:
      applicabilityCase.expectation === "hidden"
        ? "control-applicability-hidden"
        : "control-applicability-visible",
    requirementId: getToolcraftApplicabilityRequirementId(
      options.baseRequirementId,
      applicabilityCase,
    ),
    target: applicabilityCase.target,
  });
}
