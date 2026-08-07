import type { FullConfig, Reporter, Suite } from "@playwright/test/reporter";

import { deriveToolcraftPerformancePaths } from "@/toolcraft/runtime";

import { createToolcraftDeliveryCatalog } from "../scripts/playwright-test-title-selection.mjs";
import { getToolcraftPlaywrightContainingFile } from "../scripts/playwright-containing-file.mjs";
import { appAcceptance } from "../src/app/app-acceptance-data";
import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";

export default class ToolcraftDeliveryCatalogReporter implements Reporter {
  onBegin(config: FullConfig, suite: Suite): void {
    const availableTests = suite.allTests().map((entry) => ({
      file: getToolcraftPlaywrightContainingFile(entry, config.rootDir),
      testName: entry.title,
    }));
    const catalog = createToolcraftDeliveryCatalog({
      acceptance: appAcceptance,
      availableTests,
      derivePerformancePaths: deriveToolcraftPerformancePaths,
      performance: appPerformance,
      rootDir: config.rootDir,
      schema: appSchema,
    });
    process.stdout.write(`${JSON.stringify(catalog)}\n`);
  }

  printsToStdio(): boolean {
    return true;
  }
}
