// Sticky product actions plus the local section commands (looks, chain,
// clipboard). Everything routes through runtime commands so history, reset and
// settings transfer keep working.

import type {
  ToolcraftCommand,
  ToolcraftState,
} from "@/toolcraft/runtime";
import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { LOOKS } from "../effects/looks";
import { registry } from "../effects/registry";
import { buildRenderCommand } from "../render-command";
import {
  CHAIN_SLOTS,
  slotEnabledTarget,
  slotTypeTarget,
  paramTarget,
  targets,
} from "../targets";
import { CHAIN_ORDER_TARGET, serializeOrder } from "./use-chain";

type Dispatch = (command: ToolcraftCommand) => void;

function setValue(
  dispatch: Dispatch,
  target: string,
  value: unknown,
  group?: string,
): void {
  dispatch({
    ...(group ? { historyGroup: group } : {}),
    target,
    type: "controls.setValue",
    value,
  });
}

/** Replaces the chain with a look: fresh layers, fresh slots, fresh values. */
function applyLook(
  lookName: string,
  state: ToolcraftState,
  dispatch: Dispatch,
): void {
  const look = LOOKS[lookName];

  if (!look) {
    return;
  }

  const group = `look-${lookName}`;

  // Drop the existing chain layers.
  for (const layer of state.layers.filter((l) => l.kind !== "group")) {
    dispatch({ layerId: layer.id, type: "layers.delete" });
  }

  const order: number[] = [];

  look.steps.forEach((step, index) => {
    const slot = index;
    const mod = registry[step.type];

    if (!mod || slot >= CHAIN_SLOTS) {
      return;
    }

    order.push(slot);
    setValue(dispatch, slotTypeTarget(slot), step.type, group);
    setValue(dispatch, slotEnabledTarget(slot), true, group);

    // Defaults first, then the look's overrides.
    for (const def of mod.params) {
      setValue(dispatch, paramTarget(slot, step.type, def.key), def.def, group);
    }

    for (const [key, value] of Object.entries(step.values)) {
      setValue(dispatch, paramTarget(slot, step.type, key), value, group);
    }

    dispatch({
      layer: { name: `${mod.label}`, visible: true },
      type: "layers.add",
    });
  });

  setValue(dispatch, CHAIN_ORDER_TARGET, serializeOrder(order), group);
}

function clearChain(state: ToolcraftState, dispatch: Dispatch): void {
  for (const layer of state.layers.filter((l) => l.kind !== "group")) {
    dispatch({ layerId: layer.id, type: "layers.delete" });
  }

  setValue(dispatch, CHAIN_ORDER_TARGET, serializeOrder([]), "chain-clear");
}

async function copyRenderCommand(state: ToolcraftState): Promise<void> {
  const command = buildRenderCommand(state);

  try {
    await navigator.clipboard.writeText(command);
  } catch {
    // Clipboard permission denied; the command stays visible in the panel.
  }
}

export type TimeshiftActionHooks = {
  openBrowser: () => void;
  exportPng: (ctx: ToolcraftPanelActionContext) => Promise<void>;
  exportVideo: (ctx: ToolcraftPanelActionContext) => Promise<void>;
};

export function createPanelActionHandler(hooks: TimeshiftActionHooks) {
  return async (ctx: ToolcraftPanelActionContext): Promise<void> => {
    const value = ctx.action.value;
    const dispatch: Dispatch = ctx.dispatch;

    if (value in LOOKS) {
      applyLook(value, ctx.state, dispatch);
      return;
    }

    switch (value) {
      case "browse":
        hooks.openBrowser();
        return;
      case "clear":
        clearChain(ctx.state, dispatch);
        return;
      case "copy-command":
        await copyRenderCommand(ctx.state);
        return;
      case "export-png":
        await hooks.exportPng(ctx);
        return;
      case "export-video":
        await hooks.exportVideo(ctx);
        return;
      default:
        return;
    }
  };
}

export { targets };
