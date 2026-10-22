import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTROLS_Z_INDEX,
  EXTENSION_STALE_NOTICE_ID,
  LIVE_REGION_Z_INDEX,
  NOTICE_CARD_TOKENS,
  NOTICE_INSET,
  NOTICE_MAX_HEIGHT,
  NOTICE_PILL_TOKENS,
  NOTICE_ROW_HEIGHT,
  NOTICE_SHELL_STYLES,
  NOTICE_Z_INDEX,
  installRuntimeStyles,
  isolateNotice,
  OVERLAY_Z_INDEX,
  setImportant,
  STAGE_Z_INDEX,
  SUBTITLE_Z_INDEX,
  VIDEO_Z_INDEX,
} from './runtimeStyles';
import { TAKEOVER_NOTICE_STYLES } from './takeoverNotice';
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

/**
 * 「减少动效」那条媒体查询的**选择器列表**。
 *
 * ⚠️ 非贪婪匹配到第一个 '{'：媒体查询块里套着一条规则，
 * 所以截到第一个 '{' 拿到的正好是选择器部分（规则体在 '{' 之后）。
 */
const reducedMotionSelectors = (css: string): string => {
  const matched = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\{/.exec(css);
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
    //                        < 一次性提示 2147483646 < live region 2147483647
    expect(ruleOf(css, '#vsc-page-fullscreen-overlay')).toContain('z-index: 2147483642');
    expect(ruleOf(css, '#vsc-page-fullscreen-stage')).toContain('z-index: 2147483643');
    expect(ruleOf(css, '.vsc-page-fullscreen-video')).toContain('z-index: 2147483643');
    expect(ruleOf(css, '#vsc-live-region')).toContain('z-index: 2147483647');

    // 页面级提示的 z-index 现在住在**内联样式**里（见「页面级提示的样式隔离」，
    // 它们不能留在样式表里 —— 普通作者声明挡不住站点的 !important）。
    //
    // ⚠️ 这里断言的是「外壳用的就是那个常量」，而不是某个魔法数字：
    // 这一条防的是「有人在外壳里手写了一个 z-index」——
    // 那会让提示与 live region 抢同一层，而两边的值从此各走各的。
    expect(NOTICE_SHELL_STYLES['z-index']).toBe(String(NOTICE_Z_INDEX));
    expect(NOTICE_Z_INDEX, '页面级提示必须低于 live region').toBeLessThan(LIVE_REGION_Z_INDEX);
  });

  it('层叠顺序是一条严格递增的阶梯', () => {
    // 全屏背板 < 舞台/视频 < 字幕 < 控制条 < 页面级提示 < live region。
    //
    // ⚠️ 以前五个页面级浮层 + live region **全挤在 2147483647**：
    // 同层意味着彼此可能互相盖住（谁后插入谁在上面），
    // 而「提示盖住提示」用户只会被解读成「这个扩展坏了」。
    expect(OVERLAY_Z_INDEX, '全屏背板必须最底').toBeLessThan(STAGE_Z_INDEX);
    expect(VIDEO_Z_INDEX, '视频必须高于背板').toBeGreaterThan(OVERLAY_Z_INDEX);
    expect(SUBTITLE_Z_INDEX, '字幕必须高于视频').toBeGreaterThan(VIDEO_Z_INDEX);
    expect(CONTROLS_Z_INDEX, '控制条必须高于字幕').toBeGreaterThan(SUBTITLE_Z_INDEX);
    expect(NOTICE_Z_INDEX, '页面级提示必须高于控制条').toBeGreaterThan(CONTROLS_Z_INDEX);
    expect(LIVE_REGION_Z_INDEX, 'live region 必须最高').toBeGreaterThan(NOTICE_Z_INDEX);
  });

  it('任何一层都不许掉到页面内容之下', () => {
    // 上一条守的是**相对**顺序；这一条守的是**底线**：
    // 有人把某个常量改成 1，页面级提示就会被站点的内容整个盖住
    // （而「顺序」那条断言在只有一层掉下去时仍然是绿的）。
    //
    // 底线取 2147483000：离 32 位有符号整数的上限 2147483647 还有余量，
    // 又高到不可能被站点的任何 z-index 超过（站点的取值几乎都在 999 以内）。
    [
      ['全屏背板', OVERLAY_Z_INDEX],
      ['视频', VIDEO_Z_INDEX],
      ['舞台', STAGE_Z_INDEX],
      ['字幕', SUBTITLE_Z_INDEX],
      ['控制条', CONTROLS_Z_INDEX],
      ['页面级提示', NOTICE_Z_INDEX],
      ['live region', LIVE_REGION_Z_INDEX],
    ].forEach(([name, value]) => {
      expect(value, `${name} 不许掉到页面内容之下`).toBeGreaterThanOrEqual(2147483000);
    });
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
    // ⚠️ 改的是**自定义属性**，不是 transition 本身：
    // 提示的 transition 写在带 !important 的内联样式里，而 style 属性
    // 在同优先级里永远赢 —— 媒体查询直接写 transition 是改不动的。
    // 时长走自定义属性才改得动（作者源里带 !important 的声明压得住
    // 普通的内联声明）。
    expect(css).toContain('--vsc-notice-fade: 0ms !important');
  });

  it('「减少动效」必须覆盖**每一个**页面级提示（含扩展已更新的状态通知）', () => {
    const selectors = reducedMotionSelectors(styleText());

    expect(selectors, '必须找得到 prefers-reduced-motion 那条媒体查询').not.toBe('');

    // ⚠️ 少一个 id = 那条提示的淡入淡出关不掉。
    // 「扩展已更新」那条以前就在名单之外（它当时还没有 id 常量）——
    // 而它恰恰是**最该**被关掉的一条：它出现的时刻，用户刚被扩展更新打断。
    [
      'vsc-speed-toast',
      'vsc-first-run-hint',
      'vsc-takeover-notice',
      EXTENSION_STALE_NOTICE_ID,
    ].forEach((id) => {
      expect(selectors, `「减少动效」必须覆盖 #${id}`).toContain(`#${id}`);
    });
  });

  it('网页全屏背板的规则必须在', () => {
    const rule = ruleOf(styleText(), '#vsc-page-fullscreen-overlay');

    // 它是「此刻处于网页全屏」这个事实的唯一可靠来源（增删可被订阅）。
    expect(rule, '全屏背板的规则不能没有').not.toBe('');
    expect(rule, '必须铺满视口').toContain('position: fixed');
    expect(rule, '必须铺满视口').toContain('inset: 0');
  });
});

/**
 * 页面级提示的**样式隔离**。
 *
 * 这组用例守的是「站点的 !important 打不穿提示」这条承诺的**机制**。
 * 真实浏览器里那件事由 tests/e2e/style-isolation.spec.js 量 computed style
 * 来验；这里守的是机制本身 —— jsdom 判不了级联，但能判「我们写下去的东西
 * 是不是带 !important 的内联声明」。
 *
 * 为什么必须是内联 + !important（真实 Chromium 实测）：
 * - 只写 `color: ... !important` → color 保住，站点的 font-size 仍赢。
 * - 写 `all: initial !important` → 站点的整条 `div { ... !important }` 被掀掉。
 * - 我们自己样式表里的 `#vsc-speed-toast { ... !important }` → **挡不住**
 *   站点的 `#app div { ... !important }`（特异性 1,0,0 vs 1,0,1）。
 * 只有 style 属性（在作者源里高于任何选择器）能赢。
 */
describe('页面级提示的样式隔离', () => {
  it('隔离的第一层是 all: initial，且必须带 !important', () => {
    const node = document.createElement('div');
    isolateNotice(node);

    // ⚠️ 少了 !important，站点的 `div { ... !important }` 就会赢 ——
    // 而这条断言是唯一能抓住「有人把 important 去掉」的地方。
    expect(node.style.getPropertyValue('all')).toBe('initial');
    expect(node.style.getPropertyPriority('all')).toBe('important');
  });

  it('外壳里的每一条属性都必须带 !important（自定义属性除外）', () => {
    const node = document.createElement('div');
    isolateNotice(node);

    // 少一条 important，那一条属性就会重新被站点的 !important 打穿。
    const missing = Object.keys(NOTICE_SHELL_STYLES).filter(
      (property) =>
        !property.startsWith('--') && node.style.getPropertyPriority(property) !== 'important',
    );
    expect(missing, '这些属性没有带 !important').toEqual([]);
  });

  it('自定义属性必须以**普通声明**写入（否则媒体查询压不住它）', () => {
    const node = document.createElement('div');

    // ⚠️ 不能用 style.getPropertyPriority() 来查：jsdom 的 cssstyle
    // **根本不记录自定义属性的优先级** —— 无论写不写 important，它都返回 ''。
    // 那样的断言恒成立（名不副实的守卫），实测它确实放过了一个真 bug：
    // 自定义属性带着 !important 写进去，于是 prefers-reduced-motion 的
    // 媒体查询再也压不住它，「减少动效」形同虚设。
    //
    // 所以这里改成**拦截调用本身** —— 第三个参数（优先级）在 jsdom 里
    // 会被丢掉，但我们在它被丢掉之前就看见了。
    const calls: Array<{ property: string; priority: string | undefined }> = [];
    const original = node.style.setProperty.bind(node.style);
    node.style.setProperty = (property: string, value: string, priority?: string) => {
      calls.push({ property, priority });
      original(property, value, priority);
    };

    isolateNotice(node, { '--vsc-notice-fade': '220ms' });

    const custom = calls.filter((call) => call.property.startsWith('--'));
    expect(custom.length, '隔离时必须写自定义属性').toBeGreaterThan(0);
    custom.forEach((call) => {
      expect(
        call.priority,
        `${call.property} 不能带 !important —— ` +
          '带 !important 的作者声明会压住媒体查询的 !important 之外的任何写法，' +
          '用户的「减少动效」偏好就再也关不掉淡入淡出了',
      ).toBeUndefined();
    });

    // 普通属性那条路仍然必须带 !important（这条是隔离的命脉）。
    const color = calls.find((call) => call.property === 'color');
    expect(color?.priority, '普通属性必须带 !important').toBe('important');
  });

  it('all 必须写在最前面（它是简写，会盖住后面写的长写）', () => {
    const node = document.createElement('div');
    isolateNotice(node, { padding: '5px 12px' });

    // all 在前、padding 在后 → padding 赢。
    // 顺序反了的话，padding 会被 all 打回 0（简写展开的优先级按声明位置算）。
    expect(node.style.getPropertyValue('padding')).toBe('5px 12px');
  });

  it('隔离会盖掉节点上原有的内联样式（不能留站点的残留）', () => {
    const node = document.createElement('div');
    node.style.setProperty('padding', '20px');
    node.style.setProperty('color', 'rgb(255, 0, 0)');

    isolateNotice(node);

    // 站点可能给我们的节点塞过内联样式（或者上一次隔离留下的）——
    // 隔离必须从干净的状态重来。
    expect(node.style.getPropertyValue('padding')).toBe('0px');
    expect(node.style.getPropertyValue('color')).toBe('rgb(248, 250, 252)');
  });

  it('setImportant 写出来的值带 !important', () => {
    const node = document.createElement('div');
    setImportant(node, 'left', '42px');

    expect(node.style.getPropertyValue('left')).toBe('42px');
    expect(node.style.getPropertyPriority('left')).toBe('important');
  });
});

describe('页面级提示的高度预算', () => {
  /**
   * 一条提示实际占多高 = 字号 × 行高 × 行数 + 上下内边距。
   *
   * ⚠️ 三个数**全部**从**胶囊 token**（`NOTICE_PILL_TOKENS`）里推 ——
   * 接管提示现在用的就是这套 token（见 takeoverNotice.ts），
   * 所以这个算式跟真实渲染是同一套数。
   *
   * ⚠️ 为什么不能从硬编码字面量推：token 改一次（字号、内边距、行高），
   * 预算就必须跟着重算 —— 而两处各写各的数字时，改一处忘一处就会
   * 让提示被切掉一半。这条用例就是那份「重算」的提醒器。
   */
  const heightOf = (lines: number): number => {
    const fontSize = parseFloat(NOTICE_PILL_TOKENS['font-size'] ?? '0');
    const lineHeight = parseFloat(NOTICE_PILL_TOKENS['line-height'] ?? '1');
    const paddingTop = parseFloat((NOTICE_PILL_TOKENS.padding ?? '0px').split(' ')[0] ?? '0');
    return fontSize * lineHeight * lines + paddingTop * 2;
  };

  it('NOTICE_MAX_HEIGHT 必须装得下接管提示折成两行时的高度', () => {
    // 英文文案更长，窄视频上会折成两行 —— 预算必须按两行算。
    const twoLines = heightOf(2);
    expect(
      NOTICE_MAX_HEIGHT,
      `接管提示两行时实际高 ${twoLines.toFixed(1)}px，预算只有 ${NOTICE_MAX_HEIGHT}px —— ` +
        '提示的下边缘会越过视口底边，用户看到的是被切掉一半的字',
    ).toBeGreaterThanOrEqual(Math.ceil(twoLines));
  });

  it('NOTICE_MAX_HEIGHT 也装得下单行（预算不是用来卡单行的）', () => {
    expect(NOTICE_MAX_HEIGHT).toBeGreaterThanOrEqual(Math.ceil(heightOf(1)));
  });

  it('NOTICE_ROW_HEIGHT 必须等于胶囊那一行按 token 推出来的高度', () => {
    // 胶囊那一行 = 视频顶边内缩 NOTICE_INSET + 胶囊自己的高度。
    // 胶囊的高度 = 上下内边距 + 字号 × 行高。
    //
    // ⚠️ 期望值**从 token 推**，不写死：token 改了（14px → 13px、
    // 内边距 5px → 6px），这一行就跟着变，而常量必须一起重算 ——
    // 否则接管提示会爬回胶囊那一行去压住它。
    const fontSize = parseFloat(NOTICE_PILL_TOKENS['font-size'] ?? '0');
    const lineHeight = parseFloat(NOTICE_PILL_TOKENS['line-height'] ?? '1');
    const paddingTop = parseFloat((NOTICE_PILL_TOKENS.padding ?? '0px').split(' ')[0] ?? '0');
    const expected = Math.ceil(NOTICE_INSET + fontSize * lineHeight + paddingTop * 2);

    expect(
      NOTICE_ROW_HEIGHT,
      `胶囊那一行按 token 推是 ${expected}px，常量却写着 ${NOTICE_ROW_HEIGHT}px —— ` +
        '接管提示与胶囊会错位',
    ).toBe(expected);
  });

  it('接管提示用的就是胶囊 token（排版不许各写各的）', () => {
    // 调速胶囊与接管提示是**同一类**东西：都锚在视频上、都是一次性的短提示。
    // 两个形状相同的东西长得不一样，用户会以为是两个不同的功能。
    //
    // ⚠️ 这里**遍历 token 的每一项**，而不是手写一份属性名单：
    // 手写的名单是**会过期**的 —— token 里新加一项（比如某个排版属性）时，
    // 这条断言会**假装**它不存在，接管提示于是可以悄悄跟胶囊分家。
    // 位置与宽度是这条提示**自己**的，不在 token 里，自然不在比对范围内。
    Object.keys(NOTICE_PILL_TOKENS).forEach((property) => {
      expect(
        TAKEOVER_NOTICE_STYLES[property],
        `接管提示的 ${property} 必须与胶囊 token 一致`,
      ).toBe(NOTICE_PILL_TOKENS[property]);
    });
  });

  it('卡片与胶囊共用一套「嗓子」（字号/字重/行高/字体族），但形状不同', () => {
    // 首次引导是**教学卡片**：它有自己的底色与更直的圆角（形状不同），
    // 但它不该换一副嗓子 —— 它是同一个产品的入口。
    ['font-size', 'font-weight', 'line-height', 'font-family'].forEach((property) => {
      expect(
        NOTICE_CARD_TOKENS[property],
        `卡片的 ${property} 必须与胶囊 token 一致`,
      ).toBe(NOTICE_PILL_TOKENS[property]);
    });

    // 形状必须是**不同**的 —— 两类东西长得一样就分不出谁是「要读的」。
    expect(NOTICE_CARD_TOKENS['border-radius']).not.toBe(NOTICE_PILL_TOKENS['border-radius']);
    expect(NOTICE_CARD_TOKENS['background-color']).not.toBe(NOTICE_PILL_TOKENS['background-color']);
  });
});
