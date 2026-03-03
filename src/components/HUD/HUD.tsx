import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import SpeedDisplay from './SpeedDisplay';

export default function HUD() {
  const { hudVisible, hudType, hudValue } = useUIStore();

  return (
    <AnimatePresence>
      {hudVisible && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', damping: 15 }}
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-[999998]"
        >
          <div className="bg-black/80 backdrop-blur-sm px-12 py-8 rounded-2xl border border-[#00f3ff]/50 shadow-[0_0_50px_rgba(0,243,255,0.4)]">
            {hudType === 'speed' && <SpeedDisplay value={hudValue} />}
            {hudType === 'volume' && <div className="text-white text-4xl font-['Orbitron']">{Math.round(hudValue * 100)}%</div>}
            {hudType === 'seek' && <div className="text-white text-4xl font-['Orbitron']">{hudValue > 0 ? '⏩' : '⏪'} {Math.abs(hudValue)}s</div>}
            {hudType === 'mute' && <div className="text-white text-4xl font-['Orbitron']">{hudValue ? '🔇' : '🔊'}</div>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
