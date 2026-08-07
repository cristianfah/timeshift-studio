import { expect, type Page } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertToolcraftBrowserActionForSession,
  getToolcraftBrowserActionTarget,
  getToolcraftBrowserProofPage,
  isToolcraftBrowserAction,
  isToolcraftBrowserProofSession,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import { expectToolcraftPersistentOutcomeAfterAction } from "./stable-outcome-helpers";

const defaultProductObservableSelector = [
  "[data-toolcraft-product-output]",
  "[data-toolcraft-product-text]",
  "[data-toolcraft-canvas-slot] canvas",
  "[data-toolcraft-canvas-slot] svg",
  "[data-toolcraft-canvas-world] canvas",
  "[data-toolcraft-canvas-world] svg",
].join(", ");
const maxProductObservableDimension = 4096;
const maxProductObservablePixelArea = 8_388_608;
const productObservableScreenshotOptions = Object.freeze({
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
  type: "png" as const,
});
const warmedProductObservableSelectors = new WeakMap<Page, Set<string>>();

export type ToolcraftProductObservableSnapshotOptions = {
  selector?: string;
  timeoutMs?: number;
};

export type ToolcraftProductObservableChangeOptions =
  ToolcraftProductObservableSnapshotOptions & {
    baselineStabilityIntervalMs?: number;
    baselineStabilitySamples?: number;
    message?: string;
    requirementId?: string;
    stabilityIntervalMs?: number;
    stabilitySamples?: number;
  };

export async function getToolcraftProductObservableSnapshot(
  page: Page,
  options: ToolcraftProductObservableSnapshotOptions = {},
): Promise<string> {
  const selector = options.selector ?? defaultProductObservableSelector;
  const observable = page.locator(selector).first();

  await expect(
    observable,
    `Product observable "${selector}" must exist and be visible.`,
  ).toBeVisible({
    timeout: options.timeoutMs ?? 5000,
  });

  const bounds = await observable.boundingBox();

  if (
    bounds === null ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new Error(
      `Product observable "${selector}" must have finite positive visible bounds.`,
    );
  }

  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  if (
    width > maxProductObservableDimension ||
    height > maxProductObservableDimension ||
    width * height > maxProductObservablePixelArea
  ) {
    throw new Error(
      `Product observable "${selector}" exceeds the bounded visual proof limit (${width}x${height}; maximum dimension ${maxProductObservableDimension}px and maximum area ${maxProductObservablePixelArea}px). Use a narrower product-observable selector or a fixed semantic proof recipe.`,
    );
  }

  const warmedSelectors =
    warmedProductObservableSelectors.get(page) ?? new Set<string>();
  if (!warmedSelectors.has(selector)) {
    await observable.screenshot(productObservableScreenshotOptions);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        }),
    );
    warmedSelectors.add(selector);
    warmedProductObservableSelectors.set(page, warmedSelectors);
  }

  const raster = await observable.screenshot(productObservableScreenshotOptions);
  const rasterSnapshot = await page.evaluate(async ({
    encoded,
    maxDimension,
    maxPixelArea,
    selector: rasterSelector,
  }) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );

    try {
      const rasterWidth = bitmap.width;
      const rasterHeight = bitmap.height;
      if (
        rasterWidth <= 0 ||
        rasterHeight <= 0 ||
        rasterWidth > maxDimension ||
        rasterHeight > maxDimension ||
        rasterWidth * rasterHeight > maxPixelArea
      ) {
        throw new Error(
          `Product observable "${rasterSelector}" decoded outside the bounded visual proof limit (${rasterWidth}x${rasterHeight}).`,
        );
      }

      const canvas = document.createElement("canvas");
      canvas.width = rasterWidth;
      canvas.height = rasterHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error(
          `Product observable "${rasterSelector}" could not decode its visual pixels.`,
        );
      }
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        rasterWidth,
        rasterHeight,
      ).data;
      let hash = 2166136261;
      for (const byte of pixels) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619);
      }

      return {
        height: rasterHeight,
        rasterHash: (hash >>> 0).toString(16),
        width: rasterWidth,
      };
    } finally {
      bitmap.close();
    }
  }, {
    encoded: raster.toString("base64"),
    maxDimension: maxProductObservableDimension,
    maxPixelArea: maxProductObservablePixelArea,
    selector,
  });

  return JSON.stringify(rasterSnapshot);
}

export async function expectToolcraftProductObservableToChange(
  pageOrSession: Page | ToolcraftBrowserProofSession,
  action: (() => Promise<void>) | ToolcraftBrowserAction,
  options: ToolcraftProductObservableChangeOptions = {},
): Promise<void> {
  if (options.requirementId !== undefined && !isToolcraftBrowserProofSession(pageOrSession)) {
    throw new Error(
      "Product-observable runtime evidence requires a verified Toolcraft browser proof session; a raw Page may be used only for non-evidence helper checks.",
    );
  }
  const page = isToolcraftBrowserProofSession(pageOrSession)
    ? await getToolcraftBrowserProofPage(pageOrSession)
    : pageOrSession;
  let target: string | undefined;
  let runAction: () => Promise<void>;

  if (isToolcraftBrowserAction(action)) {
    if (isToolcraftBrowserProofSession(pageOrSession)) {
      assertToolcraftBrowserActionForSession(pageOrSession, action);
    }
    target = getToolcraftBrowserActionTarget(action);
    runAction = () => runToolcraftBrowserAction(action);
  } else {
    runAction = action;
  }

  if (options.requirementId !== undefined && target === undefined) {
    throw new Error(
      "Product-observable runtime evidence requires a target-scoped proofSession.targetAction(semanticTarget, action) or proofSession.controlAction(schemaTarget, action).",
    );
  }

  await expectToolcraftPersistentOutcomeAfterAction(
    () => getToolcraftProductObservableSnapshot(page, options),
    runAction,
    {
      baselineStabilityIntervalMs: options.baselineStabilityIntervalMs,
      baselineStabilitySamples: options.baselineStabilitySamples,
      message:
        options.message ??
        "Product output should change after the visible user interaction.",
      stabilityIntervalMs: options.stabilityIntervalMs,
      stabilitySamples: options.stabilitySamples,
      timeoutMs: options.timeoutMs ?? 5000,
    },
  );

  if (options.requirementId !== undefined) {
    await getToolcraftBrowserProofPage(
      pageOrSession as ToolcraftBrowserProofSession,
    );
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "product-observable-change",
      requirementId: options.requirementId,
      target,
    });
  }
}
