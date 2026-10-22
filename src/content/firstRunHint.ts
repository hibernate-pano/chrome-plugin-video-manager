import { currentLocale, t } from '../shared/i18n';
import { formatShortcutForPlatform, isMacPlatform, matchesShortcut } from '../shared/shortcuts';
import {
  clearFirstRunHintFailures,
  isFirstRunHintInCooldown,
  markFirstRunHintShown,
  recordFirstRunHintFailedAttempt,
  subscribeToFirstRunHintState,
  wasFirstRunHintShown,
  type FirstRunHintStateChange,
} from '../shared/settings';
import type { ShortcutSettings } from '../shared/types';
import {
  isDecorativeAutoplay,
  isPageMainContent,
  isSiteMainPlayerVideo,
} from './ambientPreview';
import { FULLSCREEN_OVERLAY_ID, NOTICE_CARD_TOKENS } from './runtimeStyles';
import { TransientPill } from './transientPill';
import { closestSelector } from '../shared/domMatches';
import { observeBody } from './bodyObserver';
import type { BodyObserver } from './bodyObserver';

const HINT_ID = 'vsc-first-run-hint';
/** 关闭按钮的 id（引导自己的节点，不是页面的）。 */
const HINT_CLOSE_BUTTON_ID = 'vsc-first-run-hint-close';
const HINT_DURATION = 12000;
/**
 * 播放多久之后才算「真的在看视频」。
 *
 * ⚠️ 这条只能回答「用户是不是看了一会儿」，**不能**回答「这是不是用户在看的
 * 那个视频」—— 装饰性预览同样会播过 2.5 秒。后者由 ambientPreview 的共享判定判，
 * 两道判据各管各的，不能互相顶替。
 */
const WATCH_DELAY = 2500;

/**
 * 提示显示多久之后才算「用户读过了」。
 *
 * ⚠️ 落盘的判据是「**用户读过了**」，不是「提示弹出来了」——
 * 弹出来就写 flag 的话，用户还没来得及看，那唯一一次机会就被烧掉了。
 *
 * ⚠️ 这**不是一个常量**，而是按**行数**算的（见 readWindowMs）：
 * 精简版两行、完整版四行，而两者的字数差了不止一倍。
 * 固定 2 秒只够读完精简版；完整版有 4 行（两行动作 + 工具栏 + 去哪儿改绑），
 * 13px 字号 + line-height 1.4（卡片 token，见 runtimeStyles.ts）→ 每行 18.2px、
 * 4 行 72.8px，中文 60 字要 4~5 秒、英文 90 字符要 6~8 秒。
 * 计时器一满就落盘「已展示」，此后再也不出现 —— 判据必须与实际文案长度对得上。
 */
const READ_DELAY_PER_LINE = 1000;

/**
 * 英文的语种系数。
 *
 * 同样的行数，英文的字数是中文的两三倍（"Press $1 to toggle page fullscreen"
 * 比「按 $1 切换网页全屏」长得多），给一样的秒数读不完。
 */
const READ_DELAY_LANGUAGE_FACTOR_EN = 1.5;

/**
 * 当前渲染的语言是不是英文。
 *
 * ⚠️ 必须同时要求「chrome.i18n 存在」：没有它时 currentLocale() 会回落到 'en'，
 * 而此时渲染的其实是**中文回落文案** —— 按英文估阅读时间就估长了。
 */
const isEnglishRender = (): boolean => {
  if (typeof chrome === 'undefined' || typeof chrome.i18n?.getMessage !== 'function') {
    return false;
  }

  return currentLocale().toLowerCase().startsWith('en');
};

/**
 * 这一次展示的阅读窗口（毫秒）。
 *
 * @param text 这一档**实际显示**的文案（行数由它决定）。
 */
const readWindowMs = (text: string): number => {
  const lines = Math.max(1, text.split('\n').length);
  const factor = isEnglishRender() ? READ_DELAY_LANGUAGE_FACTOR_EN : 1;

  return Math.round(lines * READ_DELAY_PER_LINE * factor);
};

/**
 * 连续多少次「没读成就被打断」之后进入冷却。
 *
 * ⚠️ 上限、冷却时长与冷却时间戳都放在 `src/shared/settings.ts` ——
 * 设置页的「重新显示使用引导」按钮也要读同一份状态，
 * 放在内容脚本里就成了两份事实。
 *
 * 冷却期内**不写** `vsc-first-run-hint-shown` ——
 * 那个 flag 是「这辈子只提示一次」的一次性开关，用户没真看到就不该消耗掉。
 * 不写 flag 意味着这次机会还在（清掉本地数据、换台设备都还会给一次）。
 */

/**
 * 提示被打断的原因 —— 它们的后果**完全不同**，不能混为一谈。
 *
 * - accepted：用户按了扩展自己绑定的键 → 他读懂了并接受 →
 *   提示消失，并记为「已展示」（以后不再打扰）。
 * - ignored：用户只是碰了一下键盘（Shift、Ctrl、随便一个字母）→
 *   提示淡出，但**不记失败**：碰键盘不是拒绝。
 * - dismissed：用户点了页面。**只有显示满阅读窗口之后**才算拒绝
 *   （见 dismiss 里的判据）；窗口之内的误点只算忽略，提示都不关。
 * - refused：用户点了引导自己的「×」→ 这是**唯一**的「我故意关掉它」，
 *   永远算一次拒绝。
 */
type DismissReason = 'accepted' | 'ignored' | 'dismissed' | 'refused';

/**
 * 「引导已经被认领」的标记（storage.local）。
 *
 * ⚠️ 为什么不是 `chrome.storage.session`：那个区域默认只对**受信任上下文**
 * （扩展页面、service worker）开放。内容脚本一碰它就抛
 * "Access to storage is not allowed from this context" —— 真实 Chromium 实测：
 * 读、写、`setAccessLevel` 三条路全被挡（连 onChanged 都收不到那个区域的变更）。
 * 而内容脚本里**根本没有 chrome.tabs**（实测 chrome 的命名空间只有
 * loadTimes / csi / dom / extension / i18n / runtime / storage），
 * 所以拿不到自己的 tabId —— 没有 tabId 就没有「本标签页」这个键。
 *
 * 于是这里退成一把**全局互斥锁**：同一时刻整个浏览器里最多一条引导。
 *
 * ⚠️ 这比「一个标签页一条」更严，代价是「两个都看得见的标签页抢同一条引导」
 * 时只有一个能弹。但引导本来就是**设备级的一次性**提示（「已展示」标记存在
 * storage.local，全设备共用），两个标签页本来就不可能各弹一次 ——
 * 所以这把锁拦掉的从来不是「本该弹两次」，只是「两个候选里选一个」。
 *
 * 选中的那个是**用户正在看的那个**：认领的前提是文档可见（见 claim）。
 * 否则后台标签页里的自动播放视频会跑来抢锁，把用户眼前那个标签页的引导挡掉。
 *
 * 锁里不放任何站点信息 —— 隐私政策写着「不收集访问过的网站」，
 * 钥匙里出现 origin 就是违约（6.0.7 删掉 `vsc-site-speeds` 就是同一个道理）。
 */
const CLAIM_STORAGE_KEY = 'vsc-first-run-hint-claim';

/**
 * 认领的有效期（毫秒）。
 *
 * 兜底：万一没能归还（标签页被直接关掉、页面被销毁），锁会一直挂着，
 * 于是**整个浏览器**都不再弹引导 —— 那是「功能等于不存在」的事故。
 * 过期即失效，宁可多弹一次。
 */
const CLAIM_TTL_MS = 30_000;

/**
 * 认领的**稳定窗口**（毫秒）：写完之后等这么久再读回。
 *
 * ⚠️ 为什么不能「写完立刻读回」：
 * `chrome.storage.local` 没有 compare-and-set，写后读回只能判出**已经落盘**的覆盖。
 * 而另一个窗口的写可能**还在路上** —— 它与我们几乎同时发起，但落盘要排在
 * 它自己那次 IPC 之后。那一刻我们读回来的仍是**自己的**值，
 * 于是两个窗口都以为自己赢了。
 *
 * ⚠️ 这不是理论风险，是**实测过的 bug**（2026-10-22）：
 * 两个窗口同时起播 → **两条引导同时弹出来**，
 * 而 storage.local 里只有**一个**「已展示」标记。
 * 引导是设备级的一次性提示、也是这个扩展**全部**的可见入口，
 * 两条同时出现 = 用户第一眼看到的是「粗制滥造」。
 * （旧注释把这件事写成「良性的失败模式：最多多弹一次」—— 那句话是错的，
 * 下面把协议改掉了。）
 *
 * 所以：写完之后等一小段稳定窗口，让同时发起的竞争者的写**先落盘**，
 * 读回时看到的就是**它**的值 → 只有一方赢。
 *
 * ⚠️ 100ms 怎么定的：同机两个窗口的 play 事件实测相差 ~1–3ms，
 * 100ms 足够让竞争者的写落盘；而对用户来说，提示晚 0.1 秒出现是察觉不到的。
 *
 * ⚠️ 导出来是为了让单测知道「认领要多花这么久」——
 * 时序断言必须与实现对得上，写死一个数字就会漂。
 */
export const CLAIM_SETTLE_MS = 100;

interface HintClaim {
  /** 认领者：每个 frame 一份随机 id。 */
  owner: string;
  /** 认领时刻。 */
  claimedAt: number;
}

/** 这堆东西是不是一份合法的认领标记。 */
const isHintClaim = (value: unknown): value is HintClaim => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const claim = value as Partial<HintClaim>;
  return typeof claim.owner === 'string' && typeof claim.claimedAt === 'number';
};

/** chrome.storage.local（内容脚本唯一够得着的扩展存储区）。 */
const storageLocal = (): chrome.storage.StorageArea | null => {
  if (typeof chrome === 'undefined') {
    return null;
  }

  return chrome.storage?.local ?? null;
};

/** chrome.storage.onChanged（内容脚本收得到扩展存储的变更通知）。 */
const storageChanges = (): typeof chrome.storage.onChanged | null => {
  if (typeof chrome === 'undefined') {
    return null;
  }

  return chrome.storage?.onChanged ?? null;
};

/**
 * 读当前这把锁的结果。
 *
 * ⚠️ 为什么要区分「读到了空」与「**读不到**」：
 * - 读到了空 → 存储是好的，只是没人认领 → 可以写。
 * - 读不到（存储不可用/读失败）→ **不能**当成「锁被别人拿着」——
 *   那会让存储一坏，引导就永远不出现。读不出来 = 没法协调 = 允许弹。
 */
interface ClaimRead {
  /** 存储可用、这次真的读到了吗。 */
  readonly readable: boolean;
  /** 读到的锁（readable 为 true 时才有意义）。 */
  readonly claim: HintClaim | null;
}

const readClaim = async (): Promise<ClaimRead> => {
  const area = storageLocal();
  if (!area?.get) {
    return { readable: false, claim: null };
  }

  try {
    const stored = await area.get(CLAIM_STORAGE_KEY);
    const value = (stored as Record<string, unknown> | undefined)?.[CLAIM_STORAGE_KEY];
    return { readable: true, claim: isHintClaim(value) ? value : null };
  } catch {
    return { readable: false, claim: null };
  }
};

/**
 * 记下这把锁。
 *
 * @returns 写成功了吗。写不进去 = 没法协调 = 等于「没锁」——
 *   那时宁可多弹一次，也不要让「存储坏了」变成「引导再也不出现」。
 */
const writeClaim = async (claim: HintClaim): Promise<boolean> => {
  const area = storageLocal();
  if (!area?.set) {
    return false;
  }

  try {
    await area.set({ [CLAIM_STORAGE_KEY]: claim });
    return true;
  } catch {
    return false;
  }
};

/** 等一小段稳定窗口（让同时发起的竞争者的写先落盘）。 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** 归还这把锁。 */
const clearClaim = async (): Promise<void> => {
  try {
    await storageLocal()?.remove?.(CLAIM_STORAGE_KEY);
  } catch {
    // 还不掉就靠 CLAIM_TTL_MS 过期。
  }
};

/**
 * 认领器：保证同一时刻最多一条引导。
 *
 * 注入它是为了**测试**：跨 frame 的协调必须靠共享存储，而 jsdom 里既没有
 * chrome 也没有第二个 frame —— 单测要断言「两个 frame 不会同时弹」，
 * 就得自己拿一把锁来分发（见 makeTestClaimBroker）。
 */
export interface HintClaimBroker {
  /** 开始观察共享状态（读一次 + 订阅变更）。 */
  start(): void;
  /**
   * 认领。true = 拿到了这把锁。
   *
   * ⚠️ 必须是**异步**的：`storage.local` 没有 compare-and-set，
   * 唯一能判出「这把锁被别人抢走了」的办法是**写后读回**（见
   * createStorageClaimBroker），而读回天生是异步的。
   */
  tryClaim(owner: string): Promise<boolean>;
  /** 归还（只归还自己的那把）。 */
  release(owner: string): void;
  /** 退订。 */
  dispose(): void;
}

/**
 * 默认的认领器：读 chrome.storage.local，订阅它的变更。
 *
 * ⚠️ 协议为什么长这样（每一步都在补一个**实测会踩**的洞）：
 *
 * 1. **快照先看一眼**：有人拿着就直接让开，不必打扰存储。
 * 2. **写之前现读一次**：快照是**事件驱动**的 —— 别的窗口刚写完、
 *    变更事件还没送到时，快照仍显示「没人认领」。而写会**覆盖**别人
 *    的锁，于是「先来后到」变成「谁最后写谁赢」，两个窗口都能弹。
 *    现读看到别人的**活锁**就让开（过期的不算，见 CLAIM_TTL_MS）。
 * 3. **写自己的**，然后**等一段稳定窗口**（CLAIM_SETTLE_MS）：
 *    让同时发起的竞争者的写先落盘。
 * 4. **读回**：读到的 `owner` 是自己才算认领成功；是别人 → 认领作废，
 *    **不显示引导**，也**不删**别人的锁（那把锁正被别人拿着）。
 *
 * ⚠️ 读不到（存储不可用/读失败）时一律**放行**：读不出来 = 没法协调 =
 * 允许弹。把它当成「锁被别人拿着」会让存储一坏，引导就永远不出现。
 */
export const createStorageClaimBroker = (): HintClaimBroker => {
  /** 本 frame 看到的「当前这把锁」。 */
  let snapshot: HintClaim | null = null;
  /**
   * 变更事件的版本号。
   *
   * 用途：初始读是异步的，而读的过程中可能已经有变更事件到了 ——
   * 那时以**事件**为准（它更新），别用更旧的读结果把它盖回去。
   */
  let version = 0;
  let listener:
    | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
    | null = null;

  const apply = (claim: HintClaim | null) => {
    snapshot = claim;
  };

  /** 这把锁现在还成立吗（没过期）。 */
  const isLive = (claim: HintClaim | null): claim is HintClaim =>
    claim !== null && Date.now() - claim.claimedAt < CLAIM_TTL_MS;

  return {
    start() {
      // 先订阅、再读：反过来的话，「读」与「订阅」之间发生的写入会被漏掉，
      // 于是这个 frame 会以为没人认领 → 多弹一条引导。
      listener = (changes, area) => {
        if (area !== 'local' || !(CLAIM_STORAGE_KEY in changes)) {
          return;
        }

        version += 1;
        const next = changes[CLAIM_STORAGE_KEY]?.newValue;
        apply(isHintClaim(next) ? next : null);
      };
      storageChanges()?.addListener?.(listener);

      const readVersion = version;
      void readClaim().then(({ readable, claim }) => {
        if (version !== readVersion) {
          // 读的过程中来过更新事件：那份更新才是最新的。
          return;
        }

        if (readable) {
          apply(claim);
        }
      });
    },

    async tryClaim(owner) {
      // ① 快照：有人拿着（且没过期）→ 这次不弹。
      if (isLive(snapshot) && snapshot.owner !== owner) {
        return false;
      }

      // ② 写之前**现读**一次：快照是事件驱动的，可能还没收到别人的写。
      const before = await readClaim();
      if (before.readable && isLive(before.claim) && before.claim.owner !== owner) {
        apply(before.claim);
        return false;
      }

      // ③ 写自己的。
      const claim: HintClaim = { owner, claimedAt: Date.now() };
      if (!(await writeClaim(claim))) {
        // 写不进去 = 没法协调 = 等于「没锁」。宁可多弹一次，
        // 也不要让「存储坏了」变成「引导再也不出现」。
        return true;
      }

      apply(claim);

      // ④ 稳定窗口：让同时发起的竞争者的写先落盘。
      //
      // ⚠️ 只有**存储可用**时才等：没有共享存储就没有竞争者，
      // 等下去只是白等（而单测里没有 chrome，等下去会让所有时序断言失效）。
      if (before.readable) {
        await delay(CLAIM_SETTLE_MS);
      }

      // ⑤ 读回：写后读回是乐观锁（storage.local 没有 CAS）。
      const after = await readClaim();
      if (!after.readable) {
        // 读不出来 = 没法核实 = 允许弹（与「读失败不能当成锁被别人拿着」一致）。
        return true;
      }

      apply(after.claim);
      if (!after.claim) {
        // 我们的写没落盘（存储异常）→ 没法协调 → 放行。
        return true;
      }

      // 读回来的是**别人** → 认领作废：不显示引导，也不删掉别人的锁。
      return after.claim.owner === owner;
    },

    release(owner) {
      // ⚠️ 只归还**自己**那把：锁可能已经被别人拿走了（我们还回去晚了），
      // 这时把它删掉就是踩坏别人的状态 —— 人家正显示着引导呢。
      if (!snapshot || snapshot.owner !== owner) {
        return;
      }

      apply(null);
      void (async () => {
        // 现读一次再删：快照也是事件驱动的，别人可能刚把锁抢走，
        // 而我们这边的事件还没送到 —— 那时删掉就是踩坏别人的状态。
        const current = await readClaim();
        if (!current.readable || !current.claim || current.claim.owner !== owner) {
          return;
        }

        await clearClaim();
      })();
    },

    dispose() {
      if (!listener) {
        return;
      }

      storageChanges()?.removeListener?.(listener);
      listener = null;
    },
  };
};

/**
 * 这条视频**用户此刻看不看得见**。
 *
 * 三条判据，缺一不可：
 * 1. **有渲染盒**（`getClientRects().length > 0`）—— display:none / visibility:hidden
 *    的元素一个盒子都没有，量出来全是 0。
 * 2. **有尺寸**（宽、高都 > 0）—— 空盒子不算「看得见」。
 * 3. **与视口相交** —— 滚到屏幕外的视频用户看不见，提示弹出来也是对着空气说的。
 *
 * ⚠️ 这条判据是 P0 的核心：原先只看「有没有播过 2.5 秒」，
 * 于是页面上任何一个**不可见**的自动播放视频都会把用户这辈子唯一的一次
 * 引导消耗掉 —— 他在长文页面上看到一句莫名其妙的提示，
 * 真正打开网课时扩展再也不会开口。
 */
const isVisibleToUser = (video: HTMLVideoElement): boolean => {
  try {
    if (typeof video.getClientRects !== 'function' || video.getClientRects().length === 0) {
      return false;
    }

    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return false;
    }

    return rect.bottom > 0
      && rect.right > 0
      && rect.top < viewportHeight
      && rect.left < viewportWidth;
  } catch {
    // 量不出来就当「看不见」—— 那只是少提示一次，
    // 而把看不见的视频当成用户在看，会烧掉唯一的一次机会。
    return false;
  }
};

/**
 * 把一条绑定渲染成给人看的形式（按平台）。
 *
 * ⚠️ 这里**不再抄一份**：实现住在 `src/shared/shortcuts.ts`，
 * 设置页（`src/options/options-platform.ts`）从同一处引。
 *
 * 抄一份的代价已经付过一次：macOS 上「+」键在两处都渲染成空字符串
 * （渲染结果是 `Ctrl++`，按 '+' 切开得到 `['Ctrl','','']`，
 * 符号表里查不到空串 → 那一段整个消失）。用户以为没绑上。
 */
const formatShortcutForUser = (value: string): string =>
  formatShortcutForPlatform(value, isMacPlatform());

/**
 * 事件真正发生在哪个元素上。
 *
 * ⚠️ 必须用 `composedPath()`：事件跨 shadow 边界时 `event.target` 会被
 * 重定向到**宿主元素**（实测：shadow DOM 里的 <video> 派发 play，
 * document 上听到的 target 是宿主的 DIV）。只认 target 的话，
 * shadow DOM 里的视频既不触发引导也不响应快捷键。
 *
 * 与 keyboardController.ts 里的 isEditableEvent / isOurRangeSliderEvent
 * 是同一个做法（那个文件正被别人的改动碰着，这里只借思路不改它）。
 */
const originalTarget = (event: Event): EventTarget | null => {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return path[0] ?? event.target;
};

/**
 * 引导面板贴**右下角**，把顶栏让出来。
 *
 * ⚠️ 之前它是 `position: fixed; top: 18px; left: 50%` —— 正好压在站点的
 * 顶栏上（实测在仿 YouTube 页面上整个盖住了 masthead 的搜索框）。
 * 顶栏是站点自己的导航，用户要拿它找内容；提示是可有可无的一瞥。
 *
 * 这些坐标写在下面的 styles 里（内联样式），而不是 runtimeStyles 的 CSS：
 * 提示挂在页面里，站点的 `div { ... !important }` 会打穿样式表里的
 * 任何普通声明。隔离机制见 runtimeStyles.ts 的「页面级提示的样式隔离」。
 */

export interface FirstRunHintOptions {
  getShortcuts: () => ShortcutSettings;
  wasShown: () => Promise<boolean>;
  markShown: () => Promise<void>;
  /**
   * 这个事件是不是「用户真的交互了」。
   *
   * 默认读 `event.isTrusted`。注入它只是为了**测试**：
   * jsdom 造出来的事件 isTrusted 恒为 false，而且 `isTrusted` 在 jsdom 里是
   * 实例上的 non-configurable 属性（连原型上的 getter 都没有）——
   * 所以单测**无法**造出可信事件。
   *
   * 与 VideoRegistry 的同名选项是同一套理由。
   */
  isTrustedEvent?: (event: Event) => boolean;
  /**
   * 记一次「提示显示了，但用户没读完就打断了」。
   *
   * 默认写 storage.local 的失败计数。
   */
  recordFailedAttempt?: () => Promise<void>;
  /** 用户真读过一次之后清空失败计数。 */
  resetFailedAttempts?: () => Promise<void>;
  /**
   * 此刻是不是在冷却期里（连续失败到上限之后的冷静期）。
   *
   * ⚠️ 这**不是**「永久不再打扰」：冷却到期就该重新给一次机会，
   * 引导是这个产品唯一的可见入口，永久沉默等于功能不存在。
   */
  isInCooldown?: () => Promise<boolean>;
  /**
   * 这个视频是不是「站点摆在那儿的装饰性自动播放视频」。
   *
   * ⚠️ 由 **VideoRegistry** 代答：判定规则在 ambientPreview.ts（只有一份），
   * 而「用户碰过」「站点自己开的」「键盘刚命中过」这几条证据只有 registry 知道
   * （它们靠事件与手势的时间关系判定）。
   *
   * 不给这条缝时退回本模块自己的**保守**判定（共享规则 + 本模块拿得到的
   * 那几条证据）—— 宁可多提示一次，也不能「永远不出现」。
   * 详见 isDecorativeAutoplay 里逐条的对照。
   */
  isAmbientPreview?: (video: HTMLVideoElement) => boolean;
  /**
   * 认领器：保证同一时刻最多一条引导。
   *
   * ⚠️ 注入它只是为了**测试**：默认实现读的是扩展存储，而 jsdom 里既没有
   * chrome 也没有第二个 frame —— 单测要断言「两个 frame 不会同时弹」，
   * 就得自己拿一把锁来分发（见 makeTestClaimBroker）。
   */
  claimBroker?: HintClaimBroker;
}

/**
 * 引导的「按哪个键」那几行。
 *
 * ⚠️ 只有**一份**：完整版与精简版共用它。
 * 抄一份的后果是「改一处忘一处」—— 用户改过键之后，精简版还在教旧的键，
 * 而精简版恰恰是**空间不够时唯一会显示出来的那一版**。
 */
const buildGuideLabels = (shortcuts: ShortcutSettings): string[] => {
  const labels: string[] = [];

  // i18n 键是 camelCase（hintFullscreen），动作 id 是小写（fullscreen），
  // 拼接时必须显式映射并给出中文回落：写错键名会静默地把**键名本身**渲染给用户
  // （曾经就这样把 "fullscreen" 当成动作名显示了出来）。
  //
  // ⚠️ 这一行把**键**也写进文案（"按 $1 切换网页全屏"），而不是「动作名 · 键」：
  // 原来的「网页全屏 · f」只说了动作名，没说这个键是**切换**（进/出）——
  // 用户读到「网页全屏」根本不知道按下去会发生什么。
  // 设置页那一行现在也写「切换网页全屏」，两边对同一个键的说法必须一致。
  if (shortcuts.fullscreen) {
    labels.push(
      t('hintFullscreen', '按 $1 切换网页全屏', [formatShortcutForUser(shortcuts.fullscreen)]),
    );
  }

  if (shortcuts.increaseSpeed && shortcuts.decreaseSpeed) {
    // 显式传 replacements，而不是让调用方自己对返回串做 `.replace('{up}', x)`。
    //
    // 两种写法**渲染结果完全相同**（旧写法靠 t() 把 token 本身当替换值传给
    // Chrome，Chrome 把 "$1" 填成 "{up}"，调用方后面对返回串做的 replace 恰好
    // 能接上）。改成显式不是为了修 bug，是为了让**意图**直白：
    // locale 里的 $1/$2 就是这两个键，不必让人推断「谁把 token 换成了什么」。
    //
    // 顺带解掉一处脆弱：旧写法要求调用方的 replace 与 t() 内部的 token
    // 提取顺序一致，两边各写一遍 '{up}' / '{down}'，改一处忘另一处就会
    // 露出字面量。
    //
    // ⚠️ 这一行与上面那行**结构必须一致**：「动作名 · 键」。
    // 原来这里是「$1 / $2 调速」—— 半句话，中文读着像把键名甩在前面，
    // 英文更糟（"= / - to change speed" 根本不成句）。
    //
    // ⚠️ 键后面必须带**方向**：原来只写「调速 · = / -」，
    // 用户分不清哪个是加速、哪个是减速 —— 两个键长得一模一样，
    // 而按错了的代价是「速度反了」。
    labels.push(
      t('hintSpeed', '调速 · $1 加快 / $2 减慢', [
        formatShortcutForUser(shortcuts.increaseSpeed),
        formatShortcutForUser(shortcuts.decreaseSpeed),
      ]),
    );
  }

  return labels;
};

/**
 * 拼出引导文案。
 *
 * 只列「用户不知道就永远不会发现」的动作，并且用**用户当前真实的绑定**渲染：
 * 照默认值写死的话，用户改过键之后这条提示就是在教一个错误的键。
 * 播放/暂停刻意不列——用户刚刚按了播放或点了播放，这个键他不需要被教。
 */
export const buildGuideText = (shortcuts: ShortcutSettings): string | null => {
  const labels = buildGuideLabels(shortcuts);

  if (labels.length === 0) {
    return null;
  }

  // 每条一行（提示的 CSS 是 white-space: pre-line，换行会真的换行）。
  // 之前用「  ·  」把两条挤在同一行，英文读出来是
  // "Fullscreen f  ·  = / - speed" —— 根本不成句。
  //
  // 最后两行是**新用户必须知道、但产品里别处没写**的事：
  // 1. 点扩展图标 = 全屏（此前只有 README 与商店文案里有）
  // 2. 改键的入口（此前只有 README 与商店文案里有）
  return [
    labels.join('\n'),
    t('hintToolbar', '点扩展图标可切换网页全屏'),
    t('hintMore', '全部快捷键可在扩展设置里改绑（右键扩展图标 → 选项）'),
  ].join('\n');
}

/**
 * 引导的「完整版」与「精简版」文案。
 *
 * ⚠️ 为什么需要两版：引导住在**当前 frame 自己的文档**里，而那个文档的视口
 * 可能小得离谱（嵌入框常常只有 320×180）。完整版四行，在 320×180 的框里
 * 高度 130px —— 盖住了大半个播放器；而在 240×135 的框里它**装不下**
 * （实测 top = -11px，上下都被裁掉）。
 *
 * 精简版只留「按哪个键」那两行 —— 那是**引导存在的理由**（教用户按什么键）。
 * 后面两行（「点图标能全屏」「去哪里改键」）是补充说明，放不下时可以舍弃。
 *
 * ⚠️ 舍弃的是**视觉**内容，不是**信息**：精简版照样走读屏播报通道，
 * 而播报走的是 live region，它不占任何版面 —— 所以读屏用户听到的
 * 仍然是完整版。
 */
export const buildGuideTextCompact = (shortcuts: ShortcutSettings): string | null => {
  const labels = buildGuideLabels(shortcuts);

  return labels.length === 0 ? null : labels.join('\n');
};

/**
 * 首次使用引导：一次性、不打扰。
 *
 * 装完扩展后页面上什么都没有是这个产品最大的缺口——整个界面只有键盘，
 * 新用户不按对键就永远发现不了功能。但「常驻提示」会直接违背产品的减法原则，
 * 所以取交集：**等用户真的开始看视频之后，再出现一次，然后永远消失。**
 *
 * 三条自我约束：
 * - 只在播放持续到 WATCH_DELAY 之后才考虑出现（自动播放的广告位不该触发引导）
 * - **看得见**的视频才算（不可见的自动播放视频不算，见 isVisibleToUser）
 * - 落盘「已展示」的判据是「用户读过了」，不是「弹出来了」（见 readWindowMs）
 *
 * ⚠️ 第一条自我约束原先是**错的**：它以为「播够 2.5 秒」就能排除自动播放。
 * 装饰性预览视频同样会播超过 2.5 秒，于是引导会在长文的顶部凭空弹出，
 * 用户随手按一下键就把**唯一一次**机会烧掉（markShown 已落盘）——
 * 等他真正打开网课时，扩展再也不会开口了。
 * 判据因此改成「这**条**视频是不是站点摆在那儿的装饰物」（见 ambientPreview）
 * **加上**「用户看不看得见它」（见 isVisibleToUser）。
 */
export class FirstRunHint {
  private readonly options: FirstRunHintOptions;
  private readonly isTrustedEvent: (event: Event) => boolean;
  /** 尚未展示过；null 表示还没问出来（查存储是异步的）。 */
  private eligible: boolean | null = null;
  private shownThisSession = false;
  private delayTimer: number | null = null;
  private watchedVideo: HTMLVideoElement | null = null;
  /**
   * 「用户读过了」的计时器。
   *
   * 提示显示之后开始计时：这段时间里没被打断、页面又在前台，
   * 才算「用户真的看到了这条引导」，这时候才允许写「已展示」。
   */
  private readTimer: number | null = null;
  /** 提示此刻是不是还挂在屏幕上。 */
  private hintVisible = false;
  /**
   * 用户按下过扩展自己的快捷键 = 他接受了这个功能。
   *
   * ⚠️ 这是「不记失败」的判据，而不是「读过」的判据：
   * 接受 ≠ 读过（他可能先按了键才读到那行字）。
   * 「读过」由阅读窗口（readWindowMs）判定。
   */
  private accepted = false;
  /**
   * 阅读窗口是否已走完 —— 也就是「引导已经显示满 N 秒」。
   *
   * ⚠️ 这是「拒绝」的判据：显示满 N 秒之后还点页面，才算他**看过之后**
   * 主动关掉它；刚弹出那几秒里的误点（用户在点视频、点按钮）只算忽略。
   *
   * 原来的判据是「读没读完」（readCompleted），而它要到阅读窗口结束才置真 ——
   * 于是「失败窗口」= 引导出现后的头两秒：用户点一下视频就被记成拒绝，
   * 三次就闭嘴一星期。而引导是全键盘界面下**唯一**的入口。
   */
  private readWindowElapsed = false;
  /**
   * 这一次展示的阅读窗口（毫秒）—— 按实际显示的行数算。
   */
  private readWindow = READ_DELAY_PER_LINE;
  /**
   * 引导的根节点（挂着关闭按钮的那个）。
   */
  private hintRoot: HTMLElement | null = null;
  /**
   * 关闭按钮（「×」）。
   *
   * ⚠️ 它是**唯一**的「我故意关掉它」的正路：引导节点是 pointer-events: none
   * 且 aria-hidden，用户既点不到它、也选不中它，更没有第二个按钮可按。
   * 没有它，「拒绝」就只剩「误点到页面」这一条路 —— 于是误点被当成了拒绝。
   */
  private closeButton: HTMLButtonElement | null = null;
  /**
   * 盯着根节点的 class：引导淡出后要把关闭按钮一起收起来。
   *
   * ⚠️ 不收起来的话，页面右下角会留下一个**看不见但可以点**的区域
   * （按钮是 pointer-events: auto），而且它还在 tab 顺序里 ——
   * 读屏用户 Tab 到一个看不见的按钮，什么反馈都没有。
   */
  private closeButtonWatcher: MutationObserver | null = null;
  /**
   * 「引导状态被重置」的订阅（设置页的「重新显示使用引导」按钮）。
   */
  private unsubscribeHintState: (() => void) | null = null;
  /**
   * 订阅全屏背板增删的观察者。
   *
   * 引导与控制条**都在视口右下角**：实测引导的矩形 (901,676)-(1264,784)
   * 把控制条的退出、倍速、音量三个按钮整个包在里面 —— 引导在视觉上
   * 压住了控制条。所以引导必须知道「此刻是不是在网页全屏里」。
   */
  private fullscreenWatcher: BodyObserver | null = null;
  /**
   * 上一次观察到的全屏状态。
   *
   * 只对「进出全屏」这个**变化**做反应：页面自己往 body 里塞东西也会
   * 触发观察者回调，那些与全屏无关。
   */
  private fullscreenActive = false;
  /**
   * 引导因为「此刻在网页全屏里」而没能弹出的那条视频。
   *
   * 退出全屏后如果它还在，就把这次机会补上 —— 进全屏不是用户的拒绝，
   * 不该把唯一一次机会消耗掉。
   */
  private pendingRevealVideo: HTMLVideoElement | null = null;
  /**
   * 用户**亲手碰过**的视频（**不随时间过期**）。
   *
   * 为什么需要它：装饰性预览视频在用户点它之后就不再是「装饰的」了 ——
   * 用户亲手选了它 = 那可能正是他要看的视频。
   *
   * ⚠️ 为什么**不过期**，而 videoRegistry 里的「用户选过」有两个窗口：
   * - 10 秒的那个（`wasRecentlyChosen`）管的是「**接管**要不要让出空格」，
   *   它是**抢按键**的授权，越短越安全；
   * - 「**是不是装饰物**」这条判定（`wasEverTouched`）管的是
   *   「这条视频是不是站点摆在那儿的装饰」—— 只要用户碰过一次，
   *   它就不是装饰物了，哪怕那次点击只是想把它按停。
   *
   * 本模块问的是**后者**（这条视频是不是装饰物），所以它也**不过期**。
   * 兜底路径若在这里用 10 秒窗口，就会与 registry 的结论**相反** ——
   * 键盘接管了（对的），引导却永远不出现（错的）。
   *
   * ⚠️ 用 WeakSet 而不是「最近一次」：那个字段只记得住最后一个视频，
   * 用户先碰 A 再碰 B，A 的证据就没了，A 又变回「装饰」。
   */
  private readonly userTouchedVideos = new WeakSet<HTMLVideoElement>();
  /**
   * 此刻正在播的视频（由 play / pause / ended 事件维护）。
   *
   * 为什么自己维护而不用 `video.paused`：状态读取回答的是「这一刻是不是暂停」，
   * 而这里要回答的是「它是不是**正在**播」。事件是唯一诚实的信号 ——
   * 这也是本文件其余部分一贯的做法（见 boundCancelWatch 的注释）。
   *
   * ⚠️ 用 WeakSet 而不是 Set：视频节点被站点换掉之后仍被强引用着，
   * 就等于不让它被回收（信息流页面上的视频一多就是实打实的泄漏）。
   *
   * 用途只有一个：用户点了一条**正在播**的视频 —— 自动播的预览在用户点它
   * **之前**就已经在播了，它不会再因为这次点击派发 play 事件，所以
   * 「用户点了它」是那条路径上唯一的入口。
   */
  private readonly playingVideos = new WeakSet<HTMLVideoElement>();
  /**
   * 等待「这条视频变得可见」的观察者。
   *
   * 为什么需要它：视频在窗口期里可能是不可见的（用户还没滚到那儿）。
   * 那时直接放弃，用户后来滚到视频旁边时**不会再有 play 事件**，
   * 引导就永远不出现了 —— 于是又变成「用户什么都没看到」。
   * 观察者让它在变得可见的那一刻补上这一次提示。
   */
  private visibilityObserver: IntersectionObserver | null = null;
  private pendingVisibilityVideo: HTMLVideoElement | null = null;
  private readonly pill = new TransientPill({
    id: HINT_ID,
    visibleClass: 'vsc-visible',
    duration: HINT_DURATION,
    /**
     * 引导的外观与位置。
     *
     * 全部走**内联样式**（而不是 runtimeStyles 里的 CSS 规则）：
     * 引导挂在页面里，站点的 `div { ... !important }` 会打穿样式表里的
     * 任何普通声明。隔离机制见 runtimeStyles.ts 的「页面级提示的样式隔离」。
     *
     * ⚠️ 排版来自**卡片 token**（`NOTICE_CARD_TOKENS`）：它与胶囊是同一个
     * 产品的两副面孔，字号、字重、行高、字体族必须一致 ——
     * 引导是这个产品唯一的入口，它不该看起来像另一个产品。
     * 卡片身份只体现在**形状**上（自己的底色 + 比胶囊直一点的圆角）。
     */
    styles: {
      ...NOTICE_CARD_TOKENS,
      'max-width': 'min(560px, calc(100vw - 32px))',
      // 文案是多行的（每条动作一行），必须保留换行。
      'white-space': 'pre-line',
      // 贴右下角，把顶栏让出来（见本文件里 applyHintPosition 的旧注释）。
      bottom: '16px',
      right: '16px',
      top: 'auto',
      left: 'auto',
    },
  });
  /**
   * 提示的停留时长（毫秒）。
   *
   * ⚠️ 做成字段而不是直接用常量：显形那一刻才知道用的是哪一版文案，
   * 而两版的停留时长必须一致（用户读的是同一段内容，不该因为版面不同
   * 而给他长短不一的阅读时间）。
   */
  private readonly pillDuration = HINT_DURATION;

  private readonly boundHandlePlay = (event: Event) => this.handlePlay(event);
  /**
   * 用户在等待窗口里按了暂停、或视频播完了。
   *
   * 判定「还在看」必须靠真实的 pause/ended **事件**，不能去轮询 `video.paused`：
   * 状态读取回答的是「这一刻是不是暂停」，而我们要回答的是「这段时间里有没有
   * 停下来」。事件是唯一诚实的信号——顺带一提，这也让 E2E 里派发合成的 play
   * 事件能验证这条路径，因为播放器的真实状态读取在隔离世界里不可伪造。
   */
  private readonly boundCancelWatch = (event: Event) => this.handleWatchEnd(event);
  /**
   * 键盘事件：区分「扩展自己的键」与「用户只是碰了一下键盘」。
   *
   * ⚠️ keydown **不一定**能听到扩展的键：键盘控制器在 window 捕获阶段
   * `stopImmediatePropagation()`，扩展的键先到，document 层的捕获监听器
   * 根本收不到（实测：按 `=` 引导不消失）。所以 keyup 也要听 ——
   * 松开键时没有人拦它，那才是「这个键确实被按过」的事实。
   */
  private readonly boundHandleKey = (event: KeyboardEvent) => this.handleKey(event);
  /**
   * 指针交互：用户点了页面。
   *
   * ⚠️ 「拒绝」的判据在 dismiss() 里，不在这里 ——
   * 这里只负责把事件送过去（并把「点在关闭按钮上」这件事摘出去）。
   */
  private readonly boundDismiss = (event: Event) => {
    // 点在关闭按钮上：那不是「点了页面」，是**故意关掉引导**。
    // 不摘出去的话，一次点击会被记两次（pointerdown 记「点了页面」、
    // click 记「主动关掉」），失败次数翻倍。
    if (this.isCloseButtonEvent(event)) {
      return;
    }

    this.dismiss('dismissed');
  };
  /**
   * 可见性变化：用户回到了这个标签页。
   *
   * 用途：引导在后台时抢不到认领锁（见 claim()），那次机会必须补上 ——
   * 否则「用户点完设置页的『重新显示使用引导』再切回来」这条路径上，
   * 引导永远是那个抢不到锁的沉默状态。
   */
  private readonly boundHandleVisibilityChange = () => this.handleVisibilityChange();
  /**
   * 记一次「用户亲手点了某个视频」。
   *
   * ⚠️ 合成事件不算「用户的交互」：扩展在 document_start 抢注捕获阶段
   * 监听器，页面脚本能 `dispatchEvent(new PointerEvent('pointerdown'))`
   * 打在自己的预览视频上，把它伪装成「用户选过的」—— 那等于给了页面一个
   * 遥控器，能随时把引导骗出来。页面能伪造事件，但伪造不了 isTrusted。
   *
   * 与 videoRegistry 的 handleInteraction 是**同一套理由**；那边还多一层
   * 「手势必须指向这个视频」的约束，这里不需要：引导关心的是
   * 「用户是否亲手碰过这条视频」，而 pointerdown 落在 video 上
   * 本身就是最直接的证据。
   */
  private readonly boundHandlePointerDown = (event: Event) => this.handlePointerDown(event);
  /** 认领器：保证同一时刻最多一条引导。 */
  private readonly claimBroker: HintClaimBroker;
  /**
   * 本 frame 的认领者标识。
   *
   * 每个 frame 一份：归还时只归还**自己**那把锁，不会踩掉别人的。
   */
  private readonly claimOwner = `f${Math.random().toString(36).slice(2)}`;
  /** 此刻这把锁是不是 ours。 */
  private claimed = false;
  /**
   * 这个提示已经被销毁了。
   *
   * ⚠️ 为什么需要它：认领是**异步**的（约 100ms，见 claim）。
   * 页面在这 100ms 里被卸载（用户关掉标签页）的话，认领回来之后
   * 不许再弹任何东西 —— 否则会在已经卸载的页面上凭空冒出一条引导。
   */
  private destroyed = false;

  constructor(options: FirstRunHintOptions) {
    this.options = options;
    this.isTrustedEvent = options.isTrustedEvent ?? ((event) => event.isTrusted);
    this.claimBroker = options.claimBroker ?? createStorageClaimBroker();
  }

  start() {
    // 认领器要先开始观察共享状态：它得先知道「这把锁是不是已经有人拿着」。
    this.claimBroker.start();

    // 监听器挂在 document 上：视频可能在同源 iframe 里，也可能中途被换成另一个节点。
    document.addEventListener('play', this.boundHandlePlay, true);
    document.addEventListener('pause', this.boundCancelWatch, true);
    document.addEventListener('ended', this.boundCancelWatch, true);
    document.addEventListener('keydown', this.boundHandleKey, true);
    document.addEventListener('keyup', this.boundHandleKey, true);
    document.addEventListener('pointerdown', this.boundDismiss, true);
    // 同一个 pointerdown 还要记「用户亲手选过哪条视频」——两条监听器互不干扰：
    // 一条管「提示消失」，一条管「哪些视频还有资格触发提示」。
    document.addEventListener('pointerdown', this.boundHandlePointerDown, true);
    // 回到这个标签页时，把后台没抢到锁的那次机会补上。
    document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);

    // ⚠️ 必须订阅 **local** 命名空间的引导状态：
    // 设置页的「重新显示使用引导」只清 storage，而「本会话已展示」记在**内存**里
    // 且永不复位 —— 没有这条通道，那个按钮在同一个标签页里是哑的
    // （用户点了按钮、切回来，什么都没发生）。
    this.unsubscribeHintState = subscribeToFirstRunHintState((change) => {
      this.handleHintStateChange(change);
    });

    void this.computeEligibility()
      .then((eligible) => {
        this.eligible = eligible;
      })
      .catch(() => {
        this.eligible = false;
      });
  }

  private handlePlay(event: Event) {
    const target = originalTarget(event);
    if (!(target instanceof HTMLVideoElement)) {
      return;
    }

    this.playingVideos.add(target);

    // ⚠️ 装饰性自动播放视频直接跳过，**不排计时器**。
    //
    // 「播够 2.5 秒」这个门槛挡不住它：文章里那种边滚动边播的小预览
    // 照样会播过 2.5 秒，于是引导会在长文顶部凭空弹出。用户随手按一下
    // 键，提示消失 + markShown 落盘 —— **唯一一次**机会就这么烧掉了，
    // 等他真正打开网课时，扩展再也不会开口。
    if (this.isDecorativeAutoplay(target)) {
      return;
    }

    this.scheduleReveal(target);
  }

  /**
   * 排一个「看完 2.5 秒就出提示」的计时器。
   *
   * 已经在等、或这一轮已经出过，就不要再排一个 —— 一次等待只认一条视频。
   */
  private scheduleReveal(video: HTMLVideoElement) {
    if (this.delayTimer !== null || this.shownThisSession) {
      return;
    }

    this.watchedVideo = video;
    this.delayTimer = window.setTimeout(() => {
      this.delayTimer = null;
      void this.reveal(this.watchedVideo);
    }, WATCH_DELAY);
  }

  /**
   * 这条视频是不是「站点摆在那儿的装饰物，用户从没选过它」。
   *
   * ⚠️ 正常路径只有一条：接缝（`options.isAmbientPreview`）由
   * **VideoRegistry** 代答 —— 判定规则只有一份（`ambientPreview.ts`），
   * 而「用户碰过」「站点自己开的」「键盘刚命中过」这几条**证据**
   * 只有 registry 知道（它们靠事件与手势的时间关系判定，别人算不出来）。
   *
   * 兜底路径（接缝没接上时）必须**保守**：宁可多提示一次，
   * 也不能「永远不出现」—— 引导是这个产品**全部**的可见入口。
   */
  private isDecorativeAutoplay(video: HTMLVideoElement): boolean {
    // ⚠️ 判定规则在 `src/content/ambientPreview.ts` —— **只有一份**。
    //
    // ⚠️⚠️ 这份规则曾经在这里与 videoRegistry 各写一份，而且**已经漂移**：
    // videoRegistry 那份被重写成「六条证据」（当时的说法；如今是**七条**，
    // 含「站点自己开的」「占满视口」「用户碰过」），
    // 这边却还停在最老的属性判据（autoplay + 无 controls）。
    // 后果是同一条视频的结论**相反**：
    // 「要不要接管它」说它不是装饰（接管了，键盘能用），
    // 「要不要给它弹引导」说它是装饰（引导永远不出现）。
    // 于是在任何用自制播放器的网站上：用户能调速，却从来不知道这扩展会做什么 ——
    // 而引导是这个产品**全部的可见入口**。
    //
    // 修法不是「把两边抄成一样」，而是**只留一份**。
    const shared = this.options.isAmbientPreview?.(video);
    if (shared !== undefined) {
      return shared;
    }

    // ── 兜底：共享规则 + 我们**拿得到**的那几条证据 ──
    //
    // 兜底与 registry 的结论必须**同向**，否则两边又打架。
    // 逐条对照（七条证据的归属见 ambientPreview.ts 的文件头）：
    // - 第 1 条（站点点名主播放器）：**同一个函数**
    //   （ambientPreview.ts 的 isSiteMainPlayerVideo）✓
    //   ⚠️ 这条判据曾经在本文件与 videoRegistry 各写了一份（逐字相同），
    //   而 ambientPreview.ts 的文件头却声称它是本文件提供的 ——
    //   读者会以为改那里就够了，改站点适配器时漏改一处，两边就漂了。
    //   ⚠️ 这条豁免对引导是**必须的**：YouTube 的主播放器恰恰就是
    //   静音自动播的（浏览器只允许静音自动播），而它的 <video> 上**没有**
    //   原生 controls —— 形状与装饰性预览一模一样。没有这条豁免，
    //   引导在 YouTube 上永远不出现，整个扩展的发现机制死在最该工作的站点上。
    // - 第 2 条（我们接管着的）：从 DOM 认 —— 我们接管时会把视频搬进
    //   全屏舞台，它落在全屏背板里 ✓
    // - 第 3 条（用户从未碰过）：用「**曾经**碰过」，与 registry 的
    //   wasEverTouched 同一份语义 ✓
    // - 第 4 条（没有原生 controls）：同一份判据 ✓
    // - 第 5 条（站点自己开的）：只认 `autoplay` 属性 —— 差异是**保守方向**：
    //   认不出「站点自己开的」时那条视频被判成「不是装饰」→ 引导会出现
    //   （多打扰一次），而不是「永远不出现」（少一次唯一机会）✓
    // - 第 6 条（占满大半个视口）：同样的豁免 ✓
    // - 第 7 条（键盘刚命中过）：**拿不到** —— 它是 registry 打分打出来的
    //   结果，兜底只能认「用户的手碰过」（第 3 条）。这一条只能靠接缝修好，
    //   兜底补不了（补了就会把「所有视频都当成内容」，兜底也就没意义了）。
    if (!isDecorativeAutoplay(video, {
      isMainPlayer: isSiteMainPlayerVideo(video),
      isTakenOverByUs: this.isTakenOverByUs(video),
      wasChosenByUser: this.wasEverTouchedByUser(video),
      wasStartedBySite: video.hasAttribute('autoplay'),
    })) {
      return false;
    }

    // 第 6 条：占满大半个视口 → 它是页面主角，不是装饰。
    //
    // ⚠️ 无布局引擎时判不了（量出来的尺寸恒为 0）→ 不豁免 ——
    // 那种环境（单测的 jsdom）里这条豁免本来也测不出来。
    if (isPageMainContent(video, this.measureRect(video))) {
      return false;
    }

    return true;
  }

  /**
   * 这个视频是不是「**我们**接管着的」（进全屏时我们把 controls 弄掉了）。
   *
   * ⚠️ 正常路径不需要这条：registry 自己知道（setFullscreenVideo 记着）。
   * 兜底路径只能从 DOM 认 —— 我们接管时会把视频搬进全屏舞台
   * （见 fullscreenController 的 reparent），它落在全屏背板里。
   */
  private isTakenOverByUs(video: HTMLVideoElement): boolean {
    try {
      const overlay = document.getElementById(FULLSCREEN_OVERLAY_ID);
      return overlay?.contains(video) ?? false;
    } catch {
      return false;
    }
  }

  /**
   * 这个视频的盒子（兜底路径用来判「它是不是页面主角」）。
   *
   * 量不出来就报 0 —— 那等于「不豁免」，方向是**保守**的
   * （判成装饰物 → 不弹引导）。⚠️ 而这条恰恰是**不**保守的方向，
   * 所以宁可在这里多留一步：无布局引擎时 isPageMainContent 本身就判不了，
   * 结果一致。
   */
  private measureRect(video: HTMLVideoElement): { width: number; height: number } {
    try {
      const rect = video.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  /**
   * 用户是不是**亲手**碰过这条视频（**不看过期时间**）。
   *
   * ⚠️ 与 registry 的 `wasEverTouched` 同一份语义：只要碰过一次，
   * 它就不是「站点摆在那儿的装饰」了。
   *
   * 为什么不用 10 秒窗口（那是 registry 里「能不能抢空格」的窗口）：
   * 本模块问的是「这条视频是不是装饰物」，不是「用户此刻还在不在操作它」。
   * 用短窗口的话，兜底会比 registry **更早**地把视频判成装饰物 ——
   * 于是「接管了却不弹引导」，正是本轮要消灭的那种相反结论。
   */
  private wasEverTouchedByUser(video: HTMLVideoElement): boolean {
    return this.userTouchedVideos.has(video);
  }

  /**
   * 记一次「用户亲手点了某个视频」。
   *
   * ⚠️ 只认**可信**事件：页面脚本能派发合成的 pointerdown 打在预览视频上，
   * 把自己伪装成「用户选过的」—— 那等于给了页面一个遥控器，能随时把引导骗出来。
   */
  private handlePointerDown(event: Event) {
    if (!this.isTrustedEvent(event)) {
      return;
    }

    const target = originalTarget(event);
    if (!(target instanceof Element)) {
      return;
    }

    // 点在视频上（或者点它的任何后代，比如站点自绘的播放按钮）。
    // ⚠️ 走带 try/catch 的那份：页面把 Element.prototype.closest 改坏时，
    // 这里抛了，「用户点过预览」这条证据就记不上 —— 引导永远不出现。
    const video = closestSelector(target, 'video');
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    // 用户碰过它 → 它不再是「站点摆在那儿的装饰」（哪怕只是想把它按停）。
    // 这条证据**不过期**（见 userTouchedVideos 的注释）。
    this.userTouchedVideos.add(video);

    // ⚠️ 用户点了一条**正在播**的视频 —— 这就是「开始看视频」的时刻。
    //
    // 为什么这一条不能省：自动播的预览在用户点它**之前**就已经在播了，
    // 它不会因为用户的点击再派发一次 play 事件。所以「用户点了它」这条
    // 路径是唯一能让引导出现的入口 —— 只靠 play 事件的话，用户点了预览
    // 之后引导永远不会来。
    //
    // 而用户点它这件事本身已经说明了「他要看这条视频」：他点了。
    //
    // ⚠️ 只在「它本来就在播」时才排计时器。用户点一条**还没开始**播的视频，
    // 站点会在点击之后派发 play 事件 —— 那条路径已经覆盖了，不必在这里
    // 提前排（提前排会让「点了但站点没播」的瞬间就开始等 2.5 秒）。
    if (!this.playingVideos.has(video)) {
      return;
    }

    this.scheduleReveal(video);
  }

  /**
   * 视频暂停或播完了。
   *
   * 两件事：从「正在播」集合里摘掉它（它不播了），以及取消这一次的等待。
   */
  private handleWatchEnd(event: Event) {
    const target = originalTarget(event);
    if (target instanceof HTMLVideoElement) {
      this.playingVideos.delete(target);
    }

    this.cancelPendingReveal();
  }

  private cancelPendingReveal() {
    if (this.delayTimer === null) {
      return;
    }

    window.clearTimeout(this.delayTimer);
    this.delayTimer = null;
    this.watchedVideo = null;
  }

  /**
   * 挑一个**放得下**的版本来显示。
   *
   * 判据是「量出来的尺寸 vs 当前视口」——
   * 而 `position: fixed` 的参照系是**当前文档的视口**，也就是引导自己
   * 住的那个 frame 的视口（见 frameOffset.ts 的文件头）。
   *
   * ⚠️ 为什么不用「视口够不够大」这种粗判据：引导的高度是**量出来的**，
   * 字体、行数、换行位置都会影响它。英文文案比中文长（"Fullscreen · f"
   * vs "网页全屏 · f"），同一个视口下高度不同 —— 粗判据会让英文用户
   * 莫名其妙地拿到精简版。
   *
   * @param fullText 完整版文案（放得下就显示它）。
   * @param shortcuts 用户当前的绑定（精简版要用）。
   */
  private pickFittingText(fullText: string, shortcuts: ShortcutSettings): string {
    // 量之前先把完整版放进去：prepare() 会建好节点并写入文本，
    // 节点是「存在但透明」的（外壳本来就是 opacity: 0）——
    // 布局照常发生，于是能量到真实高度，而用户看不到它。
    const prepared = this.pill.prepare(fullText);
    if (!prepared) {
      return fullText;
    }

    if (this.fitsInViewport(prepared)) {
      return fullText;
    }

    // 放不下 → 退到精简版。
    const compactText = buildGuideTextCompact(shortcuts);
    if (!compactText) {
      // 连精简版都拼不出来（用户把动作全禁用了）→ 保留完整版。
      // 这种情况在 reveal() 里已经被 fullText 非空挡掉了，
      // 走到这里只可能是「绑定在两次读取之间变了」—— 宁可多占点版面。
      return fullText;
    }

    // 换成精简版后**再量一次**：精简版也未必放得下（极小的框）。
    const compactPrepared = this.pill.prepare(compactText);
    if (compactPrepared && !this.fitsInViewport(compactPrepared)) {
      return compactText;
    }

    return compactText;
  }

  /**
   * 这个提示在当前 frame 里是不是「一块贴片」而不是「一面墙」。
   *
   * ⚠️ 判据是**高度占视口的比例**，不是「放不放得下」。
   *
   * 「放不下」是一个太弱的判据：完整版引导 130px 高，在 320×180 的嵌入框里
   * **放得下**（130 < 180），可它盖住了播放器 72% —— 那已经不是一块贴片，
   * 那是「整个画面都被一张纸糊住了」。用户看到的是播放器没了，不是引导。
   *
   * 真正的要求是：提示是**补充**，不能盖过它要讲的那个东西。
   * 一块贴片最多占这个 frame 的一半 —— 超了就不是贴片了。
   *
   * ⚠️ 为什么拿**视口**（frame 自己的视口）而不是视频的盒子比：
   * 顶层页面里引导贴在页面右下角，离视频十万八千里，按视频算会误判成
   * 「盖住视频了」而白白退到精简版；而嵌入框里 frame 视口≈播放器，
   * 按视口算正好是「盖住播放器了」。
   *
   * ⚠️ 高度溢出还会被**从顶部裁掉**（提示贴着底边 bottom:16px），
   * 实测 240×135 的框里 top = -11px —— 所以「放不下」是更严重的失败，
   * 这一条由 fitsBelowThreshold 一起兜住。
   */
  private fitsInViewport(element: HTMLElement): boolean {
    try {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (viewportHeight <= 0) {
        // 量不出视口 → 不猜（jsdom 就是这样）。保守：当成放得下，
        // 免得在单测里把引导判成「装不下」。
        return true;
      }

      const rect = element.getBoundingClientRect();

      // 硬上限：提示离底边 16px，超出部分从**顶部**被裁掉。
      // 减 32 = 上下各留 16px 的呼吸。
      if (rect.height > viewportHeight - 32) {
        return false;
      }

      // 软上限：贴片最多占这个 frame 的一半。
      return rect.height <= viewportHeight / 2;
    } catch {
      return true;
    }
  }

  /**
   * 等待期间视频被换掉（切集）或从文档里移走，那一次播放就不该再触引导。
   * 节点存活是这里唯一还需要复查的条件。
   */
  private async reveal(video: HTMLVideoElement | null) {
    // 观察者要挂上，才能知道「用户什么时候进的/出的全屏」。
    // 挂在 reveal 里而不是 start() 里：document_start 时 body 可能还不存在
    // （挂不上就等于没挂），而 reveal 一定发生在有 body 之后。
    this.observeFullscreenSurface();

    if (this.eligible === null) {
      this.eligible = await this.computeEligibility();
    }

    if (!this.eligible || this.shownThisSession) {
      return;
    }

    if (!video || !video.isConnected) {
      return;
    }

    // ⚠️ 网页全屏期间**不弹**引导。
    //
    // 理由见 onEnterFullscreen：它压在控制条上，而且内容自相矛盾。
    // 这里只**推迟**，不消耗机会 —— 退出全屏后还会补上。
    if (this.isFullscreenActive()) {
      this.pendingRevealVideo = video;
      return;
    }

    // ⚠️ 三重可见性判据：看得见、有尺寸、在视口里。
    // 看不见的视频不是「用户在看的视频」—— 提示弹出来也是对着空气说的，
    // 而这一次机会会被白白消耗掉。
    if (!isVisibleToUser(video)) {
      this.watchForVisibility(video);
      return;
    }

    const shortcuts = this.options.getShortcuts();
    const fullText = buildGuideText(shortcuts);
    if (!fullText) {
      // 三个动作全被禁用的用户不需要这条引导，也不该因此被记成「已展示」——
      // 他改回绑定之后仍应该看到一次。
      return;
    }

    // ⚠️ 认领：同一时刻只允许一条引导。
    //
    // 为什么必须走到这一步：内容脚本注入到**所有** frame，而 6.1.0 之后
    // 各 frame 的注册表不再钻进别人的 iframe（免得两个运行时抢同一个
    // `<video>`）。于是「顶层注册表递归找 iframe 里的视频」这条老路没了 ——
    // 引导只跑在顶层，顶层又看不见 iframe 的视频，于是**页面上唯一的视频
    // 在嵌入框里时，引导永远不出现**。这是 6.1.0 带出来的功能回归：
    // 用户完全无从发现这个扩展。
    //
    // 所以现在由「拥有视频的那个 frame」来弹。代价是顶层和 iframe 可能
    // 各弹一条 —— 这把锁就是为此存在的。
    if (!(await this.claim())) {
      // 抢不到锁有两种可能：
      // 1. 页面在后台（claim() 里第一道判据）—— 那不是「拒绝」，只是时候未到。
      //    记下来，等用户回到这个标签页时补上（见 handleVisibilityChange）。
      // 2. 别的 frame 抢到了 —— 那边会弹，这里不该再抢。
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.pendingRevealVideo = video;
      }
      return;
    }

    // ⚠️ 认领是**异步**的（约 100ms）：这段时间里状态可能变了 ——
    // 另一条路径可能已经把引导弹出来了（shownThisSession），
    // 或者**别的窗口**已经展示完并落盘了「已展示」，
    // 或者这条视频已经被从文档里拿走了，
    // 或者页面已经被卸载了（destroyed）。
    // 不复查的话，一次 await 就能弹出**两条**引导。
    if (this.shownThisSession) {
      return;
    }

    if (this.destroyed) {
      this.releaseClaim();
      return;
    }

    if (!video || !video.isConnected) {
      this.releaseClaim();
      return;
    }

    // ⚠️ 「已展示」是**设备级**的标记（在 storage.local，全设备共用）。
    // 认领这 100ms 里，**别的窗口**可能刚好展示完并把它落盘了 ——
    // 那时我们再弹一条就是「一次性提示」出现了两次。
    try {
      if (await this.options.wasShown()) {
        this.shownThisSession = true;
        this.eligible = false;
        this.releaseClaim();
        return;
      }
    } catch {
      // 读不到 = 没法核实 = 不拦（锁已经保证了「只有一条」）。
      // ⚠️ 这里与 computeEligibility 的取向相反是**故意的**：
      // 那一条是「要不要弹」的判断，读不到就该保守（不打扰）；
      // 这一条是「要不要拦下已经抢到锁的这一次」，拦错了就是「引导再也不出现」。
    }

    // ⚠️ 选「放得下的那一版」。
    //
    // 引导住在**当前 frame 自己的文档**里，而那个文档的视口可能小得离谱
    // （嵌入框常常只有 320×180）。完整版四行在那种框里会**盖住大半个播放器**，
    // 在 240×135 的框里甚至装不下（实测 top = -11px，上下都被裁掉）。
    //
    // 所以这里量一量：完整版放得下就放完整版，放不下就退到精简版
    // （只留「按哪个键」那两行 —— 那是引导存在的理由）。
    //
    // ⚠️ 舍弃的只是**视觉**版面，不是信息：读屏播报走的仍是完整版
    // （见 TransientPill.present 的 announceText 参数）。
    const displayText = this.pickFittingText(fullText, shortcuts);
    const prepared = this.pill.prepare(displayText);
    if (!prepared) {
      // 没有可挂载的宿主（非 HTML 文档）：什么都没显示出来，不算已展示。
      // 把锁还回去 —— 别的 frame 也许挂得上。
      this.releaseClaim();
      return;
    }

    // ⚠️ 关闭按钮必须在 prepare 之后挂：prepare 会把节点的文字整个换掉
    // （root.textContent = text），挂早了就会被抹掉。
    this.mountCloseButton(prepared);

    if (!this.pill.present(this.pillDuration, fullText)) {
      // 挂上了却显不出来（理论上 prepare 成功就不会失败）—— 宁可当没显示。
      this.releaseClaim();
      return;
    }

    this.shownThisSession = true;
    this.eligible = false;
    this.hintVisible = true;
    this.pendingRevealVideo = null;
    // ⚠️ 阅读窗口按**这一档实际显示的行数**算（精简版 2 行 / 完整版 4 行）：
    // 「读过」的判据必须与用户看到的字数对得上。
    this.readWindow = readWindowMs(displayText);
    this.readWindowElapsed = false;
    this.startReadTimer(this.readWindow);
  }

  /**
   * 认领「这一条引导」。
   *
   * @returns true = 认领成功（这个 frame 该弹引导）。
   */
  private async claim(): Promise<boolean> {
    // ⚠️ 看不见的页面不许抢认领。
    //
    // 后台标签页里的视频照样会派发 play，于是它 2.5 秒后也会来抢锁 ——
    // 而用户此刻正盯着**另一个**标签页。那个标签页的引导就被这扇
    // 「看不见的窗户」挡掉了：用户眼前的页面永远不开口。
    //
    // ⚠️ 可见性是**按标签页**算的（同一标签页里所有 frame 一起可见/隐藏），
    // 所以这条判据与「焦点在哪个 frame」无关 —— 视频在 iframe 里、焦点在
    // 顶层文档时，这个 iframe 照样是可见的，照样该弹引导。
    //
    // ⚠️ 判据只能写 `visibilityState === 'hidden'`，**不能**写
    // `!document.hidden`：jsdom 的 visibilityState 是 'prerender' 而
    // document.hidden 是 true（实测），换成后者单测里引导会永远不出现。
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false;
    }

    if (this.claimed) {
      // 已经拿到了（这一轮的重试路径）：还是我们的。
      return true;
    }

    let granted = false;
    try {
      // ⚠️ 认领是**异步**的：写后读回要等一次存储往返 + 稳定窗口
      // （约 100ms）。这 100ms 里状态可能变，所以 await 之后还要复查。
      granted = await this.claimBroker.tryClaim(this.claimOwner);
    } catch {
      // 抢锁失败当「没抢到」：宁可少弹一次，也不要在没有协调的情况下
      // 让两个 frame 各弹一条。
      granted = false;
    }

    this.claimed = granted;

    // ⚠️ 认领期间页面可能被切到后台（用户切走了窗口）——
    // 那这条引导就不该由我们弹：用户正看着别处。
    // 把锁还回去，让用户看得到的那个窗口去弹。
    if (granted && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.releaseClaim();
      return false;
    }

    return this.claimed;
  }

  /**
   * 归还认领（引导读完了 / 被关掉了 / 被全屏挤走了）。
   *
   * 归还之后，别的 frame（别的标签页）才有机会弹下一条。
   */
  private releaseClaim() {
    if (!this.claimed) {
      return;
    }

    this.claimed = false;
    try {
      this.claimBroker.release(this.claimOwner);
    } catch {
      // 还不掉就靠 CLAIM_TTL_MS 过期。
    }
  }

  /**
   * 「这次还可以提示吗」。
   *
   * 两个条件：
   * 1. 之前没有展示过（`vsc-first-run-hint-shown`）
   * 2. 不在冷却期里（连续失败到上限之后的冷静期）
   *
   * ⚠️ 条件 2 满足时**绝不写** flag：那个 flag 是「一辈子只提示一次」的
   * 一次性开关，用户没真看到就不该消耗掉。
   */
  private async computeEligibility(): Promise<boolean> {
    try {
      const shown = await this.options.wasShown();
      if (shown) {
        return false;
      }

      return !(await this.options.isInCooldown?.());
    } catch {
      // 读不到就按「已展示」处理：宁可少打扰一次，
      // 也不要因为存储异常把提示变成每次刷新都弹。
      return false;
    }
  }

  /**
   * 等这条视频变得可见。
   *
   * 视频在窗口期里不可见是常事（用户还没滚到那儿）。那时直接放弃的话，
   * 用户后来滚到视频旁边时**不会再有 play 事件**，引导就永远不出现了 ——
   * 于是又变成「用户什么都没看到」。
   */
  private watchForVisibility(video: HTMLVideoElement) {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    if (!this.visibilityObserver) {
      this.visibilityObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLVideoElement;
          if (!entry.isIntersecting) {
            return;
          }

          this.visibilityObserver?.unobserve(target);
          if (this.pendingVisibilityVideo === target) {
            this.pendingVisibilityVideo = null;
          }

          // 变得可见的那一刻它可能已经暂停了、被换掉了 —— 那就不该再提示。
          if (!this.playingVideos.has(target) || !target.isConnected) {
            return;
          }
          if (!isVisibleToUser(target)) {
            return;
          }

          void this.reveal(target);
        });
      });
    }

    // 一次只等一条视频：等得越久越可能已经换掉了。
    if (this.pendingVisibilityVideo && this.pendingVisibilityVideo !== video) {
      this.visibilityObserver.unobserve(this.pendingVisibilityVideo);
    }

    this.pendingVisibilityVideo = video;
    this.visibilityObserver.observe(video);
  }

  /**
   * 开始「用户读过了」的计时。
   *
   * 只有在这段时间里**没被打断**、而且页面在前台，才算用户真的看到了。
   *
   * @param duration 这一档的阅读窗口（按行数算，见 readWindowMs）。
   */
  private startReadTimer(duration: number) {
    this.clearReadTimer();
    this.readTimer = window.setTimeout(() => {
      this.readTimer = null;

      // ⚠️ 阅读窗口走完 = 「引导已经显示满 N 秒」。
      // 这个标记是「拒绝」的判据（见 dismiss）：显示满 N 秒之后还点页面，
      // 才算他看过之后主动关掉；刚弹出那几秒里的误点只算忽略。
      this.readWindowElapsed = true;

      if (!this.hintVisible) {
        // 期间被打断过 —— 用户没读完。
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        // 页面在后台：计时器照样会跑（浏览器只会节流，不会停），
        // 但用户根本没看到屏幕 —— 不算读过，记一次失败。
        this.hintVisible = false;
        // 提示已经不算「正在显示」了：把锁还回去，别让它白占着。
        this.releaseClaim();
        void this.recordFailedAttempt();
        return;
      }

      void this.completeRead();
    }, duration);
  }

  private clearReadTimer() {
    if (this.readTimer === null) {
      return;
    }

    window.clearTimeout(this.readTimer);
    this.readTimer = null;
  }

  /**
   * 用户真的读过了：这才允许写「已展示」。
   *
   * ⚠️ 这里**不**把 hintVisible 清掉：提示读完之后仍然挂在屏幕上，
   * 用户随后点一下页面仍然是「他看过之后主动关掉」——
   * 那要记一次失败（见 dismiss）。把 hintVisible 清掉的话，
   * dismiss() 会提前早退，这条判据就成了死代码。
   */
  private async completeRead() {
    // 读完了就把锁还回去：这一次机会已经用掉了，别的 frame 不该再被挡着。
    this.releaseClaim();

    try {
      await this.options.markShown();
    } catch {
      // 落盘失败只会导致下次再提示一次，不值得打断用户。
    }

    try {
      await this.options.resetFailedAttempts?.();
    } catch {
      // 同上。
    }
  }

  /**
   * 记一次失败尝试（用户主动把引导关掉了）。
   *
   * ⚠️ 判据是「他**接受**了这个功能吗」，不是「他读过了吗」：
   * 按下扩展自己的键 = 他要用这个扩展了，那不是拒绝。
   * 「读过」只决定「已展示」什么时候落盘。
   */
  private async recordFailedAttempt() {
    if (this.accepted) {
      // 用户按下扩展自己的键 = 他接受了这个功能。那不是拒绝。
      return;
    }

    try {
      await this.options.recordFailedAttempt?.();
    } catch {
      // 计数失败只是让我们多打扰一次，不值得打断用户。
    }
  }

  private dismiss(reason: DismissReason) {
    // ⚠️ 页面点击在**阅读窗口之内**只算忽略 —— 连提示都不关。
    //
    // 原来的判据是「读没读完」：而「读完」要到阅读窗口结束才成立，
    // 于是「失败窗口」= 引导出现后的头两秒 —— 用户在页面上随手点一下
    // （点视频、点按钮、点链接）就被记成一次拒绝，三次就闭嘴一星期。
    // 而引导是全键盘界面下**唯一**的入口。
    //
    // 现在：显示满 N 秒之前，页面上的点击一律只算忽略；
    // 显示满 N 秒之后还点，才算他看过之后主动关掉。
    if (reason === 'dismissed' && !this.readWindowElapsed) {
      return;
    }

    // ⚠️ 这里**不能**清掉等待计时器（delayTimer）。
    //
    // 之前 dismiss() 把「等待 + 已显示」一起清了，于是用户在窗口期
    // （播放后的 2.5 秒）里按任意一个键，整轮等待就被取消 ——
    // 他后来什么都没看到，而提示**再也不会出现**（那次播放已经过去了）。
    // 现在：按键只关掉**已经显示出来的**提示；还没到点的等待继续等。
    this.clearReadTimer();

    const wasVisible = this.hintVisible;
    this.hintVisible = false;
    this.pill.hide();
    // 提示已经不在屏幕上了：把锁还回去，别的 frame 才有机会弹。
    this.releaseClaim();

    if (reason === 'accepted') {
      // 「用户读过了并接受」：按下扩展自己的键 = 他会用这个扩展了。
      // 这时候才允许写「已展示」—— 落盘的判据是「用户读过了」，
      // 用户还没看到引导就按了键，那唯一一次机会不该在这里被烧掉。
      //
      // ⚠️ `shownThisSession` 是补充条件：提示显示过、随后因为进了全屏
      // 而退场，用户这时才按下 `f` —— 那依然是「他接受了这个扩展」。
      this.accepted = true;
      if (wasVisible || this.shownThisSession) {
        this.pendingRevealVideo = null;
        void this.completeRead();
      }
      return;
    }

    if (!wasVisible) {
      return;
    }

    // 用户把提示关掉了，但没读：这次机会还在（没写「已展示」），
    // 「连续失败」的计数只在**主动关掉**时 +1 ——
    // 键盘上随手一按是碰键盘，不是拒绝；
    // 页面上误点一下也不算（见上面的判据）。
    this.pendingRevealVideo = null;
    if (reason === 'dismissed' || reason === 'refused') {
      void this.recordFailedAttempt();
    }
  }

  /**
   * 这个键是不是「扩展自己绑定的键」。
   *
   * ⚠️ 用的是**用户当前真实的绑定**，不是写死的键位 ——
   * 用户改过键之后判定必须跟着变（照着写死的键位判会误判）。
   *
   * 判定逻辑借自 `src/shared/shortcuts.ts` 的 matchesShortcut
   * （与键盘控制器同一套规则：修饰键必须**精确**匹配，
   * 绑定 `f` 时按 Shift+F 不算）。
   */
  private isExtensionShortcut(event: KeyboardEvent): boolean {
    const shortcuts = this.options.getShortcuts() ?? ({} as ShortcutSettings);

    return Object.values(shortcuts).some(
      (binding) => typeof binding === 'string'
        && binding !== ''
        && matchesShortcut(event, binding),
    );
  }

  /**
   * 键盘事件：分清「按了扩展的键」与「只是碰了一下键盘」。
   *
   * ⚠️ 这两件事在产品上是**不同的事件**，原来没区分：
   * 任何一次 keydown 都把提示关掉**并且**记一次失败，于是按三下 Shift
   * 就能把引导永久毁掉（而引导是全键盘界面上唯一的可见入口）。
   */
  private handleKey(event: KeyboardEvent) {
    // ⚠️ 焦点在关闭按钮上时，这次按键是**给按钮的**（Enter/Space 触发它、
    // Tab 移动焦点），不是「用户碰了一下键盘」。
    // 不挡住的话，用户 Tab 到「×」上还没按下去，引导就自己消失了 ——
    // 那按钮就永远按不到。
    if (this.isCloseButtonEvent(event)) {
      return;
    }

    this.dismiss(this.isExtensionShortcut(event) ? 'accepted' : 'ignored');
  }

  /**
   * 这个事件是不是发生在关闭按钮上。
   *
   * ⚠️ 用 composedPath()：事件跨 shadow 边界时 event.target 会被重定向到
   * 宿主元素（与 originalTarget 同一套理由）。
   */
  private isCloseButtonEvent(event: Event): boolean {
    if (!this.closeButton) {
      return false;
    }

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(this.closeButton)) {
      return true;
    }

    return event.target === this.closeButton;
  }

  /**
   * 挂上关闭按钮（「×」）。
   *
   * ⚠️ 为什么必须有它：引导的节点是 `pointer-events: none` + `aria-hidden` ——
   * 用户点不到它、也选不中它，更没有任何可以按的按钮。于是「拒绝」这件事
   * 只剩下「误点到页面」这一条路 —— 而误点不该被当成拒绝。
   * 有了它，「我故意关掉它」有了**正路**，页面上的其它点击一律只算忽略。
   *
   * ⚠️ 无障碍：按钮必须是**真按钮**（能 Tab 到、能被读屏念出名字），
   * 所以根节点的 aria-hidden 要摘掉，改成只把**文案**那一段藏起来
   * （文案走 live region 播报，视觉节点对读屏器隐藏是为了不重复念一遍）。
   */
  private mountCloseButton(root: HTMLElement) {
    // 文案包一层 aria-hidden：信息走 live region，视觉节点不必再念一遍。
    const text = document.createElement('span');
    text.setAttribute('aria-hidden', 'true');
    text.textContent = root.textContent ?? '';
    root.textContent = '';

    const button = document.createElement('button');
    button.type = 'button';
    button.id = HINT_CLOSE_BUTTON_ID;
    button.textContent = '×';
    button.setAttribute('aria-label', t('hintClose', '关闭使用引导'));
    button.setAttribute('title', t('hintClose', '关闭使用引导'));
    // ⚠️ 页面会写 `button { ... !important }`，所以样式必须逐条 !important
    // （隔离机制见 runtimeStyles.ts 的「页面级提示的样式隔离」）。
    // `all: initial` 必须**第一个**声明：它是简写，会把后面所有长写属性盖住。
    button.style.setProperty('all', 'initial', 'important');
    button.style.setProperty('position', 'absolute', 'important');
    button.style.setProperty('top', '2px', 'important');
    button.style.setProperty('right', '4px', 'important');
    button.style.setProperty('display', 'inline-flex', 'important');
    button.style.setProperty('align-items', 'center', 'important');
    button.style.setProperty('justify-content', 'center', 'important');
    button.style.setProperty('width', '20px', 'important');
    button.style.setProperty('height', '20px', 'important');
    button.style.setProperty('padding', '0', 'important');
    button.style.setProperty('border', 'none', 'important');
    button.style.setProperty('border-radius', '50%', 'important');
    button.style.setProperty('background-color', 'transparent', 'important');
    button.style.setProperty('color', 'inherit', 'important');
    button.style.setProperty('font-family', 'inherit', 'important');
    button.style.setProperty('font-size', '15px', 'important');
    button.style.setProperty('line-height', '1', 'important');
    button.style.setProperty('font-weight', '600', 'important');
    button.style.setProperty('cursor', 'pointer', 'important');
    button.style.setProperty('opacity', '0.7', 'important');
    // ⚠️ 外壳是 pointer-events: none，按钮必须自己打开 ——
    // 否则它看得见、摸不着。
    button.style.setProperty('pointer-events', 'auto', 'important');
    button.style.setProperty('visibility', 'visible', 'important');

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.dismiss('refused');
    });

    root.appendChild(text);
    root.appendChild(button);
    // 根节点不再整体对读屏器隐藏：关闭按钮必须露出来。
    root.removeAttribute('aria-hidden');
    // ⚠️ 右侧给关闭按钮留的位置**不在这里设** —— 它在卡片 token 里
    // （NOTICE_CARD_TOKENS 的 `padding-right`）。
    // 以前这里是单独一句 setProperty，于是同一个内边距有两份
    // （token 的 16px 与这里的 26px），而渲染出来的是哪一份只有浏览器知道。

    this.hintRoot = root;
    this.closeButton = button;

    this.closeButtonWatcher?.disconnect();
    this.closeButtonWatcher = new MutationObserver(() => {
      this.syncCloseButtonVisibility();
    });
    this.closeButtonWatcher.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  /**
   * 让关闭按钮跟着引导的可见状态走。
   *
   * ⚠️ 不收起来的话，页面右下角会留下一个**看不见但可以点**的区域
   * （按钮是 pointer-events: auto），而且它还在 tab 顺序里 ——
   * 读屏用户 Tab 到一个看不见的按钮，什么反馈都没有。
   */
  private syncCloseButtonVisibility() {
    const root = this.hintRoot;
    const button = this.closeButton;
    if (!root || !button) {
      return;
    }

    const visible = root.classList.contains('vsc-visible');
    button.style.setProperty('pointer-events', visible ? 'auto' : 'none', 'important');
    button.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');

    if (!visible && document.activeElement === button) {
      // 焦点停在一个看不见的按钮上 = 键盘用户「失联」了。
      button.blur();
    }
  }

  /**
   * 用户回到了这个标签页：把后台没弹出来的那次机会补上。
   *
   * ⚠️ 引导在后台时抢不到认领锁（claim() 的第一道判据就是「页面看不见」），
   * 那次机会必须留着 —— 否则「点完设置页的『重新显示使用引导』再切回来」
   * 这条最常见的路径上，引导永远是沉默的。
   */
  private handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    const video = this.pendingRevealVideo;
    if (!video || !video.isConnected) {
      return;
    }

    this.pendingRevealVideo = null;
    this.scheduleReveal(video);
  }

  /**
   * 引导状态被重置了（设置页的「重新显示使用引导」按钮）。
   *
   * ⚠️ 内存里的两个标记必须**一起**复位：
   * 只清 eligible 的话，shownThisSession 仍是 true，下一次 reveal() 会直接早退 ——
   * 于是「重新显示使用引导」（产品唯一的恢复出口）在同一个标签页里是哑的。
   */
  private handleHintStateChange(change: FirstRunHintStateChange) {
    if (!change.shownCleared) {
      return;
    }

    this.shownThisSession = false;
    this.accepted = false;
    this.readWindowElapsed = false;
    // 资格重新算一次（下次 reveal() 会去查「展示过没有」「在不在冷却期」）。
    this.eligible = null;

    // 屏幕上已经挂着一条引导？先收起来。
    //
    // ⚠️ 为什么不能就这么算了（"它已经在屏幕上了"）：那条是**上一次**的引导。
    // 用户在设置页点了「重新显示使用引导」，诉求是「**再给我看一次**」——
    // 而屏幕上这条他多半已经读过了（甚至没注意到）。
    // 留着它等于把「重置」变成「什么也没发生」。
    //
    // 收起来之后立刻补一条新的：整条流程（认领 → 显示 → 阅读窗口 → 落盘）
    // 原样重跑一遍，用户看到的是一条**新的**引导。
    if (this.hintVisible) {
      this.hintVisible = false;
      this.clearReadTimer();
      this.pill.hide();
      this.releaseClaim();
    }

    // 视频还在播吗？还在的话把这次机会补上 —— 用户不必刷新页面。
    const video = this.watchedVideo;
    if (video && video.isConnected && this.playingVideos.has(video)) {
      this.scheduleReveal(video);
    }
  }

  /**
   * 此刻是不是在网页全屏里。
   *
   * ⚠️ 判据是**全屏背板在不在 DOM 里**，不是「控制条在不在」：
   * 控制条只是全屏 UI 的一个零件，它缺席不等于功能缺席（见 speedToast.ts
   * 里同一个判据的说明）。背板才是事实 —— enter 时创建、exit 时被摘掉。
   */
  private isFullscreenActive(): boolean {
    return document.getElementById(FULLSCREEN_OVERLAY_ID) !== null;
  }

  /**
   * 订阅全屏背板的增删。
   *
   * ⚠️ 必须自己观察：退出全屏有三条路径（键盘 Esc、控制条上的退出按钮、
   * 工具栏图标），只有键盘那条会经过运行时 —— 控制条那条走的是
   * FullscreenController.exit()，运行时根本不知道「全屏结束了」。
   */
  private observeFullscreenSurface() {
    if (this.fullscreenWatcher || !document.body || !document.documentElement) {
      return;
    }

    this.fullscreenWatcher = observeBody({
      // 只看 body 的**直接子节点**：body 上的其它增删（站点自己塞个广告位）
      // 与全屏无关。
      bodyInit: { childList: true },
      onBodyMutation: () => this.reconcileFullscreen(),
      // ⚠️ <html> 这一层才是「背板增删」真正会发生的地方 ——
      // 网页全屏背板挂在 <html> 上（fullscreenController.ensureOverlay →
      // mountViewportRoot，见 viewportRoot.ts），它不在 body 的子树里。
      // 顺带：body 被换掉也是这一层的事，bodyObserver 会自动把 body 级
      // 观察器重新挂到新 body 上。
      onHostMutation: () => this.reconcileFullscreen(),
    });

    // 起点必须与事实对齐：观察者可能是在用户**已经**进了全屏之后才挂上的，
    // 此时真实状态已经是「在全屏里」。若这里留成 false，等到退出全屏时
    // 「false → false」不算变化，补弹的那次信号就永远等不到。
    this.fullscreenActive = this.isFullscreenActive();
  }

  /**
   * 把「此刻该不该有引导」对齐到「此刻在不在全屏里」这个事实。
   *
   * 它是**幂等**的：同一个状态反复调用不会来回抖。
   */
  private reconcileFullscreen() {
    const fullscreen = this.isFullscreenActive();

    if (fullscreen === this.fullscreenActive) {
      // 全屏状态没变 —— 这次变化与全屏无关（页面自己改了 body 的子节点）。
      return;
    }

    this.fullscreenActive = fullscreen;

    if (fullscreen) {
      this.onEnterFullscreen();
      return;
    }

    this.onExitFullscreen();
  }

  /**
   * 进入网页全屏：引导让位。
   *
   * 两条理由，缺一不可：
   * 1. **视觉**：引导固定贴在右下角，与控制条**重叠**（控制条的退出、
   *    倍速、音量按钮全落在引导的矩形里）。
   * 2. **内容**：引导讲的是「这个扩展怎么用」，而用户此刻已经在全屏里了 ——
   *    正在讲「怎么进来」的时候人已经在里面，是自相矛盾的。
   *
   * ⚠️ 这次让位**不算失败**：用户没拒绝，他只是进了全屏。
   * 所以不写「已展示」（机会还在），也不记失败次数。
   */
  private onEnterFullscreen() {
    if (!this.hintVisible) {
      return;
    }

    this.hintVisible = false;
    this.clearReadTimer();
    this.pill.hide();
    // 提示被全屏挤走了：把锁还回去（这条引导还会在退出全屏后补上）。
    this.releaseClaim();
    // 记住这条视频：退出全屏后如果还没展示过，把这次机会补上。
    this.pendingRevealVideo = this.watchedVideo;
  }

  /**
   * 退出网页全屏：如果引导还没展示过，补上这次机会。
   *
   * ⚠️ 进全屏不是用户的拒绝 —— 把机会还回去，否则用户会因为「碰巧进了
   * 一次全屏」而永远看不到这个扩展唯一的入口。
   */
  private onExitFullscreen() {
    const video = this.pendingRevealVideo;
    this.pendingRevealVideo = null;

    if (!video || !video.isConnected) {
      return;
    }

    if (this.shownThisSession) {
      return;
    }

    this.scheduleReveal(video);
  }

  destroy() {
    // ⚠️ 这里不走 dismiss()：销毁不是「用户打断了阅读」，
    // 不该被记成一次失败尝试。
    //
    // ⚠️ destroyed 必须**先**置位：认领是异步的（约 100ms），
    // 销毁时认领可能还在路上 —— 它回来之后不许再弹东西
    // （那会在页面已经卸载之后凭空冒出一条引导）。
    this.destroyed = true;
    this.hintVisible = false;
    this.clearReadTimer();
    this.cancelPendingReveal();
    // 提示不在屏幕上了，把锁还回去（页面正在卸载时写不进去也无妨：
    // 那把锁会自己过期）。
    this.releaseClaim();
    this.visibilityObserver?.disconnect();
    this.visibilityObserver = null;
    this.pendingVisibilityVideo = null;
    this.fullscreenWatcher?.disconnect();
    this.fullscreenWatcher = null;
    this.closeButtonWatcher?.disconnect();
    this.closeButtonWatcher = null;
    this.closeButton = null;
    this.hintRoot = null;
    this.unsubscribeHintState?.();
    this.unsubscribeHintState = null;
    this.claimBroker.dispose();

    document.removeEventListener('play', this.boundHandlePlay, true);
    document.removeEventListener('pause', this.boundCancelWatch, true);
    document.removeEventListener('ended', this.boundCancelWatch, true);
    document.removeEventListener('keydown', this.boundHandleKey, true);
    document.removeEventListener('keyup', this.boundHandleKey, true);
    document.removeEventListener('pointerdown', this.boundDismiss, true);
    document.removeEventListener('pointerdown', this.boundHandlePointerDown, true);
    document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
    this.pill.destroy();
  }
}

/**
 * 生产环境用的一组默认依赖：状态存在 storage.local。
 *
 * 失败计数也放 storage.local：它是「这台设备上打扰过几次」的设备级状态，
 * 与「提示展示过没有」放在一起。
 */
export const createFirstRunHint = (
  getShortcuts: () => ShortcutSettings,
  /**
   * 「这条视频是不是装饰物」的判定入口。
   *
   * ⚠️ 必须由 **VideoRegistry** 提供：判定规则在 ambientPreview.ts（只有一份），
   * 而「用户碰过」「站点自己开的」这两条证据只有 registry 知道。
   * 少给这个依赖，引导会用自己那份更粗的判定 —— 于是「接管」与「弹引导」
   * 对同一条视频给出相反的结论。
   */
  isAmbientPreview?: (video: HTMLVideoElement) => boolean,
) =>
  new FirstRunHint({
    getShortcuts,
    isAmbientPreview,
    wasShown: wasFirstRunHintShown,
    markShown: markFirstRunHintShown,
    // 失败计数与冷却时间戳都放在 shared/settings 里 —— 设置页的
    // 「重新显示使用引导」按钮要读同一份状态，两边各存一份就成了两套事实。
    recordFailedAttempt: recordFirstRunHintFailedAttempt,
    resetFailedAttempts: clearFirstRunHintFailures,
    isInCooldown: isFirstRunHintInCooldown,
  });
