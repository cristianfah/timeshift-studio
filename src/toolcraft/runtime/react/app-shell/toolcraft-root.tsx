"use client";

import * as React from "react";

import type { AnyToolcraftRendererPipelineRegistration } from "../../rendering";
import type {
  ResolvedToolcraftAppSchema,
} from "../../schema/types";
import { createToolcraftState } from "../../state/create-template-state";
import { mergeToolcraftInitialState } from "../../state/persistence";
import { createToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type {
  ToolcraftCommand,
  ToolcraftInitialState,
  ToolcraftState,
} from "../../state/types";
import { ToolcraftThemeProvider } from "./theme-runtime";
import { ToolcraftPipelineProvider } from "./toolcraft-pipeline-context";
import { ToolcraftSourceAssetProvider } from "./toolcraft-source-asset-context";
import { ToolcraftStoreContext } from "./toolcraft-store-context";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";
import {
  resolveToolcraftModelPresentationMode,
  ToolcraftModelPresentationModeContext,
} from "../model-rendering/model-presentation-mode";
import {
  ToolcraftPersistenceStatusProvider,
  useToolcraftPersistence,
} from "./use-toolcraft-persistence";
import {
  collectToolcraftBinaryMediaHydrationJobs,
} from "../../source-assets/binary-media-hydration";
import { readToolcraftPersistenceBootstrap } from "./toolcraft-persistence-bootstrap";

export type ToolcraftContextValue = {
  dispatch: React.Dispatch<ToolcraftCommand>;
  state: ToolcraftState;
};

export const ToolcraftContext = React.createContext<ToolcraftContextValue | null>(null);

export type ToolcraftRootProps = {
  children: React.ReactNode;
  initialState?: ToolcraftInitialState;
  modelPresentation?: ToolcraftModelPresentationMode;
  rendererPipelineRegistration?: AnyToolcraftRendererPipelineRegistration;
  schema: ResolvedToolcraftAppSchema;
};

const nativeTextEditingInputTypes = new Set([
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);
function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    closest?: (selector: string) => Element | null;
    isContentEditable?: boolean;
    tagName?: string;
    type?: string;
  };

  if (candidate.isContentEditable) {
    return true;
  }

  if (
    typeof candidate.closest === "function" &&
    candidate.closest("[contenteditable='true']")
  ) {
    return true;
  }

  const tagName = candidate.tagName?.toLowerCase();

  if (tagName === "textarea" || tagName === "select") {
    return true;
  }

  return (
    tagName === "input" &&
    nativeTextEditingInputTypes.has(candidate.type?.toLowerCase() ?? "text")
  );
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "z"
  );
}

function isRedoShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();

  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    ((event.shiftKey && key === "z") || (!event.metaKey && event.ctrlKey && key === "y"))
  );
}

export function ToolcraftRoot({
  children,
  initialState,
  modelPresentation,
  rendererPipelineRegistration,
  schema,
}: ToolcraftRootProps) {
  const [persistenceBootstrap] = React.useState(() =>
    readToolcraftPersistenceBootstrap(schema),
  );
  const [store] = React.useState(() =>
    createToolcraftExternalStore(
      createToolcraftState(
        schema,
        mergeToolcraftInitialState(persistenceBootstrap.initialState, initialState),
      ),
    ),
  );
  const [binaryMediaHydrationJobs] = React.useState(() => [
    ...persistenceBootstrap.mediaHydrationJobs,
    ...collectToolcraftBinaryMediaHydrationJobs(initialState?.mediaAssets),
  ]);
  const state = React.useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const dispatch: React.Dispatch<ToolcraftCommand> = store.dispatch;
  const persistenceStatus = useToolcraftPersistence(schema, store, {
    blockedReason: persistenceBootstrap.blockedReason,
    cleanupStorageKeys: persistenceBootstrap.cleanupStorageKeys,
    mediaMigrationResourceKeys:
      persistenceBootstrap.mediaMigrationResourceKeys,
  });
  const value = React.useMemo(() => ({ dispatch, state }), [dispatch, state]);
  const resolvedModelPresentation = React.useMemo(
    () => resolveToolcraftModelPresentationMode(schema, modelPresentation),
    [modelPresentation, schema],
  );

  React.useEffect(() => {
    if (!schema.toolbar.history || typeof document === "undefined") {
      return undefined;
    }

    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (isUndoShortcut(event)) {
        event.preventDefault();
        dispatch({ type: "history.undo" });
        return;
      }

      if (isRedoShortcut(event)) {
        event.preventDefault();
        dispatch({ type: "history.redo" });
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [dispatch, schema.toolbar.history]);

  const content = (
    <ToolcraftPersistenceStatusProvider status={persistenceStatus}>
      <ToolcraftModelPresentationModeContext.Provider
        value={resolvedModelPresentation}
      >
        <ToolcraftThemeProvider>
          <ToolcraftStoreContext.Provider value={store}>
            <ToolcraftSourceAssetProvider
              binaryMediaHydrationJobs={binaryMediaHydrationJobs}
              store={store}
            >
              <ToolcraftContext.Provider value={value}>
                {children}
              </ToolcraftContext.Provider>
            </ToolcraftSourceAssetProvider>
          </ToolcraftStoreContext.Provider>
        </ToolcraftThemeProvider>
      </ToolcraftModelPresentationModeContext.Provider>
    </ToolcraftPersistenceStatusProvider>
  );

  return rendererPipelineRegistration ? (
    <ToolcraftPipelineProvider registration={rendererPipelineRegistration}>
      {content}
    </ToolcraftPipelineProvider>
  ) : (
    content
  );
}
