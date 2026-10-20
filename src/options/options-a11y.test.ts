import { describe, expect, it } from 'vitest';
import { SHORTCUT_DEFINITIONS } from '../shared/types';
import { createChromeMock } from './options-test-env';

/**
 * 设置页无障碍：每个快捷键输入框必须有一个非空的无障碍名字，
 * 且保存/错误反馈要通过 live region 播报。
 */
describe('options page accessibility', () => {
  it('gives every shortcut input a non-empty accessible name', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const controls = Array.from(root.querySelectorAll('.vsc__key'));
    expect(controls.length).toBe(SHORTCUT_DEFINITIONS.length);

    const names = controls.map((control) => {
      const label = control.getAttribute('aria-label')?.trim() ?? '';
      const referenced = (control.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '');

      return label || referenced.join(' ').trim();
    });

    expect(names.filter((name) => name.length === 0)).toEqual([]);
  });

  it('announces save and error feedback through a live region', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const status = root.querySelector('#status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('marks save and reset as real buttons', async () => {
    const { render } = createChromeMock();
    const root = await render();

    expect(root.querySelector('#save')?.tagName).toBe('BUTTON');
    expect(root.querySelector('#reset')?.tagName).toBe('BUTTON');
  });
});

/**
 * 页面身份与语言。
 *
 * 用户从 chrome://extensions 点进来时，先看到的是浏览器标签页标题，再是页面 H1。
 * 两者任何一个答不出「这是什么扩展」，用户就会以为走错了地方。
 */
describe('options page identity', () => {
  it('H1 是产品名，不是「快捷键」', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const title = root.querySelector('.vsc__title')?.textContent?.trim() ?? '';
    expect(title).toBe('Video Speed Controller — Fullscreen & Keys');
  });

  it('产品名下面有「快捷键」副标题', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const subtitle = root.querySelector('.vsc__subtitle')?.textContent?.trim() ?? '';
    expect(subtitle).toBe('快捷键');
  });

  it('页脚有版本号、隐私政策与仓库链接', async () => {
    const { render } = createChromeMock({ version: '6.0.9' });
    const root = await render();

    const footer = root.querySelector('.vsc__footer');
    expect(footer, '页脚缺失').not.toBeNull();

    const links = Array.from(footer!.querySelectorAll('a')) as HTMLAnchorElement[];
    const hrefs = links.map((link) => link.getAttribute('href'));

    expect(hrefs).toContain(
      'https://github.com/hibernate-pano/chrome-plugin-video-manager/blob/main/PRIVACY.md',
    );
    expect(hrefs).toContain('https://github.com/hibernate-pano/chrome-plugin-video-manager');

    // 外链必须带 rel=noopener：新标签打开时不能把 window.opener 交出去。
    links.forEach((link) => {
      expect(link.getAttribute('rel') ?? '').toContain('noopener');
      expect(link.getAttribute('target') ?? '').toBe('_blank');
    });

    expect(footer!.textContent ?? '').toContain('6.0.9');
  });

  it('文档语言与实际渲染的语言一致', async () => {
    // ⚠️ 这里守的不变式是「lang 与**实际渲染**的语言一致」，
    // 不是「lang 等于 getUILanguage()」。
    //
    // 区别很实在：Chrome 挑 _locales 目录受**系统/地区设置**影响，
    // 而 getUILanguage() 只是浏览器**界面**语言。macOS 上
    // 「系统中文 + Chrome 界面英文」时，界面渲染中文，但 getUILanguage() 给 "en-US"。
    // 照着 getUILanguage() 设 lang，英文用户就会拿到 lang="en-US" 配一屏中文 ——
    // 屏幕阅读器用英文语音朗读中文内容，且**没有任何视觉症状**。
    const { render } = createChromeMock({ locale: 'en' });
    await render();

    expect(document.documentElement.lang).toBe('en');
  });

  it('Chrome 选中文 locale 时，lang 也必须是中文', async () => {
    const { render } = createChromeMock({ locale: 'zh-CN' });
    await render();

    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('标签页标题走 i18n，不写死英文', async () => {
    const { render } = createChromeMock({
      messages: { optPageTitle: 'Video Speed Controller — 全屏与快捷键' },
    });
    await render();

    expect(document.title).toBe('Video Speed Controller — 全屏与快捷键');
  });
});
