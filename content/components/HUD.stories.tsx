import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import HUD from './HUD';

/**
 * HUD (Heads-Up Display) 组件显示播放控制的视觉反馈。
 * 包括速度、音量和跳转指示器。
 */
const meta = {
  title: 'Content/HUD',
  component: HUD,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1a1a1a' },
        { name: 'video', value: '#000000' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    visible: {
      control: 'boolean',
      description: 'HUD 是否可见',
    },
    type: {
      control: 'select',
      options: ['speed', 'volume', 'seek', 'reset'],
      description: 'HUD 类型',
    },
    value: {
      control: { type: 'number', min: 0, max: 4, step: 0.1 },
      description: '显示的值',
    },
  },
} satisfies Meta<typeof HUD>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 速度指示器
 */
export const SpeedIndicator: Story = {
  args: {
    visible: true,
    type: 'speed',
    value: 1.5,
  },
};

/**
 * 音量指示器
 */
export const VolumeIndicator: Story = {
  args: {
    visible: true,
    type: 'volume',
    value: 75,
  },
};

/**
 * 快进指示器
 */
export const SeekForward: Story = {
  args: {
    visible: true,
    type: 'seek',
    value: 10,
  },
};

/**
 * 快退指示器
 */
export const SeekBackward: Story = {
  args: {
    visible: true,
    type: 'seek',
    value: -10,
  },
};

/**
 * 重置指示器
 */
export const ResetIndicator: Story = {
  args: {
    visible: true,
    type: 'reset',
    value: 1.0,
  },
};

/**
 * 隐藏状态
 */
export const Hidden: Story = {
  args: {
    visible: false,
    type: 'speed',
    value: 1.0,
  },
};

/**
 * 交互式演示 - 模拟真实使用场景
 */
export const InteractiveDemo: Story = {
  render: () => {
    const [visible, setVisible] = useState(false);
    const [type, setType] = useState<'speed' | 'volume' | 'seek' | 'reset'>('speed');
    const [value, setValue] = useState(1.0);

    const showHUD = (newType: typeof type, newValue: number) => {
      setType(newType);
      setValue(newValue);
      setVisible(true);

      // 2秒后自动隐藏
      setTimeout(() => {
        setVisible(false);
      }, 2000);
    };

    return (
      <div className="relative w-full h-screen bg-gray-900">
        {/* 模拟视频播放器 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white text-center">
            <h2 className="text-2xl mb-4">模拟视频播放器</h2>
            <p className="text-gray-400 mb-8">点击下方按钮查看 HUD 效果</p>
          </div>
        </div>

        {/* HUD 组件 */}
        <HUD visible={visible} type={type} value={value} />

        {/* 控制按钮 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 flex-wrap justify-center max-w-2xl">
          <button
            onClick={() => showHUD('speed', 1.5)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            加速 (1.5×)
          </button>
          <button
            onClick={() => showHUD('speed', 0.75)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            减速 (0.75×)
          </button>
          <button
            onClick={() => showHUD('reset', 1.0)}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            重置速度
          </button>
          <button
            onClick={() => showHUD('volume', 80)}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            音量 80%
          </button>
          <button
            onClick={() => showHUD('volume', 50)}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            音量 50%
          </button>
          <button
            onClick={() => showHUD('seek', 10)}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
          >
            快进 10s
          </button>
          <button
            onClick={() => showHUD('seek', -10)}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
          >
            快退 10s
          </button>
        </div>
      </div>
    );
  },
};

/**
 * 自动循环演示
 */
export const AutoCycleDemo: Story = {
  render: () => {
    const [visible, setVisible] = useState(true);
    const [type, setType] = useState<'speed' | 'volume' | 'seek' | 'reset'>('speed');
    const [value, setValue] = useState(1.0);
    const [currentIndex, setCurrentIndex] = useState(0);

    const demos = [
      { type: 'speed' as const, value: 1.5, label: '加速' },
      { type: 'speed' as const, value: 0.75, label: '减速' },
      { type: 'reset' as const, value: 1.0, label: '重置' },
      { type: 'volume' as const, value: 80, label: '音量+' },
      { type: 'volume' as const, value: 30, label: '音量-' },
      { type: 'seek' as const, value: 10, label: '快进' },
      { type: 'seek' as const, value: -10, label: '快退' },
    ];

    useState(() => {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % demos.length;
          const demo = demos[next];
          setType(demo.type);
          setValue(demo.value);
          setVisible(true);

          // 1.5秒后隐藏
          setTimeout(() => setVisible(false), 1500);

          return next;
        });
      }, 2500);

      return () => clearInterval(interval);
    });

    return (
      <div className="relative w-full h-screen bg-gray-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white text-center">
            <h2 className="text-2xl mb-4">自动循环演示</h2>
            <p className="text-gray-400 mb-2">当前演示: {demos[currentIndex].label}</p>
            <p className="text-sm text-gray-500">HUD 会自动循环显示不同状态</p>
          </div>
        </div>
        <HUD visible={visible} type={type} value={value} />
      </div>
    );
  },
};
