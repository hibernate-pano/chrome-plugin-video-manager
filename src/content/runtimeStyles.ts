const STYLE_ID = 'vsc-runtime-styles';

const styles = `
#vsc-page-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
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
  z-index: 2147483647;
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
  z-index: 2147483647;
  background: #000;
}

.vsc-page-fullscreen-video--reparent {
  isolation: isolate;
}

.vsc-page-fullscreen-video--css-cover {
  isolation: isolate;
}

#vsc-speed-hud {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 2147483647;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(0, 0, 0) scale(0.88);
  transform-origin: top left;
}

#vsc-speed-hud.vsc-visible {
  animation: vsc-hud-enter 1400ms cubic-bezier(0.2, 0.85, 0.2, 1) forwards;
}

.vsc-speed-hud__shell {
  position: relative;
  overflow: hidden;
  min-width: 188px;
  padding: 16px 18px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.82));
  box-shadow:
    0 0 0 1px rgba(125, 211, 252, 0.12),
    0 0 32px rgba(34, 211, 238, 0.16),
    0 18px 60px rgba(2, 6, 23, 0.58);
  backdrop-filter: blur(22px);
}

.vsc-speed-hud__shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
  background-size: 11px 11px;
  opacity: 0.28;
}

.vsc-speed-hud__shell::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 22%, rgba(255, 255, 255, 0.42) 50%, transparent 78%);
  transform: translateX(-140%);
}

#vsc-speed-hud.vsc-visible .vsc-speed-hud__shell::after {
  animation: vsc-hud-sweep 620ms ease-out;
}

#vsc-speed-hud[data-trend='up'] .vsc-speed-hud__shell {
  box-shadow:
    0 0 0 1px rgba(103, 232, 249, 0.18),
    0 0 34px rgba(34, 211, 238, 0.34),
    0 18px 60px rgba(8, 47, 73, 0.64);
}

#vsc-speed-hud[data-trend='down'] .vsc-speed-hud__shell {
  box-shadow:
    0 0 0 1px rgba(244, 114, 182, 0.16),
    0 0 34px rgba(236, 72, 153, 0.28),
    0 18px 60px rgba(76, 5, 25, 0.62);
}

.vsc-speed-hud__aura {
  position: absolute;
  inset: 0;
  opacity: 0.86;
}

#vsc-speed-hud[data-trend='up'] .vsc-speed-hud__aura {
  background: linear-gradient(90deg, rgba(103, 232, 249, 0.22), rgba(56, 189, 248, 0.14), transparent 72%);
}

#vsc-speed-hud[data-trend='down'] .vsc-speed-hud__aura {
  background: linear-gradient(90deg, rgba(244, 114, 182, 0.22), rgba(251, 146, 60, 0.14), transparent 72%);
}

.vsc-speed-hud__header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 9px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.34);
}

.vsc-speed-hud__body {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.vsc-speed-hud__value {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.vsc-speed-hud__rate {
  margin: 0;
  font-family: 'Orbitron', 'SFMono-Regular', Consolas, monospace;
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
  color: rgba(248, 250, 252, 0.98);
  text-shadow: 0 0 14px rgba(255, 255, 255, 0.18);
}

.vsc-speed-hud__unit {
  padding-bottom: 4px;
  font-family: 'Orbitron', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.8rem;
  color: rgba(186, 230, 253, 0.9);
}

.vsc-speed-hud__meta {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.68);
}

.vsc-speed-hud__trend {
  font-size: 11px;
  line-height: 1;
}

#vsc-speed-hud[data-trend='up'] .vsc-speed-hud__trend,
#vsc-speed-hud[data-trend='up'] .vsc-speed-hud__unit {
  color: rgba(165, 243, 252, 0.96);
}

#vsc-speed-hud[data-trend='down'] .vsc-speed-hud__trend,
#vsc-speed-hud[data-trend='down'] .vsc-speed-hud__unit {
  color: rgba(251, 207, 232, 0.96);
}

.vsc-speed-hud__orb {
  position: relative;
  width: 38px;
  height: 38px;
  margin-bottom: 4px;
}

.vsc-speed-hud__orb::before,
.vsc-speed-hud__orb::after {
  content: '';
  position: absolute;
  border-radius: 999px;
}

.vsc-speed-hud__orb::before {
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
}

.vsc-speed-hud__orb::after {
  inset: 8px;
}

#vsc-speed-hud[data-trend='up'] .vsc-speed-hud__orb::after {
  background: linear-gradient(135deg, rgba(165, 243, 252, 0.96), rgba(56, 189, 248, 0.92));
  box-shadow: 0 0 22px rgba(34, 211, 238, 0.45);
}

#vsc-speed-hud[data-trend='down'] .vsc-speed-hud__orb::after {
  background: linear-gradient(135deg, rgba(251, 207, 232, 0.98), rgba(249, 115, 22, 0.9));
  box-shadow: 0 0 22px rgba(236, 72, 153, 0.4);
}

.vsc-speed-hud__ring {
  position: absolute;
  inset: 3px;
  border-radius: 999px;
  opacity: 0;
}

#vsc-speed-hud[data-trend='up'] .vsc-speed-hud__ring {
  border: 1px solid rgba(165, 243, 252, 0.82);
}

#vsc-speed-hud[data-trend='down'] .vsc-speed-hud__ring {
  border: 1px solid rgba(251, 207, 232, 0.82);
}

#vsc-speed-hud.vsc-visible .vsc-speed-hud__ring {
  animation: vsc-hud-ring 640ms ease-out;
}

@keyframes vsc-hud-enter {
  0% {
    opacity: 0;
    transform: translate3d(0, -10px, 0) scale(0.88);
  }

  18% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1.02);
  }

  82% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate3d(0, -6px, 0) scale(0.96);
  }
}

@keyframes vsc-hud-sweep {
  from {
    transform: translateX(-140%);
  }

  to {
    transform: translateX(180%);
  }
}

@keyframes vsc-hud-ring {
  0% {
    opacity: 0.8;
    transform: scale(0.58);
  }

  100% {
    opacity: 0;
    transform: scale(1.95);
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
