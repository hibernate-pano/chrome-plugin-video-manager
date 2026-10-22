import { currentLocale, t } from '../shared/i18n';
import { keyboardEventToShortcut, shortcutsOverlap } from '../shared/shortcuts';
import {
  FIRST_RUN_HINT_MAX_FAILED_ATTEMPTS,
  loadSettings,
  readFirstRunHintCooldownUntil,
  readFirstRunHintFailedAttempts,
  resetFirstRunHintState,
  saveSettings,
} from '../shared/settings';
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
  optLead: '每个动作都可以改键。在输入框里按 Backspace / Delete 清空绑定 = 禁用该动作，按 Esc 撤销刚才这次修改，保存后已打开的页面会立即生效。这些键只在页面里正在播放的视频上生效 —— 页面上没有视频时按它们不会有任何反应。',
  optSave: '保存',
  optReset: '恢复默认',
  optUndoRestore: '撤销恢复默认',
  optRestoreUndone: '已撤销恢复默认',
  optPressKey: '按下要绑定的键 · Backspace 清空 · Esc 撤销',
  optDisabled: '未绑定（已禁用）',
  optSaved: '已保存',
  optRestored: '已恢复默认',
  optSaveFailed: '保存失败，请重试',
  optLoadFailed: '读取设置失败，你的快捷键没有被改动。请重试读取。',
  optRetryLoad: '重试读取',
  optLoadOk: '设置已重新读取',
  optUnsaved: '有未保存的更改',
  optDuplicate: '『$1』与『$2』绑定了同一个键，每个动作必须不同',
  optDuplicateRow: '与『$1』重复（$2）',
  optReserved: '这个键被浏览器占用，换一个',
  optSelfConflict: '这个键是扩展自己的命令，换一个',
  optProductName: 'Video Speed Controller — Fullscreen & Keys',
  optPageTitle: 'Video Speed Controller — Fullscreen & Keys',
  optPrivacy: '隐私政策',
  optRepository: '源码仓库',
  optVersion: '版本',
  optTipsToolbar: '点击工具栏图标可切换网页全屏',
  optTipsOptions: '按 $1 打开设置页',
  optionFirstRunHintTitle: '使用引导',
  optionResetFirstRunHintDesc: '引导只出现一次。点这里重置后，回到视频页遇到视频时会再出现一次 —— 已经打开的标签页也会，不用刷新页面。',
  optionResetFirstRunHint: '重新显示使用引导',
  optionResetFirstRunHintDone: '已重置',
  optionResetFirstRunHintFailed: '重置失败，请重试',
  optionFirstRunHintFailed: '已关闭 $1 次（再关闭 $2 次将暂时不再出现）',
  optionFirstRunHintCooldown: '冷却中，$1 之后会再次出现',
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
  actionFullscreenDesc: '切换网页全屏',
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

/**
 * 「使用引导」那一块**自己**的样式。
 *
 * ⚠️ 为什么不在 options-theme.ts 里：那个文件在这一轮由另一个 agent 改，
 * 两边同时写同一个文件必然打架。这里只用现成的调色板变量（--vsc-divider），
 * 没有硬编码颜色 —— 深色模式不会因此多出一个漏配的点。
 *
 * 目的只有一个：让「使用引导」**看起来就不像快捷键表**。
 * 它跟页脚的那些链接是一类东西（都是产品的周边说明），
 * 所以它用一条细分割线跟正文分开，而不是再套一张白卡片。
 */
const hintStyle = document.createElement('style');
hintStyle.textContent = `
.vsc__hint {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid var(--vsc-divider);
}

.vsc__hint .vsc__row {
  padding: 0;
  border-bottom: none;
}
`;
document.head.appendChild(hintStyle);

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
    <!--
      「重新显示使用引导」。

      引导是整个产品**唯一**的可见入口，而它只出现一次 —— 用户在它出现之前
      关掉页面、或读着读着按错了键关掉它，就再也看不到它了。
      这个按钮是那条**唯一的出口**：清掉「已展示 / 失败次数 / 冷却」三个标记，
      下次遇到视频时引导会再出现一次。

      ⚠️ 三个标记必须一起清（settings.ts 的 resetFirstRunHintState）：
      只清「已展示」的话，处在冷却期的用户点了按钮仍然看不到引导 ——
      那等于给了一个不兑现的按钮。

      ⚠️ 下面那一行（#hint-state）把「失败次数 / 冷却中」显示出来：
      冷却期原本是**完全静默**的 —— 引导不出现，界面上一个字都没有，
      用户只能猜「为什么它不出现」。

      ⚠️ **位置**：它原来夹在快捷键表与快捷键表的「保存」按钮之间，
      两件不相干的事共用一条动作行；而且它跟快捷键表用的是同一个
      .vsc__card，看上去像是快捷键表的一部分。
      它跟页脚那些链接是一类东西，所以排在页脚附近，
      并且不再套那张白卡片。
    -->
    <section class="vsc__hint" id="hint">
      <div class="vsc__row">
        <div>
          <p class="vsc__row-label" id="label-first-run-hint">${tr('optionFirstRunHintTitle')}</p>
          <p class="vsc__row-desc">${tr('optionResetFirstRunHintDesc')}</p>
          <p class="vsc__row-note" id="hint-state"></p>
        </div>
        <button type="button" class="vsc__button" id="reset-hint">${tr('optionResetFirstRunHint')}</button>
      </div>
    </section>
    <footer class="vsc__footer">
      <span class="vsc__version">${tr('optVersion')} ${readVersion()}</span>
      <span class="vsc__sep" aria-hidden="true">·</span>
      <a class="vsc__link" href="${PRIVACY_URL}" target="_blank" rel="noreferrer noopener">${tr('optPrivacy')}</a>
      <span class="vsc__sep" aria-hidden="true">·</span>
      <a class="vsc__link" href="${REPO_URL}" target="_blank" rel="noreferrer noopener">${tr('optRepository')}</a>
    </footer>
    <!--
      动作条（保存 / 恢复默认 / 状态栏）。

      ⚠️ 它必须是 <main> 里的**最后一个**元素 —— 这不是排版偏好，是硬约束：
      position: sticky; bottom: 0 只有在它是包含块里**最后一个**流内元素时
      才是真的「吸底」。它后面若还有别的元素，滚到页面底部时它会被那些元素
      顶起来、脱离视口底边；而在**不滚动**的视口（1280×800 正好装下）里，
      吸底根本不生效，它会孤零零地悬在页面中间、下面还空出一段。

      之前它排在快捷键表之后、引导之前 —— 于是「保存」按钮既不吸底、
      又紧贴着表格像表格自己的页脚，下面还空着 50px 才轮到「使用引导」。

      两条改动要一起做，只做一条会更糟：
      1. DOM 顺序：动作条挪到 <main> 的最后（这里）；
      2. 视觉层级：动作条**不再**紧贴快捷键表 —— 中间隔着「使用引导」
         与版本行，它读起来才是「这一页的操作条」而不是「这张表的页脚」。
      引导仍然不是 .vsc__card（那会让它看着像快捷键表的一部分）。
    -->
    <div class="vsc__actions">
      <span class="vsc__status" id="status" role="status" aria-live="polite"></span>
      <button type="button" class="vsc__button" id="retry-load" hidden>${tr('optRetryLoad')}</button>
      <button type="button" class="vsc__button" id="reset">${tr('optReset')}</button>
      <button type="button" class="vsc__button vsc__button--primary" id="save">${tr('optSave')}</button>
    </div>
  </main>
`;

const rowsRoot = document.getElementById('rows')!;
const statusNode = document.getElementById('status')!;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const resetButton = document.getElementById('reset') as HTMLButtonElement;
const retryLoadButton = document.getElementById('retry-load') as HTMLButtonElement;
const resetHintButton = document.getElementById('reset-hint') as HTMLButtonElement;
const hintStateNode = document.getElementById('hint-state');

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
 * **读取设置失败了吗？**
 *
 * ⚠️ 这是整页最重要的一条状态。
 * 读取失败时，界面上显示的是**默认值**，而 storage 里是用户真实的绑定。
 * 此时任何一次「保存」都会拿默认值覆盖真值 —— 用户 7 条自定义绑定里的 6 条
 * 被静默抹掉，而页面从头到尾显示「一切正常」。
 *
 * 所以：读失败 → 界面标成不可保存 → 保存与「恢复默认」**一律拒绝** →
 * 给一条明确的错误 + 一个「重试读取」。
 */
let loadFailed = false;

/**
 * 用户**刚刚**改的是哪一行。
 *
 * 用来在出错时把焦点送回他正在改的那一行 —— 之前永远送到第一行，
 * 用户改的是第 7 行，焦点却被送到第 1 行（视口滚回页面顶部）。
 */
let lastEdited: keyof ShortcutSettings | null = null;

/**
 * 状态栏的「临时消息」。
 *
 * 三种来源共用这一条通道，但**寿命不同**：
 * - 成功（已保存 / 已恢复默认）：一两秒后自动让位。
 * - 失败（保存失败）：**粘住** —— 直到下一次成功为止。
 *   之前它只是直接写进 DOM，下一次改键就被 evaluate() 的结果盖掉，
 *   「保存失败，请重试」只在「用户什么都不做」的那几秒里存在。
 * - 读取失败：同样粘住，而且它是**前提** —— 在读到真值之前不能写盘。
 */
interface StatusOverride {
  message: string;
  isError: boolean;
  /** 粘住：不随计时器消失，也不被「改键」清掉。 */
  sticky: boolean;
}

let statusOverride: StatusOverride | null = null;
let statusTimer: number | null = null;

const setStatus = (message: string, isError = false) => {
  statusNode.textContent = message;
  statusNode.classList.toggle('vsc--error', isError);
};

const clearStatusTimer = () => {
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }
};

/**
 * 临时消息（已保存 / 已恢复默认）：一两秒后自动让位。
 *
 * ⚠️ 它盖不住**实时**的校验错误（重复绑定 / 保留键）—— 那些必须一直留在
 * 屏幕上，直到用户改键为止。
 */
const showTransientStatus = (message: string) => {
  clearStatusTimer();
  statusOverride = { message, isError: false, sticky: false };
  statusTimer = window.setTimeout(() => {
    statusTimer = null;
    statusOverride = null;
    refreshStatus();
  }, 1600);
  refreshStatus();
};

/**
 * 错误消息：**粘住**，直到下一次成功为止。
 *
 * ⚠️ 之前失败只是 `setStatus(tr('optSaveFailed'), true)` 直接写进 DOM，
 * 下一次改键时 refreshStatus() 就用 evaluate() 的结果把它盖掉 ——
 * 用户看到的是「有未保存的更改」，完全不知道刚才那次保存**没成功**。
 */
const showStickyError = (message: string) => {
  clearStatusTimer();
  statusOverride = { message, isError: true, sticky: true };
  refreshStatus();
};

/**
 * 抹掉临时消息。
 *
 * ⚠️ 粘住的**错误**不抹：保存失败之后用户再改一个键，失败信息必须还在。
 */
const clearStatusOverride = () => {
  if (statusOverride?.sticky) {
    return;
  }
  clearStatusTimer();
  statusOverride = null;
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
  // ⚠️ title 与 aria-label 都要带**完整**绑定：输入框只有 250px 宽，
  // 最长的组合（Ctrl+Alt+Shift+Meta+PgDn）装不下会被裁掉，
  // 光看框里的字分不清自己绑了什么。
  input.title = display;
  input.setAttribute('aria-label', `${actionLabel}: ${display}`);
};

SHORTCUT_DEFINITIONS.forEach((definition) => {
  const texts = TEXTS[definition.id];
  const row = document.createElement('div');
  row.className = 'vsc__row';
  // ⚠️ 每一行都挂一个**就地渲染**的错误节点：
  // 状态栏在页面**最底部**，出错的行在最上面 —— 读屏用户听到「有按键被重复绑定」
  // 却不知道是哪一行、跟谁撞了；视觉用户也可能隔着十几屏。
  // 输入框用 aria-describedby 指向这个节点，读屏聚焦时就会念出来。
  row.innerHTML = `
    <div>
      <p class="vsc__row-label" id="label-${definition.id}">${tr(texts.label)}</p>
      <p class="vsc__row-desc" id="desc-${definition.id}">${tr(texts.description)}</p>
      <p class="vsc__row-error" id="error-${definition.id}"></p>
    </div>
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.className = 'vsc__key';
  input.dataset.action = definition.id;
  input.dataset.shortcut = DEFAULT_SHORTCUTS[definition.id];
  // ⚠️ 这里**故意不写** aria-labelledby。
  //
  // accname 的规则是 aria-labelledby **优先于** aria-label：
  // 两者同时存在时，aria-label 是**死代码**。
  // 之前就是这个组合 —— 实测 Chrome 的 AX tree 里那个 textbox 的 name
  // 只有「加速」，「加速: =」从来没被念出来过；读屏用户完全不知道
  // 现在绑的是哪个键。
  //
  // 现在只留 aria-label（renderInput 里写成「动作名: 当前绑定的键」），
  // 可访问名里就带上了当前绑定。它仍然**包含**可见的动作名，
  // 满足 WCAG 2.5.3「标签在名字里」。
  //
  // ⚠️ 那一行下面那行说明（「加快播放速度（+0.1，长按连续）」）必须**跟着输入框**。
  //
  // 之前它只是个 <p>：读屏用户在表单模式（焦点模式）里聚焦输入框时，
  // 听到的只有动作名与当前绑定 —— 「这个动作到底做什么」这句话他听不到，
  // 只能靠浏览模式整页读过去。视觉用户一眼就看到了，读屏用户没有。
  //
  // 出错时这一句与就地渲染的错误句**都**在 describedby 里（错误在后）：
  // 读者先听到「这个动作是什么」，再听到「哪里不对」。
  input.setAttribute('aria-describedby', `desc-${definition.id}`);
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
      lastEdited = definition.id;
      // ⚠️ 改了就作废「撤销恢复默认」：那份备份已经过期了。
      invalidateRestoreUndo();
      clearStatusOverride();
      refreshStatus();
      return;
    }

    const shortcut = keyboardEventToShortcut(event);
    if (!shortcut) {
      return;
    }

    input.dataset.shortcut = shortcut;
    // ⚠️ 记住用户刚改的是哪一行：出错了要把焦点送回**这一行**，
    // 而不是永远送到第一行。
    lastEdited = definition.id;
    renderInput(input);
    // ⚠️ 改了就作废「撤销恢复默认」：那份备份已经过期了。
    invalidateRestoreUndo();
    clearStatusOverride();
    refreshStatus();
  });

  input.addEventListener('focus', () => {
    // ⚠️ **不清空** value。
    //
    // 之前聚焦时把框里的字清掉，于是读屏用户聚焦过去时那个 textbox 的
    // AX value 直接没了 —— 他听到的是「加速，只读，加快播放速度（+0.1…）」，
    // 完全不知道现在绑的是哪个键。
    //
    // 现在框里一直显示着当前绑定（读屏会念出来），要改键直接按就行：
    // 这个控件本质是「按键录制器」，它显示的就是当前录到的键。
    //
    // ⚠️ 聚焦时的占位符必须说清**怎么清空**与**怎么撤销**：
    // 输入框是只读的（readOnly），用户只能看到自己绑的键，
    // 却看不到「怎么变成空」—— 而「留空 = 禁用该动作」是设置页明写着的规则；
    // 而 Escape 撤销也是**真实存在**的行为，之前页面上一句话都没提。
    input.placeholder = tr('optPressKey');
    // 框只有 250px 宽，长文案放不下 —— title 兜底（鼠标悬停 / 读屏）。
    input.title = tr('optPressKey');
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
  /**
   * 每个出错的动作 → 就地渲染的错误文案。
   *
   * ⚠️ 必须**逐行**给：只说「有按键被重复绑定」的话，用户既不知道是哪一行，
   * 也不知道跟**谁**撞了 —— 而错误就在他眼前的那一格。
   */
  fieldErrors: Partial<Record<keyof ShortcutSettings, string>>;
}

/**
 * 校验：重复绑定、浏览器保留键、扩展自带的命令键 —— 三种都**拒绝保存**。
 *
 * ⚠️ 保留键从「警告」升级成「硬拦」的理由：警告只是提醒，用户照样能存。
 * 而存下去的结果是**绑定永远不生效**（浏览器先处理那个键）——
 * 界面上写着「已保存」，用户按了没反应，这是最坏的一种结局。
 * 与其让用户自己发现，不如不让他存。
 *
 * ⚠️⚠️ **重复检测必须用 `shortcutsOverlap`，不能比原始字符串**
 * （6.2.0 审计缺陷 4）。
 *
 * 原始字符串比的是「两个串一样吗」，而**运行时比的是「同一个物理事件会不会
 * 同时命中两条」**。两者不是一回事：`plus` 与 `shift+plus` 是两个不同的串，
 * 但运行时空洞的那一档放宽了 Shift 的比较，于是**同一个物理事件同时命中
 * 两条** —— 而 `matchAction` 按固定顺序返回，排在前面那条永远赢。
 *
 * 症状：设置页显示「已保存」，两行都没有错误；
 * 按 Shift+= 时倍速变了（加速赢了），重置**一次都没发生**。
 *
 * 所以这里必须用**与运行时同一份判据**（`shortcutsOverlap` 住在
 * `src/shared/shortcuts.ts`）—— 两层用同一份判据，才不会出现
 * 「设置页说没事、运行时打架」。
 */
const evaluate = (): Validation => {
  const values = snapshot();
  const entries = Object.entries(values) as Array<[keyof ShortcutSettings, string]>;

  Object.values(inputs).forEach((input) => input.classList.remove('vsc--conflict'));

  const duplicates: Array<keyof ShortcutSettings> = [];
  /** 每一行跟**谁**撞了 —— 错误文案要指名道姓，不能只说「有重复」。 */
  const duplicatePartners = new Map<keyof ShortcutSettings, keyof ShortcutSettings>();

  // ⚠️ 两两比对，而不是「按字符串分组」：
  // 撞车的判据是「同一个物理事件会不会同时命中两条」，
  // 那不是「两个串相不相同」能回答的（见上面的说明）。
  entries.forEach(([id, shortcut]) => {
    if (shortcut === '') {
      return;
    }

    const partner = entries.find(
      ([otherId, other]) => otherId !== id && other !== '' && shortcutsOverlap(shortcut, other),
    );

    if (!partner) {
      return;
    }

    if (!duplicates.includes(id)) {
      duplicates.push(id);
    }
    if (!duplicates.includes(partner[0])) {
      duplicates.push(partner[0]);
    }
    // 每一行都要知道跟**谁**撞了（错误文案要指名道姓）。
    duplicatePartners.set(id, partner[0]);
    duplicatePartners.set(partner[0], id);
  });

  if (duplicates.length > 0) {
    const fieldErrors: Partial<Record<keyof ShortcutSettings, string>> = {};

    duplicates.forEach((id) => {
      inputs[id].classList.add('vsc--conflict');
      const other = duplicatePartners.get(id);
      // ⚠️ 错误文案里要带上**撞的那个键**。
      //
      // 之前只写「与『加速』重复」：用户知道自己撞了「加速」，却不知道自己
      // 按的是哪个键 —— 那行框里的字又被聚焦时的处理清空了，
      // 于是他完全无从判断自己到底按了什么。
      fieldErrors[id] = other
        ? trWith('optDuplicateRow', [
            tr(TEXTS[other].label),
            formatShortcutLabel(values[id] ?? ''),
          ])
        : tr('optDuplicateRow');
    });

    const first = duplicates[0]!;
    const second = duplicatePartners.get(first) ?? first;

    return {
      canSave: false,
      // ⚠️ 底部状态栏也要带动作名：读屏用户听到的是一句飘上来的话，
      // 没有名字他就不知道要去改哪两行。
      message: trWith('optDuplicate', [tr(TEXTS[first].label), tr(TEXTS[second].label)]),
      isError: true,
      conflicts: duplicates,
      fieldErrors,
    };
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
      return {
        canSave: false,
        message: tr('optSelfConflict'),
        isError: true,
        conflicts: [id],
        fieldErrors: { [id]: tr('optSelfConflict') },
      };
    }

    if (isBrowserReservedShortcut(shortcut)) {
      inputs[id].classList.add('vsc--conflict');
      return {
        canSave: false,
        message: tr('optReserved'),
        isError: true,
        conflicts: [id],
        fieldErrors: { [id]: tr('optReserved') },
      };
    }
  }

  if (isDirty()) {
    return { canSave: true, message: tr('optUnsaved'), isError: false, conflicts: [], fieldErrors: {} };
  }

  return { canSave: true, message: '', isError: false, conflicts: [], fieldErrors: {} };
};

/**
 * 把逐行错误渲染到输入框旁边，并把输入框标成「无效」。
 *
 * ⚠️ aria-describedby 指向的是**就地渲染**的那一条：
 * 读屏用户聚焦到出错的输入框时，错误就在他耳边念出来 ——
 * 而状态栏在页面最底部，指不出是哪一行。
 */
const applyFieldErrors = (fieldErrors: Partial<Record<keyof ShortcutSettings, string>>) => {
  (Object.keys(inputs) as Array<keyof ShortcutSettings>).forEach((id) => {
    const input = inputs[id];
    const message = fieldErrors[id];
    const errorNode = document.getElementById(`error-${id}`);

    if (errorNode) {
      errorNode.textContent = message ?? '';
    }

    if (message) {
      input.setAttribute('aria-invalid', 'true');
      // 描述在前、错误在后：读者先听到「这个动作是什么」，再听到「哪里不对」。
      input.setAttribute('aria-describedby', `desc-${id} error-${id}`);
    } else {
      input.removeAttribute('aria-invalid');
      // ⚠️ 这里**不能**把 aria-describedby 整个摘掉：那会让「这一行在做什么」
      // 又从读屏用户的耳朵里消失（它是无条件存在的行说明，不是错误信息）。
      input.setAttribute('aria-describedby', `desc-${id}`);
    }
  });
};

/**
 * 把焦点移到**出错的那一行**。
 *
 * ⚠️ 优先聚焦**用户刚改的那一行**。
 * 之前永远聚焦 conflicts[0]（= SHORTCUT_DEFINITIONS 的第一行「加速」）：
 * 用户改的是第 7 行，焦点却被送到第 1 行 —— 视口滚回页面顶部，
 * 他正在改的那一行滚出屏幕，得自己再找回来。
 *
 * ⚠️ 键盘用户不用自己找：状态栏在页面最底部，光标还停在「保存」按钮上，
 * 他根本不知道该往哪儿挪。
 *
 * ⚠️ 但**不能**在每次改键时都抢焦点 —— 用户正在输入框里打字时，
 * 焦点被抢走就等于「打不了字」。所以只在「焦点不在任何输入框里」时挪。
 */
const focusFirstConflict = (conflicts: Array<keyof ShortcutSettings>) => {
  const target =
    lastEdited && conflicts.includes(lastEdited) ? lastEdited : conflicts[0];
  if (!target) {
    return;
  }

  const active = document.activeElement;
  const isTyping = active instanceof HTMLInputElement;
  if (isTyping) {
    return;
  }

  inputs[target]?.focus();
};

/**
 * 刷新状态栏与保存按钮。
 *
 * 「有未保存的更改」这条提示必须**跟着草稿走**：改完键不保存就刷新页面，
 * 改动静默消失 —— 之前状态栏是空的、保存按钮文案也没变，用户根本不知道要保存。
 */
const refreshStatus = () => {
  const result = evaluate();

  // ⚠️ 逐行错误必须**跟着草稿走**：改完键冲突消失了，那一行的红框与
  // 错误文案就要一起消失（否则上一轮的错一直挂在界面上）。
  applyFieldErrors(result.fieldErrors);

  // ⚠️ 状态栏的优先级（从高到低）：
  // 1. **粘住的错误** —— 「上次没存上」「读不到真值」这两件事
  //    不会因为用户改了个键就消失；之前失败只是直接写进 DOM 的，
  //    下一次改键就被下面的结果盖掉了。
  // 2. **实时校验错误** —— 那是当前草稿的问题（重复绑定 / 保留键），
  //    比任何历史消息都要紧。
  // 3. 临时消息（已保存 / 已恢复默认）。
  // 4. 校验的常态结果（有未保存的更改 / 空）。
  if (statusOverride?.sticky) {
    setStatus(statusOverride.message, statusOverride.isError);
  } else if (result.isError) {
    setStatus(result.message, true);
  } else if (statusOverride) {
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
  //
  // ⚠️ 读不到真值时**不**显示「•」：此刻界面上的值只是默认值，
  // 它与「已保存的值」之间根本没有可比性 —— 说「有未保存的更改」是假的。
  saveButton.textContent = dirty && !loadFailed ? `${tr('optSave')} •` : tr('optSave');

  // ⚠️ 读不到真值时，保存与「恢复默认」都不成立 ——
  // 写下去就是拿默认值覆盖用户真实的绑定。
  //
  // 用 aria-disabled 而不是 disabled 属性：disabled 的按钮**不能聚焦**，
  // 读屏用户根本走不到它、也就听不到「为什么存不上」。
  // aria-disabled 保留可聚焦性，点下去会给出明确错误。
  if (loadFailed) {
    saveButton.setAttribute('aria-disabled', 'true');
    resetButton.setAttribute('aria-disabled', 'true');
  } else {
    saveButton.removeAttribute('aria-disabled');
    resetButton.removeAttribute('aria-disabled');
  }
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

/**
 * 读取设置。
 *
 * ⚠️ **读取失败时绝对不能** `apply(DEFAULT_SHORTCUTS, { markSaved: true })`。
 *
 * 那是这一轮最要命的一个 bug：那行代码把默认值当成了「用户已经保存过的值」——
 * 页面上显示默认键、状态栏是空的、「保存」按钮上没有「•」，
 * 用户完全看不出这里出过任何事；接着他改一个键按「保存」，
 * storage 里 7 条自定义绑定中的 6 条被默认值**静默抹掉**，
 * 而页面从头到尾显示「一切正常」。
 *
 * 所以读取失败时：界面标成「读不到」、保存与「恢复默认」**一律拒绝**、
 * 状态栏给出明确错误、并给一个「重试读取」。
 */
const loadShortcuts = async (isRetry = false): Promise<void> => {
  try {
    const settings = await loadSettings();
    loadFailed = false;
    retryLoadButton.hidden = true;
    apply(settings.shortcuts, { markSaved: true });
    if (isRetry) {
      showTransientStatus(tr('optLoadOk'));
    }
  } catch (error) {
    console.error('Failed to load Video Speed Controller settings', error);
    loadFailed = true;
    // ⚠️ 只改界面，**不** markSaved：我们根本不知道用户存的是什么，
    // 不能把它当成「已保存的值」。
    apply(DEFAULT_SHORTCUTS);
    retryLoadButton.hidden = false;
    showStickyError(tr('optLoadFailed'));
  }
};

/**
 * 「恢复默认」之前的值 —— 唯一的退路。
 *
 * ⚠️ 页面**不显示历史**：一旦落盘，用户原来的自定义键就再也找不回来了。
 * 这份备份是唯一能把它拿回来的东西。
 */
let restoreBackup: ShortcutSettings | null = null;
let restoreUndoTimer: number | null = null;

const clearRestoreUndo = () => {
  if (restoreUndoTimer !== null) {
    window.clearTimeout(restoreUndoTimer);
    restoreUndoTimer = null;
  }
  restoreBackup = null;
  resetButton.textContent = tr('optReset');
};

/**
 * 「撤销恢复默认」这条退路**只在他没再动过任何东西的时候**有效。
 *
 * ⚠️ 之前它只靠 8 秒的计时器过期：用户在这 8 秒里改了键、或者改了键并保存，
 * 那份备份就已经**过期**了 —— 拿它去「撤销」会把用户刚保存的东西一起冲掉。
 * 所以：改键 → 退路作废；保存成功 → 退路作废。
 */
const invalidateRestoreUndo = () => {
  if (restoreBackup) {
    clearRestoreUndo();
  }
};

/**
 * 「恢复默认」。
 *
 * ⚠️ 必须走「改草稿 → **保存成功之后**才 markSaved」这一套。
 * 之前是 apply(DEFAULT_SHORTCUTS, { markSaved: true }) **在写盘之前**就改了
 * savedShortcuts：写盘失败之后页面显示默认值、storage 里还是旧值、
 * 「保存」按钮上没有「•」—— 页面看着干净且已保存，实际一个字节都没写。
 */
const restoreDefaults = () => {
  if (loadFailed) {
    showStickyError(tr('optLoadFailed'));
    return;
  }

  // 撤销用的备份 = **界面上此刻的值**（用户看到的），不是 savedShortcuts。
  const backup = snapshot();

  apply(DEFAULT_SHORTCUTS);

  void saveSettings({ shortcuts: { ...DEFAULT_SHORTCUTS } })
    .then(() => {
      savedShortcuts = { ...DEFAULT_SHORTCUTS };
      // ⚠️ 「恢复默认」落盘之后给一条**撤销**：
      // 误点一下就把 7 条绑定全恢复默认，而页面**不显示历史**，
      // 用户原来的自定义键在界面上没有任何记录可以找回。
      restoreBackup = backup;
      resetButton.textContent = tr('optUndoRestore');
      showTransientStatus(tr('optRestored'));

      // 几秒后按钮文案放回去：一直写着「撤销恢复默认」是**假话** ——
      // 备份早就过期了（用户可能已经又改了好几轮）。
      if (restoreUndoTimer !== null) {
        window.clearTimeout(restoreUndoTimer);
      }
      restoreUndoTimer = window.setTimeout(clearRestoreUndo, 8000);
    })
    .catch((error) => {
      console.error('Failed to restore Video Speed Controller defaults', error);
      // ⚠️ 回滚界面：storage 里是用户原来的绑定，界面必须跟它一致 ——
      // 否则页面显示着默认值（「看起来已经恢复了」），实际一个字节都没写。
      apply(backup);
      // 失败提示要**粘住**：用户再动一下输入框，它也不能消失。
      showStickyError(tr('optSaveFailed'));
    });
};

/** 撤销上一次「恢复默认」。 */
const undoRestoreDefaults = () => {
  const backup = restoreBackup;
  if (!backup) {
    return;
  }

  clearRestoreUndo();
  apply(backup);

  void saveSettings({ shortcuts: { ...backup } })
    .then(() => {
      savedShortcuts = { ...backup };
      showTransientStatus(tr('optRestoreUndone'));
    })
    .catch((error) => {
      console.error('Failed to undo restoring Video Speed Controller defaults', error);
      // storage 里还是默认值：界面必须跟它一致。
      apply(DEFAULT_SHORTCUTS);
      savedShortcuts = { ...DEFAULT_SHORTCUTS };
      showStickyError(tr('optSaveFailed'));
    });
};

resetButton.addEventListener('click', () => {
  if (restoreBackup) {
    undoRestoreDefaults();
    return;
  }
  restoreDefaults();
});

const save = () => {
  // ⚠️ 读到真值之前**一个字节都不写**：
  // 此刻界面上的值只是默认值，写下去就是拿默认值覆盖用户真实的绑定。
  if (loadFailed) {
    showStickyError(tr('optLoadFailed'));
    return;
  }

  const result = evaluate();
  if (!result.canSave) {
    // 错误信息必须**留在屏幕上**，直到用户改键为止 ——
    // 之前点一次「保存」就被「已保存」盖掉，用户根本不知道自己存了个冲突的键。
    clearStatusOverride();
    // 逐行错误也要在保存失败时立刻渲染（用户可能直接点「保存」，
    // 还没触发过任何改键事件）。refreshStatus() 会一并渲染。
    refreshStatus();
    // ⚠️ 焦点挪到**用户刚改的那一行**：键盘用户不用自己找。
    focusFirstConflict(result.conflicts);
    return;
  }

  const values = snapshot();
  void saveSettings({ shortcuts: values })
    .then(() => {
      savedShortcuts = { ...values };
      // ⚠️ 存过了：「恢复默认」那份备份不再代表用户想要的东西了。
      invalidateRestoreUndo();
      showTransientStatus(tr('optSaved'));
    })
    .catch((error) => {
      console.error('Failed to save Video Speed Controller settings', error);
      // ⚠️ savedShortcuts **不**更新：这次没存上，
      // 「已保存的值」仍然是上一次存成功的那一份。
      // 失败提示**粘住**：用户再改一个键，它也不能被盖掉 ——
      // 之前它是直接写进 DOM 的，下一次改键就被「有未保存的更改」顶掉了。
      showStickyError(tr('optSaveFailed'));
    });
};

saveButton.addEventListener('click', () => {
  save();
});

retryLoadButton.addEventListener('click', () => {
  void loadShortcuts(true);
});

/**
 * 有没落盘的改动就走 → 拦一下。
 *
 * ⚠️ 之前完全没有拦阻：用户改完键直接刷新页面或关掉标签页，
 * 改动静默消失，而界面上唯一的那句提示（「有未保存的更改」）还压在很下面。
 *
 * ⚠️ 监听器**只装一个**：用 AbortController 挂在 window 上，
 * 同一个窗口里模块被重新求值时（开发时的热重载、测试里反复 render），
 * 旧的那个监听器必须先撤掉 —— 否则它拿着**上一代**的输入框判断「有没有改动」，
 * 会对着已经不在页面上的元素做决定。
 */
type BeforeUnloadWindow = Window & { __vscBeforeUnloadAbort?: AbortController };

const unloadWindow = window as BeforeUnloadWindow;
unloadWindow.__vscBeforeUnloadAbort?.abort();
const unloadController = new AbortController();
unloadWindow.__vscBeforeUnloadAbort = unloadController;

window.addEventListener(
  'beforeunload',
  (event) => {
    if (!isDirty()) {
      return;
    }
    event.preventDefault();
    // ⚠️ Chrome 要的是 preventDefault **加** returnValue，两个都要给。
    event.returnValue = '';
  },
  { signal: unloadController.signal },
);

/**
 * 「重新显示使用引导」按钮。
 *
 * ⚠️ 反馈必须**看得见**：引导本来就是一次性、错过就没了的东西，
 * 用户点完这个按钮如果什么都没发生，他只会以为按钮坏了 ——
 * 而他没看到引导这件事本身正是他要解决的问题。
 * 所以按钮文案当场变成「已重置」，状态栏（role=status，live region）
 * 也说一句，读屏用户同样能听到确认。
 */
let hintResetTimer: number | null = null;

/**
 * 把引导的状态（失败次数 / 冷却）显示出来。
 *
 * ⚠️ 冷却期原本是**完全静默**的：引导不出现，界面上一个字都没有。
 * 用户只能猜「为什么它不出现」—— 而引导是这个产品唯一的入口。
 * 把状态摊开，他至少知道自己是被「冷却」挡住的，而不是以为功能坏了。
 */
const renderHintState = async () => {
  if (!hintStateNode) {
    return;
  }

  const [attempts, cooldownUntil] = await Promise.all([
    readFirstRunHintFailedAttempts(),
    readFirstRunHintCooldownUntil(),
  ]);

  if (cooldownUntil !== null) {
    hintStateNode.textContent = trWith('optionFirstRunHintCooldown', [formatDateTime(cooldownUntil)]);
    return;
  }

  if (attempts > 0) {
    hintStateNode.textContent = trWith('optionFirstRunHintFailed', [
      String(attempts),
      String(Math.max(0, FIRST_RUN_HINT_MAX_FAILED_ATTEMPTS - attempts)),
    ]);
    return;
  }

  hintStateNode.textContent = '';
};

/** 冷却结束时间（本地化格式）。 */
const formatDateTime = (timestamp: number): string => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
};

const restoreHintButton = () => {
  resetHintButton.textContent = tr('optionResetFirstRunHint');
  if (hintResetTimer !== null) {
    window.clearTimeout(hintResetTimer);
    hintResetTimer = null;
  }
};

resetHintButton.addEventListener('click', () => {
  void resetFirstRunHintState()
    .then(() => {
      resetHintButton.textContent = tr('optionResetFirstRunHintDone');
      showTransientStatus(tr('optionResetFirstRunHintDone'));
      // 重置之后失败次数与冷却都没了，那一行状态也要跟着清掉。
      void renderHintState();

      // 几秒后把按钮文案放回去：一直写着「已重置」是**假话** ——
      // 用户第二次点它时，它其实什么都不会发生（状态早就清了）。
      if (hintResetTimer !== null) {
        window.clearTimeout(hintResetTimer);
      }
      hintResetTimer = window.setTimeout(() => {
        restoreHintButton();
        clearStatusOverride();
        refreshStatus();
      }, 2400);
    })
    .catch((error) => {
      console.error('Failed to reset the first-run hint state', error);
      restoreHintButton();
      // 失败提示**粘住**：用户再动一下输入框，它也不能消失。
      showStickyError(tr('optionResetFirstRunHintFailed'));
    });
});

// 页面一打开就把引导的状态摊开（用户还没点任何按钮时也该看得见）。
void renderHintState();

// 读取设置（读失败时界面会标成「读不到」，并给一个「重试读取」）。
void loadShortcuts();
