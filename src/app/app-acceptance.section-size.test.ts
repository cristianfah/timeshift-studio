import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftControlSectionInvariantErrors } from "./acceptance/control-layout";

function makeSliderControls(count: number, includeSemanticGroup: boolean) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const control = {
        defaultValue: 0,
        label: `Value ${index + 1}`,
        max: 1,
        min: 0,
        orderRole: "detail" as const,
        target: `dense.value${index + 1}`,
        type: "slider" as const,
        variant: "continuous" as const,
      };

      return [
        `value${index + 1}`,
        includeSemanticGroup
          ? { ...control, semanticGroup: "dense-entity" }
          : control,
      ];
    }),
  );
}

function makeDenseSchema(count: number, includeSemanticGroup = true) {
  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: makeSliderControls(count, includeSemanticGroup),
            id: "dense-entity",
            title: "Dense Entity",
          },
        ],
        title: "Controls",
      },
    },
  });
}

describe("starter acceptance section size boundaries", () => {
  it("does not require semanticGroup at seven controls", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeDenseSchema(7, false)),
    ).toEqual([]);
  });

  it("accepts ten grouped controls in one section", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeDenseSchema(10)),
    ).toEqual([]);
  });

  it("requires semanticGroup beginning at eight controls", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeDenseSchema(8, false)),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "has 8 controls and must declare semanticGroup for every control",
        ),
      ]),
    );
  });
});
