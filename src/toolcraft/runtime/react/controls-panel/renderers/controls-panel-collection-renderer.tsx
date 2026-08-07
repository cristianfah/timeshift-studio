import * as React from "react";
import { CollectionActions, type ControlChangeMeta } from "@/toolcraft/ui";

import type { ToolcraftControlSchema } from "../../../schema/types";
import { ControlsPanelCollectionItems } from "./controls-panel-collection-items";
import {
  asCollectionItems,
  getCollectionHardMaxItems,
  getCollectionItemBaseLabel,
  getCollectionItemDefaultValue,
  getCollectionItemName,
  getCollectionMinItems,
} from "../values/controls-panel-values";

export type CollectionControlSetValue = (
  target: string,
  value: unknown,
  label?: string,
  meta?: ControlChangeMeta,
) => void;

export type CollectionControlRenderArgs = {
  control: ToolcraftControlSchema;
  name: string;
  setControlValue: CollectionControlSetValue;
  value: unknown;
};

function updateCollectionItem({
  control,
  fieldName,
  index,
  items,
  meta,
  name,
  nextValue,
  setControlValue,
}: {
  control: ToolcraftControlSchema;
  fieldName?: string;
  index: number;
  items: readonly unknown[];
  meta?: ControlChangeMeta;
  name: string;
  nextValue: unknown;
  setControlValue: CollectionControlSetValue;
}): void {
  const nextItems = items.map((item, itemIndex) =>
    itemIndex === index ? nextValue : item,
  );
  const itemName = getCollectionItemName(control, index) || name;
  const historyLabel = fieldName ? `${itemName} ${fieldName}` : itemName;

  setControlValue(control.target, nextItems, historyLabel, meta);
}

function renderCollectionActionsControl({
  control,
  name,
  setControlValue,
  value,
}: CollectionControlRenderArgs): React.JSX.Element {
  const items = asCollectionItems(value, control.defaultValue);
  const minItems = getCollectionMinItems(control);
  const hardMaxItems = getCollectionHardMaxItems(control);
  const canAdd = hardMaxItems === null || items.length < hardMaxItems;
  const canRemove = items.length > minItems;

  function setItems(nextItems: unknown[], label: string): void {
    setControlValue(control.target, nextItems, label);
  }

  return (
    <div className="min-w-0 space-y-3" data-slot="collection-actions-control">
      <CollectionActions
        addLabel={control.addLabel ?? `Add ${getCollectionItemBaseLabel(control)}`}
        canAdd={canAdd}
        canRemove={canRemove}
        name={name}
        onAdd={() => {
          if (canAdd) {
            setItems(
              [...items, getCollectionItemDefaultValue(control)],
              control.addLabel ?? "Add item",
            );
          }
        }}
        onRemove={() => {
          if (canRemove) {
            setItems(
              items.slice(0, -1),
              control.removeLabel ?? "Remove item",
            );
          }
        }}
        removeLabel={
          control.removeLabel ?? `Remove ${getCollectionItemBaseLabel(control)}`
        }
      />
      <ControlsPanelCollectionItems
        control={control}
        items={items}
        onItemChange={(index, nextValue, meta, fieldName) =>
          updateCollectionItem({
            control,
            fieldName,
            index,
            items,
            meta,
            name,
            nextValue,
            setControlValue,
          })
        }
        slotPrefix="collection-actions"
      />
    </div>
  );
}

function renderSourceCollectionControl({
  control,
  name,
  setControlValue,
  value,
}: CollectionControlRenderArgs): React.JSX.Element {
  const items = asCollectionItems(value, control.defaultValue);

  return (
    <div className="min-w-0" data-slot="source-collection-control">
      <ControlsPanelCollectionItems
        control={control}
        items={items}
        onItemChange={(index, nextValue, meta, fieldName) =>
          updateCollectionItem({
            control,
            fieldName,
            index,
            items,
            meta,
            name,
            nextValue,
            setControlValue,
          })
        }
        slotPrefix="source-collection"
      />
    </div>
  );
}

export function renderCollectionControl(
  args: CollectionControlRenderArgs,
): React.JSX.Element {
  switch (args.control.type) {
    case "collectionActions":
      return renderCollectionActionsControl(args);
    case "sourceCollection":
      return renderSourceCollectionControl(args);
    default:
      throw new Error(
        `Unsupported Toolcraft collection control: ${args.control.type}`,
      );
  }
}
