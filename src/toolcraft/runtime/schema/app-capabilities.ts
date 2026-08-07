import type {
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftPanelsSchema,
} from "./types";

export type ResolvedToolcraftAppCapabilities = Readonly<{
  hasMedia: boolean;
}>;

type ToolcraftAppCapabilitiesInput = {
  canvas: Pick<ResolvedToolcraftAppSchema["canvas"], "upload">;
  media: Pick<ResolvedToolcraftAppSchema["media"], "defaultAssets">;
  panels: Pick<ResolvedToolcraftPanelsSchema, "controls">;
};

export function resolveToolcraftAppCapabilities({
  canvas,
  media,
  panels,
}: ToolcraftAppCapabilitiesInput): ResolvedToolcraftAppCapabilities {
  const hasPanelFileDrop = panels.controls?.sections.some((section) =>
    Object.values(section.controls).some((control) => control.type === "fileDrop"),
  );

  return Object.freeze({
    hasMedia: canvas.upload || media.defaultAssets.length > 0 || Boolean(hasPanelFileDrop),
  });
}
