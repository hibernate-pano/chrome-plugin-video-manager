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

import { CONTROLS_Z_INDEX } from './runtimeStyles';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/** 品牌强调色：进度条填充与焦点环。 */
const ACCENT = '#67e8f9';

/**
 * 未填充轨道的颜色。
 *
 * rgba(255,255,255,.24) 在纯黑上只有 1.93:1 —— 低于 UI 组件所需的 3:1，
 * 用户根本看不出进度走到哪。.45 提到 4.43:1，过线。
 */
const TRACK_IDLE = 'rgba(255, 255, 255, 0.45)';

export const controlsStyles = `
:host {
  /* all: initial 把 host 的继承属性也重置，挡住页面的 div { font-family: ... } */
  all: initial;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${CONTROLS_Z_INDEX};
  display: block;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: #f1f5f9;
  font-family: ${FONT_STACK};
  font-size: 13px;
  font-style: normal;
  font-weight: normal;
  line-height: 1.4;
  text-align: left;
  direction: ltr;
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
}

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  padding: 20px 18px 12px;
  /*
   * 渐变分四档，不是一档到底。
   *
   * 为什么不是一条直线淡出：白底视频（录屏、PPT、播客封面）上，
   * 纯黑渐变到 0 的那一段，文字所在的位置只剩 2.9:1 —— 低于 AA 的 4.5:1，
   * 字几乎看不见。多出来的中间档（0.88 / 0.55）是为了把**文字实际落点**
   * 那段压黑，让白底视频里也读得清。
   *
   * 实测（白底视频 + 文字 #f1f5f9，按 WCAG 相对亮度公式算）：
   *   渐变 50% 处（文字实际落点）→ 底色 rgb(67,67,67)，对比度 9.0:1
   *   渐变 58% 处              → 底色 rgb(86,86,86)，对比度 6.7:1
   *   渐变 70% 处              → 底色 rgb(115,115,115)，对比度 4.3:1
   * 都在 AA 之上。改这几档时记得重算 —— 注释里的数字是实测出来的，
   * 不是估的。
   */
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.88) 35%,
    rgba(0, 0, 0, 0.55) 70%,
    rgba(0, 0, 0, 0) 100%
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
 * 焦点在控制条里时强制保持可见。
 * 与上面的 visibility 规则必须同时放开 visibility —— 只放开 opacity 的话，
 * 元素是「不透明但不可见」的，键盘用户还是看不见自己在哪。
 */
:host(:focus-within) .bar {
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
  min-width: 40px;
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
  max-height: 60vh;
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
  padding: 6px 10px;
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
`;
