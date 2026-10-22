/**
 * 全屏控制条的样式。
 *
 * 单独成模块的原因：控制条住在一个 **shadow root** 里（见 fullscreenControls.ts），
 * 它的样式不能放在注入到页面的 <style> 里 —— 页面样式不会渗进 shadow tree，
 * 反过来 shadow tree 里的样式也必须自己带一份。
 *
 * 为什么要 shadow root：
 *
 * 我们把 UI 注入到**任意站点**的 DOM 里，站点的全局 CSS 会顺着继承和元素
 * 选择器把控制条彻底摧毁。实测一个"有自己的设计系统"的站点：
 *
 *   * { box-sizing: border-box !important }
 *   div { font-family: "Comic Sans MS", cursive !important; line-height: 3 !important }
 *   button { all: unset !important }
 *   input[type="range"] { -webkit-appearance: none !important; height: 40px !important; background: red !important }
 *
 * 结果是控制条变成一整条红色大块、按钮塌成 22×48 的图标、时间显示成
 * Comic Sans、进度条完全不可用。
 *
 * 试过的其它办法都不行：
 * - 显式重声明每个属性：挡不住站点的 `!important`（作者 `!important` 优先级
 *   高于普通作者声明）。
 * - `all: revert`：revert 只回退到**上一层**样式，站点自己的 `!important`
 *   依然生效。
 * - `all: initial`：更糟，连 `position: fixed` 都会被重置。
 *
 * shadow root 是一条真正的隔离边界：页面样式进不来，我们自己的样式也
 * 出不去。这是结构性的保证，不是逐个属性地打补丁。
 *
 * 代价：外部代码要用 `root.shadowRoot.querySelector(...)` 才能拿到内部元素，
 * 控制条的样式也不能再靠页面里的 <style> 生效 —— 所以这份样式必须自给自足。
 */

import { CONTROLS_Z_INDEX, setImportant, setImportantAll } from './runtimeStyles';
import {
  CONTROL_BAR_BREAKPOINTS,
  CONTROL_BAR_NARROW_PADDING,
  CONTROL_BAR_WIDE_PADDING,
} from './controlBarLayout';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/** 品牌强调色：进度条填充与焦点环。 */
const ACCENT = '#67e8f9';

/**
 * 未填充轨道的颜色。
 *
 * rgba(255,255,255,.24) 在纯黑上只有 1.93:1 —— 低于 UI 组件所需的 3:1，
 * 用户根本看不出进度走到哪。
 *
 * .45 是权衡出来的：轨道是**半透明白**，它最终呈现的颜色由「轨道的不透明度」
 * 与「轨道背后的遮罩亮度」共同决定。轨道**越亮**，与遮罩的对比度越大，
 * 但与明亮画面的对比度越小 —— 两个方向是拉扯的。
 *
 * 这次要治的是「白底视频上轨道看不见」（见下面遮罩那段的实测），所以
 * 优先保证轨道与**画面**的对比度（实测，白色视频 + 下面这版遮罩）：
 *   不透明度 .45 → 轨道 rgb(124)，与遮罩 4.5:1、与白色画面 4.2:1
 *   不透明度 .50 → 轨道 rgb(134)，与遮罩 5.3:1、与白色画面 3.6:1
 * 取 .45：与白色画面的 4.2:1 离 3:1 的底线更远，而与遮罩的 4.5:1 也已过线。
 */
const TRACK_IDLE = 'rgba(255, 255, 255, 0.45)';

/**
 * 断点与内边距从 **controlBarLayout.ts** 来 —— 那里是布局契约的真源。
 *
 * ⚠️ 不在这里写死的原因：断点有三个消费方（这份 CSS、收起态退出钮的 JS
 * 位置、以及真实浏览器里的 e2e 量测），各写一份就会漂，
 * 而且漂了**没有任何测试会红**。理由与实测数字见 controlBarLayout.ts。
 */
export { CONTROL_BAR_BREAKPOINTS, CONTROL_BAR_REQUIRED_WIDTHS } from './controlBarLayout';

/**
 * 控制条宿主（#vsc-controls）**自身**的样式。
 *
 * ⚠️ 这份声明有**两个消费方**，必须同源（改一处忘了另一处 = 隔离破功）：
 *
 * 1. shadow tree 里的 `:host { … }` 规则；
 * 2. 宿主元素上的**内联 !important** 隔离底座（真正起作用的那个）。
 *
 * ⚠️ 为什么宿主要内联隔离：宿主是 **light DOM 里**的元素（shadow root
 * 装的是它的**内容**，不是它自己）。站点一条
 * `html > div { display: none !important }` 会**命中宿主本身** ——
 * 而 `:host { … }` 只是 shadow tree 里的普通声明，**作者 !important 赢过它**
 * （实测：控制条整条消失，连退出按钮都没有，只剩 Escape 能退出）。
 *
 * 而**内联 !important 赢过任何作者 !important**（style 属性高于所有选择器），
 * 所以底座必须内联 —— 与页面级提示、背板用的是同一套机制。
 */
export const CONTROLS_HOST_STYLES: Record<string, string> = {
  position: 'fixed',
  left: '0',
  right: '0',
  bottom: '0',
  'z-index': String(CONTROLS_Z_INDEX),
  display: 'block',
  'box-sizing': 'border-box',
  margin: '0',
  padding: '0',
  border: 'none',
  background: 'none',
  color: '#f1f5f9',
  'font-family': FONT_STACK,
  'font-size': '13px',
  'font-style': 'normal',
  'font-weight': 'normal',
  'line-height': '1.4',
  'text-align': 'left',
  direction: 'ltr',
  'letter-spacing': 'normal',
  'word-spacing': 'normal',
  'text-transform': 'none',
  '-webkit-font-smoothing': 'antialiased',
};

/**
 * shadow tree 里的 `:host` 规则 —— 由上面那份表生成，两边永远一致。
 */
const hostRule = `:host {
  /* all: initial 把 host 的继承属性也重置，挡住页面的 div { font-family: ... } */
  all: initial;
${Object.entries(CONTROLS_HOST_STYLES)
  .map(([property, value]) => `  ${property}: ${value};`)
  .join('\n')}
}`;

/**
 * 把控制条宿主**隔离**起来。
 *
 * 与页面级提示（isolateNotice）、网页全屏背板（isolateFullscreenOverlay）
 * 同一套机制：`all: initial !important` 起手，再逐条 important 写回。
 *
 * ⚠️ `all: initial` 会把 `:host` 规则里的 position / display 之类一并重置
 * （`:host` 是普通声明，输给内联 important）—— 所以必须把
 * `CONTROLS_HOST_STYLES` 整份逐条写回，一项都不能漏。
 *
 * ⚠️ 必须在**挂上页面之前**调用。
 */
export const isolateControlsHost = (host: HTMLElement): void => {
  host.removeAttribute('style');
  setImportant(host, 'all', 'initial');
  setImportantAll(host, CONTROLS_HOST_STYLES);
};

export const controlsStyles = `
${hostRule}


.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  /*
   * 内边距**从契约来**，不写字面量。
   *
   * ⚠️ 为什么不写死：收起态那枚独立退出钮要落在控制条退出按钮的**同一个角**，
   * 而那个角由控制条的 padding 决定。两边各写一份数字时，改一处不改另一处，
   * 退出钮就会错位 —— 而这正是 2026-10-21 复审抓到的真问题
   * （只把契约里的 right 从 18 改成 4，退出钮就错开 14px，只有一条
   * 1280px 宽的 e2e 能抓到）。
   */
  padding: ${CONTROL_BAR_WIDE_PADDING.top}px ${CONTROL_BAR_WIDE_PADDING.right}px ${CONTROL_BAR_WIDE_PADDING.bottom}px;
  /*
   * 渐变分四档，不是一档到底。
   *
   * 为什么不是一条直线淡出：白底视频（录屏、PPT、播客封面）上，
   * 纯黑渐变到 0 的那一段，文字所在的位置只剩 2.9:1 —— 低于 AA 的 4.5:1，
   * 字几乎看不见。多出来的中间档是为了把**文字实际落点**
   * 那段压黑，让白底视频里也读得清。
   *
   * ⚠️ 0.93 那一档必须够高，否则轨道会「浮」在画面上。
   * 轨道是半透明白：它呈现出来的颜色 = 白色 × 不透明度 + 遮罩 × (1 - 不透明度)。
   * 遮罩一旦不够黑，轨道就跟白色画面一个颜色 —— 实测（白色视频）：
   *   旧版（轨道处遮罩只有 0.77）→ 轨道 rgb(147)，与白色画面只有 3.08:1
   *   新版（轨道处遮罩 0.93）    → 轨道 rgb(124)，与白色画面 4.2:1
   * 3:1 是 WCAG 1.4.11 对 UI 组件的底线，3.08 只是「擦线过」。
   *
   * ⚠️ 顶端不能是**完全透明**：白底视频上控制条的上沿会变成一条灰带
   * （实测顶端 rgb(251)，7px 处 rgb(202) —— 一条说不清是渐变还是脏印的灰）。
   * 给顶端留 5% 的黑，上沿就成了**一条明确的边**，而不是一片灰雾。
   *
   * 实测（白底视频 + 文字 #f1f5f9，按 WCAG 相对亮度公式算）：
   *   渐变 50% 处（文字实际落点）→ 底色 rgb(20,20,20)，对比度 16.6:1
   *   渐变 70% 处              → 底色 rgb(64,64,64)，对比度 9.5:1
   * 都在 AA 之上。改这几档时记得重算 —— 注释里的数字是实测出来的，
   * 不是估的。
   */
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.94) 0%,
    rgba(0, 0, 0, 0.93) 50%,
    rgba(0, 0, 0, 0.68) 80%,
    rgba(0, 0, 0, 0.05) 100%
  );
  color: #f1f5f9;
  font-family: ${FONT_STACK};
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  opacity: 0;
  transform: translateY(8px);
  /*
   * visibility 必须一起过渡，而且**延迟**到 opacity 播完之后：
   * 立刻切成 hidden 会让淡出动画整个消失（元素瞬间不见）。
   */
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms;
  pointer-events: none;
  /*
   * opacity: 0 与 pointer-events: none 都**不会**把元素移出 Tab 序列。
   * 后果是：焦点停在控制条上时它淡出了，键盘用户盯着屏幕什么也看不到，
   * 只能盲按。只有 visibility: hidden 能真正把它移出焦点序列
   * （浏览器会把焦点还给 body）。
   */
  visibility: hidden;
}

.bar--visible {
  opacity: 1;
  transform: none;
  pointer-events: auto;
  visibility: visible;
  transition: opacity 180ms ease, transform 180ms ease;
}

/*
 * 焦点在控制条**本体**里时强制保持可见。
 * 与上面的 visibility 规则必须同时放开 visibility —— 只放开 opacity 的话，
 * 元素是「不透明但不可见」的，键盘用户还是看不见自己在哪。
 *
 * ⚠️ 为什么是 .bar:focus-within 而不是 :host(:focus-within) .bar：
 * 宿主里除了控制条本体，还有**收起态的退出钮**（它刻意不在 .bar 子树里，
 * 因为控制条一藏里面的东西就跟着不可见）。用宿主判的话，
 * 焦点落在收起态退出钮上时控制条也会被强行按在屏幕上 ——
 * 于是「控制条收起 → 退出钮顶上来」这个状态永远走不到，
 * 屏幕上会同时留着两个退出钮。
 */
.bar:focus-within {
  opacity: 1;
  transform: none;
  pointer-events: auto;
  visibility: visible;
}

.button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: normal;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.button:hover {
  background: rgba(255, 255, 255, 0.14);
}

.button:focus-visible {
  outline: 2px solid ${ACCENT};
  outline-offset: 2px;
}

.button svg {
  display: block;
  width: 22px;
  height: 22px;
  fill: currentColor;
}

/*
 * 播放/暂停、静音/取消静音：**两个图标叠在一起**，靠 class 切换。
 *
 * ⚠️ 不能用 innerHTML 换图标。实测 Chromium：innerHTML 把按钮里的 SVG
 * 换掉之后，光标下的元素变了，浏览器会在**光标不动**的情况下重新派发
 * mouseover/mouseenter —— 控制条的 mouseenter 处理器随即取消待触发的
 * 隐藏计时器，而光标没动就没有 pointermove 来重新计时，
 * 控制条从此**永远**不再自动隐藏（点一次播放按钮就中招）。
 *
 * 叠放 + class 切换不碰 DOM，浏览器不会重新派发任何鼠标事件。
 */
.button .icon--pause,
.button .icon--muted {
  display: none;
}

.button.is-playing .icon--play {
  display: none;
}

.button.is-playing .icon--pause {
  display: block;
}

.button.is-muted .icon--volume {
  display: none;
}

.button.is-muted .icon--muted {
  display: block;
}

.time,
.speed {
  flex: none;
  font-family: ${FONT_STACK};
  font-size: 12.5px;
  font-weight: 500;
  font-style: normal;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  /* 不透明：带透明度的白字在渐变中段达不到 4.5:1。 */
  color: #f1f5f9;
  white-space: nowrap;
}

/*
 * 时间标签里的「当前时间」：宽度固定。
 *
 * ⚠️ 它必须固定：宽度会随播放进度变化（"0:00" → "59:59" → "1:00:00"），
 * 而它就坐在进度条左边 —— 宽度一变，进度条被挤得忽宽忽窄，
 * 整个控制条跟着横向抖动（实测进度条在 871.6px 与 851.7px 之间跳）。
 *
 * 7.2ch 装得下 "1:00:00"（8 个字符，冒号比数字窄）。
 * 右对齐：这样分隔符「/」不会因为数字变长而左右跑。
 */
.time__now {
  display: inline-block;
  min-width: 7.2ch;
  text-align: right;
}

/*
 * 倍速徽标。
 *
 * 「1.5x」是一个状态，不是一段漂浮的文本 —— 做成徽标后它一眼就能被认出
 * 是倍速而不是时间或音量。它同时是一个按钮（弹出档位菜单），所以要先把
 * button 的 UA 样式清干净。
 */
.speed-wrap {
  position: relative;
  display: inline-flex;
  flex: none;
}

.speed {
  /*
   * 固定宽度：倍速徽标的文字在 "1x"（40px）与 "1.25x"（50.7px）之间跳，
   * 徽标一变宽，它左边的静音按钮就跟着挪（实测静音按钮 x 从 1040 变成 1029.3）。
   * 52px 装得下最长的 "1.25x"，文字居中。
   */
  min-width: 52px;
  padding: 3px 8px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #f1f5f9;
  font: inherit;
  font-family: ${FONT_STACK};
  font-size: 12.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.speed:hover {
  background: rgba(255, 255, 255, 0.2);
}

.speed:focus-visible {
  outline: 2px solid ${ACCENT};
  outline-offset: 2px;
}

/* --- 倍速档位菜单 --- */

.speed-menu {
  position: absolute;
  /* 挂在按钮上方：控制条贴着视口底部，菜单往下开会跑出屏幕。 */
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-width: 96px;
  /*
   * ⚠️ 上限不是随便定的：10 个档位 × 25.5px + 容器内边距 = **263px**。
   * 上限低于它，菜单就会**悄悄把 3x / 4x 截在外面** ——
   * 没有滚动条提示、没有省略号，看起来就像菜单只有 8 档，
   * 而 3x / 4x 恰恰是「看快点」时最想按的两档。
   *
   * 72vh：窗口高约 365px 起就够放下全部 10 档；
   * 再矮就滚动（那种窗口本来就放不下 10 行）。
   * 同时它也保住了「菜单顶部不会顶出视口」——
   * 菜单是从按钮往上长的，顶部跑出屏幕的话上边几档就够不着了。
   */
  max-height: 72vh;
  overflow-y: auto;
  padding: 4px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  color: #f1f5f9;
  font-family: ${FONT_STACK};
  font-size: 12.5px;
  line-height: 1.4;
}

/*
 * hidden 属性必须由 CSS 显式兑现。
 * UA 的 [hidden] { display: none } 是**UA 样式**，作者样式里的
 * display: flex 优先级更高 —— 只写 hidden 属性的话菜单根本藏不住。
 */
.speed-menu[hidden] {
  display: none;
}

.speed-menu__item {
  display: block;
  width: 100%;
  /*
   * 4px 而不是 6px：10 行 × 每行少 2px = 菜单矮了 20px，
   * 刚好让 263px 的内容在 72vh 的上限里**一行不落**地显示完。
   */
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-family: ${FONT_STACK};
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.speed-menu__item:hover {
  background: rgba(255, 255, 255, 0.12);
}

.speed-menu__item:focus-visible {
  outline: 2px solid ${ACCENT};
  outline-offset: -2px;
}

/* 当前档位：必须有明确的视觉标记，用户才知道自己现在在几倍速上。 */
.speed-menu__item[aria-current="true"] {
  background: rgba(103, 232, 249, 0.18);
  color: ${ACCENT};
  font-weight: 600;
}

.range {
  -webkit-appearance: none;
  appearance: none;
  display: block;
  /* 24px：thumb 放大到 16px 之后，16px 高的滑轨连 thumb 都放不下。 */
  height: 24px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    ${ACCENT} 0%,
    ${ACCENT} var(--vsc-progress, 0%),
    ${TRACK_IDLE} var(--vsc-progress, 0%),
    ${TRACK_IDLE} 100%
  );
}

.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  /* 16px：WCAG 2.2 § 2.5.8 要求触控目标至少 24×24，12px 的 thumb 不达标。 */
  width: 16px;
  height: 16px;
  /* 轨道高 4px，thumb 16px：(4 - 16) / 2 = -6。 */
  margin-top: -6px;
  border-radius: 50%;
  background: #f8fafc;
  border: none;
}

.range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: ${TRACK_IDLE};
}

.range::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: ${ACCENT};
}

.range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: #f8fafc;
}

.range:focus-visible {
  outline: 2px solid ${ACCENT};
  outline-offset: 2px;
}

.progress {
  flex: 1 1 auto;
  /* 窄屏下别塌成 0 —— 塌掉之后进度条就没法拖了。 */
  min-width: 120px;
}

.volume {
  flex: none;
  width: 84px;
}

/* --- 降低动效 --- */

@media (prefers-reduced-motion: reduce) {
  .bar {
    transition: none !important;
  }
}

/*
 * --- 窄屏（手机竖屏、窄窗口）与「被放大」的窗口 ---
 *
 * ⚠️ 这里曾经只有一个断点：640px。640 是**拍脑袋**的数，而这套布局真正的
 * 门槛低得多 —— 于是 200% 放大窗口的用户白白丢控件：
 * 浏览器放大 200% 会把 CSS 视口**减半**（1280 → 640px），
 * 640 恰好命中断点，音量滑块和总时长凭空消失，而那点宽度**根本装得下**
 * 完整的一套。这是「按设备想象」而不是「按可用宽度算」的代价。
 *
 * ⚠️⚠️ 后来这一段又栽在同一个坑上：**断点是用估算值定的，不是实测值**。
 *
 * 当时的估算是「完整一套 490px / 去掉音量与总时长 365px / 紧凑 293px」，
 * 于是断点定在 500 与 380。实测（真实 Chromium，2026-10-21）推翻了这两个数：
 *
 *   完整一套              实测需要 553px 视口
 *                          （退出按钮右边缘恒在 552.83 —— 用 1:00:00 这种
 *                            长时长字符串量出来的；短时长会窄 13.5px）
 *   去掉音量滑块与总时长   实测需要 401px 视口（退出按钮右边缘恒在 400.33）
 *   紧凑一套              实测需要 321px 视口（退出按钮右边缘恒在 321）
 *   极简一套（无时间）     实测需要 234px 视口（右边缘恒在 234）
 *   最后一档（无进度/静音） 实测需要 134px 视口（右边缘恒在 134）
 *
 * 于是有**两段**视口宽度会让退出按钮出屏：
 *
 *   501–546px  → 完整一套放不下（断点 500 比实际需要低 53px）
 *   381–400px  → 中间那一套放不下（断点 380 比实际需要低 21px）
 *
 * 症状是「手机上鼠标点不到退出按钮」—— 390px（iPhone 12/13/14 的宽度）
 * 正好落在第二段里。退出按钮出屏 = 用户被关在全屏里，
 * 只能靠 Esc 出去，而「按 Esc 能退」这件事从没在界面上告诉过他。
 *
 * 所以断点改成**实测值 + 余量**：
 *
 *   > 560px  → 完整一套（需要 553）
 *   ≤ 560px  → 去掉音量滑块与总时长（需要 401）
 *   ≤ 430px  → 紧凑一套（需要 321）
 *   ≤ 330px  → 连时间都不显示（需要 234）
 *   ≤ 240px  → 连进度条与静音都让位（需要 134）
 *
 * ⚠️ 每一档都留了余量，不是「刚好装得下」：断点落在「刚好装得下」的那一点上时，
 * 只要差 1px 就会溢出（退出按钮被推出屏幕）。余量留给滚动条、缩放、
 * 字体回退（系统没装 Inter 时字更宽）。
 *
 * ⚠️ 最后一档（≤330px）是为「200% 放大」准备的：320px 的手机放到 200%
 * 就是 160px 的 CSS 视口，任何一档都装不下 —— 那时至少要把**退出按钮**
 * 保住（它是唯一的逃生口），时间显示可以让位。
 *
 * ⚠️ 不用 overflow-x: auto 兜底：overflow-y: visible 在 overflow-x 不是
 * visible 时会被**算成 auto**，控制条于是变成纵向滚动容器，
 * 倍速菜单（绝对定位在按钮上方）会被整个裁掉 —— 那是用一个问题换另一个。
 * 让内容真的塞得下才是正解。
 *
 * ⚠️ 这些数字会过期。谁改了控制条里的任何一个控件（加宽、换文案、
 * 加图标），都要重跑 e2e 里那条「宽度扫描」守卫（见
 * tests/e2e/fullscreen-controls.spec.js），它会把真实需要的宽度报出来。
 *
 * ⚠️ 断点本身不在这里写死 —— 它来自 controlBarLayout.ts 的
 * CONTROL_BAR_BREAKPOINTS（断点）与 CONTROL_BAR_REQUIRED_WIDTHS（实测需求），
 * 那里同时是 JS 侧（收起态退出钮的位置）与 e2e 侧（真实浏览器量测）的真源。
 */
@media (max-width: ${CONTROL_BAR_BREAKPOINTS.medium}px) {
  /* 静音按钮留着，滑块让位（手机上拖着调音量本来也不现实）。 */
  .volume {
    display: none;
  }

  /*
   * 放不下「当前时间 / 总时长」：只留当前时间。
   * 进度条本身已经表达了播放位置，牺牲总时长换来退出按钮可见。
   */
  .time__sep,
  .time__total {
    display: none;
  }
}

@media (max-width: ${CONTROL_BAR_BREAKPOINTS.compact}px) {
  .bar {
    gap: 6px;
    /* 同样从契约来 —— 见上面宽屏那处的注释。 */
    padding: ${CONTROL_BAR_NARROW_PADDING.top}px ${CONTROL_BAR_NARROW_PADDING.right}px ${CONTROL_BAR_NARROW_PADDING.bottom}px;
  }

  .button {
    width: 30px;
    height: 30px;
  }

  .button svg {
    width: 20px;
    height: 20px;
  }

  .progress {
    min-width: 60px;
  }

  .time__now {
    min-width: 6ch;
  }

  /* 倍速与退出按钮必须完整可见，不许被挤掉。 */
  .speed,
  .exit {
    flex-shrink: 0;
  }
}

/*
 * 极窄（放大到 200% 的手机、小窗）：连当前时间都让位。
 *
 * 留下的是：播放 / 进度 / 静音 / 倍速 / 退出。
 * 丢掉的：时间显示 —— 它是信息，退出按钮是**逃生口**，逃生口优先。
 */
@media (max-width: ${CONTROL_BAR_BREAKPOINTS.minimal}px) {
  .time {
    display: none;
  }

  .progress {
    min-width: 40px;
  }
}

/*
 * 最后一档（320px 的手机放到 200% = 160px 的 CSS 视口）：
 * 连进度条与静音都让位。
 *
 * 留下的是：播放 / 倍速 / 退出（三个 30px 按钮 + 2 个 6px 间距 = 144px）。
 * ⚠️ **倍速徽标必须留着** —— 那是用户唯一能一眼看到「现在是几倍速」的地方，
 * 而控制条此刻还开着。丢进度条（画面上还有播放进度）与静音（手机上很少用）
 * 是可以接受的让步；丢倍速读数不是。
 */
@media (max-width: ${CONTROL_BAR_BREAKPOINTS.narrowest}px) {
  .progress,
  [data-role="mute"] {
    display: none;
  }
}
`;
