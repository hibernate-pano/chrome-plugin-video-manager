import { t } from '../shared/i18n';
import { formatRate } from '../shared/rate';
import {
  OPEN_OPTIONS_COMMAND,
  SPEED_REPORT_MESSAGE,
  TOGGLE_FULLSCREEN_MESSAGE,
} from '../shared/types';

/**
 * 工具栏图标没有弹窗：点击即切换当前标签页的网页全屏。
 * 这是 background 的第一条职责——把"点扩展图标"翻译成"全屏这个视频"。
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: TOGGLE_FULLSCREEN_MESSAGE }, () => {
    // 页面没有内容脚本（chrome://、扩展页等）时连接会失败，静默忽略即可。
    void chrome.runtime.lastError;
  });
});

/**
 * 打开设置页。
 *
 * ⚠️ 为什么用 `chrome.commands`（原生命令）而不是内容脚本里监听按键：
 *
 * 1. **原生命令能跨过浏览器保留键的封锁**。`Ctrl+Shift+,` 在页面上根本收不到 ——
 *    很多站点（以及浏览器自身的快捷键）会先一步吃掉它。内容脚本只能处理
 *    "已经到达页面"的事件，而原生命令在浏览器层面就被拦截，永远不会被页面吞掉。
 *
 * 2. **用户可以自己改键**。原生命令会出现在 `chrome://extensions/shortcuts` 里，
 *    用户想改就改，不需要我们再做一套快捷键配置界面。
 *
 * 3. **必须由 service worker 处理**。原生命令不会派发给内容脚本 ——
 *    它只在扩展页面（background / popup / options）里有监听器时才有效。
 *
 * 用 `openOptionsPage()` 而不是 `getURL('options.html')`：
 * 前者会**复用**已经打开的设置页标签（用户改了键立刻看到效果），
 * 后者每次都开一个新标签，越用越多。
 */
chrome.commands?.onCommand.addListener((command) => {
  if (command !== OPEN_OPTIONS_COMMAND) {
    return;
  }

  chrome.runtime.openOptionsPage();
});

/**
 * 工具栏图标标题 = 当前标签页的倍速。
 *
 * 为什么非要动标题：非全屏状态下，倍速在界面上**没有任何出口**。
 * 控制条 3 秒就隐藏（而且只有全屏才有），调速胶囊 1 秒就淡出，
 * 用户调完速转头就忘了自己调到了几倍。工具栏图标是唯一一个
 * 「一直看得见、且每个标签页各自一份」的地方。
 *
 * 每个标签页各自的标题靠 `chrome.action.setTitle({ tabId })` 实现 ——
 * 不带 tabId 会改掉所有标签页的标题。
 */

/** 1.0x 是默认值，不该显示成「1x」：默认状态多挂一截数字只是噪音。 */
const isDefaultRate = (rate: number) => Math.abs(rate - 1) < 0.001;

const defaultTitle = () =>
  chrome.runtime?.getManifest?.()?.name ?? 'Video Speed Controller — Fullscreen & Keys';

const speedTitle = (rate: number) =>
  `${t('actionTitle', 'Video Speed Controller')} — ${formatRate(rate)}x`;

/**
 * tabId -> 倍速。
 *
 * 为什么需要这份状态：清理（标签页关闭 / 导航）时得知道这个标签页
 * **到底改过速没有**。不知道的话只有两种选择——要么漏清（标题永远挂着
 * 上个页面的倍速），要么给每个标签页的每次导航都白写一次 setTitle。
 */
const tabRates = new Map<number, number>();

const rateStorageKey = (tabId: number) => `vsc-tab-rate:${tabId}`;

const rememberRate = (tabId: number, rate: number) => {
  tabRates.set(tabId, rate);

  // service worker 随时可能被回收，内存 Map 会跟着一起没。
  // storage.session 活得比它久，重启后仍能回答「这个标签页改过速」。
  // 写失败不影响主流程：内存里那份已经够 setTitle 用了。
  void chrome.storage?.session?.set?.({ [rateStorageKey(tabId)]: rate })?.catch?.(() => {});
};

const forgetRate = (tabId: number) => {
  tabRates.delete(tabId);
  void chrome.storage?.session?.remove?.(rateStorageKey(tabId))?.catch?.(() => {});
};

const applyTitle = (tabId: number, rate: number) => {
  chrome.action?.setTitle?.(
    { tabId, title: isDefaultRate(rate) ? defaultTitle() : speedTitle(rate) },
    // 回调的唯一作用：标签页可能已经关了，这里吞掉 lastError。
    () => {
      void chrome.runtime?.lastError;
    },
  );
};

/** 这个标签页改过速吗（内存里没有就问 storage.session）。 */
const hasRememberedRate = async (tabId: number) => {
  if (tabRates.has(tabId)) {
    return true;
  }

  const key = rateStorageKey(tabId);
  try {
    const stored = await chrome.storage?.session?.get?.(key);
    return typeof stored === 'object' && stored !== null && key in stored;
  } catch {
    return false;
  }
};

chrome.runtime?.onMessage?.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return;
  }

  if (typeof message !== 'object' || message === null) {
    return;
  }

  const { type, rate } = message as { type?: unknown; rate?: unknown };
  if (type !== SPEED_REPORT_MESSAGE || typeof rate !== 'number' || !Number.isFinite(rate)) {
    return;
  }

  // 内容脚本只在「值真的变了」时上报，这里再挡一道：
  // setTitle 会真的重绘工具栏，重复写没有意义。
  if (tabRates.get(tabId) === rate) {
    return;
  }

  rememberRate(tabId, rate);
  applyTitle(tabId, rate);
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  forgetRate(tabId);
});

chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
  // 导航到新页面 = 新视频 = 回到 1.0x。
  // 内容脚本不会主动上报这件事（它只在变化时上报），所以只能由这里清掉，
  // 否则换了个页面，工具栏还挂着上一个页面的倍速。
  if (changeInfo.status !== 'loading') {
    return;
  }

  void hasRememberedRate(tabId).then((hadRate) => {
    if (!hadRate) {
      return;
    }

    forgetRate(tabId);
    applyTitle(tabId, 1);
  });
});
