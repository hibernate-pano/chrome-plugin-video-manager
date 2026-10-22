import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '../shared/types';
import { createChromeMock, flush } from './options-test-env';

/**
 * 设置页无障碍：每个快捷键输入框必须有一个非空的无障碍名字，
 * 且保存/错误反馈要通过 live region 播报。
 */
describe('options page accessibility', () => {
  /**
   * 按 accname 的**真实优先级**算出可访问名。
   *
   * ⚠️ 之前这里写的是 `label || referenced.join(' ')` ——
   * 那是**反过来**的：aria-labelledby 优先于 aria-label。
   * 两者的顺序写反了，这条断言就成了假的安全感：
   * 实际可访问名只有「加速」，而它照样判「非空」通过。
   *
   * 真正的判据是 Chrome 的 AX tree（见 tests/e2e/options-page.spec.js）；
   * 这里只是在单测里按同一套规则**近似**算一遍。
   */
  const accessibleName = (control: Element): string => {
    const referenced = (control.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (referenced.length > 0) {
      return referenced.join(' ');
    }

    const label = control.getAttribute('aria-label')?.trim() ?? '';
    if (label) {
      return label;
    }

    return control.textContent?.trim() ?? '';
  };

  it('gives every shortcut input a non-empty accessible name', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const controls = Array.from(root.querySelectorAll('.vsc__key'));
    expect(controls.length).toBe(SHORTCUT_DEFINITIONS.length);

    const names = controls.map(accessibleName);
    expect(names.filter((name) => name.length === 0)).toEqual([]);
  });

  /**
   * 可访问名里必须带**当前绑定的键**。
   *
   * ⚠️ 之前 input 上同时有 aria-labelledby（指向动作名）与 aria-label
   * （「加速: =」）—— accname 的规则是 aria-labelledby **优先**，
   * 所以 aria-label 是**死代码**：读屏用户听到的只有「加速」，
   * 永远不知道现在绑的是哪个键。
   */
  it('可访问名里带着当前绑定的键（不是只有动作名）', async () => {
    const { render } = createChromeMock({
      sync: {
        'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'ctrl+alt+shift+meta+pagedown' } },
      },
    });
    const root = await render();

    const index = SHORTCUT_DEFINITIONS.findIndex((definition) => definition.id === 'fullscreen');
    const control = root.querySelectorAll('.vsc__key')[index]!;

    const name = accessibleName(control);
    expect(name, '可访问名里必须有当前绑定的键').toContain('PgDn');
    // 而且**不能**靠 aria-labelledby 顶掉 aria-label ——
    // 两者同时存在时读屏只念 aria-labelledby 指向的那一句。
    expect(
      control.getAttribute('aria-labelledby'),
      '不能同时挂 aria-labelledby：它会盖掉带绑定信息的 aria-label',
    ).toBeNull();
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

  it('校验失败时焦点挪到出错的输入框上', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), 'k');
    press(inputOf(root, 'decreaseSpeed'), 'k');

    // 用户直接点「保存」（还没改键，所以没触发过逐行错误）。
    (root.querySelector('#save') as HTMLButtonElement).click();
    await flush();

    // ⚠️ 落点 = **用户刚改的那一行**（最后一次按的是「减速」），
    // 不是清单里的第一行 —— 见下一条用例。
    expect(document.activeElement, '焦点必须落在出错的输入框上').toBe(
      inputOf(root, 'decreaseSpeed'),
    );
  });

  /**
   * 冲突时焦点必须落在**用户刚改的那一行**。
   *
   * ⚠️ 之前永远落在第一行（SHORTCUT_DEFINITIONS 的顺序）：
   * 用户改的是第 7 行（网页全屏），焦点却被送到第 1 行（加速）——
   * 视口滚回页面顶部，他正在改的那一行滚出屏幕。
   */
  it('冲突时焦点落在用户刚改的那一行，不是第一行', async () => {
    const { render } = createChromeMock();
    const root = await render();

    // 第 7 行（网页全屏）按 '=' —— 与第 1 行「加速」的默认键相同。
    press(inputOf(root, 'fullscreen'), '=');

    (root.querySelector('#save') as HTMLButtonElement).click();
    await flush();

    expect(
      document.activeElement,
      '焦点必须留在用户刚改的那一行（网页全屏），而不是被送到第一行（加速）',
    ).toBe(inputOf(root, 'fullscreen'));
  });

  /**
   * 聚焦冲突的那一行时，框里**不能是空的**。
   *
   * ⚠️ 之前 focus 处理把 value 清空，于是被聚焦的那一格是空的 ——
   * 用户看到的框里什么都没有，只有一行「与『加速』重复」。
   */
  it('聚焦冲突的那一行时，输入框里还看得到当前绑定的键', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'fullscreen'), '=');
    (root.querySelector('#save') as HTMLButtonElement).click();
    await flush();

    const focused = document.activeElement as HTMLInputElement;
    expect(focused.value, '聚焦时框里必须有值（不能被清空）').not.toBe('');
    expect(focused.value).toBe('=');
  });

  /**
   * 行的错误文案里要带上**撞的那个键**。
   *
   * ⚠️ 之前只写「与『加速』重复」：用户知道自己撞了谁，
   * 却不知道自己按的是哪个键 —— 框里的字又被清空了，完全无从判断。
   */
  it('行的错误文案里带上了撞的那个键', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'fullscreen'), '=');

    const errorNode = document.getElementById('error-fullscreen');
    expect(errorNode?.textContent ?? '').toContain('=');
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

/**
 * 页面上的**动作行**要各归各位。
 *
 * ⚠️ 「使用引导」那张卡片原来夹在快捷键表与快捷键表的「保存」按钮之间：
 * 读完 7 行表格，视线往下一扫是「使用引导 / 重新显示使用引导」，
 * 再往下才是「恢复默认 / 保存」—— 两件不相干的事共用一条动作行；
 * 而且它跟快捷键表用的是同一个 .vsc__card，看上去像是快捷键表的一部分。
 *
 * ⚠️ 它的**位置**改过一次，改的理由跟上面那条**不是**一回事：
 * 那条要的是「引导不与快捷键表混为一谈」（靠视觉层级解决），
 * 而动作条要的是「保存按钮永远在视口底」（靠结构解决）。
 * 两者一度互相打架：动作条排在最后，sticky 才吸得住底；
 * 而动作条排在最后，「使用引导」就又落在快捷键表与「保存」之间了。
 *
 * 现在的解法是**两边都满足**：
 *   - 动作条是 <main> 的**最后一个**元素 → sticky 真的吸得住底；
 *   - 「使用引导」**不再套** .vsc__card → 它不与快捷键表混为一谈；
 *   - 动作条本身是**吸在视口底**的一条独立操作条（不是表格的页脚）
 *     → 视觉上它与页面内容分层，不再与「使用引导」共用一条行。
 *
 * ⚠️ jsdom 没有布局，量不了「离视口底几像素」——
 * 那条**行为**守卫在 `tests/e2e/options-page.spec.js`（真浏览器）。
 * 这里守的是它的**结构前提**：动作条必须是最后一个元素。
 */
describe('设置页：动作行的位置', () => {
  it('动作条是 <main> 的最后一个元素（sticky 吸得住底的前提）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const main = root.querySelector('main')!;
    const actions = root.querySelector('.vsc__actions')!;
    const rows = root.querySelector('#rows')!;

    // ⚠️ 这是硬约束，不是排版偏好：
    // position: sticky; bottom: 0 只有在它是包含块里**最后一个**流内元素时
    // 才吸得住底。它后面若还有元素，滚到页面底部时它会被顶离视口底边。
    expect(
      main.lastElementChild,
      '动作条必须是 <main> 的最后一个元素',
    ).toBe(actions);
    // 快捷键表仍然在动作条之前。
    expect(
      rows.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
      '快捷键表必须在动作行之前',
    ).toBeTruthy();
  });

  it('「使用引导」不再套那张跟快捷键表一样的白卡片', async () => {
    const { render } = createChromeMock();
    const root = await render();

    // ⚠️ 同一个 .vsc__card 会让用户以为它管的是快捷键。
    expect(root.querySelector('#hint')?.classList.contains('vsc__card')).toBe(false);
    // 但它仍然必须**看得见**（不能被 display:none 藏起来）。
    expect(root.querySelector('#reset-hint')).not.toBeNull();
  });
});
