import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '../shared/types';
import { createChromeMock, flush } from './options-test-env';

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

/**
 * 错误反馈必须**能定位到出错的那一行**。
 *
 * 背景：设置页原来只有页面**最底部**那一行状态栏。出错的那一行在最上面，
 * 于是：
 * - 读屏用户听到一句「有按键被重复绑定」，却不知道是**哪一行**、
 *   跟**谁**撞了；
 * - 视觉用户也可能隔着十几屏才看见那一句。
 *
 * 而且那句话里**没有动作名**（「有按键被重复绑定」而不是
 * 「『加速』与『减速』绑定了同一个键」）—— 就算找到了那一行，
 * 也不知道该改哪一个。
 *
 * 现在的约定：
 * 1. 出错的输入框标 `aria-invalid="true"`，并用 `aria-describedby`
 *    指向**就地渲染**的那一句；
 * 2. 底部状态栏也带动作名；
 * 3. 校验失败时焦点挪到**第一个**出错的输入框。
 */
describe('设置页的冲突反馈要能定位到行', () => {
  const rowInputs = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.vsc__key')) as HTMLInputElement[];

  const inputOf = (root: HTMLElement, id: keyof typeof DEFAULT_SHORTCUTS): HTMLInputElement => {
    const index = SHORTCUT_DEFINITIONS.findIndex((definition) => definition.id === id);
    return rowInputs(root)[index]!;
  };

  const press = (input: HTMLInputElement, key: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };

  const statusOf = (root: HTMLElement) => root.querySelector('#status')?.textContent?.trim() ?? '';

  it('冲突的输入框标成 aria-invalid，并指向就地渲染的那一句', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), 'k');
    press(inputOf(root, 'decreaseSpeed'), 'k');

    const input = inputOf(root, 'increaseSpeed');
    expect(input.getAttribute('aria-invalid'), '出错的输入框必须被标成无效').toBe('true');

    // ⚠️ aria-describedby 现在是**两个** id（行说明 + 就地错误），不是一个。
    // 之前只有错误句：那一行下面「这个动作做什么」的说明对读屏用户是隐形的
    // —— 视觉用户一眼看到了，聚焦输入框时却听不到。
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(describedBy.length, 'aria-describedby 必须同时指向行说明与错误句').toBeGreaterThan(1);

    // 行说明永远在 referenced 列表里。
    const descId = `desc-increaseSpeed`;
    expect(describedBy, '行说明必须被引用').toContain(descId);
    const descNode = document.getElementById(descId);
    expect(descNode, '行说明节点必须存在').not.toBeNull();
    expect(descNode!.textContent).toContain('加快播放速度');

    // 错误句也在里面，且指向**真实存在**的节点。
    const errorId = 'error-increaseSpeed';
    expect(describedBy, '错误句必须被引用').toContain(errorId);
    const errorNode = document.getElementById(errorId);
    expect(errorNode, 'aria-describedby 指向的节点必须存在').not.toBeNull();
    // 错误就地渲染在**那一行**里，不是页面底部。
    expect(
      input.closest('.vsc__row')?.contains(errorNode!),
      '错误必须渲染在出错的那一行里',
    ).toBe(true);
    // 而且要指名道姓：跟谁撞了。
    expect(errorNode!.textContent).toContain('减速');
  });

  it('没有错误时，行说明仍然被读屏引用（它是正文，不是错误信息）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'increaseSpeed');
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(describedBy, '行说明必须始终被引用').toContain('desc-increaseSpeed');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('两行撞了同一个键，两行都被标出来', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), 'k');
    press(inputOf(root, 'decreaseSpeed'), 'k');

    expect(inputOf(root, 'increaseSpeed').getAttribute('aria-invalid')).toBe('true');
    expect(inputOf(root, 'decreaseSpeed').getAttribute('aria-invalid')).toBe('true');
  });

  it('底部状态栏带上动作名（读屏用户要知道改哪两行）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), 'k');
    press(inputOf(root, 'decreaseSpeed'), 'k');

    const status = statusOf(root);
    expect(status).toContain('加速');
    expect(status).toContain('减速');
  });

  it('校验失败时焦点挪到第一个出错的输入框', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), 'k');
    press(inputOf(root, 'decreaseSpeed'), 'k');

    // 用户直接点「保存」（还没改键，所以没触发过逐行错误）。
    (root.querySelector('#save') as HTMLButtonElement).click();
    await flush();

    expect(document.activeElement, '焦点必须落在第一个出错的输入框上').toBe(
      inputOf(root, 'increaseSpeed'),
    );
  });

  it('冲突改掉之后，红框与就地错误一起消失', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), 'k');
    press(inputOf(root, 'decreaseSpeed'), 'k');
    expect(inputOf(root, 'increaseSpeed').getAttribute('aria-invalid')).toBe('true');

    // 把其中一行改掉 → 冲突消失。
    press(inputOf(root, 'decreaseSpeed'), 'j');

    expect(inputOf(root, 'increaseSpeed').getAttribute('aria-invalid')).toBeNull();
    // ⚠️ aria-describedby **不会**整个消失：行说明（这一行在做什么）
    // 是无条件存在的正文，只有错误句被摘掉。
    const describedBy = (inputOf(root, 'increaseSpeed').getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    expect(describedBy).toContain('desc-increaseSpeed');
    expect(describedBy).not.toContain('error-increaseSpeed');
    const errorNode = document.getElementById('error-increaseSpeed');
    expect(errorNode?.textContent?.trim()).toBe('');
  });

  it('用户正在输入框里打字时不抢焦点', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'increaseSpeed');
    input.focus();
    press(inputOf(root, 'decreaseSpeed'), 'k');
    press(input, 'k');

    // 焦点还在他正在编辑的那一格 —— 抢走就等于「打不了字」。
    expect(document.activeElement).toBe(input);
  });
});

/**
 * 引导的失败次数与冷却状态必须**看得见**。
 *
 * 背景：冷却期原本是**完全静默**的 —— 引导不出现，界面上一个字都没有。
 * 用户只能猜「为什么它不出现」，而引导是这个产品唯一的入口。
 */
describe('设置页：引导的状态要看得见', () => {
  const FAILED_ATTEMPTS_KEY = 'vsc-first-run-hint-failed-attempts';
  const COOLDOWN_KEY = 'vsc-first-run-hint-cooldown-until';

  const hintStateOf = (root: HTMLElement) =>
    root.querySelector('#hint-state')?.textContent?.trim() ?? '';

  it('冷却中：显示什么时候会再次出现', async () => {
    const { render } = createChromeMock({
      local: { [COOLDOWN_KEY]: Date.now() + 60 * 60 * 1000 },
    });
    const root = await render();
    await flush();

    expect(hintStateOf(root)).toContain('冷却中');
  });

  it('有过失败：显示已经失败几次、还剩几次', async () => {
    const { render } = createChromeMock({ local: { [FAILED_ATTEMPTS_KEY]: 2 } });
    const root = await render();
    await flush();

    const note = hintStateOf(root);
    expect(note).toContain('2');
    // 还剩几次也要说清楚 —— 用户不知道还差几次就会进冷却。
    expect(note).toMatch(/1/);
  });

  it('从来没有失败过：这一行是空的（不占版面）', async () => {
    const { render } = createChromeMock();
    const root = await render();
    await flush();

    expect(hintStateOf(root)).toBe('');
  });
});
