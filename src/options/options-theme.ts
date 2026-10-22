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
 * 浅色调色板 —— 与 6.0.8 的观感一致，**只有弱化说明色一档被调深**。
 *
 * 颜色不是随手挑的，每个值都有实测的对比度（见 options-theme.test.ts）：
 * 正文 14.38:1、次要说明 5.52:1、主按钮文字 5.47:1、危险文字 4.84:1。
 * 改任何一个值之前先跑那条测试。
 *
 * ── 弱化说明色为什么被调深（6.1.0）────────────────────────────────────
 * 原值 #737d8c 在卡片白底上只有 4.17:1、在页面底色上只有 3.85:1 ——
 * 都低于 WCAG AA 对正文要求的 4.5:1。这段文字（每个动作下面那行说明）
 * 是**正文**而不是装饰，读者要靠它判断这个动作会做什么。
 *
 * 调深到 #616976：白底 5.54:1 / 页面底色 5.12:1 / 输入框底 5.36:1，
 * 三处都过 5:1 这条线（比 AA 更宽，留一点余量）。
 *
 * ⚠️ 上限是「次要档」的对比度：弱化档必须**仍然弱于**次要档（5.52:1），
 * 否则层级关系反了 —— 读者会以为可有可无的补充说明比正经说明更重要。
 * 5.12 < 5.52，这条不变量由 options-theme.test.ts 守着。
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

/*
 * 设置页要塞进 1280×800 的**一屏**里。
 *
 * 为什么要紧：页脚那行「版本 / 隐私政策 / 源码仓库」被挤到视口外时，
 * 商店截图上就只剩半截字，看着像渲染坏了。而设置页的内容是固定的
 * （标题 + 说明 + 7 行 + 按钮 + 页脚），高度只随文案长度变一点。
 *
 * ⚠️ 原来那条不变量**从来没成立过**：它只写在注释里。
 * 实测 1280×800 下 scrollHeight 943 > 800，「保存」按钮（top 815）
 * 与「有未保存的更改」状态栏（top 825）整条都在折叠线以下 ——
 * 用户改完键抬头，视口里**没有任何**「你还没保存」的信号。
 *
 * 现在是**两道**保证，缺一不可：
 *
 * 1) 间距收紧（下面这一堆 padding / margin / 行距）—— 让 1280×800
 *    在中英文两种文案下都装得下整页，页脚不会被切成半截字。
 *    ⚠️ 这一道**依赖文案长度**：英文比中文长，文案再变长就会再次破功。
 *
 * 2) .vsc__actions 用 position: sticky; bottom: 0（见下）—— 操作条
 *    永远贴在视口底部，页面多长都看得见「保存」与未保存提示。
 *    这一道**不依赖文案长度**，是结构性的保证。
 *    ⚠️ 但它有**前提**：sticky 只在它是包含块里**最后一个**流内元素时才吸得住底。
 *    它后面若还有元素，滚到页面底部时它会被顶起来、脱离视口底边；
 *    而在不滚动的视口（1280×800 正好装下）里它根本不吸 —— 孤零零悬在页面中间。
 *    所以它必须排在 <main> 的**最后**（见 src/options/index.ts 的模板）。
 *
 * 两道的分工：第 1 道负责「好看且完整」（页脚不被切半截），
 * 第 2 道负责「**反馈永远在**」（不管文案多长都不会漏掉）。
 * 只有第 1 道的话，英文文案或未来一次翻译改动就会把保存按钮顶到屏外。
 */
.vsc {
  /*
   * ⚠️ 内边距写成变量，是因为下面那个 min-height 要跟它**对齐**。
   *
   * 这里没有全局的 box-sizing: border-box（加了会把内容宽从 640 变成 592），
   * 所以 min-height 指的是**内容盒**的高度：容器总高 = 内容盒 + 上下内边距。
   * 要让总高正好等于一屏，min-height 就得减掉上下内边距 ——
   * 写死 calc(100vh - 20px) 的话，将来有人改了内边距就会静默错位。
   */
  --vsc-pad-x: 24px;
  --vsc-pad-top: 20px;
  max-width: 640px;
  margin: 0 auto;
  padding: var(--vsc-pad-top) var(--vsc-pad-x) 0;
  /*
   * ⚠️ min-height + flex 那一套是为了让**操作条真的贴住窗口底**。
   *
   * 只把 sticky 摆上去是不够的：内容不满一屏时（1280×800 正好装下），
   * sticky 根本不生效，操作条会停在内容末尾 —— 下面留一条空白，
   * 看着像「布局没做完」。
   *
   * min-height 让容器至少有一屏高，flex 列 + 操作条的 margin-top: auto
   * 把多余的空间全吃掉，操作条落到容器底 = 视口底。
   * 内容超过一屏时 auto 归零，操作条回到文档末尾，sticky 接手把它钉在视口底。
   */
  min-height: calc(100vh - var(--vsc-pad-top));
  display: flex;
  flex-direction: column;
}

.vsc__title {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.vsc__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--vsc-muted);
}

/*
 * 不限宽：与下面那张 640px 的卡片**同宽**、右侧对齐。
 *
 * 原来是 max-width: 46ch —— 中文里 46ch 只装得下 23 个汉字，
 * 实测宽度 405.6px，而卡片是 640px：那段说明只占满卡片宽度的 63%，
 * 右边空一大块，看着像「这块的排版没做完」。英文同样。
 *
 * 顺带把高度也省了：中文 712px 的字在 640px 宽下仍是两行（不变），
 * 但英文的 1085px 从三行变成两行，页脚跟着上移 23px。
 */
.vsc__lead {
  margin: 8px 0 0;
  max-width: none;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vsc-muted);
}

/*
 * 「工具栏图标 = 全屏」「Ctrl+Shift+, = 设置页」这两件事原来只写在
 * README 与商店文案里 —— 产品内**一处都没有**。新用户打开设置页，
 * 看不到自己还能从工具栏进全屏。这两行是补上那个缺口。
 */
.vsc__tips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vsc-muted);
}

.vsc__tips-sep {
  color: var(--vsc-border-strong);
}

.vsc__card {
  margin-top: 10px;
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
  padding: 8px 20px;
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
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--vsc-muted-weak);
}

/*
 * 逐行错误与逐行说明。
 *
 * ⚠️ 为什么它们要**就地渲染**：状态栏在页面**最底部**，出错的行在最上面。
 * 读屏用户听到的是一句从页面底部飘上来的话，却不知道是**哪一行**、跟**谁**撞了；
 * 视觉用户也可能隔着十几屏才看见那一句。
 * 所以每一行都挂一个自己的节点，输入框用 aria-describedby 指向它 ——
 * 聚焦到出错的输入框时，错误就在耳边念出来。
 *
 * 用 :not(:empty) 而不是 JS 切 class：没有错误时节点是空的，
 * 空节点不该占位（否则每一行下面都多出一条空白）。
 */
.vsc__row-error,
.vsc__row-note {
  display: none;
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
}

.vsc__row-error:not(:empty),
.vsc__row-note:not(:empty) {
  display: block;
}

.vsc__row-error {
  color: var(--vsc-danger-text);
}

.vsc__row-note {
  color: var(--vsc-muted-weak);
}

.vsc__key {
  flex: none;
  /*
   * 宽度是**两个**东西的共同上限，取两者的最大值：
   *
   * 1. 最长的绑定：Ctrl+Alt+Shift+Meta+PgDn 需要 188px 的内容宽度。
   *    168px 装不下 —— 超出部分被 input 裁掉（实测 clientWidth 192 /
   *    scrollWidth 212），用户看到的是「Ctrl+Alt+Shift+Meta+…」，
   *    分不清自己绑了什么。
   * 2. 聚焦时的占位符：「按下要绑定的键 · Backspace 清空」实测 219px、
   *    英文那版 235px。200px 时占位符会被**裁掉尾巴**
   *    （实测渲染成「按下要绑定的键 · Backspace 清」—— 恰好裁在
   *    「清空」两个字中间），于是「怎么清空」这个隐藏手势的提示
   *    变成半句话。
   *
   * 250px 让两者都完整显示（英文那版还余 15px）。
   */
  width: 250px;
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

/*
 * 焦点环：**全站同一套**。
 *
 * 之前只有输入框有 :focus-visible，按钮与链接走的是浏览器默认焦点环 ——
 * 实测输入框是品牌墨绿（2px 品牌色），按钮却是 Chrome 默认蓝（1px 浏览器色）。
 * 同一页两种颜色、两种粗细，看起来像两套东西拼在一起。
 *
 * 这里统一成「品牌焦点色 + 2px + 2px 偏移」，颜色走调色板里的
 * --vsc-focus（浅色墨绿 / 深色绿松石），不硬编码。
 *
 * ⚠️ 这段注释里**不能**写颜色字面量（函数式写法也不行）：
 * options-theme.test.ts 的「布局 CSS 里不残留任何硬编码颜色」那条守卫
 * 扫的是整段 layoutCss() 字符串，**注释也算**。
 */
.vsc__key:focus-visible,
.vsc__button:focus-visible,
.vsc__link:focus-visible {
  outline: 2px solid var(--vsc-focus);
  outline-offset: 2px;
}

.vsc__key.vsc--conflict {
  border-color: var(--vsc-danger-border);
  background: var(--vsc-danger-bg);
  color: var(--vsc-danger-text);
}

/*
 * 操作条（状态 + 恢复默认 + 保存）。
 *
 * ⚠️ 这一条是「保存按钮永远看得见」的**结构性**保证：
 * position: sticky; bottom: 0 让它贴在视口底部，
 * 页面多长（英文文案、窄屏、翻译变长）都不会把它顶到折叠线以下。
 *
 * 根因不是「页面太高」，而是**反馈位置与操作位置错配**：
 * 改键发生在页面上半部分，而「你还没保存」的提示沉在最底下。
 * 用户改完键抬头，视口里一个信号都没有 —— 只能滚到底部去找。
 *
 * ⚠️ 吸底条必须**不透明**：半透明的话它盖住的卡片会从底下透出来，
 * 看着像渲染坏了。背景色用页面底色（卡片是白的，一眼能看出分层）。
 *
 * ⚠️ 它**是**文档流的最后一个元素（页脚在它**前面**）—— 这不是排版偏好：
 * sticky 只在它是包含块里最后一个流内元素时才吸得住底。
 * 它后面若还有元素，滚到页面底部时它会被顶起来、脱离视口底边。
 * （之前它排在快捷键表之后、页脚之前，于是滚到底时它被顶离视口底 149px，
 * 而在不滚动的 1280×800 里它压根不吸，孤零零悬在页面中间、下面还空 50px。）
 *
 * ⚠️ margin-top: auto 配着 .vsc 的 min-height: 100vh + flex 列 ——
 * 内容不满一屏时，多余空间被它吃掉，操作条落到视口底；
 * 内容超过一屏时 auto 归零，sticky 接手把它钉在视口底。
 *
 * ⚠️ 负外边距是为了让这条**满宽**（连同 .vsc 的左右 padding 一起铺满），
 * 否则半路出现一条 640px 宽的浮空白条，底下的卡片从两侧透出来。
 * 负的只是 margin，padding 保持不变，文字不会贴到屏幕边。
 */
.vsc__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin: auto calc(-1 * var(--vsc-pad-x)) 0;
  padding: 8px var(--vsc-pad-x) 10px;
  position: sticky;
  bottom: 0;
  z-index: 1;
  background: var(--vsc-bg);
  border-top: 1px solid var(--vsc-divider);
  box-shadow: 0 -6px 12px -10px var(--vsc-border-strong);
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
  /*
   * ⚠️ white-space: nowrap 与 flex: none 是**必需**的，不是美化：
   *
   * 之前「重新显示使用引导」这个按钮在 900px 宽的窗口里被压成 122×56
   * —— 文案断成两行（「重新显示使用」/「引导」），而旁边的「保存」只有
   * 38px 高。两个按钮并排、其中一个是两行高，看着像渲染坏了。
   * 窄窗口（420px）下更糟：「恢复默认」被断成「恢复」/「默认」，
   * 「保存 •」被断成「保」/「存 •」。
   *
   * 原因：按钮在 flex 行里**可以被压扁**（默认 flex-shrink: 1），
   * 而按钮里的文字一旦没地方放就会换行。
   */
  flex: none;
  white-space: nowrap;
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

/*
 * 「保存」按钮**永不置灰**。
 *
 * 没有未保存的改动时，它按下去只是把同样的值再写一遍，无害；
 * 而一个灰掉的主按钮在商店截图上看着像「功能坏了」。
 * 「现在有没有东西要存」由按钮文案上的「•」和状态栏那一行表达。
 */
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
  margin-top: 10px;
  padding-top: 8px;
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
