import { activeMediaSession } from '../../core/runtime';
import { useMediaStore } from '../../stores/mediaStore';

export default function ProgressBar() {
  const { currentTime, duration } = useMediaStore();
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const seekWithPointer = (clientX: number, container: HTMLDivElement) => {
    if (duration <= 0) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    activeMediaSession.seekToPercent(percent);
  };

  return (
    <div
      className="vsc-progress"
      onClick={(event) => seekWithPointer(event.clientX, event.currentTarget)}
    >
      <div className="vsc-progress-track" />
      <div className="vsc-progress-fill" style={{ width: `${progress}%` }} />
      <div className="vsc-progress-thumb" style={{ left: `calc(${progress}% - 6px)` }} />
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        onChange={(event) => activeMediaSession.seekTo(Number(event.target.value))}
        className="vsc-progress-input"
      />
    </div>
  );
}
