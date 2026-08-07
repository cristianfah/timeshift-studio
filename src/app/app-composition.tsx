import * as React from "react";

import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { createExportRenderer } from "./timeshift/react/export-renderer";
import { TimeshiftCanvas } from "./timeshift/react/timeshift-canvas";
import { clipUrlRef } from "./timeshift/react/clip-url";
import { createPanelActionHandler } from "./timeshift/react/panel-actions";
import { openEffectBrowser } from "./timeshift/react/effect-browser";
import { timeshiftControlRenderers } from "./timeshift/react/control-renderers";

export const appComposition: ToolcraftAppComposition = {
  canvasContent: <TimeshiftCanvas />,
  controlRenderers: timeshiftControlRenderers,
  exportRenderer: createExportRenderer(() => clipUrlRef.current),
  onPanelAction: createPanelActionHandler({
    exportPng: async () => {
      // The runtime owns image encoding through `exportRenderer`.
    },
    exportVideo: async () => {
      // The runtime owns video encoding through `exportRenderer`.
    },
    openBrowser: openEffectBrowser,
  }),
  // The WebGL preview replaces the generic media preview entirely.
  renderDefaultCanvasMedia: false,
  schema: appSchema,
};
