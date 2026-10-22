import { t } from '../shared/i18n';
import { formatRate } from '../shared/rate';
import {
  EXTENSION_INSTALLED_MESSAGE,
  ExtensionInstalledMessage,
  FRAME_FOCUS_MESSAGE,
  FRAME_GONE_MESSAGE,
  FRAME_PROBE_MESSAGE,
  FrameProbeMessage,
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
        // ⚠️ 回填时不能拿**旧**的那份盖掉内存里更新的那份。
        //
        // 等待存储期间可能来了一份**新**读数（applySpeed 已经写进内存了）——
        // 那份比存储里这份**新**。原来这里拿「await 之前记下的 cachedRate」
        // 去判断要不要回填，而那是在 await **之前**取的 ——
        // 于是 await 期间到来的新读数会被**旧快照覆盖**：
        // 内存里的读数错了（「这个倍速是哪个 frame 报的」也错了），
        // 之后的每一次判据都在错的基础上算 —— 标题开始说谎。
        //
        // ⚠️ 返回值**仍然是调用那一刻的快照**：这份读数是「我据以做判断的那份」，
        // 「等待期间有没有更新的读数到过」由版本号那道闸门回答（见 tabRateRevisions）。
        const currentRate = tabRates.get(tabId);
        const currentFrameId = tabRateFrames.get(tabId);
        if (currentRate === undefined) {
          tabRates.set(tabId, rate);
        }
        if (currentFrameId === undefined) {
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
  // 版本号也 +1：正在等待的异步复位路径会发现自己手里的版本号过期了
  // （读数已经没了，它再动手就是多此一举）。
  tabRateRevisions.set(tabId, (tabRateRevisions.get(tabId) ?? 0) + 1);
  void chrome.storage?.session?.remove?.(rateStorageKey(tabId))?.catch?.(() => {});
};

/**
 * 「这个标签页是在扩展装好之前就开着的」—— tabId 集合。
 *
 * ⚠️ 为什么需要它：扩展装好/更新**之前**就打开的标签页，跑的不是当前版本
 * （刚装：那个标签页压根没有内容脚本；刚更新：只剩一个上下文已死的僵尸），
 * 而用户在里面按什么键都不会有反应 —— 他能得出的唯一结论是「扩展坏了」。
 *
 * 那个标签页里的内容脚本救不了自己（它要么不存在，要么已经死了），
 * 所以这句话只能从**外面**说 —— 也就是工具栏图标的标题。
 *
 * ⚠️ 为什么不用图标 badge：badge 是这个产品**明确不做的**东西
 * （见 docs/LAUNCH.md「What I deliberately left out」），
 * 而标题本来就是这个产品唯一的「每个标签页各自一份」的信息位
 * （平时显示倍速，见 applyTitle）。
 */
const staleTabs = new Set<number>();

const applyTitle = (tabId: number, rate: number) => {
  // ⚠️ 提示「刷新」时**不报倍速**：那个标签页里的倍速读数本来就是旧的
  // （它跑的是旧副本），报出来就是在说谎。
  const title = staleTabs.has(tabId)
    ? `${defaultTitle()} — ${t('refreshThisPage', '请刷新本页')}`
    : isDefaultRate(rate)
      ? defaultTitle()
      : speedTitle(rate);

  chrome.action?.setTitle?.(
    { tabId, title },
    // 回调的唯一作用：标签页可能已经关了，这里吞掉 lastError。
    () => {
      void chrome.runtime?.lastError;
    },
  );
};

/**
 * 这个标签页不再「过期」了 —— 标题回到倍速读数。
 *
 * 什么时候算不再过期：那个标签页里的内容脚本**又活过来了**
 * （刷新过 / 导航过 / 重新装上了扩展）。
 */
const clearStaleMark = (tabId: number) => {
  if (!staleTabs.has(tabId)) {
    return;
  }

  staleTabs.delete(tabId);

  // 标题回到「这个标签页此刻的读数」：读数还在就还读数，没了才回默认。
  // ⚠️ 先看内存（热路径），再看 storage.session（worker 被回收过的情况）。
  const rate = tabRates.get(tabId);
  if (rate !== undefined) {
    applyTitle(tabId, rate);
    return;
  }

  // ⚠️ 版本号必须在**进异步之前**采样（见 captureRateRevision）。
  //
  // 这条路径与「复位读数」是同一个病根：**拿着一个快照，跨过一次 await，
  // 然后按那个快照写标题**。等待期间来了一份新读数（焦点消息里带着倍速时
  // 走的就是 applySpeed），那一份已经把标题写对了 ——
  // 这里再把**旧快照**写回去，就等于把刚写对的读数擦掉。
  //
  // ⚠️ 实测（已复现）：扩展刚装好 → 那个标签页被标成「过期」→
  // 用户刷新它 → 新内容脚本发焦点上报（带 1.5x）→ 标题正确地显示「— 1.5x」
  // → 这一行的异步续段随后把它改回「Video Speed Controller」——
  // 扩展开始说一个**假的**倍速。
  const revision = captureRateRevision(tabId);

  void readTabRate(tabId).then((stored) => {
    // 等待期间来了新读数 → 那份读数已经自己写好标题了，这里不许再写。
    if (!rateRevisionUnchanged(tabId, revision)) {
      return;
    }

    applyTitle(tabId, stored?.rate ?? 1);
  });
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

  // 每次都换一次「版本号」：复位路径是**异步**的（要等探针），
  // 等待期间可能来了一份**新的**上报 —— 那时「按旧判据清掉」就成了一步错棋。
  // 版本号变了就说明「有新的读数到了」→ 旧判据作废。
  tabRateRevisions.set(tabId, (tabRateRevisions.get(tabId) ?? 0) + 1);

  // 落盘要连「是谁报的」一起存：worker 被回收之后，
  // 「是不是同一个 frame」是复位标题的唯一依据。
  rememberRate(tabId, rate, frameId);

  // 倍速没变就不用重绘工具栏 —— 但落盘仍然要做（换 frame 了）。
  if (rateChanged) {
    applyTitle(tabId, rate);
  }
};

/* ------------------------------------------------------------------ *
 * 「装完了」—— chrome.runtime.onInstalled
 *
 * ⚠️ 为什么这条机制**只能**在 background 里：
 * `chrome.runtime.onInstalled` 在内容脚本里是 **undefined**
 * （实测：内容脚本里取不到它）—— 它只存在于扩展页面与 service worker。
 * 而「装完了」这件事本身，只有 background 知道。
 *
 * ⚠️ 它与「已经失效了」是**两件事**，别混成一条：
 * - 「已经失效了」= 内容脚本发现自己的上下文死了（被更新/重载/被禁用）
 *   → 它在**页面里**说一句话；
 * - 「装完了」= 扩展刚装好/刚更新，**当时已经开着**的那些标签页跑的是旧副本
 *   → 它们要么没有内容脚本，要么只剩一个死掉的僵尸，**自己说不出话**，
 *   只能由 background 从外面说。
 */

/**
 * 当前版本号。读不到就当空字符串 ——
 * 于是「版本相同」这条判据退化成「答不上来就是过期」，宁可多提醒一次。
 */
const currentVersion = (): string => {
  try {
    return chrome.runtime?.getManifest?.()?.version ?? '';
  } catch {
    return '';
  }
};

/**
 * 问一个标签页：「你这一层跑的是哪一版？」
 *
 * ⚠️ 答不上来（回调带 lastError）有三种可能，**这里不区分**：
 * 那个标签页压根没有内容脚本（刚装）、它的内容脚本已经死了（刚更新）、
 * 或者它正在启动还没注册监听器 —— 三种都意味着「它现在不能替你干活」。
 *
 * ⚠️ 实测：`chrome.tabs.sendMessage` **送不到**僵尸内容脚本
 * （它的 chrome.runtime 上下文已经死了），也送不到没有内容脚本的标签页
 * （"Could not establish connection. Receiving end does not exist."）。
 * 唯一能往那些标签页里塞东西的办法是 `chrome.scripting.executeScript`，
 * 而它需要 "scripting" 权限 —— 那是一次 manifest 改动。
 */
const askTabVersion = (tabId: number): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      const message: ExtensionInstalledMessage = { type: EXTENSION_INSTALLED_MESSAGE };
      chrome.tabs.sendMessage(
        tabId,
        message,
        (response: unknown) => {
          if (chrome.runtime?.lastError) {
            resolve(null);
            return;
          }

          const payload = response as { version?: unknown } | undefined;
          resolve(typeof payload?.version === 'string' ? payload.version : null);
        },
      );
    } catch {
      resolve(null);
    }
  });

/**
 * 扩展装好/更新完成 → 告诉**当时已经开着**的标签页刷新一下。
 */
const markStaleTabs = async (): Promise<void> => {
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = (await chrome.tabs?.query?.({})) ?? [];
  } catch {
    return;
  }

  const version = currentVersion();

  for (const tab of tabs) {
    if (tab.id == null) {
      continue;
    }

    // 扩展自己的页面（设置页）不参与：那里本来就该是最新版。
    if (tab.url?.startsWith('chrome-extension://')) {
      continue;
    }

    const answered = await askTabVersion(tab.id);
    // 答得上、而且版本一样 → 那个标签页是在扩展装好**之后**才打开的
    // → 它跑的就是当前版本 → 不用提醒。
    if (answered !== null && answered === version) {
      continue;
    }

    staleTabs.add(tab.id);
    applyTitle(tab.id, 1);
  }
};

chrome.runtime?.onInstalled?.addListener(() => {
  // ⚠️ 这里**不落盘**：没有人读的东西就不该写。
  // 「装于 …」这种信息要留在 storage.local 里的话，它得配一个**现在就有**的
  // 读取端（设置页显示安装时间）—— 那是另一个功能，不该藏在这条机制里。
  // 多写一份没人读的东西 = 多一份隐私披露义务（见 PRIVACY.md 的存储表），
  // 而 Chrome Web Store 的审核会核对「声明的隐私实践 vs 实际行为」。
  void markStaleTabs();
});

/**
 * tabId -> 这个标签页的读数「版本号」。
 *
 * 每次有新上报就 +1。它存在的唯一理由：**复位路径是异步的** ——
 * 判据要等探针的回答（一次跨进程往返），等待期间完全可能有新的上报到达
 * （整页导航之后，新页面的内容脚本启动时就会报一次）。
 *
 * 那种情况下「按旧判据清掉读数」就成了一步错棋：用户刚调好的读数被抹掉，
 * 而新读数才是真的。所以异步路径在动手之前要核对版本号：
 * 变了就说明有新的读数到了，**新读数赢**。
 *
 * ⚠️ 只在内存里：service worker 被回收之后版本号归零，
 * 而那时内存里的读数也一起没了 —— 判据本来就只能从 storage.session 来，
 * 版本号只是用来防「同一次 worker 生命周期内」的竞争。
 */
const tabRateRevisions = new Map<number, number>();

/**
 * 采一份「读数版本号」—— **必须在第一次 await 之前**。
 *
 * ⚠️ 取样点一旦落在 await **之后**，那道闸门就看不见「等待期间来了新读数」
 * 这件事，于是它**永远不成立**（死代码）：从取样点到比较点之间一个 await 都没有，
 * 版本号不可能变。
 *
 * 所以取样点钉在**消息处理函数的最开头**（同步，在 await 之前），
 * 比较点钉在**动手的那一刻**（见 resetTabRate）——
 * 两端各钉死一个，中间无论插几次 await，闸门都不会失效。
 */
const captureRateRevision = (tabId: number): number => tabRateRevisions.get(tabId) ?? 0;

/**
 * 这份判据还成立吗？（期间没有新的读数到过）
 */
const rateRevisionUnchanged = (tabId: number, revision: number): boolean =>
  (tabRateRevisions.get(tabId) ?? 0) === revision;

/**
 * 探针的结果：这个 frame 还在吗？它报出去的那个视频还在吗？
 */
interface FrameProbe {
  /** 收到了回答 = 这个 frame 还活着。 */
  alive: boolean;
  /** 那个视频的状态（见 FrameProbeResponse['video']）。 */
  video: 'alive' | 'gone' | 'unknown';
  /** 视频还在的话，它此刻的倍速。 */
  rate: number | null;
}

/**
 * 探针扑空时的重试间隔（毫秒）。
 *
 * 内容脚本是 document_start 时**动态 import** 的（见 content-loader.js）：
 * frame 已经在了、监听器还没注册上的那几十毫秒里，探针会扑空。
 * 扑空与「frame 没了」在回调里长得一模一样（都有 lastError），
 * 所以宁可多问一次 —— 多试一次的代价只是一次失败的回调。
 */
const FRAME_PROBE_RETRY_DELAY_MS = 80;

/**
 * 问某个 frame：「你还在吗？你报出去的那个视频还在吗？」
 *
 * ⚠️ **不按错误文案分流**：Chrome 在不同版本下给的是不同的字符串
 * （「No frame with id 3 in tab with id 7」/「Frame with ID 3 was removed」…），
 * 按文案匹配等于把判据建在别人的实现细节上。
 * 这里只认一件事：**有没有人回答**。回答了 = 这个 frame 还活着；
 * 没人回答 = 它已经不在了（或者还没准备好 —— 所以重试一次）。
 */
const probeFrame = async (tabId: number, frameId: number): Promise<FrameProbe> => {
  const message: FrameProbeMessage = { type: FRAME_PROBE_MESSAGE };

  const ask = () => new Promise<{ answered: boolean; payload: unknown }>((resolve) => {
    try {
      chrome.tabs.sendMessage(
        tabId,
        message,
        { frameId },
        (response: unknown) => {
          if (chrome.runtime?.lastError) {
            resolve({ answered: false, payload: null });
            return;
          }

          resolve({ answered: true, payload: response });
        },
      );
    } catch {
      resolve({ answered: false, payload: null });
    }
  });

  let attempt = await ask();
  if (!attempt.answered) {
    await new Promise((resolve) => setTimeout(resolve, FRAME_PROBE_RETRY_DELAY_MS));
    attempt = await ask();
  }

  if (!attempt.answered) {
    return { alive: false, video: 'gone', rate: null };
  }

  const payload = attempt.payload as { video?: unknown; rate?: unknown } | null;
  const rate = typeof payload?.rate === 'number' && Number.isFinite(payload.rate)
    ? payload.rate
    : null;

  if (payload?.video === 'alive') {
    return { alive: true, video: 'alive', rate };
  }

  if (payload?.video === 'gone') {
    return { alive: true, video: 'gone', rate: null };
  }

  return { alive: true, video: 'unknown', rate: null };
};

/**
 * 复位这个标签页的读数：标题回到默认，存储里那份记录删掉。
 *
 * ⚠️ 删掉而不是写成 1：那份记录的价值全在「是谁报的」上
 * （见 tabRateFrames），写成 1 只会留下一条「这个标签页是 1 倍」的假记录。
 */
const resetTabRate = (tabId: number) => {
  forgetRate(tabId);
  applyTitle(tabId, 1);
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
 * 焦点记录指着的 frame 还在吗？不在就清掉它。
 *
 * 为什么需要：焦点记录决定「点工具栏图标」这个意图发给谁。
 * 那个 frame 没了却还记着它，图标就会打到一个不存在的 frame 上
 * （退路是顶层 frame —— 见 sendToggleToFrame，但那是退路，不是常态）。
 */
const forgetDeadFocusedFrame = async (tabId: number) => {
  const focusedFrameId = await readFocusedFrame(tabId);
  if (focusedFrameId === null) {
    return;
  }

  const probe = await probeFrame(tabId, focusedFrameId);
  if (probe.alive) {
    return;
  }

  forgetFocusedFrame(tabId);
};

/**
 * 复核这个标签页的读数：那条记录指向的 frame 还在吗？它报的视频还在吗？
 *
 * 什么时候会走到这里：
 * - 标签页换了 URL（SPA 换页 / 整页跳转）；
 * - 某个 frame 报告「我这一层没有受控视频」，而读数是**别的** frame 报的。
 *
 * 两种结果：
 * - 那个视频还在 → 读数继续有效（顺带把倍速刷新成它此刻真实的值）；
 * - 那个 frame 或那个视频没了 → 读数作废：标题复位、存储删掉。
 *
 * ⚠️ **不按「URL 变了」就清**：同文档导航（history.pushState）也会带 URL 变化，
 * 而那时视频还好好地播着 1.2 倍 —— 清掉就是让标题与画面自相矛盾
 * （6.2.0 修过一次的老毛病）。判据是「那个视频还在不在」，不是「换页了没」。
 */
const revalidateTabRate = async (tabId: number) => {
  // ⚠️ 版本号必须在**第一次 await 之前**采样（见 captureRateRevision）。
  //
  // 原来这个采样点在 `await readTabRate` **之后** —— 那样的话，
  // 「读存储那一次 await 期间到达的新读数」它根本看不见
  // （闸门只挡住了后半截窗口，前半截无人看守）。
  const revision = captureRateRevision(tabId);

  const state = await readTabRate(tabId);
  if (!state) {
    // 这个标签页没有读数。但焦点记录可能还指着已经没了的 frame ——
    // 那会让「点工具栏图标」打到一个不存在的 frame 上。
    await forgetDeadFocusedFrame(tabId);
    return;
  }

  const probe = await probeFrame(tabId, state.frameId);

  const current = await readTabRate(tabId);
  if (!current || current.rate !== state.rate || current.frameId !== state.frameId) {
    return;
  }

  // ⚠️ 闸门贴着**动手**的那一行：比较点与动手之间不能有 await ——
  // 否则最后那一小段窗口没人看守（版本号变了就说明有新的读数到过）。
  if (!rateRevisionUnchanged(tabId, revision)) {
    // 等待期间有了新的读数 → 新读数赢，这一步旧判据作废。
    return;
  }

  if (probe.alive && probe.video === 'alive') {
    // 那个视频还在 → 读数继续有效。倍速被站点改回去了就跟着改。
    if (probe.rate !== null && probe.rate !== state.rate) {
      applySpeed(tabId, probe.rate, state.frameId);
    }
    return;
  }

  // frame 没了 / 它报出去的那个视频被页面换掉了 / 它换过一次文档
  // （新的内容脚本还没报过倍速）→ 读数作废。
  resetTabRate(tabId);
  await forgetDeadFocusedFrame(tabId);
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

    // 这个标签页里的内容脚本**又说话了** → 它不是「装好之前就开着」的那个了
    // （要么刷新过，要么重新装上了扩展）→ 标题回到倍速读数。
    clearStaleMark(tabId);

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
    //
    // ⚠️ 版本号必须在**进异步之前**采样（见 captureRateRevision）。
    // 原来这个采样点在 `await readTabRate` **之后** —— 于是「读存储那一次
    // await 期间到达的新读数」它根本看不见（闸门只挡住后半截窗口）。
    const revision = captureRateRevision(tabId);

    void (async () => {
      const state = await readTabRate(tabId);
      if (!state) {
        return;
      }

      if (state.frameId === frameId) {
        // 报出这个倍速的就是这个 frame 自己，而它现在说「我这儿没有受控视频」
        // → 那个视频已经不在了 → 复位。
        //
        // ⚠️ 这条分支原来**压根没有版本号闸门**：读存储那一次 await 期间
        // 来了新读数（整页导航后新页面的内容脚本启动就会报一次），
        // 这里会拿旧判据把新读数抹掉 ——
        // 标题从「— 2x」退回默认的「Video Speed Controller」，
        // 扩展开始说一个**假的**倍速。
        if (!rateRevisionUnchanged(tabId, revision)) {
          return;
        }

        resetTabRate(tabId);
        return;
      }

      // 读数是**别的** frame 报的：顶层说「我这儿没有视频」是**正常**的
      // （视频在嵌入框里），那时抹掉读数就是让标题在说谎。
      //
      // ⚠️ 但也不能就此认定读数还有效 —— 那个 frame 可能已经没了
      // （SPA 把 iframe 换掉了）：这时标题会一直挂着早已不存在的倍速，
      // 而且**没有人**会来说这件事（它已经不会说话了）。
      // 所以问它一句：还在吗？还在就留着读数，不在就复位。
      const probe = await probeFrame(tabId, state.frameId);
      if (probe.alive && probe.video !== 'gone') {
        return;
      }

      const current = await readTabRate(tabId);
      if (!current || current.rate !== state.rate || current.frameId !== state.frameId) {
        return;
      }

      // ⚠️ 闸门贴着**动手**的那一行：比较点与动手之间不能有 await ——
      // 否则最后那一小段窗口没人看守。
      if (!rateRevisionUnchanged(tabId, revision)) {
        return;
      }

      resetTabRate(tabId);
    })();

    return;
  }

  // ── 「我这一层要走了」──
  if (type === FRAME_GONE_MESSAGE) {
    const frameId = sender.frameId;
    if (typeof frameId !== 'number') {
      return;
    }

    // ⚠️ 版本号要在**进异步之前**记下：读存储是异步的，这期间可能有
    // **新的**上报到了（新页面的内容脚本启动时就会报一次）。
    // 那时的读数不是这一层的 —— 这一层正在卸载，它报的那份已经作废，
    // 但**新**的那份是有效的。版本号变了就说明有新读数，
    // 不许拿「这一层走了」去清掉它。
    const revision = captureRateRevision(tabId);

    // 这一层自己说它要走了（页面卸载 / iframe 被换掉）。
    // 读数是它报的就作废 —— 这是**唯一确定**的信号：
    // 别的信号都只是「猜」（URL 变了？换页了？），而这一条是事实。
    void (async () => {
      const state = await readTabRate(tabId);
      if (!state || state.frameId !== frameId) {
        return;
      }

      if (!rateRevisionUnchanged(tabId, revision)) {
        return;
      }

      resetTabRate(tabId);
      await forgetDeadFocusedFrame(tabId);
    })();

    return;
  }

  // ── 倍速上报 ──
  if (type === SPEED_REPORT_MESSAGE) {
    const frameId = sender.frameId ?? 0;

    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      // ⚠️ **不带 rate 的上报不是「无效消息」**，它是一句有意义的陈述：
      // 「**这一层**此刻没有受控视频」。
      //
      // ⚠️ 它**不**等于「这个标签页没有倍速了」：倍速可能是**别的** frame
      // 报的（视频在嵌入框里、而这一层是顶层）。所以绝不能一收到就清读数 ——
      // 那等于在正常播放时抹掉读数（标题在说谎）。
      //
      // 正确的判据是「这份读数是不是**这一层**报出来的」：
      // - 是 → 那个视频已经不在了 → 复位；
      // - 不是 → 问那个 frame 一句「你的视频还在吗」（探针）：
      //   还在 → 读数继续有效；不在 → 复位。
      //
      // ⚠️ 以前这里直接 `return`，把这句话整个丢掉了 ——
      // 于是「视频被站点换掉 → 那一层说它没有视频了」这条信号**永远到不了**，
      // 标题继续挂着早已不存在的倍速（这正是本次要修的那个故障）。
      // ⚠️ 版本号要在**进异步之前**记下 —— 与上面 FRAME_GONE 分支同一写法。
      //
      // 读存储是异步的，这期间可能来了一份**新的**读数
      // （新页面的内容脚本启动时就会报一次）。那时不能拿旧判据去覆盖它。
      //
      // ⚠️ 原来这个采样点在 `await readTabRate` **之后**，
      // 而从采样点到下面那次比较之间**一个 await 都没有** ——
      // 于是版本号不可能变，那道闸门**永远不成立**（死代码）。
      // 可观测后果：等待期间到达的新读数（实测 2x）会被 `resetTabRate` 抹掉，
      // 标题从「— 2x」退回默认的「Video Speed Controller」——
      // 扩展开始说一个**假**的倍速。
      const revision = captureRateRevision(tabId);

      void (async () => {
        const state = await readTabRate(tabId);
        if (!state) {
          // 这个标签页本来就没有读数，没什么可清。
          return;
        }

        if (state.frameId === frameId) {
          // 报出这个倍速的就是这一层，而它现在说「我这儿没有受控视频」
          // → 那个视频已经不在了 → 复位。
          if (!rateRevisionUnchanged(tabId, revision)) {
            return;
          }

          resetTabRate(tabId);
          return;
        }

        // 读数是**别的** frame 报的：这一层说「我这儿没有视频」是**正常**的
        // （视频在嵌入框里）。但也不能就此认定读数还有效 ——
        // 那个 frame 可能已经没了（SPA 把 iframe 换掉了），
        // 而它不会再说这件事。问它一句。
        const probe = await probeFrame(tabId, state.frameId);
        if (probe.alive && probe.video !== 'gone') {
          return;
        }

        const current = await readTabRate(tabId);
        if (!current || current.rate !== state.rate || current.frameId !== state.frameId) {
          return;
        }

        // ⚠️ 闸门贴着**动手**的那一行：比较点与动手之间不能有 await ——
        // 否则最后那一小段窗口没人看守。
        if (!rateRevisionUnchanged(tabId, revision)) {
          return;
        }

        resetTabRate(tabId);
      })();

      return;
    }

    // sender.frameId 对内容脚本的消息总是在（顶层 frame 是 0）。
    // 万一不是，也得当成一个具体 frame：落盘的那份必须能回答
    // 「是不是同一个 frame」，否则 worker 一重启就再也分不清了。
    applySpeed(tabId, rate, frameId);
  }
});

/**
 * tabId -> 上一次看到的 URL。
 *
 * 为什么要它：chrome.tabs.onUpdated 的 changeInfo.url 只在「URL 变了」时出现，
 * 但它出现时**并不能**说明「导航真的发生了」——
 * 同一个文档里的路由变化（history.pushState）也会带着新 URL 出现。
 * 拿它跟上一次对比，才能把「同一个 URL 的状态变化」
 * （loading / complete / favicon…）全部滤掉。
 *
 * ⚠️ 这是内存里的：service worker 被回收之后这份就没了，
 * 于是回收后的第一次 URL 变化会被当成「变了」（判据交给探针，无害）。
 */
const lastTabUrls = new Map<number, string>();

chrome.tabs?.onRemoved?.addListener((tabId) => {
  forgetRate(tabId);
  forgetFocusedFrame(tabId);
  lastTabUrls.delete(tabId);
});

/**
 * 标签页换了 URL → 复核这个标签页的读数。
 *
 * 为什么需要这条：SPA 把页面里的 iframe 整个换掉时，
 * 那个 iframe 里的视频（以及它报出来的倍速）就此消失，
 * 而**没有人**会来说这件事 —— 它已经不会说话了。
 * 于是标题会一直挂着早已不存在的倍速（标题在说谎）。
 *
 * ⚠️ **换页不等于倍速归 1**（那是 6.2.0 之前的老做法，见 CHANGELOG）：
 * 同文档导航也会带 URL 变化，而那时视频还好好地播着 1.2 倍。
 * 清不清，交给探针按「那个视频还在不在」判断 —— 这条监听器只负责
 * 「什么时候该问一句」。
 */
chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
  // 一次导航开始 → 那个标签页会拿到**新的**内容脚本 → 它不再「过期」。
  //
  // ⚠️ 这条不看 URL：同页刷新（reload）不改 URL，但内容脚本确实换了 ——
  // 而「装好之前就开着的那个标签页」正是靠刷新才能救回来的。
  if (changeInfo.status === 'loading') {
    clearStaleMark(tabId);
  }

  const url = changeInfo.url;
  if (typeof url !== 'string') {
    return;
  }

  const previous = lastTabUrls.get(tabId);
  lastTabUrls.set(tabId, url);
  if (previous === url) {
    // URL 没真的变 → 不动。
    return;
  }

  void revalidateTabRate(tabId);
});
