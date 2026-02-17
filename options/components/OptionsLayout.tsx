/**
 * 设置页面布局组件
 * 提供页面的整体布局结构，包括 Header 和 Footer
 * @module options/components/OptionsLayout
 */

import React, { Suspense } from 'react';
import { Header } from './Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shared/components/ui/tabs';

// 使用 React.lazy 懒加载标签页组件
const ShortcutsTab = React.lazy(() => import('./ShortcutsTab').then(module => ({ default: module.ShortcutsTab })));
const PresetsTab = React.lazy(() => import('./PresetsTab').then(module => ({ default: module.PresetsTab })));
const AnimationTab = React.lazy(() => import('./AnimationTab').then(module => ({ default: module.AnimationTab })));
const HelpTab = React.lazy(() => import('./HelpTab').then(module => ({ default: module.HelpTab })));

/**
 * 加载中组件
 * 在懒加载组件加载时显示
 */
function LoadingFallback(): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        {/* 加载动画 */}
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-sm text-gray-500">加载中...</p>
      </div>
    </div>
  );
}

/**
 * Footer 组件
 * 显示版本信息和链接
 */
function Footer(): React.ReactElement {
  const version = '2.0.0'; // 后续可以从 manifest.json 或 store 中获取

  return (
    <footer className="mt-auto py-6 border-t border-gray-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-sm text-gray-500">
            <span className="font-medium">Video Speed Controller</span>
            <span className="mx-2">·</span>
            <span>v{version}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a
              href="https://github.com/yourusername/video-speed-controller"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/yourusername/video-speed-controller/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              反馈问题
            </a>
            <a
              href="https://github.com/yourusername/video-speed-controller/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              使用文档
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * 设置页面布局组件
 * 提供页面的整体结构：Header + 内容区域 + Footer
 */
export function OptionsLayout(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 页面头部 */}
      <Header />

      {/* 主内容区域 */}
      <main className="flex-1 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 标签页导航 */}
          <Tabs defaultValue="shortcuts" className="space-y-6">
            {/* 标签页列表 */}
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
              <TabsTrigger value="shortcuts">快捷键</TabsTrigger>
              <TabsTrigger value="presets">速度预设</TabsTrigger>
              <TabsTrigger value="animation">动画设置</TabsTrigger>
              <TabsTrigger value="help">帮助</TabsTrigger>
            </TabsList>

            {/* 标签页内容 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              {/* 快捷键标签页 */}
              <TabsContent value="shortcuts" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <ShortcutsTab />
                </Suspense>
              </TabsContent>

              {/* 速度预设标签页 */}
              <TabsContent value="presets" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <PresetsTab />
                </Suspense>
              </TabsContent>

              {/* 动画设置标签页 */}
              <TabsContent value="animation" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <AnimationTab />
                </Suspense>
              </TabsContent>

              {/* 帮助标签页 */}
              <TabsContent value="help" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <HelpTab />
                </Suspense>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>

      {/* 页面底部 */}
      <Footer />
    </div>
  );
}
