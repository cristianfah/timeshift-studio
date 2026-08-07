import {
  defineToolcraft,
  resolveToolcraftControlApplicability,
  type ResolvedToolcraftAppSchema,
  type ToolcraftAppSchema,
} from "@/toolcraft/runtime";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import {
  validateToolcraftAcceptanceDiagnostics,
  validateToolcraftAcceptanceCoverage,
  type ToolcraftAcceptanceValidationInput,
} from "./acceptance/validate-coverage";

export function defineContractSchemaFixture(schema: ToolcraftAppSchema) {
  const controls = schema.panels.controls
    ? {
        ...schema.panels.controls,
        sections: schema.panels.controls.sections.map((section) => ({
          ...section,
          controls: Object.fromEntries(
            Object.entries(section.controls).map(([controlId, control]) => [
              controlId,
              control.applicability || control.visibleWhen
                ? control
                : {
                    ...control,
                    applicability: { mode: "always" as const },
                  },
            ]),
          ),
        })),
      }
    : undefined;

  return defineToolcraft({
    ...schema,
    panels: {
      ...schema.panels,
      ...(controls ? { controls } : {}),
    },
    persistence: { storage: "none" },
  });
}

export const contractSchemaFixture = defineContractSchemaFixture({
  canvas: {
    enabled: true,
    upload: true,
  },
  panels: {
    controls: {
      sections: [],
      title: "Controls",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    zoom: true,
  },
});

export const contractAcceptanceFixture: readonly ToolcraftComponentAcceptance[] = [];

export const contractSectionInventoryFixture: readonly ToolcraftControlSectionInventoryEntry[] = [];

export const contractTransferModeFixture: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  mode: "new-toolcraft-app",
};

export const contractProductReadinessFixture: ToolcraftProductReadiness = {
  mode: "starter",
  reason: "Neutral contract fixture without a product-owned spatial scene.",
};

type ContractAcceptanceOverrides = Omit<
  Partial<ToolcraftAcceptanceValidationInput>,
  "schema"
> & {
  schema?: ContractValidationSchemaFixture;
};

type ContractValidationSchemaFixture = Omit<
  ResolvedToolcraftAppSchema,
  "panels"
> & {
  panels: Omit<ResolvedToolcraftAppSchema["panels"], "controls"> & {
    controls?: ToolcraftAppSchema["panels"]["controls"];
  };
};

function resolveContractValidationSchemaFixture(
  schema: ContractValidationSchemaFixture,
): ResolvedToolcraftAppSchema {
  const {
    controls: _fixtureControls,
    ...panelsWithoutFixtureControls
  } = schema.panels;
  const controls = schema.panels.controls
    ? {
        ...schema.panels.controls,
        sections: schema.panels.controls.sections.map((section) => ({
          ...section,
          controls: Object.fromEntries(
            Object.entries(section.controls).map(([controlId, control]) => {
              const {
                applicability: authoredApplicability,
                visibleWhen,
                ...controlWithoutApplicability
              } = control;

              return [
                controlId,
                {
                  ...controlWithoutApplicability,
                  applicability: resolveToolcraftControlApplicability({
                    applicability:
                      authoredApplicability ??
                      (visibleWhen ? undefined : { mode: "always" }),
                    visibleWhen,
                  }),
                },
              ];
            }),
          ),
        })),
      }
    : undefined;

  // Contract tests deliberately preserve malformed post-normalization fields so
  // the matching acceptance validator, rather than defineToolcraft, reports them.
  return {
    ...schema,
    panels: {
      ...panelsWithoutFixtureControls,
      ...(controls ? { controls } : {}),
    },
  } as ResolvedToolcraftAppSchema;
}

function resolveContractAcceptanceInput(
  overrides: ContractAcceptanceOverrides,
): ToolcraftAcceptanceValidationInput {
  const { schema = contractSchemaFixture, ...remainingOverrides } = overrides;

  return {
    acceptance: contractAcceptanceFixture,
    productReadiness: contractProductReadinessFixture,
    schema: resolveContractValidationSchemaFixture(schema),
    sectionInventory: contractSectionInventoryFixture,
    transferMode: contractTransferModeFixture,
    ...remainingOverrides,
  };
}

export function validateContractAcceptance(
  overrides: ContractAcceptanceOverrides = {},
): string[] {
  return validateToolcraftAcceptanceCoverage(
    resolveContractAcceptanceInput(overrides),
  );
}

export function validateContractAcceptanceDiagnostics(
  overrides: ContractAcceptanceOverrides = {},
) {
  return validateToolcraftAcceptanceDiagnostics(
    resolveContractAcceptanceInput(overrides),
  );
}
