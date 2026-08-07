import type { ToolcraftControlSectionInventoryEntry } from "./types";

export const TOOLCRAFT_DENSE_SECTION_MIN_CONTROLS = 8;

const TOOLCRAFT_MAX_CONTROLS_PER_SECTION = 10;
const TOOLCRAFT_MIN_CONTROLS_PER_SPLIT_SECTION = 2;
const TOOLCRAFT_MIN_SPLIT_REASON_LENGTH = 12;

export function hasToolcraftInventoryEntityAgreement({
  sectionInventoryById,
  sections,
}: {
  sectionInventoryById: ReadonlyMap<
    string,
    ToolcraftControlSectionInventoryEntry
  >;
  sections: ReadonlySet<string>;
}): boolean {
  const entries = [...sections].map((sectionId) =>
    sectionInventoryById.get(sectionId),
  );
  const entityIds = entries.map((entry) => entry?.entityId?.trim() ?? "");

  return entityIds.every(Boolean) && new Set(entityIds).size === 1;
}

export function getToolcraftControlSectionEntityCohesionErrors(
  sectionInventory: readonly ToolcraftControlSectionInventoryEntry[],
): string[] {
  const errors: string[] = [];
  const entriesByEntityId = new Map<
    string,
    ToolcraftControlSectionInventoryEntry[]
  >();

  for (const entry of sectionInventory) {
    const entityId = entry.entityId?.trim() ?? "";
    const entity = entry.entity?.trim() ?? "";

    if (
      !entityId ||
      !entity ||
      (entry.id?.trim().length ?? 0) === 0 ||
      !Array.isArray(entry.targets) ||
      entry.targets.length === 0
    ) {
      continue;
    }

    const entries = entriesByEntityId.get(entityId) ?? [];
    entries.push(entry);
    entriesByEntityId.set(entityId, entries);
  }

  for (const [entityId, entries] of entriesByEntityId) {
    const controlCount = entries.reduce(
      (total, entry) => total + entry.targets.length,
      0,
    );
    const sectionNames = entries.map((entry) => entry.title.trim() || entry.id);
    const entityNames = new Set(entries.map((entry) => entry.entity.trim()));

    if (entityNames.size > 1) {
      errors.push(
        `Control Section Inventory entity "${entityId}" uses inconsistent entity names: ${[
          ...entityNames,
        ].join(", ")}. Reuse one human-readable entity name for every section in the entity.`,
      );
    }

    if (controlCount <= TOOLCRAFT_MAX_CONTROLS_PER_SECTION) {
      if (entries.length > 1) {
        errors.push(
          `Control Section Inventory entity "${entityId}" owns ${controlCount} controls across ${entries.length} sections (${sectionNames.join(", ")}). Entities with ${TOOLCRAFT_MAX_CONTROLS_PER_SECTION} or fewer controls must stay in one section.`,
        );
      }
      continue;
    }

    if (entries.length === 1) {
      errors.push(
        `Control Section Inventory entity "${entityId}" owns ${controlCount} controls in section ${sectionNames[0]}. Split entities above ${TOOLCRAFT_MAX_CONTROLS_PER_SECTION} controls into explicit workflow stages.`,
      );
      continue;
    }

    const sectionsByStage = new Map<string, string[]>();

    for (const entry of entries) {
      const sectionName = entry.title.trim() || entry.id;
      const sectionControlCount = entry.targets.length;
      const workflowStage = entry.workflowStage?.trim() ?? "";
      const splitReason = entry.splitReason?.trim() ?? "";

      if (
        sectionControlCount < TOOLCRAFT_MIN_CONTROLS_PER_SPLIT_SECTION ||
        sectionControlCount > TOOLCRAFT_MAX_CONTROLS_PER_SECTION
      ) {
        errors.push(
          `Control Section Inventory entity "${entityId}" section ${sectionName} owns ${sectionControlCount} ${sectionControlCount === 1 ? "control" : "controls"}. Every section in a split entity must own between ${TOOLCRAFT_MIN_CONTROLS_PER_SPLIT_SECTION} and ${TOOLCRAFT_MAX_CONTROLS_PER_SECTION} controls.`,
        );
      }

      if (!workflowStage) {
        errors.push(
          `Control Section Inventory entity "${entityId}" section ${sectionName} must declare workflowStage because the entity is split across sections.`,
        );
      } else {
        const normalizedStage = workflowStage.toLowerCase();
        const stageSections = sectionsByStage.get(normalizedStage) ?? [];
        stageSections.push(sectionName);
        sectionsByStage.set(normalizedStage, stageSections);
      }

      if (splitReason.length < TOOLCRAFT_MIN_SPLIT_REASON_LENGTH) {
        errors.push(
          `Control Section Inventory entity "${entityId}" section ${sectionName} must declare splitReason of at least ${TOOLCRAFT_MIN_SPLIT_REASON_LENGTH} characters because the entity is split across sections.`,
        );
      }
    }

    for (const [stage, stageSections] of sectionsByStage) {
      if (stageSections.length > 1) {
        errors.push(
          `Control Section Inventory entity "${entityId}" repeats workflowStage "${stage}" across sections ${stageSections.join(", ")}. Workflow stages must be unique within one entity.`,
        );
      }
    }
  }

  return errors;
}
