/**
 * 设置页配色。
 *
 * 拆成独立模块而不是把颜色写在 index.ts 的样式字符串里，是为了让「深色模式对比度」
 * 变成**可测量的**：测试直接拿这里的调色板算 WCAG 相对亮度，
 * 而不是去正则解析一坨 CSS 字符串（那种测试只会给自己一种安全感）。
 *
 * 结构性约束：layoutCss() 里不允许出现任何硬编码颜色，
 * 全部走 var(--vsc-*)。新增颜色必须先进调色板，否则深色模式必然漏一处。
 */

/** 调色板键 → CSS 自定义属性名。 */
export const PALETTE_KEYS = [
  'bg',
  'surface',
  'fieldBg',
  'text',
  'muted',
  'mutedWeak',
  'border',
  'divider',
  'borderStrong',
  'borderHover',
  'accent',
  'accentHover',
  'accentText',
  'focus',
  'dangerBg',
  'dangerText',
  'dangerBorder',
] as const;

export type PaletteKey = typeof PALETTE_KEYS[number];

export type Palette = Record<PaletteKey, string>;

const CSS_VARS: Record<PaletteKey, string> = {
  bg: '--vsc-bg',
  surface: '--vsc-surface',
  fieldBg: '--vsc-field-bg',
  text: '--vsc-text',
  muted: '--vsc-muted',
  mutedWeak: '--vsc-muted-weak',
  border: '--vsc-border',
  divider: '--vsc-divider',
  borderStrong: '--vsc-border-strong',
  borderHover: '--vsc-border-hover',
  accent: '--vsc-accent',
  accentHover: '--vsc-accent-hover',
  accentText: '--vsc-accent-text',
  focus: '--vsc-focus',
  dangerBg: '--vsc-danger-bg',
  dangerText: '--vsc-danger-text',
  dangerBorder: '--vsc-danger-border',
};

/**
 * 浅色调色板 —— **与 6.0.8 的观感逐像素一致**，一个值都没改。
 *
 * 颜色不是随手挑的，每个值都有实测的对比度（见 options-theme.test.ts）：
 * 正文 14.38:1、次要说明 5.52:1、主按钮文字 5.47:1、危险文字 4.84:1。
 * 改任何一个值之前先跑那条测试。
 *
 * ── 品牌色决策（重要，别改）─────────────────────────────────────────
 * 品牌色家族 = **绿松石 teal-cyan**。三处界面的主色是同一个家族的三个明度，
 * 不是三种不同的颜色：
 *   - 扩展图标：绿色渐变 #4ade80 → #15803d（商店素材已发布，不动）
 *   - 内容控制条：青色 #67e8f9（深底上 14.49:1，不动）
 *   - 设置页强调色：墨绿 #0f766e（浅底上 5.47:1，不动）
 * 三者同属绿松石家族，深浅不同但色相一致，所以用户看到的是「同一个产品的三种颜色」，
 * 而不是「三个产品」。
 *
 * 想统一成第四种颜色之前先想清楚：改图标要重截 5 张商店图 + 3 个尺寸 + promo tile，
 * 改内容控制条要动已发布的素材。**这个变量存在的意义是让下一个人知道这是有意为之，
 * 而不是「好心」把它改成第四种颜色。**
 */
export const LIGHT_PALETTE: Palette = {
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
};

/**
 * 深色调色板 —— 6.0.9 新增，浅底那套原样保留。
 *
 * 深色下不是把浅色值「反过来」就行：浅底的墨绿 #0f766e 在深底上只有 3.1:1，
 * 直接用会变成一块看不清的深绿。所以强调色换到绿松石 #2dd4bf（深底上 9.08:1），
 * 危险色换成更亮的琥珀 #f6c453（9.40:1）。
 */
export const DARK_PALETTE: Palette = {
  bg: '#12161c',
  surface: '#1a1f27',
  fieldBg: '#151a21',
  text: '#e7ebf1',
  muted: '#a6b0be',
  mutedWeak: '#9ba5b4',
  border: '#333b46',
  divider: '#2b323c',
  borderStrong: '#626d7d',
  borderHover: '#828c9c',
  accent: '#2dd4bf',
  accentHover: '#5eead4',
  accentText: '#04211f',
  focus: '#2dd4bf',
  dangerBg: '#2e2410',
  dangerText: '#f6c453',
  dangerBorder: '#b07a1e',
};

/** 把调色板渲染成一段 CSS 变量声明。 */
const paletteBlock = (selector: string, palette: Palette): string => {
  const lines = PALETTE_KEYS.map((key) => `  ${CSS_VARS[key]}: ${palette[key]};`).join('\n');
  return `${selector} {\n${lines}\n}`;
};

/**
 * 变量声明部分：浅色是默认值，深色用媒体查询覆盖。
 *
 * 深色覆盖写在 :root 而不是 [data-theme='dark'] 上：
 * 系统切深色时页面必须自己跟着变，用户不该为了看一眼设置页去改系统主题。
 *
 * color-scheme 跟着系统走（light dark）：只写 light 时，深色系统下滚动条、
 * 原生表单控件、焦点环仍是浅色，页面像贴上去的一块白纸。
 */
export const paletteCss = (): string =>
  [
    ':root {',
    '  color-scheme: light dark;',
    '}',
    '',
    paletteBlock(':root', LIGHT_PALETTE),
    '',
    '@media (prefers-color-scheme: dark) {',
    paletteBlock('  :root', DARK_PALETTE).split('\n').map((line) => `  ${line}`).join('\n'),
    '}',
  ].join('\n');

/**
 * 布局与组件样式。
 *
 * 这里**只允许出现 var(--vsc-*)**，不允许出现任何颜色字面量：
 * 硬编码的半透明色（rgba(...)/#xxx）在深色背景下会直接失效，
 * 而这类问题在浅色下永远看不出来，只有真的切到深色才会暴露。
 */
export const layoutCss = (): string => `
body {
  margin: 0;
  background: var(--vsc-bg);
  color: var(--vsc-text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.vsc {
  max-width: 640px;
  margin: 0 auto;
  padding: 56px 24px 64px;
}

.vsc__title {
  margin: 0;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.vsc__subtitle {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--vsc-muted);
}

.vsc__lead {
  margin: 10px 0 0;
  max-width: 46ch;
  font-size: 14px;
  line-height: 1.65;
  color: var(--vsc-muted);
}

.vsc__card {
  margin-top: 28px;
  border: 1px solid var(--vsc-border);
  border-radius: 16px;
  background: var(--vsc-surface);
  overflow: hidden;
}

.vsc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vsc-divider);
}

.vsc__row:last-child {
  border-bottom: none;
}

.vsc__row-label {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.vsc__row-desc {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--vsc-muted-weak);
}

.vsc__key {
  flex: none;
  width: 168px;
  padding: 9px 12px;
  border: 1px solid var(--vsc-border-strong);
  border-radius: 10px;
  background: var(--vsc-field-bg);
  color: var(--vsc-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}

.vsc__key:focus-visible {
  outline: 2px solid var(--vsc-focus);
  outline-offset: 2px;
}

.vsc__key.vsc--conflict {
  border-color: var(--vsc-danger-border);
  background: var(--vsc-danger-bg);
  color: var(--vsc-danger-text);
}

.vsc__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 22px;
}

.vsc__status {
  margin-right: auto;
  font-size: 13px;
  color: var(--vsc-muted-weak);
  min-height: 18px;
}

.vsc__status.vsc--error {
  color: var(--vsc-danger-text);
}

.vsc__button {
  padding: 9px 16px;
  border: 1px solid var(--vsc-border-strong);
  border-radius: 10px;
  background: var(--vsc-surface);
  color: var(--vsc-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.vsc__button:hover {
  border-color: var(--vsc-border-hover);
}

.vsc__button--primary {
  border-color: var(--vsc-accent);
  background: var(--vsc-accent);
  color: var(--vsc-accent-text);
}

.vsc__button--primary:hover {
  background: var(--vsc-accent-hover);
  border-color: var(--vsc-accent-hover);
}

.vsc__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--vsc-divider);
  font-size: 12.5px;
  color: var(--vsc-muted-weak);
}

.vsc__version {
  font-variant-numeric: tabular-nums;
}

.vsc__sep {
  color: var(--vsc-border-strong);
}

.vsc__link {
  color: var(--vsc-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.vsc__link:hover {
  color: var(--vsc-accent);
}

@media (max-width: 560px) {
  .vsc__row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .vsc__key {
    width: auto;
  }
}
`;

/** 设置页完整样式：变量声明 + 布局。 */
export const themeCss = (): string => `${paletteCss()}\n\n${layoutCss()}`;
