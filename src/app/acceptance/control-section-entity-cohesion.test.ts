import { describe, expect, it } from "vitest";

import {
  getToolcraftControlSectionEntityCohesionErrors,
  hasToolcraftInventoryEntityAgreement,
} from "./control-section-entity-cohesion";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

function makeSection({
  count,
  entity = "Renderable object",
  entityId = "renderable-object",
  id = "object",
  splitReason,
  workflowStage,
}: {
  count: number;
  entity?: string;
  entityId?: string;
  id?: string;
  splitReason?: string;
  workflowStage?: string;
}): ToolcraftControlSectionInventoryEntry {
  return {
    entity,
    entityId,
    groupingReason: `The ${id} controls edit one coherent part of the entity.`,
    id,
    splitReason,
    targets: Array.from(
      { length: count },
      (_, index) => `${id}.value${index + 1}`,
    ),
    title: id,
    workflowStage,
  };
}

describe("Toolcraft control section entity cohesion", () => {
  it.each([1, 7, 8, 10])(
    "accepts one entity in one section with %s controls",
    (count) => {
      expect(
        getToolcraftControlSectionEntityCohesionErrors([
          makeSection({ count }),
        ]),
      ).toEqual([]);
    },
  );

  it("rejects splitting an entity that fits in one section", () => {
    const errors = getToolcraftControlSectionEntityCohesionErrors([
      makeSection({ count: 3, id: "object-source" }),
      makeSection({ count: 4, id: "object-style" }),
    ]);

    expect(errors).toContain(
      'Control Section Inventory entity "renderable-object" owns 7 controls across 2 sections (object-source, object-style). Entities with 10 or fewer controls must stay in one section.',
    );
  });

  it("rejects an entity above the hard maximum left in one section", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({ count: 11 }),
      ]),
    ).toContain(
      'Control Section Inventory entity "renderable-object" owns 11 controls in section object. Split entities above 10 controls into explicit workflow stages.',
    );
  });

  it("accepts a balanced large-entity workflow split", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({
          count: 5,
          id: "object-structure",
          splitReason: "Structure is authored before the finishing workflow.",
          workflowStage: "structure",
        }),
        makeSection({
          count: 6,
          id: "object-finish",
          splitReason: "Finish is authored after the structural workflow.",
          workflowStage: "finish",
        }),
      ]),
    ).toEqual([]);
  });

  it("rejects a one-control tail in a split entity", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({
          count: 10,
          id: "object-primary",
          splitReason: "Primary editing precedes the final workflow stage.",
          workflowStage: "primary",
        }),
        makeSection({
          count: 1,
          id: "object-final",
          splitReason: "The final workflow follows primary editing.",
          workflowStage: "final",
        }),
      ]),
    ).toContain(
      'Control Section Inventory entity "renderable-object" section object-final owns 1 control. Every section in a split entity must own between 2 and 10 controls.',
    );
  });

  it("rejects a split section above the per-section maximum", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({
          count: 11,
          id: "object-primary",
          splitReason: "Primary editing precedes the final workflow stage.",
          workflowStage: "primary",
        }),
        makeSection({
          count: 2,
          id: "object-final",
          splitReason: "The final workflow follows primary editing.",
          workflowStage: "final",
        }),
      ]),
    ).toContain(
      'Control Section Inventory entity "renderable-object" section object-primary owns 11 controls. Every section in a split entity must own between 2 and 10 controls.',
    );
  });

  it("requires a workflow stage on every section of a split entity", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({
          count: 6,
          id: "object-primary",
          splitReason: "Primary editing precedes the final workflow stage.",
        }),
        makeSection({
          count: 6,
          id: "object-final",
          splitReason: "The final workflow follows primary editing.",
          workflowStage: "final",
        }),
      ]),
    ).toContain(
      'Control Section Inventory entity "renderable-object" section object-primary must declare workflowStage because the entity is split across sections.',
    );
  });

  it("requires complete, unique split evidence and a consistent entity name", () => {
    const errors = getToolcraftControlSectionEntityCohesionErrors([
      makeSection({ count: 6, id: "object-a", workflowStage: "edit" }),
      makeSection({
        count: 6,
        entity: "Different label",
        id: "object-b",
        splitReason: "This section follows the first editing stage.",
        workflowStage: "edit",
      }),
    ]);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("uses inconsistent entity names"),
        expect.stringContaining("object-a must declare splitReason"),
        expect.stringContaining('repeats workflowStage "edit"'),
      ]),
    );
  });

  it("keeps independent entities independent", () => {
    expect(
      getToolcraftControlSectionEntityCohesionErrors([
        makeSection({ count: 4, entityId: "entity-a", id: "entity-a" }),
        makeSection({ count: 4, entityId: "entity-b", id: "entity-b" }),
      ]),
    ).toEqual([]);
  });

  it("requires one shared entityId for target-prefix corroboration", () => {
    const first = makeSection({ count: 6, id: "first" });
    const second = makeSection({
      count: 6,
      entityId: "different-entity",
      id: "second",
    });
    const sectionInventoryById = new Map([
      [first.id, first],
      [second.id, second],
    ]);
    const sections = new Set([first.id, second.id]);

    expect(
      hasToolcraftInventoryEntityAgreement({
        sectionInventoryById,
        sections,
      }),
    ).toBe(false);

    sectionInventoryById.set(second.id, {
      ...second,
      entityId: first.entityId,
    });

    expect(
      hasToolcraftInventoryEntityAgreement({
        sectionInventoryById,
        sections,
      }),
    ).toBe(true);
  });
});
