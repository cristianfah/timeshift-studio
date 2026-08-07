import { describe, expect, it } from "vitest";

import { getToolcraftOrientationGizmoErrors } from "./acceptance/orientation-gizmo";
import type { ToolcraftComponentAcceptance } from "./acceptance/types";
import { defineContractSchemaFixture, validateContractAcceptance } from "./app-acceptance.contract-fixtures";

const defaultPose = {
  position: [0, 0, 5],
  up: [0, 1, 0],
} as const;

function createOrientationSchema() {
  return defineContractSchemaFixture({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              material: {
                defaultValue: 0.5,
                label: "Metalness",
                max: 1,
                min: 0,
                target: "model.metalness",
                type: "slider",
              },
              orientation: {
                defaultValue: defaultPose,
                keyframeable: false,
                label: false,
                target: "view.orbit",
                type: "orientationGizmo",
              },
            },
            title: "Model",
          },
        ],
        title: "Controls",
      },
    },
  });
}

const orientationAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName:
    "orientation pose changes rendered model and undo resets it",
  browser: true,
  browserTestName:
    "browser: orientation gizmo and direct model orbit share canvas ownership",
  canvasHandle: {
    exportCleanTestName: "export excludes orientation gizmo",
    outputObservable: "The visible model follows the shared orbit pose.",
    testId: "toolcraft-orientation-gizmo",
    writesTarget: "view.orbit",
  },
  componentType: "orientationGizmo",
  evidence: "product-output",
  expectedObservable:
    "Axis and model drags rotate the model while empty canvas drag pans.",
  fixture: "visible 3D model with empty canvas around it",
  id: "model.orientation",
  kind: "canvas-handle",
  orientationGizmoCoverage: "all-required-orientation-gizmo-behavior",
  userAction:
    "Drag a gizmo axis, drag the visible model, and drag outside the model.",
};

describe("Toolcraft orientation gizmo acceptance", () => {
  it("accepts one hidden non-keyframeable runtime gizmo in a semantic section", () => {
    const schema = createOrientationSchema();

    expect(getToolcraftOrientationGizmoErrors(schema)).toEqual([]);
    const errors = validateContractAcceptance({
      acceptance: [orientationAcceptance],
      schema,
    });

    expect(
      errors.filter((error) =>
        /orientationGizmo|view\.orbit|orientation gizmo/i.test(error),
      ),
    ).toEqual([]);
  });

  it("accepts multiple gizmos when visibility conditions prove one active model", () => {
    const schema = defineContractSchemaFixture({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                activeModel: {
                  defaultValue: "first",
                  label: "Model",
                  options: [
                    { label: "First", value: "first" },
                    { label: "Second", value: "second" },
                  ],
                  target: "model.active",
                  type: "select",
                },
                firstOrientation: {
                  defaultValue: defaultPose,
                  keyframeable: false,
                  label: false,
                  target: "first.orbit",
                  type: "orientationGizmo",
                  visibleWhen: { equals: "first", target: "model.active" },
                },
                secondOrientation: {
                  defaultValue: defaultPose,
                  keyframeable: false,
                  label: false,
                  target: "second.orbit",
                  type: "orientationGizmo",
                  visibleWhen: { equals: "second", target: "model.active" },
                },
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(getToolcraftOrientationGizmoErrors(schema)).toEqual([]);
  });

  it("rejects multiple gizmos whose visibility is not provably exclusive", () => {
    const schema = defineContractSchemaFixture({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                activeModel: {
                  defaultValue: "first",
                  label: "Model",
                  target: "model.active",
                  type: "text",
                },
                firstOrientation: {
                  defaultValue: defaultPose,
                  keyframeable: false,
                  label: false,
                  target: "first.orbit",
                  type: "orientationGizmo",
                  visibleWhen: { notEquals: "hidden", target: "model.active" },
                },
                secondOrientation: {
                  defaultValue: defaultPose,
                  keyframeable: false,
                  label: false,
                  target: "second.orbit",
                  type: "orientationGizmo",
                  visibleWhen: { equals: "second", target: "model.active" },
                },
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(getToolcraftOrientationGizmoErrors(schema)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must have provably mutually exclusive visibility conditions",
        ),
      ]),
    );
  });

  it("rejects panel-control proof that omits the full orbit interaction boundary", () => {
    const schema = createOrientationSchema();
    const errors = validateContractAcceptance({
      acceptance: [
        {
          ...orientationAcceptance,
          canvasHandle: undefined,
          kind: "control",
          orientationGizmoCoverage: undefined,
          target: "view.orbit",
        },
      ],
      schema,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'must use acceptance kind "canvas-handle", not a panel-control proof',
        ),
        expect.stringContaining("must declare orientationGizmoCoverage for"),
      ]),
    );
  });

  it("rejects malformed and competing gizmos plus vectors named as 3D orbit controls", () => {
    const schema = defineContractSchemaFixture({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                orientation: {
                  defaultValue: {
                    position: [0, 0, 0],
                    up: [0, 0, 0],
                  },
                  keyframeable: true,
                  label: "Orientation",
                  target: "view.orbit",
                  type: "orientationGizmo",
                },
              },
              title: "View",
            },
            {
              controls: {
                cameraOrbit: {
                  defaultValue: { x: 0, y: 0 },
                  label: "Camera orbit",
                  target: "camera.orbit",
                  type: "vector",
                },
                secondOrientation: {
                  defaultValue: defaultPose,
                  keyframeable: false,
                  label: false,
                  target: "secondary.orbit",
                  type: "orientationGizmo",
                },
              },
              title: "Secondary model",
            },
          ],
          title: "Controls",
        },
      },
    });
    const errors = getToolcraftOrientationGizmoErrors(schema);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must have provably mutually exclusive visibility conditions",
        ),
        expect.stringContaining("must set label: false"),
        expect.stringContaining("must set keyframeable: false"),
        expect.stringContaining("defaultValue must be a non-degenerate"),
        expect.stringContaining("contains only orientationGizmo"),
        expect.stringContaining("uses Vector for a three-dimensional orbit"),
      ]),
    );
  });
});
