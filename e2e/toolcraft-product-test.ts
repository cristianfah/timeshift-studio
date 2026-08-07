import {
  expect,
  test as playwrightTest,
  type Page,
} from "@playwright/test";

export { expect };

export type ToolcraftProductTestFixtures = Readonly<{
  page: Page;
}>;

export type ToolcraftProductTestCallback = (
  fixtures: ToolcraftProductTestFixtures,
) => Promise<void> | void;

type ToolcraftProductTest = {
  (title: string, callback: ToolcraftProductTestCallback): void;
  setTimeout(timeoutMs: number): void;
};

const registerProductTest = ((
  title: string,
  callback: ToolcraftProductTestCallback,
): void => {
  playwrightTest(title, async ({ page }) => callback(Object.freeze({ page })));
}) as ToolcraftProductTest;

registerProductTest.setTimeout = (timeoutMs: number): void => {
  playwrightTest.setTimeout(timeoutMs);
};

export const test = Object.freeze(registerProductTest);
