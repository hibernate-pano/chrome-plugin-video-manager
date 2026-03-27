type StorageAreaName = 'local' | 'sync';

const memoryFallback = new Map<string, string>();

const hasChromeStorage = () =>
  typeof chrome !== 'undefined'
  && typeof chrome.storage !== 'undefined';

const getStorageArea = (area: StorageAreaName) => {
  if (!hasChromeStorage()) {
    return null;
  }

  return area === 'sync' ? chrome.storage.sync : chrome.storage.local;
};

const getFallbackValue = <T>(key: string, fallback: T): T => {
  if (typeof localStorage === 'undefined') {
    return fallback;
  }

  const raw = localStorage.getItem(key) ?? memoryFallback.get(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const setFallbackValue = (key: string, value: unknown) => {
  const raw = JSON.stringify(value);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, raw);
    return;
  }

  memoryFallback.set(key, raw);
};

export const extensionStorage = {
  async get<T>(area: StorageAreaName, key: string, fallback: T): Promise<T> {
    const storageArea = getStorageArea(area);

    if (!storageArea) {
      return getFallbackValue(key, fallback);
    }

    return new Promise<T>((resolve) => {
      storageArea.get({ [key]: fallback }, (result) => {
        resolve((result[key] as T) ?? fallback);
      });
    });
  },

  async set(area: StorageAreaName, key: string, value: unknown): Promise<void> {
    const storageArea = getStorageArea(area);

    if (!storageArea) {
      setFallbackValue(key, value);
      return;
    }

    return new Promise<void>((resolve) => {
      storageArea.set({ [key]: value }, () => resolve());
    });
  },

  async remove(area: StorageAreaName, key: string): Promise<void> {
    const storageArea = getStorageArea(area);

    if (!storageArea) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
      memoryFallback.delete(key);
      return;
    }

    return new Promise<void>((resolve) => {
      storageArea.remove(key, () => resolve());
    });
  },

  subscribe(
    area: StorageAreaName,
    key: string,
    listener: (nextValue: unknown) => void,
  ): (() => void) | undefined {
    if (!hasChromeStorage()) {
      return undefined;
    }

    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      namespace: string,
    ) => {
      if (namespace !== area || !changes[key]) {
        return;
      }

      listener(changes[key].newValue);
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  },
};
