import {
  DEFAULT_SHORTCUTS,
  FIRST_RUN_HINT_KEY,
  LEGACY_SITE_SPEEDS_KEY,
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

/**
 * 首次引导的失败次数（storage.local）。
 *
 * 「失败」= 引导弹出来了，用户在读完之前**主动把它关掉了**（点了页面）。
 *
 * ⚠️ 键盘上随手一按（Shift、Ctrl、随便一个字母）**不算**失败：
 * 那是碰键盘，不是拒绝。原来这两种情况都记一次失败，于是「按一下 Shift」
 * 三次就能把引导永久毁掉 —— 而引导是这个产品**唯一**的可见入口。
 */
export const FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY = 'vsc-first-run-hint-failed-attempts';

/**
 * 首次引导的冷却截止时间（storage.local，毫秒时间戳）。
 *
 * ⚠️ 为什么是「冷却」而不是「终身沉默」：
 * 引导是全键盘界面下唯一的可见入口，永久沉默等于让用户永远发现不了功能。
 * 冷却到期就重新给一次机会 —— 打扰是有上限的，不是没有出口。
 */
export const FIRST_RUN_HINT_COOLDOWN_KEY = 'vsc-first-run-hint-cooldown-until';

/** 连续失败多少次之后进入冷却。 */
export const FIRST_RUN_HINT_MAX_FAILED_ATTEMPTS = 3;

/**
 * 冷却时长：1 天。
 *
 * ⚠️ 原来是 7 天，太长了：引导是**全键盘界面下唯一的可见入口**，
 * 用户在这个产品里唯一能看到的界面就是这一条提示。冷他 7 天，
 * 等于「这个扩展对我没用」被写进了产品里。
 *
 * 现在只有「用户主动关掉引导」才会记失败（误点页面不算 ——
 * 见 firstRunHint.ts 里的判据），1 天的冷却足够让用户冷静，
 * 又不至于让功能从此消失。
 */
export const FIRST_RUN_HINT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** 连续失败次数（读不出来当 0）。 */
export const readFirstRunHintFailedAttempts = async (): Promise<number> => {
  const value = await getValue<unknown>('local', FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY);
  return typeof value === 'number' ? value : 0;
};

/**
 * 记一次失败，并在达到上限时**进入冷却**。
 *
 * ⚠️ 计数与冷却必须一起做：只记计数而不记冷却时间，冷却就无从判断到期没有；
 * 只记冷却而不清计数，冷却结束后又会立刻被旧计数顶回冷却里。
 */
export const recordFirstRunHintFailedAttempt = async (): Promise<void> => {
  const next = (await readFirstRunHintFailedAttempts()) + 1;
  await setValue('local', FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY, next);

  if (next >= FIRST_RUN_HINT_MAX_FAILED_ATTEMPTS) {
    await setValue('local', FIRST_RUN_HINT_COOLDOWN_KEY, Date.now() + FIRST_RUN_HINT_COOLDOWN_MS);
  }
};

/** 清空失败计数与冷却（用户读过一次、或在设置页里手动重置时用）。 */
export const clearFirstRunHintFailures = async (): Promise<void> => {
  await setValue('local', FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY, 0);
  await removeValue('local', FIRST_RUN_HINT_COOLDOWN_KEY);
};

/**
 * 此刻是不是在冷却期里（冷却期内不再弹引导）。
 *
 * 冷却到期时顺手把痕迹清干净：下一轮的失败计数从零开始，
 * 而不是接着上一轮继续数 —— 否则用户会莫名其妙地又进一次冷却。
 */
export const isFirstRunHintInCooldown = async (): Promise<boolean> => {
  const until = await getValue<unknown>('local', FIRST_RUN_HINT_COOLDOWN_KEY);
  if (typeof until !== 'number') {
    return false;
  }

  if (Date.now() < until) {
    return true;
  }

  await clearFirstRunHintFailures();
  return false;
};

/**
 * 冷却截止时间（毫秒时间戳）；不在冷却期里就是 null。
 *
 * 设置页用它把「为什么引导不出现」显示出来 ——
 * 冷却期是完全静默的（界面上一个字都没有），用户只能猜。
 */
export const readFirstRunHintCooldownUntil = async (): Promise<number | null> => {
  const until = await getValue<unknown>('local', FIRST_RUN_HINT_COOLDOWN_KEY);
  if (typeof until !== 'number') {
    return null;
  }

  return Date.now() < until ? until : null;
};

/**
 * 清掉引导的全部状态，让它下次遇到视频时重新出现。
 *
 * 设置页的「重新显示使用引导」按钮走这条路：一次性清掉「已展示」、
 * 失败计数与冷却时间戳 —— 缺一个都不行（只清「已展示」的话，
 * 冷却期内的用户点了按钮仍然看不到引导）。
 */
export const resetFirstRunHintState = async (): Promise<void> => {
  await removeValue('local', FIRST_RUN_HINT_KEY);
  await removeValue('local', FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY);
  await removeValue('local', FIRST_RUN_HINT_COOLDOWN_KEY);
};

/**
 * 清掉 6.0.7 起废弃的站点速度记忆表。
 *
 * 功能已删除，但老用户机器上仍留着 `vsc-site-speeds`——它记录了用户访问过哪些
 * 站点并带着播放速度偏好，属于不该继续留存的历史数据。启动时清一次即可：
 * 键不存在时 remove 是空操作，不值得为此加重试或版本判断。
 */
export const purgeLegacySiteSpeeds = async (): Promise<void> => {
  await removeValue('local', LEGACY_SITE_SPEEDS_KEY);
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
    //
    // ⚠️ 必须带 .catch()：getValue 在 chrome.runtime.lastError 非空时会 reject，
    // 而这里是一条**没人接**的 promise —— 读失败会以
    // "Uncaught (in promise) Error: ..." 的形式打到内容脚本的控制台里，
    // 让一次无关紧要的存储故障变成一条刺眼的未捕获异常。
    // 读不到就当这次变更没发生（与 purgeLegacySiteSpeeds 的「失败无所谓」
    // 同一套约定）。
    void readSettings()
      .then(({ settings }) => listener(settings))
      .catch(() => {});
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};

/**
 * 引导状态（storage.local）变化的信号。
 *
 * - `shownCleared`：「已展示」标记被**删除**了 —— 这正是设置页的
 *   「重新显示使用引导」按钮做的事（resetFirstRunHintState）。
 * - `cooldownCleared`：冷却时间戳被删掉了 —— 冷却结束或被重置。
 */
export interface FirstRunHintStateChange {
  shownCleared: boolean;
  cooldownCleared: boolean;
}

/**
 * 订阅引导状态（storage.local）的变化。
 *
 * ⚠️ 为什么不能复用 `subscribeToSettings`：那个只监听 **sync** 命名空间
 * （快捷键在那儿），而引导状态在 **local** —— onChanged 的第二个参数
 * 就是命名空间，sync 的监听器**根本收不到** local 的变更。
 *
 * ⚠️ 没有这条通道时「重新显示使用引导」是哑的：设置页只清 storage，
 * 而内容脚本把「本会话已展示」记在**内存**里且永不复位 ——
 * 于是用户点了按钮、切回标签页，什么都没发生（必须手动刷新页面，
 * 而界面从头到尾没说这一点）。
 *
 * @param listener 状态变化时的回调。
 */
export const subscribeToFirstRunHintState = (
  listener: (change: FirstRunHintStateChange) => void,
): (() => void) => {
  if (!hasChromeStorage() || !chrome.storage.onChanged) {
    return () => {};
  }

  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    namespace: string,
  ) => {
    if (namespace !== 'local') {
      return;
    }

    const shown = changes[FIRST_RUN_HINT_KEY];
    const cooldown = changes[FIRST_RUN_HINT_COOLDOWN_KEY];
    const attempts = changes[FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY];

    if (!shown && !cooldown && !attempts) {
      return;
    }

    // ⚠️ 只有**删除**才算「重置」：
    // markFirstRunHintShown 把标记写成 true（那是「用户读过了」），
    // clearFirstRunHintFailures 把失败计数写成 0（那是「用户读过了」的清理）——
    // 这两个都不是「请再来一次」，不能当成重置信号。
    listener({
      shownCleared: shown !== undefined && shown.newValue === undefined,
      cooldownCleared: cooldown !== undefined && cooldown.newValue === undefined,
    });
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};
