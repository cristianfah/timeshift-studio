"use client";

import * as React from "react";

import {
  createToolcraftRendererPipelineRuntimeOwner,
  type AnyToolcraftRendererPipelineRegistration,
  type ToolcraftRendererPipelineClient,
} from "../../rendering";
import { ToolcraftPipelineEvidenceBridge } from "./toolcraft-pipeline-evidence";

export const ToolcraftPipelineContext =
  React.createContext<ToolcraftRendererPipelineClient | null>(null);

export function ToolcraftPipelineProvider({
  children,
  registration,
}: {
  children: React.ReactNode;
  registration: AnyToolcraftRendererPipelineRegistration;
}): React.JSX.Element {
  const owner = React.useMemo(
    () => createToolcraftRendererPipelineRuntimeOwner(registration),
    [registration],
  );
  const committedOwner = React.useRef(owner);

  React.useLayoutEffect(() => {
    const previousOwner = committedOwner.current;
    committedOwner.current = owner;
    if (previousOwner !== owner) {
      previousOwner.disposeAutomatically();
    }
  }, [owner]);

  React.useLayoutEffect(() => owner.acquire(), [owner]);

  return (
    <ToolcraftPipelineContext.Provider value={owner.client}>
      {children}
      <ToolcraftPipelineEvidenceBridge client={owner.client} />
    </ToolcraftPipelineContext.Provider>
  );
}
