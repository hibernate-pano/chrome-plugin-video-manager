import { motion } from 'framer-motion';
import { activeMediaSession } from '../../core/runtime';
import { addBookmark, formatMediaTime } from '../../core/learningMemory';
import { useMediaStore } from '../../stores/mediaStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import ProgressBar from './ProgressBar';
import VolumeSlider from './VolumeSlider';

export default function Controls() {
  const { isPlaying, playbackRate, currentMedia, currentTime, duration } = useMediaStore();
  const { presets, speedProfiles, activeProfileId, setActiveProfile } = useSettingsStore();
  const showHUD = useUIStore((state) => state.showHUD);

  const handleBookmark = async () => {
    if (!currentMedia) {
      return;
    }

    const bookmark = await addBookmark(currentMedia);
    showHUD('bookmark', bookmark.timestamp);
  };

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="vsc-controls-shell"
    >
      <div className="vsc-controls-backdrop" />
      <div className="vsc-controls-stack">
        <div className="vsc-mode-row">
          <div className="vsc-mode-meta">
            <span className="vsc-mode-title">Learning Mode</span>
            <span className="vsc-mode-subtitle">
              当前 {playbackRate.toFixed(2)}x · {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
            </span>
          </div>

          <div className="vsc-mode-pills">
            {speedProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setActiveProfile(profile.id);
                  activeMediaSession.setPlaybackRate(profile.speed);
                }}
                className={profile.id === activeProfileId ? 'vsc-mode-pill vsc-mode-pill--active' : 'vsc-mode-pill'}
                title={profile.description}
              >
                <span>{profile.name}</span>
                <span className="vsc-mode-pill-speed">{profile.speed}x</span>
              </button>
            ))}
          </div>
        </div>

        <div className="vsc-controls-row">
          <button
            type="button"
            onClick={() => void activeMediaSession.togglePlayPause()}
            className="vsc-icon-button"
          >
            {isPlaying ? (
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <ProgressBar />
          </div>

          <VolumeSlider />

          <div className="vsc-speed-presets">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => activeMediaSession.setPlaybackRate(preset)}
                className={preset === Number(playbackRate.toFixed(2)) ? 'vsc-speed-chip vsc-speed-chip--active' : 'vsc-speed-chip'}
              >
                {preset}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleBookmark()}
            className="vsc-icon-button"
            title="保存当前时间点"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5.75A1.75 1.75 0 016.75 4h10.5A1.75 1.75 0 0119 5.75V20l-7-4-7 4V5.75z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => activeMediaSession.toggleLightbox()}
            className="vsc-icon-button"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
