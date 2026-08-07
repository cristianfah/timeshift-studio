import { expect, test } from "@playwright/test";

import {
  expectInfiniteCanvasObservation,
  expectToolcraftInfinityCanvasBackgroundEvidence,
  expectToolcraftInfinityCanvasVideoExportEvidence,
  observeInfinityCanvas,
} from "./browser-infinity-canvas-evidence";
import {
  readToolcraftCanvasViewport,
  zoomToolcraftCanvasViewport,
} from "./performance-canvas-helpers";

test("toolcraft Infinity canvas observation reads runtime-owned geometry", async ({
  page,
}) => {
  await page.setContent(`
    <div data-toolcraft-canvas-world data-toolcraft-canvas-offset-x="12" data-toolcraft-canvas-offset-y="-8">
      <div data-toolcraft-canvas-mode="infinite" style="overflow: visible">
        <div data-scene style="position:absolute;left:1px;top:2px;width:3px;height:4px"></div>
        <div
          data-toolcraft-product-scene
          data-toolcraft-product-scene-status="ready"
          style="position:absolute;left:-320px;top:-200px;width:640px;height:400px"
        ></div>
      </div>
    </div>
  `);

  expectInfiniteCanvasObservation(
    await observeInfinityCanvas(page),
    { height: 400, width: 640, x: -320, y: -200 },
  );
});

test("toolcraft canvas viewport observation reads the runtime world transform", async ({
  page,
}) => {
  await page.setContent(`
    <div
      data-toolcraft-canvas-world
      data-toolcraft-canvas-offset-x="96"
      data-toolcraft-canvas-offset-y="-64"
      data-toolcraft-canvas-zoom="125"
    ></div>
  `);

  await expect(readToolcraftCanvasViewport(page)).resolves.toEqual({
    offsetX: 96,
    offsetY: -64,
    zoom: 125,
  });
});

test("toolcraft canvas zoom helper performs only the requested direction", async ({
  page,
}) => {
  await page.setContent(`
    <button aria-label="Zoom in" onclick="document.body.dataset.zoomIn = String(Number(document.body.dataset.zoomIn ?? 0) + 1)"></button>
    <button aria-label="Zoom out" onclick="document.body.dataset.zoomOut = String(Number(document.body.dataset.zoomOut ?? 0) + 1)"></button>
  `);

  await zoomToolcraftCanvasViewport(page, {
    direction: "in",
    repetitions: 2,
  });
  await expect(page.locator("body")).toHaveAttribute("data-zoom-in", "2");
  await expect(page.locator("body")).not.toHaveAttribute("data-zoom-out");

  await zoomToolcraftCanvasViewport(page, { direction: "out" });
  await expect(page.locator("body")).toHaveAttribute("data-zoom-out", "1");
});

test("toolcraft Infinity canvas video evidence compares decoded envelopes", async () => {
  await expectToolcraftInfinityCanvasVideoExportEvidence(
    {
      finite: {
        byteLength: 1024,
        durationMs: 1000,
        height: 1350,
        width: 1080,
      },
      infinite: {
        byteLength: 768,
        durationMs: 1000,
        height: 640,
        width: 640,
      },
    },
    {
      expectedFiniteSize: { height: 1350, width: 1080 },
      expectedInfiniteSize: { height: 640, width: 640 },
      requirementId: "fixture.infinity.video",
      target: "canvas.infinity",
    },
  );
});

test("toolcraft Infinity canvas background evidence proves viewport color and dependency", async () => {
  await expectToolcraftInfinityCanvasBackgroundEvidence(
    {
      backgroundExcluded: {
        backgroundEnabled: false,
        canvasMode: "finite",
        infinityDisabled: true,
        runtimeBackgroundColor: null,
        viewportBackgroundColor: "rgb(20, 20, 20)",
        viewportMatchesRuntimeColor: false,
      },
      backgroundRestored: {
        backgroundEnabled: true,
        canvasMode: "finite",
        infinityDisabled: false,
        runtimeBackgroundColor: null,
        viewportBackgroundColor: "rgb(20, 20, 20)",
        viewportMatchesRuntimeColor: false,
      },
      infinite: {
        backgroundEnabled: true,
        canvasMode: "infinite",
        infinityDisabled: false,
        runtimeBackgroundColor: "#D4CECA",
        viewportBackgroundColor: "rgb(212, 206, 202)",
        viewportMatchesRuntimeColor: true,
      },
    },
    {
      expectedBackgroundColor: "#D4CECA",
      requirementId: "fixture.background",
      target: "export.includeBackground",
    },
  );
});
