import { t } from '../shared/i18n';
import {
  formatShortcut,
  isBrowserReservedShortcut,
  keyboardEventToShortcut,
} from '../shared/shortcuts';
import { loadSettings, saveSettings } from '../shared/settings';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  type ShortcutSettings,
} from '../shared/types';

const TEXTS: Record<keyof ShortcutSettings, { label: string; description: string }> = {
  increaseSpeed: { label: 'actionIncrease', description: 'actionIncreaseDesc' },
  decreaseSpeed: { label: 'actionDecrease', description: 'actionDecreaseDesc' },
  resetSpeed: { label: 'actionReset', description: 'actionResetDesc' },
  togglePlay: { label: 'actionTogglePlay', description: 'actionTogglePlayDesc' },
  seekBack: { label: 'actionSeekBack', description: 'actionSeekBackDesc' },
  seekForward: { label: 'actionSeekForward', description: 'actionSeekForwardDesc' },
  fullscreen: { label: 'actionFullscreen', description: 'actionFullscreenDesc' },
};

const FALLBACKS: Record<string, string> = {
  optTitle: '快捷键',
  optSubtitle: '每个动作都可以改键。留空表示禁用该动作，保存后已打开的页面会立即生效。',
  optSave: '保存',
  optReset: '恢复默认',
  optPressKey: '按下按键',
  optSaved: '已保存',
  optSaveFailed: '保存失败，请重试',
  optDuplicate: '有按键被重复绑定，每个动作必须不同',
  optReserved: '与浏览器快捷键冲突，可能被浏览器优先处理',
  optFixDuplicate: '请先修正重复的按键',
  actionIncrease: '加速',
  actionIncreaseDesc: '加快播放速度（+0.1，长按连续）',
  actionDecrease: '减速',
  actionDecreaseDesc: '减慢播放速度（-0.1，长按连续）',
  actionReset: '重置速度',
  actionResetDesc: '回到 1.0x',
  actionTogglePlay: '播放 / 暂停',
  actionTogglePlayDesc: '切换播放与暂停',
  actionSeekBack: '快退 5 秒',
  actionSeekBackDesc: '后退 5 秒',
  actionSeekForward: '快进 5 秒',
  actionSeekForwardDesc: '前进 5 秒',
  actionFullscreen: '网页全屏',
  actionFullscreenDesc: '进入或退出网页全屏',
};

const tr = (key: string): string => t(key, FALLBACKS[key] ?? key);

const styles = `
:root {
  color-scheme: light;
}

body {
  margin: 0;
  background: #f5f6f8;
  color: #1e2430;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.vsc {
  max-width: 640px;
  margin: 0 auto;
  padding: 56px 24px 64px;
}

.vsc__title {
  margin: 0;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.vsc__subtitle {
  margin: 10px 0 0;
  max-width: 46ch;
  font-size: 14px;
  line-height: 1.65;
  color: #5b6473;
}

.vsc__card {
  margin-top: 28px;
  border: 1px solid #e3e6ea;
  border-radius: 16px;
  background: #ffffff;
  overflow: hidden;
}

.vsc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  border-bottom: 1px solid #eef0f2;
}

.vsc__row:last-child {
  border-bottom: none;
}

.vsc__row-label {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.vsc__row-desc {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: #737d8c;
}

.vsc__key {
  flex: none;
  width: 168px;
  padding: 9px 12px;
  border: 1px solid #d6dae0;
  border-radius: 10px;
  background: #fbfbfc;
  color: #1e2430;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}

.vsc__key:focus-visible {
  outline: 2px solid #0f766e;
  outline-offset: 2px;
}

.vsc__key.vsc--conflict {
  border-color: #d97706;
  background: #fffbeb;
  color: #b45309;
}

.vsc__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 22px;
}

.vsc__status {
  margin-right: auto;
  font-size: 13px;
  color: #737d8c;
  min-height: 18px;
}

.vsc__status.vsc--error {
  color: #b45309;
}

.vsc__button {
  padding: 9px 16px;
  border: 1px solid #d6dae0;
  border-radius: 10px;
  background: #ffffff;
  color: #1e2430;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.vsc__button:hover {
  border-color: #b9bfc8;
}

.vsc__button--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
}

.vsc__button--primary:hover {
  background: #115e59;
  border-color: #115e59;
}

@media (max-width: 560px) {
  .vsc__row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .vsc__key {
    width: auto;
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
  <main class="vsc">
    <h1 class="vsc__title">${tr('optTitle')}</h1>
    <p class="vsc__subtitle">${tr('optSubtitle')}</p>
    <section class="vsc__card" id="rows"></section>
    <div class="vsc__actions">
      <span class="vsc__status" id="status" role="status" aria-live="polite"></span>
      <button type="button" class="vsc__button" id="reset">${tr('optReset')}</button>
      <button type="button" class="vsc__button vsc__button--primary" id="save">${tr('optSave')}</button>
    </div>
  </main>
`;

const rowsRoot = document.getElementById('rows')!;
const statusNode = document.getElementById('status')!;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const resetButton = document.getElementById('reset') as HTMLButtonElement;

const inputs = {} as Record<keyof ShortcutSettings, HTMLInputElement>;

SHORTCUT_DEFINITIONS.forEach((definition) => {
  const texts = TEXTS[definition.id];
  const row = document.createElement('div');
  row.className = 'vsc__row';
  row.innerHTML = `
    <div>
      <p class="vsc__row-label" id="label-${definition.id}">${tr(texts.label)}</p>
      <p class="vsc__row-desc">${tr(texts.description)}</p>
    </div>
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.className = 'vsc__key';
  input.value = formatShortcut(DEFAULT_SHORTCUTS[definition.id]);
  input.dataset.shortcut = DEFAULT_SHORTCUTS[definition.id];
  input.setAttribute('aria-labelledby', `label-${definition.id}`);

  input.addEventListener('keydown', (event) => {
    event.preventDefault();
    // Backspace / Delete 清空绑定 = 禁用该动作。
    if (event.key === 'Backspace' || event.key === 'Delete') {
      input.dataset.shortcut = '';
      input.value = '';
      input.blur();
      validate();
      return;
    }

    const shortcut = keyboardEventToShortcut(event);
    if (!shortcut) {
      return;
    }

    input.dataset.shortcut = shortcut;
    input.value = formatShortcut(shortcut);
    validate();
  });

  input.addEventListener('focus', () => {
    input.value = '';
    input.placeholder = tr('optPressKey');
  });

  input.addEventListener('blur', () => {
    input.value = formatShortcut(input.dataset.shortcut ?? '');
  });

  inputs[definition.id] = input;
  row.appendChild(input);
  rowsRoot.appendChild(row);
});

const setStatus = (message: string, isError = false) => {
  statusNode.textContent = message;
  statusNode.classList.toggle('vsc--error', isError);
};

const snapshot = (): ShortcutSettings =>
  Object.fromEntries(
    (Object.keys(inputs) as Array<keyof ShortcutSettings>).map((id) => [id, inputs[id].dataset.shortcut ?? '']),
  ) as unknown as ShortcutSettings;

/** 校验：重复绑定是硬错误；浏览器保留键只给警告。返回是否可以保存。 */
const validate = () => {
  const values = snapshot();
  const entries = Object.entries(values) as Array<[keyof ShortcutSettings, string]>;
  const seen = new Map<string, Array<keyof ShortcutSettings>>();

  Object.values(inputs).forEach((input) => input.classList.remove('vsc--conflict'));

  entries.forEach(([id, shortcut]) => {
    if (shortcut === '') {
      return;
    }
    seen.set(shortcut, [...(seen.get(shortcut) ?? []), id]);
  });

  let hasConflict = false;
  seen.forEach((ids) => {
    if (ids.length < 2) {
      return;
    }
    hasConflict = true;
    ids.forEach((id) => inputs[id].classList.add('vsc--conflict'));
  });

  if (hasConflict) {
    setStatus(tr('optDuplicate'), true);
    return false;
  }

  const hasReserved = entries.some(([, shortcut]) => shortcut !== '' && isBrowserReservedShortcut(shortcut));
  if (hasReserved) {
    setStatus(tr('optReserved'), true);
    return true;
  }

  setStatus('');
  return true;
};

const apply = (shortcuts: ShortcutSettings) => {
  (Object.keys(shortcuts) as Array<keyof ShortcutSettings>).forEach((id) => {
    inputs[id].dataset.shortcut = shortcuts[id];
    inputs[id].value = formatShortcut(shortcuts[id]);
  });
  validate();
};

void loadSettings()
  .then((settings) => apply(settings.shortcuts))
  .catch((error) => {
    console.error('Failed to load Video Speed Controller settings', error);
    apply(DEFAULT_SHORTCUTS);
  });

resetButton.addEventListener('click', () => {
  apply(DEFAULT_SHORTCUTS);
  setStatus('');
});

saveButton.addEventListener('click', () => {
  if (!validate()) {
    setStatus(tr('optFixDuplicate'), true);
    return;
  }

  void saveSettings({ shortcuts: snapshot() })
    .then(() => {
      setStatus(tr('optSaved'));
      window.setTimeout(() => setStatus(''), 1600);
    })
    .catch((error) => {
      console.error('Failed to save Video Speed Controller settings', error);
      setStatus(tr('optSaveFailed'), true);
    });
});
