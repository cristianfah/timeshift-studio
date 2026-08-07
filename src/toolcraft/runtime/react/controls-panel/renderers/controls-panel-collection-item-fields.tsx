import * as React from "react";
import type { ControlChangeMeta } from "@/toolcraft/ui";

import type {
  ToolcraftCollectionItemControlSchema,
  ToolcraftCollectionItemControlsSchema,
  ToolcraftControlSchema,
} from "../../../schema/types";
import { renderBasicControl } from "./controls-panel-basic-renderers";
import { renderCompoundControl } from "./controls-panel-compound-renderers";

type ItemFieldChange = (nextValue: unknown, meta?: ControlChangeMeta) => void;

function renderWithoutKeyframeAction({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return children;
}

function getFieldName(
  id: string,
  control: ToolcraftCollectionItemControlSchema,
): string {
  if (typeof control.label === "string") {
    return control.label;
  }

  return id
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[-_.]+/gu, " ")
    .replace(/^./u, (character) => character.toUpperCase());
}

function asItemRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
}

export function ControlsPanelCollectionItemField({
  colorLabelMode,
  control,
  id,
  name,
  onChange,
  target,
  value,
}: {
  colorLabelMode: "authored" | "hidden";
  control: ToolcraftCollectionItemControlSchema;
  id: string;
  name: string;
  onChange: ItemFieldChange;
  target: string;
  value: unknown;
}): React.JSX.Element {
  const fieldSchema: ToolcraftControlSchema = { ...control, target };
  const shouldShowColorFieldLabel = () =>
    colorLabelMode === "authored" && control.label !== false;
  const rendered =
    renderBasicControl({
      commit: onChange,
      control: fieldSchema,
      id,
      name,
      usesHeaderKeyframeAction: false,
      value,
      vectorPadShape: "compact",
      withKeyframeLabelAction: renderWithoutKeyframeAction,
    }) ??
    renderCompoundControl({
      commit: onChange,
      commitWithLabel: () => onChange,
      control: fieldSchema,
      id,
      name,
      sectionHasOnlyColorFields: false,
      shouldShowColorFieldLabel,
      usesHeaderKeyframeAction: false,
      value,
      withKeyframeLabelAction: renderWithoutKeyframeAction,
    });

  if (rendered == null) {
    throw new Error(
      `Unsupported Toolcraft collection item field: ${control.type}`,
    );
  }

  return <>{rendered}</>;
}

export function ControlsPanelCollectionItemFields({
  controls,
  id,
  onChange,
  target,
  value,
}: {
  controls: ToolcraftCollectionItemControlsSchema;
  id: string;
  onChange: (
    nextValue: Readonly<Record<string, unknown>>,
    fieldName: string,
    meta?: ControlChangeMeta,
  ) => void;
  target: string;
  value: unknown;
}): React.JSX.Element {
  const record = asItemRecord(value);

  return (
    <div className="min-w-0 space-y-4" data-slot="collection-item-fields">
      {Object.entries(controls).map(([fieldId, field]) => {
        const fieldName = getFieldName(fieldId, field);

        return (
          <ControlsPanelCollectionItemField
            colorLabelMode="authored"
            control={field}
            id={`${id}:${fieldId}`}
            key={fieldId}
            name={fieldName}
            onChange={(nextValue, meta) =>
              onChange({ ...record, [fieldId]: nextValue }, fieldName, meta)
            }
            target={target}
            value={record[fieldId] ?? field.defaultValue}
          />
        );
      })}
    </div>
  );
}
