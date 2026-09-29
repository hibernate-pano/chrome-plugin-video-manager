import {
  DEFAULT_MAX_SPEED,
  DEFAULT_PRESET_SPEEDS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SITE_SPEED_MEMORY,
  DEFAULT_SPACE_TOGGLE_PLAY,
  LEGACY_SHORTCUTS_KEY,
  MAX_SPEED_MAX,
  MAX_SPEED_MIN,
  PersistedSettings,
  PRESET_SPEED_MAX,
  PRESET_SPEED_MIN,
  STORAGE_KEY,
  ShortcutSettings,
} from './types';
import { normalizeShortcutSettings } from './shortcuts';

type StorageNamespace = 'sync' | 'local';

const inMemoryStorage = new Map<string, unknown>();

const hasChromeStorage = () =>
  typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined';

const getRuntimeError = () => {
  if (typeof chrome === 'undefined' || typeof chrome.runtime === 'undefined') {
    return null;
  }

  return chrome.runtime.lastError ?? null;
};

const rejectOnRuntimeError = (
  reject: (reason?: unknown) => void,
  resolve: () => void,
) => {
  const error = getRuntimeError();
  if (error) {
    reject(new Error(error.message));
    return;
  }

  resolve();
};

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

  return new Promise<T | undefined>((resolve, reject) => {
    storageArea.get(key, (result) => {
      const error = getRuntimeError();
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(result[key] as T | undefined);
    });
  });
};

const setValue = async (namespace: StorageNamespace, key: string, value: unknown): Promise<void> => {
  const storageArea = getChromeStorageArea(namespace);
  if (!storageArea) {
    inMemoryStorage.set(`${namespace}:${key}`, value);
    return;
  }

  return new Promise<void>((resolve, reject) => {
    storageArea.set({ [key]: value }, () => rejectOnRuntimeError(reject, resolve));
  });
};

const removeValue = async (namespace: StorageNamespace, key: string): Promise<void> => {
  const storageArea = getChromeStorageArea(namespace);
  if (!storageArea) {
    inMemoryStorage.delete(`${namespace}:${key}`);
    return;
  }

  return new Promise<void>((resolve, reject) => {
    storageArea.remove(key, () => rejectOnRuntimeError(reject, resolve));
  });
};

/**
 * 把 v4 的 legacy shortcuts 映射到 v5 字段。
 * 只映射真实存在的字符串键：缺失的键必须留在结果之外，
 * 否则展开到 normalizePersistedSettings 末尾时，undefined 会覆盖用户已保存的 v5 值。
 */
const migrateLegacyShortcuts = (legacyValue: unknown): Partial<ShortcutSettings> => {
  if (!legacyValue || typeof legacyValue !== 'object') {
    return {};
  }

  const value = legacyValue as Record<string, unknown>;
  const mapped: Partial<ShortcutSettings> = {};
  const assign = (id: keyof ShortcutSettings, raw: unknown) => {
    if (typeof raw === 'string') {
      mapped[id] = raw;
    }
  };

  assign('increaseSpeed', value.increase);
  assign('decreaseSpeed', value.decrease);
  assign('resetSpeed', value.reset);
  assign('fullscreen', value['toggle-fullscreen']);

  return mapped;
};

const roundToTwo = (value: number) => Math.round(value * 100) / 100;

/** 归一化预设速度：非法值回退默认，逐项限制在 [PRESET_SPEED_MIN, PRESET_SPEED_MAX]。 */
export const normalizePresetSpeeds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PRESET_SPEEDS];
  }

  const speeds = value
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    .map((item) => roundToTwo(Math.min(PRESET_SPEED_MAX, Math.max(PRESET_SPEED_MIN, item))));

  return speeds.length > 0 ? speeds : [...DEFAULT_PRESET_SPEEDS];
};

/** 归一化最大速度：非法值回退默认，限制在 [MAX_SPEED_MIN, MAX_SPEED_MAX]。 */
export const normalizeMaxSpeed = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_SPEED;
  }

  return roundToTwo(Math.min(MAX_SPEED_MAX, Math.max(MAX_SPEED_MIN, value)));
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
    presetSpeeds: normalizePresetSpeeds(currentRecord?.presetSpeeds),
    spaceTogglePlay: typeof currentRecord?.spaceTogglePlay === 'boolean'
      ? currentRecord.spaceTogglePlay
      : DEFAULT_SPACE_TOGGLE_PLAY,
    maxSpeed: normalizeMaxSpeed(currentRecord?.maxSpeed),
    siteSpeedMemory: typeof currentRecord?.siteSpeedMemory === 'boolean'
      ? currentRecord.siteSpeedMemory
      : DEFAULT_SITE_SPEED_MEMORY,
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
