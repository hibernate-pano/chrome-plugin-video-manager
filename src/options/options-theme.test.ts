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
 * 文字对比度：正文 ≥ 4.5:1，次要文字 ≥ 3:1。
 *
 * 分档的依据是简报里的口径（正文 4.5 / 次要 3），不是「WCAG AA 全绿」——
 * 简报同时要求「浅色模式的观感必须和现在一致」，而 6.0.8 的弱化说明文字
 * （#737d8c on #f5f6f8）实测只有 3.85:1。把它提到 4.5:1 必须改浅色的观感，
 * 那是简报明确禁止的。所以浅色的弱化档按 ≥3:1 验收，并在报告里如实记下差距。
 */
const TEXT_PAIRS: Array<{ label: string; fg: keyof Palette; bg: keyof Palette; min: number }> = [
  { label: '正文 / 页面底色', fg: 'text', bg: 'bg', min: 4.5 },
  { label: '正文 / 卡片', fg: 'text', bg: 'surface', min: 4.5 },
  { label: '正文 / 输入框', fg: 'text', bg: 'fieldBg', min: 4.5 },
  { label: '次要说明 / 页面底色', fg: 'muted', bg: 'bg', min: 3 },
  { label: '次要说明 / 卡片', fg: 'muted', bg: 'surface', min: 3 },
  { label: '弱化说明 / 页面底色', fg: 'mutedWeak', bg: 'bg', min: 3 },
  { label: '弱化说明 / 卡片', fg: 'mutedWeak', bg: 'surface', min: 3 },
  { label: '弱化说明 / 输入框', fg: 'mutedWeak', bg: 'fieldBg', min: 3 },
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

  it('浅色模式的观感与 6.0.8 完全一致', () => {
    // 逐个值锁死：深色模式是**新增**，不允许顺手改浅色的观感。
    // 这些值就是 6.0.8 的 options/index.ts 里那套 CSS 的原值。
    expect(LIGHT_PALETTE).toEqual({
      bg: '#f5f6f8',
      surface: '#ffffff',
      fieldBg: '#fbfbfc',
      text: '#1e2430',
      muted: '#5b6473',
      mutedWeak: '#737d8c',
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
