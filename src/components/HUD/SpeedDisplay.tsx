import { motion } from 'framer-motion';

interface Props {
  value: number;
}

export default function SpeedDisplay({ value }: Props) {
  return (
    <div className="flex items-center gap-4">
      <motion.span
        key={value}
        initial={{ scale: 1.5, color: '#00f3ff' }}
        animate={{ scale: 1, color: '#ffffff' }}
        className="text-6xl font-bold font-['Orbitron'] text-white"
      >
        {value.toFixed(1)}
      </motion.span>
      <span className="text-4xl text-[#00f3ff] font-['Orbitron']">x</span>
    </div>
  );
}
