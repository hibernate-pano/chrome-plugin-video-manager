import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

/**
 * Button 组件基于 shadcn/ui，提供多种变体和尺寸。
 * 支持完整的键盘导航和无障碍访问。
 */
const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      description: '按钮的视觉样式变体',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: '按钮的尺寸',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用按钮',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认按钮样式
 */
export const Default: Story = {
  args: {
    children: '默认按钮',
  },
};

/**
 * 危险操作按钮（如删除）
 */
export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: '删除',
  },
};

/**
 * 轮廓按钮
 */
export const Outline: Story = {
  args: {
    variant: 'outline',
    children: '轮廓按钮',
  },
};

/**
 * 次要按钮
 */
export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: '次要按钮',
  },
};

/**
 * 幽灵按钮（透明背景）
 */
export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: '幽灵按钮',
  },
};

/**
 * 链接样式按钮
 */
export const Link: Story = {
  args: {
    variant: 'link',
    children: '链接按钮',
  },
};

/**
 * 小尺寸按钮
 */
export const Small: Story = {
  args: {
    size: 'sm',
    children: '小按钮',
  },
};

/**
 * 大尺寸按钮
 */
export const Large: Story = {
  args: {
    size: 'lg',
    children: '大按钮',
  },
};

/**
 * 禁用状态
 */
export const Disabled: Story = {
  args: {
    disabled: true,
    children: '禁用按钮',
  },
};

/**
 * 所有变体展示
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button variant="default">Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
    </div>
  ),
};

/**
 * 所有尺寸展示
 */
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};
