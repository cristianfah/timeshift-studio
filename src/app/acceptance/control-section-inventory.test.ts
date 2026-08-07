import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftControlSectionInventoryErrors } from "./control-section-inventory";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

const opacityControl = {
  defaultValue: 75,
  max: 100,
  min: 0,
  target: "appearance.opacity",
  type: "slider",
} as const;

function createSchema({
  id = "appearance",
  title = "Appearance",
}: {
  id?: string;
  title?: string;
} = {}) {
  return defineToolcraft({
    canvas: { enabled: true },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              opacity: opacityControl,
            },
            id,
            title,
          },
        ],
        title: "Controls",
      },
    },
  });
}

const inventoryEntry = {
  entity: "Appearance",
  entityId: "appearance",
  groupingReason: "These controls define the visible appearance of the output.",
  id: "appearance",
  targets: ["appearance.opacity"],
  title: "Original title",
} as const;

describe("Toolcraft Control Section Inventory identity", () => {
  it("matches inventory by id when a section title is renamed", () => {
    expect(
      getToolcraftControlSectionInventoryErrors(
        createSchema({ title: "Renamed appearance" }),
        [inventoryEntry],
      ),
    ).toEqual([]);
  });

  it("preserves inventory ownership when runtime Setup relocates product background controls", () => {
    const schema = defineToolcraft({
      canvas: { enabled: true },
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
    const backgroundInventory = {
      entity: "Output background",
      entityId: "output-background",
      groupingReason:
        "Inclusion and color jointly define the exported background.",
      id: "background",
      targets: ["export.includeBackground", "appearance.background"],
      title: "Background",
    } as const;

    expect(schema.panels.controls?.sections[0]?.id).toBe("runtime.setup");
    expect(
      getToolcraftControlSectionInventoryErrors(schema, [
        backgroundInventory,
      ]),
    ).toEqual([]);
  });

  it("rejects an inventory id that does not match the schema section", () => {
    const errors = getToolcraftControlSectionInventoryErrors(createSchema(), [
      { ...inventoryEntry, id: "different-section" },
    ]);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/different-section.*no rendered product controls section/iu),
        expect.stringMatching(/missing product section.*appearance/iu),
      ]),
    );
  });

  it("rejects duplicate inventory ids", () => {
    const errors = getToolcraftControlSectionInventoryErrors(createSchema(), [
      inventoryEntry,
      { ...inventoryEntry, title: "Duplicate title" },
    ]);

    expect(errors).toContain(
      'Control Section Inventory repeats id "appearance" 2 times. Section inventory IDs must be unique.',
    );
  });

  it.each([
    [
      "blank entityId",
      { ...inventoryEntry, entityId: "" },
      'Control Section Inventory entry "Original title" must declare a non-empty stable entityId.',
    ],
    [
      "blank entity",
      { ...inventoryEntry, entity: "" },
      'Control Section Inventory entry "Original title" must declare a human-readable entity name.',
    ],
  ])("rejects %s", (_label, entry, expectedMessage) => {
    expect(
      getToolcraftControlSectionInventoryErrors(createSchema(), [entry]),
    ).toContain(expectedMessage);
  });

  it("rejects a missing entityId without throwing", () => {
    const { entityId: _entityId, ...entryWithoutEntityId } = inventoryEntry;
    const malformedInventory = [
      entryWithoutEntityId,
    ] as unknown as readonly ToolcraftControlSectionInventoryEntry[];

    expect(() =>
      getToolcraftControlSectionInventoryErrors(
        createSchema(),
        malformedInventory,
      ),
    ).not.toThrow();
    expect(
      getToolcraftControlSectionInventoryErrors(
        createSchema(),
        malformedInventory,
      ),
    ).toContain(
      'Control Section Inventory entry "Original title" must declare a non-empty stable entityId.',
    );
  });

  it.each([
    ["missing", undefined],
    ["non-string", 42],
  ])(
    "reports a clear diagnostic for a %s inventory id",
    (_label, id) => {
      const malformedInventory = [
        { ...inventoryEntry, id },
      ] as unknown as readonly ToolcraftControlSectionInventoryEntry[];

      expect(() =>
        getToolcraftControlSectionInventoryErrors(
          createSchema(),
          malformedInventory,
        ),
      ).not.toThrow();
      expect(
        getToolcraftControlSectionInventoryErrors(
          createSchema(),
          malformedInventory,
        ),
      ).toContain(
        "Control Section Inventory contains an entry without a non-empty string stable section id.",
      );
    },
  );

  it("rejects legacy-derived schema ids for generated product readiness", () => {
    const legacySchema = defineToolcraft({
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                opacity: opacityControl,
              },
              title: "Appearance",
            },
          ],
          title: "Controls",
        },
      },
    });

    expect(
      getToolcraftControlSectionInventoryErrors(legacySchema, [inventoryEntry]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/must declare an explicit stable id/iu),
      ]),
    );
  });
});
