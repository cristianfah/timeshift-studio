"use client";

import * as React from "react";

import { clampToolcraftCanvasZoom } from "../../state/canvas-zoom";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftPoint } from "../../state/types";

type CanvasDragState = {
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

const wheelZoomSensitivity = 0.12;
const wheelPinchZoomSensitivity = 0.5;
const wheelCommitIdleMs = 120;

function isEventTargetInsideElement(
  target: EventTarget | null,
  element: HTMLElement,
): boolean {
  return target instanceof Node && element.contains(target);
}

function getNextWheelZoom(
  currentZoom: number,
  event: Pick<WheelEvent, "ctrlKey" | "deltaY">,
): number {
  const sensitivity = event.ctrlKey
    ? wheelPinchZoomSensitivity
    : wheelZoomSensitivity;
  const rawDelta = -event.deltaY * sensitivity;
  const zoomDelta = Math.trunc(rawDelta) || Math.sign(rawDelta);

  return clampToolcraftCanvasZoom(currentZoom + zoomDelta);
}

function getZoomedCanvasOffset({
  clientX,
  clientY,
  currentZoom,
  nextZoom,
  offset,
  viewportElement,
}: {
  clientX: number;
  clientY: number;
  currentZoom: number;
  nextZoom: number;
  offset: ToolcraftPoint;
  viewportElement: HTMLElement;
}): ToolcraftPoint {
  const rect = viewportElement.getBoundingClientRect();
  const currentScale = currentZoom / 100;
  const nextScale = nextZoom / 100;
  const pointerX = clientX - rect.left - rect.width / 2;
  const pointerY = clientY - rect.top - rect.height / 2;
  const worldX = (pointerX - offset.x) / currentScale;
  const worldY = (pointerY - offset.y) / currentScale;

  return {
    x: pointerX - worldX * nextScale,
    y: pointerY - worldY * nextScale,
  };
}

export function useCanvasViewportInteractions({
  draggable,
  store,
}: {
  draggable: boolean;
  store: ToolcraftExternalStore;
}): {
  handlePointerDown: React.PointerEventHandler<HTMLDivElement>;
  handlePointerMove: React.PointerEventHandler<HTMLDivElement>;
  handlePointerUp: React.PointerEventHandler<HTMLDivElement>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
} {
  const dragRef = React.useRef<CanvasDragState | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const wheelCommitTimerRef = React.useRef<number | undefined>(undefined);
  const commitPendingWheel = React.useCallback((): void => {
    if (wheelCommitTimerRef.current === undefined) {
      return;
    }

    window.clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = undefined;
    store.commitTransient("viewport");
  }, [store]);
  const scheduleWheelCommit = React.useCallback((): void => {
    if (wheelCommitTimerRef.current !== undefined) {
      window.clearTimeout(wheelCommitTimerRef.current);
    }

    wheelCommitTimerRef.current = window.setTimeout(() => {
      wheelCommitTimerRef.current = undefined;
      store.commitTransient("viewport");
    }, wheelCommitIdleMs);
  }, [store]);

  React.useEffect(() => {
    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return undefined;
    }

    const workspaceElement =
      viewportElement.closest<HTMLElement>(
        '[data-slot="toolcraft-runtime-app"]',
      ) ?? viewportElement;
    const listenerOptions: AddEventListenerOptions = { capture: true, passive: false };
    const handleWheel = (event: WheelEvent): void => {
      const targetIsInsideCanvas = isEventTargetInsideElement(
        event.target,
        viewportElement,
      );
      if (!targetIsInsideCanvas) {
        if (event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
        }

        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const { offset, zoom } = store.getState().canvas;

      if (!event.ctrlKey) {
        store.dispatchTransient({
          offset: {
            x: offset.x - event.deltaX,
            y: offset.y - event.deltaY,
          },
          type: "canvas.setOffset",
        });
        scheduleWheelCommit();
        return;
      }

      const nextZoom = getNextWheelZoom(zoom, event);
      scheduleWheelCommit();

      if (nextZoom === zoom) {
        return;
      }

      store.dispatchTransient({
        offset: getZoomedCanvasOffset({
          clientX: event.clientX,
          clientY: event.clientY,
          currentZoom: zoom,
          nextZoom,
          offset,
          viewportElement,
        }),
        type: "canvas.setViewport",
        zoom: nextZoom,
      });
    };

    workspaceElement.addEventListener("wheel", handleWheel, listenerOptions);

    return () => {
      workspaceElement.removeEventListener(
        "wheel",
        handleWheel,
        listenerOptions,
      );

      const hasPendingWheel = wheelCommitTimerRef.current !== undefined;
      const hasActiveDrag = dragRef.current !== null;

      if (wheelCommitTimerRef.current !== undefined) {
        window.clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = undefined;
      }

      if (hasPendingWheel || hasActiveDrag) {
        dragRef.current = null;
        store.commitTransient("viewport");
      }
    };
  }, [commitPendingWheel, scheduleWheelCommit, store]);

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      if (!draggable || event.button !== 0) {
        return;
      }

      event.preventDefault();
      commitPendingWheel();

      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      const { offset } = store.getState().canvas;

      dragRef.current = {
        originX: offset.x,
        originY: offset.y,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [commitPendingWheel, draggable, store],
  );

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      store.dispatchTransient({
        offset: {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
        type: "canvas.setOffset",
      });
    },
    [store],
  );

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = React.useCallback(
    (event) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
        return;
      }

      if (
        typeof event.currentTarget.hasPointerCapture === "function" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragRef.current = null;
      store.commitTransient("viewport");
    },
    [store],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    viewportRef,
  };
}
