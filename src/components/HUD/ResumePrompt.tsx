import { motion, AnimatePresence } from 'framer-motion';
import { formatMediaTime } from '../../core/learningMemory';

interface Props {
  currentTime: number;
  playbackRate: number;
  onResume: () => void;
  onDismiss: () => void;
}

export default function ResumePrompt({ currentTime, playbackRate, onResume, onDismiss }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="fixed right-5 top-5 z-[999998] w-[320px] rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">Continue Watching</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-50">从上次进度继续</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              上次看到 {formatMediaTime(currentTime)}，速度 {playbackRate}x。
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            稍后
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onResume}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            继续播放
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            忽略
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
