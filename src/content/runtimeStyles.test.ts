import { beforeEach, describe, expect, it } from 'vitest';
import { installRuntimeStyles, SUBTITLE_Z_INDEX } from './runtimeStyles';
import { controlsStyles } from './controlsStyles';

const STYLE_ID = 'vsc-runtime-styles';

/** 注入进页面的那份 CSS 文本。 */
const styleText = () => document.getElementById(STYLE_ID)?.textContent ?? '';

/**
 * 取某条选择器的规则体（`selector { ... }` 里的内容）。
 *
 * 只断言「CSS 里含某个字符串」不够 —— 那分不清是给谁用的。
 * 把规则体抠出来，才能断言「**这一条**规则里有这个值」。
 */
const ruleOf = (css: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matched = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return matched?.[1] ?? '';
};

describe('installRuntimeStyles', () => {
  // 每个用例开始前保证「有一个已注入的节点」，模块内的 styleElement 也指向它。
  beforeEach(() => {
    document.getElementById(STYLE_ID)?.remove();
    installRuntimeStyles();
  });

  it('injects exactly one style node and is idempotent', () => {
    installRuntimeStyles();
    installRuntimeStyles();

    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
  });

  it('re-injects after the node is removed and install is called again', () => {
    const original = document.getElementById(STYLE_ID);
    expect(original).not.toBeNull();

    original!.remove();
    expect(document.getElementById(STYLE_ID)).toBeNull();

    // 改动前用 getElementById 判断，节点被移除后这里会重建；
    // 但自愈的关键是「脱离文档即重建」，见下一个用例。
    installRuntimeStyles();

    const rebuilt = document.getElementById(STYLE_ID);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toBe(original);
    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
  });

  it('re-injects on its own after the node is removed, without another install call', async () => {
    const original = document.getElementById(STYLE_ID)!;

    // 页面（SPA 重建/站点清理）直接把样式摘走，扩展侧没有任何后续调用。
    original.remove();
    expect(document.getElementById(STYLE_ID)).toBeNull();

    // MutationObserver 回调在微任务里跑，等它落地。
    await new Promise((resolve) => setTimeout(resolve, 0));

    const rebuilt = document.getElementById(STYLE_ID);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toBe(original);
    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
  });
});

/**
 * CSS **内容**的守卫。
 *
 * 之前这份文件只断言「节点存在 / 只有一份 / 会被重建」，**从不看 CSS 里写了什么** ——
 * 于是把 `style.textContent = styles` 改成 `''`、把 6 个 z-index 常量全改成 1、
 * 把 live region 的 1px 改成 100px、把整段 prefers-reduced-motion 删掉，
 * 全部照样绿。
 *
 * 单测不适合验渲染效果，但**适合**验「关键规则还在不在、值对不对」。
 */
describe('注入的 CSS 内容', () => {
  beforeEach(() => {
    document.getElementById(STYLE_ID)?.remove();
    installRuntimeStyles();
  });

  it('注入的样式不能是空的', () => {
    // 样式节点在、CSS 是空的 —— 页面上的所有提示都会退化成没有定位的普通文本。
    expect(styleText().length, '样式内容不能为空').toBeGreaterThan(0);
  });

  it('层叠顺序的 z-index 字面量写死在 CSS 里', () => {
    const css = styleText();

    // ⚠️ 期望值必须是**字面量**：拿导出的常量拼出来是重言式 ——
    // 常量一改，CSS 与断言一起变，断言恒成立（这正是之前那条假守卫）。
    //
    // 顺序（全屏时从下到上）：背板 2147483642 < 舞台 = 视频 2147483643
    //                        < 字幕 2147483644 < 控制条 2147483645
    //                        < 一次性提示 2147483647
    expect(ruleOf(css, '#vsc-page-fullscreen-overlay')).toContain('z-index: 2147483642');
    expect(ruleOf(css, '#vsc-page-fullscreen-stage')).toContain('z-index: 2147483643');
    expect(ruleOf(css, '.vsc-page-fullscreen-video')).toContain('z-index: 2147483643');
    expect(ruleOf(css, '#vsc-speed-toast')).toContain('z-index: 2147483647');
    expect(ruleOf(css, '#vsc-takeover-notice')).toContain('z-index: 2147483647');
    expect(ruleOf(css, '#vsc-first-run-hint')).toContain('z-index: 2147483647');
    expect(ruleOf(css, '#vsc-live-region')).toContain('z-index: 2147483647');
  });

  it('控制条那份 CSS 里也有同一个 z-index 字面量', () => {
    // 控制条住在 shadow root 里，样式必须自带一份（见 controlsStyles.ts 的说明）。
    // 它的 z-index 与页面级提示不在同一个样式表里 —— 两边必须对上，
    // 否则全屏时控制条会被提示盖住。
    expect(controlsStyles).toContain('z-index: 2147483645');
  });

  it('字幕那层必须高于视频、低于控制条', () => {
    // 字幕的 z-index 是**内联**写到字幕宿主上的（见 fullscreenController.ts），
    // 不在样式表里 —— 所以这里比的是「层与层的顺序」，边界用字面量卡住。
    //
    // 视频被抬到 2147483643 之后，字幕还是 z-index: auto 就会被整个盖住
    // （6.0.8 号称修好的问题，实测从未生效）。
    expect(SUBTITLE_Z_INDEX, '字幕必须高于视频').toBeGreaterThan(2147483643);
    expect(SUBTITLE_Z_INDEX, '字幕必须低于控制条').toBeLessThan(2147483645);
  });

  it('live region 必须被压到 1px 并 clip 掉', () => {
    const rule = ruleOf(styleText(), '#vsc-live-region');

    // 它是产品**唯一**对读屏用户可用的反馈通道。
    // 尺寸不打穿的话，页面上会多出一个空白块挡着内容。
    expect(rule, 'live region 的规则必须在').not.toBe('');
    expect(rule, '宽度必须压到 1px').toContain('width: 1px');
    expect(rule, '高度必须压到 1px').toContain('height: 1px');
    // clip 与 clip-path 一起用：前者是老写法，后者是现代写法。
    expect(rule, '必须 clip 掉').toContain('clip: rect(0 0 0 0)');
    expect(rule, '必须 clip-path 掉').toContain('clip-path: inset(50%)');
    // 绝不能加 aria-hidden：加了等于对读屏用户彻底隐形。
    expect(rule, '不能用 display:none 把它藏起来').not.toContain('display: none');
  });

  it('尊重 prefers-reduced-motion（把过渡整个关掉，不是调轻）', () => {
    const css = styleText();

    // 前庭功能障碍用户对动画敏感（WCAG 2.3.3）。
    // 用户声明了「减少动效」，我们就该把过渡关掉，而不是替用户判断够不够轻。
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition: none !important');
  });

  it('网页全屏背板的规则必须在', () => {
    const rule = ruleOf(styleText(), '#vsc-page-fullscreen-overlay');

    // 它是「此刻处于网页全屏」这个事实的唯一可靠来源（增删可被订阅）。
    expect(rule, '全屏背板的规则不能没有').not.toBe('');
    expect(rule, '必须铺满视口').toContain('position: fixed');
    expect(rule, '必须铺满视口').toContain('inset: 0');
  });
});
