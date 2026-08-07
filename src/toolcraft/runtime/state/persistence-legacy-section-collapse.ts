import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftControlSectionSchema,
} from "../schema/types";
import type { ToolcraftInitialState } from "./types";

const legacySectionCollapseStorageVersion = 1;

type LegacySectionCollapseStorage = Pick<Storage, "getItem"> &
  Partial<Pick<Storage, "setItem">>;

export type LegacyToolcraftSectionCollapseMigration = {
  panels: NonNullable<ToolcraftInitialState["panels"]>;
  storageKey: string;
};

function hashStorageKeyPart(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function getLegacyToolcraftSectionCollapseEntryKey(
  section: ResolvedToolcraftControlSectionSchema,
  sectionIndex: number,
): string {
  const targets = Object.entries(section.controls)
    .map(([id, control]) => `${id}:${control.target}`)
    .join("|");

  return `${section.title ?? "section"}:${sectionIndex}:${targets}`;
}

export function getLegacyToolcraftSectionCollapseStorageKey(
  schema: ResolvedToolcraftAppSchema,
): string | null {
  const controlsPanel = schema.panels.controls;

  if (!controlsPanel) {
    return null;
  }

  const appIdentity =
    schema.persistence.storage === "localStorage"
      ? `persistence:${schema.persistence.key}:v${schema.persistence.version}`
      : JSON.stringify({
          sections: controlsPanel.sections.map((section) => ({
            controls: Object.entries(section.controls).map(([id, control]) => ({
              id,
              label: control.label,
              target: control.target,
              type: control.type,
            })),
            title: section.title,
          })),
          title: controlsPanel.title,
        });

  return `toolcraft:ui:controls-panel-sections:${hashStorageKeyPart(appIdentity)}:v${legacySectionCollapseStorageVersion}`;
}

export function readLegacyToolcraftSectionCollapse(
  schema: ResolvedToolcraftAppSchema,
  storage: LegacySectionCollapseStorage | undefined =
    typeof window === "undefined" ? undefined : window.localStorage,
): ToolcraftInitialState["panels"] | undefined {
  return readLegacyToolcraftSectionCollapseMigration(schema, storage)?.panels;
}

export function readLegacyToolcraftSectionCollapseMigration(
  schema: ResolvedToolcraftAppSchema,
  storage: LegacySectionCollapseStorage | undefined =
    typeof window === "undefined" ? undefined : window.localStorage,
): LegacyToolcraftSectionCollapseMigration | undefined {
  const storageKey = getLegacyToolcraftSectionCollapseStorageKey(schema);
  const sections = schema.panels.controls?.sections;

  if (!storage || !storageKey || !sections) {
    return undefined;
  }

  let rawValue: string | null;

  try {
    rawValue = storage.getItem(storageKey);
  } catch {
    return undefined;
  }

  if (!rawValue) {
    return undefined;
  }

  try {
    const payload: unknown = JSON.parse(rawValue);

    if (
      !payload ||
      typeof payload !== "object" ||
      !("version" in payload) ||
      payload.version !== legacySectionCollapseStorageVersion ||
      !("collapsed" in payload) ||
      !Array.isArray(payload.collapsed)
    ) {
      return undefined;
    }

    const knownEntries = new Map(
      sections.map((section, sectionIndex) => [
        getLegacyToolcraftSectionCollapseEntryKey(section, sectionIndex),
        section.id,
      ]),
    );
    const collapsedSections = Object.fromEntries(
      payload.collapsed.flatMap((entry) => {
        if (typeof entry !== "string") {
          return [];
        }

        const sectionId = knownEntries.get(entry);

        return sectionId ? [[sectionId, true] as const] : [];
      }),
    );

    return {
      panels: { controls: { collapsedSections } },
      storageKey,
    };
  } catch {
    return undefined;
  }
}
