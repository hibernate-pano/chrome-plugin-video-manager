import { currentLocale, t } from '../shared/i18n';
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
import { themeCss } from './options-theme';

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
  optSubtitle: '快捷键',
  optLead: '每个动作都可以改键。留空表示禁用该动作，保存后已打开的页面会立即生效。',
  optSave: '保存',
  optReset: '恢复默认',
  optPressKey: '按下按键',
  optSaved: '已保存',
  optSaveFailed: '保存失败，请重试',
  optDuplicate: '有按键被重复绑定，每个动作必须不同',
  optReserved: '与浏览器快捷键冲突，可能被浏览器优先处理',
  optFixDuplicate: '请先修正重复的按键',
  optProductName: 'Video Speed Controller — Fullscreen & Keys',
  optPageTitle: 'Video Speed Controller — Fullscreen & Keys',
  optPrivacy: '隐私政策',
  optRepository: '源码仓库',
  optVersion: '版本',
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

/** 隐私政策与仓库地址。仓库公开，链接对用户可点。 */
const PRIVACY_URL =
  'https://github.com/hibernate-pano/chrome-plugin-video-manager/blob/main/PRIVACY.md';
const REPO_URL = 'https://github.com/hibernate-pano/chrome-plugin-video-manager';

/**
 * 扩展版本号。
 *
 * 唯一的事实源是 manifest.json —— settings.ts 里那句「package.json 与 manifest.json
 * 的 version 一致」已经由 scripts/ci-workflow.test.ts 锁住，所以这里读 manifest
 * 不会引入第二个可能过期的数字。读不到时（比如单测里没有 chrome mock）显示 '—'，
 * 而不是硬编码一个会随发布过期的版本号。
 */
const readVersion = (): string => {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    // 读不到就显示占位符。
  }
  return '—';
};

/**
 * 把文档语言对齐到**实际渲染**的语言。
 *
 * 界面文案走 chrome.i18n，Chrome 挑了哪个 `_locales` 目录，就渲染哪种语言。
 * `<html lang>` 必须与之一致，否则屏幕阅读器会用错误的语音朗读 ——
 * 而且这类错误**没有任何视觉症状**。
 *
 * ⚠️ 这里**不能**用 `chrome.i18n.getUILanguage()`：它返回的是**浏览器界面语言**，
 * 而 Chrome 选 locale 目录可能受**系统/地区设置**影响。两者可以不一致
 * （macOS 上"系统中文 + Chrome 界面英文"是常见组合）。
 * 实测那种情况下 getUILanguage() 给 "en-US"，但 getMessage() 返回的是中文 ——
 * 拿前者去设 lang，就会得到 `lang="en-US"` 配一屏中文。
 *
 * 所以用 `currentLocale()`：它读 locale 文件里的语言标记键，
 * 拿到的就是 Chrome **实际选中**的那个目录。
 */
const applyDocumentLanguage = (): void => {
  document.documentElement.lang = currentLocale();
};

/**
 * 设置标签页标题。
 *
 * 不能用 HTML 里的 `__MSG_xxx__`：那个占位符只在 manifest 与 _locales 参与打包的
 * **资源文件**里生效，扩展页面（chrome-extension:// 下的 .html）里不会替换，
 * 标签页上会直接显示字面量 "__MSG_optPageTitle__"。所以只能在这里用 JS 设。
 */
const applyDocumentTitle = (): void => {
  document.title = tr('optPageTitle');
};

const root = document.getElementById('root');
if (!root) {
  throw new Error('Options root missing');
}

applyDocumentLanguage();
applyDocumentTitle();

const style = document.createElement('style');
style.textContent = themeCss();
document.head.appendChild(style);

root.innerHTML = `
  <main class="vsc">
    <h1 class="vsc__title">${tr('optProductName')}</h1>
    <p class="vsc__subtitle">${tr('optSubtitle')}</p>
    <p class="vsc__lead">${tr('optLead')}</p>
    <section class="vsc__card" id="rows"></section>
    <div class="vsc__actions">
      <span class="vsc__status" id="status" role="status" aria-live="polite"></span>
      <button type="button" class="vsc__button" id="reset">${tr('optReset')}</button>
      <button type="button" class="vsc__button vsc__button--primary" id="save">${tr('optSave')}</button>
    </div>
    <footer class="vsc__footer">
      <span class="vsc__version">${tr('optVersion')} ${readVersion()}</span>
      <span class="vsc__sep" aria-hidden="true">·</span>
      <a class="vsc__link" href="${PRIVACY_URL}" target="_blank" rel="noreferrer noopener">${tr('optPrivacy')}</a>
      <span class="vsc__sep" aria-hidden="true">·</span>
      <a class="vsc__link" href="${REPO_URL}" target="_blank" rel="noreferrer noopener">${tr('optRepository')}</a>
    </footer>
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
    // Tab / Enter 必须放行。
    //
    // 之前这里无条件 preventDefault()，把 Tab 也当成「用户想绑定的键」存了进去。
    // 后果是纯键盘用户打开设置页就废了：焦点被永久困在第一个输入框，
    // 按多少次 Tab 都到不了 Save 按钮 —— 而 Tab 是键盘用户**唯一**的导航手段。
    //
    // Enter 同样放行：它在表单里的语义是提交，虽然这里没有 <form>，
    // 但吞掉它只会让用户以为自己按了没反应。
    if (event.key === 'Tab' || event.key === 'Enter') {
      return;
    }

    // Escape 放行并「取消编辑」：把输入框恢复成已保存绑定的样子，然后失焦。
    // 用户按 Escape 的意图是「我改错了，撤销」，不是「我要把 Escape 绑到这个动作」。
    if (event.key === 'Escape') {
      input.value = formatShortcut(input.dataset.shortcut ?? '');
      input.blur();
      return;
    }

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
