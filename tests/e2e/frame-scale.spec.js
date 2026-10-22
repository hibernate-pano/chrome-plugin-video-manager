import { test, expect } from '@playwright/test';
import { findColorBox, isGreen } from './helpers/png.js';
import { launchExtension } from './helpers/launch.js';
import { anyLocaleFragment } from './helpers/i18n.js';

/**
 * 缩放过的 iframe 里的坐标换算守卫。
 *
 * 背景：扩展的提示（调速胶囊、接管提示）挂在**顶层文档**、position:fixed，
 * 而 iframe 里的元素 getBoundingClientRect() 给的是 **iframe 自己视口**的坐标。
 * 两套坐标系之间要换算，v6.0.3 换过一次（当时 iframe 没有缩放）。
 *
 * 但「iframe 被 transform: scale() 缩过」是另一回事：这时 iframe 内部的
 * CSS 像素与父文档的 CSS 像素**不是 1:1**，只加偏移就会偏掉
 * （实测：缩放比 0.5、视频离视口顶 325px 时，纵向偏 25px、横向偏 20px）。
 *
 * 这套用例的量法是**先量、再比**：
 * 页面里给视频画一圈唯一颜色的边框，然后**从截图里把这圈边框的真实位置量出来**
 * —— 那是浏览器自己渲染出来的结果，与我们脑子里那套换算公式毫无关系。
 * 再拿扩展算出来的坐标去比，差得近才算过。
 *
 * 这么做是为了避免「自己算自己验」：如果拿公式的输出和公式的预期比，
 * 公式错了也一样全绿。
 */

const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
};

/**
 * iframe 内部：视频带一圈唯一颜色的边框。
 *
 * 边框画在 border box 上（box-sizing:border-box），所以**边框的外沿就是
 * 元素盒子本身的上/下/左/右** —— 截图里量到的那圈绿色，量到的就是
 * getBoundingClientRect() 该给出的那个矩形。
 */
const INNER = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#fff}
body{padding:50px 0 0 40px}
#inner{
  display:block;width:600px;height:338px;box-sizing:border-box;
  border:4px solid rgb(0,255,0);background:#000;
}
</style>
</head><body><video id="inner" muted playsinline></video></body></html>`;

/**
 * 外层页面：iframe 被缩放到一半。
 *
 * transform-origin 保持默认的 50% 50%（即**变换原点要参与计算**）——
 * 这正是「只加偏移」那套算法会算错的地方。
 */
const OUTER = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#fff}
#spacer{height:200px;background:#eee}
iframe{display:block;width:700px;height:500px;border:0;margin-left:300px;transform:scale(0.5)}
</style>
</head><body><div id="spacer">top</div><iframe id="f1" src="/inner.html"></iframe></body></html>`;

const routePages = (page) => page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('chrome-extension://')) return route.continue();
  return route.fulfill({ status: 200, contentType: 'text/html', body: url.includes('inner.html') ? INNER : OUTER });
});

/**
 * 打开页面、量出视频的真实视觉矩形。
 *
 * 量的方式：从**截图**里找那圈绿色 —— 浏览器渲染出来的位置，
 * 与任何换算公式无关。
 */
const openAndMeasure = async (page) => {
  await routePages(page);
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForTimeout(700);

  // ⚠️ 焦点必须送进 iframe：6.1.0 之后每个 frame 只管**自己 document 里**的视频，
  // 而键盘事件只派发给焦点所在的那个文档。
  //
  // 点 iframe 里的那个视频就能把焦点送进去（浏览器把焦点交给包含它的 frame）。
  const frame = page.frames().find((f) => f.url().includes('inner.html'));
  expect(frame, '前置条件：没找到 iframe').toBeTruthy();
  await frame.locator('#inner').click({ force: true });
  await page.waitForTimeout(300);

  const shot = await page.screenshot({ type: 'png' });
  const box = findColorBox(shot, isGreen);
  expect(box, '页面里应能量到视频的绿色边框（量不到说明测试页面本身坏了）').not.toBeNull();

  const metrics = await page.evaluate(() => {
    const frame = document.getElementById('f1');
    const video = frame.contentDocument.getElementById('inner');
    const frameRect = frame.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      frameLeft: frameRect.left,
      frameTop: frameRect.top,
      frameWidth: frameRect.width,
      frameHeight: frameRect.height,
      // offsetHeight 是**未变换**的 border box 高度 → 与 frameRect.height 之比就是有效缩放比
      frameOffsetHeight: frame.offsetHeight,
      videoLeft: videoRect.left,
      videoTop: videoRect.top,
      videoHeight: videoRect.height,
    };
  });

  return { box, metrics, frame };
};

test.describe('缩放过的 iframe：坐标换算', () => {
  test('调速提示要贴在视频的真实位置', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      const { box, metrics, frame } = await openAndMeasure(page);

      // 绿色边框的外沿 = 视频盒子本身。
      const truthTop = box.top;
      const truthLeft = box.left;
      const truthBottom = box.bottom + 1;

      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      // ⚠️ 提示住在**视频所在的那份文档**里 —— 这里是 iframe 的文档。
      //
      // 6.1.0 之后每个 frame 只管自己 document 里的视频，于是提示也跟着
      // 住在那一层，`position: fixed` 的参照系是**iframe 自己的视口**。
      //
      // 换算到顶层坐标是**错的**（frameOffset.ts 的文件头有实测记录）：
      // 那样算出来的 top 会把提示推到 iframe 之外，用户什么也看不到。
      //
      // 于是这个用例量的不是「顶层坐标」，而是「提示在 iframe 里对不对」——
      // 而 iframe 里**根本没有缩放问题**（缩放是父文档对 iframe 元素的变换，
      // iframe 内部自己的 CSS 像素与它的视口仍是 1:1）。
      const toast = await frame.evaluate(() => {
        const element = document.getElementById('vsc-speed-toast');
        return {
          text: element?.textContent ?? null,
          top: element ? parseFloat(element.style.top) : null,
          left: element ? parseFloat(element.style.left) : null,
        };
      });

      expect(toast.text, '前置条件：iframe 里的视频应能被调速并弹出提示').toBe('1.1x');

      // iframe 内的坐标：视频在 iframe 视口里的位置 + 16。
      expect(
        Math.abs(toast.top - (metrics.videoTop + 16)),
        `提示纵向应落在视频顶边 +16（视频顶边=${metrics.videoTop}，提示=${toast.top}）`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(toast.left - (metrics.videoLeft + 16)),
        `提示横向应落在视频左边 +16（视频左边=${metrics.videoLeft}，提示=${toast.left}）`,
      ).toBeLessThanOrEqual(2);

      // ⚠️ 反证：提示**不能**用顶层坐标。
      //
      // 「换算到顶层」那套算法会算出什么 —— 拿它当反证：
      // 正确结果必须离它足够远，否则这个用例根本区分不出两种算法。
      const naiveTop = metrics.frameTop + metrics.videoTop + 16;
      const naiveLeft = metrics.frameLeft + metrics.videoLeft + 16;

      expect(
        Math.abs(toast.top - naiveTop),
        '若这个断言挂了，说明测试已经退化成「拿公式验公式」',
      ).toBeGreaterThan(10);
      expect(
        Math.abs(toast.left - naiveLeft),
        '若这个断言挂了，说明测试已经退化成「拿公式验公式」',
      ).toBeGreaterThan(10);

      // 而**视觉上**它仍然贴在视频旁边 —— 截图像素是唯一的诚实证据。
      //
      // ⚠️ 换算必须用 frameOffset.ts 那套公式（frameOffset.ts 的文件头有推导）：
      //   父坐标 = frameRect.top + scale × 内容坐标
      // 缩放比 = frameRect.height / frame.offsetHeight
      //
      // 写成「frameTop + 内容坐标 × 0.5」是**错的**：transform 的原点
      // 在 50% 50%，缩放是绕中心进行的，不是绕左上角。
      const scale = metrics.frameHeight / metrics.frameOffsetHeight;
      const screenVideoTop = metrics.frameTop + scale * metrics.videoTop;
      const screenToastTop = metrics.frameTop + scale * toast.top;
      expect(
        Math.abs((screenToastTop - screenVideoTop) - 16 * scale),
        '提示在屏幕上的位置必须紧挨视频（间隔 16px × 缩放比）',
      ).toBeLessThanOrEqual(1);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('接管提示要贴在视频的真实下边缘', async () => {
    // ⚠️ 这个用例守的是「**接管提示**（不是调速胶囊）的位置」——
    // 提示住在**当前 frame 自己的文档**里，而 `position: fixed` 的参照系
    // 是那个文档的视口。
    //
    // 6.1.0 之前提示住在顶层文档，于是坐标要跨 frame 换算（还要算缩放）。
    // 现在：视频在 iframe 里 → 接管提示也住在 iframe 里 → 坐标是 iframe 内坐标，
    // **换算问题整个消失了**。
    //
    // 那什么时候才需要「接管提示」？当这个 frame 里的视频**接管不了**时。
    // 6.1.0 之后，同一个 frame 里的视频是**接管得了**的（同一个 document）——
    // 所以要制造「接管不了」的局面，只能让顶层 frame 面对一个 iframe 里的视频，
    // 而顶层 frame 看不见它（6.1.0 之后注册表不下钻 iframe）。
    //
    // 于是这条用例的场景改成：**焦点在顶层**，而视频在 iframe 里。
    // 这正是 6.1.0 之后「快捷键放行给页面」的那条路径。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      const { box, metrics } = await openAndMeasure(page);

      const truthBottom = box.bottom + 1;
      const truthLeft = box.left;

      // 焦点回到顶层文档（openAndMeasure 里我们把它送进了 iframe，这里送回来）。
      await page.mouse.click(200, 100);
      await page.waitForTimeout(250);

      // 顶层没有视频 → 按 f 放行给页面。
      await page.keyboard.press('f');

      // ⚠️ 用轮询而不是固定等待：这条提示要走**一整条跨进程链路**
      // （内容脚本 → background → 各 frame 回答 → 回到 background → 回到内容脚本），
      // 机器一忙（多标签页同时加载）整条链路可以慢到几百毫秒。
      // 固定等待会把「慢」误判成「失败」。
      await expect
        .poll(
          () => page.evaluate(() => Boolean(document.getElementById('vsc-takeover-notice'))),
          { timeout: 10_000 },
        )
        .toBe(true);

      const notice = await page.evaluate(() => {
        const element = document.getElementById('vsc-takeover-notice');
        return {
          text: element?.textContent ?? null,
          bottom: element?.style.bottom ?? null,
          left: element?.style.left ?? null,
        };
      });

      // 6.1.0 起：快捷键在本层没有目标时，**说出真相** ——
      // 「视频在嵌入框里，点一下它就能用快捷键」。
      //
      // ⚠️ 之前的做法是彻底静默（键穿透给页面），而用户能得出的唯一结论
      // 是「扩展坏了」。
      expect(
        notice.text,
        '顶层没有视频、视频在嵌入框里 → 必须告诉用户视频在哪儿',
      ).toMatch(anyLocaleFragment('noticeVideoElsewhere'));

      // ⚠️ 这条提示**不贴视频**，它贴**视口左上角**。
      //
      // 理由：这一层压根没有视频 —— 没有可锚定的对象（「贴视频旁边」
      // 那套逻辑在这里无从谈起），而提示是 position:fixed，
      // 不给坐标就落在文档流末尾（屏幕外）。
      //
      // 贴左上角还有一个好处：它**不会**被 iframe 里的内容盖住 ——
      // 那是用户在顶层这一层唯一能看见的位置。
      expect(
        notice.bottom,
        '「视频在嵌入框里」贴着视口上边（bottom 必须是 auto）',
      ).toBe('auto');

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });
});
