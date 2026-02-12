import React from 'react';
import ReactDOM from 'react-dom/client';
import { OptionsApp } from './OptionsApp';
import {
  initAnimationVariables,
  updateAnimationSpeed,
  watchReducedMotion,
} from '../shared/utils/animationVariables';
import { useSettingsStore } from '../shared/stores/settingsStore';
import './styles/index.css';

// 初始化动画系统
initAnimationVariables();

// 监听 prefers-reduced-motion 变化
watchReducedMotion((matches) => {
  if (matches) {
    updateAnimationSpeed('off');
  } else {
    const currentSpeed = useSettingsStore.getState().animationSpeed;
    updateAnimationSpeed(currentSpeed);
  }
});

// 监听用户动画速度设置变化
useSettingsStore.subscribe(
  (state) => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (!prefersReducedMotion) {
      updateAnimationSpeed(state.animationSpeed);
    }
  }
);

// 应用初始动画速度
const initialSpeed = useSettingsStore.getState().animationSpeed;
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

if (prefersReducedMotion) {
  updateAnimationSpeed('off');
} else {
  updateAnimationSpeed(initialSpeed);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
