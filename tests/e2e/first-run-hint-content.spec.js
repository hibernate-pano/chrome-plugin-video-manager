import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';
import { anyLocaleFragment } from './helpers/i18n.js';

/**
 * 首次引导的**内容**守卫。
 *
 * ⚠️ 为什么单测守不了这些：
 * - 单测里的引导是一段**字符串** —— 它测不出浏览器把它渲染成几行、
 *   折没折行、字够不够大；
 * - 单测也测不出「按 0 到底能不能回到 1x」——
 *   那要真浏览器里真按一次键；
 * - 更测不出「× 按钮聚焦时有没有焦点环」——
 *   那是**伪类**（:focus-visible），内联样式表达不了。
 *
 * 这份用例守四件事：
 * 1. 引导**真的教了「怎么回到 1x」**（全屏之外没有别的出口）；
 * 2. 完整版在真实渲染下**恰好 4 行**、精简版**恰好 2 行**
 *    （行数是承重不变式：阅读窗口 + 小视口的高度预算都锁在它上面）；
 * 3. 按 0 **真的**把倍速带回 1x；
 * 4. × 按钮**键盘可达**，而且聚焦时**看得见焦点在哪**。
 */

const HINT_ID = 'vsc-first-run-hint';
const CLOSE_ID = 'vsc-first-run-hint-close';

/** 卡片 token 里的排版：13px × 1.4 = 每行 18.2px（见 runtimeStyles.ts）。 */
const LINE_HEIGHT = 13 * 1.4;

const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

const serve = (page, body) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });

/**
 * 一个正经的播放器。
 *
 * ⚠️ 必须带原生 controls：没有原生控件的视频会被判成「站点摆在那儿的
 * 装饰性自动播放」（ambientPreview 的共享判定），引导根本不会为它出现。
 */
const playerHtml = (id = 'v') => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#${id}{width:640px;height:360px;background:#000;display:block}</style>
</head><body><video id="${id}" controls muted playsinline preload="auto" src="${CLIP}"></video></body></html>`;

/**
 * 读引导节点，并算出它**真实渲染**成了几行。
 *
 * ⚠️ 行数不能靠数 '\n'：那是**源码**里的行数，不是浏览器里的行数。
 * 窄视口下某一行会折行，于是渲染行数比源码行数多 —— 而阅读窗口
 * 是按**渲染**出来的字数给的（readWindowMs 按 '\n' 数，那是个近似）。
 * 这里量真实高度：行数 = (高度 - 上下内边距) / 行高。
 */
const readHint = (page) =>
  page.evaluate(
    ({ id, lineHeight }) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible =
        cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;

      const paddingTop = parseFloat(cs.paddingTop) || 0;
      const paddingBottom = parseFloat(cs.paddingBottom) || 0;
      const contentHeight = r.height - paddingTop - paddingBottom;

      // ⚠️ 每一行单独量：某个 '\n' 段自己折了行，段高就会大于一个行高。
      const segments = (el.textContent ?? '').split('\n').map((segment) => {
        const probe = document.createElement('div');
        probe.style.cssText =
          'white-space:pre-line;font-size:13px;font-weight:600;line-height:1.4;';
        probe.textContent = segment;
        el.appendChild(probe);
        const h = probe.getBoundingClientRect().height;
        probe.remove();
        return { text: segment, lines: Math.round(h / lineHeight) };
      });

      return {
        text: el.textContent ?? '',
        visible,
        height: r.height,
        contentHeight,
        renderedLines: Math.round(contentHeight / lineHeight),
        segments,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    },
    { id: HINT_ID, lineHeight: LINE_HEIGHT },
  );

/** 让视频**由用户亲手**播起来 —— 没有用户手势就会被判成装饰性自动播放。 */
const playByHand = async (page, id = 'v') => {
  await page.locator(`#${id}`).click({ force: true });
  await page.evaluate((vid) => {
    document.getElementById(vid).play().catch(() => {});
  }, id);
};

/**
 * 等引导**完全显现**。
 *
 * ⚠️ 不能只等 `opacity > 0`：淡入动画有 220ms（NOTICE_CARD_TOKENS 的
 * `--vsc-notice-fade`），`opacity > 0` 在动画**第一帧**就成立 ——
 * 那时引导还没加 `vsc-visible` 类，× 按钮于是还是
 * `visibility: hidden`（mountCloseButton 在 present() 之前调用，
 * 按钮的可见性由 MutationObserver 跟着 `vsc-visible` 走）。
 *
 * 于是「在淡入第一帧量按钮」量到的是「按钮还没准备好」，
 * 而不是「按钮坏了」—— 两者要分开，否则会去修一个不存在的问题。
 */
const waitForHint = async (page) => {
  await expect
    .poll(async () => (await readHint(page))?.visible === true, { timeout: 10_000 })
    .toBe(true);

  // 等淡入走完：opacity 接近 1，且 `vsc-visible` 类已经加上。
  await expect
    .poll(
      async () =>
        page.evaluate((id) => {
          const el = document.getElementById(id);
          if (!el) return false;
          return (
            el.classList.contains('vsc-visible') &&
            Number(getComputedStyle(el).opacity) > 0.95
          );
        }, HINT_ID),
      { timeout: 5000 },
    )
    .toBe(true);

  return readHint(page);
};

test.describe('首次引导：内容与可达性', () => {
  test.setTimeout(90_000);

  test('站点在扩展挂上监听器之前就把视频播起来 → 引导仍然出现', async () => {
    // ⚠️ 这是一条**真实发生过的**竞态守卫。
    //
    // 扩展注入在 document_start，但它要**等设置加载完**才挂上 `play` 监听器
    // （引导得照着用户真实的绑定渲染）。页面脚本在这中间调了 `video.play()`，
    // 那次事件我们**根本没听见** —— 引导于是永远不出现。
    //
    // 最深的地方在于：**这个洞咬得最狠的时候，正是引导最该出现的时候**。
    // 首次安装时扩展是**冷的**（装包、读设置、初始化模块），
    // 而「用户刚打开一个课程页、视频自动开始播」正是最典型的首见场景。
    // 也就是说：**越是新用户，越看不到这条引导** ——
    // 而引导是这个产品**全部**的可见入口。
    //
    // ⚠️ 这里必须让页面在**解析期**就播（不是延后 600ms）：
    // 延后那一版是「与扩展抢时间」，抢赢抢输看机器快慢 ——
    // 那不是守卫，是**运气**。解析期就播是**确定**落在窗口内的那一种。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(
        page,
        `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:640px;height:360px;background:#000;display:block}</style>
</head><body><video id="v" controls muted playsinline preload="auto" src="${CLIP}"></video>
<script>
  // ⚠️ 必须带原生 controls：没有原生控件的视频会被判成「站点摆在那儿的
  // 装饰性自动播放」（ambientPreview 的共享判定），引导根本不会为它出现。
  document.getElementById('v').play().catch(function () {});
</script>
</body></html>`,
      );
      await page.goto('http://127.0.0.1:4173/');

      // 前置条件：视频**确实在播**（否则这条用例测的是别的东西）。
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const v = document.getElementById('v');
              return v ? !v.paused && v.currentTime > 0 : false;
            }),
          { timeout: 15_000 },
        )
        .toBe(true);

      // 引导必须出现 —— 哪怕那个 play 事件发生在我们挂上监听器之前。
      await expect
        .poll(
          () => page.evaluate((id) => Boolean(document.getElementById(id)), HINT_ID),
          {
            timeout: 15_000,
            message:
              '视频在扩展挂上监听器之前就播起来了 → 引导仍然必须出现。' +
              '曾经它永远不出现（用户于是完全不知道这个扩展会做什么）。',
          },
        )
        .toBe(true);
    } finally {
      await ext.close();
    }
  });

  test('引导真的教了「怎么回到 1x」，而且按 0 真的回得去', async () => {    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, playerHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await playByHand(page);

      const hint = await waitForHint(page);

      // ① 引导里必须**提到**回到 1x 这件事。
      expect(
        hint.text,
        '全屏之外没有别的出口能回到 1x（胶囊与角标都是 pointer-events: none；' +
          '倍速菜单只在全屏控制条里；manifest 无 contextMenus 权限）—— 引导必须教它',
      ).toMatch(/1x|1\.0x/i);

      // ② 而且说的必须是**用户当前真实的绑定**（默认是 0）。
      //
      // ⚠️ 必须从 **service worker** 读：内容脚本的隔离世界里没有
      // `chrome.storage`（实测：page.evaluate 里 chrome 是 undefined，
      // 直接读会抛 "Cannot read properties of undefined"）。
      // 而 service worker 里是**有**的（扩展上下文）。
      const resetKey = await ext.serviceWorker.evaluate(
        () =>
          new Promise((resolve) => {
            chrome.storage.local.get('vsc-shortcuts', (stored) => {
              resolve(stored['vsc-shortcuts']?.resetSpeed ?? '0');
            });
          }),
      );
      expect(hint.text, '引导里要出现复位键本身').toContain(resetKey);

      // ③ **按下去真的能回 1x** —— 这是「教了就要能用」的最后一环。
      await page.evaluate(() => {
        document.getElementById('v').playbackRate = 2;
      });
      expect(
        await page.evaluate(() => document.getElementById('v').playbackRate),
        '前置条件：先把倍速推到 2x',
      ).toBe(2);

      await page.keyboard.press(resetKey === '0' ? '0' : 'Digit0');
      await page.waitForTimeout(200);

      expect(
        await page.evaluate(() => document.getElementById('v').playbackRate),
        '按复位键之后必须真的回到 1x —— 引导教了就要能用',
      ).toBe(1);
    } finally {
      await ext.close();
    }
  });

  test('完整版在真实渲染下恰好 4 行、每一行都不折行', async () => {
    // ⚠️ 行数是**承重不变式**：
    // - readWindowMs 按行数算阅读窗口（少一行 → 判「读过了」判早了）；
    // - pickFittingText 的高度预算（小视口里 4 行放不下）；
    // - 测试里那根 130px 的高度桩。
    //
    // 所以「随手加一行」必须当场变红，而不是等到有人在嵌入框里看到
    // 一张糊住播放器的纸才发现。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, playerHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await playByHand(page);
      const hint = await waitForHint(page);

      // ⚠️ 完整版 = 4 行（调速 / 全屏 / 工具栏 / 去哪儿改绑）。
      expect(hint.renderedLines, '完整版必须恰好 4 行').toBe(4);

      // ⚠️ 而且每一行都**不许折行** —— 折行会让渲染行数变多，
      // 而阅读窗口是按源码行数算的（那就又对不上了）。
      const folded = hint.segments.filter((segment) => segment.lines > 1);
      expect(
        folded,
        `这些行在真实渲染里折行了：${JSON.stringify(folded)}`,
      ).toEqual([]);

      // 完整版该有的两条补充信息都在。
      expect(hint.text).toMatch(anyLocaleFragment('hintToolbar'));
    } finally {
      await ext.close();
    }
  });

  test('× 按钮：键盘可达，且聚焦时看得见焦点在哪', async () => {
    // ⚠️ 引导节点本身是 pointer-events: none 且 aria-hidden，
    // 用户点不到它 —— **「×」是「我故意关掉引导」的唯一正路**。
    //
    // 对键盘用户来说，这条路只有一个走法：Tab 到那个按钮上按 Enter。
    // 没有焦点环的话，他 Tab 过去之后**完全不知道焦点在哪** ——
    // 于是这条唯一的路对键盘用户等于不存在。
    //
    // 实测（真实 Chromium）：加焦点环之前，按钮的 outline 是
    // `rgb(248,250,252) none 3px` —— outline-style 是 none，
    // 即**完全没有焦点指示**。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, playerHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await playByHand(page);
      await waitForHint(page);

      // ① 按钮存在，且**真的能点**（它是唯一的关闭入口）。
      const close = page.locator(`#${CLOSE_ID}`);
      await expect(close, '引导必须有一个可点的关闭按钮').toBeTruthy();
      expect(await close.count(), '关闭按钮必须真的挂上了').toBe(1);

      // ② 目标尺寸：WCAG 2.5.8（Target Size Minimum, AA）的下限是 24×24。
      const size = await close.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      expect(
        size.w,
        '关闭按钮是「唯一能关掉引导」的东西 —— 20px 的点击区对触屏用户太小',
      ).toBeGreaterThanOrEqual(24);
      expect(size.h).toBeGreaterThanOrEqual(24);

      // ③ 用**真键盘** Tab 到它上面，看**有没有可见的焦点指示**。
      //
      // ⚠️ 必须用键盘 Tab，不能用 `el.focus()`：
      // Chrome 的 `:focus-visible` 只在「焦点是**键盘导航**带来的」时匹配。
      // 程序化 focus() 在**页面刚被鼠标点过**之后不匹配（实测：
      // matchesFocusVisible = false）—— 而这个页面里我们刚刚点过视频。
      // 于是用 focus() 测出来的是「伪类没匹配」，不是「焦点环没画」，
      // 两者要分开。
      //
      // 诊断信息必须一起带出来：outline=none 有两种完全不同的根因，
      // 修法也不同 ——
      //   (a) `all: initial !important`（内联）压掉了样式表里那条规则；
      //   (b) `:focus-visible` 本就没匹配。
      // 只看 outline=none 分不出是哪一种。
      // ⚠️ Tab 一次未必到得了那个 ×（页面里还有原生 video controls 等
      // 可聚焦元素）。所以**一直按 Tab 直到焦点落在它上面**，
      // 并记录按了几次 —— 「要按 5 次才够得着」本身就是个问题。
      // ⚠️ Tab 循环**必须在引导还活着的时候完成** ——
      // 引导只显示 12 秒（firstRunHint.ts 的 HINT_DURATION），
      // 循环耗到引导淡出之后，量到的就是「按钮被正确收起了」，
      // 而不是「按钮够不着」。
      // ⚠️ 循环开始前确认引导还活着：它只显示 12 秒
      // （firstRunHint.ts 的 HINT_DURATION），循环耗到它淡出之后，
      // 量到的就是「按钮被正确收起了」，而不是「按钮够不着」。
      const aliveAtStart = await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return 'missing';
        return {
          hasClass: el.classList.contains('vsc-visible'),
          opacity: getComputedStyle(el).opacity,
          inlineOpacity: el.style.getPropertyValue('opacity'),
        };
      }, HINT_ID);
      expect(
        aliveAtStart.hasClass,
        `前置条件：引导必须还亮着 —— ${JSON.stringify(aliveAtStart)}`,
      ).toBe(true);

      // ⚠️ 焦点要从**远处**出发（2026-10-22 改）。
      //
      // 原来焦点就在按钮附近，Tab **一次**就落到了按钮上 ——
      // 于是「Tab 会把引导关掉」这条路径**根本没被触发**，
      // 测试是**碰巧**过的：把导航键豁免删掉，测试照样绿（实测）。
      //
      // 那条缺陷是真的：Tab 落在页面的别的元素上 → 引导当场消失 →
      // 按钮永远按不到。所以这里必须造出一个「焦点在远处、
      // 要 Tab 好几步」的场景。
      await page.evaluate(() => {
        const host = document.createElement('div');
        host.id = 'vsc-far-focus-host';
        host.innerHTML =
          '<button id="far-1">1</button><button id="far-2">2</button><button id="far-3">3</button>';
        document.body.appendChild(host);
        document.getElementById('far-1').focus();
      });

      // ⚠️ 循环里的每一次 Tab 都要**尽量少做往返**：
      // 引导只活 12 秒，而每�� evaluate 都有开销 ——
      // 往返一多，循环还没走完引导就淡出了，
      // 断言会读到「按钮被正确收起了」而不是「按钮够不着」。
      // 于是：一次 evaluate 拿到全部信息（还活着吗？焦点在谁身上？），
      // 别分三次问。
      let tabCount = 0;
      let focused = false;
      let alive = true;
      const tabTrail = [];
      for (; tabCount < 8 && !focused; tabCount += 1) {
        // ⚠️ 先按 Tab，再看结果 —— 反过来的话，最后一次按完就退出了
        // 循环，那一次的结果**从来没被检查过**（实测：按了 8 次都判「没到」，
        // 而按钮其实就在那儿）。
        await page.keyboard.press('Tab');

        // ⚠️ 两个 id 都要传：**提示根节点**与**关闭按钮**是两个元素。
        // 只找根节点的话，`active === el` 比的是「焦点在不在提示卡片上」——
        // 而焦点落在卡片里那个**按钮**上时，这个比较恒为 false，
        // 于是「按钮已经 Tab 到了」被读成「Tab 到了 8 次都没到」。
        // （实测：Tab 轨迹里明明有 BUTTON#vsc-first-run-hint-close，
        //   用例却判「没到」。）
        const snapshot = await page.evaluate(
          ({ hintId, closeId }) => {
            const root = document.getElementById(hintId);
            const button = document.getElementById(closeId);
            const active = document.activeElement;
            return {
              alive: !!root && root.classList.contains('vsc-visible'),
              onButton: !!button && active === button,
              active: active
                ? `${active.tagName}#${active.id || '-'}.${(active.className || '')
                    .toString()
                    .split(' ')[0]}`
                : 'null',
            };
          },
          { hintId: HINT_ID, closeId: CLOSE_ID },
        );

        tabTrail.push(snapshot.active);

        if (!snapshot.alive) {
          alive = false;
          break;
        }
        if (snapshot.onButton) {
          focused = true;
          break;
        }
      }

      // 诊断：按钮到底在不在 tab 顺序里。
      const tabbable = await close.evaluate((el) => {
        const root = el.parentElement;
        const cs = getComputedStyle(el);
        return {
          display: cs.display,
          visibility: cs.visibility,
          pointerEvents: cs.pointerEvents,
          tabIndex: el.tabIndex,
          disabled: el.disabled,
          hidden: el.hidden,
          inert: el.inert ?? null,
          parentVisibility: getComputedStyle(el.parentElement).visibility,
          parentPointerEvents: getComputedStyle(el.parentElement).pointerEvents,
          parentOpacity: getComputedStyle(el.parentElement).opacity,
          parentDisplay: getComputedStyle(el.parentElement).display,
          rootClass: root?.className ?? null,
          rootHasVisibleClass: root?.classList.contains('vsc-visible') ?? false,
          rootOpacityAttr: root?.style.getPropertyValue('opacity') ?? null,
        };
      });

      const focus = await close.evaluate((el) => {
        const focused = document.activeElement === el;
        const cs = getComputedStyle(el);
        const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const hasShadow = cs.boxShadow !== 'none' && cs.boxShadow !== '';
        return {
          focused,
          hasOutline,
          hasShadow,
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          matchesFocusVisible: el.matches(':focus-visible'),
          matchesFocus: el.matches(':focus'),
          inlineAll: el.style.getPropertyValue('all'),
          inlineAllPriority: el.style.getPropertyPriority('all'),
          inlineOutline: el.style.getPropertyValue('outline'),
          inlineOutlinePriority: el.style.getPropertyPriority('outline'),
        };
      });

      expect(
        focus.focused,
        `× 必须能被键盘聚焦（它是唯一的关闭入口）—— 按了 ${tabCount} 次 Tab 也没到\n` +
          `引导还活着吗：${alive}\n` +
          `Tab 轨迹：${JSON.stringify(tabTrail)}\n` +
          `按钮状态：${JSON.stringify(tabbable, null, 2)}`,
      ).toBe(true);
      expect(
        focus.hasOutline || focus.hasShadow,
        `× 聚焦时必须有可见的焦点指示 —— 键盘用户 Tab 到它之后要知道自己在哪\n` +
          `诊断：${JSON.stringify(focus, null, 2)}`,
      ).toBe(true);

      // ④ 按 Enter 真的关得掉（焦点可达 = 真的能操作）。
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      const after = await readHint(page);
      expect(
        after?.visible ?? false,
        '键盘按 Enter 必须能关掉引导 —— 焦点环只有样子没有用是假的',
      ).toBe(false);
    } finally {
      await ext.close();
    }
  });
});
