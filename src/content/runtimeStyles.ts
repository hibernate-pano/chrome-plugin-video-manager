const STYLE_ID = 'vsc-runtime-styles';

const styles = `
#vsc-page-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  display: none;
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.12), transparent 34%),
    rgba(2, 6, 23, 0.98);
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
  /* isolation 只能在本元素自己身上新建层叠上下文，帮不了「跨过页面祖先的层叠上下文」。
     祖先带 transform/filter/opacity/contain/position+z-index 时，fixed 视频依然被关在里面。
     所以这一模式下不得再画不透明背板（见 fullscreenController.fallbackToCssCover）。 */
  isolation: isolate;
}

/* --- Target indicator (hover) --- */

/* 不画全框描边：全框在所有页面场景里都过于抢眼，信息由左上角胶囊承担。 */
#vsc-target-indicator {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 120ms ease, visibility 120ms ease;
}

#vsc-target-indicator.vsc-visible {
  opacity: 1;
  visibility: visible;
}

.vsc-target-indicator__pill {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.28);
  color: #e0f2fe;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  font-family: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
  white-space: nowrap;
}

#vsc-target-indicator[data-current='false'] .vsc-target-indicator__pill {
  border-color: rgba(100, 116, 139, 0.5);
  color: #cbd5e1;
}

.vsc-target-indicator__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
  flex: none;
}

#vsc-target-indicator[data-current='false'] .vsc-target-indicator__dot {
  background: #64748b;
}

/* --- Speed HUD (minimal) --- */

#vsc-speed-hud {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 2147483647;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(0, -6px, 0) scale(0.94);
  transform-origin: top left;
}

#vsc-speed-hud.vsc-visible {
  animation: vsc-hud-in 1400ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

#vsc-speed-hud[data-mode='playback'].vsc-visible {
  animation-duration: 800ms;
}

.vsc-hud__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(10px);
  font-family: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
}

.vsc-hud__value {
  display: flex;
  align-items: baseline;
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  color: #f8fafc;
  font-variant-numeric: tabular-nums;
}

.vsc-hud__unit {
  margin-left: 2px;
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
}

.vsc-hud__glyph {
  display: none;
  font-size: 18px;
  line-height: 1;
  color: #e2e8f0;
}

#vsc-speed-hud[data-mode='playback'] .vsc-hud__glyph {
  display: inline;
}

#vsc-speed-hud[data-mode='playback'] .vsc-hud__trend {
  display: none;
}

.vsc-hud__trend {
  font-size: 13px;
  line-height: 1;
}

#vsc-speed-hud[data-trend='up'] .vsc-hud__trend {
  color: #7dd3fc;
}

#vsc-speed-hud[data-trend='down'] .vsc-hud__trend {
  color: #f9a8d4;
}

@keyframes vsc-hud-in {
  0% {
    opacity: 0;
    transform: translate3d(0, -6px, 0) scale(0.94);
  }

  14% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }

  86% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate3d(0, -4px, 0) scale(0.97);
  }
}
`;

export const installRuntimeStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styles;
  document.documentElement.appendChild(style);
};
