import { describe, expect, it, vi } from 'vitest';
import { t } from '../shared/i18n';
import {
  DEFAULT_MAX_SPEED,
  DEFAULT_PRESET_SPEEDS,
  DEFAULT_SHORTCUTS,
  GET_STATE_MESSAGE,
  RESET_SPEED_MESSAGE,
  SITE_MEMORY_DISABLED_KEY,
  STORAGE_KEY,
} from '../shared/types';

interface PopupChromeOptions {
  /** storage.sync 里 vsc-settings 的内容；省略即空（走默认配置）。 */
  settings?: Record<string, unknown>;
  /** storage.local 的初始内容。 */
  local?: Record<string, unknown>;
  /** 每次 GET_STATE 的响应，按调用顺序消费；用尽后重复最后一项。 */
  states?: Array<Record<string, unknown> | null>;
  /** vsc-reset-speed 的响应。 */
  resetResponse?: Record<string, unknown> | null;
  /** 让 storage.sync.get 报错，用来验证读取失败时的兜底渲染。 */
  failSyncGet?: boolean;
}

interface PopupChrome {
  /** storage.local 每次 set 的入参，用于断言「本不该写入」。 */
  localSets: Array<Record<string, unknown>>;
  /** 重置模块缓存、挂载 #root 并加载弹窗，返回根节点。 */
  render: () => Promise<HTMLElement>;
}

const DEFAULT_STATE = { speed: 1, playing: true, hostname: 'example.com', hasVideo: true };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const createPopupChrome = (options: PopupChromeOptions = {}): PopupChrome => {
  const sync: Record<string, unknown> = options.settings ? { [STORAGE_KEY]: options.settings } : {};
  const local: Record<string, unknown> = { ...(options.local ?? {}) };
  const localSets: Array<Record<string, unknown>> = [];
  const states = options.states ?? [DEFAULT_STATE];
  let stateCalls = 0;

  const runtime: { lastError: { message: string } | null; openOptionsPage: () => void } = {
    lastError: null,
    openOptionsPage: () => {},
  };

  const chromeMock = {
    runtime,
    tabs: {
      query: (_query: unknown, callback?: (tabs: Array<{ id: number }>) => void) => {
        const tabs = [{ id: 1 }];
        // MV3 的 chrome.tabs.query 不传 callback 时返回 Promise；两种形式都要接住。
        if (callback) {
          callback(tabs);
          return undefined;
        }

        return Promise.resolve(tabs);
      },
      sendMessage: (
        _tabId: number,
        message: { type: string },
        callback: (response: unknown) => void,
      ) => {
        if (message.type === RESET_SPEED_MESSAGE) {
          callback(options.resetResponse ?? { ok: true });
          return;
        }

        if (message.type === GET_STATE_MESSAGE) {
          const index = Math.min(stateCalls, states.length - 1);
          stateCalls += 1;
          callback(states[index]);
          return;
        }

        callback(undefined);
      },
    },
    storage: {
      sync: {
        get: (key: string, callback: (result: Record<string, unknown>) => void) => {
          if (options.failSyncGet) {
            runtime.lastError = { message: 'sync unavailable' };
            callback({});
            runtime.lastError = null;
            return;
          }

          callback(key in sync ? { [key]: sync[key] } : {});
        },
        set: (value: Record<string, unknown>, callback?: () => void) => {
          Object.assign(sync, value);
          callback?.();
        },
        remove: (key: string, callback?: () => void) => {
          delete sync[key];
          callback?.();
        },
      },
      local: {
        get: (key: string, callback?: (result: Record<string, unknown>) => void) => {
          const result = key in local ? { [key]: local[key] } : {};
          if (callback) {
            callback(result);
            return undefined;
          }

          return Promise.resolve(result);
        },
        set: (value: Record<string, unknown>, callback?: () => void) => {
          localSets.push(value);
          Object.assign(local, value);
          callback?.();
        },
        remove: (key: string, callback?: () => void) => {
          delete local[key];
          callback?.();
        },
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  };

  (globalThis as Record<string, unknown>).chrome = chromeMock;

  const render = async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    await import('./index');
    await flush();
    await flush();
    return document.getElementById('root') as HTMLElement;
  };

  return { localSets, render };
};

const settingsWith = (overrides: Record<string, unknown> = {}) => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
  presetSpeeds: [...DEFAULT_PRESET_SPEEDS],
  spaceTogglePlay: true,
  maxSpeed: DEFAULT_MAX_SPEED,
  siteSpeedMemory: true,
  ...overrides,
});

const keyLabels = (root: HTMLElement) =>
  [...root.querySelectorAll('#key-grid .vsc-popup__kbd')].map((node) => node.textContent);

/**
 * F1：快捷键提示区必须说真话——改绑后显示新键位，关掉空格播放后不再承诺 Space。
 */
describe('popup shortcut hints follow the saved settings', () => {
  it('renders rebound shortcuts and drops the Space row when space play is off', async () => {
    const { render } = createPopupChrome({
      settings: settingsWith({
        shortcuts: { ...DEFAULT_SHORTCUTS, increaseSpeed: 'ctrl+shift+ArrowUp' },
        presetSpeeds: [1.5, 2, 3, 4],
        spaceTogglePlay: false,
      }),
    });

    const root = await render();
    const keys = keyLabels(root);

    expect(keys).toContain('Ctrl+Shift+ArrowUp');
    expect(keys.join(' ')).not.toContain('Space');
    expect(keys).toEqual(['Ctrl+Shift+ArrowUp', '-', '0', '1-4', 'F']);
  });

  it('falls back to the default key table when settings cannot be read', async () => {
    const { render } = createPopupChrome({ failSyncGet: true });

    const root = await render();

    expect(keyLabels(root)).toEqual(['=', '-', '0', '1-4', 'Space', 'F']);
  });
});

/**
 * F2：弹窗开关必须读全局 siteSpeedMemory。全局关掉时内容脚本两道硬门直接 return，
 * 开关既不能显示为可用，也不能再往禁用表里写永久记录。
 */
describe('popup site memory toggle respects the global switch', () => {
  it('disables the toggle and writes nothing when site memory is globally off', async () => {
    const { render, localSets } = createPopupChrome({
      settings: settingsWith({ siteSpeedMemory: false }),
      local: { [SITE_MEMORY_DISABLED_KEY]: { 'example.com': true } },
    });

    const root = await render();
    const toggle = root.querySelector('#memory-toggle') as HTMLInputElement;

    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
    expect(root.querySelector('#memory-desc')?.textContent)
      .toBe(t('optMemoryGlobalOff', '站点速度记忆总开关已在设置页关闭'));

    // 置灰的开关不该有任何写入路径，事件即使被触发也不落盘。
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(localSets).toEqual([]);
  });

  it('still writes the per-site opt-out table when the global switch is on', async () => {
    const { render, localSets } = createPopupChrome({ settings: settingsWith() });

    const root = await render();
    const toggle = root.querySelector('#memory-toggle') as HTMLInputElement;

    expect(toggle.disabled).toBe(false);
    expect(toggle.checked).toBe(true);

    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(localSets).toEqual([{ [SITE_MEMORY_DISABLED_KEY]: { 'example.com': true } }]);
  });
});

/**
 * F3：重置成功后不能把状态写成 '—'。重置响应只带 ok，要再问一次内容脚本拿真实状态。
 */
describe('popup reset keeps the real playback state', () => {
  it('shows the state the content script reports after a reset', async () => {
    const { render } = createPopupChrome({
      states: [
        { speed: 2, playing: false, hostname: 'example.com', hasVideo: true },
        { speed: 1, playing: true, hostname: 'example.com', hasVideo: true },
      ],
    });

    const root = await render();
    expect(root.querySelector('#state')?.textContent).toBe(t('popupPaused', '已暂停'));

    (root.querySelector('#reset-button') as HTMLButtonElement).click();
    await flush();
    await flush();

    expect(root.querySelector('#state')?.textContent).toBe(t('popupPlaying', '播放中'));
    expect(root.querySelector('#rate-value')?.textContent).toBe('1');
  });
});
