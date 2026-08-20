import { describe, expect, it } from "vitest";

import {
  appAcceptance,
  validateProductAcceptanceCoverage,
} from "./app-acceptance";
import { deriveToolcraftPerformancePaths } from "@/toolcraft/runtime";

import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("appSchema", () => {
  it("publishes the Timeshift product schema with timeline, layers, and intrinsic-media canvas", () => {
    expect(appSchema.canvas.draggable).toBe(true);
    expect(appSchema.canvas.enabled).toBe(true);
    // The clip owns the output size: exports are always native resolution.
    expect(appSchema.canvas.sizing).toEqual({ mode: "intrinsic-media" });
    expect(appSchema.canvas.upload).toBe(true);

    // Setup section always exists from runtime.
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");

    // Product sections are present (app, chain, export).
    const productSections =
      appSchema.panels.controls?.sections.filter((s) => s.title !== "Setup") ??
      [];
    expect(productSections.length).toBeGreaterThan(0);

    // Layers and timeline are enabled for the video editor.
    expect(appSchema.panels.layers).toBe(true);
    expect(appSchema.panels.timeline).toBeDefined();
    expect(appSchema.panels.timeline?.enabled).toBe(true);
    expect(appSchema.panels.timeline?.mode).toBe("keyframes");

    expect(appSchema.toolbar).toEqual({
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    });

    // Assembly includes timeline and layers components.
    expect(appSchema.assembly.components).toContain("canvas");
    expect(appSchema.assembly.components).toContain("controlsPanel");
    expect(appSchema.assembly.components).toContain("toolbar");

    // Timeline capabilities are present.
    expect(appSchema.assembly.capabilities).toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).toContain("timeline.keyframes");

    // Timeline commands are available.
    expect(appSchema.assembly.commands).toContain("timeline.setCurrentTime");
  });

  it("includes product-specific panels and controls", () => {
    const productSections =
      appSchema.panels.controls?.sections.filter((s) => s.title !== "Setup") ??
      [];

    // Should have app sections, chain sections, and export sections.
    expect(productSections.length).toBeGreaterThanOrEqual(3);

    // Layers and timeline are product features.
    expect(appSchema.panels.layers).toBe(true);
    expect(appSchema.panels.timeline).toBeDefined();
  });

  it("timeline is enabled in keyframes mode with default duration", () => {
    expect(appSchema.panels.timeline?.enabled).toBe(true);
    expect(appSchema.panels.timeline?.mode).toBe("keyframes");
    expect(appSchema.panels.timeline?.defaultDurationSeconds).toBe(8);
  });

  it("declares the WebGL render plan the product actually runs", () => {
    expect(appPerformance.rendererStrategy).toBe("webgl");
    expect(appPerformance.usesCustomRenderer).toBe(true);

    // Only the controls that change how much work the engine does are workload
    // dimensions: the internal resolution, the ring depth and the two export
    // resolutions.
    expect(
      appPerformance.workloadEnvelope.dimensions.map(({ id }) => id).sort(),
    ).toEqual([
      "image-export-edge",
      "preview-width",
      "ring-depth",
      "video-export-edge",
    ]);

    // One scenario per canonical path, with ids derived from the plan.
    const paths = deriveToolcraftPerformancePaths(appSchema, appPerformance);

    expect(paths.length).toBeGreaterThan(0);
    expect(appPerformance.scenarios.map(({ pathId }) => pathId).sort()).toEqual(
      paths.map(({ id }) => id).sort(),
    );
  });

  it("declares production reload coverage for the product schema", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage !== "localStorage") {
      throw new Error("The product must persist user settings in localStorage.");
    }
    expect(appSchema.persistence.include).toContain("values");
    expect(appSchema.persistence.include).toContain("layers");
    expect(appSchema.persistence.include).toContain("panels");
    expect(appSchema.persistence.include).toContain("timeline");

    expect(
      appAcceptance.find((entry) => entry.id === "persistence.reload"),
    ).toMatchObject({
      automated: true,
      evidence: "persistence-state",
      kind: "runtime",
      persistenceCoverage: "reload",
      target: "canvas.size.width",
    });
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });
});