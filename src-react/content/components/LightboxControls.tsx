/**
 * LightboxControls 控制条组件
 * 提供播放/暂停、进度条、音量控制等功能，带有淡入淡出动画
 * @module content/components/LightboxControls
 */

import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useMediaStore } from '../../shared/stores/mediaStore';

/**
 * LightboxControls Props
 */
interface LightboxControlsProps {
  /** 媒体元素 */
  media: HTMLMediaElement;
  /** 是否可见 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 格式化时间（秒 -> MM:SS 或 HH:MM:SS）
 * @param seconds 秒数
 * @returns 格式化的时间字符串
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '00:00';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * LightboxControls 组件
 * 实现播放控制、进度条、音量控制等功能
 * 使用 React.memo 优化，避免不必要的重新渲染
 */
function LightboxControls({ media, visible }: LightboxControlsProps) {
  const { isPaused, volume, togglePlayPause, setVolume } = useMediaStore((state) => ({
    isPaused: state.isPaused,
    volume: state.volume,
    togglePlayPause: state.togglePlayPause,
    setVolume: state.setVolume,
  }));

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);

  // 淡入淡出动画，使用 useMemo 缓存配置
  const fadeConfig = useMemo(() => ({
    tension: 300,
    friction: 30,
  }), []);

  const fadeSpring = useSpring({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0px)' : 'translateY(20px)',
    config: fadeConfig,
  });

  // 更新播放时间
  useEffect(() => {
    if (!media) return;

    const updateTime = () => {
      if (!isDraggingProgress) {
        setCurrentTime(media.currentTime);
        setDuration(media.duration || 0);
      }
    };

    const updateDuration = () => {
      setDuration(media.duration || 0);
    };

    media.addEventListener('timeupdate', updateTime);
    media.addEventListener('durationchange', updateDuration);
    media.addEventListener('loadedmetadata', updateDuration);

    // 初始化
    updateTime();
    updateDuration();

    return () => {
      media.removeEventListener('timeupdate', updateTime);
      media.removeEventListener('durationchange', updateDuration);
      media.removeEventListener('loadedmetadata', updateDuration);
    };
  }, [media, isDraggingProgress]);

  // 处理进度条拖动
  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDraggingProgress(true);
    updateProgress(e);
  }, []);

  const handleProgressMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingProgress) {
      updateProgress(e as any);
    }
  }, [isDraggingProgress]);

  const handleProgressMouseUp = useCallback(() => {
    setIsDraggingProgress(false);
  }, []);

  const updateProgress = (e: React.MouseEvent) => {
    if (!progressBarRef.current || !media) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * duration;

    setCurrentTime(newTime);
    media.currentTime = newTime;
  };

  // 处理音量拖动
  const handleVolumeMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDraggingVolume(true);
    updateVolume(e);
  }, []);

  const handleVolumeMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingVolume) {
      updateVolume(e as any);
    }
  }, [isDraggingVolume]);

  const handleVolumeMouseUp = useCallback(() => {
    setIsDraggingVolume(false);
  }, []);

  const updateVolume = (e: React.MouseEvent) => {
    if (!volumeBarRef.current) return;

    const rect = volumeBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    setVolume(percent);
  };

  // 全局鼠标事件监听
  useEffect(() => {
    if (isDraggingProgress) {
      document.addEventListener('mousemove', handleProgressMouseMove);
      document.addEventListener('mouseup', handleProgressMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleProgressMouseMove);
      document.removeEventListener('mouseup', handleProgressMouseUp);
    };
  }, [isDraggingProgress, handleProgressMouseMove, handleProgressMouseUp]);

  useEffect(() => {
    if (isDraggingVolume) {
      document.addEventListener('mousemove', handleVolumeMouseMove);
      document.addEventListener('mouseup', handleVolumeMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleVolumeMouseMove);
      document.removeEventListener('mouseup', handleVolumeMouseUp);
    };
  }, [isDraggingVolume, handleVolumeMouseMove, handleVolumeMouseUp]);

  // 使用 useMemo 缓存进度百分比
  const progressPercent = useMemo(() =>
    duration > 0 ? (currentTime / duration) * 100 : 0,
    [currentTime, duration]
  );

  return (
    <animated.div
      className="lightbox-controls"
      style={{
        ...fadeSpring,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* 进度条 */}
      <div className="progress-section">
        <span className="time-display">{formatTime(currentTime)}</span>
        <div
          ref={progressBarRef}
          className="progress-bar"
          onMouseDown={handleProgressMouseDown}
        >
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="progress-thumb"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
        </div>
        <span className="time-display">{formatTime(duration)}</span>
      </div>

      {/* 控制按钮 */}
      <div className="controls-section">
        {/* 播放/暂停按钮 */}
        <button
          className="control-button"
          onClick={togglePlayPause}
          aria-label={isPaused ? '播放' : '暂停'}
        >
          {isPaused ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          )}
        </button>

        {/* 音量控制 */}
        <div
          className="volume-control"
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <button
            className="control-button"
            onClick={() => setVolume(volume > 0 ? 0 : 1)}
            aria-label={volume > 0 ? '静音' : '取消静音'}
          >
            {volume === 0 ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : volume < 0.5 ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 9v6h4l5 5V4l-5 5H7z" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            )}
          </button>

          {/* 音量滑块 */}
          {showVolumeSlider && (
            <div className="volume-slider">
              <div
                ref={volumeBarRef}
                className="volume-bar"
                onMouseDown={handleVolumeMouseDown}
              >
                <div className="volume-track">
                  <div
                    className="volume-fill"
                    style={{ width: `${volume * 100}%` }}
                  />
                  <div
                    className="volume-thumb"
                    style={{ left: `${volume * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </animated.div>
  );
}

// 使用 React.memo 优化组件，自定义比较函数
export default memo(LightboxControls, (prevProps, nextProps) => {
  return (
    prevProps.media === nextProps.media &&
    prevProps.visible === nextProps.visible &&
    prevProps.onClose === nextProps.onClose
  );
});
