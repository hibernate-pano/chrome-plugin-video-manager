import { t } from '../shared/i18n';
import { formatShortcut } from '../shared/shortcuts';
import { loadSettings } from '../shared/settings';
import {
  DEFAULT_PRESET_SPEEDS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SPACE_TOGGLE_PLAY,
  GET_STATE_MESSAGE,
  RESET_SPEED_MESSAGE,
  SITE_MEMORY_DISABLED_KEY,
} from '../shared/types';
import type { PersistedSettings } from '../shared/types';

const formatRate = (value: number) =>
  value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const styles = `
body {
  margin: 0;
  width: 320px;
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.14), transparent 34%),
    linear-gradient(160deg, #020617 0%, #07111f 100%);
  color: #e2e8f0;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.vsc-popup {
  padding: 16px;
}

.vsc-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.vsc-popup__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #a5f3fc;
}

.vsc-popup__card {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.72);
  padding: 14px;
}

.vsc-popup__status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.vsc-popup__label {
  margin: 0 0 2px;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.vsc-popup__state {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
}

.vsc-popup__rate {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  color: #f8fafc;
  font-variant-numeric: tabular-nums;
}

.vsc-popup__rate-unit {
  font-size: 15px;
  color: #94a3b8;
}

.vsc-popup__hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: rgba(148, 163, 184, 0.85);
}

.vsc-popup__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.vsc-popup__button {
  flex: 1;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.vsc-popup__button:hover {
  border-color: rgba(103, 232, 249, 0.4);
  color: #f8fafc;
}

.vsc-popup__button--primary {
  border-color: rgba(103, 232, 249, 0.28);
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(37, 99, 235, 0.18));
  color: #ecfeff;
}

.vsc-popup__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.vsc-popup__row-label {
  margin: 0;
  font-size: 13px;
  color: #e2e8f0;
}

.vsc-popup__row-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: rgba(148, 163, 184, 0.85);
}

.vsc-popup__toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex: none;
}

.vsc-popup__toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.vsc-popup__toggle-track {
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.25);
  transition: background 0.2s;
}

.vsc-popup__toggle-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e2e8f0;
  transition: transform 0.2s;
}

.vsc-popup__toggle input:checked + .vsc-popup__toggle-track {
  background: rgba(34, 211, 238, 0.55);
}

.vsc-popup__toggle input:checked + .vsc-popup__toggle-track::after {
  transform: translateX(18px);
}

.vsc-popup__toggle input:focus-visible + .vsc-popup__toggle-track {
  box-shadow: 0 0 0 2px #67e8f9;
}

.vsc-popup__toggle input:disabled + .vsc-popup__toggle-track {
  opacity: 0.45;
  cursor: not-allowed;
}

.vsc-popup__keys {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.5);
}

.vsc-popup__keys-title {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.vsc-popup__key-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}

.vsc-popup__key {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #cbd5e1;
}

.vsc-popup__kbd {
  min-width: 26px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.9);
  color: #a5f3fc;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  text-align: center;
}

.vsc-popup__footer {
  margin-top: 12px;
  text-align: center;
}

.vsc-popup__link {
  background: none;
  border: none;
  color: rgba(103, 232, 249, 0.85);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.vsc-popup__link:hover {
  color: #a5f3fc;
}
`;

const root = document.getElementById('root');
if (!root) {
  throw new Error('Popup root missing');
}

const style = document.createElement('style');
style.textContent = styles;
document.head.appendChild(style);

const getActiveTab = async () => {
  if (typeof chrome === 'undefined' || chrome.tabs === undefined) {
    return null;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id != null ? tab : null;
};

const sendToTab = <T>(tabId: number, message: unknown): Promise<T | null> =>
  new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError || response === undefined) {
          resolve(null);
          return;
        }
        resolve(response as T);
      });
    } catch {
      resolve(null);
    }
  });

interface TabState {
  speed: number;
  playing: boolean;
  hostname: string;
  hasVideo: boolean;
}

const getMemoryDisabled = async (hostname: string): Promise<boolean> => {
  const result = await chrome.storage.local.get(SITE_MEMORY_DISABLED_KEY);
  const map = result[SITE_MEMORY_DISABLED_KEY] as Record<string, boolean> | undefined;
  return map?.[hostname] === true;
};

const setMemoryDisabled = async (hostname: string, disabled: boolean) => {
  const result = await chrome.storage.local.get(SITE_MEMORY_DISABLED_KEY);
  const map = { ...(result[SITE_MEMORY_DISABLED_KEY] as Record<string, boolean> | undefined) };
  if (disabled) {
    map[hostname] = true;
  } else {
    delete map[hostname];
  }
  await chrome.storage.local.set({ [SITE_MEMORY_DISABLED_KEY]: map });
};

root.innerHTML = `
  <main class="vsc-popup">
    <header class="vsc-popup__header">
      <h1 class="vsc-popup__title">VIDEO SPEED CONTROLLER</h1>
    </header>

    <section class="vsc-popup__card">
      <div class="vsc-popup__status-row">
        <div>
          <p class="vsc-popup__label" id="status-label"></p>
          <p class="vsc-popup__state" id="state"></p>
          <p class="vsc-popup__hint" id="hint"></p>
        </div>
        <p class="vsc-popup__rate" id="rate"><span id="rate-value">1</span><span class="vsc-popup__rate-unit">x</span></p>
      </div>

      <div class="vsc-popup__actions">
        <button type="button" class="vsc-popup__button" id="reset-button"></button>
        <button type="button" class="vsc-popup__button vsc-popup__button--primary" id="options-button"></button>
      </div>
    </section>

    <section class="vsc-popup__card">
      <div class="vsc-popup__row" id="memory-row">
        <div>
          <p class="vsc-popup__row-label" id="memory-label"></p>
          <p class="vsc-popup__row-desc" id="memory-desc"></p>
        </div>
        <label class="vsc-popup__toggle">
          <input type="checkbox" id="memory-toggle" aria-labelledby="memory-label" />
          <span class="vsc-popup__toggle-track"></span>
        </label>
      </div>
    </section>

    <section class="vsc-popup__keys">
      <p class="vsc-popup__keys-title" id="keys-title"></p>
      <div class="vsc-popup__key-grid" id="key-grid"></div>
    </section>

    <footer class="vsc-popup__footer">
      <button type="button" class="vsc-popup__link" id="changelog-link"></button>
    </footer>
  </main>
`;

const rateValueNode = document.getElementById('rate-value');
const stateNode = document.getElementById('state');
const hintNode = document.getElementById('hint');
const statusLabelNode = document.getElementById('status-label');
const resetButton = document.getElementById('reset-button');
const optionsButton = document.getElementById('options-button');
const memoryToggle = document.getElementById('memory-toggle') as HTMLInputElement | null;
const memoryRow = document.getElementById('memory-row');
const keyGrid = document.getElementById('key-grid');

if (!rateValueNode || !stateNode || !hintNode || !statusLabelNode || !resetButton || !optionsButton || !memoryToggle || !memoryRow || !keyGrid) {
  throw new Error('Popup UI failed to initialize');
}

const setRate = (rate: number, playing: boolean | null) => {
  rateValueNode.textContent = formatRate(rate);
  if (playing === true) {
    stateNode.textContent = t('popupPlaying', '播放中');
  } else if (playing === false) {
    stateNode.textContent = t('popupPaused', '已暂停');
  } else {
    stateNode.textContent = '—';
  }
};

/**
 * 快捷键提示区必须反映设置页里的真实配置，否则用户改绑快捷键或关掉空格播放后，
 * 弹窗仍在承诺按旧键位操作。settings 读取失败时退化为默认键位表。
 */
const renderKeys = (settings: PersistedSettings | null) => {
  const shortcuts = settings?.shortcuts ?? DEFAULT_SHORTCUTS;
  const presetCount = settings?.presetSpeeds.length ?? DEFAULT_PRESET_SPEEDS.length;
  const keys: Array<[string, string]> = [
    [formatShortcut(shortcuts.increaseSpeed), t('popupKeyIncrease', '加速')],
    [formatShortcut(shortcuts.decreaseSpeed), t('popupKeyDecrease', '减速')],
    [formatShortcut(shortcuts.resetSpeed), t('popupKeyReset', '重置')],
    [`1-${presetCount}`, t('popupKeyPresets', '档位')],
  ];

  if (settings?.spaceTogglePlay ?? DEFAULT_SPACE_TOGGLE_PLAY) {
    keys.push(['Space', t('popupKeyPlay', '播放/暂停')]);
  }

  keys.push([formatShortcut(shortcuts.fullscreen), t('popupKeyFullscreen', '网页全屏')]);

  keyGrid.innerHTML = keys
    .map(([key, label]) => `<div class="vsc-popup__key"><span class="vsc-popup__kbd">${key}</span><span>${label}</span></div>`)
    .join('');
};

const main = async () => {
  // 设置读取与标签页查询并行发起，避免弹窗首屏串行等待两轮 IPC。
  const settingsPromise = loadSettings().catch(() => null);
  const tabPromise = getActiveTab();

  statusLabelNode.textContent = t('popupCurrentSpeed', '当前速度');
  resetButton.textContent = t('popupResetSpeed', '重置 1x');
  optionsButton.textContent = t('popupOpenSettings', '设置');
  document.getElementById('keys-title')!.textContent = t('popupShortcuts', '快捷键');
  document.getElementById('changelog-link')!.textContent = t('popupOpenOptions', '打开完整设置');

  const settings = await settingsPromise;
  renderKeys(settings);

  const tab = await tabPromise;
  if (!tab) {
    setRate(1, null);
    hintNode.textContent = t('popupNoTab', '无法访问当前标签页');
    resetButton.disabled = true;
    memoryRow.style.display = 'none';
    return;
  }

  const state = await sendToTab<TabState>(tab.id, { type: GET_STATE_MESSAGE });
  if (!state || !state.hasVideo) {
    setRate(1, null);
    hintNode.textContent = t('popupNoVideo', '当前页面没有可控制的视频');
    resetButton.disabled = true;
    memoryRow.style.display = 'none';
    return;
  }

  setRate(state.speed, state.playing);
  hintNode.textContent = state.hostname;

  // 全局站点记忆关闭时，内容脚本两道硬门直接 return，此处必须置灰并说明原因，
  // 否则开关会显示为可用、点击却毫无效果，还会静默写一条永久禁用记录。
  const globalMemoryOff = settings?.siteSpeedMemory === false;
  if (globalMemoryOff) {
    memoryToggle.checked = false;
    memoryToggle.disabled = true;
  } else {
    const disabled = await getMemoryDisabled(state.hostname);
    memoryToggle.checked = !disabled;
  }

  document.getElementById('memory-label')!.textContent = t('popupSiteMemory', '记住本站速度');
  document.getElementById('memory-desc')!.textContent = globalMemoryOff
    ? t('optMemoryGlobalOff', '站点速度记忆总开关已在设置页关闭')
    : t('popupSiteMemoryDesc', '刷新或重新打开页面时自动恢复');

  memoryToggle.addEventListener('change', () => {
    if (globalMemoryOff) {
      return;
    }

    void setMemoryDisabled(state.hostname, !memoryToggle.checked);
  });

  resetButton.addEventListener('click', () => {
    void sendToTab<{ ok: boolean }>(tab.id, { type: RESET_SPEED_MESSAGE }).then(async (result) => {
      if (!result?.ok) {
        return;
      }

      // 重置响应只带 ok，播放状态要再问一次内容脚本；查询失败仍走 '—' 兜底。
      const next = await sendToTab<TabState>(tab.id, { type: GET_STATE_MESSAGE });
      if (next?.hasVideo) {
        setRate(next.speed, next.playing);
        return;
      }

      setRate(1, null);
    });
  });
};

optionsButton.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

document.getElementById('changelog-link')!.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void main();
