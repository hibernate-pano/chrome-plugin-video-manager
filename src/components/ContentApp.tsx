import { useEffect, useRef } from 'react';
import { mediaDetector } from '../core/mediaDetector';
import { KeyboardHandler } from '../core/keyboardHandler';
import { useMediaStore } from '../stores/mediaStore';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import Lightbox from './Lightbox/Lightbox';
import HUD from './HUD/HUD';

export default function ContentApp() {
  const { setPlaybackRate, setVolume, setIsPlaying, setCurrentTime, setDuration } = useMediaStore();
  const { showHUD, isFullscreen } = useUIStore();
  const { shortcuts } = useSettingsStore();

  // 使用 ref 来存储回调，避免无限循环
  const showHUDRef = useRef(showHUD);
  showHUDRef.current = showHUD;

  const setPlaybackRateRef = useRef(setPlaybackRate);
  setPlaybackRateRef.current = setPlaybackRate;

  const setVolumeRef = useRef(setVolume);
  setVolumeRef.current = setVolume;

  const setIsPlayingRef = useRef(setIsPlaying);
  setIsPlayingRef.current = setIsPlaying;

  const setCurrentTimeRef = useRef(setCurrentTime);
  setCurrentTimeRef.current = setCurrentTime;

  const setDurationRef = useRef(setDuration);
  setDurationRef.current = setDuration;

  useEffect(() => {
    const handleAction = (action: string, value: number) => {
      if (action === 'speed') {
        showHUDRef.current('speed', value);
        setPlaybackRateRef.current(value);
      } else if (action === 'volume') {
        showHUDRef.current('volume', value);
        setVolumeRef.current(value);
      } else if (action === 'seek') {
        showHUDRef.current('seek', value);
      } else if (action === 'mute') {
        showHUDRef.current('mute', value);
      }
    };

    const handler = new KeyboardHandler(shortcuts, handleAction);
    handler.init();

    // 跟踪当前媒体元素，避免重复添加事件监听
    let currentMedia: HTMLMediaElement | null = null;

    const interval = setInterval(() => {
      const media = mediaDetector.getCurrentMedia();
      if (media && media !== currentMedia) {
        // 媒体元素变化了
        currentMedia = media;
        useMediaStore.getState().setCurrentMedia(media);
        useMediaStore.getState().setPlaybackRate(media.playbackRate);
        useMediaStore.getState().setVolume(media.volume);
        useMediaStore.getState().setIsPlaying(!media.paused);
        useMediaStore.getState().setCurrentTime(media.currentTime);
        useMediaStore.getState().setDuration(media.duration);
      } else if (media) {
        // 同步状态
        useMediaStore.getState().setCurrentTime(media.currentTime);
        useMediaStore.getState().setIsPlaying(!media.paused);
      }
    }, 500);

    return () => {
      clearInterval(interval);
      currentMedia = null;
    };
  }, [shortcuts]);

  // 处理全屏快捷键
  useEffect(() => {
    const handleFullscreenKey = (e: KeyboardEvent) => {
      if (e.key === shortcuts.fullscreen) {
        const media = mediaDetector.getCurrentMedia();
        if (media) {
          useUIStore.getState().setFullscreen(!useUIStore.getState().isFullscreen);
        }
      }
    };

    document.addEventListener('keydown', handleFullscreenKey);
    return () => document.removeEventListener('keydown', handleFullscreenKey);
  }, [shortcuts.fullscreen]);

  return (
    <>
      <HUD />
      {isFullscreen && <Lightbox />}
    </>
  );
}
