import { defineToolcraft } from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";
import { buildChainSections } from "./timeshift/schema/effect-sections";
import {
  buildAppSections,
  buildExportSections,
} from "./timeshift/schema/app-sections";

export const appSchema = defineToolcraft({
  canvas: {
    draggable: true,
    enabled: true,
    // The clip owns the output size: exports are always native resolution.
    sizing: { mode: "intrinsic-media" },
    renderScale: true,
    upload: true,
  },
  identity: appIdentity,
  panels: {
    // One layer per chain position: reorder, visibility, rename, selection.
    layers: true,
    controls: {
      sections: [
        ...buildAppSections(),
        ...buildChainSections(),
        ...buildExportSections(),
      ],
      title: "Timeshift",
    },
    timeline: { defaultDurationSeconds: 8, enabled: true, mode: "keyframes" },
  },
  // Media is deliberately excluded: a decoded clip is far too large to persist.
  persistence: {
    include: ["values", "layers", "panels", "timeline"],
    key: "toolcraft:timeshift-studio:state:v1",
    storage: "localStorage",
    version: 1,
  },
  toolbar: { history: true, radar: true, theme: true, zoom: true },
});
