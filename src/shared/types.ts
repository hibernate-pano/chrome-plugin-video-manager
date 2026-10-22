export interface ShortcutSettings {
  increaseSpeed: string;
  decreaseSpeed: string;
  resetSpeed: string;
  togglePlay: string;
  seekBack: string;
  seekForward: string;
  fullscreen: string;
}

export interface PersistedSettings {
  shortcuts: ShortcutSettings;
}

export interface ShortcutDefinition {
  id: keyof ShortcutSettings;
}

export const STORAGE_KEY = 'vsc-settings';
export const LEGACY_SHORTCUTS_KEY = 'shortcuts';

/**
 * 6.0.7 起废弃：站点速度记忆表的存储键（storage.local，hostname -> 播放速度）。
 * 功能已删除，但老用户机器上仍留着这份数据——它记录了用户访问过哪些站点，
 * 属于不该留存的历史。启动时一次性清掉，不做无痕迁移。
 */
export const LEGACY_SITE_SPEEDS_KEY = 'vsc-site-speeds';

/** 首次使用引导是否已展示（storage.local，设备级状态）。 */
export const FIRST_RUN_HINT_KEY = 'vsc-first-run-hint-shown';

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  increaseSpeed: '=',
  decreaseSpeed: '-',
  resetSpeed: '0',
  togglePlay: ' ',
  seekBack: 'ArrowLeft',
  seekForward: 'ArrowRight',
  fullscreen: 'f',
};

/** 快进快退的固定步长（秒）。 */
export const SEEK_STEP_SECONDS = 5;

/** content -> background：切换当前标签页的网页全屏。 */
export const TOGGLE_FULLSCREEN_MESSAGE = 'vsc-toggle-fullscreen';

/**
 * content -> background：「用户此刻在哪个 frame 里」。
 *
 * 背景：内容脚本注入到**所有** frame 之后，「点工具栏图标」这个意图会同时送到
 * 页面里的每一个 frame —— 全都执行就是进好几次全屏、弹好几个提示。
 * 但浏览器只把焦点给一个 frame，而「用户正在看的画面」就在那个 frame 里。
 *
 * 所以每个 frame 把自己拿到焦点这件事告诉 background（background 从
 * `sender.frameId` 认出是哪一个 frame），点图标时就只发给那一个。
 *
 * ⚠️ 为什么不用 `document.hasFocus()` 直接判：点工具栏图标时焦点在**浏览器
 * 界面**上，页面此刻多半是失焦的 —— 靠 hasFocus 判，结果是「图标点了没反应」。
 * 而「上一次拿到焦点的那个 frame」不会因为焦点跑掉而失效。
 */
export const FRAME_FOCUS_MESSAGE = 'vsc-frame-focus';

/**
 * 焦点消息里**顺带**带上当前倍速。
 *
 * 为什么：工具栏标题是「这个标签页此刻的倍速」这唯一的常驻读数。
 * 焦点在 frame A 与 frame B 之间移动时，**该显示谁的倍速**会变 ——
 * 少了这个字段，标题就会停在上一个 frame 的值上（说谎）。
 *
 * ⚠️ 只在「这个 frame 确实有一个受控视频」时带得上；没有视频时是 undefined，
 * background 保留原来的读数（而不是改成 1 —— 那个 frame 没有视频不代表
 * 「这个标签页没有倍速」）。
 */
export interface FrameFocusMessage {
  type: typeof FRAME_FOCUS_MESSAGE;
  /** 这个 frame 此刻的受控视频倍速；没有视频时为 undefined。 */
  rate?: number;
}

/**
 * background -> content（广播到这个标签页的每一个 frame）：「你们谁有视频？」
 *
 * 背景：内容脚本注入到**所有** frame，而 6.1.0 起每个 frame 只管**自己
 * 文档里**的视频（注册表不再钻进 iframe —— 两个运行时抢同一个 `<video>`
 * 会打架）。于是「这个标签页的视频在哪儿」这件事，只有把各个 frame
 * 问一遍才知道 —— background 自己看不见任何 DOM。
 *
 * ⚠️ 是一次**广播**：同一时刻可能有多个 frame 都有视频（页面上方一个、
 * 嵌入框里一个），问的是「你们各自的情况」，不是「谁有视频」。
 */
export const VIDEO_OWNER_ASK_MESSAGE = 'vsc-video-owner-ask';

/**
 * content -> background：「我这个 frame 的视频情况」。
 *
 * ⚠️ 走 chrome.runtime.sendMessage（而不是 tabs.sendMessage 的响应），
 * 因为一次广播会有**很多** frame 同时回答，而 chrome.tabs.sendMessage
 * 只保留**一个**响应 —— 其余的回答会被丢掉。background 从
 * `sender.frameId` 认出是谁回答的。
 */
export const VIDEO_OWNER_REPORT_MESSAGE = 'vsc-video-owner-report';

/**
 * content -> background：「我这个 frame 没有视频，别的 frame 有吗？」
 *
 * 实测（真实 Chromium）：页面上唯一的视频在嵌入框里、而焦点在顶层时，
 * 顶层运行时按 `=`/`f` **什么都不会发生** —— 键穿透给了页面，页面没有
 * 绑定，于是静默无事发生。用户能得出的唯一结论是「扩展坏了」。
 *
 * ⚠️ 快捷键路径**不会**去抢别的 frame 的视频（键属于页面，没有明确目标
 * 就不接管），所以这里问到的答案只用来**告诉用户视频在哪**。
 */
export const VIDEO_OWNER_QUERY_MESSAGE = 'vsc-video-owner-query';

export interface VideoOwnerReportMessage {
  type: typeof VIDEO_OWNER_REPORT_MESSAGE;
  /**
   * 显式操作（点工具栏图标）能不能接管这个 frame 里的视频。
   *
   * 契约见 videoRegistry 的 getCurrentVideo()：显式操作要求**一定有**目标，
   * 没有就返回 null（运行时据此提示「这个页面里没有视频」）。
   */
  explicit: boolean;
  /**
   * 快捷键路径能不能接管这个 frame 里的视频。
   *
   * 契约见 getWatchedTarget()：快捷键要求「用户此刻正在看的那个视频」，
   * 没有就返回 null（按键穿透给页面）。它比 explicit 更严 ——
   * 页面里可能有个小预告视频能接管，却不是用户正在看的那个。
   */
  watched: boolean;
  /** 那个视频是不是正在播。 */
  playing: boolean;
}

/**
 * 原生扩展命令：打开设置页。
 *
 * 必须是 `chrome.commands` 而不是页面内按键监听 —— 原生命令在浏览器层面
 * 拦截，不会被站点或浏览器自己的快捷键吞掉，而且用户能在
 * `chrome://extensions/shortcuts` 里自己改键。
 *
 * 名字必须与 manifest.json 里 `commands` 的键**完全一致**：
 * 两边对不上时命令永远不触发，而且没有任何报错（Chrome 只是不认这个命令）。
 */
export const OPEN_OPTIONS_COMMAND = 'open-options';

/**
 * content -> background：这个标签页当前的倍速。
 *
 * 只在**值真的变了**的时候发：连按 `=` 时每次都会调速，但倍率没变时
 * 再发一遍只是白白唤醒一次 service worker。
 *
 * background 靠 sender.tab.id 认出是哪个标签页 —— 内容脚本不知道自己的
 * tabId，这是唯一正确的对应方式。
 *
 * ⚠️ 消息里可以**没有** rate：那个 frame 此刻没有受控视频。
 * 「这里没有视频」不是一个可以写进标题的倍速（写成 1 就是撒谎 ——
 * 那个 1.1x 可能是另一个 frame 里正在播的视频），所以这种上报一律
 * 不带 rate，background 收到后保持标题不变。
 */
export const SPEED_REPORT_MESSAGE = 'vsc-speed-report';

/**
 * 倍速上报消息的形状。
 *
 * 为什么要显式声明：这条消息的载荷只有一个数字，但**它是唯一**能让
 * 工具栏标题更新的通道 —— 载荷的形状（叫 `rate` 还是 `playbackRate`）
 * 一旦两边不一致，症状是「标题永远不更新」，而没有任何报错。
 * 写成类型，两边就都跑不过类型检查。
 */
export interface SpeedReportMessage {
  type: typeof SPEED_REPORT_MESSAGE;
  /** 这个 frame 此刻的受控视频倍速；没有受控视频时为 undefined。 */
  rate?: number;
}

/**
 * background -> content（只发给**指定的**一个 frame）：「你还活着吗？」
 *
 * 背景：background 记着「这个标签页的倍速是哪个 frame 报的」。那个 frame
 * 随时可能消失 —— SPA 把 iframe 整个换掉、页面整页跳转 —— 而**没有人**
 * 会来说一声。于是那份记录悬在半空：标题继续挂着早已不存在的倍速
 * （标题在说谎），而它指向的 frame 早就没了。
 *
 * 以前唯一的复位判据是「报出这个倍速的 frame 自己说它没有视频了」，
 * 而那个 frame 没了之后就不会再说话 —— 判据永远等不到。
 *
 * 这条消息就是来问「那个 frame 还在不在」的探针。
 */
export const FRAME_PROBE_MESSAGE = 'vsc-frame-probe';

/**
 * 探针本身：一条不带载荷的指令。
 *
 * 回答走 sendResponse（形状见 FrameProbeResponse）——
 * 它只问**一个** frame（tabs.sendMessage 带 frameId），
 * 所以响应通道只有一条，不需要广播。
 */
export interface FrameProbeMessage {
  type: typeof FRAME_PROBE_MESSAGE;
}

/**
 * 探针的回答。
 *
 * ⚠️ 「视频还在不在」问的是**这一层报出去过的那一个视频**，
 * 不是「这一层此刻有没有视频」：视频被站点滚出视口、被 display:none 藏起来
 * 时，「此刻有没有视频」会说没有，而那个视频其实还在、还在按 1.2 倍播。
 */
export interface FrameProbeResponse {
  ok: true;
  /**
   * 那一层报出去过的视频现在怎么样：
   * - `'alive'`：还在（读数继续有效）；
   * - `'gone'`：被页面换掉了（读数作废）；
   * - `'unknown'`：这一层从来没报过倍速（没有读数可保，别据此清掉什么）。
   */
  video: 'alive' | 'gone' | 'unknown';
  /** 视频还在的话，它此刻的倍速。 */
  rate?: number;
}

/**
 * content -> background：「我这一层要走了。」
 *
 * 背景：frame 被销毁时（iframe 被换掉、整页跳转），**没有人**会来说这件事：
 * 内容脚本跟着文档一起没了，它来不及说，而 background 只能靠猜
 * （「URL 变了？换页了？倍速归 1？」—— 那是 6.2.0 之前的老做法，
 * 同文档导航也会触发它，于是用户刚调好的读数凭空消失）。
 *
 * 页面在卸载前的最后一刻还能发消息 —— 这是唯一一条**确定**的信号：
 * 「报出这个倍速的那个 frame 自己说它要走了」。
 */
export const FRAME_GONE_MESSAGE = 'vsc-frame-gone';

/**
 * 「我这一层要走了」—— 一条不带载荷的通告。
 *
 * background 从 sender.frameId 认出是哪一个 frame 走的（它只关心
 * 「走掉的那个是不是报出这个倍速的那个」）。
 */
export interface FrameGoneMessage {
  type: typeof FRAME_GONE_MESSAGE;
}

/**
 * 控制条发出的 DOM 事件：倍速变了。
 *
 * 为什么用 DOM 事件而不是构造函数回调：控制条由 FullscreenController 创建，
 * 而控制条与运行时之间的这条线要能独立演化。事件把两者解耦 ——
 * 控制条只管发，谁关心谁订阅，不必改控制条或控制器的构造参数。
 *
 * 事件派发在宿主节点（#vsc-controls，挂在页面里的 light DOM）上并冒泡，
 * 所以订阅方在 document 上监听即可。shadow root 内部的元素不需要被外部
 * 直接拿到，外部代码也拿不到。
 */
export const SPEED_CHANGE_EVENT = 'vsc-speed-change';

/**
 * 「扩展刚装好 / 刚更新」—— background 在 `chrome.runtime.onInstalled`
 * 时刻向所有标签页发的一次**探测**。
 *
 * ⚠️ 它**不是**「弹一条提示」的消息：能收到它的内容脚本，跑的就是**当前版本**
 * （它是在扩展装好之后才被注入的），没什么要提示的。
 * 它是一把尺子 —— 回答里带着**注入它的那一版版本号**，
 * background 拿它跟当前版本比：
 *
 * - 有人回答且版本相同 → 那个标签页是新的 → 不用管；
 * - 有人回答但版本不同 → 那个标签页在跑旧副本 → 要刷新；
 * - 没人回答 → 那个标签页要么没有内容脚本（刚装），
 *   要么只剩一个上下文已死的僵尸（刚更新）→ 两种都得刷新。
 *
 * ⚠️ 实测（真实 Chromium，见 docs/ARCHITECTURE.md「装完了」那一节）：
 * `chrome.tabs.sendMessage` **送不到**僵尸内容脚本（它的 chrome.runtime
 * 上下文已经死了），也送不到没有内容脚本的标签页
 * （"Could not establish connection. Receiving end does not exist."）。
 * 唯一能往那些标签页里塞东西的办法是 `chrome.scripting.executeScript`，
 * 而它需要 "scripting" 权限 —— 那是一次 manifest 改动，不在本次范围内。
 */
export const EXTENSION_INSTALLED_MESSAGE = 'vsc-extension-installed';

/** 探测本身：一条不带载荷的指令。 */
export interface ExtensionInstalledMessage {
  type: typeof EXTENSION_INSTALLED_MESSAGE;
}

/**
 * 探测的回答。
 *
 * `version` 是**注入这一份内容脚本时**扩展的版本号 ——
 * 它是「这个标签页跑的是哪一版」的唯一证据。
 */
export interface ExtensionInstalledResponse {
  ok: true;
  version: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'increaseSpeed' },
  { id: 'decreaseSpeed' },
  { id: 'resetSpeed' },
  { id: 'togglePlay' },
  { id: 'seekBack' },
  { id: 'seekForward' },
  { id: 'fullscreen' },
];
