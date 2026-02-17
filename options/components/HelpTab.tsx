/**
 * 帮助标签页组件
 * 提供使用指南和常见问题解答
 * @module options/components/HelpTab
 */

import React, { useState } from 'react';

/**
 * FAQ 项目接口
 */
interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

/**
 * FAQ 数据
 */
const FAQ_DATA: FAQItem[] = [
  {
    id: 'faq-1',
    question: '如何使用快捷键控制视频？',
    answer: '在视频播放页面，直接按下您设置的快捷键即可。例如，默认情况下按 "=" 键可以加速，按 "-" 键可以减速。快捷键在视频获得焦点时自动生效，无需额外操作。',
  },
  {
    id: 'faq-2',
    question: '为什么我的快捷键不起作用？',
    answer: '请检查以下几点：1) 确保您在视频播放页面上；2) 检查是否有其他扩展占用了相同的快捷键；3) 某些网站可能有自己的快捷键系统，可能会产生冲突；4) 尝试刷新页面后再试。',
  },
  {
    id: 'faq-3',
    question: '支持哪些视频网站？',
    answer: '本扩展支持所有使用标准 HTML5 video 和 audio 元素的网站，包括但不限于：YouTube、Bilibili、Netflix、优酷、腾讯视频等主流视频平台。',
  },
  {
    id: 'faq-4',
    question: '如何设置速度预设？',
    answer: '在"速度预设"标签页中，点击"添加预设"按钮，输入您想要的播放速度（如 1.5），然后确认添加。您还可以为预设设置快捷键，方便快速切换。',
  },
  {
    id: 'faq-5',
    question: '快捷键冲突了怎么办？',
    answer: '当您设置快捷键时，系统会自动检测冲突并用红色边框高亮显示冲突的输入框。您需要修改其中一个快捷键以解决冲突。建议使用不常用的按键组合。',
  },
  {
    id: 'faq-6',
    question: '如何恢复默认设置？',
    answer: '在"快捷键设置"标签页中，点击"重置为默认"按钮即可恢复所有快捷键为默认值。在"速度预设"标签页中，点击"重置预设"按钮可以恢复默认的速度预设。',
  },
  {
    id: 'faq-7',
    question: '动画效果可以关闭吗？',
    answer: '可以。在"动画设置"标签页中，选择"关闭"选项即可禁用所有动画效果。这对于低性能设备或偏好简洁界面的用户很有帮助。',
  },
  {
    id: 'faq-8',
    question: '设置会同步到其他设备吗？',
    answer: '是的。本扩展使用 Chrome 的同步存储（chrome.storage.sync），您的设置会自动同步到所有登录了相同 Google 账号的 Chrome 浏览器。',
  },
  {
    id: 'faq-9',
    question: '如何进入网页全屏模式？',
    answer: '按下 "f" 键（默认快捷键）即可进入网页全屏模式。在全屏模式下，视频会占据整个浏览器窗口，提供更沉浸的观看体验。再次按 "f" 键或按 ESC 键可以退出全屏。',
  },
  {
    id: 'faq-10',
    question: '扩展会影响网页性能吗？',
    answer: '不会。本扩展经过精心优化，使用了缓存、防抖等技术，对网页性能的影响微乎其微。内容脚本包大小控制在 200KB 以内，确保快速加载。',
  },
];

/**
 * FAQ 项目组件
 */
function FAQItemComponent({ item }: { item: FAQItem }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 text-left bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-between gap-3 cursor-pointer"
      >
        <span className="font-medium text-slate-200">{item.question}</span>
        <svg
          className={`w-5 h-5 text-slate-500 flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 py-3 bg-slate-900 border-t border-slate-700 animate-in fade-in-50 slide-in-from-top-2 duration-200">
          <p className="text-sm text-slate-300 leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

/**
 * 帮助标签页组件
 * 实现使用指南和 FAQ
 */
export function HelpTab(): React.ReactElement {
  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* 标签页标题和描述 */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-100">
          帮助中心
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          了解如何使用视频音频速度控制器，解决常见问题。
        </p>
      </div>

      {/* 使用指南 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <svg
            className="w-6 h-6 text-indigo-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <h3 className="text-xl font-semibold text-slate-100">
            使用指南
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* 快速开始 */}
          <div className="p-5 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-100 mb-2">
                  快速开始
                </h4>
                <ul className="text-sm text-slate-400 space-y-1.5">
                  <li>• 打开任意视频网站</li>
                  <li>• 使用快捷键控制播放</li>
                  <li>• 查看屏幕上的 HUD 提示</li>
                  <li>• 享受流畅的观看体验</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 自定义设置 */}
          <div className="p-5 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-100 mb-2">
                  自定义设置
                </h4>
                <ul className="text-sm text-slate-400 space-y-1.5">
                  <li>• 在"快捷键设置"中修改按键</li>
                  <li>• 在"速度预设"中添加常用速度</li>
                  <li>• 在"动画设置"中调整动画效果</li>
                  <li>• 设置会自动保存和同步</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 默认快捷键 */}
          <div className="p-5 bg-gradient-to-br from-teal-500/10 to-green-500/10 border border-teal-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-teal-500 to-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-100 mb-2">
                  默认快捷键
                </h4>
                <ul className="text-sm text-slate-400 space-y-1.5">
                  <li>• <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300">=</kbd> 加速播放</li>
                  <li>• <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300">-</kbd> 减速播放</li>
                  <li>• <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300">0</kbd> 重置速度</li>
                  <li>• <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300">f</kbd> 网页全屏</li>
                  <li>• <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300">Space</kbd> 播放/暂停</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 高级功能 */}
          <div className="p-5 bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-100 mb-2">
                  高级功能
                </h4>
                <ul className="text-sm text-slate-400 space-y-1.5">
                  <li>• 支持 Shadow DOM 和 iframe</li>
                  <li>• 自动检测页面中的媒体元素</li>
                  <li>• 智能缓存提升性能</li>
                  <li>• 支持多语言界面</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 常见问题 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <svg
            className="w-6 h-6 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-slate-100">
            常见问题
          </h3>
        </div>

        <div className="space-y-3">
          {FAQ_DATA.map((item) => (
            <FAQItemComponent key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* 联系支持 */}
      <section className="p-6 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg
              className="w-8 h-8 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-slate-100 mb-2">
              需要更多帮助？
            </h4>
            <p className="text-sm text-slate-400 mb-4">
              如果您遇到了问题或有功能建议，欢迎通过以下方式联系我们：
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/your-repo/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium text-slate-200 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub Issues
              </a>
              <a
                href="mailto:support@example.com"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium text-slate-200 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                发送邮件
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 版本信息 */}
      <div className="pt-6 border-t border-slate-700 text-center text-sm text-slate-500">
        <p>视频音频速度控制器 v2.0.0</p>
        <p className="mt-1">使用 React + TypeScript + Tailwind CSS 构建</p>
      </div>
    </div>
  );
}
