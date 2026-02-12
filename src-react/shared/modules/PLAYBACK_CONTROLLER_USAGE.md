# PlaybackController 使用指南

## 概述

`PlaybackController` 是一个 TypeScript 模块，用于控制 HTML 媒体元素（video/audio）的播放行为。它提供了速度、音量、跳转和播放/暂停控制，并自动通过 HUD Store 显示视觉反馈。

## 快速开始

### 基本导入

```typescript
import { PlaybackController } from '@/shared/modules';
// 或
import { defaultPlaybackController } from '@/shared/modules';
```

### 创建实例

```typescript
// 使用默认配置
const controller = new PlaybackController();

// 使用自定义配置
const controller = new PlaybackController({
  speedStep: 0.25,    // 速度调整步长
  volumeStep: 0.05,   // 音量调整步长
  seekStep: 10,       // 跳转步长（秒）
  minSpeed: 0.25,     // 最小速度
  maxSpeed: 4,        // 最大速度
});

// 使用工厂函数
import { createPlaybackController } from '@/shared/modules';
const controller = createPlaybackController({ speedStep: 0.2 });

// 使用默认单例
import { defaultPlaybackController } from '@/shared/modules';
defaultPlaybackController.handleSpeed(video, 'increase');
```

## API 参考

### 播放速度控制

#### handleSpeed(media, action)

调整播放速度。

```typescript
controller.handleSpeed(video, 'increase');  // 增加 0.1x
controller.handleSpeed(video, 'decrease');  // 减少 0.1x
controller.handleSpeed(video, 'reset');     // 重置为 1.0x
```

**参数**:
- `media: HTMLMediaElement` - 媒体元素
- `action: 'increase' | 'decrease' | 'reset'` - 动作类型

**HUD 显示**:
- `increase/decrease`: 显示当前速度
- `reset`: 显示重置指示器

#### setSpeed(media, speed)

设置指定的播放速度。

```typescript
controller.setSpeed(video, 1.5);  // 设置为 1.5x
controller.setSpeed(video, 2.0);  // 设置为 2.0x
```

**参数**:
- `media: HTMLMediaElement` - 媒体元素
- `speed: number` - 目标速度（0.1-16）

**HUD 显示**: 显示设置的速度值

### 视频跳转控制

#### handleSeek(video, direction, step?)

快进或快退视频。

```typescript
controller.handleSeek(video, 'forward');      // 快进 5 秒（默认）
controller.handleSeek(video, 'backward');     // 快退 5 秒（默认）
controller.handleSeek(video, 'forward', 10);  // 快进 10 秒
```

**参数**:
- `video: HTMLVideoElement` - 视频元素
- `direction: 'forward' | 'backward'` - 跳转方向
- `step?: number` - 可选的步长（秒），默认使用配置中的值

**HUD 显示**: 显示跳转的秒数（正数为快进，负数为快退）

#### seekTo(media, time)

跳转到指定时间点。

```typescript
controller.seekTo(video, 30);   // 跳转到 30 秒
controller.seekTo(video, 120);  // 跳转到 2 分钟
```

**参数**:
- `media: HTMLMediaElement` - 媒体元素
- `time: number` - 目标时间（秒）

**HUD 显示**: 显示跳转的时间差

### 音量控制

#### handleVolume(media, direction, step?)

调整音量。

```typescript
controller.handleVolume(video, 'up');        // 增加 10%（默认）
controller.handleVolume(video, 'down');      // 减少 10%（默认）
controller.handleVolume(video, 'up', 0.05);  // 增加 5%
```

**参数**:
- `media: HTMLMediaElement` - 媒体元素
- `direction: 'up' | 'down'` - 调整方向
- `step?: number` - 可选的步长（0-1），默认使用配置中的值

**HUD 显示**: 显示音量百分比

#### setVolume(media, volume)

设置指定的音量。

```typescript
controller.setVolume(video, 0.8);  // 设置为 80%
controller.setVolume(video, 0.5);  // 设置为 50%
```

**参数**:
- `media: HTMLMediaElement` - 媒体元素
- `volume: number` - 目标音量（0-1）

**HUD 显示**: 显示音量百分比

#### toggleMute(media)

切换静音状态。

```typescript
controller.toggleMute(video);  // 切换静音/取消静音
```

**参数**:
- `media: HTMLMediaElement` - 媒体元素

**HUD 显示**:
- 静音时显示 0%
- 取消静音时显示当前音量百分比

### 播放/暂停控制

#### handlePlayPause(media)

切换播放/暂停状态。

```typescript
await controller.handlePlayPause(video);  // 切换播放/暂停
```

**参数**:
- `media: HTMLMediaElement` - 媒体元素

**返回**: `Promise<void>` - 异步操作完成后 resolve

**注意**: 此方法是异步的，因为 `play()` 返回 Promise

### 配置管理

#### updateConfig(config)

更新控制器配置。

```typescript
controller.updateConfig({
  speedStep: 0.2,
  volumeStep: 0.05,
});
```

**参数**:
- `config: Partial<PlaybackControllerConfig>` - 部分配置对象

#### getConfig()

获取当前配置。

```typescript
const config = controller.getConfig();
console.log(config.speedStep);  // 0.1
```

**返回**: `Readonly<Required<PlaybackControllerConfig>>` - 只读的完整配置对象

## 配置选项

```typescript
interface PlaybackControllerConfig {
  speedStep?: number;      // 速度调整步长（默认 0.1）
  volumeStep?: number;     // 音量调整步长（默认 0.1）
  seekStep?: number;       // 跳转步长（默认 5 秒）
  minSpeed?: number;       // 最小播放速度（默认 0.1）
  maxSpeed?: number;       // 最大播放速度（默认 16）
}
```

### 默认配置

```typescript
{
  speedStep: 0.1,
  volumeStep: 0.1,
  seekStep: 5,
  minSpeed: 0.1,
  maxSpeed: 16,
}
```

## 使用场景

### 1. 在键盘处理器中使用

```typescript
import { PlaybackController } from '@/shared/modules';
import { MediaDetector } from '@/shared/modules';

const controller = new PlaybackController();
const detector = new MediaDetector();

document.addEventListener('keydown', (e) => {
  const media = detector.getCurrentMedia();
  if (!media) return;

  switch (e.key) {
    case '=':
      controller.handleSpeed(media, 'increase');
      break;
    case '-':
      controller.handleSpeed(media, 'decrease');
      break;
    case '0':
      controller.handleSpeed(media, 'reset');
      break;
    case ' ':
      e.preventDefault();
      controller.handlePlayPause(media);
      break;
    case ']':
      controller.handleVolume(media, 'up');
      break;
    case '[':
      controller.handleVolume(media, 'down');
      break;
    case '.':
      controller.handleSeek(media as HTMLVideoElement, 'forward');
      break;
    case ',':
      controller.handleSeek(media as HTMLVideoElement, 'backward');
      break;
  }
});
```

### 2. 在 React 组件中使用

```typescript
import { useRef, useEffect } from 'react';
import { defaultPlaybackController } from '@/shared/modules';

function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleSpeedUp = () => {
    if (videoRef.current) {
      defaultPlaybackController.handleSpeed(videoRef.current, 'increase');
    }
  };

  const handleSpeedDown = () => {
    if (videoRef.current) {
      defaultPlaybackController.handleSpeed(videoRef.current, 'decrease');
    }
  };

  return (
    <div>
      <video ref={videoRef} src="video.mp4" />
      <button onClick={handleSpeedUp}>加速</button>
      <button onClick={handleSpeedDown}>减速</button>
    </div>
  );
}
```

### 3. 在 Lightbox 控制条中使用

```typescript
import { PlaybackController } from '@/shared/modules';

function LightboxControls({ video }: { video: HTMLVideoElement }) {
  const controller = new PlaybackController();

  return (
    <div className="controls">
      <button onClick={() => controller.handlePlayPause(video)}>
        播放/暂停
      </button>
      <button onClick={() => controller.handleSeek(video, 'backward', 10)}>
        -10s
      </button>
      <button onClick={() => controller.handleSeek(video, 'forward', 10)}>
        +10s
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        onChange={(e) => controller.setVolume(video, parseFloat(e.target.value))}
      />
    </div>
  );
}
```

## HUD 集成

所有控制操作都会自动通过 HUD Store 显示视觉反馈：

- **速度变化**: 显示当前播放速度（如 "1.5x"）
- **音量变化**: 显示音量百分比（如 "80%"）
- **跳转操作**: 显示跳转秒数（如 "+5s" 或 "-5s"）
- **重置操作**: 显示重置指示器

HUD 会自动在 2 秒后消失（可通过 HUD Store 配置调整）。

## 错误处理

所有方法都包含完善的错误处理：

- 输入参数验证
- Try-catch 包裹所有操作
- 控制台错误日志
- 静默失败，不影响用户体验

```typescript
// 无效的速度值会被拒绝
controller.setSpeed(video, NaN);      // 不会执行，输出警告
controller.setSpeed(video, -1);       // 不会执行，输出警告
controller.setSpeed(video, 20);       // 不会执行，输出警告（超过最大值）

// 无效的音量值会被拒绝
controller.setVolume(video, 1.5);     // 不会执行，输出警告
controller.setVolume(video, -0.1);    // 不会执行，输出警告

// 无效的时间值会被拒绝
controller.seekTo(video, -5);         // 不会执行，输出警告
controller.seekTo(video, NaN);        // 不会执行，输出警告
```

## 最佳实践

1. **使用单例**: 对于简单场景，使用 `defaultPlaybackController` 单例
2. **自定义配置**: 对于特殊需求，创建自定义配置的实例
3. **错误处理**: 虽然模块内部有错误处理，但建议在调用前检查媒体元素是否存在
4. **异步操作**: `handlePlayPause` 是异步的，需要使用 `await` 或 `.then()`
5. **类型安全**: 充分利用 TypeScript 类型定义，避免运行时错误

## 类型定义

```typescript
// 导出的类型
export type SpeedAction = 'increase' | 'decrease' | 'reset';
export type VolumeDirection = 'up' | 'down';
export type SeekDirection = 'forward' | 'backward';

export interface PlaybackControllerConfig {
  speedStep?: number;
  volumeStep?: number;
  seekStep?: number;
  minSpeed?: number;
  maxSpeed?: number;
}

// 使用示例
import type { SpeedAction, PlaybackControllerConfig } from '@/shared/modules';

const action: SpeedAction = 'increase';
const config: PlaybackControllerConfig = {
  speedStep: 0.25,
};
```

## 相关文档

- [HUD Store 文档](../stores/hudStore.ts)
- [Media Detector 文档](./MEDIA_DETECTOR_USAGE.md)
- [Keyboard Handler 文档](./KEYBOARD_HANDLER_USAGE.md)
- [任务完成报告](../../TASK_28_COMPLETION.md)

## 常见问题

### Q: 为什么 HUD 没有显示？

A: 确保 HUD Store 已正确初始化，并且 HUD 组件已挂载到页面上。

### Q: 如何自定义 HUD 显示时间？

A: 通过 HUD Store 的 `updateConfig` 方法调整 `displayDuration`：

```typescript
import { useHUDStore } from '@/shared/stores';

useHUDStore.getState().updateConfig({
  displayDuration: 3000,  // 3 秒
});
```

### Q: 可以禁用 HUD 显示吗？

A: 不建议禁用，但可以通过修改 HUD Store 或创建不调用 HUD 的自定义方法。

### Q: 如何处理多个媒体元素？

A: 每次调用方法时传入不同的媒体元素即可：

```typescript
const video1 = document.querySelector('#video1');
const video2 = document.querySelector('#video2');

controller.handleSpeed(video1, 'increase');
controller.handleSpeed(video2, 'increase');
```

### Q: 播放失败如何处理？

A: `handlePlayPause` 会自动捕获播放失败的错误并记录到控制台，不会抛出异常。

## 总结

`PlaybackController` 提供了完整的媒体播放控制功能，具有：

- ✅ 完整的 TypeScript 类型支持
- ✅ 灵活的配置选项
- ✅ 自动的 HUD 视觉反馈
- ✅ 完善的错误处理
- ✅ 简单易用的 API
- ✅ 单例和工厂模式支持

适用于各种媒体控制场景，从简单的播放控制到复杂的自定义播放器。
