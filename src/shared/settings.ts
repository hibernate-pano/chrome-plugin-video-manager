import {
  DEFAULT_SHORTCUTS,
  LEGACY_SHORTCUTS_KEY,
  PersistedSettings,
  STORAGE_KEY,
  ShortcutSettings,
} from './types';
import { normalizeShortcutSettings } from './shortcuts';

type StorageNamespace = 'sync' | 'local';

const inMemoryStorage = new Map<string, unknown>();

const hasChromeStorage = () =>
  typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined';

const getChromeStorageArea = (namespace: StorageNamespace) => {
  if (!hasChromeStorage()) {
    return null;
  }

  return namespace === 'sync' ? chrome.storage.sync : chrome.storage.local;
};

const getValue = async <T>(namespace: StorageNamespace, key: string): Promise<T | undefined> => {
  const storageArea = getChromeStorageArea(namespace);
  if (!storageArea) {
    return inMemoryStorage.get(`${namespace}:${key}`) as T | undefined;
  }

  return new Promise<T | undefined>((resolve) => {
    storageArea.get(key, (result) => resolve(result[key] as T | undefined));
  });
};

const setValue = async (namespace: StorageNamespace, key: string, value: unknown): Promise<void> => {
  const storageArea = getChromeStorageArea(namespace);
  if (!storageArea) {
    inMemoryStorage.set(`${namespace}:${key}`, value);
    return;
  }

  return new Promise<void>((resolve) => {
    storageArea.set({ [key]: value }, () => resolve());
  });
};

const removeValue = async (namespace: StorageNamespace, key: string): Promise<void> => {
  const storageArea = getChromeStorageArea(namespace);
  if (!storageArea) {
    inMemoryStorage.delete(`${namespace}:${key}`);
    return;
  }

  return new Promise<void>((resolve) => {
    storageArea.remove(key, () => resolve());
  });
};

const migrateLegacyShortcuts = (legacyValue: unknown): Partial<ShortcutSettings> => {
  if (!legacyValue || typeof legacyValue !== 'object') {
    return {};
  }

  const value = legacyValue as Record<string, unknown>;
  return {
    increaseSpeed: typeof value.increase === 'string' ? value.increase : undefined,
    decreaseSpeed: typeof value.decrease === 'string' ? value.decrease : undefined,
    resetSpeed: typeof value.reset === 'string' ? value.reset : undefined,
    fullscreen: typeof value['toggle-fullscreen'] === 'string' ? value['toggle-fullscreen'] : undefined,
  };
};

export const normalizePersistedSettings = (
  currentValue: unknown,
  legacyValue?: unknown,
): PersistedSettings => {
  const currentRecord = currentValue && typeof currentValue === 'object'
    ? currentValue as Record<string, unknown>
    : null;

  const shortcutsCandidate = currentRecord && 'shortcuts' in currentRecord
    ? currentRecord.shortcuts
    : currentRecord;

  const legacyShortcuts = migrateLegacyShortcuts(legacyValue);

  return {
    shortcuts: normalizeShortcutSettings({
      ...DEFAULT_SHORTCUTS,
      ...(shortcutsCandidate as Partial<ShortcutSettings> | null ?? {}),
      ...legacyShortcuts,
    }),
  };
};

export const loadSettings = async (): Promise<PersistedSettings> => {
  const [storedSettings, legacyShortcuts] = await Promise.all([
    getValue<unknown>('sync', STORAGE_KEY),
    getValue<unknown>('sync', LEGACY_SHORTCUTS_KEY),
  ]);

  const normalized = normalizePersistedSettings(storedSettings, legacyShortcuts);
  await setValue('sync', STORAGE_KEY, normalized);

  if (legacyShortcuts !== undefined) {
    await removeValue('sync', LEGACY_SHORTCUTS_KEY);
  }

  return normalized;
};

export const saveSettings = async (settings: PersistedSettings): Promise<void> => {
  const normalized = normalizePersistedSettings(settings);
  await setValue('sync', STORAGE_KEY, normalized);
  await removeValue('sync', LEGACY_SHORTCUTS_KEY);
};

export const subscribeToSettings = (
  listener: (settings: PersistedSettings) => void,
): (() => void) => {
  if (!hasChromeStorage()) {
    return () => {};
  }

  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    namespace: string,
  ) => {
    if (namespace !== 'sync') {
      return;
    }

    if (!changes[STORAGE_KEY] && !changes[LEGACY_SHORTCUTS_KEY]) {
      return;
    }

    void loadSettings().then(listener);
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};
