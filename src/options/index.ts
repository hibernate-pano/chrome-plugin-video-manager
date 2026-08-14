import { t } from '../shared/i18n';
import {
  formatShortcut,
  isBrowserReservedShortcut,
  keyboardEventToShortcut,
} from '../shared/shortcuts';
import { loadSettings, saveSettings } from '../shared/settings';
import {
  DEFAULT_MAX_SPEED,
  DEFAULT_PRESET_SPEEDS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SITE_SPEED_MEMORY,
  DEFAULT_SPACE_TOGGLE_PLAY,
  MAX_SPEED_MAX,
  MAX_SPEED_MIN,
  PRESET_SPEED_MAX,
  PRESET_SPEED_MIN,
  SHORTCUT_DEFINITIONS,
  SITE_SPEEDS_KEY,
} from '../shared/types';

const PRESET_ROW_COUNT = DEFAULT_PRESET_SPEEDS.length;

const SHORTCUT_LABEL_KEYS: Record<string, { label: string; description: string }> = {
  increaseSpeed: { label: 'shortcutIncrease', description: 'shortcutIncreaseDesc' },
  decreaseSpeed: { label: 'shortcutDecrease', description: 'shortcutDecreaseDesc' },
  resetSpeed: { label: 'shortcutReset', description: 'shortcutResetDesc' },
  fullscreen: { label: 'shortcutFullscreen', description: 'shortcutFullscreenDesc' },
};

const FALLBACKS: Record<string, string> = {
  optEyebrow: 'Video Speed Controller v5.2',
  optTitle: '只保留三件事：调速、预设速度、网页全屏。',
  optDescription: '这里没有历史功能，没有额外面板，没有隐藏操作。配置快捷键、预设速度与播放限制，内容脚本会实时读取并立即生效。',
  optShortcutsTitle: '快捷键设置',
  optShortcutsDesc: '点击输入框后按下新的组合键。保存后，已打开页面中的映射会热更新。',
  optPresetsTitle: '预设速度',
  optPresetsDesc: '按数字键 1-4 直达常用速度，无需逐档微调。',
  optPresetPlaceholder: '如 1.5',
  optSpaceTitle: '空格键播放/暂停',
  optSpaceDesc: '网页全屏外，按空格键也能切换播放与暂停（与全屏模式行为一致）。',
  optMaxSpeedTitle: '最大播放速度',
  optMaxSpeedDesc: '加速与预设档位的上限，防止长按冲过头。',
  optMemoryTitle: '记住每个网站的速度',
  optMemoryDesc: '刷新或重新打开页面时，自动恢复该网站上次使用的播放速度。',
  optMemoryClearLabel: '清除全部记忆',
  optMemoryCleared: '已清除全部站点速度记忆。',
  optReset: '恢复默认',
  optSave: '保存设置',
  optPressKey: '按下新的快捷键',
  optSaved: '设置已保存，并会在已打开页面中立即生效。',
  optSaveFailed: '保存设置失败，请稍后重试。',
  optLoadFailed: '读取设置失败，已回退到默认配置。',
  optResetDone: '默认配置已恢复。点击保存后写入扩展设置。',
  optDuplicate: '检测到重复快捷键。每个动作必须使用不同按键。',
  optReserved: '部分快捷键与浏览器常用组合冲突，浏览器可能会优先处理。',
  optFixDuplicate: '请先修正重复快捷键。',
  optPresetRange: '预设速度必须是 0.25–8 之间的数字。',
  optMaxSpeedRange: '最大速度必须是 1.5–16 之间的数字。',
  shortcutIncrease: '加速',
  shortcutIncreaseDesc: '增加视频播放速度（+0.1）',
  shortcutDecrease: '减速',
  shortcutDecreaseDesc: '降低视频播放速度（-0.1）',
  shortcutReset: '重置速度',
  shortcutResetDesc: '恢复到 1.0x',
  shortcutFullscreen: '网页全屏',
  shortcutFullscreenDesc: '进入或退出网页全屏',
};

const tr = (key: string): string => t(key, FALLBACKS[key] ?? key);

const styles = `
body {
  margin: 0;
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.16), transparent 32%),
    linear-gradient(160deg, #020617 0%, #07111f 100%);
  color: #e2e8f0;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.vsc-options {
  min-height: 100vh;
  padding: 48px 24px;
}

.vsc-options__shell {
  max-width: 880px;
  margin: 0 auto;
}

.vsc-options__hero,
.vsc-options__panel {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 28px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 24px 80px rgba(2, 6, 23, 0.32);
  backdrop-filter: blur(18px);
}

.vsc-options__hero {
  padding: 28px 28px 24px;
}

.vsc-options__eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgba(103, 232, 249, 0.72);
}

.vsc-options__title {
  margin: 0;
  font-size: 34px;
  line-height: 1.05;
  color: #f8fafc;
}

.vsc-options__description {
  max-width: 620px;
  margin: 14px 0 0;
  color: rgba(226, 232, 240, 0.8);
  line-height: 1.7;
}

.vsc-options__panel {
  margin-top: 24px;
  padding: 28px;
}

.vsc-options__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.vsc-options__panel-title {
  margin: 0;
  font-size: 22px;
  color: #f8fafc;
}

.vsc-options__panel-subtitle {
  margin: 6px 0 0;
  color: rgba(148, 163, 184, 0.88);
}

.vsc-options__panel-subtitle code {
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(103, 232, 249, 0.12);
  color: #a5f3fc;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
}

.vsc-options__rows {
  display: grid;
  gap: 14px;
}

.vsc-options__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 18px;
  align-items: center;
  padding: 18px 20px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 20px;
  background: rgba(2, 6, 23, 0.5);
}

.vsc-options__row--wide {
  grid-template-columns: minmax(0, 1fr) auto;
}

.vsc-options__row-label {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
}

.vsc-options__row-description {
  margin: 6px 0 0;
  font-size: 14px;
  color: rgba(148, 163, 184, 0.86);
}

.vsc-options__row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
}

.vsc-options__input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(103, 232, 249, 0.22);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.88);
  color: #e0f2fe;
  font-size: 14px;
  font-family: "SFMono-Regular", Consolas, monospace;
  text-align: center;
  outline: none;
}

.vsc-options__input.vsc-warning {
  border-color: rgba(251, 191, 36, 0.6);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.24);
}

.vsc-options__number-input {
  width: 120px;
  padding: 10px 14px;
  border: 1px solid rgba(103, 232, 249, 0.22);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.88);
  color: #e0f2fe;
  font-size: 14px;
  font-family: "SFMono-Regular", Consolas, monospace;
  text-align: center;
  outline: none;
}

.vsc-options__number-input.vsc-warning {
  border-color: rgba(251, 191, 36, 0.6);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.24);
}

.vsc-options__preset-grid {
  display: grid;
  gap: 14px;
}

.vsc-options__preset-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 180px;
  gap: 16px;
  align-items: center;
}

.vsc-options__preset-key {
  justify-self: start;
  min-width: 34px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(2, 6, 23, 0.55);
  color: #a5f3fc;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.vsc-options__preset-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(103, 232, 249, 0.22);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.88);
  color: #e0f2fe;
  font-size: 14px;
  font-family: "SFMono-Regular", Consolas, monospace;
  text-align: center;
  outline: none;
}

.vsc-options__preset-input.vsc-warning {
  border-color: rgba(251, 191, 36, 0.6);
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.24);
}

.vsc-options__toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.vsc-options__toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.vsc-options__toggle-track {
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.25);
  transition: background 0.2s;
}

.vsc-options__toggle-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e2e8f0;
  transition: transform 0.2s;
}

.vsc-options__toggle input:checked + .vsc-options__toggle-track {
  background: rgba(34, 211, 238, 0.55);
}

.vsc-options__toggle input:checked + .vsc-options__toggle-track::after {
  transform: translateX(20px);
}

.vsc-options__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 22px;
}

.vsc-options__status {
  min-height: 20px;
  font-size: 14px;
  color: rgba(148, 163, 184, 0.92);
}

.vsc-options__status.vsc-error {
  color: #fbbf24;
}

.vsc-options__status.vsc-success {
  color: #67e8f9;
}

.vsc-options__buttons {
  display: flex;
  gap: 12px;
}

.vsc-options__button {
  padding: 12px 18px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.vsc-options__button:hover {
  border-color: rgba(103, 232, 249, 0.34);
  color: #f8fafc;
}

.vsc-options__button--small {
  padding: 8px 12px;
  font-size: 12px;
  border-radius: 10px;
}

.vsc-options__button--primary {
  border-color: rgba(103, 232, 249, 0.24);
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(37, 99, 235, 0.18));
  color: #ecfeff;
}

@media (max-width: 760px) {
  .vsc-options__row,
  .vsc-options__preset-row,
  .vsc-options__row--wide {
    grid-template-columns: 1fr;
  }

  .vsc-options__actions,
  .vsc-options__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .vsc-options__buttons {
    width: 100%;
  }

  .vsc-options__button {
    flex: 1;
  }

  .vsc-options__row-actions {
    justify-content: flex-start;
  }
}
`;

const root = document.getElementById('root');
if (!root) {
  throw new Error('Options root missing');
}

const style = document.createElement('style');
style.textContent = styles;
document.head.appendChild(style);

root.innerHTML = `
  <main class="vsc-options">
    <div class="vsc-options__shell">
      <section class="vsc-options__hero">
        <p class="vsc-options__eyebrow">${tr('optEyebrow')}</p>
        <h1 class="vsc-options__title">${tr('optTitle')}</h1>
        <p class="vsc-options__description">${tr('optDescription')}</p>
      </section>

      <section class="vsc-options__panel">
        <div class="vsc-options__toolbar">
          <div>
            <h2 class="vsc-options__panel-title">${tr('optShortcutsTitle')}</h2>
            <p class="vsc-options__panel-subtitle">${tr('optShortcutsDesc')}</p>
          </div>
        </div>

        <div class="vsc-options__rows" id="shortcut-rows"></div>
      </section>

      <section class="vsc-options__panel">
        <div class="vsc-options__toolbar">
          <div>
            <h2 class="vsc-options__panel-title">${tr('optPresetsTitle')}</h2>
            <p class="vsc-options__panel-subtitle">${tr('optPresetsDesc')}</p>
          </div>
        </div>

        <div class="vsc-options__preset-grid" id="preset-grid"></div>
      </section>

      <section class="vsc-options__panel">
        <div class="vsc-options__rows">
          <div class="vsc-options__row">
            <div>
              <p class="vsc-options__row-label">${tr('optSpaceTitle')}</p>
              <p class="vsc-options__row-description">${tr('optSpaceDesc')}</p>
            </div>
            <label class="vsc-options__toggle">
              <input type="checkbox" id="space-toggle" />
              <span class="vsc-options__toggle-track"></span>
            </label>
          </div>

          <div class="vsc-options__row">
            <div>
              <p class="vsc-options__row-label">${tr('optMaxSpeedTitle')}</p>
              <p class="vsc-options__row-description">${tr('optMaxSpeedDesc')}</p>
            </div>
            <input type="number" class="vsc-options__number-input" id="max-speed-input" min="${MAX_SPEED_MIN}" max="${MAX_SPEED_MAX}" step="0.5" />
          </div>

          <div class="vsc-options__row vsc-options__row--wide">
            <div>
              <p class="vsc-options__row-label">${tr('optMemoryTitle')}</p>
              <p class="vsc-options__row-description">${tr('optMemoryDesc')}</p>
            </div>
            <div class="vsc-options__row-actions">
              <button type="button" class="vsc-options__button vsc-options__button--small" id="memory-clear-button">${tr('optMemoryClearLabel')}</button>
              <label class="vsc-options__toggle">
                <input type="checkbox" id="memory-toggle" />
                <span class="vsc-options__toggle-track"></span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <div class="vsc-options__actions">
        <div class="vsc-options__status" id="status"></div>
        <div class="vsc-options__buttons">
          <button type="button" class="vsc-options__button" id="reset-button">${tr('optReset')}</button>
          <button type="button" class="vsc-options__button vsc-options__button--primary" id="save-button">${tr('optSave')}</button>
        </div>
      </div>
    </div>
  </main>
`;

const rowsRoot = document.getElementById('shortcut-rows');
const presetGrid = document.getElementById('preset-grid');
const statusNode = document.getElementById('status');
const saveButton = document.getElementById('save-button');
const resetButton = document.getElementById('reset-button');
const spaceToggle = document.getElementById('space-toggle');
const maxSpeedInput = document.getElementById('max-speed-input');
const memoryToggle = document.getElementById('memory-toggle');
const memoryClearButton = document.getElementById('memory-clear-button');

if (
  !(rowsRoot instanceof HTMLElement)
  || !(presetGrid instanceof HTMLElement)
  || !(statusNode instanceof HTMLElement)
  || !(saveButton instanceof HTMLButtonElement)
  || !(resetButton instanceof HTMLButtonElement)
  || !(spaceToggle instanceof HTMLInputElement)
  || !(maxSpeedInput instanceof HTMLInputElement)
  || !(memoryToggle instanceof HTMLInputElement)
  || !(memoryClearButton instanceof HTMLButtonElement)
) {
  throw new Error('Options UI failed to initialize');
}

type InputMap = Record<keyof typeof DEFAULT_SHORTCUTS, HTMLInputElement>;

const inputs = {} as InputMap;

SHORTCUT_DEFINITIONS.forEach((definition) => {
  const texts = SHORTCUT_LABEL_KEYS[definition.id];
  const row = document.createElement('div');
  row.className = 'vsc-options__row';
  row.innerHTML = `
    <div>
      <p class="vsc-options__row-label">${tr(texts.label)}</p>
      <p class="vsc-options__row-description">${tr(texts.description)}</p>
    </div>
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.className = 'vsc-options__input';
  input.placeholder = tr('optPressKey');
  input.addEventListener('keydown', (event) => {
    event.preventDefault();
    const shortcut = keyboardEventToShortcut(event);
    if (!shortcut) {
      return;
    }

    input.dataset.shortcut = shortcut;
    input.value = formatShortcut(shortcut);
    validateInputs();
  });

  input.addEventListener('focus', () => {
    input.value = tr('optPressKey');
  });

  input.addEventListener('blur', () => {
    input.value = formatShortcut(input.dataset.shortcut ?? DEFAULT_SHORTCUTS[definition.id]);
  });

  inputs[definition.id] = input;
  row.appendChild(input);
  rowsRoot.appendChild(row);
});

const presetInputs: HTMLInputElement[] = [];

for (let index = 0; index < PRESET_ROW_COUNT; index += 1) {
  const row = document.createElement('div');
  row.className = 'vsc-options__preset-row';
  row.innerHTML = `<span class="vsc-options__preset-key">${index + 1}</span>`;

  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(PRESET_SPEED_MIN);
  input.max = String(PRESET_SPEED_MAX);
  input.step = '0.05';
  input.className = 'vsc-options__preset-input';
  input.placeholder = tr('optPresetPlaceholder');
  input.addEventListener('input', () => {
    input.classList.remove('vsc-warning');
  });

  presetInputs.push(input);
  row.appendChild(input);
  presetGrid.appendChild(row);
}

const setStatus = (message: string, kind: 'idle' | 'error' | 'success' = 'idle') => {
  statusNode.textContent = message;
  statusNode.className = 'vsc-options__status';

  if (kind === 'error') {
    statusNode.classList.add('vsc-error');
  }
  if (kind === 'success') {
    statusNode.classList.add('vsc-success');
  }
};

const getShortcutSnapshot = () => ({
  increaseSpeed: inputs.increaseSpeed.dataset.shortcut ?? DEFAULT_SHORTCUTS.increaseSpeed,
  decreaseSpeed: inputs.decreaseSpeed.dataset.shortcut ?? DEFAULT_SHORTCUTS.decreaseSpeed,
  resetSpeed: inputs.resetSpeed.dataset.shortcut ?? DEFAULT_SHORTCUTS.resetSpeed,
  fullscreen: inputs.fullscreen.dataset.shortcut ?? DEFAULT_SHORTCUTS.fullscreen,
});

const validateInputs = () => {
  const values = getShortcutSnapshot();
  const duplicates = new Map<string, Array<keyof typeof values>>();

  Object.values(inputs).forEach((input) => input.classList.remove('vsc-warning'));

  (Object.keys(values) as Array<keyof typeof values>).forEach((key) => {
    const shortcut = values[key];
    const next = duplicates.get(shortcut) ?? [];
    next.push(key);
    duplicates.set(shortcut, next);
  });

  let hasError = false;
  let hasWarning = false;

  duplicates.forEach((keys) => {
    if (keys.length < 2) {
      return;
    }

    hasError = true;
    keys.forEach((key) => inputs[key].classList.add('vsc-warning'));
  });

  (Object.keys(values) as Array<keyof typeof values>).forEach((key) => {
    if (!isBrowserReservedShortcut(values[key])) {
      return;
    }

    hasWarning = true;
    inputs[key].classList.add('vsc-warning');
  });

  if (hasError) {
    setStatus(tr('optDuplicate'), 'error');
    return false;
  }

  if (hasWarning) {
    setStatus(tr('optReserved'), 'error');
    return true;
  }

  setStatus('');
  return true;
};

const getPresetSpeeds = (): number[] | null => {
  const speeds: number[] = [];
  let valid = true;

  presetInputs.forEach((input, index) => {
    input.classList.remove('vsc-warning');
    const raw = input.value.trim();
    if (raw === '') {
      valid = false;
      input.classList.add('vsc-warning');
      return;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < PRESET_SPEED_MIN || value > PRESET_SPEED_MAX) {
      valid = false;
      input.classList.add('vsc-warning');
      return;
    }

    speeds[index] = Math.round(value * 100) / 100;
  });

  if (!valid) {
    setStatus(tr('optPresetRange'), 'error');
    return null;
  }

  return speeds;
};

const getMaxSpeed = (): number | null => {
  maxSpeedInput.classList.remove('vsc-warning');
  const value = Number(maxSpeedInput.value);

  if (!Number.isFinite(value) || value < MAX_SPEED_MIN || value > MAX_SPEED_MAX) {
    maxSpeedInput.classList.add('vsc-warning');
    setStatus(tr('optMaxSpeedRange'), 'error');
    return null;
  }

  return Math.round(value * 100) / 100;
};

const applyShortcuts = (shortcuts: typeof DEFAULT_SHORTCUTS) => {
  (Object.keys(shortcuts) as Array<keyof typeof shortcuts>).forEach((key) => {
    inputs[key].dataset.shortcut = shortcuts[key];
    inputs[key].value = formatShortcut(shortcuts[key]);
  });
  validateInputs();
};

const applyPresets = (speeds: number[]) => {
  presetInputs.forEach((input, index) => {
    input.value = String(speeds[index] ?? '');
    input.classList.remove('vsc-warning');
  });
};

void loadSettings()
  .then((settings) => {
    applyShortcuts(settings.shortcuts);
    applyPresets(settings.presetSpeeds);
    spaceToggle.checked = settings.spaceTogglePlay;
    maxSpeedInput.value = String(settings.maxSpeed);
    memoryToggle.checked = settings.siteSpeedMemory;
  })
  .catch((error) => {
    console.error('Failed to load Video Speed Controller settings', error);
    applyShortcuts(DEFAULT_SHORTCUTS);
    applyPresets(DEFAULT_PRESET_SPEEDS);
    spaceToggle.checked = DEFAULT_SPACE_TOGGLE_PLAY;
    maxSpeedInput.value = String(DEFAULT_MAX_SPEED);
    memoryToggle.checked = DEFAULT_SITE_SPEED_MEMORY;
    setStatus(tr('optLoadFailed'), 'error');
  });

resetButton.addEventListener('click', () => {
  applyShortcuts(DEFAULT_SHORTCUTS);
  applyPresets(DEFAULT_PRESET_SPEEDS);
  spaceToggle.checked = DEFAULT_SPACE_TOGGLE_PLAY;
  maxSpeedInput.value = String(DEFAULT_MAX_SPEED);
  memoryToggle.checked = DEFAULT_SITE_SPEED_MEMORY;
  setStatus(tr('optResetDone'));
});

memoryClearButton.addEventListener('click', () => {
  const clear = () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove(SITE_SPEEDS_KEY, () => {
        setStatus(tr('optMemoryCleared'), 'success');
        window.setTimeout(() => setStatus(''), 1600);
      });
      return;
    }

    setStatus(tr('optMemoryCleared'), 'success');
  };

  clear();
});

saveButton.addEventListener('click', () => {
  const valid = validateInputs();
  if (!valid) {
    setStatus(tr('optFixDuplicate'), 'error');
    return;
  }

  const presetSpeeds = getPresetSpeeds();
  if (!presetSpeeds) {
    return;
  }

  const maxSpeed = getMaxSpeed();
  if (maxSpeed === null) {
    return;
  }

  void saveSettings({
    shortcuts: getShortcutSnapshot(),
    presetSpeeds,
    spaceTogglePlay: spaceToggle.checked,
    maxSpeed,
    siteSpeedMemory: memoryToggle.checked,
  })
    .then(() => {
      setStatus(tr('optSaved'), 'success');
      window.setTimeout(() => setStatus(''), 1600);
    })
    .catch((error) => {
      console.error('Failed to save Video Speed Controller settings', error);
      setStatus(tr('optSaveFailed'), 'error');
    });
});
