const STYLE_ID = 'vsc-runtime-styles';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/**
 * 页面级提示与视频边缘之间的距离（px）。
 *
 * 调速胶囊（SpeedToast）贴视频**左上角**，接管提示（TakeoverNotice）贴视频
 * **左下角**：两者共用同一个内缩距离，靠不同的角错开。
 *
 * 为什么必须错开：两个提示曾经用逐字相同的锚点公式，都贴在左上角，
 * 而接管提示更宽（154px vs 胶囊 54px）—— 它会把胶囊整个盖住，
 * 用户看到的是「文字压文字」（6.0.9 实测）。
 *
 * 放在这里而不是各自模块里：这两个提示必须**一起**改，
 * 一旦有人只改其中一个的角，就会重新撞车。
 */
export const NOTICE_INSET = 16;

/**
 * 视频左上角那一行的高度（px），从视频顶边算起。
 *
 * 这一行是**调速胶囊**占的：16px 内缩 + 14px 字号 × line-height 1.4
 * + 上下各 5px 内边距 ≈ 46px。
 *
 * 接管提示贴视频左下角时，下边缘必须落在这一行**下面** ——
 * 视频太矮时（高度不足一行 + 一条提示），否则两个提示会重叠。
 */
export const NOTICE_ROW_HEIGHT = 46;

/**
 * 接管提示可能占的最大高度（px）。
 *
 * 单行文案（约 26px）加上**换行**后的两行（约 44px）。
 * 英文文案更长（"This video cannot be taken over here"），在窄视频上会折成
 * 两行，所以按两行预留。
 *
 * 只用于「视频太矮时把提示挤到胶囊下面」那条分支的高度预算，
 * 不参与实际定位（定位锚在 bottom 上，不需要知道高度）。
 */
export const NOTICE_MAX_HEIGHT = 44;

/**
 * 网页全屏背板的 DOM id。
 *
 * 它是「此刻处于网页全屏」这个事实的**唯一可靠来源**：
 * enter() 时创建、exit() 时被摘掉，且增删是 body 的直接子节点变化，
 * 因此可以被 MutationObserver 订阅。
 *
 * ⚠️ 不要改用控制条（#vsc-controls）当全屏信号：控制条只是全屏 UI 的
 * 一个零件，它缺席不等于全屏缺席（mount() 在没有可挂载宿主时会直接返回），
 * 而且它的增删不覆盖「退出全屏」这条路径。
 * 详见 speedToast.ts 里 isFullscreenActive() 的注释。
 */
export const FULLSCREEN_OVERLAY_ID = 'vsc-page-fullscreen-overlay';

/**
 * 全屏里的层叠顺序（从下到上）。
 *
 * 这三个值必须**同时**写在 CSS 与 JS 里：控制条、字幕、视频分别由
 * 不同的模块创建（runtimeStyles / fullscreenController），
 * 任何一边单独改都会让某一层被另一层压住。
 *
 * ⚠️ 32 位有符号整数的上限是 2147483647。CSS 的 z-index 用的是有符号
 * 32 位整数，写 2147483648 会溢出成 -2147483648（变成最小值，排在最底层）。
 * 所以真正的顶层（控制条）不能超过 2147483647。
 *
 * 分层理由：
 * - 视频在最后，是背景层，压低无所谓。
 * - 字幕必须在视频**之上**，否则被视频整个盖住（6.0.8 号称修好的问题，
 *   实测并未生效：字幕原本是 z-index:auto，DOM 顺序排在视频之后也没用）。
 * - 控制条在字幕之上：它出现时正好在画面底部，与字幕重叠，
 *   字幕被它盖住同样等于"字幕消失"。
 */
export const OVERLAY_Z_INDEX = 2147483642;
export const VIDEO_Z_INDEX = 2147483643;
export const STAGE_Z_INDEX = 2147483643;
export const SUBTITLE_Z_INDEX = 2147483644;
export const CONTROLS_Z_INDEX = 2147483645;
/** 页面级的一次性提示（调速胶囊、引导、接管失败）：永远在最顶。 */
export const NOTICE_Z_INDEX = 2147483647;

const styles = `
/* --- Page fullscreen overlay --- */

#${FULLSCREEN_OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: ${OVERLAY_Z_INDEX};
  display: none;
  background: #000;
}

#${FULLSCREEN_OVERLAY_ID}.vsc-active {
  display: block;
}

#vsc-page-fullscreen-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  z-index: ${STAGE_Z_INDEX};
}

.vsc-page-fullscreen-video {
  display: block;
  position: fixed;
  inset: 0;
  margin: auto;
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  object-fit: contain;
  z-index: ${VIDEO_Z_INDEX};
  background: #000;
}

.vsc-page-fullscreen-video--reparent {
  isolation: isolate;
}

.vsc-page-fullscreen-video--css-cover {
  /* 页面祖先带 transform/filter/opacity/contain 时会新建层叠上下文，
     把 fixed 视频关在里面；这一模式下 overlay 背板反而会盖住视频，
     所以只靠视频自身的黑底 + object-fit:contain 撑满视口。 */
  isolation: isolate;
}

/* --- Fullscreen controls ---
 *
 * 控制条的样式**不在这里**，在 controlsStyles.ts。
 *
 * 它必须单独放：控制条住在自己的 shadow root 里，页面里这份 <style>
 * 进不去 shadow tree，shadow tree 里的样式也出不来 —— 所以控制条必须
 * 自带一份完整样式。
 *
 * 为什么最后选了 shadow root：我们注入到**任意站点**的 DOM 里，站点的全局
 * CSS 会顺着继承和元素选择器把控制条彻底摧毁。实测一个"有自己的设计系统"
 * 的站点就能把控制条变成红色大块、按钮塌成 22x48、时间变 Comic Sans。
 * 逐属性重声明挡不住作者 !important；all: revert 也不行（只回退一层）。
 * shadow root 是**结构性**的边界，不是逐个属性地打补丁。
 *
 * ⚠️ 这一段曾经写的是"解法不是 shadow DOM"，那是迁移前的旧方案，
 * 早已作废。留着旧说法会让下一个人照着**已经废弃**的思路改代码。
 */

/* --- Speed toast (minimal) ---
 *
 * 同样需要隔离：提示挂在 body 上，页面的 div { ... !important } 会打穿它。
 */

#vsc-speed-toast {
  position: fixed;
  z-index: ${NOTICE_Z_INDEX};
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.66);
  color: #f8fafc;
  font-family: ${FONT_STACK};
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
}

#vsc-speed-toast.vsc-visible {
  opacity: 1;
}

/* --- First-run hint (one time only) --- */

#vsc-first-run-hint {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: ${NOTICE_Z_INDEX};
  max-width: min(560px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.88);
  color: #f8fafc;
  font-family: ${FONT_STACK};
  font-size: 13px;
  font-weight: 600;
  line-height: 1.7;
  text-align: center;
  white-space: pre-line;
  pointer-events: none;
  opacity: 0;
  transition: opacity 220ms ease;
}

#vsc-first-run-hint.vsc-visible {
  opacity: 1;
}

/* --- Takeover notice (reuses the speed toast's shape, sits at the bottom) --- */

#vsc-takeover-notice {
  position: fixed;
  z-index: ${NOTICE_Z_INDEX};
  max-width: min(420px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.66);
  color: #f8fafc;
  font-family: ${FONT_STACK};
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
  /*
   * 定位锚在 **bottom**（贴着视频下边缘），不是 top。
   *
   * 锚在 bottom 就不需要知道提示自己有多高 —— 而高度随文案语言变化
   * （中 154px / 英 269px），用 top + 高度就得两处同步维护，
   * 少一处就会错位。用 bottom 锚定则只依赖「视频下边缘」这一个量。
   */
  bottom: 16px;
  left: 16px;
}

#vsc-takeover-notice.vsc-visible {
  opacity: 1;
}

/* --- 读屏播报通道 ---
 *
 * 页面级的一次性提示（调速胶囊、首次引导、接管失败）全是纯视觉元素：
 * 它们只显示一个数字或一句话，读屏用户从中得不到任何信息。
 * 而这恰恰是这个产品**唯一**的反馈通道 —— 控制条 3 秒就隐藏，
 * 键盘调速后如果读屏用户听不到"现在 1.5x"，他无法确认任何操作生效了。
 *
 * 所以这里留一个**视觉上完全不可见**的 live region：它不显示任何东西，
 * 只把同样的文本喂给屏幕阅读器。屏幕阅读器读的是 aria-live 区域的内容，
 * 与它是否在视觉上可见无关 —— 这正是 aria-live 存在的意义。
 *
 * 尺寸必须压到 1px 并 clip：否则这个区域会在页面上占位置、挡住内容。
 * aria-hidden 必须**不**加在这上面：加了等于对读屏用户彻底隐形，
 * 那就与不做一模一样。
 */

#vsc-live-region {
  position: fixed;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  z-index: ${NOTICE_Z_INDEX};
  pointer-events: none;
}

/* --- 降低动效 ---
 *
 * 前庭功能障碍用户对动画敏感（WCAG 2.3.3）。我们的动画只有淡入淡出与
 * 几像素的位移 —— 视觉上很轻，但规则就是规则：用户声明了"减少动效"，
 * 我们就该把过渡关掉，而不是替用户判断"这个动画够轻"。
 *
 * 注意用的是 transition 而不是 animation：我们没有 keyframes 动画，
 * 关掉 transition 就能让所有淡入淡出变成瞬时切换。
 */

@media (prefers-reduced-motion: reduce) {
  #vsc-speed-toast,
  #vsc-first-run-hint,
  #vsc-takeover-notice {
    transition: none !important;
  }
}
`;

// 缓存已注入的节点：仅靠 document.getElementById 只能确认「现在在文档里」，
// 但被移除后还想知道要不要重建，所以持引用 + isConnected 判定（与 speedToast 同思路）。
let styleElement: HTMLStyleElement | null = null;
let styleWatcher: MutationObserver | null = null;

const injectStyles = () => {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styles;
  document.documentElement.appendChild(style);
  styleElement = style;
};

export const installRuntimeStyles = () => {
  // 自愈：SPA 重建、站点清理外来节点都可能把 style 摘掉；脱离文档就重建，
  // 否则 overlay/controls 会退化成无定位样式（position 从 fixed 变 static）。
  if (styleElement && styleElement.isConnected) {
    return;
  }

  injectStyles();

  // 被移除后不一定再有人调用本函数（全屏期间用户可能不再操作），
  // 只靠调用时检查不够；挂一个轻量观察者盯 html 的直接子节点，
  // 发现样式脱离文档立刻重注入。只 observe childList、不递归，开销可忽略。
  if (!styleWatcher) {
    styleWatcher = new MutationObserver(() => {
      if (styleElement && !styleElement.isConnected) {
        injectStyles();
      }
    });
    styleWatcher.observe(document.documentElement, { childList: true });
  }
};
