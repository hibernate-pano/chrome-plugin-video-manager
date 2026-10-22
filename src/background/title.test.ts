import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { FRAME_FOCUS_MESSAGE, SPEED_REPORT_MESSAGE } from '../shared/types';

/**
 * 工具栏图标标题 = 当前标签页的倍速。
 *
 * 非全屏状态下倍速在界面上没有任何出口：控制条只有全屏才有、3 秒就隐藏，
 * 调速胶囊 1 秒就淡出。工具栏图标是唯一「一直看得见、每个标签页各自一份」
 * 的地方 —— 这份测试锁住的就是这条链路。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJson = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;

const manifest = readJson('manifest.json') as {
  name: string;
  action: { default_title: string };
};

const enMessages = readJson('_locales/en/messages.json') as Record<string, { message?: string }>;

/**
 * manifest 里的扩展名与默认标题**直接读文件**。
 *
 * ⚠️ 以前这里是两个手抄的字符串常量（「与 manifest.json 一致」）。
 * 手抄的那份迟早会漂 —— 而且漂了没人知道：manifest 改了，测试照绿。
 * 现在改成读真文件：漂移在**读的那一刻**就不可能了。
 */
const MANIFEST_NAME = manifest.name;
const MANIFEST_ACTION_TITLE = manifest.action.default_title;
/** chrome.i18n 查到的 actionTitle（真实环境里跟着 UI 语言走）。 */
const LOCALIZED_ACTION_TITLE = enMessages.actionTitle?.message ?? 'Video Speed Controller';

type MessageListener = (
  message: unknown,
  sender: { tab?: { id?: number }; frameId?: number },
) => void;
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
  /** i18n 查到的文案；改它就能模拟「UI 语言变了」。 */
  actionTitle: string;
}

/**
 * storage.session 的内容。
 *
 * ⚠️ 必须**真的存进去、真的读得回来**：service worker 被回收之后，
 * 内存里的东西全没，storage.session 是唯一活下来的那份 ——
 * 桩要是每次都返回空对象，就等于把要修的故障复现不出来。
 */
type SessionStore = Map<string, unknown>;

const stubChrome = (session: SessionStore = new Map()): Harness => {
  const harness: Harness = {
    messages: [],
    removed: [],
    updated: [],
    setTitle: vi.fn(),
    storageSet: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        session.set(key, value);
      }
    }),
    storageRemove: vi.fn(async (key: string) => {
      session.delete(key);
    }),
    storageGet: vi.fn(async (key: string) => (session.has(key) ? { [key]: session.get(key) } : {})),
    actionTitle: LOCALIZED_ACTION_TITLE,
  };

  vi.stubGlobal('chrome', {
    action: {
      onClicked: { addListener: () => undefined },
      setTitle: harness.setTitle,
    },
    commands: { onCommand: { addListener: () => undefined } },
    i18n: {
      // 真实的 chrome.i18n 对未知 key 返回空串，对已知 key 返回本地化文案。
      getMessage: (key: string) => (key === 'actionTitle' ? harness.actionTitle : ''),
    },
    tabs: {
      sendMessage: vi.fn(),
      onRemoved: { addListener: (fn: RemovedListener) => harness.removed.push(fn) },
      onUpdated: { addListener: (fn: UpdatedListener) => harness.updated.push(fn) },
    },
    runtime: {
      lastError: null,
      getManifest: () => ({
        name: MANIFEST_NAME,
        action: { default_title: MANIFEST_ACTION_TITLE },
      }),
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

describe('background 工具栏标题', () => {
  let harness: Harness;

  // background 的顶层代码（注册监听器）只在模块首次导入时执行一次，
  // 所以每个用例都要重置模块缓存，否则拿到的是缓存、监听器不再注册。
  beforeEach(async () => {
    vi.resetModules();
    harness = stubChrome();
    await import('./index');
  });

  /**
   * 把挂起的微任务排空。
   *
   * 复位标题这条路径现在是**异步**的：判据可能要从 storage.session 里读回来，
   * 而读存储是一次异步 IO。不等它落地就断言，测的是「还没发生」。
   */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const report = (tabId: number | undefined, rate: number, frameId = 0) => {
    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE, rate },
      { tab: { id: tabId }, frameId },
    );
  };

  /**
   * 焦点上报。
   *
   * ⚠️ 不带 rate = 「**这个 frame** 此刻没有受控视频」
   * （内容脚本只在有视频时才带上倍速，见 runtime 的 reportFocus）。
   */
  const reportFocus = (tabId: number | undefined, frameId: number, rate?: number) => {
    harness.messages[0]?.(
      { type: FRAME_FOCUS_MESSAGE, ...(rate === undefined ? {} : { rate }) },
      { tab: { id: tabId }, frameId },
    );
  };

  it('把当前倍速写进标题', () => {
    report(7, 1.5);

    expect(harness.setTitle).toHaveBeenCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
  });

  it('把当前倍速写进 storage.session（service worker 被回收后还能认出来）', () => {
    // 内存 Map 跟 service worker 一起没了，storage.session 活得比它久。
    // 不写进去的话，回收之后这个标签页「改过速没有」就再也认不出来了。
    //
    // ⚠️ 期望值必须是**字面量**：拿 rateStorageKey 拼出来是重言式。
    report(7, 1.5, 3);

    // 连「是谁报的」一起存：回收之后只有靠它才能判断
    // 「这个 frame 说没有视频」是不是意味着「那个视频已经不在了」。
    expect(harness.storageSet).toHaveBeenCalledWith({
      'vsc-tab-rate:7': { rate: 1.5, frameId: 3 },
    });
  });

  it('1.0x 时恢复成默认标题，而不是显示「1x」', () => {
    report(7, 1.5);
    report(7, 1);

    // 默认倍速不是「状态」，标题上多挂一截「1x」只是噪音。
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
  });

  it('默认标题与带倍速的标题用同一个前缀', () => {
    // 两处（默认态 / 带倍速态）曾经一个读 manifest.name、一个读 i18n：
    // 默认态多一截 "— Fullscreen & Keys"，tooltip 长度会突然变短。
    report(7, 1);
    report(7, 1.5);

    const titles = harness.setTitle.mock.calls.map((call) => (call[0] as { title: string }).title);
    expect(titles[0], '默认标题应当就是带倍速标题的前缀').toBe(
      titles[1].replace(' — 1.5x', ''),
    );
  });

  it('标题随 UI 语言变化', () => {
    // 写死英文的话，中文界面里的标题仍然是英文 —— 标题**永远不本地化**。
    harness.actionTitle = '视频速度控制器';

    report(7, 1.5);

    expect(harness.setTitle).toHaveBeenCalledWith(
      { tabId: 7, title: '视频速度控制器 — 1.5x' },
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
    // ⚠️ 这条必须发**带数字 rate 的别的类型**消息。
    // 早先这里发的是 `{ type: 'vsc-toggle-fullscreen' }`（不带 rate），
    // 于是被 `typeof rate !== 'number'` 那一半先挡下 —— type 校验一次都没跑到，
    // 把 `type !== SPEED_REPORT_MESSAGE` 整半删掉测试照样绿。
    harness.messages[0]?.({ type: 'vsc-toggle-fullscreen', rate: 1.5 }, { tab: { id: 7 } });
    harness.messages[0]?.({ type: 'something-else', rate: 1.5 }, { tab: { id: 7 } });
    // rate 不是数字：同样不碰。
    harness.messages[0]?.({ type: SPEED_REPORT_MESSAGE, rate: '1.5' }, { tab: { id: 7 } });

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('rate 不是有限数字时不碰（NaN / Infinity 不是倍速）', () => {
    harness.messages[0]?.({ type: SPEED_REPORT_MESSAGE, rate: Number.NaN }, { tab: { id: 7 } });
    harness.messages[0]?.({ type: SPEED_REPORT_MESSAGE, rate: Infinity }, { tab: { id: 7 } });

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('消息不是对象时不碰，也不抛错', () => {
    // 别的扩展 / 页面脚本可以往 runtime.onMessage 里塞任何东西。
    // `const { type, rate } = null` 会直接抛 TypeError，把整个 worker 带崩。
    expect(() => {
      harness.messages[0]?.(null, { tab: { id: 7 } });
      harness.messages[0]?.('vsc-speed-report', { tab: { id: 7 } });
      harness.messages[0]?.(undefined, { tab: { id: 7 } });
    }).not.toThrow();

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  /**
   * 导航**不再**自己复位标题。
   *
   * 根因：`chrome.tabs.onUpdated` 的 `status === 'loading'` 既表示跨文档导航，
   * 也表示**同文档导航**（history.pushState）。实测：SPA 站点上 pushState 之后，
   * 视频的 playbackRate 仍然是 1.1，而标题被猜成了默认值 —— 用户刚调好的倍速
   * 读数凭空消失，与视频上的常驻角标自相矛盾。
   *
   * 现在倍速的事实只有内容脚本知道：它上报一次，background 只记「最后一次上报」。
   */
  it('不再监听导航去猜倍速', () => {
    expect(
      harness.updated.length,
      '不得再监听 onUpdated 去猜「换页了 = 倍速归 1」—— 同文档导航也会触发它',
    ).toBe(0);
  });

  it('内容脚本上报 1.0 时标题复位（导航后的复位走这条路）', () => {
    report(7, 1.5);
    report(7, 1);

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
  });

  it('标签页关闭时清掉记录', () => {
    report(7, 1.5);
    harness.removed[0]?.(7);

    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

  it('关掉的标签页再次上报时会重新写标题', () => {
    report(7, 1.5);
    harness.removed[0]?.(7);
    harness.setTitle.mockClear();

    report(7, 2);

    expect(harness.setTitle).toHaveBeenCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 2x' },
      expect.any(Function),
    );
  });

  /**
   * 「这个标签页没有视频了」→ 标题必须复位。
   *
   * 场景（修复前）：标签页 A 里有个视频、调到 1.5x；A 在后台被导航到
   * 一个**没有视频**的页面；用户切回 A → 标题仍是「… — 1.5x」，
   * 而页面上根本没有视频（标题在说谎）。
   *
   * ⚠️ 复位只能走**焦点**消息：后台标签页不汇报倍速
   * （runtime 的 reportSpeed 开头就 ownsUserFocus() 早退），
   * 用户切回来时才有第一条消息 —— 而那时页面早就换了。
   */
  it('焦点 frame 报告「没有受控视频」→ 复位该标签页的读数', async () => {
    report(7, 1.5, 0);

    // 同一个 frame 现在说「我这儿没有受控视频」→ 那个视频已经不在了。
    reportFocus(7, 0);
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
  });

  it('倍速是别的 frame 报的（视频在嵌入框里）→ 不复位', async () => {
    // ⚠️ 上一条的**反向守卫**：视频在 iframe 里、而焦点在顶层时，
    // 顶层 frame 报「我这儿没有视频」是**正常**的 ——
    // 那时把标题清掉就等于在正常播放时抹掉读数（标题在说谎）。
    report(7, 1.5, 3);
    reportFocus(7, 0);
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
    expect(
      harness.setTitle,
      '别的 frame 报的倍速不该被这条消息抹掉（不该重写标题）',
    ).toHaveBeenCalledTimes(1);
  });

  it('焦点 frame 带着倍速 → 标题跟着它走（复位不能误伤这条）', () => {
    report(7, 1.5, 3);
    reportFocus(7, 0, 1.25);

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.25x' },
      expect.any(Function),
    );
  });

  it('从来没报过倍速的标签页：焦点说没有视频也不该重写标题', async () => {
    // 没有读数就没有「复位」可言 —— 白白重绘一次工具栏是纯浪费。
    reportFocus(7, 0);
    await flush();

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('内存里有答案时不去读 storage.session（热路径）', async () => {
    // 读存储是一次跨进程往返。内存里已经有答案就别去碰它。
    report(7, 1.5, 0);
    reportFocus(7, 0);
    await flush();

    expect(harness.storageGet).not.toHaveBeenCalled();
  });
});

/**
 * service worker 被回收之后，标题还复位得了吗。
 *
 * 故障链：标签页里的视频调到 1.5x → 标题显示「… — 1.5x」 → service worker
 * 空闲 30 秒被回收（两个内存 Map 一起没）→ 用户在同一标签页导航到没有视频的
 * 页面 → 新页面的内容脚本报「这个 frame 没有受控视频」→ 判据查不到「这个倍速
 * 是谁报的」→ **不复位** → 标题一直挂着 1.5x，而页面上根本没有视频。
 */
describe('service worker 被回收后的标题复位', () => {
  let harness: Harness;

  beforeEach(async () => {
    vi.resetModules();
    harness = stubChrome();
    await import('./index');
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const report = (tabId: number, rate: number, frameId = 0) => {
    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE, rate },
      { tab: { id: tabId }, frameId },
    );
  };

  const reportFocus = (tabId: number, frameId: number, rate?: number) => {
    harness.messages[0]?.(
      { type: FRAME_FOCUS_MESSAGE, ...(rate === undefined ? {} : { rate }) },
      { tab: { id: tabId }, frameId },
    );
  };

  /** 起一个 worker 生命周期：内存 Map 与 storage.session 都是空的。 */
  const startWorker = async (session: SessionStore) => {
    vi.resetModules();
    harness = stubChrome(session);
    await import('./index');
  };

  it('读回 storage.session 里的倍速与 frame → 仍然复位', async () => {
    const session: SessionStore = new Map();
    await startWorker(session);

    // 第一个 worker 生命周期：视频调到 1.5x，落在 storage.session 里。
    report(7, 1.5, 0);

    // worker 被回收：两个内存 Map 都空了，storage.session 还在。
    await startWorker(session);

    // 新页面（没有视频）里，焦点 frame 报「我这儿没有受控视频」。
    reportFocus(7, 0);
    await flush();

    // 判据只能来自 storage.session：worker 重启后内存里是空的。
    expect(harness.storageGet).toHaveBeenCalledWith('vsc-tab-rate:7');
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.setTitle, '复位只该重绘一次工具栏').toHaveBeenCalledTimes(1);
  });

  it('读回 storage.session 后，判据仍然是「是不是同一个 frame」', async () => {
    const session: SessionStore = new Map();
    await startWorker(session);

    // 视频在嵌入框里（frame 3）报的 1.5x。
    report(7, 1.5, 3);

    await startWorker(session);
    harness.setTitle.mockClear();

    // 焦点在顶层 frame（0）：它说「我这儿没有视频」是**正常**的 ——
    // 那时把标题清掉就等于在正常播放时抹掉读数（标题在说谎）。
    reportFocus(7, 0);
    await flush();

    expect(
      harness.setTitle,
      'worker 重启后也不该把别的 frame 报的倍速抹掉',
    ).not.toHaveBeenCalled();
  });

  it('从来没报过倍速的标签页 → 读回之后也不该重写标题', async () => {
    const session: SessionStore = new Map();
    await startWorker(session);
    await startWorker(session);

    reportFocus(7, 0);
    await flush();

    expect(harness.setTitle).not.toHaveBeenCalled();
  });

  it('读回的那一份会回填内存：下一次判断不必再读存储', async () => {
    const session: SessionStore = new Map();
    await startWorker(session);

    // 视频在 frame 3、焦点在 frame 0 —— 这条**不会**触发复位，
    // 所以「内存里有没有回填」只能靠「读了几次存储」来看。
    report(7, 1.5, 3);

    await startWorker(session);

    reportFocus(7, 0);
    await flush();

    expect(harness.storageGet).toHaveBeenCalledWith('vsc-tab-rate:7');
    expect(harness.storageGet).toHaveBeenCalledTimes(1);

    // 再走一次同样的路径：内存里已经有答案了，不该再读存储。
    reportFocus(7, 0);
    await flush();

    expect(harness.storageGet).toHaveBeenCalledTimes(1);
  });

  it('标签页关掉后，storage.session 里那份也跟着没', async () => {
    const session: SessionStore = new Map();
    await startWorker(session);

    report(7, 1.5, 0);
    expect(session.get('vsc-tab-rate:7')).toEqual({ rate: 1.5, frameId: 0 });

    harness.removed[0]?.(7);
    await flush();

    expect(session.get('vsc-tab-rate:7')).toBeUndefined();
  });
});

/**
 * 工具栏提示的**真源只能有一个**。
 *
 * ⚠️ 之前提示有两个真源：
 * - `manifest.json` 的 `action.default_title` 硬编码了产品全名
 *   （"Video Speed Controller — Fullscreen & Keys"）；
 * - background 的 `defaultTitle()` 走 `chrome.i18n`（"Video Speed Controller"）。
 *
 * 后果是提示会**自己换一张脸**：扩展刚装上时是全名，background 一上报倍速
 * 就变成短名 —— 同一枚图标，两种文案。中文用户看到的还是英文全名。
 *
 * 现在 manifest 写 `__MSG_actionTitle__`，两处都落到 `_locales` 的同一个键上。
 */
describe('工具栏提示只有一个真源', () => {
  it('manifest 的 default_title 必须是 __MSG_actionTitle__ 占位符', () => {
    expect(
      manifest.action.default_title,
      'default_title 又被写死成一段文案了 —— 那样提示会有两个真源：' +
        'manifest 一份、chrome.i18n 一份，扩展刚装上时显示前者、' +
        'background 上报倍速后显示后者，同一枚图标两种文案',
    ).toBe('__MSG_actionTitle__');
  });

  it('那个占位符指向的 locale 键必须真的存在', () => {
    // manifest 引用了一个不存在的键 → Chrome 会把它显示成占位符原文。
    expect(
      enMessages.actionTitle?.message,
      '_locales/en/messages.json 里必须有 actionTitle',
    ).toBeTruthy();
  });

  it('locale 里的 actionTitle 必须是 background 实际用的那一条', () => {
    // background 的 defaultTitle() 走 t('actionTitle', …)，两边必须同一个键。
    expect(LOCALIZED_ACTION_TITLE).toBe(enMessages.actionTitle?.message);
  });
});
