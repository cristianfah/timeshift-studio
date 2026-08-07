// Effect browser — the "pick an effect" surface, rendered as a custom control
// inside the chain section.
//
// Built-in fit check: `imagePicker` only shows static images, `select` and
// `segmented` show no preview at all, and `collectionActions` edits a list
// rather than choosing what to append. None can present ten moving effects
// over the user's own clip, which is the whole point of this surface.

import * as React from "react";

import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";
import { useToolcraftDispatch, useToolcraftSelector } from "@/toolcraft/runtime/react";
import type { ToolcraftState } from "@/toolcraft/runtime";

import { registry } from "../effects/registry";
import {
  CHAIN_SLOTS,
  paramTarget,
  slotEnabledTarget,
  slotTypeTarget,
} from "../targets";
import { CHAIN_ORDER_TARGET, firstFreeSlot, serializeOrder } from "./use-chain";

let openBrowserSignal: (() => void) | null = null;

export function openEffectBrowser(): void {
  openBrowserSignal?.();
}

const selectValues = (state: ToolcraftState): Record<string, unknown> =>
  state.values;
const selectLayers = (state: ToolcraftState) => state.layers;

function readOrder(values: Record<string, unknown>): number[] {
  const raw = values[CHAIN_ORDER_TARGET];

  if (typeof raw !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (n): n is number =>
            typeof n === "number" && Number.isInteger(n) && n >= 0 && n < CHAIN_SLOTS,
        )
      : [];
  } catch {
    return [];
  }
}

export function EffectBrowserControl(
  _props: ToolcraftCustomControlRendererProps,
): React.JSX.Element {
  const dispatch = useToolcraftDispatch();
  const values = useToolcraftSelector(selectValues);
  const layers = useToolcraftSelector(selectLayers);
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    openBrowserSignal = () => setOpen(true);

    return () => {
      openBrowserSignal = null;
    };
  }, []);

  const order = readOrder(values);
  const full = order.length >= CHAIN_SLOTS;

  const addEffect = React.useCallback(
    (type: string, preset?: string) => {
      const currentOrder = readOrder(values);
      const slot = firstFreeSlot(currentOrder);
      const mod = registry[type];

      if (slot === null || !mod) {
        return;
      }

      const group = `add-${type}-${slot}`;

      dispatch({
        historyGroup: group,
        target: slotTypeTarget(slot),
        type: "controls.setValue",
        value: type,
      });
      dispatch({
        historyGroup: group,
        target: slotEnabledTarget(slot),
        type: "controls.setValue",
        value: true,
      });

      for (const def of mod.params) {
        dispatch({
          historyGroup: group,
          target: paramTarget(slot, type, def.key),
          type: "controls.setValue",
          value: def.def,
        });
      }

      const overrides = preset ? mod.presets?.[preset] : undefined;

      for (const [key, value] of Object.entries(overrides ?? {})) {
        dispatch({
          historyGroup: group,
          target: paramTarget(slot, type, key),
          type: "controls.setValue",
          value,
        });
      }

      dispatch({
        historyGroup: group,
        target: CHAIN_ORDER_TARGET,
        type: "controls.setValue",
        value: serializeOrder([...currentOrder, slot]),
      });
      dispatch({
        layer: { name: mod.label, visible: true },
        type: "layers.add",
      });
    },
    [dispatch, values],
  );

  const entries = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();

    return Object.values(registry).filter(
      (mod) =>
        needle.length === 0 ||
        mod.label.toLowerCase().includes(needle) ||
        mod.desc.toLowerCase().includes(needle),
    );
  }, [filter]);

  if (!open) {
    return (
      <button
        className="w-full rounded-md border border-[color:var(--border)] px-3 py-2 text-sm"
        onClick={() => setOpen(true)}
        type="button"
      >
        Explorar efectos
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-sm"
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filtrar efectos"
          value={filter}
        />
        <button
          className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs"
          onClick={() => setOpen(false)}
          type="button"
        >
          Cerrar
        </button>
      </div>

      {full ? (
        <p className="text-xs opacity-70">
          La cadena está llena ({CHAIN_SLOTS} efectos). Quita uno para añadir otro.
        </p>
      ) : null}

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {entries.map((mod) => (
          <div
            className="rounded-md border border-[color:var(--border)] p-2"
            key={mod.type}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{mod.label}</span>
              <button
                className="shrink-0 rounded-md border border-[color:var(--border)] px-2 py-0.5 text-xs disabled:opacity-40"
                disabled={full}
                onClick={() => addEffect(mod.type)}
                type="button"
              >
                Añadir
              </button>
            </div>
            <p className="mt-1 text-xs opacity-70">{mod.desc}</p>
            {Object.keys(mod.presets ?? {}).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.keys(mod.presets ?? {}).map((preset) => (
                  <button
                    className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide disabled:opacity-40"
                    disabled={full}
                    key={preset}
                    onClick={() => addEffect(mod.type, preset)}
                    type="button"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-xs opacity-60">
        {layers.filter((layer) => layer.kind !== "group").length} de {CHAIN_SLOTS} posiciones usadas
      </p>
    </div>
  );
}
