// Derives the render chain from runtime state.
//
// The layers panel owns chain composition (order, visibility, selection) and
// each layer is bound to one of the CHAIN_SLOTS parameter slots. `chain.order`
// keeps that binding: a JSON array of slot indexes in chain order, parallel to
// the layer list. Reordering layers reorders the array, so a slot's parameters,
// keyframes and modulators travel with it.

import * as React from "react";

import {
  useToolcraftDispatch,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";
import type { ToolcraftLayer, ToolcraftState } from "@/toolcraft/runtime";

import {
  CHAIN_SLOTS,
  EMPTY_SLOT,
  slotEnabledTarget,
  slotTypeTarget,
} from "../targets";
import type { ChainItem } from "../types";

export const CHAIN_ORDER_TARGET = "chain.order";

export type ChainEntry = {
  enabled: boolean;
  layerId: string;
  slot: number;
  type: string;
};

function parseOrder(value: unknown): number[] {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((n) => (typeof n === "number" ? n : Number.NaN))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < CHAIN_SLOTS);
  } catch {
    return [];
  }
}

export function serializeOrder(order: readonly number[]): string {
  return JSON.stringify([...order]);
}

/** First slot not present in `order`, or null when the chain is full. */
export function firstFreeSlot(order: readonly number[]): number | null {
  for (let slot = 0; slot < CHAIN_SLOTS; slot += 1) {
    if (!order.includes(slot)) {
      return slot;
    }
  }

  return null;
}

const selectLayers = (state: ToolcraftState): readonly ToolcraftLayer[] =>
  state.layers;
const selectValues = (state: ToolcraftState): Record<string, unknown> =>
  state.values;

/**
 * The chain in render order. Layers are the visible truth for order and
 * visibility; `chain.order` maps each position to its parameter slot.
 */
export function useChain(): readonly ChainEntry[] {
  const layers = useToolcraftSelector(selectLayers);
  const values = useToolcraftSelector(selectValues);

  return React.useMemo(() => {
    const order = parseOrder(values[CHAIN_ORDER_TARGET]);
    const chainLayers = layers.filter((layer) => layer.kind !== "group");

    return chainLayers.flatMap((layer, index) => {
      const slot = order[index];

      if (slot === undefined) {
        return [];
      }

      const type = values[slotTypeTarget(slot)];

      if (typeof type !== "string" || type === EMPTY_SLOT) {
        return [];
      }

      return [
        {
          enabled: layer.visible && values[slotEnabledTarget(slot)] !== false,
          layerId: layer.id,
          slot,
          type,
        },
      ];
    });
  }, [layers, values]);
}

/** Chain entries as engine input, carrying per-instance side data. */
export function useChainItems(
  chain: readonly ChainEntry[],
  sideData: React.MutableRefObject<Map<string, ChainItem>>,
): readonly ChainItem[] {
  return React.useMemo(() => {
    const items: ChainItem[] = [];

    for (const entry of chain) {
      const id = `slot-${entry.slot}`;
      let item = sideData.current.get(id);

      if (!item || item.type !== entry.type) {
        item = { enabled: entry.enabled, id, type: entry.type };
        sideData.current.set(id, item);
      }

      item.enabled = entry.enabled;
      items.push(item);
    }

    return items;
  }, [chain, sideData]);
}

/** Currently selected chain entry, or null. */
export function useSelectedChainEntry(
  chain: readonly ChainEntry[],
): ChainEntry | null {
  const selectedLayerId = useToolcraftSelector(
    (state: ToolcraftState) => state.selectedLayerId,
  );

  return (
    chain.find((entry) => entry.layerId === selectedLayerId) ?? chain[0] ?? null
  );
}

/**
 * Keeps `fx.selection` in sync with the selected chain entry so exactly one
 * effect's sections are visible in the controls panel.
 */
export function useSelectionSync(selected: ChainEntry | null): void {
  const dispatch = useToolcraftDispatch();
  const current = useToolcraftSelector(
    (state: ToolcraftState) => state.values["fx.selection"],
  );
  const next = selected ? `${selected.slot}:${selected.type}` : "";

  React.useEffect(() => {
    if (current !== next) {
      dispatch({
        history: "skip",
        target: "fx.selection",
        type: "controls.setValue",
        value: next,
      });
    }
  }, [current, dispatch, next]);
}
