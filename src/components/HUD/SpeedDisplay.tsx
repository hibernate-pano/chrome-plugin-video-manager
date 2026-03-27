import { motion } from 'framer-motion';

interface Props {
  value: number;
}

export default function SpeedDisplay({ value }: Props) {
  return (
    <div className="flex items-center gap-2">
      <motion.span
        key={value}
        initial={{ scale: 1.3, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-3xl font-bold text-white"
      >
        {value.toFixed(1)}
      </motion.span>
      <span className="text-xl text-white/60">x</span>
      <span className="text-sm text-white/50 ml-2">播放速度</span>
    </div>
  );
}
