import { defineToolcraft } from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    upload: true,
  },
  identity: appIdentity,
  panels: {
    controls: {
      sections: [],
      title: "Controls",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    zoom: true,
  },
});
