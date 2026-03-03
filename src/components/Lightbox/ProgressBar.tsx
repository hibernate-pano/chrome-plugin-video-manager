import { motion } from 'framer-motion';
import { useMediaStore } from '../../stores/mediaStore';

export default function ProgressBar() {
  const { currentTime, duration, setCurrentTime } = useMediaStore();

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-2 bg-white/20 rounded-full cursor-pointer relative overflow-hidden">
      <motion.div
        className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[#00f3ff] to-[#bc13fe]"
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
