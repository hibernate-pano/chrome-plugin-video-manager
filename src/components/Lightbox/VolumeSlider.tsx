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
        className="text-white hover:text-[#00f3ff] transition-colors text-xl"
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
              className="w-full accent-[#00f3ff]"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
