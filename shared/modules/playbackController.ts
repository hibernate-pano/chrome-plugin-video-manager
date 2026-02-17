/**
 * 播放控制模块
 * 提供媒体元素的播放控制功能，包括速度、音量、跳转和播放/暂停
 * @module shared/modules/playbackController
 */

import { useHUDStore } from '../stores/hudStore';

/**
 * 播放速度控制动作类型
 */
export type SpeedAction = 'increase' | 'decrease' | 'reset';

/**
 * 音量控制方向类型
 */
export type VolumeDirection = 'up' | 'down';

/**
 * 跳转方向类型
 */
export type SeekDirection = 'forward' | 'backward';

/**
 * 播放控制器配置接口
 */
export interface PlaybackControllerConfig {
  /** 速度调整步长 */
  speedStep?: number;
  /** 音量调整步长（0-1） */
  volumeStep?: number;
  /** 跳转步长（秒） */
  seekStep?: number;
  /** 最小播放速度 */
  minSpeed?: number;
  /** 最大播放速度 */
  maxSpeed?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<PlaybackControllerConfig> = {
  speedStep: 0.1,
  volumeStep: 0.1,
  seekStep: 5,
  minSpeed: 0.1,
  maxSpeed: 16,
};

/**
 * 播放控制器类
 * 负责处理媒体元素的各种播放控制操作
 */
export class PlaybackController {
  private config: Required<PlaybackControllerConfig>;

  /**
   * 构造函数
   * @param config 可选的配置对象
   */
  constructor(config?: PlaybackControllerConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * 更新配置
   * @param config 部分配置对象
   */
  updateConfig(config: Partial<PlaybackControllerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * 处理播放速度控制
   * @param media 媒体元素
   * @param action 动作类型（increase/decrease/reset）
   */
  handleSpeed(media: HTMLMediaElement, action: SpeedAction): void {
    try {
      // 获取当前播放速度，确保是有效数字
      const currentRate =
        typeof media.playbackRate === 'number' && isFinite(media.playbackRate)
          ? media.playbackRate
          : 1.0;

      let newSpeed: number;

      // 根据动作类型计算新速度
      switch (action) {
        case 'increase':
          newSpeed = Math.min(
            currentRate + this.config.speedStep,
            this.config.maxSpeed
          );
          break;
        case 'decrease':
          newSpeed = Math.max(
            currentRate - this.config.speedStep,
            this.config.minSpeed
          );
          break;
        case 'reset':
          newSpeed = 1.0;
          break;
        default:
          console.warn('未知的速度控制动作:', action);
          return;
      }

      // 验证新速度是否有效
      if (typeof newSpeed === 'number' && isFinite(newSpeed) && newSpeed > 0) {
        media.playbackRate = newSpeed;

        // 使用 HUD Store 显示速度变化
        const hudStore = useHUDStore.getState();
        if (action === 'reset') {
          hudStore.show({
            type: 'reset',
            value: newSpeed,
          });
        } else {
          hudStore.show({
            type: 'speed',
            value: newSpeed,
          });
        }
      } else {
        console.warn('计算出的播放速度无效:', newSpeed, '使用默认速度 1.0');
        media.playbackRate = 1.0;

        const hudStore = useHUDStore.getState();
        hudStore.show({
          type: 'speed',
          value: 1.0,
        });
      }
    } catch (error) {
      console.error('处理播放速度失败:', error);
    }
  }

  /**
   * 处理视频快进快退
   * @param video 视频元素
   * @param direction 方向（forward/backward）
   * @param step 可选的步长（秒），默认使用配置中的值
   */
  handleSeek(
    video: HTMLVideoElement,
    direction: SeekDirection,
    step?: number
  ): void {
    try {
      const seekStep = step ?? this.config.seekStep;

      if (direction === 'forward') {
        video.currentTime = Math.min(
          video.duration,
          video.currentTime + seekStep
        );

        // 显示快进指示器
        const hudStore = useHUDStore.getState();
        hudStore.show({
          type: 'seek',
          value: seekStep,
        });
      } else if (direction === 'backward') {
        video.currentTime = Math.max(0, video.currentTime - seekStep);

        // 显示快退指示器
        const hudStore = useHUDStore.getState();
        hudStore.show({
          type: 'seek',
          value: -seekStep,
        });
      } else {
        console.warn('未知的跳转方向:', direction);
      }
    } catch (error) {
      console.error('处理快进快退失败:', error);
    }
  }

  /**
   * 处理音量控制
   * @param media 媒体元素
   * @param direction 方向（up/down）
   * @param step 可选的步长（0-1），默认使用配置中的值
   */
  handleVolume(
    media: HTMLMediaElement,
    direction: VolumeDirection,
    step?: number
  ): void {
    try {
      const volumeStep = step ?? this.config.volumeStep;

      if (direction === 'up') {
        media.volume = Math.min(1, media.volume + volumeStep);
      } else if (direction === 'down') {
        media.volume = Math.max(0, media.volume - volumeStep);
      } else {
        console.warn('未知的音量控制方向:', direction);
        return;
      }

      // 计算音量百分比
      const volumePercent = Math.round(media.volume * 100);

      // 显示音量指示器
      const hudStore = useHUDStore.getState();
      hudStore.show({
        type: 'volume',
        value: volumePercent,
      });
    } catch (error) {
      console.error('处理音量控制失败:', error);
    }
  }

  /**
   * 处理播放/暂停切换
   * @param media 媒体元素
   * @returns Promise，在播放操作完成后 resolve
   */
  async handlePlayPause(media: HTMLMediaElement): Promise<void> {
    try {
      if (media.paused) {
        // 尝试播放
        const playPromise = media.play();

        // 处理 play() 返回的 Promise（现代浏览器）
        if (playPromise !== undefined) {
          await playPromise.catch((error) => {
            console.error('播放失败:', error);
            // 可以在这里添加用户提示
          });
        }
      } else {
        // 暂停播放
        media.pause();
      }
    } catch (error) {
      console.error('处理播放/暂停失败:', error);
    }
  }

  /**
   * 设置指定的播放速度
   * @param media 媒体元素
   * @param speed 目标速度
   */
  setSpeed(media: HTMLMediaElement, speed: number): void {
    try {
      // 验证速度值
      if (
        typeof speed !== 'number' ||
        !isFinite(speed) ||
        speed < this.config.minSpeed ||
        speed > this.config.maxSpeed
      ) {
        console.warn('无效的播放速度:', speed);
        return;
      }

      media.playbackRate = speed;

      // 显示速度指示器
      const hudStore = useHUDStore.getState();
      hudStore.show({
        type: 'speed',
        value: speed,
      });
    } catch (error) {
      console.error('设置播放速度失败:', error);
    }
  }

  /**
   * 设置指定的音量
   * @param media 媒体元素
   * @param volume 目标音量（0-1）
   */
  setVolume(media: HTMLMediaElement, volume: number): void {
    try {
      // 验证音量值
      if (
        typeof volume !== 'number' ||
        !isFinite(volume) ||
        volume < 0 ||
        volume > 1
      ) {
        console.warn('无效的音量值:', volume);
        return;
      }

      media.volume = volume;

      // 显示音量指示器
      const volumePercent = Math.round(volume * 100);
      const hudStore = useHUDStore.getState();
      hudStore.show({
        type: 'volume',
        value: volumePercent,
      });
    } catch (error) {
      console.error('设置音量失败:', error);
    }
  }

  /**
   * 切换静音状态
   * @param media 媒体元素
   */
  toggleMute(media: HTMLMediaElement): void {
    try {
      media.muted = !media.muted;

      // 显示音量指示器（静音时显示 0）
      const volumePercent = media.muted ? 0 : Math.round(media.volume * 100);
      const hudStore = useHUDStore.getState();
      hudStore.show({
        type: 'volume',
        value: volumePercent,
      });
    } catch (error) {
      console.error('切换静音失败:', error);
    }
  }

  /**
   * 跳转到指定时间
   * @param media 媒体元素
   * @param time 目标时间（秒）
   */
  seekTo(media: HTMLMediaElement, time: number): void {
    try {
      // 验证时间值
      if (typeof time !== 'number' || !isFinite(time) || time < 0) {
        console.warn('无效的时间值:', time);
        return;
      }

      const oldTime = media.currentTime;
      media.currentTime = Math.min(media.duration, time);

      // 计算跳转的秒数
      const seekDelta = media.currentTime - oldTime;

      // 显示跳转指示器
      const hudStore = useHUDStore.getState();
      hudStore.show({
        type: 'seek',
        value: seekDelta,
      });
    } catch (error) {
      console.error('跳转到指定时间失败:', error);
    }
  }

  /**
   * 获取当前配置
   * @returns 当前配置对象
   */
  getConfig(): Readonly<Required<PlaybackControllerConfig>> {
    return { ...this.config };
  }
}

/**
 * 创建默认的播放控制器实例
 * @param config 可选的配置对象
 * @returns PlaybackController 实例
 */
export function createPlaybackController(
  config?: PlaybackControllerConfig
): PlaybackController {
  return new PlaybackController(config);
}

/**
 * 导出默认实例（单例模式）
 */
export const defaultPlaybackController = new PlaybackController();
