/**
 * Popup 帮助 Tab
 * 常见问题和快捷键说明
 */

import React, { useState } from 'react';
import { 
  BookOpen, ChevronDown, ChevronUp,
  PlayCircle, Zap, Minus, RotateCcw,
  Maximize2, Volume2, Keyboard
} from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: '如何使用快捷键？',
    answer: '在视频播放页面直接按快捷键即可，无需额外操作。',
  },
  {
    question: '快捷键不生效？',
    answer: '确保页面有视频元素，且未聚焦在输入框内。',
  },
  {
    question: '如何全屏播放？',
    answer: '按 f 键进入网页全屏模式，再次按 f 或 ESC 退出。',
  },
  {
    question: '网站记忆是什么？',
    answer: '启用后，每个网站会独立保存其播放速度设置。',
  },
];

function FAQItem({ item }: { item: FAQItem }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left bg-slate-800/50 hover:bg-slate-700 transition-colors flex items-center justify-between gap-2 cursor-pointer"
      >
        <span className="text-sm text-slate-300">{item.question}</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-3 py-2 bg-slate-900/50 border-t border-slate-700">
          <p className="text-xs text-slate-400">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

export function HelpTab(): React.ReactElement {
  const shortcuts = [
    { key: '=', icon: <Zap className="w-3 h-3" />, label: '加速', color: 'text-indigo-400' },
    { key: '-', icon: <Minus className="w-3 h-3" />, label: '减速', color: 'text-teal-400' },
    { key: '0', icon: <RotateCcw className="w-3 h-3" />, label: '重置', color: 'text-purple-400' },
    { key: 'Space', icon: <PlayCircle className="w-3 h-3" />, label: '播放/暂停', color: 'text-green-400' },
    { key: 'f', icon: <Maximize2 className="w-3 h-3" />, label: '全屏', color: 'text-pink-400' },
    { key: '↑', icon: <Volume2 className="w-3 h-3" />, label: '音量+', color: 'text-orange-400' },
    { key: '↓', icon: <Volume2 className="w-3 h-3 rotate-180" />, label: '音量-', color: 'text-red-400' },
  ];

  return (
    <div className="space-y-4">
      {/* 快捷键参考 */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-medium text-slate-200">快捷键参考</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {shortcuts.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 min-w-[50px] text-center">
                {s.key}
              </kbd>
              <span className={`text-xs ${s.color}`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-medium text-slate-200">常见问题</h3>
        </div>
        <div className="space-y-2">
          {FAQ_DATA.map((item, index) => (
            <FAQItem key={index} item={item} />
          ))}
        </div>
      </div>

      {/* 版本信息 */}
      <div className="text-center py-2">
        <p className="text-xs text-slate-500">视频速度控制器 v2.0.0</p>
      </div>
    </div>
  );
}
