import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import { formatMediaTime } from '../../core/learningMemory';
import SpeedDisplay from './SpeedDisplay';

export default function HUD() {
  const { hudVisible, hudType, hudValue } = useUIStore();

  return (
    <AnimatePresence>
      {hudVisible && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 400 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-[999998]"
        >
          <div className="bg-black/70 backdrop-blur-sm px-5 py-3 rounded-xl border border-white/10 shadow-xl">
            {hudType === 'speed' && <SpeedDisplay value={hudValue} />}
            {hudType === 'volume' && (
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span className="text-white text-2xl font-semibold">{Math.round(hudValue * 100)}%</span>
              </div>
            )}
            {hudType === 'seek' && (
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {hudValue > 0 ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  )}
                </svg>
                <span className="text-white text-2xl font-semibold">{hudValue > 0 ? '+' : ''}{Math.abs(hudValue)}s</span>
              </div>
            )}
            {hudType === 'mute' && (
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {hudValue ? (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </>
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  )}
                </svg>
                <span className="text-white text-xl font-medium">{hudValue ? '已静音' : '已取消静音'}</span>
              </div>
            )}
            {hudType === 'fullscreen' && (
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {hudValue ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
                  )}
                </svg>
                <span className="text-white text-xl font-medium">{hudValue ? '网页全屏已开启' : '网页全屏已退出'}</span>
              </div>
            )}
            {hudType === 'bookmark' && (
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5.75A1.75 1.75 0 016.75 4h10.5A1.75 1.75 0 0119 5.75V20l-7-4-7 4V5.75z" />
                </svg>
                <span className="text-white text-xl font-medium">已保存片段 {formatMediaTime(hudValue)}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
