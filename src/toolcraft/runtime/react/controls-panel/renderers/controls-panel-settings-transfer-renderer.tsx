"use client";

import * as React from "react";
import { PanelActions } from "@/toolcraft/ui";

import type { ToolcraftCommand, ToolcraftState } from "../../../state/types";
import {
  downloadToolcraftSettings,
  importToolcraftSettings,
} from "../../app-shell/settings-transfer";

export type SettingsTransferControlRenderArgs = {
  dispatch: React.Dispatch<ToolcraftCommand>;
  getState: () => ToolcraftState;
  id: string;
};

export function renderSettingsTransferControl({
  dispatch,
  getState,
  id,
}: SettingsTransferControlRenderArgs): React.ReactNode {
  return (
    <PanelActions
      actions={[
        {
          icon: "upload-simple",
          name: "Export Settings",
          onClick: () => downloadToolcraftSettings(getState()),
          variant: "outline",
        },
        {
          icon: "download-simple",
          name: "Import Settings",
          onClick: () => {
            void importToolcraftSettings({ dispatch, state: getState() });
          },
          variant: "outline",
        },
      ]}
      key={id}
      columns={2}
    />
  );
}
