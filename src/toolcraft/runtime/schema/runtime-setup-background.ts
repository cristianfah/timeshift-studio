import type {
  ResolvedToolcraftAppSchema,
  ToolcraftControlSchema,
  ToolcraftControlSectionSchema,
} from "./types";

export const toolcraftOutputBackgroundToggleTarget =
  "export.includeBackground";
const outputBackgroundTargetPattern = /\b(background|backdrop|scene|canvas)\b/i;

export type ToolcraftRuntimeSetupBackgroundControls = Readonly<{
  color: ToolcraftControlSchema;
  include: ToolcraftControlSchema;
}>;

type BackgroundSource = Readonly<{
  colorControlId: string;
  controls: ToolcraftRuntimeSetupBackgroundControls;
  includeControlId: string;
  sectionIndex: number;
}>;

function getControlSearchText(
  controlId: string,
  control: ToolcraftControlSchema,
): string {
  return [controlId, control.target, typeof control.label === "string" ? control.label : ""]
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function findBackgroundSource(
  sections: readonly ToolcraftControlSectionSchema[],
): BackgroundSource | undefined {
  const candidateIndexes = sections
    .map((section, sectionIndex) => ({ section, sectionIndex }))
    .filter(
      ({ section }) =>
        section.id === "runtime.setup" ||
        section.title?.trim().toLowerCase() === "background",
    );

  for (const { section, sectionIndex } of candidateIndexes) {
    const entries = Object.entries(section.controls);
    const includeEntry = entries.find(
      ([, control]) =>
        control.target === toolcraftOutputBackgroundToggleTarget &&
        control.type === "switch",
    );
    const colorEntries = entries.filter(
      ([controlId, control]) =>
        control.type === "color" &&
        outputBackgroundTargetPattern.test(
          getControlSearchText(controlId, control),
        ),
    );

    if (!includeEntry || colorEntries.length !== 1) {
      continue;
    }

    const [includeControlId, include] = includeEntry;
    const [colorControlId, color] = colorEntries[0] as [
      string,
      ToolcraftControlSchema,
    ];

    return {
      colorControlId,
      controls: { color, include },
      includeControlId,
      sectionIndex,
    };
  }

  return undefined;
}

export function getToolcraftRuntimeSetupBackgroundControls(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftRuntimeSetupBackgroundControls | undefined {
  const setupSection = schema.panels.controls?.sections.find(
    (section) => section.id === "runtime.setup",
  );

  return setupSection
    ? findBackgroundSource([setupSection])?.controls
    : undefined;
}

function removeControlsFromSection(
  section: ToolcraftControlSectionSchema,
  removedControlIds: ReadonlySet<string>,
): ToolcraftControlSectionSchema | undefined {
  const controls = Object.fromEntries(
    Object.entries(section.controls).filter(
      ([controlId]) => !removedControlIds.has(controlId),
    ),
  );

  if (Object.keys(controls).length === 0) {
    return undefined;
  }

  const layoutGroups = section.layoutGroups
    ?.map((layoutGroup) => ({
      ...layoutGroup,
      controls: layoutGroup.controls.filter(
        (controlId) => !removedControlIds.has(controlId),
      ),
    }))
    .filter((layoutGroup) => layoutGroup.controls.length === 2);

  return {
    ...section,
    controls,
    ...(layoutGroups && layoutGroups.length > 0
      ? { layoutGroups }
      : { layoutGroups: undefined }),
  };
}

export function extractToolcraftRuntimeSetupBackground({
  sections,
}: {
  sections: readonly ToolcraftControlSectionSchema[];
}): Readonly<{
  background: ToolcraftRuntimeSetupBackgroundControls | undefined;
  sections: readonly ToolcraftControlSectionSchema[];
}> {
  const source = findBackgroundSource(sections);

  if (!source) {
    return { background: undefined, sections };
  }

  const removedControlIds = new Set([
    source.includeControlId,
    source.colorControlId,
  ]);
  const nextSections = sections.flatMap((section, sectionIndex) => {
    if (sectionIndex !== source.sectionIndex) {
      return [section];
    }

    if (section.id === "runtime.setup") {
      return [];
    }

    const nextSection = removeControlsFromSection(section, removedControlIds);
    return nextSection ? [nextSection] : [];
  });

  return {
    background: source.controls,
    sections: nextSections,
  };
}
