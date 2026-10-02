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

/**
 * v5 用 `spaceTogglePlay: false` 关闭空格播放/暂停；v6 把播放/暂停变成一个
 * 普通的可绑定动作。不迁移的话，用户明明关掉的行为会在升级后自己回来，
 * 所以这里把它翻译成"该动作没有绑定"。
 *
 * 两个参数分别来自不同层级：`spaceTogglePlay` 存在 v5 记录的顶层，
 * 而新的 `togglePlay` 绑定在嵌套的 shortcuts 对象里。
 */
const migrateSpaceToggle = (
  legacyRecord: Record<string, unknown> | null,
  shortcuts: Partial<ShortcutSettings> | null,
): Partial<ShortcutSettings> => {
  if (!legacyRecord) {
    return {};
  }

  // 已经写过显式绑定（v6 记录）时，v5 的开关不再有发言权。
  if (typeof shortcuts?.togglePlay === 'string') {
    return {};
  }

  if (legacyRecord.spaceTogglePlay !== false) {
    return {};
  }

  return { togglePlay: '' };
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
      ...migrateSpaceToggle(currentRecord, shortcutsCandidate as Partial<ShortcutSettings> | null),
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
