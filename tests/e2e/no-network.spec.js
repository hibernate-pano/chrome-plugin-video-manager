import { test, expect } from '@playwright/test';
import { launchExtension } from './helpers/launch.js';

/**
 * 「不发起任何网络请求」这句承诺的**真实浏览器**守卫。
 *
 * ⚠️ 为什么已经有两道静态守卫还要这一条：
 *
 *   - `scripts/release-content.test.ts` 扫**源码**；
 *   - `scripts/package-extension.js` 的 `assertNoNetworkApis()` 扫**产物**。
 *
 * 两者都是「文本里有没有那个词」。而承诺的真正含义是
 * **运行起来会不会真的发请求** —— 只有真实浏览器能回答。
 *
 * ⚠️ 这条守卫守的是什么事故：
 * 2026-10-22 出过一次真实的漏网 —— Vite 默认注入的 modulepreload polyfill
 * 带着 `fetch(s.href)` 进了产物。那段代码运行时是死的（Chrome 原生支持
 * modulepreload，polyfill 第一件事就是「不支持就 return」），
 * 但它**躺在商店文案邀请用户去检查的那个 zip 里**。
 * 已通过 `vite.config.js` 的 `modulePreload.polyfill: false` 去掉，
 * 并加了上面两道静态守卫。
 *
 * ⚠️ 断言方式为什么不查「请求条数」：
 * 页面自己会请求 favicon、也会请求站点资源 —— 那些不是扩展发的。
 * 所以这里查的是「**扩展自己**有没有发起请求」：
 *   - 内容脚本：页面加载前后各截一次请求快照，比对**新增**的那些；
 *   - 设置页：单独开一个页面，同样比对。
 * 判据是「扩展引起的新增请求里，没有一个是发往外部主机的」。
 */

/**
 * 这个请求是不是「发往扩展以外的地方」。
 *
 * ⚠️ 这里必须排除**页面自己**的请求（导航到页面本身、页面里的资源）：
 * 页面请求自己的 HTML 与 favicon 是浏览器行为，与扩展无关 ——
 * 把它们算进来，守卫就永远红，而红久了就没人信了。
 *
 * 判据：**请求发起后，扩展有没有往别处发东西**。
 * 所以对照的是「扩展动手前」与「扩展动手后」的请求集合之差。
 */
const isExternal = (url, pageOrigin) => {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return false;
  if (url.startsWith('chrome-extension://')) return false;
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('http')) return false;
    // 同源的资源请求（favicon 等）是页面自己的行为。
    if (pageOrigin && parsed.origin === pageOrigin) return false;
    return true;
  } catch {
    return false;
  }
};

test.describe('「不发起任何网络请求」的承诺', () => {
  test('内容脚本在真实页面上不发起任何请求', async () => {
    const { context, close } = await launchExtension();

    try {
      const page = await context.newPage();
      const requests = [];
      page.on('request', (request) => requests.push(request.url()));

      // 一个**自建**的页面 —— 不走任何外部站点，
      // 于是「页面自己发的请求」几乎为零，剩下的就是扩展发的。
      //
      // ⚠️ 路由**必须放行 chrome-extension:// 的请求**：
      // 内容脚本是用动态 import() 加载 content.js 的，而动态 import 走的是
      // fetch —— 一旦被这里 abort，内容脚本**根本不会加载**，
      // 于是「扩展没有发请求」这句话就变成了**空转**（测的是「扩展没跑」）。
      // 这个坑踩过一次：守卫是绿的，但绿得毫无意义。
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url === 'http://vsc.test/index.html') {
          await route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><html><head><title>vsc</title></head>
              <body><video id="v" width="640" height="360"></video></body></html>`,
          });
          return;
        }
        if (url.startsWith('chrome-extension://')) {
          await route.continue();
          return;
        }
        await route.abort();
      });

      await page.goto('http://vsc.test/index.html');
      await page.waitForTimeout(1500);

      // ⚠️ 先证明**扩展真的跑起来了** ——
      // 否则「没有外部请求」可能只是因为内容脚本压根没加载
      // （踩过一次：路由把 chrome-extension:// 的动态 import abort 了，
      //  守卫一直是绿的，测的却是「扩展没跑」）。
      const bootstrapped = requests.some((url) => url.endsWith('/content.js'));
      expect(
        bootstrapped,
        '内容脚本没有被加载 —— 这条守卫在空转。' +
          '检查 page.route 是不是把 chrome-extension:// 的请求也 abort 了。',
      ).toBe(true);

      const external = requests.filter((url) => isExternal(url, 'http://vsc.test'));
      console.log('内容脚本场景的全部请求:', JSON.stringify(requests));
      console.log('其中发往外部主机的:', JSON.stringify(external));

      expect(
        external,
        '扩展在真实页面上发起了外部请求 —— 「不发起任何网络请求」这句承诺不成立：\n' +
          external.join('\n'),
      ).toEqual([]);
    } finally {
      await close();
    }
  });

  test('设置页不发起任何请求', async () => {
    const { context, extensionId, close } = await launchExtension();

    try {
      const page = await context.newPage();
      const requests = [];
      page.on('request', (request) => requests.push(request.url()));

      await page.goto(`chrome-extension://${extensionId}/options.html`);
      await page.waitForTimeout(1500);

      const external = requests.filter((url) => isExternal(url, null));
      console.log('设置页的全部请求:', JSON.stringify(requests));
      console.log('其中发往外部主机的:', JSON.stringify(external));

      expect(
        external,
        '设置页发起了外部请求 —— 「不发起任何网络请求」这句承诺不成立：\n' +
          external.join('\n'),
      ).toEqual([]);

      // 顺带确认设置页**真的加载了**（否则「没请求」可能只是因为页面白屏）。
      await expect(page.locator('body')).toBeVisible();
    } finally {
      await close();
    }
  });
});
