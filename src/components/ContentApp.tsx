import { useEffect } from 'react';
import { mediaDetector } from '../core/mediaDetector';
import { KeyboardHandler } from '../core/keyboardHandler';
import { useMediaStore } from '../stores/mediaStore';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import Lightbox from './Lightbox/Lightbox';
import HUD from './HUD/HUD';

export default function ContentApp() {
  const { setCurrentMedia, setPlaybackRate, setVolume, setIsPlaying, setCurrentTime, setDuration } = useMediaStore();
  const { showHUD, isFullscreen, setFullscreen } = useUIStore();
  const { shortcuts } = useSettingsStore();

  useEffect(() => {
    const handleAction = (action: string, value: number) => {
      if (action === 'speed') {
        showHUD('speed', value);
        setPlaybackRate(value);
      } else if (action === 'volume') {
        showHUD('volume', value);
        setVolume(value);
      } else if (action === 'seek') {
        showHUD('seek', value);
      } else if (action === 'mute') {
        showHUD('mute', value);
      }
    };

    const handler = new KeyboardHandler(shortcuts, handleAction);
    handler.init();

    // 定期检测媒体元素
    const interval = setInterval(() => {
      const media = mediaDetector.getCurrentMedia();
      if (media) {
        setCurrentMedia(media);
        setPlaybackRate(media.playbackRate);
        setVolume(media.volume);
        setIsPlaying(!media.paused);
        setCurrentTime(media.currentTime);
        setDuration(media.duration);

        // 同步事件
        media.addEventListener('play', () => setIsPlaying(true));
        media.addEventListener('pause', () => setIsPlaying(false));
        media.addEventListener('timeupdate', () => setCurrentTime(media.currentTime));
        media.addEventListener('loadedmetadata', () => setDuration(media.duration));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [shortcuts, showHUD, setCurrentMedia, setPlaybackRate, setVolume, setIsPlaying, setCurrentTime, setDuration]);

  // 处理全屏快捷键
  useEffect(() => {
    const handleFullscreenKey = (e: KeyboardEvent) => {
      if (e.key === shortcuts.fullscreen) {
        const media = mediaDetector.getCurrentMedia();
        if (media) {
          setFullscreen(!isFullscreen);
        }
      }
    };

    document.addEventListener('keydown', handleFullscreenKey);
    return () => document.removeEventListener('keydown', handleFullscreenKey);
  }, [shortcuts.fullscreen, isFullscreen, setFullscreen]);

  return (
    <>
      <HUD />
      {isFullscreen && <Lightbox />}
    </>
  );
}
