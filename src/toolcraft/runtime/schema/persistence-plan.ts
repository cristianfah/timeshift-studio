import type { ResolvedToolcraftAppCapabilities } from "./app-capabilities";
import { normalizeToolcraftAdditionalValueTargets } from "./additional-value-targets";
import type {
  ResolvedToolcraftAppIdentity,
  ResolvedToolcraftAppSchema,
  ResolvedToolcraftPanelsSchema,
  ToolcraftAppSchema,
  ToolcraftPersistableStateSlice,
} from "./types";

const BASE_PERSISTENCE_SLICES = ["canvas", "panels", "values"] as const;
const DEFAULT_PERSISTENCE_VERSION = 2;

type ToolcraftPersistencePlanInput = {
  appCapabilities: ResolvedToolcraftAppCapabilities;
  identity: ResolvedToolcraftAppIdentity;
  panels: ResolvedToolcraftPanelsSchema;
  persistence: ToolcraftAppSchema["persistence"];
};

export function resolveToolcraftPersistencePlan({
  appCapabilities,
  identity,
  panels,
  persistence,
}: ToolcraftPersistencePlanInput): ResolvedToolcraftAppSchema["persistence"] {
  if (persistence?.storage === "none") {
    return Object.freeze({ storage: "none" as const });
  }

  const include = new Set<ToolcraftPersistableStateSlice>(BASE_PERSISTENCE_SLICES);

  if (panels.layers) {
    include.add("layers");
  }

  if (panels.timeline?.enabled) {
    include.add("timeline");
  }

  if (appCapabilities.hasMedia) {
    include.add("media");
  }

  if (persistence?.storage === "localStorage") {
    for (const slice of persistence.include) {
      include.add(slice);
    }
  }

  const version =
    persistence?.storage === "localStorage"
      ? persistence.version
      : DEFAULT_PERSISTENCE_VERSION;

  return Object.freeze({
    additionalValueTargets: normalizeToolcraftAdditionalValueTargets(
      persistence?.storage === "localStorage"
        ? persistence.additionalValueTargets
        : undefined,
    ),
    include: Object.freeze([...include].sort()),
    key:
      persistence?.storage === "localStorage"
        ? persistence.key
        : (`toolcraft:${identity.id}:state:v${version}` as const),
    storage: "localStorage" as const,
    version,
  });
}
