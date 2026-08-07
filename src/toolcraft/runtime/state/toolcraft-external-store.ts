import { toolcraftReducer } from "./reducer";
import {
  getToolcraftStoreChanges,
  toolcraftStoreDependenciesChanged,
} from "./toolcraft-external-store-dependencies";
import type { ToolcraftStoreDependency } from "./toolcraft-external-store-dependencies";
import { reduceToolcraftDurableStoreTransition } from "./toolcraft-external-store-transition";
import type {
  ToolcraftCommand,
  ToolcraftPoint,
  ToolcraftState,
} from "./types";

export type ToolcraftTransientCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "canvas.setOffset"
      | "canvas.setViewport"
      | "timeline.setCurrentTime";
  }
>;

export type ToolcraftTransientLane = "playback" | "viewport";

export type ToolcraftExternalStore = {
  commitTransient: (lane?: ToolcraftTransientLane) => void;
  dispatch: (command: ToolcraftCommand) => void;
  dispatchTransient: (command: ToolcraftTransientCommand) => void;
  getCommittedState: () => ToolcraftState;
  getState: () => ToolcraftState;
  subscribe: (listener: () => void) => () => void;
  subscribeDependencies: (
    dependencies: readonly ToolcraftStoreDependency[],
    listener: () => void,
  ) => () => void;
  subscribeSelector: <Selected>(
    selector: (state: ToolcraftState) => Selected,
    listener: () => void,
    equality?: (previous: Selected, next: Selected) => boolean,
  ) => () => void;
};

type ViewportOverlay = {
  offset: ToolcraftPoint | undefined;
  zoom: number | undefined;
};

type SelectorSubscription = {
  equality: (previous: unknown, next: unknown) => boolean;
  listener: () => void;
  selected: unknown;
  selector: (state: ToolcraftState) => unknown;
};

type DependencySubscription = {
  dependencies: readonly ToolcraftStoreDependency[];
  listener: () => void;
};

function pointsEqual(previous: ToolcraftPoint, next: ToolcraftPoint): boolean {
  return Object.is(previous.x, next.x) && Object.is(previous.y, next.y);
}

function notifyPostCommitObserver(listener: () => void): void {
  try {
    listener();
  } catch {
    // Publication follows authoritative state assignment and cannot fail dispatch.
  }
}

function createEffectiveState(
  committedState: ToolcraftState,
  playbackTimeSeconds: number | undefined,
  viewport: ViewportOverlay | undefined,
): ToolcraftState {
  if (playbackTimeSeconds === undefined && !viewport) {
    return committedState;
  }

  return {
    ...committedState,
    ...(viewport
      ? {
          canvas: {
            ...committedState.canvas,
            offset: viewport.offset ?? committedState.canvas.offset,
            zoom: viewport.zoom ?? committedState.canvas.zoom,
          },
        }
      : {}),
    ...(playbackTimeSeconds === undefined
      ? {}
      : {
          timeline: {
            ...committedState.timeline,
            currentTimeSeconds: playbackTimeSeconds,
          },
        }),
  };
}

export function createToolcraftExternalStore(
  initialState: ToolcraftState,
): ToolcraftExternalStore {
  let committedState = initialState;
  let effectiveState = initialState;
  let playbackTimeSeconds: number | undefined;
  let viewport: ViewportOverlay | undefined;
  const dependencySubscriptions = new Set<DependencySubscription>();
  const listeners = new Set<() => void>();
  const selectorSubscriptions = new Set<SelectorSubscription>();

  const emit = (previousEffectiveState: ToolcraftState): void => {
    const changes = getToolcraftStoreChanges(
      previousEffectiveState,
      effectiveState,
    );
    const dependencyListeners: Array<() => void> = [];
    const selectedListeners: Array<() => void> = [];

    for (const subscription of dependencySubscriptions) {
      try {
        if (
          toolcraftStoreDependenciesChanged(subscription.dependencies, changes)
        ) {
          dependencyListeners.push(subscription.listener);
        }
      } catch {
        // Keep each subscription's post-commit publication independent.
      }
    }

    for (const subscription of selectorSubscriptions) {
      try {
        const selected = subscription.selector(effectiveState);

        if (subscription.equality(subscription.selected, selected)) {
          continue;
        }

        subscription.selected = selected;
        selectedListeners.push(subscription.listener);
      } catch {
        // A selector or equality failure must not block later observers.
      }
    }

    for (const listener of [
      ...listeners,
      ...dependencyListeners,
      ...selectedListeners,
    ]) {
      notifyPostCommitObserver(listener);
    }
  };

  const normalizeOverlays = (): void => {
    if (
      playbackTimeSeconds !== undefined &&
      Object.is(
        playbackTimeSeconds,
        committedState.timeline.currentTimeSeconds,
      )
    ) {
      playbackTimeSeconds = undefined;
    }

    if (!viewport) {
      return;
    }

    const offset =
      viewport.offset &&
      !pointsEqual(viewport.offset, committedState.canvas.offset)
        ? viewport.offset
        : undefined;
    const zoom =
      viewport.zoom !== undefined &&
      !Object.is(viewport.zoom, committedState.canvas.zoom)
        ? viewport.zoom
        : undefined;

    viewport = offset || zoom !== undefined ? { offset, zoom } : undefined;
  };

  const materializeTransientLane = (
    lane: ToolcraftTransientLane,
  ): boolean => {
    if (lane === "playback") {
      if (playbackTimeSeconds === undefined) {
        return false;
      }

      committedState = toolcraftReducer(committedState, {
        currentTimeSeconds: playbackTimeSeconds,
        type: "timeline.setCurrentTime",
      });
      playbackTimeSeconds = undefined;
      return true;
    }

    if (!viewport) {
      return false;
    }

    committedState =
      viewport.zoom === undefined
        ? toolcraftReducer(committedState, {
            offset: viewport.offset ?? committedState.canvas.offset,
            type: "canvas.setOffset",
          })
        : toolcraftReducer(committedState, {
            offset: viewport.offset ?? committedState.canvas.offset,
            type: "canvas.setViewport",
            zoom: viewport.zoom,
          });
    viewport = undefined;
    return true;
  };

  const dispatch = (command: ToolcraftCommand): void => {
    const previousEffectiveState = effectiveState;

    if (playbackTimeSeconds === undefined && !viewport) {
      const nextCommittedState = toolcraftReducer(committedState, command);

      if (nextCommittedState === committedState) {
        return;
      }

      committedState = nextCommittedState;
      effectiveState = nextCommittedState;
      emit(previousEffectiveState);
      return;
    }

    const transition = reduceToolcraftDurableStoreTransition(
      committedState,
      effectiveState,
      command,
    );

    if (!transition.changed) {
      return;
    }

    committedState = transition.state;

    if (transition.playbackTouched) {
      playbackTimeSeconds = undefined;
    }

    if (viewport && (transition.offsetTouched || transition.zoomTouched)) {
      const offset = transition.offsetTouched ? undefined : viewport.offset;
      const zoom = transition.zoomTouched ? undefined : viewport.zoom;

      viewport = offset || zoom !== undefined ? { offset, zoom } : undefined;
    }

    normalizeOverlays();
    effectiveState = createEffectiveState(
      committedState,
      playbackTimeSeconds,
      viewport,
    );
    emit(previousEffectiveState);
  };

  const dispatchTransient = (command: ToolcraftTransientCommand): void => {
    const previousEffectiveState = effectiveState;
    const reducedState = toolcraftReducer(effectiveState, command);

    switch (command.type) {
      case "timeline.setCurrentTime": {
        const nextTimeSeconds = reducedState.timeline.currentTimeSeconds;

        if (
          Object.is(
            nextTimeSeconds,
            effectiveState.timeline.currentTimeSeconds,
          )
        ) {
          return;
        }

        playbackTimeSeconds = nextTimeSeconds;
        break;
      }

      case "canvas.setOffset": {
        const nextOffset = reducedState.canvas.offset;

        if (pointsEqual(nextOffset, effectiveState.canvas.offset)) {
          return;
        }

        viewport = {
          offset: nextOffset,
          zoom: viewport?.zoom,
        };
        break;
      }

      case "canvas.setViewport": {
        const nextOffset = reducedState.canvas.offset;
        const nextZoom = reducedState.canvas.zoom;

        if (
          pointsEqual(nextOffset, effectiveState.canvas.offset) &&
          Object.is(nextZoom, effectiveState.canvas.zoom)
        ) {
          return;
        }

        viewport = { offset: nextOffset, zoom: nextZoom };
        break;
      }
    }

    normalizeOverlays();
    effectiveState = createEffectiveState(
      committedState,
      playbackTimeSeconds,
      viewport,
    );
    emit(previousEffectiveState);
  };

  const commitTransient = (lane?: ToolcraftTransientLane): void => {
    let didCommit: boolean;

    if (lane) {
      didCommit = materializeTransientLane(lane);
    } else {
      const didCommitPlayback = materializeTransientLane("playback");
      const didCommitViewport = materializeTransientLane("viewport");

      didCommit = didCommitPlayback || didCommitViewport;
    }

    if (!didCommit) {
      return;
    }

    // The effective values did not change, so retain the cached snapshot identity.
    emit(effectiveState);
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  const subscribeDependencies: ToolcraftExternalStore["subscribeDependencies"] = (
    dependencies,
    listener,
  ) => {
    const subscription = { dependencies, listener };

    dependencySubscriptions.add(subscription);

    return () => {
      dependencySubscriptions.delete(subscription);
    };
  };

  const subscribeSelector: ToolcraftExternalStore["subscribeSelector"] = (
    selector,
    listener,
    equality = Object.is,
  ) => {
    const subscription: SelectorSubscription = {
      equality: equality as (previous: unknown, next: unknown) => boolean,
      listener,
      selected: selector(effectiveState),
      selector: selector as (state: ToolcraftState) => unknown,
    };

    selectorSubscriptions.add(subscription);

    return () => {
      selectorSubscriptions.delete(subscription);
    };
  };

  return {
    commitTransient,
    dispatch,
    dispatchTransient,
    getCommittedState: () => committedState,
    getState: () => effectiveState,
    subscribe,
    subscribeDependencies,
    subscribeSelector,
  };
}
