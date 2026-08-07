const previousToolcraftNamespace = ["creative", "apps", "kit"].join("-");

export function getPreviousToolcraftStorageKey(storageKey: string): string | null {
  if (!storageKey.startsWith("toolcraft:")) {
    return null;
  }

  return `${previousToolcraftNamespace}${storageKey.slice("toolcraft".length)}`;
}

export function readToolcraftLocalStorageValue(storageKey: string): string | null {
  return readToolcraftLocalStorageEntry(storageKey)?.value ?? null;
}

export type ToolcraftLocalStorageEntry = {
  storageKey: string;
  value: string;
};

export function readToolcraftLocalStorageEntry(
  storageKey: string,
): ToolcraftLocalStorageEntry | null {
  const currentValue = window.localStorage.getItem(storageKey);

  if (currentValue !== null) {
    return { storageKey, value: currentValue };
  }

  const previousStorageKey = getPreviousToolcraftStorageKey(storageKey);

  if (!previousStorageKey) {
    return null;
  }

  const previousValue = window.localStorage.getItem(previousStorageKey);

  if (previousValue === null) {
    return null;
  }

  return { storageKey: previousStorageKey, value: previousValue };
}

export function removeToolcraftLocalStorageValue(storageKey: string): void {
  window.localStorage.removeItem(storageKey);

  const previousStorageKey = getPreviousToolcraftStorageKey(storageKey);

  if (previousStorageKey) {
    window.localStorage.removeItem(previousStorageKey);
  }
}
