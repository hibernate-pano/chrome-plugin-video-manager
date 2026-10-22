import { t } from '../shared/i18n';
import { formatRate } from '../shared/rate';
import {
  FRAME_FOCUS_MESSAGE,
  OPEN_OPTIONS_COMMAND,
  SPEED_REPORT_MESSAGE,
  TOGGLE_FULLSCREEN_MESSAGE,
  VIDEO_OWNER_ASK_MESSAGE,
  VIDEO_OWNER_QUERY_MESSAGE,
  VIDEO_OWNER_REPORT_MESSAGE,
} from '../shared/types';

/**
 * 工具栏图标没有弹窗：点击即切换当前标签页的网页全屏。
 * 这是 background 的第一条职责——把"点扩展图标"翻译成"全屏这个视频"。
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) {
    return;
  }

  void handleActionClick(tab.id);
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

/**
 * 默认标题。
 *
 * ⚠️ 必须与「带倍速」那条用**同一个前缀**（见 speedTitle）：
 * 两处各读各的（一个读 manifest.name、一个读 i18n）会让 tooltip 的长度
 * 在 1.0x 与 1.5x 之间突然变短 —— 那是个能被用户看见的跳动。
 *
 * 走 i18n 而不是 manifest.name：manifest 的 name 是**商店里**的名字
 * （"Video Speed Controller — Fullscreen & Keys"），而图标上的 tooltip
 * 属于界面文案，该跟着界面语言走。
 */
const defaultTitle = () => t('actionTitle', 'Video Speed Controller');

const speedTitle = (rate: number) =>
  `${defaultTitle()} — ${formatRate(rate)}x`;

/**
 * tabId -> 倍速。
 *
 * 为什么需要这份状态：清理（标签页关闭 / 导航）时得知道这个标签页
 * **到底改过速没有**。不知道的话只有两种选择——要么漏清（标题永远挂着
 * 上个页面的倍速），要么给每个标签页的每次导航都白写一次 setTitle。
 */
const tabRates = new Map<number, number>();

/**
 * tabId -> 上一次报出这个倍速的 **frame**。
 *
 * ⚠️ 为什么需要它：焦点消息里「没有倍速」有两种含义 ——
 * 「**这个 frame** 没有受控视频」与「**这个标签页**没有倍速」。
 * 只有第一种，而且只有当「报出这个倍速的就是这个 frame 自己」时，
 * 才能断定「那个视频已经不在了」→ 复位标题。
 *
 * 反过来：视频在**别的 frame** 里（嵌入框）时，焦点 frame 报「我这儿没有
 * 视频」是**正常**的 —— 那时把标题清掉就等于在正常播放时抹掉读数
 * （标题在说谎）。所以这里必须记住「这个倍速是谁报的」。
 */
const tabRateFrames = new Map<number, number>();

/**
 * 落盘的那一份长什么样。
 *
 * ⚠️ 必须连 frame 一起存：复位标题的判据是「报出这个倍速的**就是**这个
 * frame 自己」。只存倍速的话，worker 被回收后就分不清「这个 frame 说的」
 * 与「别的 frame 说的」—— 那时唯一安全的做法就是不复位，标题又会说谎。
 */
interface StoredRate {
  rate: number;
  frameId: number;
}

const rateStorageKey = (tabId: number) => `vsc-tab-rate:${tabId}`;

const rememberRate = (tabId: number, rate: number, frameId: number) => {
  tabRates.set(tabId, rate);
  tabRateFrames.set(tabId, frameId);

  // service worker 随时可能被回收，内存 Map 会跟着一起没。
  // storage.session 活得比它久，重启后仍能回答「这个标签页改过速」
  // 以及「这个倍速是谁报的」—— 后者是复位标题的唯一依据。
  // 写失败不影响主流程：内存里那份已经够 setTitle 用了。
  const stored: StoredRate = { rate, frameId };
  void chrome.storage?.session?.set?.({ [rateStorageKey(tabId)]: stored })?.catch?.(() => {});
};

/**
 * 这个标签页此刻的倍速状态（内存里没有就问 storage.session）。
 *
 * ⚠️ 懒加载：只有真的需要判断时才读 —— 读存储是一次跨进程往返，
 * 而「焦点消息里没带倍速」这条复位路径并不常走。
 *
 * 内存里命中时直接返回，不去碰存储（那条是热路径）。
 * 读到的结果会**回填**内存 Map：读一次就够，后面的判断都走热路径。
 */
const readTabRate = async (tabId: number): Promise<StoredRate | null> => {
  const cachedRate = tabRates.get(tabId);
  const cachedFrameId = tabRateFrames.get(tabId);
  if (cachedRate !== undefined && cachedFrameId !== undefined) {
    return { rate: cachedRate, frameId: cachedFrameId };
  }

  const key = rateStorageKey(tabId);
  try {
    const stored = await chrome.storage?.session?.get?.(key);
    const value = (stored as Record<string, unknown> | undefined)?.[key];
    if (value && typeof value === 'object') {
      const { rate, frameId } = value as Partial<StoredRate>;
      if (typeof rate === 'number' && typeof frameId === 'number') {
        if (cachedRate === undefined) {
          tabRates.set(tabId, rate);
        }
        if (cachedFrameId === undefined) {
          tabRateFrames.set(tabId, frameId);
        }
        return { rate: cachedRate ?? rate, frameId: cachedFrameId ?? frameId };
      }
    }
  } catch {
    // 读不到就当这个标签页没有倍速记录。
  }

  return null;
};

const forgetRate = (tabId: number) => {
  tabRates.delete(tabId);
  tabRateFrames.delete(tabId);
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

/**
 * 把「这个标签页此刻的倍速是 X」写进标题。
 *
 * 两条消息都会走到这里：内容脚本的倍速上报，以及焦点消息里顺带带的倍速
 * （焦点在 frame A 与 frame B 之间移动时，该显示谁的倍速会变）。
 *
 * @param frameId 报出这个倍速的 frame —— 用来判断「之后这个 frame 说它
 *   没有视频了」是不是意味着「那个视频已经不在了」（见 tabRateFrames）。
 */
const applySpeed = (tabId: number, rate: number, frameId: number) => {
  // ⚠️ 「是谁报的」必须在「值没变」的早退**之前**记下来：
  // 两个 frame 恰好报同一个倍速时（很常见：都停在 1.0），
  // 早退会让记录停在**上一个** frame 上 —— 于是「同一个 frame 说没有视频」
  // 这条判据会误判成「不是同一个 frame」→ 标题该复位却没复位。
  const frameChanged = tabRateFrames.get(tabId) !== frameId;
  tabRateFrames.set(tabId, frameId);

  // 内容脚本只在「值真的变了」时上报，这里再挡一道：
  // setTitle 会真的重绘工具栏，重复写没有意义。
  const rateChanged = tabRates.get(tabId) !== rate;
  if (!rateChanged && !frameChanged) {
    return;
  }

  // 落盘要连「是谁报的」一起存：worker 被回收之后，
  // 「是不是同一个 frame」是复位标题的唯一依据。
  rememberRate(tabId, rate, frameId);

  // 倍速没变就不用重绘工具栏 —— 但落盘仍然要做（换 frame 了）。
  if (rateChanged) {
    applyTitle(tabId, rate);
  }
};

/**
 * 「用户此刻在哪个 frame 里」—— tabId -> frameId。
 *
 * 为什么要有它：内容脚本注入到**所有** frame 之后，「点工具栏图标」这个意图
 * 会同时送到页面里的每一个 frame。全都执行 = 进好几次全屏、弹好几个提示。
 * 浏览器只把焦点给一个 frame，而「用户正在看的画面」就在那个 frame 里。
 *
 * ⚠️ 不靠 `document.hasFocus()` 当场判：点工具栏图标的那一刻，焦点在
 * **浏览器界面**上，页面多半是失焦的 —— 靠 hasFocus 判，结果是「图标点了
 * 没反应」。「上一次拿到焦点的那个 frame」不会因为焦点跑掉而失效。
 */
const focusedFrames = new Map<number, number>();

const focusStorageKey = (tabId: number) => `vsc-tab-focus-frame:${tabId}`;

const rememberFocusedFrame = (tabId: number, frameId: number) => {
  focusedFrames.set(tabId, frameId);

  // service worker 空闲约 30 秒就会被浏览器回收，内存 Map 会跟着一起没。
  // 不落盘的话，「看了一会儿才去点图标」就会退回顶层 frame。
  void chrome.storage?.session?.set?.({ [focusStorageKey(tabId)]: frameId })?.catch?.(() => {});
};

const forgetFocusedFrame = (tabId: number) => {
  focusedFrames.delete(tabId);
  void chrome.storage?.session?.remove?.(focusStorageKey(tabId))?.catch?.(() => {});
};

/**
 * 这个标签页的焦点在哪个 frame（内存里没有就问 storage.session）。
 *
 * 拿不到时返回 null —— 「不知道」与「在顶层」不是一回事。
 */
const readFocusedFrame = async (tabId: number): Promise<number | null> => {
  const cached = focusedFrames.get(tabId);
  if (cached !== undefined) {
    return cached;
  }

  const key = focusStorageKey(tabId);
  try {
    const stored = await chrome.storage?.session?.get?.(key);
    const value = (stored as Record<string, unknown> | undefined)?.[key];
    if (typeof value === 'number') {
      focusedFrames.set(tabId, value);
      return value;
    }
  } catch {
    // 读不到就当没有焦点记录。
  }

  return null;
};

/**
 * 「这个标签页的视频在哪儿」—— 各 frame 的回答。
 */
interface VideoOwnerReport {
  frameId: number;
  /** 显式操作（点工具栏图标）能不能接管这个 frame 里的视频。 */
  explicit: boolean;
  /** 快捷键路径能不能接管这个 frame 里的视频（比 explicit 更严）。 */
  watched: boolean;
  /** 那个视频是不是正在播。 */
  playing: boolean;
}

/**
 * 广播「你们谁有视频？」的预算（毫秒）。
 *
 * ⚠️ 广播是**一发**（chrome.tabs.sendMessage 不会重播）：某个 frame 当时
 * 没注册好监听器，就永远收不到这一次的提问。所以这个预算必须留够 ——
 * 早期版本给 60ms，机器一忙（多标签页同时加载）就答不上来，
 * 于是「图标点了没反应」「按了没反应」重新出现。
 *
 * 首选 frame 自己回答「我有视频」时立刻返回（实测约 5ms）；
 * 只有「首选 frame 里没有视频」时才会等到超时。
 */
const VIDEO_OWNER_TIMEOUT_MS = 120;

/**
 * 一次正在等待回答的广播。
 */
interface PendingAsk {
  /** 这一次的问法（谁优先、排除谁）。 */
  options: { preferredFrameId?: number; excludeFrameId?: number };
  /** 各 frame 的回答。 */
  reports: Map<number, VideoOwnerReport>;
  /** 结束这次等待（幂等）。 */
  finish: () => void;
}

/**
 * tabId -> 正在等待回答的广播。
 *
 * 一个标签页上可能同时有两次等待（点图标 + 快捷键问一圈），所以是集合。
 */
const pendingAsks = new Map<number, Set<PendingAsk>>();

/**
 * 问一圈：这个标签页的每一个 frame 各自有没有视频。
 *
 * 回答走 chrome.runtime.sendMessage（不是 tabs.sendMessage 的响应）：
 * 一次广播会有好几个 frame 同时回答，而 tabs.sendMessage 只保留**一个**响应，
 * 其余的回答会被丢掉。background 从 sender.frameId 认出是谁回答的。
 */
const askFramesOnce = (
  tabId: number,
  options: { preferredFrameId?: number; excludeFrameId?: number },
): Promise<VideoOwnerReport[]> =>
  new Promise((resolve) => {
    const reports = new Map<number, VideoOwnerReport>();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pending: PendingAsk = {
      options,
      reports,
      finish: () => {
        if (settled) {
          return;
        }
        settled = true;

        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }

        const waiting = pendingAsks.get(tabId);
        if (waiting) {
          waiting.delete(pending);
          if (waiting.size === 0) {
            pendingAsks.delete(tabId);
          }
        }

        resolve([...reports.values()]);
      },
    };

    const waiting = pendingAsks.get(tabId) ?? new Set<PendingAsk>();
    waiting.add(pending);
    pendingAsks.set(tabId, waiting);

    timer = setTimeout(() => pending.finish(), VIDEO_OWNER_TIMEOUT_MS);

    chrome.tabs.sendMessage(tabId, { type: VIDEO_OWNER_ASK_MESSAGE }, () => {
      // 页面没有内容脚本（chrome://、扩展页等）时连接会失败，静默忽略即可。
      void chrome.runtime.lastError;
    });
  });

/**
 * 没人回答时重试一遍的等待（毫秒）。
 *
 * 多等这一会儿的理由见 askFramesForVideo。
 */
const VIDEO_OWNER_RETRY_DELAY_MS = 80;

/**
 * 问一圈「这个标签页的视频在哪儿」。
 *
 * ⚠️ 广播是**一发**（chrome.tabs.sendMessage 不会重播）：某个 frame 当时
 * 还没就绪，就永远收不到这一次的提问。而内容脚本是 document_start 时
 * **动态 import** 的（见 content-loader.js），机器一忙（多标签页同时打开）
 * 就会迟到几十毫秒 —— 于是「没人回答」有两种可能：
 *
 * - 「这个页面真的没有视频」；
 * - 「那个 frame 的内容脚本还没准备好」—— 页面刚打开的那一刻最常见。
 *
 * 两者从外面看**一模一样**（零份回答），但对用户是天壤之别：
 * 前者该沉默，后者该说「视频在嵌入框里」。
 *
 * 所以：**没人回答就再问一次**。多一次广播的代价只是一次跨进程往返，
 * 换来的是「页面刚打开时按快捷键也有反馈」。
 *
 * ⚠️ 只有「快捷键问一圈」那条路径才重试：点工具栏图标时用户正等着
 * 画面全屏，多等 200ms 是能被感觉到的；而快捷键那侧等的是一句提示，
 * 晚一点出现完全无感。
 */
const askFramesForVideo = async (
  tabId: number,
  options: { preferredFrameId?: number; excludeFrameId?: number } = {},
  retryWhenSilent = false,
): Promise<VideoOwnerReport[]> => {
  const reports = await askFramesOnce(tabId, options);
  if (reports.length > 0 || !retryWhenSilent) {
    return reports;
  }

  await new Promise((resolve) => setTimeout(resolve, VIDEO_OWNER_RETRY_DELAY_MS));
  return askFramesOnce(tabId, options);
};

/**
 * 从各 frame 的回答里挑出「视频在哪儿」。
 *
 * 优先级：**焦点所在的那个 → 正在播的那个 → 随便一个有视频的**。
 *
 * ⚠️ 焦点仍然优先（「用户在哪儿操作就动哪儿的视频」这条规则不能破）：
 * 页面上方一个视频、嵌入框里另一个正在播，用户在顶层操作就该动顶层的。
 */
const pickVideoOwner = (
  reports: VideoOwnerReport[],
  focusedFrameId: number | null,
): VideoOwnerReport | null => {
  const usable = reports.filter((report) => report.explicit || report.watched);
  if (usable.length === 0) {
    return null;
  }

  if (focusedFrameId !== null) {
    const focused = usable.find((report) => report.frameId === focusedFrameId);
    if (focused) {
      return focused;
    }
  }

  return usable.find((report) => report.playing) ?? usable[0];
};

/**
 * 把「点图标」这个意图送到对的那个 frame。
 *
 * 退路：记下的 frame 可能已经没了（页面重载、SPA 把 iframe 换掉），
 * 这时 sendMessage 的回调里会报 "The frame was removed."。图标点了却
 * 毫无反应是最糟的体验，所以退回顶层 frame 再试一次。
 *
 * ⚠️ 退路**不按错误文案分流**（Chrome 在不同版本下给的是不同的字符串），
 * 多试一次的代价只是一次失败的回调。
 */
const sendToggleToFrame = (tabId: number, frameId: number) => {
  chrome.tabs.sendMessage(tabId, { type: TOGGLE_FULLSCREEN_MESSAGE }, { frameId }, () => {
    const failed = chrome.runtime?.lastError;
    if (!failed || frameId === 0) {
      return;
    }

    chrome.tabs.sendMessage(tabId, { type: TOGGLE_FULLSCREEN_MESSAGE }, { frameId: 0 }, () => {
      void chrome.runtime?.lastError;
    });
  });
};

/**
 * 点工具栏图标：先问一圈「视频在哪儿」，再把点击送到那个 frame。
 *
 * 实测（真实 Chromium）：页面上唯一的视频在嵌入框里、焦点在顶层时，
 * 点图标得到的是「这个页面里没有视频」—— 而屏幕中央明明就是那个视频。
 */
const handleActionClick = async (tabId: number) => {
  const focusedFrameId = await readFocusedFrame(tabId);
  const reports = await askFramesForVideo(
    tabId,
    focusedFrameId === null ? {} : { preferredFrameId: focusedFrameId },
  );
  const owner = pickVideoOwner(reports, focusedFrameId);

  // 找不到有视频的 frame 时，退回焦点所在的那个；再没有就用顶层。
  const targetFrameId = owner?.frameId ?? focusedFrameId ?? 0;
  sendToggleToFrame(tabId, targetFrameId);
};

chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return;
  }

  if (typeof message !== 'object' || message === null) {
    return;
  }

  const { type, rate } = message as { type?: unknown; rate?: unknown };

  // ── 「谁有视频」的回答 ──
  if (type === VIDEO_OWNER_REPORT_MESSAGE) {
    const frameId = sender.frameId;
    if (typeof frameId !== 'number') {
      return;
    }

    const waiting = pendingAsks.get(tabId);
    if (!waiting) {
      return;
    }

    const report: VideoOwnerReport = {
      frameId,
      explicit: (message as { explicit?: unknown }).explicit === true,
      watched: (message as { watched?: unknown }).watched === true,
      playing: (message as { playing?: unknown }).playing === true,
    };

    for (const pending of waiting) {
      // 问的人自己不参与回答：它自己有视频的话根本不会问。
      if (pending.options.excludeFrameId === frameId) {
        continue;
      }

      pending.reports.set(frameId, report);

      // 首选 frame 自己回答「我有视频」→ 立刻收工，不等预算耗完。
      if (
        pending.options.preferredFrameId === frameId
        && (report.explicit || report.watched)
      ) {
        pending.finish();
      }
    }

    return;
  }

  // ── 「别的 frame 有没有视频」的查询（来自快捷键那一层）──
  if (type === VIDEO_OWNER_QUERY_MESSAGE) {
    const requesterFrameId = sender.frameId ?? 0;
    void askFramesForVideo(tabId, { excludeFrameId: requesterFrameId }, true).then((reports) => {
      const owner = pickVideoOwner(reports, null);
      sendResponse({ frameId: owner?.frameId ?? null, playing: owner?.playing ?? false });
    });
    // 留着消息通道：回答是异步的。
    return true;
  }

  // ── 焦点上报 ──
  if (type === FRAME_FOCUS_MESSAGE) {
    const frameId = sender.frameId;
    if (typeof frameId !== 'number') {
      return;
    }

    rememberFocusedFrame(tabId, frameId);

    // 焦点消息顺带带着这个 frame 此刻的倍速：焦点在 frame A 与 frame B
    // 之间移动时，标题该跟着换 —— 少了这一条，标题会停在上一个 frame 的
    // 倍速上（在说谎）。
    if (typeof rate === 'number' && Number.isFinite(rate)) {
      applySpeed(tabId, rate, frameId);
      return;
    }

    // 没有倍速 = **这个 frame** 此刻没有受控视频。
    //
    // ⚠️ 它**不**等于「这个标签页没有倍速」：视频可能在别的 frame 里
    // （嵌入框），那时把标题清掉就等于在正常播放时抹掉读数。
    //
    // 唯一能复位的情形是「**报出这个倍速的就是这个 frame 自己**」——
    // 那说明那个视频真的不在了（页面被换掉 / SPA 把它删了）。
    //
    // 实测（修复前）：标签页 A 里有个视频、调到 1.5x；A 在后台被导航到
    // 一个没有视频的页面；用户切回 A → 标题仍是「… — 1.5x」，
    // 而页面上根本没有视频。（后台标签页不汇报倍速 —— reportSpeed 开头
    // 就 ownsUserFocus() 早退 —— 所以这条复位只能走焦点消息。）
    //
    // ⚠️ 这条路径是**异步**的：service worker 被回收过之后，内存里没有
    // 这个标签页的倍速，判据得去 storage.session 里拿（readTabRate）。
    // 判据本身没变 —— 仍然是「报出这个倍速的就是这个 frame 自己」。
    void (async () => {
      const state = await readTabRate(tabId);
      if (state?.frameId === frameId) {
        applySpeed(tabId, 1, frameId);
      }
    })();

    return;
  }

  // ── 倍速上报 ──
  if (type === SPEED_REPORT_MESSAGE) {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      return;
    }

    // sender.frameId 对内容脚本的消息总是在（顶层 frame 是 0）。
    // 万一不是，也得当成一个具体 frame：落盘的那份必须能回答
    // 「是不是同一个 frame」，否则 worker 一重启就再也分不清了。
    applySpeed(tabId, rate, sender.frameId ?? 0);
  }
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  forgetRate(tabId);
  forgetFocusedFrame(tabId);
});
