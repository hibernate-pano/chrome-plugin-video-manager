import { describe, expect, it } from 'vitest';
import {
  CONTROL_BAR_BREAKPOINTS,
  CONTROL_BAR_NARROW_PADDING,
  CONTROL_BAR_REQUIRED_WIDTHS,
  CONTROL_BAR_WIDE_PADDING,
} from './controlBarLayout';
import { CONTROLS_HOST_STYLES, controlsStyles, isolateControlsHost } from './controlsStyles';
import { CONTROLS_Z_INDEX } from './runtimeStyles';

/**
 * 全屏控制条的**断点**守卫。
 *
 * 背景：这套 CSS 原来只有一个 `@media (max-width: 640px)`。
 * 640 是拍脑袋的数，而布局真正的门槛低得多 —— 于是 200% 放大窗口的用户
 * 白白丢控件：浏览器放大 200% 会把 CSS 视口减半（1280 → 640px），
 * 640 恰好命中断点，音量滑块和总时长凭空消失，而那点宽度根本装得下完整的一套。
 *
 * ⚠️⚠️ 然后又栽在**同一个坑**上：断点改成了 500 / 380，
 * 而那对数是**估**的（490 / 365 / 293），不是量出来的。
 * 实测需求是 553 / 401 / 321 —— 于是 501–546px 与 381–400px
 * 这两段视口宽度里，**退出按钮被推出屏幕**：
 * 390px（iPhone 12/13/14 的宽度）正好落在第二段里，
 * 手机上鼠标点不到退出按钮，用户被关在全屏里。
 *
 * 所以这里守的不再是「某个数字」，而是**降级发生的时机**：
 * 视口还装得下当前这一套时，必须完整；装不下时才降级。
 * 而「装得下」这件事只能由**真实浏览器**回答 ——
 * 那些实测数字住在 controlBarLayout.ts 里，本文件对着它守。
 */

interface MediaBlock {
  maxWidth: number;
  body: string;
}

/** 找到与 openIndex 处那个 '{' 配对的 '}'（跳过嵌套的括号）。 */
const findClosingBrace = (css: string, openIndex: number): number => {
  let depth = 0;
  for (let i = openIndex; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

/**
 * 去掉 CSS 注释。
 *
 * ⚠️ 必须先去掉注释再解析：注释里既有 `{}`（本文件的说明写着
 * 「320px 视口下这一套刚好放得下」这种带括号的句子），
 * 也有「@media (max-width: …)」的字样 —— 不去掉的话，
 * 正则会把注释连同后面的选择器一起当成选择器，
 * 于是「这条声明属于 .volume」这件事永远判不出来。
 */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 把 CSS 里所有 `@media (max-width: Npx)` 块抠出来（按源码顺序）。 */
const mediaBlocks = (css: string): MediaBlock[] => {
  const source = stripComments(css);
  const blocks: MediaBlock[] = [];
  const re = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g;
  let match = re.exec(source);
  while (match !== null) {
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findClosingBrace(source, openIndex);
    blocks.push({ maxWidth: Number(match[1]), body: source.slice(openIndex + 1, closeIndex) });
    // 从块尾继续找：媒体查询里不会再嵌套媒体查询。
    re.lastIndex = closeIndex;
    match = re.exec(source);
  }
  return blocks;
};

/** 去掉所有媒体查询块，剩下的就是「任何宽度都生效」的基础样式。 */
const baseCss = (css: string): string => {
  const source = stripComments(css);
  let result = source;
  const re = /@media\s*\(max-width:\s*\d+px\)\s*\{/g;
  const spans: [number, number][] = [];
  let match = re.exec(source);
  while (match !== null) {
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findClosingBrace(source, openIndex);
    spans.push([match.index, closeIndex]);
    re.lastIndex = closeIndex;
    match = re.exec(source);
  }
  // 从后往前删，免得前面的偏移量把后面的位置弄错。
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const [start, end] = spans[i];
    result = result.slice(0, start) + result.slice(end + 1);
  }
  return result;
};

/** 取出某段 CSS 里属于某个选择器的声明块。 */
const declarationsFor = (css: string, selector: string): string[] => {
  const found: string[] = [];
  const source = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match = re.exec(source);
  while (match !== null) {
    const selectors = match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (selectors.includes(selector)) found.push(match[2]);
    match = re.exec(source);
  }
  return found;
};

/**
 * 某个宽度下，这条声明的**最终值**（后写的赢）。
 *
 * 返回 undefined 表示「这条属性没被写过」—— 对 `display` 来说就是
 * 「没被隐藏」，这正是我们要区分的两种状态。
 */
const valueAt = (
  css: string,
  selector: string,
  property: string,
  width: number,
): string | undefined => {
  const blocks = mediaBlocks(css);
  const chunks = [
    ...declarationsFor(baseCss(css), selector),
    ...blocks
      .filter((block) => width <= block.maxWidth)
      .flatMap((block) => declarationsFor(block.body, selector)),
  ];

  const re = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`);
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const found = re.exec(chunks[i]);
    if (found) return found[1].trim();
  }
  return undefined;
};

/** 这个宽度下，某个选择器是不是被藏起来了。 */
const isHiddenAt = (css: string, selector: string, width: number): boolean =>
  valueAt(css, selector, 'display', width) === 'none';

/**
 * 某个选择器的所有 `padding` 声明值。
 *
 * 用来守「内边距只有一份」：CSS 里出现的 padding 值必须**全部**来自契约。
 */
const paddingValues = (css: string, selector: string): string[] => {
  const values: string[] = [];

  for (const body of declarationsFor(css, selector)) {
    const re = /(?:^|;)\s*padding\s*:\s*([^;]+)/g;
    let match = re.exec(body);
    while (match !== null) {
      values.push(match[1].trim());
      match = re.exec(body);
    }
  }

  return values;
};

/**
 * 所有「选择器里提到 exit」的规则。
 *
 * ⚠️ 不能只找 `.exit` 这个**精确**选择器：退出按钮的真实身份是
 * `<button class="button" data-role="exit">` ——
 * 写成 `[data-role="exit"] { display: none }` 或
 * `.bar button[data-role="exit"]` 一样能把它藏掉，
 * 而只匹配 `.exit` 的断言**照样绿**。
 *
 * 它是唯一的逃生口，守卫必须挑得动真正会藏它的写法。
 */
const exitRules = (css: string): { selector: string; body: string }[] => {
  const source = stripComments(css);
  const rules: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;

  let match = re.exec(source);
  while (match !== null) {
    const body = match[2];
    match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((selector) => {
        if (/exit/i.test(selector)) rules.push({ selector, body });
      });
    match = re.exec(source);
  }

  return rules;
};

describe('控制条的窄屏断点', () => {
  it('CSS 里的断点就是契约里的断点（不许各写一份）', () => {
    // 这一条是**整套守卫的地基**：如果 CSS 里手写了一个 380 而契约里是 430，
    // 那么下面所有「按契约推」的断言都在替一个没人遵守的约定站岗。
    const widths = mediaBlocks(controlsStyles)
      .map((block) => block.maxWidth)
      .sort((a, b) => b - a);

    expect(widths).toEqual([
      CONTROL_BAR_BREAKPOINTS.medium,
      CONTROL_BAR_BREAKPOINTS.compact,
      CONTROL_BAR_BREAKPOINTS.minimal,
      CONTROL_BAR_BREAKPOINTS.narrowest,
    ]);
  });

  it('每一档的断点都 ≥ 它引入的那一套的实测需求', () => {
    // 这是「降级发生的时机」这条不变式的**全部内容**：
    // 断点必须落在「装不下」的那一侧，否则「降级了还是溢出」——
    // 退出按钮照样被推出屏幕（那正是这个断点当初要解决的事）。
    const required = CONTROL_BAR_REQUIRED_WIDTHS;

    // 断点 medium：低于它就该用「中间一套」，所以它必须 ≥ 完整一套的需求。
    expect(CONTROL_BAR_BREAKPOINTS.medium).toBeGreaterThanOrEqual(required.full);
    // 断点 compact：低于它就该用「紧凑一套」，所以它必须 ≥ 中间一套的需求。
    expect(CONTROL_BAR_BREAKPOINTS.compact).toBeGreaterThanOrEqual(required.medium);
    // 断点 minimal：低于它就该用「极简一套」，所以它必须 ≥ 紧凑一套的需求。
    expect(CONTROL_BAR_BREAKPOINTS.minimal).toBeGreaterThanOrEqual(required.compact);
    // 断点 narrowest：低于它就该用「最后一档」，所以它必须 ≥ 极简一套的需求。
    expect(CONTROL_BAR_BREAKPOINTS.narrowest).toBeGreaterThanOrEqual(required.minimal);
  });

  it('实测需求本身是自洽的（后一档必须更窄）', () => {
    const required = CONTROL_BAR_REQUIRED_WIDTHS;
    expect(required.full).toBeGreaterThan(required.medium);
    expect(required.medium).toBeGreaterThan(required.compact);
    expect(required.compact).toBeGreaterThan(required.minimal);
    expect(required.minimal).toBeGreaterThan(required.narrowest);
  });

  it('断点之间留着余量，不是「刚好装得下」', () => {
    // 断点落在「刚好装得下」那一点上时，差 1px 就溢出 ——
    // 而那 1px 可能来自滚动条、缩放或字体回退。
    const required = CONTROL_BAR_REQUIRED_WIDTHS;
    expect(CONTROL_BAR_BREAKPOINTS.medium - required.full).toBeGreaterThan(0);
    expect(CONTROL_BAR_BREAKPOINTS.compact - required.medium).toBeGreaterThan(0);
    expect(CONTROL_BAR_BREAKPOINTS.minimal - required.compact).toBeGreaterThan(0);
    expect(CONTROL_BAR_BREAKPOINTS.narrowest - required.minimal).toBeGreaterThan(0);
  });

  it('200% 放大之后（CSS 视口 640px）音量滑块与总时长都还在', () => {
    // 浏览器放大 200% → CSS 视口 1280 → 640。
    // 640 恰好是旧断点，于是这两个控件**凭空消失**。
    expect(isHiddenAt(controlsStyles, '.volume', 640), '音量滑块在 640px 被误伤').toBe(false);
    expect(isHiddenAt(controlsStyles, '.time__total', 640), '总时长在 640px 被误伤').toBe(false);
    expect(isHiddenAt(controlsStyles, '.time__sep', 640), '分隔符在 640px 被误伤').toBe(false);
  });

  it('正常窗口（1280px）当然也是完整的一套', () => {
    expect(isHiddenAt(controlsStyles, '.volume', 1280)).toBe(false);
    expect(isHiddenAt(controlsStyles, '.time__total', 1280)).toBe(false);
  });

  it('放大 150%（1280 → 853px）也不降级', () => {
    expect(isHiddenAt(controlsStyles, '.volume', 853)).toBe(false);
    expect(isHiddenAt(controlsStyles, '.time__total', 853)).toBe(false);
  });

  it('完整一套只在装得下的宽度里出现', () => {
    // 完整一套的实测需求是 553px，而它只在 > 560px 时出现 ——
    // 断点比需求高 7px（余量），所以 561px 处它一定装得下。
    const breakpoint = CONTROL_BAR_BREAKPOINTS.medium;
    expect(
      isHiddenAt(controlsStyles, '.volume', breakpoint + 1),
      `${breakpoint + 1}px 用的是完整一套，不该藏音量滑块`,
    ).toBe(false);
    expect(
      isHiddenAt(controlsStyles, '.volume', breakpoint),
      `${breakpoint}px 起该降级`,
    ).toBe(true);
    expect(isHiddenAt(controlsStyles, '.time__total', breakpoint)).toBe(true);
  });

  it('中间那一套只在装得下的宽度里出现', () => {
    // 中间一套的实测需求是 401px，它在 431–560px 之间生效。
    const breakpoint = CONTROL_BAR_BREAKPOINTS.compact;
    expect(
      valueAt(controlsStyles, '.button', 'width', breakpoint + 1),
      `${breakpoint + 1}px 用的是中间一套，按钮还是 34px`,
    ).toBe('34px');
    expect(
      valueAt(controlsStyles, '.button', 'width', breakpoint),
      `${breakpoint}px 起该切到紧凑档，按钮缩到 30px`,
    ).toBe('30px');
  });

  it('紧凑一套：按钮 30px、进度条 60px、间距 6px', () => {
    // 紧凑档在 331–430px 之间生效（330px 及以下进入极简档）。
    const width = CONTROL_BAR_BREAKPOINTS.compact;
    expect(valueAt(controlsStyles, '.button', 'width', width)).toBe('30px');
    expect(valueAt(controlsStyles, '.button svg', 'width', width)).toBe('20px');
    expect(valueAt(controlsStyles, '.progress', 'min-width', width)).toBe('60px');
    expect(valueAt(controlsStyles, '.bar', 'gap', width)).toBe('6px');
    expect(valueAt(controlsStyles, '.time__now', 'min-width', width)).toBe('6ch');
  });

  it('极窄（200% 放大的手机）连时间都让位 —— 但退出按钮必须留着', () => {
    // 320px 的手机放到 200% 就是 160px 的 CSS 视口，任何一档都装不下。
    // 那时至少要把**退出按钮**保住（它是唯一的逃生口），时间显示可以让位。
    const width = CONTROL_BAR_BREAKPOINTS.minimal;
    expect(isHiddenAt(controlsStyles, '.time', width), '极窄档必须藏起时间').toBe(true);
    expect(valueAt(controlsStyles, '.progress', 'min-width', width), '极窄档的进度条下限 40px').toBe(
      '40px',
    );
  });

  it('退出按钮在任何一档都不许被藏 —— 而且这条守卫挑得动真写法', () => {
    // ⚠️ 2026-10-21 复审发现：原来的守卫断言的是选择器 `.exit`，
    // 而退出按钮的真实身份是 `<button class="button" data-role="exit">` ——
    // 写成 `[data-role="exit"] { display:none }` 一样能藏掉它，
    // 而那条断言**照样绿**（它精确匹配选择器文本）。
    //
    // 它是唯一的逃生口：被藏了 = 全屏里没有出口 = 用户只能靠 Esc
    // （而「按 Esc 能退」从没在界面上告诉过他）。
    const hiding = exitRules(controlsStyles)
      .filter((rule) => /(?:^|;)\s*display\s*:\s*none/i.test(rule.body))
      .map((rule) => rule.selector);

    expect(
      hiding,
      `有规则把退出按钮藏了：${hiding.join(', ')} —— 它是唯一的逃生口`,
    ).toEqual([]);

    // 各断点上再逐个确认一次（宽度维度是另一条轴）。
    for (const w of [160, 240, 320, 400, 560, 1280]) {
      expect(isHiddenAt(controlsStyles, '.exit', w), `退出按钮在 ${w}px 被藏了`).toBe(false);
    }
  });

  it('控制条的内边距只有一份：CSS 里的值必须来自契约', () => {
    // ⚠️ 2026-10-21 复审发现（已复现）：契约里的 padding 与 CSS 里的 padding
    // 原先是**两份互不相干的数字**，而契约的注释写着「必须和控制条 CSS 一致」——
    // 没有任何机制保证一致。变异验证：只把契约里的 right 从 18 改成 4
    // （CSS 不动），收起态的退出钮与控制条退出钮就错开 14px，
    // 而除了 1280px 宽的那条 e2e，**没有任何测试会红**。
    //
    // 现在 CSS 的 padding 由契约拼出来，所以这里守的是
    // 「CSS 里不许出现手写的 padding 值」——
    // 有人手写一个别的（或忘了跟着改的）值，它就会红。
    const expected = new Set([
      `${CONTROL_BAR_WIDE_PADDING.top}px ${CONTROL_BAR_WIDE_PADDING.right}px ${CONTROL_BAR_WIDE_PADDING.bottom}px`,
      `${CONTROL_BAR_NARROW_PADDING.top}px ${CONTROL_BAR_NARROW_PADDING.right}px ${CONTROL_BAR_NARROW_PADDING.bottom}px`,
    ]);

    const paddings = paddingValues(controlsStyles, '.bar');

    expect(paddings.length, '没找到 .bar 的 padding 声明 —— 解析逻辑坏了').toBeGreaterThan(0);
    paddings.forEach((value) => {
      expect(
        expected.has(value),
        `.bar 的 padding 是 "${value}"，而契约给的是 ${[...expected].join(' / ')} —— ` +
          '两边各写一份时，收起态的退出钮会与控制条退出钮错位',
      ).toBe(true);
    });
  });

  it('旧的 640px 断点不许再回来', () => {
    // 640 是**拍脑袋**的数：它让 200% 放大的窗口白丢控件。
    // 这条断言是 E5 这个 bug 的直接守卫。
    const widths = mediaBlocks(controlsStyles).map((block) => block.maxWidth);
    expect(widths).not.toContain(640);
  });
});

/**
 * 控制条**宿主**的样式隔离。
 *
 * ⚠️ shadow root 只护住里面的内容，护不住**宿主自己** ——
 * 宿主是 light DOM 里的一个 div，站点的 `html > div { display: none !important }`
 * 会命中它（实测症状：控制条与退出按钮整个消失，只剩 Escape 能退出全屏）。
 *
 * 挡它的是**内联 !important**：级联里 style 属性高于任何选择器，
 * 于是内联的 !important 赢过任何作者 !important。
 */
describe('控制条宿主的样式隔离', () => {
  it('宿主的第一层是 all: initial，且必须带 !important', () => {
    const host = document.createElement('div');

    isolateControlsHost(host);

    expect(host.style.getPropertyValue('all')).toBe('initial');
    expect(host.style.getPropertyPriority('all')).toBe('important');
  });

  it('宿主的每一条样式都必须带 !important（少一条就重新被打穿）', () => {
    const host = document.createElement('div');

    isolateControlsHost(host);

    const missing = Object.keys(CONTROLS_HOST_STYLES).filter(
      (property) => host.style.getPropertyPriority(property) !== 'important',
    );
    expect(missing, '这些属性没有带 !important').toEqual([]);
  });

  it('all 之后必须把宿主自己的样子整份写回（all 会把 :host 里的那些一并重置）', () => {
    const host = document.createElement('div');

    isolateControlsHost(host);

    // position: fixed 没了 → 控制条不再贴着视口底边。
    expect(host.style.getPropertyValue('position')).toBe('fixed');
    // display 没了 → 整条控制条（连同里面的内容）一起消失。
    expect(host.style.getPropertyValue('display')).toBe('block');
    expect(host.style.getPropertyValue('z-index')).toBe(String(CONTROLS_Z_INDEX));
  });

  it(':host 规则与内联底座同源（不许各写一份）', () => {
    // ⚠️ 两份各写一遍时，改了一处忘了另一处 = 隔离破功：
    // 内联底座是「真正起作用的那份」，:host 只是兜底。
    // 这里守住它们是**同一张表**生成的。
    const hostRule = /:host\s*\{([^}]*)\}/.exec(stripComments(controlsStyles))?.[1] ?? '';

    Object.entries(CONTROLS_HOST_STYLES).forEach(([property, value]) => {
      expect(hostRule, `:host 规则里必须有 ${property}`).toContain(`${property}: ${value}`);
    });
    expect(hostRule, ':host 必须先 all: initial').toContain('all: initial');
  });
});
