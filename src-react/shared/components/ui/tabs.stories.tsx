import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

/**
 * Tabs 组件基于 Radix UI，提供可访问的标签页切换功能。
 * 支持键盘导航（方向键切换标签）。
 */
const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础标签页
 */
export const Default: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">标签 1</TabsTrigger>
        <TabsTrigger value="tab2">标签 2</TabsTrigger>
        <TabsTrigger value="tab3">标签 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">标签 1 内容</h3>
          <p className="text-sm text-gray-600">这是第一个标签页的内容。</p>
        </div>
      </TabsContent>
      <TabsContent value="tab2">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">标签 2 内容</h3>
          <p className="text-sm text-gray-600">这是第二个标签页的内容。</p>
        </div>
      </TabsContent>
      <TabsContent value="tab3">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">标签 3 内容</h3>
          <p className="text-sm text-gray-600">这是第三个标签页的内容。</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

/**
 * 设置页面风格的标签页
 */
export const SettingsStyle: Story = {
  render: () => (
    <Tabs defaultValue="shortcuts" className="w-[600px]">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="shortcuts">快捷键</TabsTrigger>
        <TabsTrigger value="presets">预设</TabsTrigger>
        <TabsTrigger value="help">帮助</TabsTrigger>
      </TabsList>
      <TabsContent value="shortcuts" className="space-y-4">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">快捷键设置</h3>
          <p className="text-sm text-gray-600">在这里配置您的键盘快捷键。</p>
        </div>
      </TabsContent>
      <TabsContent value="presets" className="space-y-4">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">速度预设</h3>
          <p className="text-sm text-gray-600">管理您的播放速度预设。</p>
        </div>
      </TabsContent>
      <TabsContent value="help" className="space-y-4">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">帮助文档</h3>
          <p className="text-sm text-gray-600">查看使用指南和常见问题。</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

/**
 * 垂直标签页
 */
export const Vertical: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[600px]">
      <div className="flex gap-4">
        <TabsList className="flex-col h-auto">
          <TabsTrigger value="account" className="w-full">账户</TabsTrigger>
          <TabsTrigger value="password" className="w-full">密码</TabsTrigger>
          <TabsTrigger value="notifications" className="w-full">通知</TabsTrigger>
        </TabsList>
        <div className="flex-1">
          <TabsContent value="account">
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-semibold mb-2">账户设置</h3>
              <p className="text-sm text-gray-600">管理您的账户信息。</p>
            </div>
          </TabsContent>
          <TabsContent value="password">
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-semibold mb-2">密码设置</h3>
              <p className="text-sm text-gray-600">修改您的登录密码。</p>
            </div>
          </TabsContent>
          <TabsContent value="notifications">
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-semibold mb-2">通知设置</h3>
              <p className="text-sm text-gray-600">配置通知偏好。</p>
            </div>
          </TabsContent>
        </div>
      </div>
    </Tabs>
  ),
};
