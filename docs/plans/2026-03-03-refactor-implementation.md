# Video Speed Controller v4.0 - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Chrome 视频速度控制器重构为 React + TypeScript 版本，实现科幻感网页全屏功能

**Architecture:** 采用 React 组件化架构，核心逻辑与 UI 分离，使用 Zustand 管理状态，Framer Motion 实现动画

**Tech Stack:** React 18, TypeScript 5, Tailwind CSS, Framer Motion, Zustand, Vite, CRXJS

---

## 阶段 1: 项目初始化

### Task 1: 初始化 Vite + React + TypeScript 项目

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

**Step 1: 创建 package.json**

```json
{
  "name": "video-speed-controller",
  "version": "4.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "framer-motion": "^11.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

**Step 2: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'index.html'),
        options: resolve(__dirname, 'options.html'),
      },
    },
  },
});
```

**Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Step 4: 创建 tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './options.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: '#00f3ff',
          purple: '#bc13fe',
          pink: '#ff00ff',
        },
      },
    },
  },
  plugins: [],
};
```

**Step 5: 创建 postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

### Task 2: 创建 Chrome 扩展入口文件

**Files:**
- Create: `manifest.json`
- Create: `index.html` (content script 入口)
- Create: `options.html` (设置页面入口)

**Step 1: 创建 manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Video Speed Controller",
  "version": "4.0.0",
  "description": "Control video playback speed with keyboard shortcuts",
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_title": "Video Speed Controller"
  },
  "background": {
    "service_worker": "src/background.ts"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.tsx"],
      "run_at": "document_end"
    }
  ],
  "options_page": "options.html"
}
```

**Step 2: 创建 index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/content.tsx"></script>
</body>
</html>
```

**Step 3: 创建 options.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/options.tsx"></script>
</body>
</html>
```

---

### Task 3: 创建基础 React 组件结构

**Files:**
- Create: `src/main.tsx`
- Create: `src/content.tsx`
- Create: `src/options.tsx`
- Create: `src/App.tsx`

**Step 1: 创建 src/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 2: 创建 src/content.tsx (Content Script 入口)**

```typescript
import { createRoot } from 'react-dom/client';
import ContentApp from './components/ContentApp';
import './styles/globals.css';

// 创建 Shadow DOM 容器
const container = document.createElement('div');
container.id = 'vsc-root';
document.body.appendChild(container);

const shadowRoot = container.attachShadow({ mode: 'open' });

// 注入样式
const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');
`;
shadowRoot.appendChild(style);

// 创建 React 根
const root = createRoot(shadowRoot);
root.render(<ContentApp />);
```

**Step 3: 创建 src/options.tsx**

```typescript
import { createRoot } from 'react-dom/client';
import OptionsPage from './components/OptionsPage';

const root = createRoot(document.getElementById('root')!);
root.render(<OptionsPage />);
```

**Step 4: 创建 src/App.tsx**

```typescript
export default function App() {
  return null;
}
```

---

## 阶段 2: 核心逻辑实现

### Task 4: 实现 MediaDetector 核心模块

**Files:**
- Create: `src/core/mediaDetector.ts`
- Create: `src/core/__tests__/mediaDetector.test.ts`

**Step 1: 创建测试 src/core/__tests__/mediaDetector.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MediaDetector } from '../mediaDetector';

describe('MediaDetector', () => {
  let detector: MediaDetector;

  beforeEach(() => {
    detector = new MediaDetector();
  });

  it('should detect video elements', () => {
    document.body.innerHTML = '<video></video>';
    const media = detector.getAllMediaElements();
    expect(media).toHaveLength(1);
  });

  it('should return null when no media found', () => {
    document.body.innerHTML = '<div></div>';
    const media = detector.getCurrentMedia();
    expect(media).toBeNull();
  });
});
```

**Step 2: 实现 src/core/mediaDetector.ts**

```typescript
export class MediaDetector {
  private cache: Map<string, { element: HTMLMediaElement; timestamp: number }> = new Map();
  private cacheTimeout = 500;

  getAllMediaElements(): HTMLMediaElement[] {
    const videos = Array.from(document.querySelectorAll('video'));
    const audios = Array.from(document.querySelectorAll('audio'));
    return [...videos, ...audios];
  }

  getCurrentMedia(): HTMLMediaElement | null {
    const allMedia = this.getAllMediaElements();
    if (allMedia.length === 0) return null;

    // 优先返回正在全屏的视频
    const fullscreenVideo = allMedia.find(m =>
      m.closest('#vsc-lightbox-overlay')
    );
    if (fullscreenVideo) return fullscreenVideo;

    // 返回第一个可见的视频
    return allMedia.find(m => {
      const rect = m.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || allMedia[0];
  }
}

export const mediaDetector = new MediaDetector();
```

---

### Task 5: 实现 PlaybackController 核心模块

**Files:**
- Create: `src/core/playbackController.ts`
- Create: `src/core/__tests__/playbackController.test.ts`

**Step 1: 创建测试**

```typescript
import { describe, it, expect } from 'vitest';
import { PlaybackController } from '../playbackController';

describe('PlaybackController', () => {
  it('should increase playback rate', () => {
    const mockMedia = { playbackRate: 1.0, volume: 1.0 };
    const controller = new PlaybackController();

    controller.setSpeed(mockMedia as any, 'increase');
    expect(mockMedia.playbackRate).toBe(1.1);
  });

  it('should reset speed to 1.0', () => {
    const mockMedia = { playbackRate: 2.0 };
    const controller = new PlaybackController();

    controller.setSpeed(mockMedia as any, 'reset');
    expect(mockMedia.playbackRate).toBe(1.0);
  });

  it('should cap speed at 16', () => {
    const mockMedia = { playbackRate: 15.9 };
    const controller = new PlaybackController();

    controller.setSpeed(mockMedia as any, 'increase');
    expect(mockMedia.playbackRate).toBe(16);
  });
});
```

**Step 2: 实现 src/core/playbackController.ts**

```typescript
export type SpeedAction = 'increase' | 'decrease' | 'reset';

export class PlaybackController {
  setSpeed(media: HTMLMediaElement, action: SpeedAction): number {
    let newSpeed: number;

    switch (action) {
      case 'increase':
        newSpeed = Math.min(media.playbackRate + 0.1, 16);
        break;
      case 'decrease':
        newSpeed = Math.max(media.playbackRate - 0.1, 0.1);
        break;
      case 'reset':
        newSpeed = 1.0;
        break;
    }

    media.playbackRate = newSpeed;
    return newSpeed;
  }

  setVolume(media: HTMLMediaElement, direction: 'up' | 'down', step = 0.1): number {
    const newVolume = direction === 'up'
      ? Math.min(media.volume + step, 1)
      : Math.max(media.volume - step, 0);

    media.volume = newVolume;
    return newVolume;
  }

  toggleMute(media: HTMLMediaElement): boolean {
    media.muted = !media.muted;
    return media.muted;
  }

  async togglePlayPause(media: HTMLMediaElement): Promise<void> {
    if (media.paused) {
      await media.play();
    } else {
      media.pause();
    }
  }

  seek(media: HTMLMediaElement, seconds: number): number {
    const newTime = Math.max(0, Math.min(media.duration, media.currentTime + seconds));
    media.currentTime = newTime;
    return newTime;
  }
}

export const playbackController = new PlaybackController();
```

---

### Task 6: 实现 KeyboardHandler 核心模块

**Files:**
- Create: `src/core/keyboardHandler.ts`
- Create: `src/core/types.ts`

**Step 1: 创建类型定义 src/core/types.ts**

```typescript
export interface Shortcut {
  action: string;
  key: string;
  description: string;
}

export interface ShortcutSettings {
  increaseSpeed: string;
  decreaseSpeed: string;
  resetSpeed: string;
  playPause: string;
  fullscreen: string;
  seekForward: string;
  seekBackward: string;
  volumeUp: string;
  volumeDown: string;
  muteToggle: string;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  increaseSpeed: '=',
  decreaseSpeed: '-',
  resetSpeed: '0',
  playPause: ' ',
  fullscreen: 'f',
  seekForward: 'ArrowRight',
  seekBackward: 'ArrowLeft',
  volumeUp: '[',
  volumeDown: ']',
  muteToggle: 'm',
};
```

**Step 2: 实现 src/core/keyboardHandler.ts**

```typescript
import { mediaDetector } from './mediaDetector';
import { playbackController, SpeedAction } from './playbackController';
import { ShortcutSettings, DEFAULT_SHORTCUTS } from './types';

export class KeyboardHandler {
  private shortcuts: ShortcutSettings;
  private listeners: Map<string, (media: HTMLMediaElement) => void> = new Map();

  constructor(shortcuts: ShortcutSettings = DEFAULT_SHORTCUTS) {
    this.shortcuts = shortcuts;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.listeners.set(this.shortcuts.increaseSpeed, (media) =>
      playbackController.setSpeed(media, 'increase')
    );
    this.listeners.set(this.shortcuts.decreaseSpeed, (media) =>
      playbackController.setSpeed(media, 'decrease')
    );
    this.listeners.set(this.shortcuts.resetSpeed, (media) =>
      playbackController.setSpeed(media, 'reset')
    );
    this.listeners.set(this.shortcuts.playPause, (media) =>
      playbackController.togglePlayPause(media)
    );
    this.listeners.set(this.shortcuts.volumeUp, (media) =>
      playbackController.setVolume(media, 'up')
    );
    this.listeners.set(this.shortcuts.volumeDown, (media) =>
      playbackController.setVolume(media, 'down')
    );
    this.listeners.set(this.shortcuts.muteToggle, (media) =>
      playbackController.toggleMute(media)
    );
    this.listeners.set(this.shortcuts.seekForward, (media) =>
      playbackController.seek(media, 10)
    );
    this.listeners.set(this.shortcuts.seekBackward, (media) =>
      playbackController.seek(media, -10)
    );
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    const media = mediaDetector.getCurrentMedia();
    if (!media) return false;

    // 忽略在输入框中的按键
    if (event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement) {
      return false;
    }

    const handler = this.listeners.get(event.key);
    if (handler) {
      event.preventDefault();
      handler(media);
      return true;
    }

    return false;
  }

  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  updateShortcuts(shortcuts: ShortcutSettings) {
    this.shortcuts = shortcuts;
    this.setupHandlers();
  }
}
```

---

## 阶段 3: 状态管理

### Task 7: 创建 Zustand Stores

**Files:**
- Create: `src/stores/mediaStore.ts`
- Create: `src/stores/settingsStore.ts`
- Create: `src/stores/uiStore.ts`

**Step 1: 创建 src/stores/mediaStore.ts**

```typescript
import { create } from 'zustand';

interface MediaState {
  currentMedia: HTMLMediaElement | null;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  setCurrentMedia: (media: HTMLMediaElement | null) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  currentMedia: null,
  playbackRate: 1.0,
  volume: 1.0,
  isMuted: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,

  setCurrentMedia: (media) => set({ currentMedia: media }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setVolume: (volume) => set({ volume }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
}));
```

**Step 2: 创建 src/stores/settingsStore.ts**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ShortcutSettings, DEFAULT_SHORTCUTS } from '../core/types';

interface SettingsState {
  shortcuts: ShortcutSettings;
  presets: number[];

  updateShortcut: (key: keyof ShortcutSettings, value: string) => void;
  resetShortcuts: () => void;
  setPresets: (presets: number[]) => void;
  addPreset: (speed: number) => void;
  removePreset: (speed: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      shortcuts: DEFAULT_SHORTCUTS,
      presets: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0],

      updateShortcut: (key, value) =>
        set((state) => ({
          shortcuts: { ...state.shortcuts, [key]: value },
        })),

      resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),

      setPresets: (presets) => set({ presets }),

      addPreset: (speed) =>
        set((state) => ({
          presets: [...new Set([...state.presets, speed])].sort((a, b) => a - b),
        })),

      removePreset: (speed) =>
        set((state) => ({
          presets: state.presets.filter((p) => p !== speed),
        })),
    }),
    {
      name: 'vsc-settings',
    }
  )
);
```

**Step 3: 创建 src/stores/uiStore.ts**

```typescript
import { create } from 'zustand';

type HUDType = 'speed' | 'volume' | 'seek' | 'mute' | null;

interface UIState {
  isFullscreen: boolean;
  showControls: boolean;
  hudVisible: boolean;
  hudType: HUDType;
  hudValue: number;

  setFullscreen: (fullscreen: boolean) => void;
  setShowControls: (show: boolean) => void;
  showHUD: (type: HUDType, value: number) => void;
  hideHUD: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isFullscreen: false,
  showControls: true,
  hudVisible: false,
  hudType: null,
  hudValue: 0,

  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  setShowControls: (show) => set({ showControls: show }),

  showHUD: (type, value) => {
    set({ hudVisible: true, hudType: type, hudValue: value });

    // 2秒后自动隐藏
    setTimeout(() => {
      set({ hudVisible: false, hudType: null });
    }, 2000);
  },

  hideHUD: () => set({ hudVisible: false, hudType: null }),
}));
```

---

## 阶段 4: React 组件实现

### Task 8: 实现 Lightbox 全屏组件

**Files:**
- Create: `src/components/Lightbox/Lightbox.tsx`
- Create: `src/components/Lightbox/Controls.tsx`
- Create: `src/components/Lightbox/ProgressBar.tsx`
- Create: `src/components/Lightbox/VolumeSlider.tsx`

**Step 1: 创建 Lightbox.tsx**

```typescript
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import { useMediaStore } from '../../stores/mediaStore';
import Controls from './Controls';

export default function Lightbox() {
  const { isFullscreen, showControls, setShowControls } = useUIStore();
  const { currentMedia } = useMediaStore();

  if (!isFullscreen || !currentMedia) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999999] bg-black"
      onMouseMove={() => setShowControls(true)}
    >
      {/* 霓虹边框效果 */}
      <div className="absolute inset-4 border-2 border-neon-cyan/30 rounded-lg shadow-[0_0_30px_rgba(0,243,255,0.3)]" />

      {/* 视频容器 */}
      <div className="absolute inset-8 flex items-center justify-center">
        <video
          ref={(el) => {
            if (el) useMediaStore.getState().setCurrentMedia(el);
          }}
          className="max-w-full max-h-full object-contain"
          src={(currentMedia as any).src}
          controls={false}
          autoPlay
        />
      </div>

      {/* 控制栏 */}
      <AnimatePresence>
        {showControls && <Controls />}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Step 2: 创建 Controls.tsx**

```typescript
import { motion } from 'framer-motion';
import { useMediaStore } from '../../stores/mediaStore';
import { useUIStore } from '../../stores/uiStore';
import ProgressBar from './ProgressBar';
import VolumeSlider from './VolumeSlider';

export default function Controls() {
  const { isPlaying, playbackRate, volume, isMuted, currentTime, duration } = useMediaStore();
  const { setFullscreen } = useUIStore();

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25 }}
      className="absolute bottom-0 left-0 right-0 p-6"
    >
      {/* 毛玻璃背景 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />

      <div className="relative flex items-center gap-4">
        {/* 播放/暂停 */}
        <button className="text-white hover:text-neon-cyan transition-colors">
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* 进度条 */}
        <div className="flex-1">
          <ProgressBar />
        </div>

        {/* 时间 */}
        <span className="text-white font-mono text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* 音量 */}
        <VolumeSlider />

        {/* 速度 */}
        <button className="text-neon-cyan font-bold font-['Orbitron'] min-w-[60px]">
          {playbackRate.toFixed(1)}x
        </button>

        {/* 退出全屏 */}
        <button
          onClick={() => setFullscreen(false)}
          className="text-white hover:text-neon-pink transition-colors"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
```

**Step 3: 创建 ProgressBar.tsx**

```typescript
import { motion } from 'framer-motion';
import { useMediaStore } from '../../stores/mediaStore';

export default function ProgressBar() {
  const { currentTime, duration, setCurrentTime } = useMediaStore();

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-2 bg-white/20 rounded-full cursor-pointer relative overflow-hidden">
      <motion.div
        className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-neon-cyan to-neon-purple"
        style={{ width: `${progress}%` }}
      />
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
      />
    </div>
  );
}
```

**Step 4: 创建 VolumeSlider.tsx**

```typescript
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaStore } from '../../stores/mediaStore';

export default function VolumeSlider() {
  const { volume, isMuted, setVolume, toggleMute } = useMediaStore();
  const [showSlider, setShowSlider] = useState(false);

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      <button
        onClick={toggleMute}
        className="text-white hover:text-neon-cyan transition-colors"
      >
        {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
      </button>

      <AnimatePresence>
        {showSlider && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 80, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="ml-2 overflow-hidden"
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full accent-neon-cyan"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

### Task 9: 实现 HUD 指示器组件

**Files:**
- Create: `src/components/HUD/HUD.tsx`
- Create: `src/components/HUD/SpeedDisplay.tsx`

**Step 1: 创建 HUD.tsx**

```typescript
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import SpeedDisplay from './SpeedDisplay';

export default function HUD() {
  const { hudVisible, hudType, hudValue } = useUIStore();

  return (
    <AnimatePresence>
      {hudVisible && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', damping: 15 }}
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-[999998]"
        >
          <div className="bg-black/80 backdrop-blur-sm px-12 py-8 rounded-2xl border border-neon-cyan/50 shadow-[0_0_50px_rgba(0,243,255,0.4)]">
            {hudType === 'speed' && <SpeedDisplay value={hudValue} />}
            {hudType === 'volume' && <div className="text-white text-4xl font-['Orbitron']">{Math.round(hudValue * 100)}%</div>}
            {hudType === 'seek' && <div className="text-white text-4xl font-['Orbitron']">{hudValue > 0 ? '⏩' : '⏪'} {Math.abs(hudValue)}s</div>}
            {hudType === 'mute' && <div className="text-white text-4xl font-['Orbitron']">{hudValue ? '🔇' : '🔊'}</div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: 创建 SpeedDisplay.tsx**

```typescript
import { motion } from 'framer-motion';

interface Props {
  value: number;
}

export default function SpeedDisplay({ value }: Props) {
  return (
    <div className="flex items-center gap-4">
      <motion.span
        key={value}
        initial={{ scale: 1.5, color: '#00f3ff' }}
        animate={{ scale: 1, color: '#ffffff' }}
        className="text-6xl font-bold font-['Orbitron'] text-white"
      >
        {value.toFixed(1)}
      </motion.span>
      <span className="text-4xl text-neon-cyan font-['Orbitron']">x</span>
    </div>
  );
}
```

---

### Task 10: 实现 ContentApp 主组件

**Files:**
- Create: `src/components/ContentApp.tsx`

**Step 1: 创建 ContentApp.tsx**

```typescript
import { useEffect } from 'react';
import { mediaDetector } from '../core/mediaDetector';
import { KeyboardHandler } from '../core/keyboardHandler';
import { playbackController } from '../core/playbackController';
import { useMediaStore } from '../stores/mediaStore';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import Lightbox from './Lightbox/Lightbox';
import HUD from './HUD/HUD';

export default function ContentApp() {
  const { setCurrentMedia, setPlaybackRate, setVolume, setIsPlaying, setCurrentTime, setDuration } = useMediaStore();
  const { showHUD, isFullscreen } = useUIStore();
  const { shortcuts } = useSettingsStore();

  useEffect(() => {
    const handler = new KeyboardHandler(shortcuts);
    handler.init();

    // 定期检测媒体元素
    const interval = setInterval(() => {
      const media = mediaDetector.getCurrentMedia();
      if (media) {
        setCurrentMedia(media);

        // 同步状态
        media.addEventListener('play', () => setIsPlaying(true));
        media.addEventListener('pause', () => setIsPlaying(false));
        media.addEventListener('timeupdate', () => setCurrentTime(media.currentTime));
        media.addEventListener('loadedmetadata', () => setDuration(media.duration));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [shortcuts]);

  return (
    <>
      <HUD />
      {isFullscreen && <Lightbox />}
    </>
  );
}
```

---

## 阶段 5: 设置页面

### Task 11: 实现设置页面

**Files:**
- Create: `src/components/OptionsPage.tsx`
- Create: `src/components/Settings/ShortcutEditor.tsx`

**Step 1: 创建 OptionsPage.tsx**

```typescript
import { useSettingsStore } from '../stores/settingsStore';
import ShortcutEditor from './Settings/ShortcutEditor';

export default function OptionsPage() {
  const { shortcuts, resetShortcuts, presets, addPreset, removePreset } = useSettingsStore();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8 font-['Orbitron'] text-neon-cyan">
        Video Speed Controller
      </h1>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">快捷键设置</h2>
        <ShortcutEditor shortcuts={shortcuts} />
        <button
          onClick={resetShortcuts}
          className="mt-4 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
        >
          重置为默认
        </button>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">速度预设</h2>
        <div className="flex gap-2 flex-wrap">
          {presets.map((speed) => (
            <button
              key={speed}
              onClick={() => removePreset(speed)}
              className="px-4 py-2 bg-neon-cyan/20 border border-neon-cyan rounded hover:bg-neon-cyan/40"
            >
              {speed}x
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          {[0.25, 0.5, 3, 4].map((speed) => (
            <button
              key={speed}
              onClick={() => addPreset(speed)}
              className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
            >
              + {speed}x
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

**Step 2: 创建 ShortcutEditor.tsx**

```typescript
import { useSettingsStore } from '../stores/settingsStore';
import { ShortcutSettings } from '../core/types';

interface Props {
  shortcuts: ShortcutSettings;
}

export default function ShortcutEditor({ shortcuts }: Props) {
  const { updateShortcut } = useSettingsStore();

  const labels: Record<keyof ShortcutSettings, string> = {
    increaseSpeed: '加速',
    decreaseSpeed: '减速',
    resetSpeed: '重置速度',
    playPause: '播放/暂停',
    fullscreen: '网页全屏',
    seekForward: '快进 10s',
    seekBackward: '快退 10s',
    volumeUp: '音量增加',
    volumeDown: '音量减少',
    muteToggle: '静音切换',
  };

  return (
    <div className="space-y-2">
      {(Object.keys(shortcuts) as Array<keyof ShortcutSettings>).map((key) => (
        <div key={key} className="flex items-center gap-4">
          <span className="w-32">{labels[key]}</span>
          <input
            type="text"
            value={shortcuts[key]}
            onChange={(e) => updateShortcut(key, e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded w-24 text-center font-mono"
          />
        </div>
      ))}
    </div>
  );
}
```

---

## 阶段 6: 样式和构建

### Task 12: 创建全局样式

**Files:**
- Create: `src/styles/globals.css`

**Step 1: 创建 src/styles/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');

:root {
  --neon-cyan: #00f3ff;
  --neon-purple: #bc13fe;
  --neon-pink: #ff00ff;
}

body {
  font-family: 'Orbitron', sans-serif;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #1a1a1a;
}

::-webkit-scrollbar-thumb {
  background: #00f3ff;
  border-radius: 4px;
}

/* 进度条自定义样式 */
input[type="range"] {
  -webkit-appearance: none;
  background: transparent;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #00f3ff;
  cursor: pointer;
  margin-top: -6px;
}

input[type="range"]::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}
```

---

### Task 13: 配置构建脚本

**Files:**
- Modify: `package.json`

**Step 1: 更新 package.json scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:ext": "npm run build && node scripts/build-ext.js",
    "preview": "vite preview"
  }
}
```

**Step 2: 创建 scripts/build-ext.js**

```javascript
import fs from 'fs';
import path from 'path';

const distDir = './dist';
const extDir = './extension';

// 复制必要文件
const files = ['manifest.json'];

files.forEach(file => {
  const src = path.join(distDir, file);
  const dest = path.join(extDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
});

console.log('Extension build complete!');
```

---

## 执行方式

**Plan complete and saved to `docs/plans/2026-03-03-refactor-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
