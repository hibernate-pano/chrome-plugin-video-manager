import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as liveRegionModule from './liveRegion';
import {
  ContentRuntime,
  FOCUS_WATCH_INTERVAL_MS,
  NO_VIDEO_HINT_INTERVAL_MS,
} from './runtime';
import {
  FRAME_FOCUS_MESSAGE,
  FRAME_GONE_MESSAGE,
  FRAME_PROBE_MESSAGE,
  SPEED_REPORT_MESSAGE,
  STORAGE_KEY,
  VIDEO_OWNER_QUERY_MESSAGE,
  TOGGLE_FULLSCREEN_MESSAGE,
} from '../shared/types';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 取最近一个 ContentRuntime 注册的 onMessage 监听器（beforeEach 的实例先注册）。 */
const lastMessageListener = () => {
  const calls = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0];
};

/**
 * 取出 storage.onChanged 上注册的监听器。
 *
 * 这一层以前是 `vi.fn()`：注册了回调但从不派发，于是「设置热更新」这条链路的
 * 唯一接线点（runtime.ts 里 subscribeToSettings 的那个listener）从未被任何测试
 * 执行过。实测把runtime.ts 的 `this.settings = settings` 改成 `void settings`
 * 之后，185 个单测和 18 个 E2E 全部照样通过 —— 断链完全不会被发现。
 *
 * 改成真实派发：让回调能被调用，才能对它做行为断言。
 *
 * ⚠️ 必须派给**所有**监听器，不能只挑一个：
 * chrome.storage.onChanged 的真实语义是「注册过的监听器全都会被叫到」。
 * 这里曾经只取「最后一个」—— 那等于假设这条链路上只会有一个监听器，
 * 而 firstRunHint 后来也注册了一个（它要盯着自己的「本 frame 认领」标记）。
 * 于是「最后一个」变成了 firstRunHint 的回调，设置热更新那条链路**根本没被触发**，
 * 测试报的却是「改键后 q 立刻接管网页全屏」失败 ——
 * 真实浏览器里两个监听器都会被叫到，产品没坏，是这份替身撒了谎。
 */
const storageChangeListeners = () => {
  const calls = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls;
  return calls.map((call) => call[0] as (
    changes: Record<string, chrome.storage.StorageChange>,
    namespace: string,
  ) => void);
};

/**
 * 焦点归谁 —— 6.1.0 之后「谁能说话」判的正是它。
 *
 * ⚠️ jsdom 的 `document.hasFocus()` 恒为 false（实测：空 body、插了 video、
 * 插了 iframe 都是 false；只有对一个可聚焦元素调用过 `.focus()` 之后才为 true），
 * 而 `ownsUserFocus()`（frameScope.ts）判的第一条就是它 —— 不显式摆出焦点状态，
 * 这份文件里所有「谁该上报」的契约一条都测不出来。
 *
 * 手法照抄 frameScope.test.ts：用 defineProperty 覆盖**实例**上的方法
 * （原型上的那个是只读的，改不了）。
 */
const originalHasFocus = document.hasFocus;

const setHasFocus = (value: boolean) => {
  Object.defineProperty(document, 'hasFocus', {
    value: () => value,
    configurable: true,
  });
};

const createVideo = () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'playbackRate', {
    value: 1,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, 'paused', {
    value: true,
    writable: true,
    configurable: true,
  });
  // jsdom 不实现 HTMLMediaElement 的 play()/pause()：play() 走 notImplemented，
  // 返回 undefined，于是 `void video.play().catch(...)` 会抛 TypeError
  // （读屏播报那条链路正是靠 togglePlayback 触发播放/暂停的）。
  Object.defineProperty(video, 'play', {
    value: vi.fn(() => {
      (video as unknown as { paused: boolean }).paused = false;
      return Promise.resolve();
    }),
    configurable: true,
  });
  Object.defineProperty(video, 'pause', {
    value: vi.fn(() => {
      (video as unknown as { paused: boolean }).paused = true;
    }),
    configurable: true,
  });
  return video;
};

describe('ContentRuntime integration', () => {
  let runtime: ContentRuntime;
  let store: Map<string, unknown>;
  let video: HTMLVideoElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    // 默认「焦点在这个文档里」：真实浏览器里用户正看着这个页面，
    // 而 jsdom 的 hasFocus() 恒为 false —— 不显式打开，
    // 「谁能上报倍速 / 焦点」这条契约在单测里根本走不到。
    setHasFocus(true);
    store = new Map();
    video = createVideo();
    video.id = 'test-video';
    document.body.appendChild(video);

    vi.stubGlobal('chrome', {
      runtime: {
        // ⚠️ 必须有 id：真实的内容脚本里 chrome.runtime.id 一定存在，
        // 而它变成 undefined 正是「扩展被更新/重载」的判据
        // （见 runtime.ts 的 isContextInvalidated）。
        id: 'test-extension-id',
        lastError: null,
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        sync: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        local: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    runtime = new ContentRuntime({
      // jsdom 造不出可信事件：`isTrusted` 是实例上的 non-configurable 属性，
      // `Object.defineProperty` 会抛 TypeError，原型上也没有 getter 可覆盖。
      // 键盘控制器默认只认 isTrusted —— 于是「按 = 真的改倍速」这条集成链路
      // 在单测里永远跑不起来（合成事件会被正确地当成伪造事件拒掉）。
      // 这里注入一条恒真的判据，把「真实输入」这一层让给浏览器，
      // 单测只验证接线与行为。伪造事件的拒绝另有专门的单测覆盖。
      isTrustedEvent: () => true,
    });
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
  });

  /**
   * 起一份**新的**运行时（用当前的 DOM 状态）。
   *
   * 为什么需要：有些契约只在「启动那一刻」成立 ——
   * 比如「这一层没有受控视频时，启动上报不带 rate」。
   * beforeEach 里那份运行时是在**有视频**的 DOM 上起的，
   * 改不了它的启动条件，只能另起一份。
   */
  const startFreshRuntime = async () => {
    runtime.stop();
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
    runtime = new ContentRuntime({ isTrustedEvent: () => true });
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
  };

  afterEach(() => {
    runtime.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'hasFocus', {
      value: originalHasFocus,
      configurable: true,
    });
  });

  it('enters page fullscreen on request from the toolbar icon', async () => {
    let response: unknown = null;

    lastMessageListener()(
      { type: TOGGLE_FULLSCREEN_MESSAGE },
      {},
      (value: unknown) => {
        response = value;
      },
    );

    expect(response).toEqual({ ok: true, active: true });
    expect(document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active')).toBe(true);
    expect(document.getElementById('vsc-controls')).not.toBeNull();

    // 再点一次退出，控制条要一并拆除。
    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, (value: unknown) => {
      response = value;
    });
    expect(response).toEqual({ ok: true, active: false });
    expect(document.getElementById('vsc-controls')).toBeNull();
  });

  /**
   * 症状 A：从**控制条的退出钮**退出之后，点工具栏图标必须进**眼前那个**视频。
   *
   * ⚠️ 以前只有 Esc 那条路径会去更新注册表 —— 于是从控制条退出之后，
   * 注册表仍把那个**已经退出全屏**的视频当成「全屏中的视频」，
   * 而它在 getCurrentVideo() 里是**绝对优先**的分支（连「在不在视口里」
   * 都不看）→ 点图标 → 又是那个早就滚出屏幕的视频进全屏。
   *
   * ⚠️ 这条用例必须**摆出真实的几何**：jsdom 没有布局引擎，
   * 「在视口里」那条判据永远读成 0 —— 不模拟视口的话，
   * 「off-screen 的那个不该被选中」这条根本无从谈起。
   */
  it('从控制条的退出钮退出后，点工具栏图标进的是眼前那个视频', async () => {
    // 模拟一个「有布局引擎、视口 1280×720」的文档。
    //
    // ⚠️ 还原必须放在 finally 里：这些是 own property（不会随 body.innerHTML
    // 一起消失），断言一失败就漏给后面的用例 —— 后面 20 多条会跟着一起红，
    // 而红的原因与它们自己无关。
    const restoreViewport = () => {
      delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
      delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    };

    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1280, configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 720, configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });

    try {
      // 场景：页面上**只有** gone 这一个视频，用户对它进了全屏。
      document.body.innerHTML = '';
      const gone = createVideo();
      gone.id = 'gone';
      gone.setAttribute('controls', '');
      const goneRect = { top: 0, left: 0, right: 800, bottom: 450, width: 800, height: 450 };
      gone.getBoundingClientRect = () => ({
        ...goneRect, x: goneRect.left, y: goneRect.top, toJSON: () => ({}),
      } as DOMRect);
      document.body.appendChild(gone);

      // 进全屏（页面上只有它，它就是当前目标）。
      lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(
        document.getElementById('vsc-page-fullscreen-stage')?.querySelector('video')?.id,
        '前置条件：进全屏的是 gone',
      ).toBe('gone');

      // ⚠️ 从**控制条的退出钮**退出（不是 Esc）。
      // 它调的是控制器的 exit()，以前那条路径不会去更新注册表。
      const exitButton = document
        .getElementById('vsc-controls')
        ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="exit"]');
      expect(exitButton, '控制条上必须有退出按钮').not.toBeNull();
      exitButton?.click();
      await vi.advanceTimersByTimeAsync(0);

      expect(
        document.getElementById('vsc-page-fullscreen-overlay'),
        '前置条件：已经退出全屏',
      ).toBeNull();

      // 用户往下滚了：gone 滚出屏幕，眼前换成另一条视频 visible。
      goneRect.top = 5000;
      goneRect.bottom = 5450;
      const visible = createVideo();
      visible.id = 'visible';
      visible.setAttribute('controls', '');
      visible.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 800, bottom: 450, width: 800, height: 450,
        x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect);
      document.body.appendChild(visible);

      // 用户随后点了工具栏图标。
      lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});
      await vi.advanceTimersByTimeAsync(0);

      expect(
        document.getElementById('vsc-page-fullscreen-stage')?.querySelector('video')?.id,
        '图标路径必须进眼前那个视频，不能再进那个已经退出全屏的',
      ).toBe('visible');
    } finally {
      restoreViewport();
    }
  });

  /**
   * 症状 B（同一个根因的另一面）：从**控制条的退出钮**退出之后，
   * 文章页里的装饰性预览视频不该再抢走空格。
   *
   * ⚠️ 为什么这与症状 A 是同一个根因、却不是同一条用例：
   * 症状 A 走的是 `getCurrentVideo()`（显式操作），症状 B 走的是
   * `getWatchedTarget()` → `computeAmbientPreview(..., isTakenOverByUs)`。
   * 两者都读 `fullscreenVideo` 那一个字段，但**读的位置不同** ——
   * 修法只改一处时，很可能只修好其中一个。所以必须分别守住。
   *
   * ⚠️ 判据链：装饰性预览的证据 #7 是「不是我们接管着的」。
   * 退出全屏后若注册表仍以为「我们接管着它」，这条证据就失效 →
   * 它不再被判成装饰 → 快捷键路径接管它 → 空格被吃掉、页面翻不动。
   */
  it('从控制条的退出钮退出后，文章页的装饰性预览不再抢走空格', async () => {
    const restoreViewport = () => {
      delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
      delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    };

    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1280, configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 720, configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });

    try {
      document.body.innerHTML = '';

      // 站点用 JS 播起来的预览视频：900×506（视口 1280×720 的 49%），
      // 没有 autoplay 属性、没有原生 controls —— 正是「装饰性预览」的形状。
      // 它**不是**页面主角，所以正常状态下空格必须放行给页面。
      const preview = createVideo();
      preview.id = 'preview';
      preview.muted = true;
      // ⚠️ 「站点自己开的」这条证据用 **autoplay 属性**表达，不用派发 play 事件。
      // 这份测试文件把 `isTrustedEvent` 放宽成恒真（jsdom 造不出可信事件），
      // 于是这里派发的 play 会被当成「用户按了播放」→ 写进 userTouchedVideos
      // → 它不再被判成装饰物。属性证据不受那条测试缝影响。
      preview.setAttribute('autoplay', '');
      Object.defineProperty(preview, 'paused', { value: false, configurable: true });
      Object.defineProperty(preview, 'readyState', { value: 4, configurable: true });
      preview.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 900, bottom: 506, width: 900, height: 506,
        x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect);
      document.body.appendChild(preview);

      // 前置条件：正常情况下，空格不归我们（它是装饰性预览）。
      expect(
        (runtime as unknown as { registry: { getWatchedTarget: () => unknown } })
          .registry.getWatchedTarget(),
        '前置条件：装饰性预览不该成为快捷键目标',
      ).toBeNull();

      // 用户显式点了工具栏图标 —— 显式操作**可以**接管它（这是有意的契约）。
      lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(
        document.getElementById('vsc-page-fullscreen-stage')?.querySelector('video')?.id,
        '前置条件：显式点击把它拉进了全屏',
      ).toBe('preview');

      // 从**控制条的退出钮**退出。
      const exitButton = document
        .getElementById('vsc-controls')
        ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="exit"]');
      expect(exitButton, '控制条上必须有退出按钮').not.toBeNull();
      exitButton?.click();
      await vi.advanceTimersByTimeAsync(0);

      expect(
        document.getElementById('vsc-page-fullscreen-overlay'),
        '前置条件：已经退出全屏',
      ).toBeNull();

      // ⚠️ 关键断言：退出之后它必须**重新**被判成装饰性预览，
      // 否则快捷键路径会接管它，空格被吃掉、文章翻不了页。
      expect(
        (runtime as unknown as { registry: { getWatchedTarget: () => unknown } })
          .registry.getWatchedTarget(),
        '退出全屏后，这条预览必须重新算作「页面预览」—— 空格要还给页面',
      ).toBeNull();
    } finally {
      restoreViewport();
    }
  });

  it('ignores unrelated messages', () => {
    const listener = lastMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'something-else' }, {}, sendResponse);
    listener(null, {}, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('shows the speed toast both outside and inside fullscreen', async () => {
    // 键盘控制器挂在 window 捕获阶段（无桥接时的回落路径），所以派发在 window 上。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
    // 松开按键停掉长按连续定时器，否则 toast 会被持续刷新、一直可见。
    window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
    await vi.advanceTimersByTimeAsync(0);
    const toast = () => document.getElementById('vsc-speed-toast');
    expect(toast()?.classList.contains('vsc-visible')).toBe(true);

    // 进入全屏后仍然提示：控制条 3 秒无操作就隐藏，键盘调速时它不在屏幕上，
    // 不能指望它承担反馈。
    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});

    // 让上一个 toast 自然消失，再在全屏内调速，断言它重新可见。
    await vi.advanceTimersByTimeAsync(1000);
    expect(toast()?.classList.contains('vsc-visible')).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(toast()?.classList.contains('vsc-visible')).toBe(true);
    expect(document.getElementById('vsc-controls')).not.toBeNull();
  });

  it('档位菜单选中后给出提示，并把倍速告诉 background', async () => {
    // 控制条只有全屏时才挂上，所以先进全屏。
    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});

    const shadow = document.getElementById('vsc-controls')!.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>('[data-role="speed"]')!.click();
    shadow.querySelector<HTMLButtonElement>('[data-rate="1.5"]')!.click();

    await vi.advanceTimersByTimeAsync(0);

    // 胶囊提示：控制条 3 秒就隐藏，用户可能压根没看见自己选了什么。
    expect(document.getElementById('vsc-speed-toast')?.textContent).toBe('1.5x');
    // 工具栏标题要显示当前倍速。
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: SPEED_REPORT_MESSAGE,
      rate: 1.5,
    });
  });

  it('档位菜单开着时，Esc 关菜单而不是退出全屏', async () => {
    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});

    const shadow = document.getElementById('vsc-controls')!.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>('[data-role="speed"]')!.click();

    const menu = shadow.querySelector<HTMLElement>('[data-role="speed-menu"]')!;
    expect(menu.hidden).toBe(false);

    // composed: true —— 真实浏览器的 keydown 是 composed 的，会一路冒泡到 window，
    // 正好复现「键盘控制器在捕获阶段先看到 Esc」这个真实顺序。
    shadow.querySelector<HTMLButtonElement>('[data-rate="1.5"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(menu.hidden).toBe(true);
    // 全屏还在：Esc 被菜单吃掉了，而不是把整个全屏关掉。
    expect(document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active')).toBe(true);
  });

  it('点工具栏图标但页面上没有视频时，给出提示而不是静默', async () => {
    // 工具栏图标是扩展**唯一**看得见的入口。点了毫无反应，
    // 用户能得出的唯一结论就是「扩展坏了」。
    // 键盘路径有 notifyTakeoverUnavailable 兜底，图标路径原本什么都没有。
    video.remove();

    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});
    await vi.advanceTimersByTimeAsync(0);

    const notice = document.getElementById('vsc-takeover-notice');
    expect(notice?.textContent).toBe('这个页面里没有视频');
    // 提示是 position:fixed，必须有明确坐标，否则静态位置在文档流末尾（屏幕外）。
    expect(notice?.style.left).toBe('16px');
    expect(notice?.style.top).toBe('16px');
  });

  it('点工具栏图标但顶层没有视频时，回报失败而不是假装成功', async () => {
    // 6.1.0 起**每个 frame 只管自己 document 里的视频**：注册表不再下钻同源
    // iframe，顶层这一份运行时压根看不见 iframe 里的那个 <video>。
    //
    // 所以顶层点图标时既没有视频可接管，也没有「视频在但接管不了」的对象 ——
    // 旧契约那句「这个视频暂时接管不了」在这个场景下已经是**假话**
    // （那个视频住在 iframe 里，iframe 自己那份运行时接得上它）。
    // 唯一诚实的回答就是「这个页面里没有视频」。
    //
    // 回应必须是 { ok: false }：否则调用方（未来的 popup / 命令）会以为全屏已经进了。
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument!;
    frameDocument.body.innerHTML = '<video id="framed"></video>';
    // 顶层不能有别的视频，否则顶层确实有视频可接管（那是另一个用例）。
    video.remove();

    let response: unknown = null;
    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, (value: unknown) => {
      response = value;
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(response).toEqual({ ok: false, active: false });
    const notice = document.getElementById('vsc-takeover-notice');
    expect(notice?.textContent).toBe('这个页面里没有视频');
  });

  it('applies shortcut changes to the already-open page without a reload', async () => {
    // 设置页副标题承诺「保存后已打开的页面会立即生效」，这是唯一的
    // 「设置 -> 运行时」闭环。此前它没有任何测试：onChanged 的回调从未被派发，
    // 于是把 runtime.ts 里 `this.settings = settings` 断掉，185 单测 + 18 E2E
    // 依然全绿 —— 用户改键后必须刷新页面才生效，而 UI 显示的是「已保存」。
    //
    // 复用 beforeEach 建好的 runtime：另起实例会让桥接监听器互相干扰，
    // 断言就测不到真实的那条接线。
    const press = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'ctrlKey', { value: false });
      Object.defineProperty(event, 'altKey', { value: false });
      Object.defineProperty(event, 'shiftKey', { value: false });
      Object.defineProperty(event, 'metaKey', { value: false });
      window.dispatchEvent(event);
      return event;
    };

    // 改前：默认 f 是网页全屏，q 不属于任何动作。
    expect(press('q').defaultPrevented, '改键前 q 不该被扩展处理').toBe(false);
    expect(press('f').defaultPrevented, '改键前 f 才是网页全屏的绑定键').toBe(true);

    // 模拟设置页保存：写入新的绑定并派发 storage 变更。
    // 这一步以前从未在任何测试里发生过。
    store.set(STORAGE_KEY, {
      shortcuts: {
        increaseSpeed: '=',
        decreaseSpeed: '-',
        resetSpeed: '0',
        togglePlay: ' ',
        seekBack: 'ArrowLeft',
        seekForward: 'ArrowRight',
        fullscreen: 'q',
      },
    });
    storageChangeListeners().forEach((listener) => listener(
      { [STORAGE_KEY]: { newValue: store.get(STORAGE_KEY) } },
      'sync',
    ));
    await vi.advanceTimersByTimeAsync(0);

    expect(press('q').defaultPrevented, '改键后 q 必须立刻接管网页全屏').toBe(true);
    expect(press('f').defaultPrevented, '改键后 f 已解绑，不该再被扩展吞掉').toBe(false);
  });

  /**
   * 读屏播报通道。
   *
   * 这个扩展**全部**的用户可见反馈都是视觉元素（调速胶囊、控制条、首次引导），
   * 而非全屏状态下控制条根本不存在 —— 于是播放/暂停与快进快退对读屏用户
   * 是**完全静默**的。这不是体验差一点，是功能对这一类用户不可用。
   */
  describe('读屏播报', () => {
    const liveRegion = () => document.getElementById('vsc-live-region');

    const press = (key: string) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };

    it('启动时就建好一个空的 live region', () => {
      // aria-live 的通行要求是「区域先存在、内容后变」：
      // 把**带内容**的节点插进 DOM，部分读屏器不会播报首条内容。
      // 而首条恰恰是整个产品对读屏用户最重要的确认。
      const region = liveRegion();

      expect(region, 'live region 必须在内容脚本启动时就建好').not.toBeNull();
      expect(region?.textContent, '建好时必须是空的').toBe('');
      expect(region?.getAttribute('role')).toBe('status');
      expect(region?.getAttribute('aria-live')).toBe('polite');
      expect(region?.getAttribute('aria-atomic')).toBe('true');
    });

    it('空格切播放会播报当前状态', async () => {
      // 注册表只允许「站点主播放器 / 用户刚选过 / 有原生 controls / 正在播」
      // 的视频吃下空格 —— 其余情况空格必须放行给页面（用户是在翻页）。
      // 所以这里给视频加上原生 controls，它才是扩展可以接管的对象。
      video.setAttribute('controls', '');

      press(' ');
      await vi.advanceTimersByTimeAsync(0);

      // 视频一开始是暂停的，所以第一下空格是「开始播放」。
      expect(liveRegion()?.textContent).toBe('正在播放');
    });

    it('空格切回暂停会播报当前状态', async () => {
      video.setAttribute('controls', '');

      press(' ');
      await vi.advanceTimersByTimeAsync(0);
      // 上一条还在占位（500ms），先让它退场。
      await vi.advanceTimersByTimeAsync(500);

      press(' ');
      await vi.advanceTimersByTimeAsync(0);

      expect(liveRegion()?.textContent).toBe('已暂停');
    });

    it('快进会播报跳了多少秒、现在在第几秒', async () => {
      press('ArrowRight');
      await vi.advanceTimersByTimeAsync(0);

      // 视频从 0 秒开始 → 跳到 5 秒。
      expect(liveRegion()?.textContent).toBe('快进 5 秒，当前 5 秒');
    });

    it('快退会播报跳了多少秒、现在在第几秒', async () => {
      // 先快进一次，让位置离开 0 秒。
      press('ArrowRight');
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(500);

      press('ArrowLeft');
      await vi.advanceTimersByTimeAsync(0);

      expect(liveRegion()?.textContent).toBe('快退 5 秒，当前 0 秒');
    });

    it('进入与退出网页全屏都会播报', async () => {
      press('f');
      await vi.advanceTimersByTimeAsync(0);

      expect(liveRegion()?.textContent).toBe('已进入网页全屏');

      // 上一条还在占位（500ms），先让它退场。
      await vi.advanceTimersByTimeAsync(500);

      press('f');
      await vi.advanceTimersByTimeAsync(0);

      expect(liveRegion()?.textContent).toBe('已退出网页全屏');
    });

    it('点工具栏图标退出网页全屏也会播报', async () => {
      // 键盘 f 退出走的是 exitFullscreen 回调，工具栏图标退出走的是
      // toggleFullscreenFor —— 两条路径都必须播报，否则读屏用户在这条
      // 「唯一看得见的入口」上得不到任何确认。
      lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(liveRegion()?.textContent).toBe('已进入网页全屏');

      // 上一条还在占位（500ms），先让它退场。
      await vi.advanceTimersByTimeAsync(500);

      lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});
      await vi.advanceTimersByTimeAsync(0);

      expect(liveRegion()?.textContent).toBe('已退出网页全屏');
    });

    it('进不去全屏时不播报全屏状态（画面没变，播了就是撒谎）', async () => {
      // document.body 为 null 的文档（SVG + foreignObject）挂不上 overlay，
      // 于是 enter() 失败 —— 画面一点没变。
      // 这时播一句「已进入网页全屏」会让读屏用户以为全屏成功了。
      //
      // ⚠️ 断言必须看**播报调用**，不能只看 live region 的最终文本：
      // 别的提示（首次引导）也在写同一个区域，文本会被顶掉。
      const announceSpy = vi.spyOn(liveRegionModule, 'announce');
      const originalBody = Object.getOwnPropertyDescriptor(document, 'body');
      Object.defineProperty(document, 'body', { value: null, configurable: true });

      try {
        lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});
        await vi.advanceTimersByTimeAsync(0);

        const announced = announceSpy.mock.calls.map((call) => call[0]);
        expect(
          announced.filter((text) => String(text).includes('全屏')),
          '没进全屏就不该播报全屏状态',
        ).toEqual([]);
      } finally {
        announceSpy.mockRestore();
        if (originalBody) {
          Object.defineProperty(document, 'body', originalBody);
        } else {
          delete (document as unknown as { body?: unknown }).body;
        }
      }
    });

    it('调速有播报（连续调速只播最新的那条）', async () => {
      press('=');
      await vi.advanceTimersByTimeAsync(0);

      expect(liveRegion()?.textContent).toBe('播放速度 1.1x');
    });

    it('停止时把 live region 一并拆掉', () => {
      expect(liveRegion()).not.toBeNull();

      runtime.stop();

      expect(liveRegion(), '内容脚本停了却留下一个孤儿节点').toBeNull();
    });

    it('停止时把我们注入的 runtime 样式也摘掉', () => {
      // ⚠️ 为什么这条值得守：扩展上下文失效（扩展被更新/重载）时，
      // 运行时会 stop() 掉自己创建的**一切** —— 胶囊、角标、live region、提示。
      // 而这段注入的 `<style id="vsc-runtime-styles">` 原先不在那条清理路径上：
      // 它是模块级变量、没有卸载入口。
      //
      // 实测（扩展重载后，旧页面上的残留节点）：
      //   vsc-runtime-styles count=1，其余（胶囊/角标/live region/提示）全是 0
      //
      // 影响很小（那段 CSS 只样式化我们自己的 id），但「旧页面上的扩展
      // 已经彻底退场」这句话因此不成立 —— 用户 inspect 一下就能看到
      // 一个属于已经不在的扩展的节点。
      const styleId = 'vsc-runtime-styles';
      expect(
        document.getElementById(styleId),
        '前置条件：runtime 启动后应该装上了样式',
      ).not.toBeNull();

      runtime.stop();

      expect(
        document.getElementById(styleId),
        '内容脚本停了，却把注入的样式留在页面里',
      ).toBeNull();
    });
  });

  it('启动时把当前倍速上报给 background（background 不再猜）', async () => {
    // 倍速的**事实**只有内容脚本知道。background 曾经靠
    // chrome.tabs.onUpdated 的 status === 'loading' 去猜「换页了 = 倍速归 1」，
    // 而那个信号在同文档导航（history.pushState）时同样会触发 ——
    // 猜错的结果是用户刚调好的倍速读数凭空消失（视频其实还是 1.1 倍）。
    // 现在由内容脚本上报，background 只记「最后一次上报」。
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: SPEED_REPORT_MESSAGE,
      rate: 1,
    });
  });

  /**
   * 这一层**没有**受控视频时，启动上报**不带 rate**。
   *
   * ⚠️ 以前这里报的是 `rate: 1`（「没有视频就当 1 倍」）。那是**撒谎**：
   * 那个 1.2 倍可能在**别的** frame 里正在播，而这条谎报会让工具栏标题
   * 把别人的倍速抹成默认值（标题与画面自相矛盾）。
   *
   * 契约见 shared/types.ts 的 SPEED_REPORT_MESSAGE：
   * 「没有受控视频」一律不带 rate，background 收到后保持标题不变。
   */
  it('这一层没有受控视频时，启动上报不带 rate（不拿 1 冒充）', async () => {
    video.remove();
    await startFreshRuntime();

    const speedReports = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0] as { type?: string; rate?: number })
      .filter((message) => message?.type === SPEED_REPORT_MESSAGE);

    expect(speedReports).toEqual([{ type: SPEED_REPORT_MESSAGE }]);
  });

  /**
   * 探针：background 问「报出这个倍速的那个视频还在吗」。
   *
   * background 记着「这个标签页的倍速是哪个 frame 报的」，而那个 frame
   * 随时可能消失（SPA 把 iframe 换掉、页面整页跳转）—— 消失之后**没有人**
   * 会来说这件事，于是标题会一直挂着早已不存在的倍速。
   */
  describe('探针：background 问「那个视频还在吗」', () => {
    const askProbe = (): unknown => {
      let response: unknown = null;
      lastMessageListener()({ type: FRAME_PROBE_MESSAGE }, {}, (value: unknown) => {
        response = value;
      });
      return response;
    };

    /** 调一次速（走真实路径：胶囊把「读数变了」回调回来）。 */
    const changeSpeed = async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
      await vi.advanceTimersByTimeAsync(0);
    };

    it('那个视频还在 → 回答 alive + 此刻的倍速', async () => {
      await changeSpeed();

      expect(askProbe()).toEqual({ ok: true, video: 'alive', rate: 1.1 });
    });

    it('那个视频被页面换掉了 → 回答 gone', async () => {
      await changeSpeed();

      // SPA 把 <video> 从文档里摘掉（iframe 被换掉时的常见形态）。
      video.remove();

      expect(askProbe()).toEqual({ ok: true, video: 'gone' });
    });

    it('这一层从没报过倍速 → 回答 unknown（不据此清掉别人的读数）', async () => {
      // 没有报过倍速 = 这一层没有读数可保，也不能因为「没报过」就
      // 断言「视频没了」。
      video.remove();
      await startFreshRuntime();

      expect(askProbe()).toEqual({ ok: true, video: 'unknown' });
    });
  });

  /**
   * 「我这一层要走了」。
   *
   * frame 被销毁时（iframe 被换掉、整页跳转）**没有人**会来说这件事：
   * 内容脚本跟着文档一起没了，而 background 只能靠猜
   * （「URL 变了？换页了？倍速归 1？」—— 6.2.0 之前的老做法，
   * 同文档导航也会触发它，于是用户刚调好的读数凭空消失）。
   */
  describe('页面卸载时的告别', () => {
    it('这一层要走了 → 告诉 background', async () => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: FRAME_GONE_MESSAGE });
    });

    it('进后退缓存（persisted）→ 不说「我走了」', () => {
      // persisted = true：页面还可能原样回来，那个视频还在、还在按
      // 原来的倍速播 —— 那时清掉读数就是撒谎。
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: FRAME_GONE_MESSAGE });
    });

    it('这一层从没报过倍速 → 不必说（没有读数可作废）', async () => {
      video.remove();
      await startFreshRuntime();
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

      window.dispatchEvent(new PageTransitionEvent('pagehide'));

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: FRAME_GONE_MESSAGE });
    });
  });

  /**
   * 那个视频被站点从页面里拿走了 → 说一句「这一层没有受控视频」。
   *
   * ⚠️ 这条上报**不带 rate**，而它**不会自己触发**：
   * 视频被摘掉时既没有 `ratechange`（它只是被删了），
   * 页面也没有 focus 事件 —— 没有观察者，那句话永远发不出去，
   * background 收到的最后一个信号就永远是「1.2 倍」。
   */
  describe('报出去的那个视频被换掉了', () => {
    const speedReports = () =>
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0] as { type?: string; rate?: number })
        .filter((message) => message?.type === SPEED_REPORT_MESSAGE);

    /** 调一次速（走真实路径：胶囊把「读数变了」回调回来）。 */
    const changeSpeed = async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
      await vi.advanceTimersByTimeAsync(0);
    };

    it('视频被摘掉 → 上报「这一层没有受控视频」（不带 rate）', async () => {
      await changeSpeed();
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

      // 站点把那个 <video> 从页面里拿走了（SPA 换页、换清晰度）。
      video.remove();
      // MutationObserver 的回调是微任务。
      await vi.advanceTimersByTimeAsync(0);

      expect(speedReports()).toEqual([{ type: SPEED_REPORT_MESSAGE }]);
    });

    it('整个播放器容器被换掉（视频跟着祖先一起消失）→ 同样上报', async () => {
      // ⚠️ 视频自己的父节点根本没变 —— 只盯着父节点会漏掉这一档，
      // 而它恰恰是 SPA 换页时的常见形态。
      await changeSpeed();
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

      const wrapper = document.createElement('div');
      document.body.appendChild(wrapper);
      wrapper.appendChild(video);
      await vi.advanceTimersByTimeAsync(0);
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

      wrapper.remove();
      await vi.advanceTimersByTimeAsync(0);

      expect(speedReports()).toEqual([{ type: SPEED_REPORT_MESSAGE }]);
    });

    it('视频还在 → 不上报（别白唤醒 service worker）', async () => {
      await changeSpeed();
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

      // 页面里发生了点别的变化（与那个视频无关）。
      const other = document.createElement('div');
      document.body.appendChild(other);
      await vi.advanceTimersByTimeAsync(0);

      expect(speedReports()).toEqual([]);
    });
  });

  /**
   * 倍速上报的归属：**焦点在不在自己这儿**，而不是「我是不是顶层」。
   *
   * 6.1.0 之前判的是「只有顶层上报」，理由是「顶层才是真正能接管视频的地方」。
   * 内容脚本注入到所有 frame 之后这个前提没了 —— iframe 里的视频由 **iframe
   * 自己那份运行时**接管，而它才是有资格说话的那一份。
   * 判据换成焦点（frameScope.ts 的 ownsUserFocus）：焦点落进 iframe 时，
   * 顶层文档的 activeElement 是那个 <iframe> 元素（浏览器把焦点代理到它身上），
   * 于是顶层自动闭嘴 —— 否则工具栏标题会停在**别的 frame** 的倍速上（在说谎）。
   */
  describe('倍速上报：焦点在不在自己这儿', () => {
    const speedReports = () =>
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0] as { type?: string; rate?: number })
        .filter((message) => message?.type === SPEED_REPORT_MESSAGE);

    /** 调一次速（最真实的路径：用户按 =）。 */
    const changeSpeed = async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
      // 松开按键停掉长按连续定时器，否则 toast 会被持续刷新。
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
      await vi.advanceTimersByTimeAsync(0);
    };

    it('焦点在自己这儿时上报倍速', async () => {
      // 焦点在普通元素上（不是 iframe 元素）→ 这一份运行时就是
      // 「用户此刻正在看的那个 frame」，它才有资格报倍速。
      //
      // ⚠️ 不能用 <input>：输入框是「编辑态」，键盘控制器压根不抢它的键，
      // 按 = 什么都不会发生（那是另一条契约，见 keyboardController）。
      const target = document.createElement('div');
      target.tabIndex = 0;
      document.body.appendChild(target);
      target.focus();
      expect(document.activeElement, '前置条件：焦点在普通元素上').toBe(target);

      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
      await changeSpeed();

      expect(speedReports(), '焦点在我这儿，就该由我上报倍速').toEqual([
        { type: SPEED_REPORT_MESSAGE, rate: 1.1 },
      ]);
    });

    it('焦点在子 iframe 上时不报倍速（那个 iframe 才是主角）', async () => {
      // 浏览器在焦点进入 iframe 时会把顶层文档的 activeElement 换成 iframe 元素。
      const frame = document.createElement('iframe');
      document.body.appendChild(frame);
      frame.focus();
      expect(document.activeElement, '前置条件：焦点代理到 iframe 元素上').toBe(frame);

      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
      await changeSpeed();

      expect(speedReports(), '焦点不在我这儿，就该闭嘴').toEqual([]);
    });
  });

  /**
   * 焦点记录的**写入频率**。
   *
   * background 只需要知道「用户此刻在哪个 frame」，不需要知道每一次焦点移动。
   * 焦点事件与 pointerdown 很密（每点一下页面就来一次），而每一条焦点消息
   * 都会让 background 写一次 chrome.storage.session —— 那个写入**有配额上限**。
   *
   * 配额用满之后的失败是**静默**的（background 里是 `?.catch?.(() => {})`），
   * 于是焦点记录停在旧 frame 上，点工具栏图标就会打到一个用户根本没在看的
   * frame —— 表现就是「图标点了没反应」。
   *
   * 所以判据从「有没有超过限流窗口」换成了「**状态是不是真的变了**」：
   * 焦点归属没变、这一层的内容也没变 → 一个字都不写。
   */
  /**
   * 「视频在嵌入框里」这条提示的**节流**。
   *
   * 为什么需要节流：同一句话一分钟之内不重复说 ——
   * 答案在一分钟之内不会变，而重复的提示会盖住别的提示（胶囊、控制条）。
   *
   * ⚠️ 判据是「第二次按同一个键时，提示**没有**再冒出来」。
   * 这条只有把节流窗口**调到很短**才测得出来：
   * 窗口是 60 秒时，第二次按鍵在测试里必然落在窗口内 ——
   * 而把窗口改成 0（= 不节流）时，提示就会冒第二次。
   */
  it('「视频在嵌入框里」一分钟之内不重复说', async () => {
    // 这一层没有视频 → 快捷键会问一圈「别的 frame 有吗」。
    video.remove();
    await startFreshRuntime();

    // background 回答「frame 3 那边有视频」。
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (message: unknown) => {
        if ((message as { type?: string } | undefined)?.type === VIDEO_OWNER_QUERY_MESSAGE) {
          return Promise.resolve({ frameId: 3, playing: true });
        }
        return Promise.resolve({});
      },
    );

    const pressKey = async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'f' }));
      await vi.advanceTimersByTimeAsync(0);
    };

    await pressKey();
    const first = document.getElementById('vsc-takeover-notice');
    expect(first, '第一次按就该说出「视频在嵌入框里」').not.toBeNull();

    // 等提示自己消失（NOTICE_DURATION = 2600ms），再按一次。
    await vi.advanceTimersByTimeAsync(3000);
    document.getElementById('vsc-takeover-notice')?.remove();

    await pressKey();
    const second = document.getElementById('vsc-takeover-notice');
    expect(
      second,
      '一分钟之内不该重复说同一句话（重复的提示会盖住别的提示）',
    ).toBeNull();

    // 节流窗口本身被钉住 —— 60 秒。
    expect(NO_VIDEO_HINT_INTERVAL_MS, '「视频在别处」的节流窗口是 60 秒').toBe(60_000);
  });

  describe('焦点记录的降频', () => {
    const focusReports = () =>
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls
        .filter((call) => (call[0] as { type?: string } | undefined)?.type === FRAME_FOCUS_MESSAGE);

    const reportFocus = () => document.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    beforeEach(async () => {
      // 启动时已经报过一次（start() 里 document.hasFocus() 为真就报）。
      await vi.advanceTimersByTimeAsync(200);
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
    });

    it('状态没变就不写（连点十次也不该唤醒 service worker）', async () => {
      for (let i = 0; i < 10; i += 1) {
        reportFocus();
        await vi.advanceTimersByTimeAsync(0);
      }

      expect(focusReports().length, '焦点没变就不该再写').toBe(0);
    });

    it('焦点离开再回到这一层 → 重新写一次', async () => {
      // 焦点跑到浏览器界面上（用户点工具栏图标）→ 这一层的记录作废；
      // 焦点回来时必须重新报，否则 background 记的仍是上一个 frame。
      window.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(0);
      expect(focusReports().length, '焦点离开时不该写').toBe(0);

      reportFocus();
      await vi.advanceTimersByTimeAsync(0);

      expect(focusReports().length, '焦点回来必须重新写一次').toBe(1);
    });

    it('这一层的视频没了 → 写一次（background 靠它复位标题）', async () => {
      // 焦点 frame 没变，但消息的**内容**变了：从「有视频」变成「这一层没有视频」。
      // background 正是靠这条消息复位工具栏标题（见 background 的焦点消息分支），
      // 所以「内容没变就不写」不能连它一起省掉。
      video.remove();
      reportFocus();
      await vi.advanceTimersByTimeAsync(0);

      expect(focusReports().length, '内容变了就必须写').toBe(1);
    });

    it('上报失败不能是静默的，而且下一次机会要补报', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>)
          .mockImplementation(() => Promise.reject(new Error('send failed')));

        // 让状态先变一次（否则状态没变根本不会去发那条消息）。
        window.dispatchEvent(new Event('blur'));
        reportFocus();
        await vi.advanceTimersByTimeAsync(0);

        expect(warn, '失败不能是静默的').toHaveBeenCalled();

        // 失败了就当没报过：下一次机会必须补报，
        // 否则 background 那边的记录会一直停在旧 frame 上。
        (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
        reportFocus();
        await vi.advanceTimersByTimeAsync(0);

        expect(focusReports().length, '失败之后必须补报').toBe(1);
      } finally {
        warn.mockRestore();
      }
    });
  });

  /**
   * 失效提示的文案（locale 文件里的那一份）必须对**每一种**原因都成立。
   *
   * ⚠️ 为什么这条守卫盯的是 locale 文件而不是代码里的兜底串：
   * 真正上线的是 locale 里那一份 —— 兜底串只在开发环境出现。
   *
   * ⚠️ 判据是「不能出现只在一种原因下为真的话」：
   * 「已更新」在「被禁用」时是假的（实测：内容脚本里分不出这两种情况）。
   */
  it('locale 里的文案对「被更新/被重载/被禁用」都成立', () => {
    for (const locale of ['zh_CN', 'en']) {
      const file = join(repoRoot, '_locales', locale, 'messages.json');
      const messages = JSON.parse(readFileSync(file, 'utf8')) as Record<
        string,
        { message?: string; description?: string }
      >;

      const entry = messages.extensionInactive;
      expect(entry, `${locale} 必须有 extensionInactive 这条文案`).toBeTruthy();

      const text = entry!.message ?? '';
      expect(text, `${locale} 的文案不能说「已更新」—— 被禁用时那句话是假的`).not.toMatch(
        /已更新|updated/i,
      );
      expect(text, `${locale} 的文案必须提到刷新`).toMatch(/刷新|refresh/i);
      expect(text, `${locale} 的文案必须给出「被禁用」时该走的那条路`).toMatch(/禁用|disabled/i);
      expect(text, `${locale} 的文案必须说清楚去哪里重新启用`).toMatch(/扩展程序|extensions page/i);

      // 旧的那条（说「已更新」的那条）不许还留在文件里 ——
      // 留着它，下一个人很可能顺手把它接回去。
      expect(
        messages.extensionUpdated,
        `${locale} 里不该再有 extensionUpdated（它只对一种原因成立）`,
      ).toBeUndefined();
    }
  });

  /**
   * 扩展被更新/重载之后，已打开的标签页会变成**僵尸**。
   *
   * MV3 的扩展被重载时**不会**重新注入内容脚本：老的内容脚本还在跑
   * （DOM 节点、事件监听、按键拦截都还在），但 chrome.runtime 上下文已经死了。
   * 于是 background 往这个 frame 发消息无人应答，用户看到的是
   * 「点了图标毫无反应」—— 而扩展其实好好的，只是这一页没刷新。
   */
  /**
   * 让这一层的扩展上下文失效（扩展被更新/重载/被禁用）。
   *
   * ⚠️ 真实情况：扩展被重载之后，老内容脚本里的 chrome.runtime.id 变成 undefined，
   * 而所有 chrome.* 调用都会抛 "Extension context invalidated."。
   */
  const invalidateContext = () => {
    (chrome.runtime as unknown as { id?: string }).id = undefined;
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
  };

  /**
   * 巡检是「上下文已失效」这条检查**唯一**的周期性发现途径。
   *
   * 为什么需要它：那条检查挂在两处 —— 焦点事件（focusin / blur）
   * 与巡检定时器。焦点事件那条路**只在焦点移动时才走**：
   * 用户盯着一个页面不动（正在看网课）时，它一次都不会触发。
   * 于是「扩展被更新/重载了，但这一页还没被注意到」这个窗口，
   * 全靠巡检兜着。
   *
   * ⚠️ 巡检停摆（周期调大）或巡检压根不跑，
   * 那一页就会变成「界面还在动、但消息发不出去」的僵尸 ——
   * 用户按什么键都不会有反应，而他能得出的唯一结论是「扩展坏了」。
   *
   * ⚠️ 判据是「**没有任何焦点事件**的情况下，巡检也要发现」——
   * 这正是巡检与焦点事件那条路的分工。
   */
  it('用户不动焦点时，巡检也要发现「上下文已失效」', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 先让这一页显示出我们的界面（胶囊 + 读屏镜像 + live region）。
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
      await vi.advanceTimersByTimeAsync(0);
      expect(document.getElementById('vsc-speed-toast')).not.toBeNull();

      invalidateContext();

      // ⚠️ **不触发任何焦点事件** —— 用户只是盯着页面不动。
      //   焦点事件那条路此时不会跑，发现只能来自巡检。
      await vi.advanceTimersByTimeAsync(FOCUS_WATCH_INTERVAL_MS + 200);

      expect(
        document.getElementById('vsc-speed-toast'),
        '上下文失效后界面必须撤掉（僵尸 UI 比没有扩展更糟）',
      ).toBeNull();
      expect(
        document.getElementById('vsc-extension-stale-notice'),
        '必须告诉用户发生了什么',
      ).not.toBeNull();

      // 巡检周期本身被钉住 —— 它是这条链路唯一的周期性发现途径。
      expect(FOCUS_WATCH_INTERVAL_MS, '巡检周期是 1 秒').toBe(1000);
    } finally {
      warn.mockRestore();
    }
  });

  describe('扩展上下文失效（扩展被更新/重载）', () => {
    /**
     * 触发一次「这一层已经发不出消息了」的检测。
     *
     * 走的是最真实的路径：用户点了工具栏图标 → 焦点离开页面 → 焦点记录
     * 作废 → 焦点回到页面 → 重新上报 → 发不出去 → 发现上下文已失效。
     */
    const triggerDetection = async () => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
    };

    it('把注入页面的节点撤掉，并告诉用户「刷新本页」', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // 先让这一页显示出我们的界面（胶囊 + 读屏镜像 + live region）。
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
        await vi.advanceTimersByTimeAsync(0);
        expect(document.getElementById('vsc-speed-toast')).not.toBeNull();

        invalidateContext();
        await triggerDetection();

        // 我们注入的东西必须撤干净：它们已经不会再更新了（僵尸 UI）。
        expect(document.getElementById('vsc-speed-toast'), '胶囊必须撤掉').toBeNull();
        expect(document.getElementById('vsc-speed-state'), '读屏镜像必须撤掉').toBeNull();
        expect(document.getElementById('vsc-live-region'), 'live region 必须撤掉').toBeNull();

        // 而且必须给用户一句明确的话。
        const notice = document.getElementById('vsc-extension-stale-notice');
        expect(notice, '必须告诉用户发生了什么').not.toBeNull();
        expect(notice!.textContent).toContain('刷新');
      } finally {
        warn.mockRestore();
      }
    });

    /**
     * 这条提示必须**真的看得见**，而且说的那句话**对「被禁用」也成立**。
     *
     * ⚠️ 为什么要量 computed style 而不是只看「节点还在 DOM 里」：
     * 「节点还在」正是这个缺陷的假绿来源 —— 节点确实在，
     * 但它的话是错的（被禁用时却说「扩展已更新」），而且它可能压根没显示出来。
     *
     * ⚠️ 为什么要断言**文案**而不是「有文案」：
     * 一句错的话比没有话更糟 —— 它会让用户一直刷新、一直看到同一句假话。
     */
    it('提示看得见，而且那句话对「被禁用」也成立', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        invalidateContext();
        await triggerDetection();

        const notice = document.getElementById('vsc-extension-stale-notice');
        expect(notice, '必须告诉用户发生了什么').not.toBeNull();

        // 1) 用户真的看得见吗？
        //
        //    ⚠️ 这里断言的是**确切的期望值**，不是「不是 none 就好」：
        //    「不等于 none」在 jsdom 返回空串时也会通过 ——
        //    那是一条恒真的假守卫，正是这个仓库吃过亏的那种。
        const style = getComputedStyle(notice!);
        expect(style.display, '提示必须真的显示出来').toBe('block');
        expect(style.visibility, '提示必须真的看得见').toBe('visible');
        expect(style.opacity, '提示必须不透明').toBe('1');
        expect(style.position, '提示必须固定在视口上（不是跟着文档流跑）').toBe('fixed');

        // 2) 那句话对「被禁用」也成立吗？
        //
        //    判据：被更新/被重载/被禁用在内容脚本里**分不开**
        //    （实测：18 项 chrome.* 信号逐项相同）——
        //    所以文案不能说「已更新」这种只在一种原因下为真的话。
        const text = notice!.textContent ?? '';
        expect(text, '不能说「已更新」—— 被禁用时那句话是假的').not.toContain('已更新');
        expect(text, '必须说「刷新本页」').toContain('刷新');
        expect(text, '必须给出「被禁用」时该走的那条路').toContain('禁用');
        expect(text, '必须说清楚去哪里重新启用').toContain('扩展程序');
      } finally {
        warn.mockRestore();
      }
    });

    /**
     * 文案必须在**上下文还活着的时候**取好。
     *
     * ⚠️ 上下文失效之后 `chrome.i18n.getMessage` 会抛
     * "Extension context invalidated."，而 `t()` 会回退到**中文兜底** ——
     * 于是英文界面上的用户看到的是一句中文（实测：失效提示显示的正是中文兜底）。
     *
     * 这条守卫盯的是「取文案的时机」：把 `t()` 挪回显示那一刻，它就会红。
     */
    it('文案取自 locale（即使显示时上下文已经死了）', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // 装上一个会说英文的 i18n，然后**重新起**一份运行时 ——
        // 构造那一刻上下文还活着，它应该把英文那句取好。
        (chrome as unknown as { i18n: unknown }).i18n = {
          getMessage: (key: string) =>
            key === 'extensionInactive' ? 'EXTENSION-INACTIVE-IN-ENGLISH' : '',
        };
        // ⚠️ 上一个用例留下的失效提示挂在 <html> 上（不是 <body>），
        // 而 beforeEach 只清了 body —— 不先摘掉它，这条用例量到的
        // 会是**上一条**用例写下的文案（一条会红的假绿的反面：假红）。
        document.getElementById('vsc-extension-stale-notice')?.remove();

        await startFreshRuntime();

        // 上下文死了：此后任何 chrome.i18n 调用都会抛。
        invalidateContext();
        (chrome as unknown as { i18n: { getMessage: () => never } }).i18n = {
          getMessage: () => {
            throw new Error('Extension context invalidated.');
          },
        };
        await triggerDetection();

        const notice = document.getElementById('vsc-extension-stale-notice');
        expect(notice, '必须告诉用户发生了什么').not.toBeNull();
        expect(
          notice!.textContent,
          '文案必须在上下文还活着的时候取好 —— 否则英文用户看到的是中文兜底',
        ).toBe('EXTENSION-INACTIVE-IN-ENGLISH');
      } finally {
        warn.mockRestore();
      }
    });

    it('同一次失效只说一次', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        invalidateContext();
        await triggerDetection();

        expect(
          document.querySelectorAll('#vsc-extension-stale-notice').length,
          '同一次失效不该说两遍',
        ).toBe(1);
      } finally {
        warn.mockRestore();
      }
    });

    it('失效之后不再抢用户的按键', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        invalidateContext();
        await triggerDetection();

        // 一个发不出消息、却还在拦按键的扩展比没有扩展更糟。
        const event = new KeyboardEvent('keydown', { key: '=', cancelable: true });
        window.dispatchEvent(event);

        expect(event.defaultPrevented, '失效之后不该再抢按键').toBe(false);
      } finally {
        warn.mockRestore();
      }
    });
  });
});
