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
  /** 是否有改动还没落盘；没有待保存改动时 flush 保持只读，避免无谓写。 */
  private dirty = false;
  // 存成稳定的函数引用，destroy 时才能精确移除同一个监听器。
  private readonly handlePageHide = () => {
    this.flush();
  };

  async load() {
    const speeds = await getLocalValue<Record<string, number>>(SITE_SPEEDS_KEY);
    this.speeds = new Map(Object.entries(speeds ?? {}));
    this.loaded = true;
    // 刷新/关标签时浏览器不会等 800ms debounce 跑完：最后一次调速若还没落盘就
    // 永久丢失，直接违背 README 承诺的"刷新/重开自动恢复"。pagehide 覆盖刷新、
    // 关标签、前进后退以及 bfcache 进入，比 beforeunload 更可靠。
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.handlePageHide);
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
    // 先落盘再清理：只清 timer 会让 pending 的最后一次调速随风而逝。
    this.flush();

    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.handlePageHide);
    }
  }

  /** 立即把 pending 改动落盘，并取消 debounce 定时器。 */
  private flush() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (!this.dirty) {
      return;
    }

    void this.persist();
  }

  private scheduleSave() {
    this.dirty = true;

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, SAVE_DEBOUNCE_MS);
  }

  private async persist() {
    this.dirty = false;
    await setLocalValue(SITE_SPEEDS_KEY, Object.fromEntries(this.speeds));
  }
}
