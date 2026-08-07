import { expect, type Locator, type Page } from "@playwright/test";

import {
  countToolcraftControlOwnersByTarget,
  getToolcraftControlFieldByTarget,
} from "./browser-control-target-helpers";
import {
  getToolcraftBrowserProofPage,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";

const TOOLCRAFT_APP_ROOT_SELECTOR = '[data-slot="toolcraft-runtime-app"]';
const RENDER_SCALE_TARGET = "canvas.renderScale";

async function expectPausedPlaybackWhenPresent(page: Page): Promise<void> {
  const root = page.locator(TOOLCRAFT_APP_ROOT_SELECTOR);
  const play = root.getByRole("button", { name: "Play playback" });
  const pause = root.getByRole("button", { name: "Pause playback" });
  const playCount = await play.count();
  const actionCount = playCount + (await pause.count());

  if (actionCount === 0) return;

  expect(
    actionCount,
    "Orientation axis-drag proof requires exactly one standard playback action.",
  ).toBe(1);
  expect(
    playCount,
    "Orientation axis-drag proof must be paused; Play playback must be visible before its baseline.",
  ).toBe(1);
  await expect(play).toBeVisible();
}

async function readFiniteAriaNumber(
  slider: Locator,
  name: "aria-valuemax" | "aria-valuenow",
): Promise<number> {
  const raw = await slider.getAttribute(name);
  const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);

  expect(
    Number.isFinite(value),
    `Orientation axis-drag proof requires a finite ${name} on canvas.renderScale.`,
  ).toBe(true);
  return value;
}

async function expectMaximumRenderScaleWhenPresent(page: Page): Promise<void> {
  const ownerCount = await countToolcraftControlOwnersByTarget(
    page,
    RENDER_SCALE_TARGET,
  );

  if (ownerCount === 0) return;

  expect(
    ownerCount,
    "Orientation axis-drag proof requires exactly one canvas.renderScale owner.",
  ).toBe(1);
  const field = await getToolcraftControlFieldByTarget(
    page,
    RENDER_SCALE_TARGET,
  );
  const slider = field.getByRole("slider");
  await expect(
    slider,
    "Orientation axis-drag proof requires one canvas.renderScale slider.",
  ).toHaveCount(1);
  await expect(slider).toBeVisible();

  const value = await readFiniteAriaNumber(slider, "aria-valuenow");
  const maximum = await readFiniteAriaNumber(slider, "aria-valuemax");
  expect(
    value,
    "Orientation axis-drag proof requires canvas.renderScale at maximum quality before its baseline.",
  ).toBe(maximum);
}

export async function expectToolcraftOrientationLiveDragPreconditions(
  session: ToolcraftBrowserProofSession,
): Promise<void> {
  const page = await getToolcraftBrowserProofPage(session);
  await expectPausedPlaybackWhenPresent(page);
  await expectMaximumRenderScaleWhenPresent(page);
}
