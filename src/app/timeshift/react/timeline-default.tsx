// Seeds the runtime timeline panel to extended on first mount.
//
// The runtime Timeline switch in Setup defaults to compact (off) because the
// switch is runtime UI state (`panels.timeline.extended`), not a product
// value. Timeshift is a video app: the scrubber/duration/keyframe surface is
// the primary transport, so the product turns the extended timeline on once at
// boot. The reducer path for this target is UI-only (no history entry, no
// product value, no export impact), matching the runtime Timeline switch
// semantics exactly.

"use client";

import * as React from "react";

import { useToolcraftDispatch } from "@/toolcraft/runtime/react";

const TIMELINE_EXTENDED_TARGET = "panels.timeline.extended";

export function TimelineDefaultOn(): null {
  const dispatch = useToolcraftDispatch();

  React.useEffect(() => {
    dispatch({
      target: TIMELINE_EXTENDED_TARGET,
      type: "controls.setValue",
      value: true,
    });
  }, [dispatch]);

  return null;
}