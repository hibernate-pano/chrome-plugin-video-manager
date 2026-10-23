import { test, expect } from '@playwright/test';
import { launchExtension } from './helpers/launch.js';
import { anyLocale } from './helpers/i18n.js';

/**
 * 设置页的**布局**回归。
 *
 * 为什么必须**真加载扩展**来测：这些判据全是尺寸与位置 ——
 * 「保存按钮在不在视口里」「吸底条有没有盖住最后一张卡片」
 * 「lead 段是不是跟卡片同宽」。
 * jsdom **没有布局引擎**（没有 getBoundingClientRect 的真实结果、
 * 没有 sticky、没有换行），在 jsdom 里断言这些等于自己写一份
 * 「假装有布局的浏览器」—— 测的是那份假装，不是产品。
 *
 * 守卫的是三组**用户能看见的**东西：
 *
 *   1. 「保存」与「有未保存的更改」在**常见视口下都在视口内**。
 *      之前 1280×800 下 scrollHeight 943 > 800，#save 的 top 是 815、
 *      #status 的 top 是 825 —— 两者整条都在折叠线以下。
 *      后果不是「按钮看不见」这么轻：用户改完键抬头，视口里
 *      **没有任何**「你还没保存」的信号。
 *   2. 焦点环**全站同一套**（输入框是品牌墨绿 2px，按钮曾���浏览器默认蓝 1px）。
 *   3. lead 段与卡片**同宽**（曾经 46ch，右侧空一大块）。
 *
 * ⚠️ 断言一律量**真实渲染结果**（getBoundingClientRect / getComputedStyle），
 * 不看 class —— class 只是实现，位置与颜色才是用户看见的东西。
 */

/** 打开设置页并等它渲染完（动作行 + 底部操作条）。 */
const openOptions = async (ext, viewport) => {
  const page = await ext.context.newPage();
  if (viewport) {
    await page.setViewportSize(viewport);
  }
  await page.goto(`chrome-extension://${ext.extensionId}/options.html`);
  await page.waitForSelector('.vsc__row');
  await expect(page.locator('#save')).toBeVisible();
  return page;
};

/**
 * 改一个键（第一行）。
 *
 * 改**第一行**是有意的：改完键用户**抬头**看的那一眼，
 * 看到的就是视口顶部 —— 反馈必须在那儿，不在几千像素外。
 */
const changeFirstShortcut = async (page) => {
  await page.locator('.vsc__key').first().click();
  await page.keyboard.press('k');
  await expect(page.locator('#save')).toContainText('•');
};

/** 一个元素在视口内的可见部分。 */
const visibleBox = async (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      /** 落在视口内的部分（可能被上下裁掉）。 */
      visibleTop: Math.max(r.top, 0),
      visibleBottom: Math.min(r.bottom, viewportHeight),
      visibleLeft: Math.max(r.left, 0),
      visibleRight: Math.min(r.right, viewportWidth),
      viewportHeight,
      viewportWidth,
    };
  }, selector);

/** 页面是否有横向溢出。 */
const horizontalOverflow = (page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

/** 最后一张卡片的底边（用来判断吸底条有没有盖住内容）。 */
/**
 * 「最后一行卡片」的几何信息。
 *
 * ⚠️ 这里量的是**快捷键表的最后一行**（网页全屏）——
 * 它是用户真正要操作的东西（一个可以点的输入框），
 * 而不只是装饰。吸底条盖住它 = 用户绑不了最后一个键。
 */
const lastRowGeometry = (page) =>
  page.evaluate(() => {
    const rowsRoot = document.querySelector('#rows');
    const rows = Array.from(rowsRoot.querySelectorAll('.vsc__row'));
    const lastRow = rows[rows.length - 1];
    const lastInput = lastRow.querySelector('.vsc__key');
    const hint = document.querySelector('.vsc__hint');
    const toBox = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return {
      lastRow: toBox(lastRow),
      lastInput: toBox(lastInput),
      hint: toBox(hint),
      footer: toBox(document.querySelector('.vsc__footer')),
    };
  });

/** 两个竖直区间是否重叠，以及重叠了多少像素。 */
const verticalOverlap = (a, b) => {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
};

test.describe('设置页：保存按钮与未保存提示永远看得见', () => {
  // 1280×800 是这条缺陷的原始现场；1280×600 是「窗口只拉了一半高」的常见情形；
  // 320×640 与 640×480 是「窗口很窄 / 很矮」的极端情形。
  const VIEWPORTS = [
    { name: '1280×800', width: 1280, height: 800 },
    { name: '1280×600', width: 1280, height: 600 },
    { name: '320×640', width: 320, height: 640 },
    { name: '640×480', width: 640, height: 480 },
  ];

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}：改完键，「保存」与「有未保存的更改」都在视口内`, async () => {
      const ext = await launchExtension();
      try {
        const page = await openOptions(ext, {
          width: viewport.width,
          height: viewport.height,
        });

        await changeFirstShortcut(page);

        // 状态栏必须说的是「有未保存的更改」——
        // 不只是「有字」，而是**那句**字。
        await expect(page.locator('#status')).toHaveText(anyLocale('optUnsaved'));

        const save = await visibleBox(page, '#save');
        const status = await visibleBox(page, '#status');

        expect(save, '找不到 #save').not.toBeNull();
        expect(status, '找不到 #status').not.toBeNull();

        // 「可见」= 有一部分真的落在视口里，且不是零高度。
        // ⚠️ 这里量的是**没滚动时**的位置（用户改完键「抬头」看到的那一眼）。
        expect(
          save.visibleBottom - save.visibleTop,
          `「保存」按钮完全在视口外（top=${save.top} bottom=${save.bottom}，视口高 ${save.viewportHeight}）`,
        ).toBeGreaterThan(0);
        expect(
          status.visibleBottom - status.visibleTop,
          `未保存提示完全在视口外（top=${status.top} bottom=${status.bottom}，视口高 ${status.viewportHeight}）`,
        ).toBeGreaterThan(0);

        // ⚠️ 而且要**完整**可见 —— 露半截按钮看着像渲染坏了。
        expect(
          save.top,
          `「保存」按钮的上边被切掉了（top=${save.top} < 0）`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          save.bottom,
          `「保存」按钮的下边被切掉了（bottom=${save.bottom} > 视口高 ${save.viewportHeight}）`,
        ).toBeLessThanOrEqual(save.viewportHeight);
      } finally {
        await ext.close();
      }
    });
  }

  test('1280×800：吸底条不盖住快捷键表的最后一行（用户还要能绑最后一个键）', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext, { width: 1280, height: 800 });

      await changeFirstShortcut(page);

      const band = await visibleBox(page, '.vsc__actions');
      const geometry = await lastRowGeometry(page);

      // 吸底条在**文档流里**排在快捷键表**之后**，
      // 所以它贴在视口底部时，那张表底下的部分会被它**盖住**。
      // 「盖住一点点」（压住最后一行的一点点边）是正常的 ——
      // 盖掉**整个输入框**才是事故：那个框用户点不到，键绑不了。
      const rowOverlap = verticalOverlap(band, geometry.lastRow);
      const inputOverlap = verticalOverlap(band, geometry.lastInput);

      expect(
        rowOverlap,
        `吸底条盖住了快捷键表最后一行 ${rowOverlap}px` +
          `（吸底条 top=${band.top} bottom=${band.bottom}，` +
          `最后一行 top=${geometry.lastRow.top} bottom=${geometry.lastRow.bottom}）`,
      ).toBeLessThanOrEqual(8);

      // ⚠️ 最后一行的**输入框**必须**完全**露出来 ——
      // 它是「网页全屏」那格的绑定框，被盖住就绑不了。
      expect(
        inputOverlap,
        `吸底条盖住了「网页全屏」的绑定框 ${inputOverlap}px` +
          `（吸底条 top=${band.top} bottom=${band.bottom}，` +
          `输入框 top=${geometry.lastInput.top} bottom=${geometry.lastInput.bottom}）`,
      ).toBe(0);
    } finally {
      await ext.close();
    }
  });

  test('窄屏不横向溢出', async () => {
    const ext = await launchExtension();
    try {
      for (const viewport of [
        { width: 320, height: 640 },
        { width: 640, height: 480 },
      ]) {
        const page = await openOptions(ext, viewport);
        await changeFirstShortcut(page);

        const { scrollWidth, clientWidth } = await horizontalOverflow(page);
        expect(
          scrollWidth,
          `${viewport.width}px 宽下横向溢出了 ${scrollWidth - clientWidth}px`,
        ).toBeLessThanOrEqual(clientWidth);

        await page.close();
      }
    } finally {
      await ext.close();
    }
  });

  /**
   * 吸底条是**结构性**保证：页面再长，保存按钮也钉在视口底部。
   *
   * ⚠️ 这条守的是「方案二」本身 —— 不是碰巧装得下，
   * 而是**不管文案多长都成立**。
   *
   * 怎么证明「钉住」了：
   *
   * sticky 的语义是「正常流里跟着内容走，但当自然位置会跑出视口时，
   * 它被**拉回来**钉在视口边缘」。
   * 所以判据不能是「滚到底它还贴着视口底」——
   * 滚到底时它**本来就**在文档流的末尾，会回到自然位置（那里也恰好是视口附近）。
   *
   * 真正的判据是**中途**：滚到「吸底条的自然位置已经在视口下方」的那一刻，
   * 吸底条必须被**拉回来**贴在视口底边。
   * 换句话说：它的底边与视口底的差 = 0，而不是「它自然位置与视口底的差」。
   */
  test('页面很长时，保存按钮被吸在视口底部（不是跟着内容滚走）', async () => {
    const ext = await launchExtension();
    try {
      // 320×640：整页远高于视口，是「页面很长」的最省事现场。
      const page = await openOptions(ext, { width: 320, height: 640 });

      await changeFirstShortcut(page);

      // 先确认这页**确实**比视口高（否则这条测不到任何东西）。
      const before = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }));
      expect(
        before.scrollHeight,
        '这一页本来就装得下，测不出吸底条的行为',
      ).toBeGreaterThan(before.clientHeight);

      // 滚到**一半** —— 此时吸底条的自然位置还在视口下方，
      // 如果它没有吸底，就会跟着内容滚走；吸了底，就会被拉回视口底边。
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(150);

      const mid = await visibleBox(page, '.vsc__actions');
      const viewportBottom = mid.viewportHeight;

      // 吸底条的底边应该**贴着**视口底边。
      expect(
        mid.bottom,
        `滚到一半时吸底条的底边是 ${mid.bottom}，视口底边是 ${viewportBottom} —— ` +
          `差 ${Math.abs(mid.bottom - viewportBottom)}px，说明它没有被吸在底部（跟着文档流滚走了）`,
      ).toBeGreaterThan(viewportBottom - 4);
      expect(
        mid.bottom,
        `滚到一半时吸底条的底边是 ${mid.bottom}，视口底边是 ${viewportBottom}`,
      ).toBeLessThanOrEqual(viewportBottom + 1);

      // 吸住的时候，「保存」与未保存提示都必须在视口里。
      const save = await visibleBox(page, '#save');
      const status = await visibleBox(page, '#status');
      expect(
        save.visibleBottom - save.visibleTop,
        `滚到一半时「保存」按钮在视口外（top=${save.top} bottom=${save.bottom}）`,
      ).toBeGreaterThan(0);
      expect(
        status.visibleBottom - status.visibleTop,
        `滚到一半时未保存提示在视口外（top=${status.top} bottom=${status.bottom}）`,
      ).toBeGreaterThan(0);
    } finally {
      await ext.close();
    }
  });

  /**
   * 整页在 1280×800 里装得下。
   *
   * ⚠️ 这条守的是源码注释里写下的那条不变量
   * （options-theme.ts：「设置页要塞进 1280×800 的**一屏**里」）。
   * 那条不变量**从来没成立过** —— 它只写在注释里。
   *
   * 为什么它值得单独守：页脚那行「版本 / 隐私政策 / 源码仓库」
   * 被挤到视口外时，商店截图上就只剩半截字，看着像渲染坏了。
   *
   * ⚠️ 这条**依赖文案长度**（英文比中文长），所以它是一条
   * 「尽力而为」的断言：吸底条是结构性保证（永远看得见保存按钮），
   * 而这一条是「排版上的体面」（页脚不被切半截）。
   * 两者是**不同的判据**，不能互相顶替。
   */
  test('1280×800：整页装得下（页脚不会被切在半截）', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext, { width: 1280, height: 800 });

      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }));

      expect(
        metrics.scrollHeight,
        `整页高 ${metrics.scrollHeight}px，超出了 800px 的视口 ${metrics.scrollHeight - metrics.clientHeight}px` +
          '（页脚会被切半截）',
      ).toBeLessThanOrEqual(metrics.clientHeight);
    } finally {
      await ext.close();
    }
  });

  /**
   * 文案变长也不破功 —— 这是「方案二（吸底条）」与「方案一（压到 800px）」的分水岭。
   *
   * ⚠️ 为什么这条测试要**人为加长文案**：
   * 方案一（收紧 padding 让整页装进 1280×800）只在**当前这版文案**下成立。
   * 翻译改长一点、某个 locale 换一种说法、某天多写一句说明 ——
   * 方案一立刻破功，而破功的形态正是最初那条缺陷：
   * 保存按钮与未保存提示一起沉到折叠线以下。
   *
   * 吸底条不依赖文案长度：页面多长它都钉在视口底边。
   * 所以这条测试**主动把文案撑长**，然后要求保存按钮依然看得见。
   *
   * ⚠️ 怎么加长：直接改**渲染出来的 DOM 文本**（不改 locale 文件）——
   * 我们要验的是**布局**在长文案下的表现，不是要改翻译。
   */
  test('文案被撑长时，保存按钮与未保存提示依然看得见（吸底条不依赖文案长度）', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext, { width: 1280, height: 800 });

      await changeFirstShortcut(page);

      // 把 lead 与「使用引导」的说明撑长 —— 模拟「翻译变长了」。
      //
      // ⚠️ **加长的必须是原语言**，不能是一段中文：
      // `chrome.i18n` 挑哪个 locale 目录跟的是**系统 locale**（不是界面语言），
      // 开发机是中文系统、CI 容器是英文环境 —— 于是「中文加长三倍」
      // 在英文环境里**根本不成比例**（原英文文案本来就长），
      // 页面可能压根没被撑高 → 这条用例在 CI 上必然失败
      // （实测：scrollHeight 800 == clientHeight 800）。
      //
      // 所以这里用**原 locale 的文案**重复若干遍：
      // 无论哪种语言，重复 N 遍都必然撑高。
      const before = await page.evaluate(() => {
        const lead = document.querySelector('.vsc__lead');
        const desc = document.querySelector('.vsc__hint .vsc__row-desc');
        const repeat = (node) => {
          if (!node) return;
          const original = node.textContent ?? '';
          // 重复到明显超过一屏为止（每份原文至少 10 个字符，重复 40 遍足够撑高）。
          node.textContent = original.repeat(40);
        };
        repeat(lead);
        repeat(desc);
        return {
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
        };
      });

      // 确认这一步**真的**把页面撑高了 —— 否则这条测不到任何东西。
      expect(
        before.scrollHeight,
        '加长文案之后页面居然没变高，这条测试测不到任何东西',
      ).toBeGreaterThan(before.clientHeight);

      // 现在回到页面顶部（模拟用户改完键抬头的那一眼）。
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);

      const save = await visibleBox(page, '#save');
      const status = await visibleBox(page, '#status');

      expect(
        save.visibleBottom - save.visibleTop,
        `文案撑长后「保存」按钮在视口外（top=${save.top} bottom=${save.bottom}，视口高 ${save.viewportHeight}）`,
      ).toBeGreaterThan(0);
      expect(
        status.visibleBottom - status.visibleTop,
        `文案撑长后未保存提示在视口外（top=${status.top} bottom=${status.bottom}）`,
      ).toBeGreaterThan(0);
      expect(
        save.bottom,
        `文案撑长后「保存」按钮被切掉了（bottom=${save.bottom} > 视口高 ${save.viewportHeight}）`,
      ).toBeLessThanOrEqual(save.viewportHeight);
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：焦点环全站同一套', () => {
  test('按钮与链接的焦点环与输入框一致（不再是浏览器默认蓝）', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext, { width: 1280, height: 800 });

      const focusRing = (selector) =>
        page.evaluate((sel) => {
          const el = document.querySelector(sel);
          el.focus();
          const cs = getComputedStyle(el);
          return {
            outlineColor: cs.outlineColor,
            outlineWidth: cs.outlineWidth,
            outlineStyle: cs.outlineStyle,
            outlineOffset: cs.outlineOffset,
            matchesFocusVisible: el.matches(':focus-visible'),
          };
        }, selector);

      const inputRing = await focusRing('.vsc__key');
      const buttonRing = await focusRing('#save');
      const linkRing = await focusRing('.vsc__link');

      // 焦点环必须真的存在（不是「恰好没有 outline」）。
      expect(inputRing.matchesFocusVisible, '输入框没有匹配 :focus-visible').toBe(true);
      expect(buttonRing.matchesFocusVisible, '按钮没有匹配 :focus-visible').toBe(true);
      expect(linkRing.matchesFocusVisible, '链接没有匹配 :focus-visible').toBe(true);

      // 三者必须**一模一样**。
      expect(buttonRing.outlineColor, '按钮的焦点环颜色与输入框不一致').toBe(inputRing.outlineColor);
      expect(buttonRing.outlineWidth, '按钮的焦点环粗细与输入框不一致').toBe(inputRing.outlineWidth);
      expect(buttonRing.outlineStyle, '按钮的焦点环样式与输入框不一致').toBe(inputRing.outlineStyle);
      expect(buttonRing.outlineOffset, '按钮的焦点环偏移与输入框不一致').toBe(inputRing.outlineOffset);

      expect(linkRing.outlineColor, '链接的焦点环颜色与输入框不一致').toBe(inputRing.outlineColor);
      expect(linkRing.outlineWidth, '链接的焦点环粗细与输入框不一致').toBe(inputRing.outlineWidth);

      // ⚠️ 最容易漏的那条：Chrome 的默认焦点环是**蓝色**。
      // 之前按钮走的正是它 —— 同一页两种颜色、两种粗细。
      expect(
        buttonRing.outlineColor,
        `按钮的焦点环还是 Chrome 默认蓝 ${buttonRing.outlineColor}`,
      ).not.toBe('rgb(0, 95, 204)');
      expect(buttonRing.outlineWidth).not.toBe('1px');
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：lead 段与卡片同宽', () => {
  test('lead 的宽度与卡片宽度接近（右边缘对齐）', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext, { width: 1280, height: 800 });

      const widths = await page.evaluate(() => {
        const lead = document.querySelector('.vsc__lead');
        const card = document.querySelector('.vsc__card');
        const leadRect = lead.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        return {
          leadWidth: leadRect.width,
          leadRight: leadRect.right,
          cardWidth: cardRect.width,
          cardRight: cardRect.right,
        };
      });

      // 曾经 lead 是 46ch（实测 405.6px），卡片是 640px ——
      // 差 234px，右侧空一大块，看着像「这块的排版没做完」。
      expect(
        Math.abs(widths.leadWidth - widths.cardWidth),
        `lead 宽 ${widths.leadWidth}px、卡片宽 ${widths.cardWidth}px，差得太多`,
      ).toBeLessThan(40);

      // 右边缘也要对齐（不只是宽度碰巧相同）。
      expect(
        Math.abs(widths.leadRight - widths.cardRight),
        `lead 右边缘 ${widths.leadRight}、卡片右边缘 ${widths.cardRight}，没对齐`,
      ).toBeLessThan(2);
    } finally {
      await ext.close();
    }
  });
});
