export type ToolcraftRenderPassCost = Readonly<{
  dimensions: readonly string[];
  frequency: "once" | "discrete" | "interaction" | "frame" | "batch";
  relationship: "constant" | "linear" | "quadratic" | "product" | "benchmark";
}>;

export type ToolcraftRenderPassLifecycle = Readonly<{
  cache: "none" | "memoized" | "retained-resource";
  resourceScope: "call" | "interaction" | "renderer" | "source";
}>;

export type ToolcraftRenderPassKind =
  | "decode"
  | "preprocess"
  | "pixel-transform"
  | "vector-build"
  | "text-layout"
  | "rasterize"
  | "composite"
  | "handles"
  | "export";

export type ToolcraftRenderPassRunLocation =
  | "main"
  | "worker"
  | "gpu"
  | "worker-or-gpu"
  | "export-only";

export type ToolcraftRenderPassOutput =
  | "source"
  | "intermediate"
  | "preview"
  | "overlay"
  | "export";

export type ToolcraftRenderPassQuality = "preview" | "full" | "retina" | "export";

export type ToolcraftRenderPass = Readonly<{
  cacheKey?: readonly string[];
  cost?: ToolcraftRenderPassCost;
  id: string;
  inputs: readonly string[];
  invalidatedBy: readonly string[];
  kind: ToolcraftRenderPassKind;
  lifecycle?: ToolcraftRenderPassLifecycle;
  output: ToolcraftRenderPassOutput;
  quality: ToolcraftRenderPassQuality;
  runsOn: ToolcraftRenderPassRunLocation;
}>;

export type ToolcraftPipelineInteraction =
  | "initial-render"
  | "animation-frame"
  | "control-change"
  | "control-drag"
  | "media-import"
  | "mask-drag"
  | "viewport-drag"
  | "viewport-zoom"
  | "timeline-playback"
  | "timeline-scrub"
  | "export";

export type ToolcraftInteractionInvalidation = Readonly<{
  interaction: ToolcraftPipelineInteraction;
  invalidates: readonly string[];
  mustNotInvalidate?: readonly string[];
  targets: readonly string[];
}>;

export type ToolcraftRendererPipeline = Readonly<{
  interactionInvalidation: readonly ToolcraftInteractionInvalidation[];
  passes: readonly ToolcraftRenderPass[];
  runtimeId?: string;
}>;

export type ToolcraftRendererPipelinePassContract<
  Result,
  Resource = never,
  ResourceKey extends readonly unknown[] = [Resource] extends [never]
    ? never
    : readonly unknown[],
> = Readonly<{
  resource: Resource;
  resourceKey: ResourceKey;
  result: Result;
}>;

type AnyPassContract = ToolcraftRendererPipelinePassContract<any, any, any>;
type ToolcraftRendererPipelinePassContracts = Readonly<
  Record<string, AnyPassContract>
>;

const registrationType = Symbol("ToolcraftRendererPipelineRegistration");
const passHandleType = Symbol("ToolcraftRendererPipelinePassHandle");

type DescriptorPassId<Passes extends readonly ToolcraftRenderPass[]> =
  Passes[number]["id"];

type ExecutableCacheKey<Pass extends ToolcraftRenderPass> =
  Pass extends { lifecycle: { cache: "none" } }
    ? undefined
    : Pass extends { cacheKey: infer CacheKey extends readonly string[] }
      ? CacheKey
      : undefined;

export type ToolcraftCompiledRendererPipelinePass<
  Pass extends ToolcraftRenderPass = ToolcraftRenderPass,
> = Readonly<{
  id: Pass["id"];
  inputs: readonly string[];
  invalidatedBy: readonly string[];
  kind: ToolcraftRenderPassKind;
  output: ToolcraftRenderPassOutput;
  quality: ToolcraftRenderPassQuality;
  runsOn: ToolcraftRenderPassRunLocation;
}> &
  (Pass extends { cacheKey: infer CacheKey extends readonly string[] }
    ? Readonly<{ cacheKey: CacheKey }>
    : Readonly<{ cacheKey?: never }>) &
  (Pass extends { cost: ToolcraftRenderPassCost }
    ? Readonly<{ cost: ToolcraftRenderPassCost }>
    : Readonly<{ cost?: never }>) &
  (Pass extends { lifecycle: ToolcraftRenderPassLifecycle }
    ? Readonly<{ lifecycle: ToolcraftRenderPassLifecycle }>
    : Readonly<{ lifecycle?: never }>);

type NormalizedPasses<Passes extends readonly ToolcraftRenderPass[]> = Readonly<{
  [Index in keyof Passes]: Passes[Index] extends ToolcraftRenderPass
    ? ToolcraftCompiledRendererPipelinePass<Passes[Index]>
    : never;
}>;

type ExactContractCoverage<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[],
> = Exclude<DescriptorPassId<Passes>, Extract<keyof Contracts, string>> extends never
  ? Exclude<Extract<keyof Contracts, string>, DescriptorPassId<Passes>> extends never
    ? unknown
    : Readonly<{
        __undeclaredPassContracts: Exclude<
          Extract<keyof Contracts, string>,
          DescriptorPassId<Passes>
        >;
      }>
  : Readonly<{
      __missingPassContracts: Exclude<
        DescriptorPassId<Passes>,
        Extract<keyof Contracts, string>
      >;
    }>;

type ContractHasResource<Contract extends AnyPassContract> = [
  Contract["resource"],
] extends [never]
  ? false
  : Contract["resourceKey"] extends readonly unknown[]
    ? true
    : false;

type DescriptorHasResource<Pass extends ToolcraftRenderPass> =
  Pass extends {
    lifecycle: {
      cache: "retained-resource";
      resourceScope: "renderer" | "source";
    };
  }
    ? true
    : false;

type ExecutableResourceCapability<
  Pass extends ToolcraftRenderPass,
  Contract extends AnyPassContract,
> = DescriptorHasResource<Pass> extends true
  ? ContractHasResource<Contract> extends true
    ? Readonly<{
        resource: Contract["resource"];
        resourceKey: Contract["resourceKey"];
      }>
    : never
  : never;

type PassCapabilityError<
  Pass extends ToolcraftRenderPass,
  Contract extends AnyPassContract,
> =
  | (Pass extends { lifecycle: { cache: "none" }; cacheKey: readonly string[] }
      ? `pass ${Pass["id"]}: cache none cannot declare cacheKey`
      : never)
  | (Pass extends {
        lifecycle: { cache: "memoized" | "retained-resource" };
      }
      ? Pass extends { cacheKey: readonly [string, ...string[]] }
        ? never
        : `pass ${Pass["id"]}: cached pass requires non-empty cacheKey`
      : Pass extends { cacheKey: infer CacheKey extends readonly string[] }
        ? CacheKey extends readonly [string, ...string[]]
          ? never
          : `pass ${Pass["id"]}: cached pass requires non-empty cacheKey`
        : never)
  | (Pass extends {
        lifecycle: {
          cache: "retained-resource";
          resourceScope: infer Scope;
        };
      }
      ? Scope extends "renderer" | "source"
        ? ContractHasResource<Contract> extends true
          ? never
          : `pass ${Pass["id"]}: retained resource requires contract`
        : `pass ${Pass["id"]}: unsupported retained resource scope`
      : ContractHasResource<Contract> extends true
        ? `pass ${Pass["id"]}: resource contract requires retained resource descriptor`
        : never);

type PipelineCapabilityErrors<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[],
> = Passes[number] extends infer Pass
  ? Pass extends ToolcraftRenderPass
    ? Pass["id"] extends keyof Contracts
      ? PassCapabilityError<Pass, Contracts[Pass["id"]]>
      : never
    : never
  : never;

type ValidPipelineCapabilities<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[],
> = [PipelineCapabilityErrors<Contracts, Passes>] extends [never]
  ? unknown
  : Readonly<{
      __invalidPipelineCapabilities: PipelineCapabilityErrors<Contracts, Passes>;
    }>;

export type ToolcraftRendererPipelinePassHandle<
  PassId extends string = string,
  Contract extends AnyPassContract = AnyPassContract,
  CacheKey extends readonly string[] | undefined =
    | readonly string[]
    | undefined,
  ResourceCapability = never,
> = Readonly<{
  readonly [passHandleType]: Readonly<{
    cacheKey: CacheKey;
    contract: Contract;
    resource: ResourceCapability;
  }>;
  id: PassId;
}>;

type AnyToolcraftRendererPipelinePassHandle =
  ToolcraftRendererPipelinePassHandle<string, any, any, any>;

type ContractForPass<
  Contracts extends ToolcraftRendererPipelinePassContracts,
  PassId extends keyof Contracts,
> = Contracts[PassId];

type PassForId<
  Passes extends readonly ToolcraftRenderPass[],
  PassId extends DescriptorPassId<Passes>,
> = Extract<Passes[number], { id: PassId }>;

export type ToolcraftRendererPipelineRegistration<
  Contracts extends ToolcraftRendererPipelinePassContracts =
    ToolcraftRendererPipelinePassContracts,
  Passes extends readonly ToolcraftRenderPass[] = readonly ToolcraftRenderPass[],
> = Readonly<{
  readonly [registrationType]: (contracts: Contracts) => Contracts;
  getPass: <PassId extends DescriptorPassId<Passes>>(
    passId: PassId,
  ) => ToolcraftRendererPipelinePassHandle<
    PassId,
    ContractForPass<Contracts, PassId & keyof Contracts>,
    ExecutableCacheKey<PassForId<Passes, PassId>>,
    ExecutableResourceCapability<
      PassForId<Passes, PassId>,
      ContractForPass<Contracts, PassId & keyof Contracts>
    >
  >;
  interactionInvalidation: readonly ToolcraftInteractionInvalidation[];
  passes: NormalizedPasses<Passes>;
  runtimeId: string;
}>;

export type AnyToolcraftRendererPipelineRegistration =
  ToolcraftRendererPipelineRegistration<any, any>;

export type ToolcraftRendererPipelinePassResult<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = Handle extends ToolcraftRendererPipelinePassHandle<
  string,
  infer Contract,
  any,
  any
>
  ? Contract["result"]
  : never;

export type ToolcraftRendererPipelinePassResource<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = Handle extends ToolcraftRendererPipelinePassHandle<
  string,
  any,
  any,
  infer Capability
>
  ? Capability extends { resource: infer Resource }
    ? Resource
    : never
  : never;

export type ToolcraftRendererPipelinePassResourceKey<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = Handle extends ToolcraftRendererPipelinePassHandle<
  string,
  any,
  any,
  infer Capability
>
  ? Capability extends { resourceKey: infer ResourceKey }
    ? ResourceKey
    : never
  : never;

type HandleCacheKey<Handle extends AnyToolcraftRendererPipelinePassHandle> =
  Handle extends ToolcraftRendererPipelinePassHandle<
    string,
    any,
    infer CacheKey,
    any
  >
    ? CacheKey
    : never;

export type ToolcraftRendererPipelinePassCacheInput<
  Handle extends AnyToolcraftRendererPipelinePassHandle,
> = HandleCacheKey<Handle> extends readonly string[]
  ? Readonly<{
      [Key in HandleCacheKey<Handle>[number]]: unknown;
    }>
  : undefined;

type RegistrationInternals = {
  definitionsByHandle: Map<AnyToolcraftRendererPipelinePassHandle, ToolcraftRenderPass>;
  handlesById: Map<string, AnyToolcraftRendererPipelinePassHandle>;
};

const registrationInternals = new WeakMap<object, RegistrationInternals>();

const supportedCacheModes = new Set(["none", "memoized", "retained-resource"]);
const supportedResourceScopes = new Set([
  "call",
  "interaction",
  "renderer",
  "source",
]);
const supportedPassKinds = new Set([
  "decode",
  "preprocess",
  "pixel-transform",
  "vector-build",
  "text-layout",
  "rasterize",
  "composite",
  "handles",
  "export",
]);
const supportedPassOutputs = new Set([
  "source",
  "intermediate",
  "preview",
  "overlay",
  "export",
]);
const supportedPassQualities = new Set(["preview", "full", "retina", "export"]);
const supportedRunLocations = new Set([
  "main",
  "worker",
  "gpu",
  "worker-or-gpu",
  "export-only",
]);
const supportedCostFrequencies = new Set([
  "once",
  "discrete",
  "interaction",
  "frame",
  "batch",
]);
const supportedCostRelationships = new Set([
  "constant",
  "linear",
  "quadratic",
  "product",
  "benchmark",
]);
const supportedInteractions = new Set([
  "initial-render",
  "animation-frame",
  "control-change",
  "control-drag",
  "media-import",
  "mask-drag",
  "viewport-drag",
  "viewport-zoom",
  "timeline-playback",
  "timeline-scrub",
  "export",
]);

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function assertSupportedValue(
  passId: string,
  path: string,
  value: unknown,
  supported: ReadonlySet<string>,
): asserts value is string {
  if (typeof value !== "string" || !supported.has(value)) {
    throw new Error(
      `Renderer pipeline pass "${passId}" ${path} value "${String(value)}" is not supported.`,
    );
  }
}

function assertStringArray(
  passId: string,
  path: string,
  value: unknown,
): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Renderer pipeline pass "${passId}" ${path} must be an array of strings.`,
    );
  }
}

function assertInvalidationStringArray(
  path: string,
  value: unknown,
): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Renderer pipeline ${path} must be an array of strings.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertInvalidationShape(
  invalidation: ToolcraftInteractionInvalidation,
  index: number,
): void {
  const path = `interactionInvalidation[${index}]`;
  if (!isRecord(invalidation)) {
    throw new Error(`Renderer pipeline ${path} must be an object.`);
  }
  assertInvalidationStringArray(
    `${path}.invalidates`,
    invalidation.invalidates,
  );
  assertInvalidationStringArray(`${path}.targets`, invalidation.targets);
  if (invalidation.mustNotInvalidate !== undefined) {
    assertInvalidationStringArray(
      `${path}.mustNotInvalidate`,
      invalidation.mustNotInvalidate,
    );
  }
}

function assertPassShape(pass: ToolcraftRenderPass): void {
  assertStringArray(pass.id, "inputs", pass.inputs);
  assertStringArray(pass.id, "invalidatedBy", pass.invalidatedBy);
  assertSupportedValue(pass.id, "kind", pass.kind, supportedPassKinds);
  assertSupportedValue(pass.id, "output", pass.output, supportedPassOutputs);
  assertSupportedValue(pass.id, "quality", pass.quality, supportedPassQualities);
  assertSupportedValue(pass.id, "runsOn", pass.runsOn, supportedRunLocations);
  if (pass.cacheKey !== undefined) {
    assertStringArray(pass.id, "cacheKey", pass.cacheKey);
  }
  if (pass.lifecycle !== undefined) {
    assertSupportedValue(
      pass.id,
      "lifecycle.cache",
      pass.lifecycle.cache,
      supportedCacheModes,
    );
    assertSupportedValue(
      pass.id,
      "lifecycle.resourceScope",
      pass.lifecycle.resourceScope,
      supportedResourceScopes,
    );
  }
  if (pass.cost !== undefined) {
    assertStringArray(pass.id, "cost.dimensions", pass.cost.dimensions);
    assertSupportedValue(
      pass.id,
      "cost.frequency",
      pass.cost.frequency,
      supportedCostFrequencies,
    );
    assertSupportedValue(
      pass.id,
      "cost.relationship",
      pass.cost.relationship,
      supportedCostRelationships,
    );
  }
}

function clonePass(pass: ToolcraftRenderPass): ToolcraftRenderPass {
  return Object.freeze({
    ...(pass.cacheKey ? { cacheKey: freezeStrings(pass.cacheKey) } : {}),
    ...(pass.cost
      ? {
          cost: Object.freeze({
            dimensions: freezeStrings(pass.cost.dimensions),
            frequency: pass.cost.frequency,
            relationship: pass.cost.relationship,
          }),
        }
      : {}),
    id: pass.id,
    inputs: freezeStrings(pass.inputs),
    invalidatedBy: freezeStrings(pass.invalidatedBy),
    kind: pass.kind,
    ...(pass.lifecycle
      ? {
          lifecycle: Object.freeze({
            cache: pass.lifecycle.cache,
            resourceScope: pass.lifecycle.resourceScope,
          }),
        }
      : {}),
    output: pass.output,
    quality: pass.quality,
    runsOn: pass.runsOn,
  });
}

function cloneInvalidation(
  invalidation: ToolcraftInteractionInvalidation,
): ToolcraftInteractionInvalidation {
  return Object.freeze({
    interaction: invalidation.interaction,
    invalidates: freezeStrings(invalidation.invalidates),
    ...(invalidation.mustNotInvalidate
      ? { mustNotInvalidate: freezeStrings(invalidation.mustNotInvalidate) }
      : {}),
    targets: freezeStrings(invalidation.targets),
  });
}

function assertDeclaredPassReference(
  passIds: ReadonlySet<string>,
  interaction: ToolcraftPipelineInteraction,
  relation: "invalidates" | "mustNotInvalidate",
  passId: string,
): void {
  if (!passIds.has(passId)) {
    throw new Error(
      `Renderer pipeline ${interaction} ${relation} undeclared pass "${passId}".`,
    );
  }
}

function assertCacheKeyNames(pass: ToolcraftRenderPass): void {
  const cache = pass.lifecycle?.cache ?? (pass.cacheKey ? "memoized" : "none");
  if (cache === "none" && pass.cacheKey) {
    throw new Error(
      `Renderer pipeline pass "${pass.id}" with cache "none" cannot declare cacheKey.`,
    );
  }
  if (cache !== "none" && (!pass.cacheKey || pass.cacheKey.length === 0)) {
    throw new Error(
      `Renderer pipeline pass "${pass.id}" with ${cache} cache requires cache key names.`,
    );
  }
  const names = new Set<string>();
  for (const name of pass.cacheKey ?? []) {
    if (!name || name.trim() !== name) {
      throw new Error(
        `Renderer pipeline pass "${pass.id}" cache key names must be non-empty trimmed strings.`,
      );
    }
    if (names.has(name)) {
      throw new Error(
        `Renderer pipeline pass "${pass.id}" cache key name "${name}" must be unique.`,
      );
    }
    names.add(name);
  }
  if (
    cache === "retained-resource" &&
    pass.lifecycle?.resourceScope === "interaction"
  ) {
    throw new Error(
      `Renderer pipeline pass "${pass.id}" cannot retain interaction-scoped resources.`,
    );
  }
  if (
    cache === "retained-resource" &&
    pass.lifecycle?.resourceScope === "call"
  ) {
    throw new Error(
      `Renderer pipeline pass "${pass.id}" cannot retain call-scoped resources.`,
    );
  }
}

export function registerToolcraftRendererPipeline<
  Contracts extends ToolcraftRendererPipelinePassContracts,
>() {
  return <const Descriptor extends ToolcraftRendererPipeline>(
    descriptor: Descriptor &
      ExactContractCoverage<Contracts, Descriptor["passes"]> &
      ValidPipelineCapabilities<Contracts, Descriptor["passes"]>,
  ): ToolcraftRendererPipelineRegistration<Contracts, Descriptor["passes"]> => {
    if (!isRecord(descriptor as unknown)) {
      throw new Error("Renderer pipeline descriptor must be an object.");
    }
    if (!Array.isArray(descriptor.passes)) {
      throw new Error("Renderer pipeline passes must be an array.");
    }
    if (!Array.isArray(descriptor.interactionInvalidation)) {
      throw new Error(
        "Renderer pipeline interactionInvalidation must be an array.",
      );
    }
    if (
      typeof descriptor.runtimeId !== "string" ||
      !descriptor.runtimeId ||
      descriptor.runtimeId.trim() !== descriptor.runtimeId
    ) {
      throw new Error(
        "Executable renderer pipeline registration requires a non-empty trimmed runtimeId.",
      );
    }
    const runtimeId = descriptor.runtimeId;
    const passIds = new Set<string>();
    const handlesById = new Map<string, AnyToolcraftRendererPipelinePassHandle>();
    const definitionsByHandle = new Map<
      AnyToolcraftRendererPipelinePassHandle,
      ToolcraftRenderPass
    >();
    const normalizedPasses = descriptor.passes.map((sourcePass, index) => {
      if (!isRecord(sourcePass as unknown)) {
        throw new Error(`Renderer pipeline pass at index ${index} must be an object.`);
      }
      if (
        typeof sourcePass.id !== "string" ||
        !sourcePass.id ||
        sourcePass.id.trim() !== sourcePass.id
      ) {
        throw new Error("Renderer pipeline pass ids must be non-empty trimmed strings.");
      }
      if (passIds.has(sourcePass.id)) {
        throw new Error(`Renderer pipeline pass id "${sourcePass.id}" must be unique.`);
      }
      assertPassShape(sourcePass);
      assertCacheKeyNames(sourcePass);
      passIds.add(sourcePass.id);
      const pass = clonePass(sourcePass);
      const handle: AnyToolcraftRendererPipelinePassHandle = Object.freeze({
        [passHandleType]: Object.freeze({
          cacheKey: undefined,
          contract: undefined,
          resource: undefined,
        }),
        id: pass.id,
      });
      handlesById.set(pass.id, handle);
      definitionsByHandle.set(handle, pass);
      return pass;
    });
    const passes = Object.freeze(normalizedPasses) as NormalizedPasses<
      Descriptor["passes"]
    >;
    const interactionInvalidation = descriptor.interactionInvalidation.map(
      (sourceInvalidation, index) => {
        assertInvalidationShape(sourceInvalidation, index);
        if (!supportedInteractions.has(sourceInvalidation.interaction)) {
          throw new Error(
            `Renderer pipeline interaction "${String(sourceInvalidation.interaction)}" is not supported.`,
          );
        }
        const invalidation = cloneInvalidation(sourceInvalidation);
        for (const passId of invalidation.invalidates) {
          assertDeclaredPassReference(
            passIds,
            invalidation.interaction,
            "invalidates",
            passId,
          );
        }
        for (const passId of invalidation.mustNotInvalidate ?? []) {
          assertDeclaredPassReference(
            passIds,
            invalidation.interaction,
            "mustNotInvalidate",
            passId,
          );
        }
        return invalidation;
      },
    );
    const getPass = ((passId: string) => {
      const handle = handlesById.get(passId);
      if (!handle) {
        throw new Error(
          `Renderer pipeline registration "${runtimeId}" has no pass "${passId}".`,
        );
      }
      return handle;
    }) as ToolcraftRendererPipelineRegistration<
      Contracts,
      Descriptor["passes"]
    >["getPass"];
    const registration: ToolcraftRendererPipelineRegistration<
      Contracts,
      Descriptor["passes"]
    > = Object.freeze({
      [registrationType]: (contracts: Contracts) => contracts,
      getPass,
      interactionInvalidation: Object.freeze(interactionInvalidation),
      passes,
      runtimeId,
    });
    registrationInternals.set(registration, { definitionsByHandle, handlesById });
    return registration;
  };
}

export function isToolcraftRendererPipelineRegistration(
  value: unknown,
): value is AnyToolcraftRendererPipelineRegistration {
  return typeof value === "object" && value !== null && registrationInternals.has(value);
}

export function getToolcraftRendererPipelinePassDefinition<
  Registration extends AnyToolcraftRendererPipelineRegistration,
  Handle extends AnyToolcraftRendererPipelinePassHandle,
>(registration: Registration, handle: Handle): ToolcraftRenderPass {
  const definition = registrationInternals
    .get(registration)
    ?.definitionsByHandle.get(handle);
  if (!definition) {
    throw new Error(
      `Renderer pipeline pass "${handle.id}" does not belong to registration "${registration.runtimeId}".`,
    );
  }
  return definition;
}
