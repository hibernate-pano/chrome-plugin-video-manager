import { SITE_SPEEDS_KEY } from '../shared/types';

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
 * 对用户完全无界面——它只是让"刷新不丢"成为默认行为。
 * 数据存于 storage.local（不占 sync 配额）。
 */
export class SiteSpeedMemory {
  private speeds = new Map<string, number>();
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  async load() {
    const speeds = await getLocalValue<Record<string, number>>(SITE_SPEEDS_KEY);
    this.speeds = new Map(Object.entries(speeds ?? {}));
    this.loaded = true;
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

  destroy() {
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
      void this.persist();
    }, SAVE_DEBOUNCE_MS);
  }

  private async persist() {
    await setLocalValue(SITE_SPEEDS_KEY, Object.fromEntries(this.speeds));
  }
}
