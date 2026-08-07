import type { Group } from "three";

import { decodeToolcraftModelDocument } from "../../model-import/canonical/model-document-codec";
import { digestToolcraftModelDocument } from "../../model-import/canonical/model-document-digest";
import type { ToolcraftModelDocument } from "../../model-import/canonical/model-document";
import {
  parseToolcraftModelDocumentResourceRef,
} from "../../model-import/model-source-asset-handler-resources";
import { digestModelSourceBytes } from "../../model-import/model-source-digest";
import type {
  ToolcraftModelPresentationAcquirer,
  ToolcraftModelPresentationLease,
  ToolcraftModelResourceResolver,
} from "./model-render-binding";
import {
  buildToolcraftCanonicalThreeModel,
  type ToolcraftCanonicalThreeModel,
} from "./three-canonical-model";
import {
  createToolcraftThreeModelAppearance,
  type ToolcraftThreeModelAppearance,
} from "./three-model-appearance";

const PRESENTATION_ADAPTER_VERSION = "toolcraft-three-presentation@1";

type SharedPresentation = Readonly<{
  appearance: ToolcraftThreeModelAppearance;
  bitmaps: readonly ImageBitmap[];
  built: ToolcraftCanonicalThreeModel;
  document: ToolcraftModelDocument;
}>;

type PendingEntry = {
  controller: AbortController;
  key: string;
  promise: Promise<ReadyEntry>;
  releaseReachability: () => void;
  state: "failed" | "pending";
  waiters: number;
};

type ReadyEntry = {
  disposed: boolean;
  key: string;
  pendingAcquisitions: number;
  refCount: number;
  releaseReachability: () => void;
  shared: SharedPresentation;
  state: "ready";
};

type CacheEntry = PendingEntry | ReadyEntry;

export type ToolcraftModelPresentationResourceManager = Readonly<{
  acquirePresentation: ToolcraftModelPresentationAcquirer;
  dispose(): void;
  inspectResourceCounters(): ToolcraftModelPresentationResourceCounters;
}>;

export type ToolcraftModelPresentationResourceCounters = Readonly<{
  acquired: number;
  active: number;
  cacheHits: number;
  disposed: number;
  released: number;
}>;

export type ToolcraftModelPresentationResourceManagerOptions = Readonly<{
  createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>;
  onAppearanceResourceFailure?: (failure: Readonly<{
    code:
      | "appearance-resource-decode-failed"
      | "appearance-resource-digest-mismatch"
      | "appearance-resource-dimensions-mismatch"
      | "appearance-resource-missing";
    resourceRef: string;
    textureId: string;
  }>) => void;
  resolveResource: ToolcraftModelResourceResolver;
  retainResourceRef?: (ref: string) => () => void;
}>;

function abortError(): DOMException {
  return new DOMException("Model presentation acquisition was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function ownedBytes(
  value: ArrayBuffer | Uint8Array,
): Uint8Array<ArrayBuffer> {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function waitForSignal<Result>(
  promise: Promise<Result>,
  signal: AbortSignal,
): Promise<Result> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function loadTextureBitmaps(
  document: ToolcraftModelDocument,
  resolveResource: ToolcraftModelResourceResolver,
  createImage: ((blob: Blob) => Promise<ImageBitmap>) | undefined,
  reportFailure: ToolcraftModelPresentationResourceManagerOptions[
    "onAppearanceResourceFailure"
  ],
  signal: AbortSignal,
): Promise<Readonly<{
  bitmaps: readonly ImageBitmap[];
  byTextureId: ReadonlyMap<string, ImageBitmap>;
}>> {
  const bitmaps: ImageBitmap[] = [];
  const byTextureId = new Map<string, ImageBitmap>();
  const byResourceRef = new Map<string, ImageBitmap>();
  if (document.version === 1 || !createImage) {
    return Object.freeze({ bitmaps, byTextureId });
  }
  try {
    for (const texture of document.textures) {
      throwIfAborted(signal);
      const retained = byResourceRef.get(texture.resourceRef);
      if (retained) {
        byTextureId.set(texture.id, retained);
        continue;
      }
      const resolved = await resolveResource(texture.resourceRef, { signal });
      throwIfAborted(signal);
      if (resolved === null) {
        reportFailure?.({
          code: "appearance-resource-missing",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      const bytes = ownedBytes(resolved);
      if (digestModelSourceBytes(bytes) !== texture.contentDigest) {
        reportFailure?.({
          code: "appearance-resource-digest-mismatch",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImage(new Blob([bytes], { type: texture.mimeType }));
      } catch {
        throwIfAborted(signal);
        reportFailure?.({
          code: "appearance-resource-decode-failed",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      if (
        signal.aborted ||
        bitmap.width !== texture.width ||
        bitmap.height !== texture.height
      ) {
        bitmap.close();
        throwIfAborted(signal);
        reportFailure?.({
          code: "appearance-resource-dimensions-mismatch",
          resourceRef: texture.resourceRef,
          textureId: texture.id,
        });
        continue;
      }
      bitmaps.push(bitmap);
      byResourceRef.set(texture.resourceRef, bitmap);
      byTextureId.set(texture.id, bitmap);
    }
    return Object.freeze({
      bitmaps: Object.freeze(bitmaps),
      byTextureId,
    });
  } catch (error) {
    for (const bitmap of bitmaps) bitmap.close();
    throw error;
  }
}

async function loadSharedPresentation(
  ref: string,
  options: ToolcraftModelPresentationResourceManagerOptions,
  signal: AbortSignal,
): Promise<SharedPresentation> {
  const resolved = await options.resolveResource(ref, { signal });
  throwIfAborted(signal);
  if (resolved === null) {
    throw new Error(`Canonical model resource "${ref}" is unavailable.`);
  }
  const document = decodeToolcraftModelDocument(ownedBytes(resolved));
  const expectedDigest = parseToolcraftModelDocumentResourceRef(ref);
  if (
    expectedDigest !== null &&
    digestToolcraftModelDocument(document) !== expectedDigest
  ) {
    throw new Error(`Canonical model resource "${ref}" failed verification.`);
  }
  const decoded = await loadTextureBitmaps(
    document,
    options.resolveResource,
    options.createImageBitmap ?? globalThis.createImageBitmap?.bind(globalThis),
    options.onAppearanceResourceFailure,
    signal,
  );
  throwIfAborted(signal);
  const appearance = createToolcraftThreeModelAppearance(
    document,
    decoded.byTextureId,
  );
  try {
    const built = buildToolcraftCanonicalThreeModel(
      document,
      appearance.materialForPrimitive,
    );
    throwIfAborted(signal);
    return Object.freeze({
      appearance,
      bitmaps: decoded.bitmaps,
      built,
      document,
    });
  } catch (error) {
    appearance.dispose();
    for (const bitmap of decoded.bitmaps) bitmap.close();
    throw error;
  }
}

function disposeSharedPresentation(shared: SharedPresentation): void {
  for (const geometry of new Set(shared.built.geometries)) geometry.dispose();
  shared.appearance.dispose();
  for (const bitmap of shared.bitmaps) bitmap.close();
  shared.built.modelRoot.clear();
}

function idempotentRelease(release: () => void): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}

export function createToolcraftModelPresentationResourceManager(
  options: ToolcraftModelPresentationResourceManagerOptions,
): ToolcraftModelPresentationResourceManager {
  const entries = new Map<string, CacheEntry>();
  const activeRoots = new Set<Group>();
  let disposed = false;
  let acquiredCount = 0;
  let cacheHitCount = 0;
  let disposedCount = 0;
  let releasedCount = 0;

  const disposeReadyIfUnowned = (entry: ReadyEntry): void => {
    if (entry.refCount !== 0 || entry.pendingAcquisitions !== 0) return;
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    if (entry.disposed) return;
    entry.disposed = true;
    disposedCount += 1;
    disposeSharedPresentation(entry.shared);
    entry.releaseReachability();
  };

  const startPending = (ref: string, key: string): PendingEntry => {
    const controller = new AbortController();
    const releaseReachability = idempotentRelease(
      options.retainResourceRef?.(ref) ?? (() => undefined),
    );
    const pending: PendingEntry = {
      controller,
      key,
      promise: Promise.resolve(undefined as unknown as ReadyEntry),
      releaseReachability,
      state: "pending" as const,
      waiters: 0,
    };
    pending.promise = loadSharedPresentation(ref, options, controller.signal)
      .then((shared) => {
        if (disposed || controller.signal.aborted || entries.get(key) !== pending) {
          disposedCount += 1;
          disposeSharedPresentation(shared);
          throw abortError();
        }
        const ready: ReadyEntry = {
          disposed: false,
          key,
          pendingAcquisitions: pending.waiters,
          refCount: 0,
          releaseReachability,
          shared,
          state: "ready",
        };
        entries.set(key, ready);
        return ready;
      }).catch((error: unknown) => {
        pending.state = "failed";
        if (entries.get(key) === pending) entries.delete(key);
        releaseReachability();
        throw error;
      });
    entries.set(key, pending);
    return pending;
  };

  const leaseFromReady = (
    entry: ReadyEntry,
    signal: AbortSignal,
  ): ToolcraftModelPresentationLease => {
    throwIfAborted(signal);
    const root = entry.shared.built.modelRoot.clone(true);
    throwIfAborted(signal);
    entry.refCount += 1;
    acquiredCount += 1;
    activeRoots.add(root);
    let released = false;
    return Object.freeze({
      bounds: entry.shared.document.bounds,
      document: entry.shared.document,
      release: () => {
        if (released) return;
        released = true;
        if (!activeRoots.delete(root)) return;
        releasedCount += 1;
        root.removeFromParent();
        root.clear();
        entry.refCount -= 1;
        disposeReadyIfUnowned(entry);
      },
      root,
    });
  };

  return Object.freeze({
    acquirePresentation: async (ref, acquireOptions) => {
      throwIfAborted(acquireOptions.signal);
      if (disposed) throw new Error("Model presentation manager is disposed.");
      const key = `${PRESENTATION_ADAPTER_VERSION}:${ref}`;
      const current = entries.get(key);
      if (current?.state === "ready") {
        cacheHitCount += 1;
        return leaseFromReady(current, acquireOptions.signal);
      }
      if (current?.state === "failed") entries.delete(key);
      if (current?.state === "pending") cacheHitCount += 1;
      const pending = current?.state === "pending"
        ? current
        : startPending(ref, key);
      pending.waiters += 1;
      let ready: ReadyEntry | undefined;
      try {
        ready = await waitForSignal(pending.promise, acquireOptions.signal);
        return leaseFromReady(ready, acquireOptions.signal);
      } finally {
        const cached = entries.get(key);
        if (cached?.state === "pending") {
          cached.waiters -= 1;
          if (cached.waiters === 0) cached.controller.abort();
        } else if (ready && cached === ready) {
          ready.pendingAcquisitions -= 1;
          disposeReadyIfUnowned(ready);
        }
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      releasedCount += activeRoots.size;
      for (const root of activeRoots) {
        root.removeFromParent();
        root.clear();
      }
      activeRoots.clear();
      for (const entry of entries.values()) {
        if (entry.state !== "ready") {
          entry.controller.abort();
          entry.releaseReachability();
        } else {
          entry.disposed = true;
          disposedCount += 1;
          disposeSharedPresentation(entry.shared);
          entry.releaseReachability();
        }
      }
      entries.clear();
    },
    inspectResourceCounters: () => Object.freeze({
      acquired: acquiredCount,
      active: activeRoots.size,
      cacheHits: cacheHitCount,
      disposed: disposedCount,
      released: releasedCount,
    }),
  });
}
