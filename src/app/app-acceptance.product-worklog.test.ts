import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appProductReadiness } from "./app-acceptance";
import { schemaHasProductSurface } from "./app-acceptance.schema-test-utils";
import {
  agentWorklogPath,
  getAgentWorklogValidationErrors,
} from "./app-acceptance.worklog-test-utils";

describe("Toolcraft product worklog", () => {
  it("requires product apps to replace the starter worklog with decision evidence", () => {
    if (appProductReadiness.mode !== "product" && !schemaHasProductSurface()) {
      return;
    }

    expect(existsSync(agentWorklogPath)).toBe(true);
    expect(getAgentWorklogValidationErrors(readFileSync(agentWorklogPath, "utf8"))).toEqual([]);
  });
});
