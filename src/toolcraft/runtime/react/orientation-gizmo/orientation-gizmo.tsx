"use client";

import * as React from "react";
import { createControlHistoryGroupId, type ControlChangeMeta } from "@/toolcraft/ui";

import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import { useToolcraftTheme } from "../app-shell/theme-runtime";
import {
  beginToolcraftOrientationInteraction,
  type ToolcraftOrientationInteractionLease,
} from "./orientation-interaction-coordinator";
import {
  easeToolcraftOrientationSnap,
  getToolcraftOrientationPoseFromPointerDelta,
  getToolcraftOrientationSnapDurationMs,
  interpolateToolcraftOrientationPose,
  projectToolcraftOrientationAxes,
  readToolcraftOrientationPose,
  snapToolcraftOrientationPose,
  type ToolcraftOrientationAxis,
  type ToolcraftOrientationAxisProjection,
  type ToolcraftOrientationPose,
} from "./orientation-gizmo-math";

export const toolcraftOrientationGizmoCssSize = 70;
export const toolcraftOrientationGizmoInset = 16;

const pixelRatio = 2;
const center = toolcraftOrientationGizmoCssSize / 2;
const axisReach = 24.5;
const dotRadius = 5.6;
const hoverRadius = dotRadius * 1.3;
const hitRadius = 7;
const fallbackHitRadius = 8.4;
const dragThresholdPixels = 3;

const axisColors: Record<"x" | "y" | "z", string> = {
  x: "#ff215e",
  y: "#53ff55",
  z: "#3b69ff",
};

export type ToolcraftOrientationGizmoProps = {
  defaultValue?: ToolcraftOrientationPose;
  onValueChange?: (
    value: ToolcraftOrientationPose,
    meta?: ControlChangeMeta,
  ) => void;
  testId?: string;
  store: ToolcraftExternalStore;
  target: string;
  value: unknown;
};

type GizmoGesture = {
  canvas: HTMLCanvasElement;
  clickAxis: ToolcraftOrientationAxis | null;
  dragged: boolean;
  historyGroup: string;
  interaction: ToolcraftOrientationInteractionLease;
  last: { x: number; y: number };
  pointerId: number;
  start: { x: number; y: number };
};

function getAxisColor(axis: ToolcraftOrientationAxis): string {
  return axisColors[axis[1] as "x" | "y" | "z"];
}

function isPositiveAxis(axis: ToolcraftOrientationAxis): boolean {
  return axis[0] === "+";
}

function isUnmodifiedPrimaryPointer(
  event: Pick<
    React.PointerEvent<HTMLCanvasElement>,
    "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function sortRearToFront(
  projections: readonly ToolcraftOrientationAxisProjection[],
): ToolcraftOrientationAxisProjection[] {
  return [...projections].sort((left, right) => right.depth - left.depth);
}

function findHoveredAxis(
  projections: readonly ToolcraftOrientationAxisProjection[],
  x: number,
  y: number,
): ToolcraftOrientationAxis | null {
  const ranked = projections
    .map((projection) => ({
      axis: projection.axis,
      depth: projection.depth,
      distance: Math.hypot(x - projection.x, y - projection.y),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.depth - right.depth,
    );
  const exact = ranked.find((item) => item.distance <= hitRadius);
  const nearest =
    exact ?? ranked.find((item) => item.distance <= fallbackHitRadius);

  return nearest?.axis ?? null;
}

function getLocalPointer(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();

  return {
    x:
      ((clientX - bounds.left) / Math.max(1, bounds.width)) *
      toolcraftOrientationGizmoCssSize,
    y:
      ((clientY - bounds.top) / Math.max(1, bounds.height)) *
      toolcraftOrientationGizmoCssSize,
  };
}

function drawGizmo(
  canvas: HTMLCanvasElement,
  pose: ToolcraftOrientationPose,
  hoveredAxis: ToolcraftOrientationAxis | null,
): void {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(
    0,
    0,
    toolcraftOrientationGizmoCssSize,
    toolcraftOrientationGizmoCssSize,
  );
  context.lineCap = "round";

  for (const projection of sortRearToFront(
    projectToolcraftOrientationAxes(pose, center, axisReach),
  )) {
    const color = getAxisColor(projection.axis);

    context.globalAlpha = projection.isFrontFacing ? 0.95 : 0.3;
    if (isPositiveAxis(projection.axis)) {
      context.strokeStyle = color;
      context.lineWidth = 2.1;
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(projection.x, projection.y);
      context.stroke();
    }

    context.fillStyle = color;
    context.beginPath();
    context.arc(
      projection.x,
      projection.y,
      projection.axis === hoveredAxis ? hoverRadius : dotRadius,
      0,
      Math.PI * 2,
    );
    context.fill();

    if (projection.axis === hoveredAxis) {
      context.globalAlpha = 0.7;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1;
      context.stroke();
    }
  }

  context.globalAlpha = 1;
}

export function ToolcraftOrientationGizmo({
  defaultValue,
  onValueChange,
  store,
  target,
  testId = "toolcraft-orientation-gizmo",
  value,
}: ToolcraftOrientationGizmoProps): React.JSX.Element {
  const { resolvedTheme } = useToolcraftTheme();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = React.useRef(0);
  const pose = readToolcraftOrientationPose(value, defaultValue);
  const poseRef = React.useRef(pose);
  const gestureRef = React.useRef<GizmoGesture | null>(null);
  const interactionRef =
    React.useRef<ToolcraftOrientationInteractionLease | null>(null);
  const [hoveredAxis, setHoveredAxis] =
    React.useState<ToolcraftOrientationAxis | null>(null);

  poseRef.current = pose;

  React.useLayoutEffect(() => {
    if (canvasRef.current) {
      drawGizmo(canvasRef.current, pose, hoveredAxis);
    }
  }, [hoveredAxis, pose]);

  const finishLocalGesture = React.useCallback(
    (gesture: GizmoGesture): void => {
      if (gestureRef.current === gesture) {
        gestureRef.current = null;
      }
      setHoveredAxis(null);

      if (gesture.canvas.hasPointerCapture?.(gesture.pointerId)) {
        gesture.canvas.releasePointerCapture?.(gesture.pointerId);
      }
    },
    [],
  );

  const clearLocalInteraction = React.useCallback((): void => {
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
    const gesture = gestureRef.current;

    if (gesture) {
      finishLocalGesture(gesture);
    } else {
      setHoveredAxis(null);
    }
  }, [finishLocalGesture]);

  const releaseInteraction = React.useCallback(
    (interaction: ToolcraftOrientationInteractionLease): void => {
      if (interactionRef.current === interaction) {
        interactionRef.current = null;
      }
      interaction.release();
    },
    [],
  );

  const commitPose = React.useCallback(
    (
      nextPose: ToolcraftOrientationPose,
      interaction: ToolcraftOrientationInteractionLease,
      historyGroup: string,
    ): boolean => {
      if (interactionRef.current !== interaction) {
        return false;
      }

      return interaction.runOwnWrite(() => {
        poseRef.current = nextPose;
        onValueChange?.(nextPose, {
          history: "merge",
          historyGroup,
        });
      });
    },
    [onValueChange],
  );

  const animateSnap = React.useCallback(
    (
      axis: ToolcraftOrientationAxis,
      interaction: ToolcraftOrientationInteractionLease,
      historyGroup: string,
    ) => {
      window.cancelAnimationFrame(animationFrameRef.current);
      const startPose = poseRef.current;
      const targetPose = snapToolcraftOrientationPose(startPose, axis);
      const durationMs = getToolcraftOrientationSnapDurationMs(
        startPose,
        targetPose,
      );

      if (durationMs <= 1e-6) {
        releaseInteraction(interaction);
        return;
      }

      const startedAt = performance.now();

      const animate = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const committed = commitPose(
          interpolateToolcraftOrientationPose(
            startPose,
            targetPose,
            easeToolcraftOrientationSnap(progress),
          ),
          interaction,
          historyGroup,
        );

        if (!committed) {
          animationFrameRef.current = 0;
          return;
        }

        if (progress < 1) {
          animationFrameRef.current = window.requestAnimationFrame(animate);
        } else {
          animationFrameRef.current = 0;
          releaseInteraction(interaction);
        }
      };

      animationFrameRef.current = window.requestAnimationFrame(animate);
    },
    [commitPose, releaseInteraction],
  );

  const beginInteraction = React.useCallback(() => {
    let interaction: ToolcraftOrientationInteractionLease;
    interaction = beginToolcraftOrientationInteraction({
      onCancel: () => {
        if (interactionRef.current !== interaction) {
          return;
        }
        interactionRef.current = null;
        clearLocalInteraction();
      },
      store,
      target,
    });
    interactionRef.current = interaction;
    return interaction;
  }, [clearLocalInteraction, store, target]);

  React.useEffect(
    () => () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      const gesture = gestureRef.current;
      gestureRef.current = null;
      const interaction = interactionRef.current;
      interactionRef.current = null;
      interaction?.release();

      if (gesture?.canvas.hasPointerCapture?.(gesture.pointerId)) {
        gesture.canvas.releasePointerCapture?.(gesture.pointerId);
      }
    },
    [],
  );

  return (
    <>
      <div
        aria-hidden="true"
        data-slot="toolcraft-orientation-gizmo-backing"
        style={{
          backfaceVisibility: "hidden",
          backgroundColor: resolvedTheme === "dark" ? "#000000" : "#ececef",
          borderRadius: "50%",
          bottom: toolcraftOrientationGizmoInset,
          contain: "paint",
          height: toolcraftOrientationGizmoCssSize,
          left: toolcraftOrientationGizmoInset,
          pointerEvents: "none",
          position: "absolute",
          transform: "translateZ(0)",
          width: toolcraftOrientationGizmoCssSize,
          zIndex: 20,
        }}
      />
      <canvas
        aria-label="3D orientation gizmo"
        data-hovered-axis={hoveredAxis ?? ""}
        data-testid={testId}
        data-toolcraft-canvas-handle="orientation-gizmo"
        data-toolcraft-orientation-pose={JSON.stringify(pose)}
        data-toolcraft-orientation-target={target}
        height={toolcraftOrientationGizmoCssSize * pixelRatio}
        onPointerCancel={(event) => {
          const gesture = gestureRef.current;

          if (!gesture || gesture.pointerId !== event.pointerId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          gesture.interaction.cancel();
        }}
        onPointerDown={(event) => {
          if (
            gestureRef.current ||
            !isUnmodifiedPrimaryPointer(event)
          ) {
            return;
          }

          const canvas = event.currentTarget;
          const point = getLocalPointer(canvas, event.clientX, event.clientY);

          if (Math.hypot(point.x - center, point.y - center) > center) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const projections = projectToolcraftOrientationAxes(
            poseRef.current,
            center,
            axisReach,
          );
          const axis = findHoveredAxis(projections, point.x, point.y);

          window.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = 0;
          const interaction = beginInteraction();
          gestureRef.current = {
            canvas,
            clickAxis: axis,
            dragged: false,
            historyGroup: createControlHistoryGroupId("orientation-gizmo"),
            interaction,
            last: point,
            pointerId: event.pointerId,
            start: point,
          };
          setHoveredAxis(axis);
          canvas.setPointerCapture?.(event.pointerId);
        }}
        onPointerLeave={() => {
          if (!gestureRef.current) {
            setHoveredAxis(null);
          }
        }}
        onLostPointerCapture={(event) => {
          const gesture = gestureRef.current;

          if (gesture?.pointerId === event.pointerId) {
            gesture.interaction.cancel();
          }
        }}
        onPointerMove={(event) => {
          const point = getLocalPointer(
            event.currentTarget,
            event.clientX,
            event.clientY,
          );
          const gesture = gestureRef.current;

          if (!gesture) {
            setHoveredAxis(
              findHoveredAxis(
                projectToolcraftOrientationAxes(
                  poseRef.current,
                  center,
                  axisReach,
                ),
                point.x,
                point.y,
              ),
            );
            return;
          }

          if (gesture.pointerId !== event.pointerId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          if (
            !gesture.dragged &&
            Math.hypot(
              point.x - gesture.start.x,
              point.y - gesture.start.y,
            ) <= dragThresholdPixels
          ) {
            return;
          }

          const previous = gesture.dragged ? gesture.last : gesture.start;
          gesture.dragged = true;
          gesture.last = point;
          commitPose(
            getToolcraftOrientationPoseFromPointerDelta(
              poseRef.current,
              point.x - previous.x,
              point.y - previous.y,
            ),
            gesture.interaction,
            gesture.historyGroup,
          );
        }}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;

          if (!gesture || gesture.pointerId !== event.pointerId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          finishLocalGesture(gesture);
          if (gesture.dragged) {
            releaseInteraction(gesture.interaction);
          } else if (gesture.clickAxis) {
            animateSnap(
              gesture.clickAxis,
              gesture.interaction,
              gesture.historyGroup,
            );
          } else {
            releaseInteraction(gesture.interaction);
          }
        }}
        ref={canvasRef}
        role="application"
        style={{
          backgroundColor: "transparent",
          borderRadius: "50%",
          bottom: toolcraftOrientationGizmoInset,
          display: "block",
          height: toolcraftOrientationGizmoCssSize,
          left: toolcraftOrientationGizmoInset,
          outline: "none",
          position: "absolute",
          touchAction: "none",
          width: toolcraftOrientationGizmoCssSize,
          zIndex: 21,
        }}
        width={toolcraftOrientationGizmoCssSize * pixelRatio}
      />
    </>
  );
}
