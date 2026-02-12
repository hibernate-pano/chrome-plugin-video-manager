import type { Meta, StoryObj } from '@storybook/react';
import { useState, useEffect } from 'react';
import SpeedIndicator from './SpeedIndicator';

/**
 * SpeedIndicator 组件显示当前播放速度。
 * 使用 React Spring 实现平滑的数字滚动动画和弹性效果。
 */
const meta = {
  title: 'Content/SpeedIndicator',
  component: SpeedIndicator,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1a1a1a' },
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0.25, max: 4, step: 0.25 },
      description: '播放速度值',
    },
    isReset: {
      control: 'boolean',
      description: '是否为重置指示器',
    },
  },
} satisfies Meta<typeof SpeedIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认状态 - 正常速度
 */
export const Default: Story = {
  args: {
    value: 1.0,
    isReset: false,
  },
};

/**
 * 加速状态
 */
export const Increased: Story = {
  args: {
    value: 1.5,
    isReset: false,
  },
};

/**
 * 减速状态
 */
export const Decreased: Story = {
  args: {
    value: 0.75,
    isReset: false,
  },
};

/**
 * 重置状态
 */
export const Reset: Story = {
  args: {
    value: 1.0,
    isReset: true,
  },
};

/**
 * 最大速度
 */
export const MaxSpeed: Story = {
  args: {
    value: 4.0,
    isReset: false,
  },
};

/**
 * 最小速度
 */
export const MinSpeed: Story = {
  args: {
    value: 0.25,
    isReset: false,
  },
};

/**
 * 动画演示 - 自动变化速度
 */
export const AnimatedDemo: Story = {
  render: () => {
    const [speed, setSpeed] = useState(1.0);

    useEffect(() => {
      const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 1.75, 1.5, 1.25];
      let index = 0;

      const interval = setInterval(() => {
        index = (index + 1) % speeds.length;
        setSpeed(speeds[index]);
      }, 1000);

      return () => clearInterval(interval);
    }, []);

    return <SpeedIndicator value={speed} />;
  },
};

/**
 * 交互式控制
 */
export const Interactive: Story = {
  render: () => {
    const [speed, setSpeed] = useState(1.0);
    const [isReset, setIsReset] = useState(false);

    const handleIncrease = () => {
      setSpeed((prev) => Math.min(4.0, prev + 0.25));
      setIsReset(false);
    };

    const handleDecrease = () => {
      setSpeed((prev) => Math.max(0.25, prev - 0.25));
      setIsReset(false);
    };

    const handleReset = () => {
      setSpeed(1.0);
      setIsReset(true);
      setTimeout(() => setIsReset(false), 500);
    };

    return (
      <div className="flex flex-col items-center gap-4">
        <SpeedIndicator value={speed} isReset={isReset} />
        <div className="flex gap-2">
          <button
            onClick={handleDecrease}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            减速 (-)
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            重置 (0)
          </button>
          <button
            onClick={handleIncrease}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            加速 (+)
          </button>
        </div>
        <div className="text-white text-sm">
          当前速度: {speed.toFixed(2)}×
        </div>
      </div>
    );
  },
};

/**
 * 多个速度对比
 */
export const Comparison: Story = {
  render: () => (
    <div className="flex gap-4">
      <div className="flex flex-col items-center gap-2">
        <SpeedIndicator value={0.5} />
        <span className="text-white text-xs">慢速</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <SpeedIndicator value={1.0} isReset />
        <span className="text-white text-xs">正常</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <SpeedIndicator value={2.0} />
        <span className="text-white text-xs">快速</span>
      </div>
    </div>
  ),
};
