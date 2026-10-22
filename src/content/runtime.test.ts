import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as liveRegionModule from './liveRegion';
import { ContentRuntime } from './runtime';
import {
  FRAME_FOCUS_MESSAGE,
  SPEED_REPORT_MESSAGE,
  STORAGE_KEY,
  TOGGLE_FULLSCREEN_MESSAGE,
} from '../shared/types';

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
   * 扩展被更新/重载之后，已打开的标签页会变成**僵尸**。
   *
   * MV3 的扩展被重载时**不会**重新注入内容脚本：老的内容脚本还在跑
   * （DOM 节点、事件监听、按键拦截都还在），但 chrome.runtime 上下文已经死了。
   * 于是 background 往这个 frame 发消息无人应答，用户看到的是
   * 「点了图标毫无反应」—— 而扩展其实好好的，只是这一页没刷新。
   */
  describe('扩展上下文失效（扩展被更新/重载）', () => {
    const invalidateContext = () => {
      // 扩展被重载之后，老内容脚本里的 chrome.runtime.id 变成 undefined，
      // 而所有 chrome.* 调用都会抛 "Extension context invalidated."。
      (chrome.runtime as unknown as { id?: string }).id = undefined;
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>)
        .mockImplementation(() => {
          throw new Error('Extension context invalidated.');
        });
    };

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
        expect(notice!.textContent).toContain('扩展已更新');
        expect(notice!.textContent).toContain('刷新');
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
