import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import { useMediaStore } from '../../stores/mediaStore';
import Controls from './Controls';

export default function Lightbox() {
  const { isFullscreen, showControls, setShowControls } = useUIStore();
  const { currentMedia } = useMediaStore();

  if (!isFullscreen || !currentMedia) return null;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999999] bg-black"
      onMouseMove={() => setShowControls(true)}
    >
      {/* 霓虹边框效果 */}
      <div className="absolute inset-4 border-2 border-[#00f3ff]/30 rounded-lg shadow-[0_0_30px_rgba(0,243,255,0.3)]" />

      {/* 视频容器 */}
      <div className="absolute inset-8 flex items-center justify-center">
        <video
          ref={(el) => {
            if (el) useMediaStore.getState().setCurrentMedia(el);
          }}
          className="max-w-full max-h-full object-contain"
          src={(currentMedia as HTMLVideoElement).src}
          controls={false}
          autoPlay
        />
      </div>

      {/* 控制栏 */}
      <AnimatePresence>
        {showControls && <Controls />}
      </AnimatePresence>
    </motion.div>
  );
}
