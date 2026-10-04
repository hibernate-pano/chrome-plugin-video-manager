const STYLE_ID = 'vsc-runtime-styles';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const styles = `
/* --- Page fullscreen overlay --- */

#vsc-page-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  display: none;
  background: #000;
}

#vsc-page-fullscreen-overlay.vsc-active {
  display: block;
}

#vsc-page-fullscreen-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  z-index: 2147483646;
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
  z-index: 2147483646;
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

/* --- Fullscreen controls --- */

#vsc-controls {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  padding: 22px 20px 14px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0));
  color: #f1f5f9;
  font-family: ${FONT_STACK};
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 180ms ease, transform 180ms ease;
  pointer-events: none;
}

#vsc-controls.vsc-ctl--visible {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.vsc-ctl__button {
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
  cursor: pointer;
}

.vsc-ctl__button:hover {
  background: rgba(255, 255, 255, 0.14);
}

.vsc-ctl__button:focus-visible {
  outline: 2px solid #67e8f9;
  outline-offset: 2px;
}

.vsc-ctl__button svg {
  width: 22px;
  height: 22px;
}

.vsc-ctl__time,
.vsc-ctl__speed {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgba(241, 245, 249, 0.92);
  white-space: nowrap;
}

.vsc-ctl__speed {
  min-width: 34px;
  text-align: center;
}

.vsc-ctl__range {
  -webkit-appearance: none;
  appearance: none;
  height: 16px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.vsc-ctl__range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    #67e8f9 0%,
    #67e8f9 var(--vsc-progress, 0%),
    rgba(255, 255, 255, 0.24) var(--vsc-progress, 0%),
    rgba(255, 255, 255, 0.24) 100%
  );
}

.vsc-ctl__range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border-radius: 50%;
  background: #f8fafc;
  border: none;
}

.vsc-ctl__range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.24);
}

.vsc-ctl__range::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: #67e8f9;
}

.vsc-ctl__range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  background: #f8fafc;
}

.vsc-ctl__range:focus-visible {
  outline: 2px solid #67e8f9;
  outline-offset: 2px;
}

.vsc-ctl__progress {
  flex: 1 1 auto;
  min-width: 0;
}

.vsc-ctl__volume {
  flex: none;
  width: 84px;
}

/* --- Speed toast (minimal) --- */

#vsc-speed-toast {
  position: fixed;
  z-index: 2147483647;
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
  z-index: 2147483647;
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

/* --- Takeover notice (reuses the speed toast's shape and corner) --- */

#vsc-takeover-notice {
  position: fixed;
  z-index: 2147483647;
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
}

#vsc-takeover-notice.vsc-visible {
  opacity: 1;
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
