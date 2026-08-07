import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
} from "./control-applicability-cases";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

const sectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Shape",
    entityId: "shape",
    groupingReason: "Source and shape selectors gate shape parameters.",
    id: "shape",
    targets: ["source.mode", "shape.kind", "shape.sides"],
    title: "Shape",
  },
];

function shapeSchema({
  applicability = {
    all: [
      { equals: "create", target: "source.mode" },
      { oneOf: ["polygon", "star"], target: "shape.kind" },
    ],
    mode: "conditional" as const,
  },
}: {
  applicability?: {
    all: readonly {
      equals?: unknown;
      oneOf?: readonly unknown[];
      target: string;
    }[];
    mode: "conditional";
  } | { mode: "always" };
} = {}) {
  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              sourceMode: {
                applicability: { mode: "always" },
                defaultValue: "create",
                options: [
                  { label: "Upload", value: "upload" },
                  { label: "Create", value: "create" },
                ],
                target: "source.mode",
                type: "segmented",
              },
              shapeKind: {
                applicability: { mode: "always" },
                defaultValue: "polygon",
                options: [
                  { label: "Circle", value: "circle" },
                  { label: "Polygon", value: "polygon" },
                  { label: "Star", value: "star" },
                ],
                target: "shape.kind",
                type: "segmented",
              },
              sides: {
                applicability,
                defaultValue: 6,
                target: "shape.sides",
                type: "slider",
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
}

describe("Toolcraft control applicability cases", () => {
  it("derives deterministic pairwise cases from semantic inventory", () => {
    const cases = getToolcraftControlApplicabilityCases({
      schema: shapeSchema(),
      sectionInventory,
      target: "shape.sides",
    });

    expect(cases.map(({ expectation, selectorTarget, selectorValue, target }) => ({
      expectation,
      selectorTarget,
      selectorValue,
      target,
    }))).toEqual([
      {
        expectation: "hidden",
        selectorTarget: "source.mode",
        selectorValue: "upload",
        target: "shape.sides",
      },
      {
        expectation: "visible",
        selectorTarget: "source.mode",
        selectorValue: "create",
        target: "shape.sides",
      },
      {
        expectation: "hidden",
        selectorTarget: "shape.kind",
        selectorValue: "circle",
        target: "shape.sides",
      },
      {
        expectation: "visible",
        selectorTarget: "shape.kind",
        selectorValue: "polygon",
        target: "shape.sides",
      },
      {
        expectation: "visible",
        selectorTarget: "shape.kind",
        selectorValue: "star",
        target: "shape.sides",
      },
    ]);
    expect(cases[0]).toEqual(
      expect.objectContaining({
        selectorControlType: "segmented",
        selectorLabel: "sourceMode",
        selectorOptionLabel: "Upload",
      }),
    );
  });

  it("treats omitted finite siblings as visible claims", () => {
    const cases = getToolcraftControlApplicabilityCases({
      schema: shapeSchema({
        applicability: {
          all: [{ oneOf: ["polygon", "star"], target: "shape.kind" }],
          mode: "conditional",
        },
      }),
      sectionInventory,
      target: "shape.sides",
    });

    expect(cases.slice(0, 2)).toEqual([
      expect.objectContaining({
        expectation: "visible",
        selectorTarget: "source.mode",
        selectorValue: "upload",
        target: "shape.sides",
      }),
      expect.objectContaining({
        expectation: "visible",
        selectorTarget: "source.mode",
        selectorValue: "create",
        target: "shape.sides",
      }),
    ]);
  });

  it("uses one path for always controls and stable encoded requirement ids", () => {
    const cases = getToolcraftControlApplicabilityCases({
      schema: shapeSchema({ applicability: { mode: "always" } }),
      sectionInventory,
      target: "shape.sides",
    });

    expect(cases.every((entry) => entry.expectation === "visible")).toBe(true);
    expect(getToolcraftApplicabilityRequirementId("shape-sides", cases[0]!)).toBe(
      "shape-sides#applicability:source.mode=%22upload%22:visible",
    );
  });

  it("derives bounded numeric boundary cases without enumerating a range", () => {
    const schema = defineToolcraft({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                count: {
                  applicability: { mode: "always" },
                  defaultValue: 2,
                  max: 3,
                  min: 1,
                  step: 1,
                  target: "shade.count",
                  type: "slider",
                  variant: "discrete",
                },
                thirdShade: {
                  applicability: {
                    all: [
                      {
                        greaterThanOrEqual: 3,
                        target: "shade.count",
                      },
                    ],
                    mode: "conditional",
                  },
                  target: "shade.third",
                  type: "color",
                },
              },
              id: "shades",
              title: "Shades",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      getToolcraftControlApplicabilityCases({
        schema,
        sectionInventory: [
          {
            entity: "Shades",
            entityId: "shades",
            groupingReason: "Count controls the available shade colors.",
            id: "shades",
            targets: ["shade.count", "shade.third"],
            title: "Shades",
          },
        ],
        target: "shade.third",
      }).map(({ expectation, selectorTarget, selectorValue, target }) => ({
        expectation,
        selectorTarget,
        selectorValue,
        target,
      })),
    ).toEqual([
      {
        expectation: "hidden",
        selectorTarget: "shade.count",
        selectorValue: 1,
        target: "shade.third",
      },
      {
        expectation: "hidden",
        selectorTarget: "shade.count",
        selectorValue: 2,
        target: "shade.third",
      },
      {
        expectation: "visible",
        selectorTarget: "shade.count",
        selectorValue: 3,
        target: "shade.third",
      },
    ]);
  });

  it("uses the resolved Setup product subset only as the inventory fallback", () => {
    const schema = defineToolcraft({
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
      },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                background: {
                  applicability: { mode: "always" },
                  defaultValue: "#101010",
                  target: "appearance.background",
                  type: "color",
                },
                includeBackground: {
                  applicability: { mode: "always" },
                  defaultValue: true,
                  target: "export.includeBackground",
                  type: "switch",
                },
              },
              id: "background",
              title: "Background",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      getToolcraftControlApplicabilityCases({
        schema,
        sectionInventory: [],
        target: "appearance.background",
      }).map(({ expectation, selectorTarget, selectorValue, target }) => ({
        expectation,
        selectorTarget,
        selectorValue,
        target,
      })),
    ).toEqual([
      {
        expectation: "visible",
        selectorTarget: "export.includeBackground",
        selectorValue: false,
        target: "appearance.background",
      },
      {
        expectation: "visible",
        selectorTarget: "export.includeBackground",
        selectorValue: true,
        target: "appearance.background",
      },
    ]);
  });
});
