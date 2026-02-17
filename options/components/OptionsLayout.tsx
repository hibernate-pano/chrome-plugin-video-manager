import React, { Suspense } from 'react';
import { Header } from './Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shared/components/ui/tabs';

const ShortcutsTab = React.lazy(() => import('./ShortcutsTab').then(module => ({ default: module.ShortcutsTab })));
const PresetsTab = React.lazy(() => import('./PresetsTab').then(module => ({ default: module.PresetsTab })));
const AnimationTab = React.lazy(() => import('./AnimationTab').then(module => ({ default: module.AnimationTab })));
const HelpTab = React.lazy(() => import('./HelpTab').then(module => ({ default: module.HelpTab })));

function LoadingFallback(): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <p className="text-sm text-slate-500">加载中...</p>
      </div>
    </div>
  );
}

function Footer(): React.ReactElement {
  const version = '2.0.0';

  return (
    <footer className="mt-auto py-6 border-t border-slate-800 bg-slate-900/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-sm text-slate-500">
            <span className="font-medium text-slate-400">Video Speed Controller</span>
            <span className="mx-2">·</span>
            <span>v{version}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a
              href="https://github.com/yourusername/video-speed-controller"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-indigo-400 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/yourusername/video-speed-controller/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-indigo-400 transition-colors"
            >
              反馈问题
            </a>
            <a
              href="https://github.com/yourusername/video-speed-controller/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-indigo-400 transition-colors"
            >
              使用文档
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function OptionsLayout(): React.ReactElement {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs defaultValue="shortcuts" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex bg-slate-800/50 border border-slate-700 p-1">
              <TabsTrigger value="shortcuts" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">快捷键</TabsTrigger>
              <TabsTrigger value="presets" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">速度预设</TabsTrigger>
              <TabsTrigger value="animation" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">动画设置</TabsTrigger>
              <TabsTrigger value="help" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">帮助</TabsTrigger>
            </TabsList>

            <div className="glass-card rounded-2xl p-6">
              <TabsContent value="shortcuts" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <ShortcutsTab />
                </Suspense>
              </TabsContent>

              <TabsContent value="presets" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <PresetsTab />
                </Suspense>
              </TabsContent>

              <TabsContent value="animation" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <AnimationTab />
                </Suspense>
              </TabsContent>

              <TabsContent value="help" className="mt-0">
                <Suspense fallback={<LoadingFallback />}>
                  <HelpTab />
                </Suspense>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
