import { SITE_MEMORY_DISABLED_KEY, SITE_SPEEDS_KEY } from '../shared/types';

const SAVE_DEBOUNCE_MS = 800;

const hasChromeStorage = () =>
  typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined';

const getLocalValue = <T>(key: string): Promise<T | undefined> => {
  if (!hasChromeStorage()) {
    return Promise.resolve(undefined);
  }

  return new Promise<T | undefined>((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(result[key] as T | undefined);
    });
  });
};

const setLocalValue = (key: string, value: unknown): Promise<void> => {
  if (!hasChromeStorage()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
};

/**
 * 站点速度记忆：按 hostname 记住播放速度，刷新/重开页面后自动恢复。
 * 数据存于 storage.local（不占 sync 配额），支持按站点禁用。
 */
export class SiteSpeedMemory {
  private speeds = new Map<string, number>();
  private disabled = new Set<string>();
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeStorage: (() => void) | null = null;

  async load() {
    const [speeds, disabled] = await Promise.all([
      getLocalValue<Record<string, number>>(SITE_SPEEDS_KEY),
      getLocalValue<Record<string, boolean>>(SITE_MEMORY_DISABLED_KEY),
    ]);

    this.speeds = new Map(Object.entries(speeds ?? {}));
    this.disabled = new Set(
      Object.entries(disabled ?? {})
        .filter(([, value]) => value === true)
        .map(([hostname]) => hostname),
    );
    this.loaded = true;

    if (hasChromeStorage()) {
      this.unsubscribeStorage = this.subscribeToExternalChanges();
    }

    return this;
  }

  /** 是否已从存储加载完成（加载完成前不应用记忆，避免误覆盖）。 */
  isLoaded() {
    return this.loaded;
  }

  getSpeed(hostname: string): number | null {
    if (!this.loaded) {
      return null;
    }

    const speed = this.speeds.get(hostname);
    return typeof speed === 'number' && Number.isFinite(speed) ? speed : null;
  }

  isDisabled(hostname: string) {
    return this.disabled.has(hostname);
  }

  /** 记录某站点当前速度；1x 视为"无记忆"，直接清除。 */
  remember(hostname: string, rate: number) {
    if (!Number.isFinite(rate)) {
      return;
    }

    if (Math.abs(rate - 1) < 1e-6) {
      this.speeds.delete(hostname);
    } else {
      this.speeds.set(hostname, rate);
    }

    this.scheduleSave();
  }

  /** 切换某站点的记忆开关（popup/设置页使用）。 */
  setDisabled(hostname: string, disabled: boolean) {
    if (disabled) {
      this.disabled.add(hostname);
    } else {
      this.disabled.delete(hostname);
    }

    void this.persistDisabled();
  }

  /** 清除全部记忆的速度。 */
  async clearAll() {
    this.speeds.clear();
    await this.persistSpeeds();
  }

  destroy() {
    this.unsubscribeStorage?.();
    this.unsubscribeStorage = null;
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private scheduleSave() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistSpeeds();
    }, SAVE_DEBOUNCE_MS);
  }

  private async persistSpeeds() {
    await setLocalValue(SITE_SPEEDS_KEY, Object.fromEntries(this.speeds));
  }

  private async persistDisabled() {
    await setLocalValue(SITE_MEMORY_DISABLED_KEY, Object.fromEntries([...this.disabled].map((hostname) => [hostname, true])));
  }

  /** 同步其他上下文（popup/设置页）对禁用表的修改。 */
  private subscribeToExternalChanges(): () => void {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      namespace: string,
    ) => {
      if (namespace !== 'local' || !changes[SITE_MEMORY_DISABLED_KEY]) {
        return;
      }

      const next = changes[SITE_MEMORY_DISABLED_KEY].newValue as Record<string, boolean> | undefined;
      this.disabled = new Set(
        Object.entries(next ?? {})
          .filter(([, value]) => value === true)
          .map(([hostname]) => hostname),
      );
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
}
