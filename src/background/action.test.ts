import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  FRAME_FOCUS_MESSAGE,
  OPEN_OPTIONS_COMMAND,
  TOGGLE_FULLSCREEN_MESSAGE,
  VIDEO_OWNER_ASK_MESSAGE,
  VIDEO_OWNER_QUERY_MESSAGE,
  VIDEO_OWNER_REPORT_MESSAGE,
} from '../shared/types';

type ClickListener = (tab: { id?: number }) => void;
type CommandListener = (command: string) => void;
type MessageListener = (
  message: unknown,
  sender: { tab?: { id?: number }; frameId?: number },
  sendResponse?: (response: unknown) => void,
) => void;

/**
 * ⚠️ 必须重置模块缓存，而且必须在**顶层**。
 *
 * background 的顶层代码（注册监听器）在模块**首次**导入时执行一次。
 * 不重置的话，第二个用例再 `import('./index')` 拿到的是**模块缓存**：
 * 顶层代码不重跑 → 监听器压根没注册 → 用例自己新建的 clickListeners
 * 永远是空数组 → `expect(sendMessage).not.toHaveBeenCalled()` **恒真**。
 *
 * 那是一道假守卫：把生产代码里 `if (tab.id == null) { return; }` 整段删掉，
 * 它照样绿。
 *
 * 放在某一个 describe 的 beforeEach 里是不够的 —— 另一个 describe 依然会
 * 拿到模块缓存。所以这个 beforeEach 必须是顶层的、两个 describe 共用。
 */
beforeEach(() => {
  vi.resetModules();
});

/** session 存储的最小替身：真的存进去、真的读得回来。 */
const createStorageStub = () => {
  const store: Record<string, unknown> = {};
  return {
    store,
    session: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete store[key];
      }),
    },
  };
};

/**
 * 一个 frame 的「我这边有没有视频」的回答。
 */
interface OwnerAnswer {
  explicit: boolean;
  watched: boolean;
  playing: boolean;
  /**
   * 这个 frame 从**第一次被问**算起，过多久才答得上来（毫秒，默认 0）。
   *
   * ⚠️ 必须是「从第一次被问到能回答」的**绝对**时刻，不能写成
   * 「每次问都延迟 delayMs」。真实世界里主线程被占住时，**所有**排队的
   * 消息会在它空出来的那一刻一起被处理 —— 不是每条消息各自再等一遍。
   * 写成 per-ask 延迟会模拟出一个「越问越晚」的世界，retry 永远不会赢。
   */
  delayMs?: number;
}

/**
 * 各个 frame 对「谁有视频」的报告（frameId -> 回答）。
 */
type OwnerAnswers = Record<number, OwnerAnswer>;

/**
 * chrome.tabs.sendMessage 的替身。
 *
 * 它要同时吃两种调用形态（真实 API 也是两种）：
 * - `(tabId, message, callback)`            —— 广播给所有 frame；
 * - `(tabId, message, options, callback)`   —— 只发给某个 frame。
 *
 * 广播的那一次（VIDEO_OWNER_ASK_MESSAGE）会**触发各 frame 的回答** ——
 * 这是这套协议的关键环节：不模拟它，就测不到「图标点到了视频所在的 frame」。
 */
const createSendMessageStub = (
  messageListeners: MessageListener[],
  owners: OwnerAnswers = {},
  onMissingFrame?: (frameId: number) => void,
): Mock<any[]> => {
  /** 第一次广播的时刻 —— 各 frame 的「能回答的时刻」以它为原点。 */
  let firstAskAt = 0;

  return vi.fn((tabId: number, message: unknown, options?: unknown, callback?: unknown) => {
    const frameOptions = (typeof options === 'object' && options !== null)
      ? options as { frameId: number }
      : undefined;
    const done = (typeof options === 'function' ? options : callback) as (() => void) | undefined;

    const type = (typeof message === 'object' && message !== null)
      ? (message as { type?: unknown }).type
      : undefined;

    if (type === VIDEO_OWNER_ASK_MESSAGE) {
      if (firstAskAt === 0) {
        firstAskAt = Date.now();
      }

      // 各 frame 异步回答（真实的跨进程往返不是同步的）。
      //
      // 每个 frame 的「能回答的时刻」是**绝对**的（第一次广播 + delayMs）：
      // 主线程被占住的 frame 只会晚答，不会因为被多问几次就更晚。
      for (const [frameId, answer] of Object.entries(owners)) {
        const { delayMs = 0, ...report } = answer;
        setTimeout(() => {
          for (const listener of messageListeners) {
            listener(
              { type: VIDEO_OWNER_REPORT_MESSAGE, ...report },
              { tab: { id: tabId }, frameId: Number(frameId) },
            );
          }
        }, Math.max(0, firstAskAt + delayMs - Date.now()));
      }
      done?.();
      return;
    }

    if (frameOptions && onMissingFrame) {
      onMissingFrame(frameOptions.frameId);
    }
    done?.();
  }) as unknown as Mock<any[]>;
};

/**
 * 把微任务队列排空。
 *
 * 点击图标时要先读一次 storage.session（异步 IO），之后才轮到广播与转发。
 * 断言必须等它落地，否则测的是「还没发出去」。
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('background action click', () => {
  const stubChrome = (
    clickListeners: ClickListener[],
    sendMessage: Mock<any[]>,
    messageListeners: MessageListener[] = [],
    storage = createStorageStub(),
  ) => {
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: (fn: ClickListener) => clickListeners.push(fn) } },
      tabs: { sendMessage },
      storage,
      runtime: {
        lastError: null,
        onMessage: {
          addListener: (fn: MessageListener) => messageListeners.push(fn),
          removeListener: (fn: MessageListener) => {
            const index = messageListeners.indexOf(fn);
            if (index >= 0) {
              messageListeners.splice(index, 1);
            }
          },
        },
      },
    });
    return storage;
  };

  it('sends a fullscreen toggle to the clicked tab', async () => {
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    stubChrome(clickListeners, sendMessage, messageListeners);

    await import('./index');

    // 前置断言：监听器必须真的注册上了。
    // 少了这条，下面的断言可能在「监听器压根没注册」的情况下恒真 ——
    // 那就是一道假守卫（变异验证：删掉 tab.id 判空，这条会红）。
    expect(clickListeners.length, 'action.onClicked 的监听器必须注册上').toBeGreaterThan(0);

    clickListeners[0]?.({ id: 7 });

    // 没人报告有视频 → 等广播超时后仍然发给顶层 frame（frameId 0）。
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        7,
        { type: TOGGLE_FULLSCREEN_MESSAGE },
        { frameId: 0 },
        expect.any(Function),
      );
    });
  });

  it('ignores tabs without an id', async () => {
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    stubChrome(clickListeners, sendMessage, messageListeners);

    await import('./index');

    // 没有这条，下面的 not.toHaveBeenCalled() 可能在监听器压根没注册时恒真。
    expect(clickListeners.length, 'action.onClicked 的监听器必须注册上').toBeGreaterThan(0);

    clickListeners[0]?.({});
    await flush();

    // 连广播都不能发：没有 tabId 就无从知道该问哪个标签页。
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('带焦点上报时只把点击发给那个 frame', async () => {
    // 内容脚本注入到所有 frame 之后，点击意图会同时送到每一个 frame。
    // 全执行 = 进好几次全屏 + 弹好几个「接管不了」的提示。
    // background 靠 sender.frameId 记住「用户正在看的 frame」，只发给它。
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    stubChrome(clickListeners, sendMessage, messageListeners);

    await import('./index');
    expect(messageListeners.length, 'runtime.onMessage 的监听器必须注册上').toBeGreaterThan(0);

    messageListeners[0]?.({ type: FRAME_FOCUS_MESSAGE }, { tab: { id: 7 }, frameId: 5 });
    clickListeners[0]?.({ id: 7 });

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        7,
        { type: TOGGLE_FULLSCREEN_MESSAGE },
        { frameId: 5 },
        expect.any(Function),
      );
    });
  });

  it('视频在别的 frame 里 → 点图标发给那个 frame', async () => {
    // 实测（真实 Chromium）：页面上唯一的视频在嵌入框里、焦点在顶层时，
    // 点图标得到的是「这个页面里没有视频」—— 屏幕中央明明就是视频。
    // 6.1.0 之后每个 frame 只管自己文档里的视频，于是 background 必须
    // 先问一圈「谁有视频」，才能把点击送到对的地方。
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners, {
      3: { explicit: true, watched: true, playing: true },
    });
    stubChrome(clickListeners, sendMessage, messageListeners);

    await import('./index');

    // 焦点在顶层 frame（0），而视频在 frame 3。
    messageListeners[0]?.({ type: FRAME_FOCUS_MESSAGE }, { tab: { id: 7 }, frameId: 0 });
    clickListeners[0]?.({ id: 7 });

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        7,
        { type: TOGGLE_FULLSCREEN_MESSAGE },
        { frameId: 3 },
        expect.any(Function),
      );
    });
  });

  it('焦点所在 frame 自己有视频 → 焦点优先，不发给别的 frame', async () => {
    // 「焦点决定作用对象」是产品的核心规则：页面上下都有视频时，
    // 用户在哪儿操作就动哪儿的视频，哪怕另一个正在播。
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners, {
      0: { explicit: true, watched: true, playing: false },
      3: { explicit: true, watched: true, playing: true },
    });
    stubChrome(clickListeners, sendMessage, messageListeners);

    await import('./index');

    messageListeners[0]?.({ type: FRAME_FOCUS_MESSAGE }, { tab: { id: 7 }, frameId: 0 });
    clickListeners[0]?.({ id: 7 });

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        7,
        { type: TOGGLE_FULLSCREEN_MESSAGE },
        { frameId: 0 },
        expect.any(Function),
      );
    });

    const toggleFrames = sendMessage.mock.calls
      .filter((call) => (call[1] as { type?: unknown })?.type === TOGGLE_FULLSCREEN_MESSAGE)
      .map((call) => (call[2] as { frameId: number }).frameId);
    expect(toggleFrames, '只该发一次，且必须是焦点所在的 frame').toEqual([0]);
  });

  it('另一个标签页的焦点不上报，不会串台', async () => {
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    stubChrome(clickListeners, sendMessage, messageListeners);

    await import('./index');

    // 标签页 8 的 frame 5 拿到了焦点。
    messageListeners[0]?.({ type: FRAME_FOCUS_MESSAGE }, { tab: { id: 8 }, frameId: 5 });
    // 用户点的却是标签页 7。
    clickListeners[0]?.({ id: 7 });

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        7,
        { type: TOGGLE_FULLSCREEN_MESSAGE },
        { frameId: 0 },
        expect.any(Function),
      );
    });
  });

  it('记下的 frame 已经没了 → 退回顶层 frame 再试一次', async () => {
    // 页面重载、SPA 把 iframe 换掉：那个 frameId 已经不存在，
    // sendMessage 回调里报 "The frame was removed."。
    // 图标点了却毫无反应是最糟的体验，所以必须回退。
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const chromeStub: Record<string, unknown> = {};
    const sendMessage = createSendMessageStub(messageListeners, {}, (frameId) => {
      if (frameId !== 5) {
        return;
      }
      // Chrome 的真实错误文案因版本而异，这里故意用一句**没人承诺过**的措辞：
      // 实现不许按文案分流（拿一次失败回调换一个确定的回退）。
      chromeStub.runtime = { ...(chromeStub.runtime as object), lastError: { message: 'The frame was removed.' } };
    });

    chromeStub.action = { onClicked: { addListener: (fn: ClickListener) => clickListeners.push(fn) } };
    chromeStub.tabs = { sendMessage };
    chromeStub.storage = createStorageStub();
    chromeStub.runtime = {
      lastError: null,
      onMessage: {
        addListener: (fn: MessageListener) => messageListeners.push(fn),
        removeListener: (fn: MessageListener) => {
          const index = messageListeners.indexOf(fn);
          if (index >= 0) {
            messageListeners.splice(index, 1);
          }
        },
      },
    };
    vi.stubGlobal('chrome', chromeStub);

    await import('./index');
    messageListeners[0]?.({ type: FRAME_FOCUS_MESSAGE }, { tab: { id: 7 }, frameId: 5 });
    clickListeners[0]?.({ id: 7 });

    await vi.waitFor(() => {
      const toggleFrames = sendMessage.mock.calls
        .filter((call) => (call[1] as { type?: unknown })?.type === TOGGLE_FULLSCREEN_MESSAGE)
        .map((call) => (call[2] as { frameId: number }).frameId);
      expect(toggleFrames).toEqual([5, 0]);
    });
  });

  it('焦点上报会写进 session 存储', async () => {
    // service worker 空闲约 30 秒就会被浏览器回收，内存 Map 会跟着一起没。
    // 不落盘的话，「看了一会儿才去点图标」就会退回顶层 frame。
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    const storage = stubChrome(clickListeners, sendMessage, messageListeners);

    await import('./index');
    messageListeners[0]?.({ type: FRAME_FOCUS_MESSAGE }, { tab: { id: 7 }, frameId: 5 });
    await flush();

    expect(storage.store['vsc-tab-focus-frame:7']).toBe(5);
  });

  it('service worker 被回收重启后，从 session 存储里找回那个 frame', async () => {
    // 这一条是「用户看了一会儿才点图标」的真实路径：
    // 内存里空，session 存储里有 —— 必须还能发给同一个 frame。
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    const storage = stubChrome(clickListeners, sendMessage, messageListeners);
    storage.store['vsc-tab-focus-frame:7'] = 5;

    await import('./index');
    clickListeners[0]?.({ id: 7 });

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        7,
        { type: TOGGLE_FULLSCREEN_MESSAGE },
        { frameId: 5 },
        expect.any(Function),
      );
    });
  });

  it('标签页关掉后不留孤儿键', async () => {
    const removedListeners: ((tabId: number) => void)[] = [];
    const clickListeners: ClickListener[] = [];
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    const storage = stubChrome(clickListeners, sendMessage, messageListeners);
    (chrome.tabs as unknown as { onRemoved: { addListener: (fn: (tabId: number) => void) => void } }).onRemoved = {
      addListener: (fn: (tabId: number) => void) => removedListeners.push(fn),
    };

    await import('./index');
    messageListeners[0]?.({ type: FRAME_FOCUS_MESSAGE }, { tab: { id: 7 }, frameId: 5 });
    await flush();
    expect(storage.store['vsc-tab-focus-frame:7']).toBe(5);

    removedListeners[0]?.(7);
    await flush();

    expect(storage.store['vsc-tab-focus-frame:7']).toBeUndefined();
  });
});

describe('background 回答「别的 frame 有没有视频」', () => {
  const stubChrome = (messageListeners: MessageListener[], sendMessage: ReturnType<typeof vi.fn>) => {
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: () => undefined } },
      tabs: { sendMessage },
      storage: createStorageStub(),
      runtime: {
        lastError: null,
        onMessage: {
          addListener: (fn: MessageListener) => messageListeners.push(fn),
          removeListener: (fn: MessageListener) => {
            const index = messageListeners.indexOf(fn);
            if (index >= 0) {
              messageListeners.splice(index, 1);
            }
          },
        },
      },
    });
  };

  it('别的 frame 有视频 → 回答那个 frame 的编号', async () => {
    // 快捷键路径在没有目标时必须放行给页面，但「按了没反应」是更糟的体验。
    // 这个查询就是那半句反馈的数据来源。
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners, {
      3: { explicit: true, watched: true, playing: true },
    });
    stubChrome(messageListeners, sendMessage);

    await import('./index');

    const responses: unknown[] = [];
    messageListeners[0]?.(
      { type: VIDEO_OWNER_QUERY_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
      (response: unknown) => responses.push(response),
    );

    await vi.waitFor(() => {
      expect(responses).toEqual([{ frameId: 3, playing: true }]);
    });
  });

  it('别的 frame 都没有视频 → 回答 null', async () => {
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners);
    stubChrome(messageListeners, sendMessage);

    await import('./index');

    const responses: unknown[] = [];
    messageListeners[0]?.(
      { type: VIDEO_OWNER_QUERY_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
      (response: unknown) => responses.push(response),
    );

    // ⚠️ 这个答案要等到**总预算用完**才给得出来（1.8 秒）：零份可用回答
    // 也可能只是「真正有视频的那个 frame 还没答」。用户这一侧看不到区别
    // ——两种结论都是「不弹提示」——所以宁可晚一秒下结论。
    await vi.waitFor(() => {
      expect(responses).toEqual([{ frameId: null, playing: false }]);
    }, { timeout: 3_000 });
  });

  it('问的人自己不参与回答', async () => {
    // 提问的是「我这个 frame 没有视频」的那一层 —— 它自己有视频的话
    // 根本不会问。但即便如此，也不能把自己当成答案。
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners, {
      0: { explicit: true, watched: true, playing: true },
      3: { explicit: true, watched: true, playing: false },
    });
    stubChrome(messageListeners, sendMessage);

    await import('./index');

    const responses: unknown[] = [];
    messageListeners[0]?.(
      { type: VIDEO_OWNER_QUERY_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
      (response: unknown) => responses.push(response),
    );

    await vi.waitFor(() => {
      expect(responses).toEqual([{ frameId: 3, playing: false }]);
    });
  });

  /**
   * 慢 frame 不是边角情况，是**常态**：嵌入框里在解码视频、跑广告脚本时，
   * 它的主线程会被占住几百毫秒。而回答只能由那个主线程发出来。
   *
   * 实测（真实 Chromium，宿主负载 65/12 核）：同一个 frame 的回答延迟在
   * **2ms ~ 870ms** 之间跳。旧实现的总预算 320ms 之外的回答会被直接丢掉，
   * 于是用户按下 `f` 之后什么都没有 —— 而「按键不能毫无反应」正是这条
   * 提示存在的理由。
   */
  it('回答慢到超过一次广播的预算 → 仍然等到它，不能静默', async () => {
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners, {
      3: { explicit: true, watched: true, playing: true, delayMs: 500 },
    });
    stubChrome(messageListeners, sendMessage);

    await import('./index');

    const responses: unknown[] = [];
    messageListeners[0]?.(
      { type: VIDEO_OWNER_QUERY_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
      (response: unknown) => responses.push(response),
    );

    await vi.waitFor(() => {
      expect(responses).toEqual([{ frameId: 3, playing: true }]);
    }, { timeout: 3_000 });
  });

  it('有人回「我没视频」不算答完 —— 真正有视频的 frame 慢一点也要等', async () => {
    // ⚠️ 旧实现用 `reports.length > 0` 当「有人答了」，于是
    // 「旁观 frame 秒回、真正有视频的 frame 慢」时，第二个 frame 的回答
    // 还没到就已经收工了 —— 结果和「全都没有视频」一模一样。
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners, {
      2: { explicit: false, watched: false, playing: false },
      3: { explicit: true, watched: true, playing: true, delayMs: 400 },
    });
    stubChrome(messageListeners, sendMessage);

    await import('./index');

    const responses: unknown[] = [];
    messageListeners[0]?.(
      { type: VIDEO_OWNER_QUERY_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
      (response: unknown) => responses.push(response),
    );

    await vi.waitFor(() => {
      expect(responses).toEqual([{ frameId: 3, playing: true }]);
    }, { timeout: 3_000 });
  });

  it('有 frame 说「我有视频」→ 立刻收工，不等满单次预算', async () => {
    // 单次预算给到了 250ms。若仍要等满预算，那么**每一次成功**的问询
    // 都会白白慢 250ms（提示本来就只要一声「视频在别处」）。
    const messageListeners: MessageListener[] = [];
    const sendMessage = createSendMessageStub(messageListeners, {
      3: { explicit: true, watched: true, playing: true, delayMs: 10 },
    });
    stubChrome(messageListeners, sendMessage);

    await import('./index');
    vi.useFakeTimers();

    try {
      const responses: unknown[] = [];
      messageListeners[0]?.(
        { type: VIDEO_OWNER_QUERY_MESSAGE },
        { tab: { id: 7 }, frameId: 0 },
        (response: unknown) => responses.push(response),
      );

      // 50ms 远小于单次预算（250ms）：答案已经到了就必须已经回答。
      await vi.advanceTimersByTimeAsync(50);
      expect(responses).toEqual([{ frameId: 3, playing: true }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('background 原生命令：打开设置页', () => {
  const stubChrome = (commandListeners: CommandListener[]) => {
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: () => undefined } },
      tabs: { sendMessage: vi.fn() },
      storage: createStorageStub(),
      runtime: { lastError: null, openOptionsPage: vi.fn() },
      commands: { onCommand: { addListener: (fn: CommandListener) => commandListeners.push(fn) } },
    });
  };

  it('命令触发时打开设置页', async () => {
    const commandListeners: CommandListener[] = [];
    stubChrome(commandListeners);

    await import('./index');
    expect(commandListeners.length).toBeGreaterThan(0);

    commandListeners[0]?.(OPEN_OPTIONS_COMMAND);

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('别的命令不打开设置页', async () => {
    const commandListeners: CommandListener[] = [];
    stubChrome(commandListeners);

    await import('./index');
    expect(commandListeners.length).toBeGreaterThan(0);

    commandListeners[0]?.('some-other-command');

    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});
