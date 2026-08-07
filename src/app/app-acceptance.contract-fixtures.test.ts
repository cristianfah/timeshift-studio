import { describe, expect, it } from "vitest";
import {
  defineToolcraft,
  type ToolcraftAppSchema,
} from "@/toolcraft/runtime";

import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

const schema = {
  canvas: { enabled: true },
  panels: {
    controls: {
      sections: [],
      title: "Controls",
    },
  },
} satisfies ToolcraftAppSchema;

describe("Toolcraft acceptance contract schema fixtures", () => {
  it("authors neutral fixture controls explicitly without masking legacy input", () => {
    const fixture = defineContractSchemaFixture({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                legacy: {
                  target: "shape.legacy",
                  type: "slider",
                  visibleWhen: { equals: true, target: "shape.enabled" },
                },
                neutral: {
                  target: "shape.enabled",
                  type: "switch",
                },
              },
              id: "shape",
              title: "Shape",
            },
          ],
          title: "Controls",
        },
      },
    });
    const controls = fixture.panels.controls?.sections.find(
      (section) => section.id === "shape",
    )?.controls;

    expect(controls?.neutral?.applicability).toEqual({
      mode: "always",
      origin: "explicit",
    });
    expect(controls?.legacy?.applicability).toEqual({
      all: [{ equals: true, target: "shape.enabled" }],
      mode: "conditional",
      origin: "legacy",
    });
  });

  it("opts unrelated unit fixtures out without changing the production default", () => {
    const productionDefault = defineToolcraft(schema);
    const contractFixture = defineContractSchemaFixture(schema);

    expect(productionDefault.persistence.storage).toBe("localStorage");
    expect(contractFixture.persistence).toEqual({
      storage: "none",
    });
    expect(
      validateContractAcceptance({ acceptance: [], schema: productionDefault }),
    ).toContain(
      'persistence.storage "localStorage" requires a runtime acceptance entry with persistenceCoverage "reload" proving user-edited persisted state restores after a real browser reload. Settings import/export is not a substitute for persistence.',
    );
    expect(
      validateContractAcceptance({ acceptance: [], schema: contractFixture }),
    ).toEqual([]);
  });
});
