import {
  DEFAULT_SHORTCUTS,
  FIRST_RUN_HINT_KEY,
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

/**
 * 只读路径：只 getValue + normalize，绝不写盘。
 * 写盘必须留给调用方按需决定：内容脚本每次启动都会 loadSettings，
 * 若这里无条件 set，就会用 sync 配额做无意义的同值写，还多一次 legacy 键 remove。
 */
const readSettings = async (): Promise<{
  settings: PersistedSettings;
  rawStored: unknown;
  legacyShortcuts: unknown;
}> => {
  const [rawStored, legacyShortcuts] = await Promise.all([
    getValue<unknown>('sync', STORAGE_KEY),
    getValue<unknown>('sync', LEGACY_SHORTCUTS_KEY),
  ]);

  return {
    settings: normalizePersistedSettings(rawStored, legacyShortcuts),
    rawStored,
    legacyShortcuts,
  };
};

export const loadSettings = async (): Promise<PersistedSettings> => {
  const { settings, rawStored, legacyShortcuts } = await readSettings();

  // 已存的原始值重新规范化后与结果一致，说明无需再写：第一次播种（rawStored 为
  // undefined）及需要迁移/纠偏时才落盘。normalizePersistedSettings(rawStored) 不传
  // legacy，只用来判断"存盘值本身是否已是规范形"。
  const storedAlreadyNormalized = rawStored !== undefined
    && JSON.stringify(normalizePersistedSettings(rawStored)) === JSON.stringify(settings);

  if (!storedAlreadyNormalized) {
    await setValue('sync', STORAGE_KEY, settings);
  }

  if (legacyShortcuts !== undefined) {
    await removeValue('sync', LEGACY_SHORTCUTS_KEY);
  }

  return settings;
};

export const saveSettings = async (settings: PersistedSettings): Promise<void> => {
  const normalized = normalizePersistedSettings(settings);
  await setValue('sync', STORAGE_KEY, normalized);
  await removeValue('sync', LEGACY_SHORTCUTS_KEY);
};

/**
 * 首次使用引导是否已经展示过。
 *
 * 存在 storage.local 而不是 sync：这是「这台设备上打扰过没有」的设备级状态。
 * 放 sync 会让它在用户所有设备间同步，等于在新设备上少提示一次；
 * 而且它是纯内容脚本状态，没必要占用 sync 配额。
 */
export const wasFirstRunHintShown = async (): Promise<boolean> =>
  (await getValue<unknown>('local', FIRST_RUN_HINT_KEY)) === true;

export const markFirstRunHintShown = async (): Promise<void> => {
  await setValue('local', FIRST_RUN_HINT_KEY, true);
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

    // 只读重算并喂给 listener：变更回调里再写盘会与触发本次变更的写入形成写放大。
    void readSettings().then(({ settings }) => listener(settings));
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};
