import {
  formatShortcut,
  isBrowserReservedShortcut,
  keyboardEventToShortcut,
} from '../shared/shortcuts';
import { loadSettings, saveSettings } from '../shared/settings';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '../shared/types';

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

.vsc-options__button--primary {
  border-color: rgba(103, 232, 249, 0.24);
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(37, 99, 235, 0.18));
  color: #ecfeff;
}

@media (max-width: 760px) {
  .vsc-options__row {
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
        <p class="vsc-options__eyebrow">Video Speed Controller v5</p>
        <h1 class="vsc-options__title">只保留两件事：调速快捷键、网页全屏。</h1>
        <p class="vsc-options__description">
          这里没有历史功能，没有额外面板，没有隐藏操作。只配置 4 个快捷键，内容脚本会实时读取并立即生效。
        </p>
      </section>

      <section class="vsc-options__panel">
        <div class="vsc-options__toolbar">
          <div>
            <h2 class="vsc-options__panel-title">快捷键设置</h2>
            <p class="vsc-options__panel-subtitle">点击输入框后按下新的组合键。保存后，已打开页面中的映射会热更新。</p>
          </div>
        </div>

        <div class="vsc-options__rows" id="shortcut-rows"></div>

        <div class="vsc-options__actions">
          <div class="vsc-options__status" id="status"></div>
          <div class="vsc-options__buttons">
            <button type="button" class="vsc-options__button" id="reset-button">恢复默认</button>
            <button type="button" class="vsc-options__button vsc-options__button--primary" id="save-button">保存设置</button>
          </div>
        </div>
      </section>
    </div>
  </main>
`;

const rowsRoot = document.getElementById('shortcut-rows');
const statusNode = document.getElementById('status');
const saveButton = document.getElementById('save-button');
const resetButton = document.getElementById('reset-button');

if (!(rowsRoot instanceof HTMLElement) || !(statusNode instanceof HTMLElement) || !(saveButton instanceof HTMLButtonElement) || !(resetButton instanceof HTMLButtonElement)) {
  throw new Error('Options UI failed to initialize');
}

type InputMap = Record<keyof typeof DEFAULT_SHORTCUTS, HTMLInputElement>;

const inputs = {} as InputMap;

SHORTCUT_DEFINITIONS.forEach((definition) => {
  const row = document.createElement('div');
  row.className = 'vsc-options__row';
  row.innerHTML = `
    <div>
      <p class="vsc-options__row-label">${definition.label}</p>
      <p class="vsc-options__row-description">${definition.description}</p>
    </div>
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.className = 'vsc-options__input';
  input.placeholder = '按下新的快捷键';
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
    input.value = '按下新的快捷键';
  });

  input.addEventListener('blur', () => {
    input.value = formatShortcut(input.dataset.shortcut ?? DEFAULT_SHORTCUTS[definition.id]);
  });

  inputs[definition.id] = input;
  row.appendChild(input);
  rowsRoot.appendChild(row);
});

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
    setStatus('检测到重复快捷键。每个动作必须使用不同按键。', 'error');
    return false;
  }

  if (hasWarning) {
    setStatus('部分快捷键与浏览器常用组合冲突，浏览器可能会优先处理。', 'error');
    return true;
  }

  setStatus('');
  return true;
};

const applyShortcuts = (shortcuts: typeof DEFAULT_SHORTCUTS) => {
  (Object.keys(shortcuts) as Array<keyof typeof shortcuts>).forEach((key) => {
    inputs[key].dataset.shortcut = shortcuts[key];
    inputs[key].value = formatShortcut(shortcuts[key]);
  });
  validateInputs();
};

void loadSettings()
  .then((settings) => {
    applyShortcuts(settings.shortcuts);
  })
  .catch((error) => {
    console.error('Failed to load Video Speed Controller settings', error);
    applyShortcuts(DEFAULT_SHORTCUTS);
    setStatus('读取设置失败，已回退到默认快捷键。', 'error');
  });

resetButton.addEventListener('click', () => {
  applyShortcuts(DEFAULT_SHORTCUTS);
  setStatus('默认快捷键已恢复。点击保存后写入扩展设置。');
});

saveButton.addEventListener('click', () => {
  const valid = validateInputs();
  if (!valid) {
    setStatus('请先修正重复快捷键。', 'error');
    return;
  }

  void saveSettings({ shortcuts: getShortcutSnapshot() })
    .then(() => {
      setStatus('快捷键已保存，并会在已打开页面中立即生效。', 'success');
      window.setTimeout(() => setStatus(''), 1600);
    })
    .catch((error) => {
      console.error('Failed to save Video Speed Controller settings', error);
      setStatus('保存设置失败，请稍后重试。', 'error');
    });
});
