import {
  defineToolcraft,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftControlApplicabilityErrors } from "./acceptance/control-applicability";
import type { ToolcraftProductReadiness } from "./acceptance/types";
import { collectToolcraftVisibleAcceptanceControls } from "./acceptance/validate-coverage";

const productReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Shape fixture",
  productSummary: "Neutral applicability contract fixture.",
  requestedBehavior: "Show only controls that apply to the selected shape.",
  viewInteraction: { mode: "non-spatial", reason: "Schema-only fixture." },
};

const shapeKind: ToolcraftControlSchema = {
  applicability: { mode: "always" },
  defaultValue: "circle",
  options: [
    { label: "Circle", value: "circle" },
    { label: "Square", value: "square" },
    { label: "Polygon", value: "polygon" },
    { label: "Star", value: "star" },
  ],
  target: "shape.kind",
  type: "segmented",
};

const alwaysControls: Record<string, ToolcraftControlSchema> = {
  kind: shapeKind,
  cornerRadius: {
    applicability: {
      all: [
        {
          oneOf: ["square", "polygon", "star"],
          target: "shape.kind",
        },
      ],
      mode: "conditional",
    },
    target: "shape.cornerRadius",
    type: "slider",
  },
  depth: {
    applicability: {
      all: [{ equals: "star", target: "shape.kind" }],
      mode: "conditional",
    },
    target: "shape.depth",
    type: "slider",
  },
  sides: {
    applicability: {
      all: [
        { oneOf: ["polygon", "star"], target: "shape.kind" },
      ],
      mode: "conditional",
    },
    target: "shape.sides",
    type: "slider",
  },
};

function validateProduct(
  controls: Record<string, ToolcraftControlSchema>,
): string[] {
  const schema = defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [{ controls, id: "shape", title: "Shape" }],
        title: "Controls",
      },
    },
  });

  return getToolcraftControlApplicabilityErrors({
    controls: collectToolcraftVisibleAcceptanceControls(schema),
    productReadiness,
  });
}

describe("starter product control applicability", () => {
  it("requires explicit product applicability and rejects legacy visibility", () => {
    expect(
      validateProduct({
        kind: shapeKind,
        sides: { target: "shape.sides", type: "slider" },
      }),
    ).toContainEqual(
      expect.stringContaining("shape.sides must declare explicit applicability"),
    );

    expect(
      validateProduct({
        kind: shapeKind,
        sides: {
          target: "shape.sides",
          type: "slider",
          visibleWhen: { equals: "star", target: "shape.kind" },
        },
      }),
    ).toContainEqual(
      expect.stringContaining("shape.sides uses legacy visibleWhen"),
    );
  });

  it("rejects missing, invalid, contradictory, and unsupported selectors", () => {
    expect(
      validateProduct({
        kind: shapeKind,
        sides: {
          applicability: {
            all: [{ equals: true, target: "shape.missing" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining('predicate target "shape.missing" does not exist'),
    );

    expect(
      validateProduct({
        kind: shapeKind,
        sides: {
          applicability: {
            all: [{ equals: "triangle", target: "shape.kind" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining(
        'value "triangle" is not an option of shape.kind',
      ),
    );

    expect(
      validateProduct({
        kind: shapeKind,
        sides: {
          applicability: {
            all: [
              { equals: "polygon", target: "shape.kind" },
              { equals: "star", target: "shape.kind" },
            ],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining("shape.sides applicability is unsatisfiable"),
    );

    expect(
      validateProduct({
        kind: shapeKind,
        name: {
          applicability: { mode: "always" },
          target: "shape.name",
          type: "text",
        },
        sides: {
          applicability: {
            all: [{ equals: "named", target: "shape.name" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining(
        "shape.name is not a supported applicability selector",
      ),
    );
  });

  it("rejects numeric gates with no satisfying selector value", () => {
    expect(
      validateProduct({
        count: {
          applicability: { mode: "always" },
          defaultValue: 2,
          max: 3,
          min: 1,
          step: 1,
          target: "shape.count",
          type: "slider",
          variant: "discrete",
        },
        sides: {
          applicability: {
            all: [{ greaterThan: 10, target: "shape.count" }],
            mode: "conditional",
          },
          target: "shape.sides",
          type: "slider",
        },
      }),
    ).toContainEqual(
      expect.stringContaining("shape.sides has no satisfying value in shape.count"),
    );
  });

  it("accepts a complete finite applicability declaration", () => {
    expect(validateProduct(alwaysControls)).toEqual([]);
  });
});
