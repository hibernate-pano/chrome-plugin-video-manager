import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './input';
import { Label } from './label';

/**
 * Input 组件基于 shadcn/ui，提供标准的文本输入框。
 * 支持所有标准 HTML input 属性和无障碍访问。
 */
const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url'],
      description: '输入框类型',
    },
    placeholder: {
      control: 'text',
      description: '占位符文本',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认文本输入框
 */
export const Default: Story = {
  args: {
    placeholder: '请输入文本...',
  },
};

/**
 * 带标签的输入框
 */
export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">邮箱</Label>
      <Input type="email" id="email" placeholder="请输入邮箱" />
    </div>
  ),
};

/**
 * 密码输入框
 */
export const Password: Story = {
  args: {
    type: 'password',
    placeholder: '请输入密码',
  },
};

/**
 * 数字输入框
 */
export const Number: Story = {
  args: {
    type: 'number',
    placeholder: '请输入数字',
  },
};

/**
 * 禁用状态
 */
export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: '禁用的输入框',
  },
};

/**
 * 带默认值
 */
export const WithValue: Story = {
  args: {
    defaultValue: '默认值',
  },
};

/**
 * 表单示例
 */
export const FormExample: Story = {
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input id="username" placeholder="请输入用户名" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email-form">邮箱</Label>
        <Input id="email-form" type="email" placeholder="请输入邮箱" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password-form">密码</Label>
        <Input id="password-form" type="password" placeholder="请输入密码" />
      </div>
    </div>
  ),
};
