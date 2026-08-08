// Seeds the runtime timeline panel to extended on first mount, and docks it
// at the bottom of the viewport (After Effects / Jitter.com style).
//
// The runtime Timeline switch in Setup defaults to compact (off) because the
// switch is runtime UI state (`panels.timeline.extended`), not a product
// value. Timeshift is a video app: the scrubber/duration/keyframe surface is
// the primary transport, so the product turns the extended timeline on once at
// boot. The reducer path for this target is UI-only (no history entry, no
// product value, no export impact), matching the runtime Timeline switch
// semantics exactly.
//
// The timeline panel also supports snapEdge: "bottom" (configured in the
// runtime panel host config) so it docks to the bottom edge of the viewport
// instead of floating at the top. The clampPanelPlacementToViewport helper
// recalculates the correct offset when snapEdge is set.

"use client";

import * as React from "react";

import { useToolcraftDispatch } from "@/toolcraft/runtime/react";

const TIMELINE_EXTENDED_TARGET = "panels.timeline.extended";

export function TimelineDefaultOn(): null {
  const dispatch = useToolcraftDispatch();

  React.useEffect(() => {
    // Extend the timeline panel on mount.
    dispatch({
      target: TIMELINE_EXTENDED_TARGET,
      type: "controls.setValue",
      value: true,
    });

    // Dock the timeline panel at the bottom edge of the viewport.
    // The runtime panel host config for timeline has snapEdges: ["top", "bottom"].
    // Setting snapEdge to "bottom" triggers the useLayoutEffect in
    // usePanelSnapControls, which calls clampPanelPlacementToViewport to
    // recalculate the offset so the panel rests at the viewport bottom edge.
    dispatch({
      panelId: "timeline",
      patch: { snapEdge: "bottom" },
      type: "panels.update",
    });
  }, [dispatch]);

  return null;
}