// Custom control renderers.
//
// Only surfaces that no built-in can represent live here; each one records its
// built-in fit check in its own module header.

import type { ToolcraftControlRendererMap } from "@/toolcraft/runtime/react";

import { EffectBrowserControl } from "./effect-browser";

export const timeshiftControlRenderers: ToolcraftControlRendererMap = {
  effectBrowser: EffectBrowserControl,
};
