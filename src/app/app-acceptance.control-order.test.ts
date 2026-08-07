import { describe, expect, it } from "vitest";
import {
  getToolcraftSegmentedStaticFitError,
  type ToolcraftCollectionItemControlType,
} from "@/toolcraft/runtime";

import {
  getToolcraftControlOrderTargets,
  inferToolcraftControlOrderRole,
} from "./acceptance/control-order";
import {
  contractSchemaFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
  validateContractAcceptanceDiagnostics,
} from "./app-acceptance.contract-fixtures";

const SCREENSHOT_LABELS = ["Default", "Ink Drops", "Solar", "Background"];
const BOUNDARY_LABELS = ["Ink Drops", "Default", "Solar", "RGB"];

function createRawCollectionModesSchema(
  itemControlType: ToolcraftCollectionItemControlType,
  labels: readonly string[],
) {
  return {
    ...contractSchemaFixture,
    panels: {
      ...contractSchemaFixture.panels,
      controls: {
        sections: [
          {
            controls: {
              modes: {
                defaultValue: ["default"],
                itemControl: {
                  defaultValue: "default",
                  label: "Mode",
                  options: labels.map((label) => ({
                    label,
                    value: label.toLowerCase().replaceAll(" ", "-"),
                  })),
                  type: itemControlType,
                },
                itemLabel: "Mode",
                label: "Modes",
                minItems: 1,
                target: "appearance.modes",
                type: "collectionActions" as const,
              },
            },
            id: "style",
            title: "Style",
          },
        ],
        title: "Appearance",
      },
    },
  };
}

const collectionModesAcceptance = [
  {
    automated: true,
    automatedTestName: "collection modes update rendered output",
    browser: true,
    browserTestName: "browser: collection modes update rendered output",
    componentType: "collectionActions",
    controlPartCoverage: [
      "collectionActions.add",
      "collectionActions.remove",
      "collectionActions.items",
    ] as const,
    evidence: "rendered-pixels" as const,
    expectedObservable: "Adding and editing modes changes rendered output.",
    fixture: "collection modes fixture",
    id: "appearance.modes",
    kind: "control" as const,
    target: "appearance.modes",
    userAction: "Add, remove, and edit collection modes.",
  },
];

describe("starter acceptance control order contract", () => {
  it("requires mode selectors to appear before dependent controls", () => {
    const schemaWithLateModeSelector = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        controls: {
          sections: [
            {
              controls: {
                depth: {
                  defaultValue: 0.64,
                  label: "Depth",
                  max: 1,
                  min: 0,
                  orderRole: "strength" as const,
                  target: "shader.depth",
                  type: "slider",
                  variant: "continuous",
                },
                mode: {
                  defaultValue: "liquid",
                  label: "Mode",
                  options: [
                    { label: "Silk", value: "silk" },
                    { label: "Liquid", value: "liquid" },
                    { label: "Crystal", value: "crystal" },
                  ],
                  orderRole: "mode" as const,
                  target: "shader.mode",
                  type: "segmented",
                },
              },
              id: "volume",
              title: "Volume",
            },
          ],
          title: "Shader",
        },
      },
    };

    expect(
      validateContractAcceptanceDiagnostics({
        schema: schemaWithLateModeSelector,
        acceptance: [
          {
            automated: true,
            automatedTestName: "depth changes rendered output",
            browser: true,
            browserTestName: "browser: depth slider changes rendered output",
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Depth changes shader contrast.",
            fixture: "depth fixture",
            id: "shader.depth",
            kind: "control",
            target: "shader.depth",
            userAction: "Drag the Depth slider.",
          },
          {
            automated: true,
            automatedTestName: "mode changes rendered output",
            browser: true,
            browserTestName: "browser: mode selector changes rendered output",
            componentType: "segmented",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Mode switches shader pattern.",
            fixture: "mode fixture",
            id: "shader.mode",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "shader.mode",
            userAction: "Select each Mode option.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            'Volume / mode (shader.mode) has orderRole "mode" after depth (shader.depth) with orderRole "strength". Move mode/input/primary controls before dependent strength/detail/advanced controls or split them into an earlier section.',
          ruleId: "controls-layout-heuristics",
          severity: "warning",
        }),
      ]),
    );
  });

  it("accepts explicit order roles when selectors lead dependent controls", () => {
    const schemaWithOrderedControls = defineContractSchemaFixture({
      canvas: {
        enabled: true,
        sizing: { mode: "editable-output" },
        upload: true,
      },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                blend: {
                  defaultValue: "liquid",
                  label: "Blend",
                  options: [
                    { label: "Silk", value: "silk" },
                    { label: "Liquid", value: "liquid" },
                    { label: "Crystal", value: "crystal" },
                  ],
                  orderRole: "mode" as const,
                  target: "shader.blend",
                  type: "segmented",
                },
                depth: {
                  defaultValue: 0.64,
                  label: "Depth",
                  max: 1,
                  min: 0,
                  orderRole: "strength" as const,
                  target: "shader.depth",
                  type: "slider",
                  variant: "continuous",
                },
              },
              title: "Volume",
            },
          ],
          title: "Shader",
        },
      },
      toolbar: {
        history: true,
        radar: true,
        zoom: true,
      },
    });

    expect(getToolcraftControlOrderTargets(schemaWithOrderedControls)).toEqual([
      "shader.blend",
      "shader.depth",
    ]);
    expect(
      validateContractAcceptance({
        schema: schemaWithOrderedControls,
        acceptance: [
          {
            automated: true,
            automatedTestName: "blend changes rendered output",
            browser: true,
            browserTestName: "browser: blend selector changes rendered output",
            componentType: "segmented",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Blend switches shader pattern.",
            fixture: "blend fixture",
            id: "shader.blend",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "shader.blend",
            userAction: "Select each Blend option.",
          },
          {
            automated: true,
            automatedTestName: "depth changes rendered output",
            browser: true,
            browserTestName: "browser: depth slider changes rendered output",
            componentType: "slider",
            evidence: "rendered-pixels",
            expectedObservable: "Changing Depth changes shader contrast.",
            fixture: "depth fixture",
            id: "shader.depth",
            kind: "control",
            target: "shader.depth",
            userAction: "Drag the Depth slider.",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("uses typed orderRole instead of inferring product meaning from copy", () => {
    expect(
      inferToolcraftControlOrderRole({
        defaultValue: "liquid",
        label: "Mode",
        options: [{ label: "Liquid", value: "liquid" }],
        target: "producto.eleccion",
        type: "select",
      }),
    ).toBe("primary");
    expect(
      inferToolcraftControlOrderRole({
        defaultValue: "liquid",
        label: "Eleccion",
        options: [{ label: "Liquido", value: "liquid" }],
        orderRole: "mode",
        target: "producto.eleccion",
        type: "select",
      }),
    ).toBe("mode");
  });

  it("requires overwide segmented controls to shorten labels or use select", () => {
    const schemaWithOverwideSegmentedControl = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        controls: {
          sections: [
            {
              controls: {
                preset: {
                  defaultValue: "full-stack",
                  label: "FX Preset",
                  options: [
                    { label: "Full Stack", value: "full-stack" },
                    { label: "RGB Split", value: "rgb-split" },
                    { label: "Shade", value: "shade" },
                    { label: "Lines", value: "lines" },
                    { label: "Off", value: "off" },
                  ],
                  orderRole: "mode" as const,
                  target: "shader.fxPreset",
                  type: "segmented",
                },
              },
              id: "style",
              title: "Style",
            },
          ],
          title: "Shader",
        },
      },
    };

    expect(
      validateContractAcceptance({
        schema: schemaWithOverwideSegmentedControl,
        acceptance: [
          {
            automated: true,
            automatedTestName: "fx preset changes rendered output",
            browser: true,
            browserTestName: "browser: fx preset selector changes rendered output",
            componentType: "segmented",
            evidence: "rendered-pixels",
            expectedObservable: "Changing FX Preset switches the shader preset.",
            fixture: "fx preset fixture",
            id: "shader.fxPreset",
            kind: "control",
            optionCoverage: "each-visible-item",
            target: "shader.fxPreset",
            userAction: "Select each FX Preset option.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Style / preset (shader.fxPreset) segmented controls must preserve cell padding: use at most 4 short options (max 9 characters per label and 24 total) or shorten labels first; if the compact names still exceed the budget, use a select dropdown instead.",
      ]),
    );
  });

  it("reports canonical fit guidance for an overwide collectionActions itemControl", () => {
    const itemControl = {
      options: SCREENSHOT_LABELS.map((label) => ({ label })),
      type: "segmented" as const,
    };
    const fitGuidance = getToolcraftSegmentedStaticFitError(itemControl);

    expect(fitGuidance).not.toBeNull();
    expect(
      validateContractAcceptance({
        schema: createRawCollectionModesSchema(
          itemControl.type,
          SCREENSHOT_LABELS,
        ),
        acceptance: collectionModesAcceptance,
      }),
    ).toEqual(
      expect.arrayContaining([
        `Style / modes (appearance.modes) itemControl ${fitGuidance}`,
      ]),
    );
  });

  it("reports canonical fit guidance for every compound itemControls field", () => {
    const schema = createRawCollectionModesSchema("segmented", SCREENSHOT_LABELS);
    const modes = schema.panels.controls.sections[0]!.controls.modes;
    const compoundSchema = {
      ...schema,
      panels: {
        ...schema.panels,
        controls: {
          ...schema.panels.controls,
          sections: [
            {
              ...schema.panels.controls.sections[0],
              controls: {
                modes: {
                  ...modes,
                  defaultValue: [{ enabled: true, mode: "default" }],
                  itemControl: undefined,
                  itemControls: {
                    enabled: {
                      defaultValue: true,
                      label: "Enabled",
                      type: "switch" as const,
                    },
                    mode: modes.itemControl,
                  },
                },
              },
            },
          ],
        },
      },
    };
    const fitGuidance = getToolcraftSegmentedStaticFitError(
      modes.itemControl,
    );

    expect(fitGuidance).not.toBeNull();
    expect(
      validateContractAcceptance({
        schema: compoundSchema,
        acceptance: collectionModesAcceptance,
      }),
    ).toEqual(
      expect.arrayContaining([
        `Style / modes (appearance.modes) itemControls.mode ${fitGuidance}`,
      ]),
    );
  });

  it.each([
    { labels: BOUNDARY_LABELS, type: "segmented" },
    { labels: SCREENSHOT_LABELS, type: "select" },
  ] as const)(
    "does not report itemControl fit guidance for nested $type",
    ({ labels, type }) => {
      const errors = validateContractAcceptance({
        schema: createRawCollectionModesSchema(type, labels),
        acceptance: collectionModesAcceptance,
      });

      expect(
        errors.some(
          (error) =>
            error.includes("itemControl") &&
            error.includes("preserve cell padding"),
        ),
      ).toBe(false);
    },
  );
});
