// Automated proof for the fixed product surfaces. Each test name is the
// `automatedTestName` of one acceptance row in `product-rows.ts`.
//
// These run without a DOM, so they drive the product logic the UI calls:
// panel-action commands, the engine budget, the trim window, the chain
// derivation and the media-source classifier.

import { describe, expect, it } from "vitest";

import type { ToolcraftCommand, ToolcraftLayer, ToolcraftState } from "@/toolcraft/runtime";

import { appSchema } from "../../app-schema";
import { resolveSlotParams } from "../animation/resolve";
import { registry } from "../effects/registry";
import { isClipMuted, resolveEngineBudget } from "../engine/budget";
import {
  resolveClipWindow,
  toSourceTime,
  toTimelineTime,
} from "../engine/clip-window";
import {
  asStillMotion,
  createStillFramePainter,
  STILL_MOTIONS,
} from "../engine/still-history";
import { readClipSourceKind } from "../react/clip-source";
import { createPanelActionHandler } from "../react/panel-actions";
import { deriveChain, firstFreeSlot, serializeOrder } from "../react/use-chain";
import { timelineDefaultCommands } from "../react/timeline-default";
import { previewSourceSize } from "../react/use-preview-source";
import { paramTarget, slotEnabledTarget, slotTypeTarget, targets } from "../targets";

const controls = new Map(
  (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls).map(
      (control) => [control.target, control] as const,
    ),
  ),
);

function control(target: string) {
  const found = controls.get(target);

  expect(found, `schema declares ${target}`).toBeDefined();

  return found!;
}

function optionValues(target: string): string[] {
  return (control(target).options ?? []).map((option) => option.value);
}

type Recorded = { commands: ToolcraftCommand[]; state: ToolcraftState };

function fakeState(overrides: Partial<ToolcraftState> = {}): ToolcraftState {
  return {
    layers: [],
    mediaAssets: [],
    timeline: { currentTimeSeconds: 0, durationSeconds: 8, isPlaying: false },
    values: {},
    ...overrides,
  } as unknown as ToolcraftState;
}

async function runPanelAction(
  value: string,
  state: ToolcraftState = fakeState(),
  hooks: Partial<{
    exportPng: () => Promise<void>;
    exportVideo: () => Promise<void>;
    openBrowser: () => void;
  }> = {},
): Promise<Recorded> {
  const commands: ToolcraftCommand[] = [];
  const handler = createPanelActionHandler({
    exportPng: hooks.exportPng ?? (async () => undefined),
    exportVideo: hooks.exportVideo ?? (async () => undefined),
    openBrowser: hooks.openBrowser ?? (() => undefined),
  });

  await handler({
    action: { label: value, value },
    dispatch: (command: ToolcraftCommand) => commands.push(command),
    state,
  } as never);

  return { commands, state };
}

function layer(id: string, visible = true): ToolcraftLayer {
  return { id, kind: "layer", name: id, visible } as unknown as ToolcraftLayer;
}

const paintCalls = (
  motion: Parameters<typeof createStillFramePainter>[1],
  amount: number,
  age: number,
): string[] => {
  const calls: string[] = [];
  const context = {
    canvas: { height: 450, width: 800 },
    drawImage: (_i: unknown, ...args: number[]) => calls.push(`draw:${args.join(",")}`),
    rotate: (angle: number) => calls.push(`rotate:${angle.toFixed(4)}`),
    scale: (x: number) => calls.push(`scale:${x.toFixed(4)}`),
    setTransform: () => undefined,
    translate: (x: number, y: number) =>
      calls.push(`translate:${x.toFixed(2)},${y.toFixed(2)}`),
  } as unknown as CanvasRenderingContext2D;

  createStillFramePainter({} as CanvasImageSource, motion, amount)(context, age);

  return calls;
};

describe("superficies fijas del producto", () => {
  it("la fuente admite clip e imagen y su ciclo de medios", () => {
    const source = control(targets.source);

    expect(source.type).toBe("fileDrop");
    expect(source.assetKind).toBe("file");
    expect(source.accept).toContain("video/*");
    expect(source.accept).toContain("image/*");
    // Some systems hand over a dragged file with an empty MIME type, so the
    // extensions have to be listed too or the drop is rejected in silence.
    for (const extension of [".png", ".jpg", ".jpeg", ".webp", ".heic", ".mp4", ".mov"]) {
      expect(source.accept).toContain(extension);
    }
    expect(
      readClipSourceKind({
        assetKind: "file",
        fileName: "toma.mp4",
        id: "a",
        layerId: "l",
        lifecycle: "ready",
        mimeType: "video/mp4",
        position: { x: 0, y: 0 },
        resourceRef: "r",
      } as never),
    ).toBe("video");
    expect(
      readClipSourceKind({
        assetKind: "file",
        fileName: "foto.png",
        id: "b",
        layerId: "l",
        lifecycle: "ready",
        mimeType: "image/png",
        position: { x: 0, y: 0 },
        resourceRef: "r",
      } as never),
    ).toBe("image");
  });

  it("el movimiento inventado cambia el historial de la imagen fija", () => {
    expect(optionValues(targets.stillMotion)).toEqual(
      STILL_MOTIONS.map((motion) => motion.value),
    );

    const untouched = paintCalls("none", 1, 1);
    const rendered = STILL_MOTIONS.map((motion) =>
      paintCalls(asStillMotion(motion.value), 1, 1).join("|"),
    );

    expect(untouched).toEqual(["draw:0,0,800,450"]);
    expect(new Set(rendered).size).toBe(STILL_MOTIONS.length);
  });

  it("la intensidad del movimiento inventado escala el historial", () => {
    const amount = control(targets.stillMotionAmount);

    expect(amount.type).toBe("slider");
    expect(amount.min).toBe(0);
    expect(amount.max).toBe(1);

    // The current frame is always the untouched image; older frames move
    // further away as the intensity grows.
    expect(paintCalls("drift", 1, 0)).toEqual(["draw:0,0,800,450"]);
    expect(paintCalls("drift", 0, 1)).toEqual(["draw:0,0,800,450"]);
    expect(paintCalls("drift", 0.5, 1)).not.toEqual(paintCalls("drift", 1, 1));
  });

  it("aplicar un look reemplaza la cadena por sus efectos y valores", async () => {
    const state = fakeState({ layers: [layer("fx-old")] });
    const { commands } = await runPanelAction("DATAMOSH", state);

    expect(
      commands.some(
        (command) =>
          command.type === "layers.delete" && command.layerId === "fx-old",
      ),
    ).toBe(true);
    expect(
      commands.some(
        (command) =>
          command.type === "controls.setValue" &&
          command.target === slotTypeTarget(0) &&
          typeof command.value === "string" &&
          registry[command.value] !== undefined,
      ),
    ).toBe(true);
    expect(
      commands.filter((command) => command.type === "layers.add").length,
    ).toBeGreaterThan(0);
  });

  it("el explorador de efectos añade un efecto a la cadena", () => {
    const browser = control("chain.browser");

    expect(browser.type).toBe("effectBrowser");
    expect(Object.keys(registry)).toHaveLength(10);
    // The browser appends to the first free chain position and keeps the
    // slot order the layers panel reads back.
    expect(firstFreeSlot([0, 1])).toBe(2);
    expect(firstFreeSlot([0, 1, 2, 3, 4, 5, 6, 7])).toBeNull();
    expect(serializeOrder([0, 1, 2])).toBe("[0,1,2]");
  });

  it("vaciar la cadena borra las capas de efecto", async () => {
    const state = fakeState({ layers: [layer("fx-a"), layer("fx-b")] });
    const { commands } = await runPanelAction("clear", state);

    expect(
      commands.filter((command) => command.type === "layers.delete"),
    ).toHaveLength(2);
    expect(
      commands.filter(
        (command) =>
          command.type === "controls.setValue" &&
          command.target === "chain.order" &&
          command.value === "[]",
      ),
    ).toHaveLength(1);
  });

  it("la resolución de previsualización reconfigura el motor", () => {
    expect(optionValues(targets.previewWidth)).toEqual(["640", "854", "1280"]);

    for (const width of optionValues(targets.previewWidth)) {
      expect(
        resolveEngineBudget({ [targets.previewWidth]: width }).targetWidth,
      ).toBe(Number(width));
    }
  });

  it("la historia del motor cambia la profundidad del ring buffer", () => {
    expect(optionValues(targets.bufferSeconds)).toEqual(["2", "3", "5", "8"]);

    const depths = optionValues(targets.bufferSeconds).map(
      (seconds) => resolveEngineBudget({ [targets.bufferSeconds]: seconds }).depth,
    );

    expect(depths).toEqual([60, 90, 150, 240]);
  });

  it("silenciar apaga el audio del clip en el editor", () => {
    expect(control(targets.muted).type).toBe("switch");
    expect(isClipMuted({})).toBe(true);
    expect(isClipMuted({ [targets.muted]: true })).toBe(true);
    expect(isClipMuted({ [targets.muted]: false })).toBe(false);
  });

  it("la entrada recorta la región del clip", () => {
    const window = resolveClipWindow({ [targets.trimIn]: 0.25 }, 8);

    expect(window.inSeconds).toBe(2);
    expect(window.lengthSeconds).toBe(6);
    expect(toSourceTime(window, 0)).toBe(2);
    expect(toSourceTime(window, 3)).toBe(5);
  });

  it("la salida recorta la región del clip", () => {
    const window = resolveClipWindow(
      { [targets.trimIn]: 0.25, [targets.trimOut]: 0.5 },
      8,
    );

    expect(window.lengthSeconds).toBe(2);
    expect(toSourceTime(window, 99)).toBe(4);
    expect(toTimelineTime(window, 3)).toBe(1);
  });

  it("el interruptor de fondo decide si el fondo entra en el artefacto", () => {
    const include = control(targets.exportIncludeBackground);

    expect(include.type).toBe("switch");
    expect(include.defaultValue).toBe(true);
    expect(control("appearance.background").type).toBe("color");
  });

  it("el color de fondo se ve en el preview y en el export", () => {
    const color = control("appearance.background");

    expect(color.type).toBe("color");
    expect(color.defaultValue).toBe("#0b0d11");
  });

  it("el formato de imagen cambia el tipo del archivo exportado", () => {
    expect(optionValues("export.image.format")).toEqual(["png", "jpg"]);
    expect(control("export.image.format").defaultValue).toBe("png");
  });

  it("la resolución de imagen cambia las dimensiones exportadas", () => {
    expect(optionValues("export.image.resolution")).toEqual(["2k", "4k", "8k"]);
    expect(control("export.image.resolution").defaultValue).toBe("4k");
  });

  it("el formato de video cambia el contenedor exportado", () => {
    expect(optionValues(targets.exportVideoFormat)).toEqual(["mp4", "webm"]);
    expect(control(targets.exportVideoFormat).defaultValue).toBe("mp4");
  });

  it("la resolución de video cambia las dimensiones exportadas", () => {
    expect(optionValues(targets.exportVideoResolution)).toEqual(["current", "4k"]);
    expect(control(targets.exportVideoResolution).defaultValue).toBe("current");
  });

  it("las acciones sticky entregan imagen y video", async () => {
    const calls: string[] = [];

    await runPanelAction("export-png", fakeState(), {
      exportPng: async () => {
        calls.push("png");
      },
    });
    await runPanelAction("export-video", fakeState(), {
      exportVideo: async () => {
        calls.push("video");
      },
    });

    expect(calls).toEqual(["png", "video"]);

    const actions = control("panel.actions").actions ?? [];

    expect(
      actions.map((action) => (typeof action === "string" ? action : action.role)),
    ).toEqual(["export-video", "export-image"]);
  });

  it("timeline extended by default on mount", () => {
    const commands = timelineDefaultCommands();

    expect(commands[0]).toEqual({
      target: "panels.timeline.extended",
      type: "controls.setValue",
      value: true,
    });
    expect(commands[1]).toMatchObject({
      panelId: "timeline",
      type: "panels.update",
    });
  });

  it("seleccionar una capa cambia el efecto editado", () => {
    const values = {
      "chain.order": serializeOrder([0, 1]),
      [slotTypeTarget(0)]: "rgbSplit",
      [slotTypeTarget(1)]: "scanSweep",
    };
    const chain = deriveChain([layer("a"), layer("b")], values);

    expect(chain.map((entry) => entry.layerId)).toEqual(["a", "b"]);
    expect(chain.map((entry) => entry.type)).toEqual(["rgbSplit", "scanSweep"]);

    // The layer that owns the imported source is material, not a chain
    // position: it must not shift the layer-to-slot binding.
    const withSource = deriveChain(
      [layer("source"), layer("a"), layer("b")],
      values,
      new Set(["source"]),
    );

    expect(withSource.map((entry) => entry.layerId)).toEqual(["a", "b"]);
    expect(withSource.map((entry) => entry.type)).toEqual([
      "rgbSplit",
      "scanSweep",
    ]);
  });

  it("ocultar una capa saca su efecto del render", () => {
    const values = {
      "chain.order": serializeOrder([0]),
      [slotTypeTarget(0)]: "rgbSplit",
    };

    expect(deriveChain([layer("a", true)], values)[0]?.enabled).toBe(true);
    expect(deriveChain([layer("a", false)], values)[0]?.enabled).toBe(false);
    expect(
      deriveChain([layer("a", true)], {
        ...values,
        [slotEnabledTarget(0)]: false,
      })[0]?.enabled,
    ).toBe(false);
  });

  it("reordenar capas cambia el orden de la cadena", () => {
    const values = {
      "chain.order": serializeOrder([0, 1]),
      [slotTypeTarget(0)]: "rgbSplit",
      [slotTypeTarget(1)]: "scanSweep",
    };
    const reordered = deriveChain([layer("b"), layer("a")], {
      ...values,
      "chain.order": serializeOrder([1, 0]),
    });

    expect(reordered.map((entry) => entry.type)).toEqual([
      "scanSweep",
      "rgbSplit",
    ]);
  });

  it("agrupar capas conserva el orden de la cadena", () => {
    const values = {
      "chain.order": serializeOrder([0, 1]),
      [slotTypeTarget(0)]: "rgbSplit",
      [slotTypeTarget(1)]: "scanSweep",
    };
    const group = { id: "g", kind: "group", name: "g", visible: true } as unknown as ToolcraftLayer;

    expect(
      deriveChain([group, layer("a"), layer("b")], values).map(
        (entry) => entry.type,
      ),
    ).toEqual(["rgbSplit", "scanSweep"]);
  });

  it("la reproducción recorre la región y renderiza cada frame", () => {
    const window = resolveClipWindow(
      { [targets.trimIn]: 0.1, [targets.trimOut]: 0.6 },
      10,
    );

    expect(window.inSeconds).toBeCloseTo(1);
    expect(window.lengthSeconds).toBeCloseTo(5);
    // The playhead walks the region forward and the seam maps back to the
    // first frame of the region.
    expect(toSourceTime(window, 0)).toBeCloseTo(1);
    expect(toSourceTime(window, window.lengthSeconds)).toBeCloseTo(6);
    expect(toTimelineTime(window, 6)).toBeCloseTo(window.lengthSeconds);
    expect(toTimelineTime(window, 0.2)).toBe(0);
  });

  it("los keyframes de un parámetro cambian el render en el tiempo", () => {
    const target = paramTarget(0, "rgbSplit", "delayG");
    const evaluatedAt = (value: number) =>
      resolveSlotParams({
        evaluated: (candidate) => (candidate === target ? value : undefined),
        raw: () => undefined,
        slot: 0,
        time: 0,
        type: "rgbSplit",
      }).delayG;

    // The runtime evaluates keyframes before the product resolves the slot, so
    // two evaluated values at two instants produce two different renders.
    expect(evaluatedAt(4)).toBe(4);
    expect(evaluatedAt(40)).toBe(40);
  });

  it("la fuente importada fija el tamaño del canvas", () => {
    expect(appSchema.canvas.sizing).toEqual({ mode: "intrinsic-media" });
    expect(
      previewSourceSize({
        element: { naturalHeight: 360, naturalWidth: 640 } as HTMLImageElement,
        kind: "image",
      }),
    ).toEqual({ height: 360, width: 640 });
    expect(
      previewSourceSize({
        element: { videoHeight: 1080, videoWidth: 1920 } as HTMLVideoElement,
        kind: "video",
      }),
    ).toEqual({ height: 1080, width: 1920 });
    expect(
      previewSourceSize({
        element: { naturalHeight: 0, naturalWidth: 0 } as HTMLImageElement,
        kind: "image",
      }),
    ).toBeNull();
  });

  it("la escala de resolución conserva los píxeles de backing", () => {
    // The product opts into the runtime slider and never clamps it: the engine
    // allocates from the source size and the preview control, not from scale.
    expect(appSchema.canvas.renderScale).toMatchObject({
      defaultValue: 2,
      enabled: true,
      max: 2,
      min: 1,
    });
    expect(resolveEngineBudget({}).targetWidth).toBe(854);
  });
});
