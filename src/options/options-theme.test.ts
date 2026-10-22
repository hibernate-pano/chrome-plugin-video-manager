import { describe, expect, it } from 'vitest';
import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  layoutCss,
  paletteCss,
  PALETTE_KEYS,
  type Palette,
} from './options-theme';

/**
 * 配色对比度守护。
 *
 * 这条测试存在的理由：深色模式是「加」出来的，不是「重设计」出来的，
 * 而加主题最容易出的错就是**漏改一处硬编码颜色** —— 浅色下完全看不出来，
 * 只有真的切到系统深色才会发现那一块是白的。
 * 所以这里不只测「几个关键组合达不达标」，还测「CSS 里根本没有硬编码颜色」。
 */

/** WCAG 相对亮度。 */
const relativeLuminance = (hex: string): number => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);

  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 对比度。 */
const contrastRatio = (a: string, b: string): number => {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const round = (value: number) => Math.round(value * 100) / 100;

const ratioOf = (palette: Palette, fg: keyof Palette, bg: keyof Palette) =>
  round(contrastRatio(palette[fg], palette[bg]));

/**
 * 文字对比度：正文 ≥ 4.5:1，次要文字 ≥ 3:1，弱化说明 ≥ 5:1。
 *
 * ⚠️ 弱化说明这一档在 6.1.0 之前是 ≥3:1 —— 依据是当时的简报
 * 「浅色模式的观感必须和现在一致」，而 6.0.8 的弱化说明文字
 * （#737d8c on #f5f6f8）实测只有 3.85:1，连 AA 对正文的 4.5:1 都不到。
 *
 * 那段文字（每个动作下面那行说明）是**正文**：读者要靠它判断这个动作
 * 会做什么，不是装饰。现在的口径是 5:1（三处底色都过），
 * 对应浅色弱化档 #737d8c → #616976 的调深。
 */
const TEXT_PAIRS: Array<{ label: string; fg: keyof Palette; bg: keyof Palette; min: number }> = [
  { label: '正文 / 页面底色', fg: 'text', bg: 'bg', min: 4.5 },
  { label: '正文 / 卡片', fg: 'text', bg: 'surface', min: 4.5 },
  { label: '正文 / 输入框', fg: 'text', bg: 'fieldBg', min: 4.5 },
  { label: '次要说明 / 页面底色', fg: 'muted', bg: 'bg', min: 3 },
  { label: '次要说明 / 卡片', fg: 'muted', bg: 'surface', min: 3 },
  { label: '弱化说明 / 页面底色', fg: 'mutedWeak', bg: 'bg', min: 5 },
  { label: '弱化说明 / 卡片', fg: 'mutedWeak', bg: 'surface', min: 5 },
  { label: '弱化说明 / 输入框', fg: 'mutedWeak', bg: 'fieldBg', min: 5 },
  { label: '主按钮文字 / 主按钮底色', fg: 'accentText', bg: 'accent', min: 4.5 },
  { label: '主按钮悬停文字 / 悬停底色', fg: 'accentText', bg: 'accentHover', min: 4.5 },
  { label: '错误提示 / 页面底色', fg: 'dangerText', bg: 'bg', min: 4.5 },
  { label: '冲突行文字 / 冲突底色', fg: 'dangerText', bg: 'dangerBg', min: 4.5 },
];

/**
 * 非文本对比（焦点环、控件边框）：WCAG 1.4.11 要求 3:1。
 *
 * 只对深色模式设这条线：深色是全新设计的，可以一步到位；
 * 浅色沿用 6.0.8 的边框色（#d6dae0 on #fbfbfc = 1.36:1），
 * 把它提到 3:1 必须改浅色观感，简报明确禁止。
 */
const NON_TEXT_PAIRS: Array<{ label: string; fg: keyof Palette; bg: keyof Palette; min: number }> = [
  { label: '焦点环 / 页面底色', fg: 'focus', bg: 'bg', min: 3 },
  { label: '焦点环 / 卡片', fg: 'focus', bg: 'surface', min: 3 },
  { label: '输入框边框 / 输入框底色', fg: 'borderStrong', bg: 'fieldBg', min: 3 },
  { label: '输入框边框 / 卡片', fg: 'borderStrong', bg: 'surface', min: 3 },
  { label: '按钮边框 / 卡片', fg: 'borderStrong', bg: 'surface', min: 3 },
  { label: '冲突行边框 / 卡片', fg: 'dangerBorder', bg: 'surface', min: 3 },
];

describe('设置页配色对比度', () => {
  it.each([
    { name: '浅色', palette: LIGHT_PALETTE },
    { name: '深色', palette: DARK_PALETTE },
  ])('$name 模式：正文与次要文字达到简报要求', ({ palette }) => {
    TEXT_PAIRS.forEach(({ label, fg, bg, min }) => {
      const ratio = ratioOf(palette, fg, bg);
      expect(
        ratio,
        `${label}（${palette[fg]} on ${palette[bg]}）对比度只有 ${ratio}:1，低于 ${min}:1`,
      ).toBeGreaterThanOrEqual(min);
    });
  });

  it('深色模式：所有文字档都达到 WCAG AA 的 4.5:1', () => {
    // 深色是新增的，没必要继承浅色那些「差一点」的档位：
    // 这里给每一档都要求 4.5:1。
    TEXT_PAIRS.forEach(({ label, fg, bg }) => {
      const ratio = ratioOf(DARK_PALETTE, fg, bg);
      expect(ratio, `深色模式下 ${label} 只有 ${ratio}:1`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('深色模式：焦点环与控件边框达到 3:1', () => {
    NON_TEXT_PAIRS.forEach(({ label, fg, bg, min }) => {
      const ratio = ratioOf(DARK_PALETTE, fg, bg);
      expect(
        ratio,
        `深色模式下 ${label}（${DARK_PALETTE[fg]} on ${DARK_PALETTE[bg]}）只有 ${ratio}:1`,
      ).toBeGreaterThanOrEqual(min);
    });
  });

  it('浅色模式的观感与 6.0.8 一致，只有弱化说明色被调深过', () => {
    // 逐个值锁死：深色模式是**新增**，不允许顺手改浅色的观感。
    // 这些值就是 6.0.8 的 options/index.ts 里那套 CSS 的原值，
    // 唯一例外是 mutedWeak —— 6.1.0 把它从 #737d8c 调深到 #616976，
    // 因为它承载的是**正文**（每个动作的说明），4.17:1 连 AA 都不到。
    expect(LIGHT_PALETTE).toEqual({
      bg: '#f5f6f8',
      surface: '#ffffff',
      fieldBg: '#fbfbfc',
      text: '#1e2430',
      muted: '#5b6473',
      mutedWeak: '#616976',
      border: '#e3e6ea',
      divider: '#eef0f2',
      borderStrong: '#d6dae0',
      borderHover: '#b9bfc8',
      accent: '#0f766e',
      accentHover: '#115e59',
      accentText: '#ffffff',
      focus: '#0f766e',
      dangerBg: '#fffbeb',
      dangerText: '#b45309',
      dangerBorder: '#d97706',
    });
  });

  it('弱化说明色在三处底色上都达到 5:1（AA 正文线之上再留一点余量）', () => {
    // 这条单独钉住：它曾经是 4.17:1（白底）/ 3.85:1（页面底色），
    // 是一处**看得见的**可读性缺陷，不是审美偏好。
    expect(contrastRatio(LIGHT_PALETTE.mutedWeak, LIGHT_PALETTE.surface)).toBeGreaterThanOrEqual(5);
    expect(contrastRatio(LIGHT_PALETTE.mutedWeak, LIGHT_PALETTE.bg)).toBeGreaterThanOrEqual(5);
    expect(contrastRatio(LIGHT_PALETTE.mutedWeak, LIGHT_PALETTE.fieldBg)).toBeGreaterThanOrEqual(5);
  });

  it('深色模式的强调色在深底上达标，且与浅色的强调色同族', () => {
    // 品牌色 = 绿松石家族：图标绿 / 内容青 / 设置墨绿。
    // 深色下墨绿 #0f766e 只有 3.1:1（不可用），所以换成同族的绿松石 #2dd4bf。
    expect(DARK_PALETTE.accent).toBe('#2dd4bf');
    expect(contrastRatio('#2dd4bf', DARK_PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
    // 浅色下的品牌墨绿不能被动。
    expect(LIGHT_PALETTE.accent).toBe('#0f766e');
  });

  it('布局 CSS 里不残留任何硬编码颜色', () => {
    // 硬编码的半透明色（rgba(...)/#xxx）在深色背景下会直接失效，
    // 而这类问题在浅色下永远看不出来。所以这里直接禁掉颜色字面量。
    const css = layoutCss();

    const hexColors = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexColors, `布局 CSS 里还有硬编码颜色：${hexColors.join(', ')}`).toEqual([]);

    const functionalColors = css.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g) ?? [];
    expect(functionalColors, `布局 CSS 里还有硬编码颜色函数：${functionalColors.join(', ')}`).toEqual([]);
  });

  /**
   * 操作条必须**吸底**。
   *
   * ⚠️ 为什么这条在单测里守（而不是只靠 e2e）：
   * 「保存按钮永远看得见」这条产品承诺的**根因**就是
   * position: sticky; bottom: 0 —— 它与文案长度无关，是结构性保证。
   * e2e 那条守的是「在当前这版文案下看得见」，那是**结果**；
   * 这条守的是**原因**。
   *
   * 少了这一行，页面一长（英文文案、窄屏、翻译改长），
   * 保存按钮就会重新沉到折叠线以下 —— 而「整页装得下 800px」
   * 那条 e2e 守卫**测不到**这件事（它只测当前文案）。
   */
  it('操作条是吸底的（position: sticky; bottom: 0）', () => {
    const css = layoutCss();

    // 取出 .vsc__actions 这一条规则。
    const rule = css.match(/\.vsc__actions\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, '布局 CSS 里找不到 .vsc__actions 规则').not.toBe('');

    expect(
      rule,
      '.vsc__actions 不是 sticky —— 保存按钮会跟着内容沉到折叠线以下',
    ).toMatch(/position:\s*sticky/);
    expect(
      rule,
      '.vsc__actions 没有 bottom: 0 —— 它不会贴在视口底边',
    ).toMatch(/bottom:\s*0/);

    // ⚠️ 吸底条必须**不透明**：半透明的话它盖住的卡片会从底下透出来，
    // 看着像渲染坏了。
    expect(
      rule,
      '.vsc__actions 没有不透明背景 —— 吸底条会透出底下的卡片',
    ).toMatch(/background:\s*var\(--vsc-bg\)/);
  });

  /**
   * 焦点环：**输入框、按钮、链接**用同一套。
   *
   * 之前只有输入框有 :focus-visible，按钮与链接走浏览器默认焦点环 ——
   * 同一页两种颜色（品牌墨绿 / Chrome 默认蓝）、两种粗细（2px / 1px）。
   *
   * ⚠️ 这里守的是「**规则本身**」（哪几个选择器、什么颜色、粗细），
   * 真实渲染出来的 computed style 由 e2e 守
   * （tests/e2e/options-layout.spec.js）—— jsdom 没有布局引擎，
   * :focus-visible 在 jsdom 里也永远不会匹配。
   */
  it('焦点环规则同时覆盖输入框、按钮与链接', () => {
    const css = layoutCss();

    // 找出所有带 :focus-visible 的规则块。
    const focusRules = [...css.matchAll(/([^{}]+:focus-visible[^{}]*)\{([^}]*)\}/g)];
    expect(
      focusRules.length,
      '布局 CSS 里没有任何 :focus-visible 规则 —— 焦点环全靠浏览器默认',
    ).toBeGreaterThan(0);

    // 所有这些选择器合起来，必须同时点到三个类。
    const selectors = focusRules.map((match) => match[1]).join(',');
    ['.vsc__key', '.vsc__button', '.vsc__link'].forEach((selector) => {
      expect(
        selectors,
        `焦点环规则没有覆盖 ${selector} —— 它会走浏览器默认焦点环（蓝 1px）`,
      ).toContain(selector);
    });

    // 每一处焦点环都必须用调色板里的 focus 变量，不硬编码颜色。
    focusRules.forEach((match) => {
      expect(
        match[2],
        `焦点环规则「${match[1].trim()}」没有用 var(--vsc-focus)`,
      ).toMatch(/outline:\s*2px solid var\(--vsc-focus\)/);
    });
  });

  /**
   * lead 段**不限宽**（与下面那张 640px 的卡片对齐）。
   *
   * 原来是 max-width: 46ch —— 中文里只装得下 23 个汉字，
   * 实测宽度 405.6px 而卡片是 640px：那段说明只占满卡片宽度的 63%，
   * 右边空一大块，看着像「这块的排版没做完」。
   *
   * ⚠️ 这里守「规则里没有 ch 限宽」；真实宽度由 e2e 量
   * （getBoundingClientRect）—— jsdom 算不出 ch 换算成多少像素。
   */
  it('lead 段不限宽（与卡片对齐）', () => {
    const css = layoutCss();

    const rule = css.match(/\.vsc__lead\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, '布局 CSS 里找不到 .vsc__lead 规则').not.toBe('');

    // ⚠️ ch / em 限宽在不同字体下换算不同，而且会跟卡片对不齐。
    expect(
      rule,
      '.vsc__lead 还在用 ch 限宽 —— 它与卡片右边缘对不齐',
    ).not.toMatch(/max-width:\s*\d+(?:\.\d+)?ch/);
  });

  it('所有颜色都来自调色板声明的变量，没有「声明了但没用上」的多余变量', () => {
    const css = `${paletteCss()}\n${layoutCss()}`;

    const declared = new Set(
      [...css.matchAll(/(--vsc-[a-z-]+)\s*:/g)].map((match) => match[1] as string),
    );
    const used = new Set([...css.matchAll(/var\((--vsc-[a-z-]+)\)/g)].map((match) => match[1] as string));

    used.forEach((name) => {
      expect(declared.has(name), `CSS 用了未声明的变量 ${name}`).toBe(true);
    });

    // 调色板里的每个键都必须真的用上：
    // 一个没被任何规则用到的变量，就是一处「加了却没接线」的调色板项。
    PALETTE_KEYS.forEach((key) => {
      const varName = `--vsc-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(declared.has(varName), `调色板键 ${key} 没有对应变量 ${varName}`).toBe(true);
      expect(used.has(varName), `变量 ${varName} 声明了但没有任何规则用它`).toBe(true);
    });
  });

  it('深色覆盖了每一个变量：漏一个就是那个元素在深色下还是浅色', () => {
    const css = paletteCss();
    const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));

    PALETTE_KEYS.forEach((key) => {
      const varName = `--vsc-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(darkBlock, `深色块里没有 ${varName}`).toContain(`${varName}:`);
    });
  });

  it('页面声明了 color-scheme: light dark，跟随系统', () => {
    // 只写 light 时，滚动条、原生表单控件、焦点环仍是浅色，与页面割裂。
    expect(paletteCss()).toContain('color-scheme: light dark');
  });

  it.each([
    { name: '浅色', palette: LIGHT_PALETTE },
    { name: '深色', palette: DARK_PALETTE },
  ])('$name 模式：弱化档比次要档更弱（层级关系不能反）', ({ name, palette }) => {
    // 绝对对比度达标**不等于**层级关系正确。
    // 反过来也是真问题：弱化说明文字比次要说明文字更醒目，读者会以为
    // 它更重要，而它其实是可有可无的补充说明。
    //
    // 判据用**与底色的对比度比值**，而不是相对亮度：
    // 「谁更弱」的方向在浅底和深底上是相反的（浅底上更暗=更弱，
    // 深底上更亮=更弱），只有对比度比值是方向无关的统一口径。
    const mutedRatio = contrastRatio(palette.muted, palette.bg);
    const mutedWeakRatio = contrastRatio(palette.mutedWeak, palette.bg);

    expect(
      mutedWeakRatio,
      `${name} 模式下弱化档 ${palette.mutedWeak} 与底色的对比度 ` +
        `${mutedWeakRatio.toFixed(2)}:1 不该高于次要档 ${palette.muted} 的 ${mutedRatio.toFixed(2)}:1`,
    ).toBeLessThan(mutedRatio);

    // 正文必须比次要档更醒目。
    expect(contrastRatio(palette.text, palette.bg)).toBeGreaterThan(mutedRatio);
  });
});
