import { currentLocale, t } from '../shared/i18n';
import { keyboardEventToShortcut } from '../shared/shortcuts';
import { loadSettings, saveSettings } from '../shared/settings';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  type ShortcutSettings,
} from '../shared/types';
import { formatExtensionCommandLabel, formatShortcutLabel } from './options-platform';
import {
  canonicalShortcut,
  extensionCommandShortcuts,
  isBrowserReservedShortcut,
  isExtensionCommandShortcut,
} from './options-reserved';
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
  optPressKey: '按下要绑定的键',
  optDisabled: '未绑定（已禁用）',
  optSaved: '已保存',
  optRestored: '已恢复默认',
  optSaveFailed: '保存失败，请重试',
  optUnsaved: '有未保存的更改',
  optDuplicate: '有按键被重复绑定，每个动作必须不同',
  optReserved: '这个键被浏览器占用，换一个',
  optSelfConflict: '这个键是扩展自己的命令，换一个',
  optProductName: 'Video Speed Controller — Fullscreen & Keys',
  optPageTitle: 'Video Speed Controller — Fullscreen & Keys',
  optPrivacy: '隐私政策',
  optRepository: '源码仓库',
  optVersion: '版本',
  optTipsToolbar: '点击工具栏图标可切换网页全屏',
  optTipsOptions: '按 $1 打开设置页',
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

/** 带替换值的文案（例如把当前平台的快捷键写法插进去）。 */
const trWith = (key: string, substitutions: string[]): string =>
  t(key, FALLBACKS[key] ?? key, substitutions);

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
 * 扩展自己的「打开设置页」命令键。
 *
 * manifest.json 里写的是 Chrome 的键名（"Ctrl+Shift+Comma"），
 * 而绑定存的是键盘事件的键（"ctrl+shift+,"）—— 两者要归一才能比。
 */
const OPEN_OPTIONS_COMMAND = 'ctrl+shift+,';

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
    <p class="vsc__tips" id="tips">
      <span class="vsc__tips-item">${tr('optTipsToolbar')}</span>
      <span class="vsc__tips-sep" aria-hidden="true">·</span>
      <span class="vsc__tips-item">${trWith('optTipsOptions', [formatExtensionCommandLabel(OPEN_OPTIONS_COMMAND)])}</span>
    </p>
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

/**
 * **已保存**的绑定。
 *
 * ⚠️ 为什么必须与草稿分开存：`dataset.shortcut` 是**草稿**（用户正在改的），
 * 拿它当「已保存」用，Escape 就撤销不了这次修改 —— 用户输入 k、按 Escape，
 * 框里还剩 k，之后一点保存就把错的键写进去了。
 *
 * 「取消这次修改」的唯一正确参照是**上一次落盘的值**，也就是这份。
 */
let savedShortcuts: ShortcutSettings = { ...DEFAULT_SHORTCUTS };

/**
 * 状态栏的「临时消息」（例如「已保存」）。
 *
 * 它会盖住常态消息一小会儿；但**错误**（重复绑定 / 保留键）不走这条路 ——
 * 那些消息必须一直留在屏幕上，直到用户改键为止。
 */
let statusOverride: { message: string; isError: boolean } | null = null;

const setStatus = (message: string, isError = false) => {
  statusNode.textContent = message;
  statusNode.classList.toggle('vsc--error', isError);
};

/**
 * 把一个输入框渲染成它当前该有的样子。
 *
 * 三种状态，各有各的表达（**同一个状态不能有两种样子**）：
 * 1. 已绑定 → 显示绑定本身
 * 2. 未绑定（该动作被禁用）→ 空值 + 「未绑定（已禁用）」占位符
 * 3. 正在输入 → 空值 + 「按下要绑定的键」占位符（由 focus 处理）
 *
 * ⚠️ 落盘后仍要保留占位符：清空一个动作再刷新页面，原来那一格会变成
 * 一个**完全空白**的框 —— 用户看不出「这里本来有东西」还是「这里被禁用了」。
 */
const renderInput = (input: HTMLInputElement) => {
  const draft = input.dataset.shortcut ?? '';
  const actionId = input.dataset.action as keyof ShortcutSettings;
  const actionLabel = tr(TEXTS[actionId].label);

  if (draft === '') {
    input.value = '';
    input.placeholder = tr('optDisabled');
    input.title = tr('optDisabled');
    input.setAttribute('aria-label', `${actionLabel}: ${tr('optDisabled')}`);
    return;
  }

  const display = formatShortcutLabel(draft);
  input.value = display;
  input.placeholder = '';
  // ⚠️ title 与 aria-label 都要带**完整**绑定：输入框只有 200px 宽，
  // 最长的组合（Ctrl+Alt+Shift+Meta+PgDn）装不下会被裁掉，
  // 光看框里的字分不清自己绑了什么。
  input.title = display;
  input.setAttribute('aria-label', `${actionLabel}: ${display}`);
};

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
  input.dataset.action = definition.id;
  input.dataset.shortcut = DEFAULT_SHORTCUTS[definition.id];
  input.setAttribute('aria-labelledby', `label-${definition.id}`);
  renderInput(input);

  input.addEventListener('keydown', (event) => {
    // Tab / Enter 必须放行。
    //
    // 之前这里无条件 preventDefault()，把 Tab 也当成「用户想绑定的键」存了进去。
    // 后果是纯键盘用户打开设置页就废了：焦点被永久困在第一个输入框，
    // 按多少次 Tab 都到不了 Save 按钮 —— 而 Tab 是键盘用户**唯一**的导航手段。
    //
    // Enter 同样放行：它在表单里的语义是提交，虽然这里没有 <form>，
    // 但吞掉它只会让用户以为自己按了没反应。
    if (event.key === 'Tab') {
      return;
    }

    // Enter = 保存。表单里 Enter 的语义就是提交，用户按它就是在说「好了」。
    // 之前 Enter 什么都不做，改完键直接刷新就静默丢失 —— 没有任何提示。
    if (event.key === 'Enter') {
      void save();
      return;
    }

    // Escape 放行并「取消编辑」：把输入框恢复成**已保存**绑定的样子，然后失焦。
    // 用户按 Escape 的意图是「我改错了，撤销」，不是「我要把 Escape 绑到这个动作」。
    //
    // ⚠️ 参照的是 savedShortcuts（已落盘的值），不是 dataset.shortcut（草稿）。
    // 拿草稿回填等于什么也没撤销：输入 k、按 Escape，框里还是 k，
    // 之后一点保存就把错的键写进去了。
    if (event.key === 'Escape') {
      input.dataset.shortcut = savedShortcuts[definition.id];
      renderInput(input);
      input.blur();
      clearStatusOverride();
      refreshStatus();
      return;
    }

    event.preventDefault();
    // Backspace / Delete 清空绑定 = 禁用该动作。
    //
    // ⚠️ 这里**不**让输入框失焦：失焦之后用户按 Enter 就送不到这个输入框，
    // 「Enter = 保存」在「刚清空绑定」这条路径上直接失效 —— 用户会以为
    // 没保存成功（而真实原因是焦点跑了）。焦点留着，Enter 随时能存。
    if (event.key === 'Backspace' || event.key === 'Delete') {
      input.dataset.shortcut = '';
      input.value = '';
      input.placeholder = tr('optDisabled');
      clearStatusOverride();
      refreshStatus();
      return;
    }

    const shortcut = keyboardEventToShortcut(event);
    if (!shortcut) {
      return;
    }

    input.dataset.shortcut = shortcut;
    renderInput(input);
    clearStatusOverride();
    refreshStatus();
  });

  input.addEventListener('focus', () => {
    input.value = '';
    input.placeholder = tr('optPressKey');
  });

  input.addEventListener('blur', () => {
    // 失焦**保留草稿**：用户改到一半点到别处，改动不该凭空消失
    // （要撤销有明确的 Escape）。
    renderInput(input);
  });

  inputs[definition.id] = input;
  row.appendChild(input);
  rowsRoot.appendChild(row);
});

const snapshot = (): ShortcutSettings =>
  Object.fromEntries(
    (Object.keys(inputs) as Array<keyof ShortcutSettings>).map((id) => [id, inputs[id].dataset.shortcut ?? '']),
  ) as unknown as ShortcutSettings;

/** 草稿与已保存值不一致 = 有没落盘的改动。 */
const isDirty = (): boolean =>
  (Object.keys(inputs) as Array<keyof ShortcutSettings>).some(
    (id) => (inputs[id].dataset.shortcut ?? '') !== savedShortcuts[id],
  );

interface Validation {
  canSave: boolean;
  message: string;
  isError: boolean;
  /** 冲突的动作（用于把那一行标红）。 */
  conflicts: Array<keyof ShortcutSettings>;
}

/**
 * 校验：重复绑定、浏览器保留键、扩展自带的命令键 —— 三种都**拒绝保存**。
 *
 * ⚠️ 保留键从「警告」升级成「硬拦」的理由：警告只是提醒，用户照样能存。
 * 而存下去的结果是**绑定永远不生效**（浏览器先处理那个键）——
 * 界面上写着「已保存」，用户按了没反应，这是最坏的一种结局。
 * 与其让用户自己发现，不如不让他存。
 */
const evaluate = (): Validation => {
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

  const duplicates: Array<keyof ShortcutSettings> = [];
  seen.forEach((ids) => {
    if (ids.length < 2) {
      return;
    }
    duplicates.push(...ids);
  });

  if (duplicates.length > 0) {
    duplicates.forEach((id) => inputs[id].classList.add('vsc--conflict'));
    return { canSave: false, message: tr('optDuplicate'), isError: true, conflicts: duplicates };
  }

  const commands = extensionCommandShortcuts();
  for (const [id, shortcut] of entries) {
    if (shortcut === '') {
      continue;
    }

    // 扩展自己的命令键（默认 Ctrl+Shift+,）撞上时先报「自冲突」——
    // 那条提示比「浏览器占用」更具体：用户能立刻明白自己撞的是哪个。
    if (commands.includes(canonicalShortcut(shortcut)) || isExtensionCommandShortcut(shortcut)) {
      inputs[id].classList.add('vsc--conflict');
      return { canSave: false, message: tr('optSelfConflict'), isError: true, conflicts: [id] };
    }

    if (isBrowserReservedShortcut(shortcut)) {
      inputs[id].classList.add('vsc--conflict');
      return { canSave: false, message: tr('optReserved'), isError: true, conflicts: [id] };
    }
  }

  if (isDirty()) {
    return { canSave: true, message: tr('optUnsaved'), isError: false, conflicts: [] };
  }

  return { canSave: true, message: '', isError: false, conflicts: [] };
};

const clearStatusOverride = () => {
  statusOverride = null;
};

/**
 * 刷新状态栏与保存按钮。
 *
 * 「有未保存的更改」这条提示必须**跟着草稿走**：改完键不保存就刷新页面，
 * 改动静默消失 —— 之前状态栏是空的、保存按钮文案也没变，用户根本不知道要保存。
 */
const refreshStatus = () => {
  const result = evaluate();

  if (statusOverride) {
    setStatus(statusOverride.message, statusOverride.isError);
  } else {
    setStatus(result.message, result.isError);
  }

  const dirty = isDirty();
  // 文案后面那个点是「有未保存的更改」的视觉标记：
  // 按钮还写着「保存」时，用户看不出自己已经改了东西。
  //
  // ⚠️ 这里**不**把按钮置灰：没有改动时它按下去就是把同样的值再写一遍，
  // 无害；而一个灰掉的主按钮在商店截图上看着像「功能坏了」。
  // 「有没有东西要存」由这个「•」和状态栏那一行表达。
  saveButton.textContent = dirty ? `${tr('optSave')} •` : tr('optSave');
};

const apply = (shortcuts: ShortcutSettings, options: { markSaved?: boolean } = {}) => {
  (Object.keys(shortcuts) as Array<keyof ShortcutSettings>).forEach((id) => {
    inputs[id].dataset.shortcut = shortcuts[id];
    renderInput(inputs[id]);
  });

  if (options.markSaved) {
    savedShortcuts = { ...shortcuts };
  }

  refreshStatus();
};

void loadSettings()
  .then((settings) => apply(settings.shortcuts, { markSaved: true }))
  .catch((error) => {
    console.error('Failed to load Video Speed Controller settings', error);
    apply(DEFAULT_SHORTCUTS, { markSaved: true });
  });

resetButton.addEventListener('click', () => {
  // 「恢复默认」必须**真的落盘**：之前它只改了界面，storage 里还是旧值，
  // 刷新页面又变回去 —— 用户以为恢复了，其实什么都没发生，还白等一次。
  apply(DEFAULT_SHORTCUTS, { markSaved: true });

  void saveSettings({ shortcuts: { ...DEFAULT_SHORTCUTS } })
    .then(() => {
      statusOverride = { message: tr('optRestored'), isError: false };
      refreshStatus();
    })
    .catch((error) => {
      console.error('Failed to restore Video Speed Controller defaults', error);
      clearStatusOverride();
      setStatus(tr('optSaveFailed'), true);
    });
});

const save = () => {
  const result = evaluate();
  if (!result.canSave) {
    // 错误信息必须**留在屏幕上**，直到用户改键为止 ——
    // 之前点一次「保存」就被「已保存」盖掉，用户根本不知道自己存了个冲突的键。
    clearStatusOverride();
    setStatus(result.message, true);
    return;
  }

  const values = snapshot();
  void saveSettings({ shortcuts: values })
    .then(() => {
      savedShortcuts = { ...values };
      statusOverride = { message: tr('optSaved'), isError: false };
      refreshStatus();
      window.setTimeout(() => {
        clearStatusOverride();
        refreshStatus();
      }, 1600);
    })
    .catch((error) => {
      console.error('Failed to save Video Speed Controller settings', error);
      clearStatusOverride();
      setStatus(tr('optSaveFailed'), true);
    });
};

saveButton.addEventListener('click', () => {
  save();
});
