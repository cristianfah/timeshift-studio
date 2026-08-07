import type { Page, TestInfo } from "@playwright/test";

import { parseToolcraftBrowserRuntimeEvidence } from "../src/app/test-evidence/browser-runtime-contract";

const rootSelector = '[data-slot="toolcraft-runtime-app"]';

export function attachedEvidenceTypes(
  testInfo: TestInfo,
  startIndex: number,
): Array<string | undefined> {
  return testInfo.attachments
    .slice(startIndex)
    .map(
      (attachment) =>
        parseToolcraftBrowserRuntimeEvidence(attachment)?.evidenceType,
    );
}

export async function setProofState(
  page: Page,
  key: string,
  value: unknown,
): Promise<void> {
  await page.locator(rootSelector).evaluate(
    (root, entry) => {
      root.setAttribute(`data-proof-${entry.key}`, JSON.stringify(entry.value));
    },
    { key, value },
  );
}

export async function setSyntheticControlOwner(
  page: Page,
  target: string,
  visible: boolean,
): Promise<void> {
  await page.locator(rootSelector).evaluate(
    (root, entry) => {
      const selector = `[data-synthetic-target="${CSS.escape(entry.target)}"]`;
      root.querySelector(selector)?.remove();
      if (!entry.visible) return;

      const owner = document.createElement("div");
      owner.dataset.syntheticTarget = entry.target;
      owner.dataset.toolcraftControlTarget = entry.target;
      const field = document.createElement("div");
      field.dataset.slot = "field";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.target;
      field.append(button);
      owner.append(field);
      root.append(owner);
    },
    { target, visible },
  );
}

export async function setSyntheticSwitchControlOwner(
  page: Page,
  target: string,
  checked: boolean,
): Promise<void> {
  await setSyntheticControlOwner(page, target, true);
  await page.locator("[data-synthetic-target]").evaluateAll(
    (owners, entry) => {
      const owner = owners.find(
        (candidate) =>
          candidate.getAttribute("data-synthetic-target") === entry.target,
      );
      const button = owner?.querySelector("button");

      if (!button) {
        throw new Error(`Missing synthetic switch owner ${entry.target}.`);
      }

      button.setAttribute("aria-checked", String(entry.checked));
      button.setAttribute("role", "switch");
    },
    { checked, target },
  );
}
