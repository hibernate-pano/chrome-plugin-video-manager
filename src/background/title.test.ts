import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SPEED_REPORT_MESSAGE } from '../shared/types';

/**
 * 工具栏图标标题 = 当前标签页的倍速。
 *
 * 非全屏状态下倍速在界面上没有任何出口：控制条只有全屏才有、3 秒就隐藏，
 * 调速胶囊 1 秒就淡出。工具栏图标是唯一「一直看得见、每个标签页各自一份」
 * 的地方 —— 这份测试锁住的就是这条链路。
 */

const MANIFEST_NAME = 'Video Speed Controller — Fullscreen & Keys';

type MessageListener = (message: unknown, sender: { tab?: { id?: number } }) => void;
type RemovedListener = (tabId: number) => void;
type UpdatedListener = (tabId: number, changeInfo: { status?: string }) => void;

interface Harness {
  messages: MessageListener[];
  removed: RemovedListener[];
  updated: UpdatedListener[];
  setTitle: Mock;
  storageSet: Mock;
  storageRemove: Mock;
  storageGet: Mock;
}

const stubChrome = (): Harness => {
  const harness: Harness = {
    messages: [],
    removed: [],
    updated: [],
    setTitle: vi.fn(),
    storageSet: vi.fn(async () => undefined),
    storageRemove: vi.fn(async () => undefined),
    storageGet: vi.fn(async () => ({})),
  };

  vi.stubGlobal('chrome', {
    action: {
      onClicked: { addListener: () => undefined },
      setTitle: harness.setTitle,
    },
    commands: { onCommand: { addListener: () => undefined } },
    tabs: {
      sendMessage: vi.fn(),
      onRemoved: { addListener: (fn: RemovedListener) => harness.removed.push(fn) },
      onUpdated: { addListener: (fn: UpdatedListener) => harness.updated.push(fn) },
    },
    runtime: {
      lastError: null,
      getManifest: () => ({ name: MANIFEST_NAME }),
      onMessage: { addListener: (fn: MessageListener) => harness.messages.push(fn) },
      openOptionsPage: vi.fn(),
    },
    storage: {
      session: {
        set: harness.storageSet,
        remove: harness.storageRemove,
        get: harness.storageGet,
      },
    },
  });

  return harness;
};

/** 等一轮宏任务，让 onUpdated 里那条 async 链跑完。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('background 工具栏标题', () => {
  let harness: Harness;

  // background 的顶层代码（注册监听器）只在模块首次导入时执行一次，
  // 所以每个用例都要重置模块缓存，否则拿到的是缓存、监听器不再注册。
  beforeEach(async () => {
    vi.resetModules();
    harness = stubChrome();
    await import('./index');
  });

  const report = (tabId: number | undefined, rate: number) => {
    harness.messages[0]?.({ type: SPEED_REPORT_MESSAGE, rate }, { tab: { id: tabId } });
  };

  it('把当前倍速写进标题', () => {
    report(7, 1.5);

    expect(harness.setTitle).toHaveBeenCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
  });

  it('1.0x 时恢复成默认标题，而不是显示「1x」', () => {
    report(7, 1.5);
    report(7, 1);

    // 默认倍速不是「状态」，标题上多挂一截「1x」只是噪音。
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: MANIFEST_NAME },
      expect.any(Function),
    );
  });

  it('同一个倍速重复上报不会重复写标题', () => {
    report(7, 1.5);
    report(7, 1.5);

    expect(harness.setTitle).toHaveBeenCalledTimes(1);
  });

  it('没有 tabId 的上报直接忽略', () => {
    // 设置页等扩展页面也会跑内容脚本，它们没有 tab。
    report(undefined, 1.5);

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('只认倍速上报，别的消息一概不碰', () => {
    harness.messages[0]?.({ type: 'vsc-toggle-fullscreen' }, { tab: { id: 7 } });
    harness.messages[0]?.({ type: SPEED_REPORT_MESSAGE, rate: '1.5' }, { tab: { id: 7 } });

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('标签页导航后标题复位', async () => {
    report(7, 1.5);
    harness.updated[0]?.(7, { status: 'loading' });
    await flush();

    // 换了页面就是新视频，倍速回到 1.0 —— 内容脚本不会主动上报这件事。
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: MANIFEST_NAME },
      expect.any(Function),
    );
  });

  it('没改过速的标签页导航时不写标题', async () => {
    harness.updated[0]?.(9, { status: 'loading' });
    await flush();

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('导航中间态（status 不是 loading）不触发复位', async () => {
    report(7, 1.5);
    harness.updated[0]?.(7, { status: 'complete' });
    await flush();

    expect(harness.setTitle).toHaveBeenCalledTimes(1);
  });

  it('标签页关闭时清掉记录', () => {
    report(7, 1.5);
    harness.removed[0]?.(7);

    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

  it('关掉的标签页不会再被导航复位', async () => {
    report(7, 1.5);
    harness.removed[0]?.(7);
    harness.setTitle.mockClear();

    harness.updated[0]?.(7, { status: 'loading' });
    await flush();

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('内存丢了还能靠 storage.session 认出这个标签页改过速', async () => {
    // 模拟 service worker 被回收后重启：内存 Map 空了，但 session 存储还在。
    harness.storageGet.mockResolvedValue({ 'vsc-tab-rate:7': 1.5 });

    harness.updated[0]?.(7, { status: 'loading' });
    await flush();

    expect(harness.setTitle).toHaveBeenCalledWith(
      { tabId: 7, title: MANIFEST_NAME },
      expect.any(Function),
    );
  });
});
