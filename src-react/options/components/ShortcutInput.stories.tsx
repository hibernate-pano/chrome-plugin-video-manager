import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import ShortcutInput from './ShortcutInput';
import type { ShortcutAction } from '../../shared/types/shortcuts';

/**
 * ShortcutInput 组件用于快捷键输入和配置。
 * 支持实时验证、冲突检测和键盘录制。
 */
const meta = {
  title: 'Options/ShortcutInput',
  component: ShortcutInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    action: {
      control: 'select',
      options: ['increase', 'decrease', 'reset', 'toggle-fullscreen', 'play-pause'],
      description: '快捷键操作类型',
    },
    label: {
      control: 'text',
      description: '快捷键标签',
    },
    description: {
      control: 'text',
      description: '快捷键描述',
    },
    value: {
      control: 'text',
      description: '当前快捷键值',
    },
    hasConflict: {
      control: 'boolean',
      description: '是否有冲突',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
  },
} satisfies Meta<typeof ShortcutInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认状态
 */
export const Default: Story = {
  args: {
    action: 'increase',
    label: '加速',
    description: '增加播放速度',
    value: '=',
    onChange: (action, key) => console.log('Changed:', action, key),
  },
};

/**
 * 未设置快捷键
 */
export const Empty: Story = {
  args: {
    action: 'increase',
    label: '加速',
    description: '增加播放速度',
    value: '',
    onChange: (action, key) => console.log('Changed:', action, key),
  },
};

/**
 * 有冲突的快捷键
 */
export const WithConflict: Story = {
  args: {
    action: 'increase',
    label: '加速',
    description: '增加播放速度',
    value: '=',
    hasConflict: true,
    conflictActions: ['decrease', 'reset'],
    onChange: (action, key) => console.log('Changed:', action, key),
  },
};

/**
 * 禁用状态
 */
export const Disabled: Story = {
  args: {
    action: 'increase',
    label: '加速',
    description: '增加播放速度',
    value: '=',
    disabled: true,
    onChange: (action, key) => console.log('Changed:', action, key),
  },
};

/**
 * 交互式示例 - 可以实际录制快捷键
 */
export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState('=');
    const [hasConflict, setHasConflict] = useState(false);

    const handleChange = (action: ShortcutAction, key: string) => {
      setValue(key);
      // 模拟冲突检测
      setHasConflict(key === '-' || key === '0');
    };

    return (
      <div className="w-[400px]">
        <ShortcutInput
          action="increase"
          label="加速"
          description="增加播放速度"
          value={value}
          hasConflict={hasConflict}
          conflictActions={hasConflict ? ['decrease', 'reset'] : []}
          onChange={handleChange}
        />
        <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
          <p className="font-semibold mb-1">当前值：{value || '未设置'}</p>
          <p className="text-gray-600">
            点击输入框并按下任意键来设置快捷键。
            {hasConflict && <span className="text-red-600 ml-2">检测到冲突！</span>}
          </p>
        </div>
      </div>
    );
  },
};

/**
 * 多个快捷键输入（表单场景）
 */
export const MultipleInputs: Story = {
  render: () => {
    const [shortcuts, setShortcuts] = useState({
      increase: '=',
      decrease: '-',
      reset: '0',
      'toggle-fullscreen': 'f',
      'play-pause': ' ',
    });

    const handleChange = (action: ShortcutAction, key: string) => {
      setShortcuts((prev) => ({
        ...prev,
        [action]: key,
      }));
    };

    // 检测冲突
    const getConflicts = (action: ShortcutAction): ShortcutAction[] => {
      const value = shortcuts[action];
      if (!value) return [];

      return (Object.keys(shortcuts) as ShortcutAction[]).filter(
        (key) => key !== action && shortcuts[key] === value
      );
    };

    return (
      <div className="w-[500px] space-y-4">
        <h3 className="text-lg font-semibold mb-4">快捷键设置</h3>
        <ShortcutInput
          action="increase"
          label="加速"
          description="增加播放速度"
          value={shortcuts.increase}
          hasConflict={getConflicts('increase').length > 0}
          conflictActions={getConflicts('increase')}
          onChange={handleChange}
        />
        <ShortcutInput
          action="decrease"
          label="减速"
          description="降低播放速度"
          value={shortcuts.decrease}
          hasConflict={getConflicts('decrease').length > 0}
          conflictActions={getConflicts('decrease')}
          onChange={handleChange}
        />
        <ShortcutInput
          action="reset"
          label="重置速度"
          description="恢复正常播放速度"
          value={shortcuts.reset}
          hasConflict={getConflicts('reset').length > 0}
          conflictActions={getConflicts('reset')}
          onChange={handleChange}
        />
        <ShortcutInput
          action="toggle-fullscreen"
          label="全屏"
          description="切换全屏模式"
          value={shortcuts['toggle-fullscreen']}
          hasConflict={getConflicts('toggle-fullscreen').length > 0}
          conflictActions={getConflicts('toggle-fullscreen')}
          onChange={handleChange}
        />
        <ShortcutInput
          action="play-pause"
          label="播放/暂停"
          description="切换播放状态"
          value={shortcuts['play-pause']}
          hasConflict={getConflicts('play-pause').length > 0}
          conflictActions={getConflicts('play-pause')}
          onChange={handleChange}
        />
      </div>
    );
  },
};
