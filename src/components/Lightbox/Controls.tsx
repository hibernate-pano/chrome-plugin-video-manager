import { motion } from 'framer-motion';
import { useMediaStore } from '../../stores/mediaStore';
import { useUIStore } from '../../stores/uiStore';
import ProgressBar from './ProgressBar';
import VolumeSlider from './VolumeSlider';

export default function Controls() {
  const { isPlaying, playbackRate, currentTime, duration } = useMediaStore();
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
        <button className="text-white hover:text-[#00f3ff] transition-colors text-2xl">
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
        <button className="text-[#00f3ff] font-bold font-['Orbitron'] min-w-[60px]">
          {playbackRate.toFixed(1)}x
        </button>

        {/* 退出全屏 */}
        <button
          onClick={() => setFullscreen(false)}
          className="text-white hover:text-[#ff00ff] transition-colors text-2xl"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
