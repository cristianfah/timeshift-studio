import type {
  ResolvedToolcraftAppIdentity,
  ToolcraftAppIdentitySchema,
} from "./types";

function slugifyToolcraftAppId(value: string | undefined): string {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "toolcraft-app";
}

export function resolveToolcraftAppIdentity({
  controlsTitle,
  identity,
  legacyAppId,
}: {
  controlsTitle?: string;
  identity?: ToolcraftAppIdentitySchema;
  legacyAppId?: string;
}): ResolvedToolcraftAppIdentity {
  const idSource = identity?.id ?? legacyAppId ?? controlsTitle;
  const id = slugifyToolcraftAppId(idSource);
  const title = identity?.title?.trim() || controlsTitle?.trim() || "Toolcraft App";

  return Object.freeze({ id, title });
}
