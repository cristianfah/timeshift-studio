import * as React from "react";
import { CollectionItemGroups, type ControlChangeMeta } from "@/toolcraft/ui";

import type { ToolcraftControlSchema } from "../../../schema/types";
import {
  getCollectionItemName,
  getCollectionItemType,
} from "../values/controls-panel-values";
import {
  ControlsPanelCollectionItemField,
  ControlsPanelCollectionItemFields,
} from "./controls-panel-collection-item-fields";

export type ControlsPanelCollectionItemsProps = {
  control: ToolcraftControlSchema;
  items: readonly unknown[];
  onItemChange: (
    index: number,
    nextValue: unknown,
    meta?: ControlChangeMeta,
    fieldName?: string,
  ) => void;
  slotPrefix: "collection-actions" | "source-collection";
};

function renderCollectionItemControl({
  control,
  index,
  item,
  onItemChange,
}: {
  control: ToolcraftControlSchema;
  index: number;
  item: unknown;
  onItemChange: ControlsPanelCollectionItemsProps["onItemChange"];
}): React.ReactNode {
  const itemName = getCollectionItemName(control, index);
  const itemControl = control.itemControl ?? { type: "color" as const };

  return (
    <ControlsPanelCollectionItemField
      colorLabelMode="hidden"
      control={itemControl}
      id={`${control.target}:${index}`}
      name={itemName}
      onChange={(nextValue, meta) => onItemChange(index, nextValue, meta)}
      target={control.target}
      value={item}
    />
  );
}

export function ControlsPanelCollectionItems({
  control,
  items,
  onItemChange,
  slotPrefix,
}: ControlsPanelCollectionItemsProps): React.JSX.Element {
  const itemControls = control.itemControls;

  if (itemControls) {
    return (
      <CollectionItemGroups>
        {items.map((item, index) => (
          <ControlsPanelCollectionItemFields
            controls={itemControls}
            id={`${control.target}:${index}`}
            key={index}
            onChange={(nextValue, fieldName, meta) =>
              onItemChange(index, nextValue, meta, fieldName)
            }
            target={control.target}
            value={item}
          />
        ))}
      </CollectionItemGroups>
    );
  }

  const itemType = getCollectionItemType(control);
  const isCompactColorGrid = itemType === "color";

  return (
    <div
      className={
        isCompactColorGrid
          ? "grid min-w-0 grid-cols-2 gap-x-2 gap-y-4"
          : "min-w-0 space-y-4"
      }
      data-slot={`${slotPrefix}-${isCompactColorGrid ? "items-grid" : "items"}`}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {renderCollectionItemControl({
            control,
            index,
            item,
            onItemChange,
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
