import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  EXTENSION_INSTALLED_MESSAGE,
  FRAME_FOCUS_MESSAGE,
  FRAME_GONE_MESSAGE,
  FRAME_PROBE_MESSAGE,
  SPEED_REPORT_MESSAGE,
} from '../shared/types';

/**
 * 工具栏图标标题 = 当前标签页的倍速。
 *
 * 非全屏状态下倍速在界面上没有任何出口：控制条只有全屏才有、3 秒就隐藏，
 * 调速胶囊 1 秒就淡出。工具栏图标是唯一「一直看得见、每个标签页各自一份」
 * 的地方 —— 这份测试锁住的就是这条链路。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 探针的重试间隔 —— **从源码里读**，不 import background。
 *
 * ⚠️ 为什么不能 import：background/index.ts 的顶层代码会立刻注册
 * chrome.action.onClicked 之类的监听器，而 import 发生在 chrome 替身
 * 装好之前 → 「chrome is not defined」，整个测试文件起不来。
 * （这条链路的常量由 scripts/ci-workflow.test.ts 的「阈值常量必须被测试引用」
 *  守着，源码改了这里会红。）
 */
const FRAME_PROBE_RETRY_DELAY_MS = Number(
  /export const FRAME_PROBE_RETRY_DELAY_MS = (\d+);/.exec(
    readFileSync(resolve(repoRoot, 'src/background/index.ts'), 'utf8'),
  )?.[1] ?? -1,
);

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
/** chrome.i18n 查到的 refreshThisPage（「请刷新本页」）。 */
const REFRESH_TITLE = enMessages.refreshThisPage?.message ?? 'Refresh this page';

type MessageListener = (
  message: unknown,
  sender: { tab?: { id?: number }; frameId?: number },
) => void;
type RemovedListener = (tabId: number) => void;
type UpdatedListener = (tabId: number, changeInfo: { status?: string; url?: string }) => void;
type InstalledListener = (details: { reason?: string; previousVersion?: string }) => void;

/**
 * 探针问某个 frame 时的答案。
 *
 * `answered: false` = 没有人应答 = 那个 frame 已经不在了
 * （真实 API 里表现为回调带着 lastError 回来）。
 */
interface ProbeAnswer {
  answered: boolean;
  payload?: unknown;
}

interface Harness {
  messages: MessageListener[];
  removed: RemovedListener[];
  updated: UpdatedListener[];
  installed: InstalledListener[];
  setTitle: Mock;
  storageSet: Mock;
  storageRemove: Mock;
  storageGet: Mock;
  /**
   * 探针（background 问「那个 frame 还在吗」）的答案。
   *
   * 默认：回答「视频还在」—— 这是最常见的情况，
   * 也是「别的 frame 报的倍速不该被抹掉」那条守卫的前提。
   */
  probeAnswer: (frameId: number) => ProbeAnswer;
  /** i18n 查到的文案；改它就能模拟「UI 语言变了」。 */
  actionTitle: string;
  /** tabs.query 返回的标签页（「装完了」那条机制要挨个问它们）。 */
  openTabs: Array<{ id?: number; url?: string }>;
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
    installed: [],
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
    probeAnswer: () => ({ answered: true, payload: { ok: true, video: 'alive', rate: 1.5 } }),
    actionTitle: LOCALIZED_ACTION_TITLE,
    openTabs: [],
  };

  // ⚠️ lastError 只能在**回调里**读 —— 真实的 API 就是这样：
  // 「有人应答」与「没人应答」在回调里长得一模一样，
  // 唯一的区别是回调执行的那一刻 lastError 有没有值。
  const chromeStub = {
    action: {
      onClicked: { addListener: () => undefined },
      setTitle: harness.setTitle,
    },
    commands: { onCommand: { addListener: () => undefined } },
    i18n: {
      // 真实的 chrome.i18n 对未知 key 返回空串，对已知 key 返回本地化文案。
      getMessage: (key: string) => {
        if (key === 'actionTitle') return harness.actionTitle;
        if (key === 'refreshThisPage') return REFRESH_TITLE;
        return '';
      },
    },
    tabs: {
      query: vi.fn(async () => harness.openTabs),
      /**
       * tabs.sendMessage 的替身。
       *
       * 探针（FRAME_PROBE_MESSAGE）的答案由 harness.probeAnswer 决定：
       * 回答了 = frame 还活着；带 lastError 的回调 = 没人应答（frame 没了）。
       */
      sendMessage: vi.fn((
        _tabId: number,
        message: unknown,
        optionsOrCallback: unknown,
        maybeCallback?: unknown,
      ) => {
        const callback = typeof optionsOrCallback === 'function'
          ? optionsOrCallback
          : maybeCallback;
        if (typeof callback !== 'function') {
          return;
        }

        const options = (typeof optionsOrCallback === 'object' && optionsOrCallback !== null)
          ? optionsOrCallback as { frameId?: number }
          : {};
        const type = (message as { type?: unknown } | null)?.type;

        if (type === FRAME_PROBE_MESSAGE) {
          const answer = harness.probeAnswer(options.frameId ?? 0);
          if (!answer.answered) {
            chromeStub.runtime.lastError = { message: 'No frame with id' };
            callback(undefined);
            chromeStub.runtime.lastError = null;
            return;
          }

          callback(answer.payload);
          return;
        }

        if (type === EXTENSION_INSTALLED_MESSAGE) {
          // 答不上来 = 那个标签页跑的不是当前版本（刚装：没有内容脚本）。
          chromeStub.runtime.lastError = { message: 'No receiving end' };
          callback(undefined);
          chromeStub.runtime.lastError = null;
          return;
        }

        // 其它消息（广播问询）：真实环境里不回答也没有关系。
        callback(undefined);
      }),
      onRemoved: { addListener: (fn: RemovedListener) => harness.removed.push(fn) },
      onUpdated: { addListener: (fn: UpdatedListener) => harness.updated.push(fn) },
    },
    runtime: {
      lastError: null as { message: string } | null,
      getManifest: () => ({
        name: MANIFEST_NAME,
        version: '6.2.0',
        action: { default_title: MANIFEST_ACTION_TITLE },
      }),
      onMessage: { addListener: (fn: MessageListener) => harness.messages.push(fn) },
      onInstalled: { addListener: (fn: InstalledListener) => harness.installed.push(fn) },
      openOptionsPage: vi.fn(),
    },
    storage: {
      session: {
        set: harness.storageSet,
        remove: harness.storageRemove,
        get: harness.storageGet,
      },
    },
  };

  vi.stubGlobal('chrome', chromeStub);

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

  /**
   * 等探针那条**慢**路径走完。
   *
   * 探针扑空时会重试一次（内容脚本是 document_start 动态 import 的，
   * frame 在了、监听器还没注册上的那几十毫秒里会扑空）——
   * 那条重试带一个 80ms 的间隔，所以这里要等得久一点。
   */
  const flushSlow = () => new Promise((resolve) => setTimeout(resolve, 200));

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
   * 导航**不猜**倍速，但会**复核**读数。
   *
   * 根因（6.2.0 修过一次的老毛病）：`chrome.tabs.onUpdated` 的
   * `status === 'loading'` 既表示跨文档导航，也表示**同文档导航**
   * （history.pushState）。实测：SPA 站点上 pushState 之后，视频的
   * playbackRate 仍然是 1.1，而标题被猜成了默认值 —— 用户刚调好的倍速读数
   * 凭空消失，与视频上的常驻角标自相矛盾。
   *
   * 现在这条监听器**不猜**：它只负责「什么时候该问一句」，
   * 答不答由探针按「那个视频还在不在」决定。
   */
  it('同一个 URL 的状态变化（loading / complete）不碰读数', async () => {
    report(7, 1.5, 3);

    // ⚠️ 这两个事件里**没有 url**：同一个文档、同一个 URL 的状态变化。
    harness.updated[0]?.(7, { status: 'loading' });
    harness.updated[0]?.(7, { status: 'complete' });
    await flush();

    expect(harness.setTitle, '同一个 URL 的状态变化不该重写标题').toHaveBeenCalledTimes(1);
    expect(harness.storageRemove, '也不该删掉那份记录').not.toHaveBeenCalled();
  });

  it('URL 变了，但那个视频还在 → 读数留着（不按「换页 = 倍速归 1」处理）', async () => {
    // 同文档导航（history.pushState）也会带 URL 变化 ——
    // 那时视频还好好地播着 1.5 倍，清掉读数就是让标题与画面自相矛盾。
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({
      answered: true,
      payload: { ok: true, video: 'alive', rate: 1.5 },
    });

    harness.updated[0]?.(7, { url: 'https://example.com/second' });
    await flush();

    expect(
      harness.setTitle,
      '视频还在时不该重写标题（那会让刚调好的读数凭空消失）',
    ).toHaveBeenCalledTimes(1);
    expect(harness.storageRemove).not.toHaveBeenCalled();
  });

  it('URL 变了，而那个 frame 已经没了 → 复位标题、删掉那份记录', async () => {
    // 真实故障：SPA 把 iframe 整个换掉 → 那个 frame 死了，
    // 而它报出来的 1.5 倍还挂在标题上（标题在说谎）。
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({ answered: false });

    harness.updated[0]?.(7, { url: 'https://example.com/second' });
    await flushSlow();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.storageRemove, '读数作废了就该把那份记录删掉').toHaveBeenCalledWith(
      'vsc-tab-rate:7',
    );
  });

  it('URL 变了，而那个视频被页面换掉了 → 复位标题', async () => {
    // frame 还在，但它报出去的那个 <video> 已经被站点换掉了。
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({
      answered: true,
      payload: { ok: true, video: 'gone' },
    });

    harness.updated[0]?.(7, { url: 'https://example.com/second' });
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
  });

  it('复核期间来了新的上报 → 新的读数赢，复位不能覆盖它', async () => {
    // 整页导航之后新页面的内容脚本会重新上报 —— 那份新读数必须赢过
    // 「按旧判据清掉」这个动作（清掉不能覆盖新上报）。
    report(7, 1.5, 3);
    harness.probeAnswer = () => {
      // 探针还在路上的时候，新页面上报了 2 倍。
      report(7, 2, 0);
      return { answered: false };
    };

    harness.updated[0]?.(7, { url: 'https://example.com/second' });
    await flushSlow();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 2x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
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

  /**
   * 读数指向的 frame **没了** → 复位。
   *
   * 故障链：视频在 iframe 里、调到 1.5x；SPA 把那个 iframe 整个换掉；
   * 顶层 frame 报「我这儿没有受控视频」（正常 —— 顶层本来就没有视频）。
   *
   * ⚠️ 以前这里直接跳过（判据是「报出这个倍速的就是这个 frame 自己」），
   * 于是标题一直挂着 1.5x，而页面上一个视频都没有 —— 而且**没有人**会再来说
   * 这件事：那个 iframe 已经不会说话了。
   */
  it('读数指向的 frame 已经没了 → 探针问不到它 → 复位', async () => {
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({ answered: false });

    reportFocus(7, 0);
    await flushSlow();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

/**
 * 探针扑空一次、重试后成功 —— 这时读数**必须留着**。
 *
 * 为什么需要这条：内容脚本是 document_start 时**动态 import** 的
 * （见 content-loader.js），于是 frame 已经在、监听器还没注册上的那几十毫秒里，
 * 探针会扑空。扑空与「frame 没了」在回调里长得一模一样（都有 lastError）——
 * 所以 probeFrame 重试一次。
 *
 * ⚠️ 没有这条时，去掉重试会让扩展在**每一次**页面刚打开的瞬间
 * 把「这个标签页的倍速读数」清掉 —— 标题从「— 1.5x」退回默认，
 * 扩展开始说一个**假的**倍速。
 */
it('探针第一次扑空、重试后成功 → 读数必须留着（不许误判成 frame 没了）', async () => {
  report(7, 1.5, 3);

  // 第一次问：没人应答（内容脚本还没注册上监听器）。
  // 第二次问：答了（它准备好了）。
  let calls = 0;
  harness.probeAnswer = () => {
    calls += 1;
    if (calls === 1) {
      return { answered: false };
    }
    return { answered: true, payload: { ok: true, video: 'alive', rate: 1.5 } };
  };

  reportFocus(7, 0);
  await flushSlow();

  expect(calls, '探针必须重试一次（第一次扑空不等于 frame 没了）').toBeGreaterThanOrEqual(2);
  // 重试间隔被钉住：它必须给内容脚本「注册上监听器」留出时间，
  // 又不能长到让用户等着标题复位。80ms 是实测出来的那个窗口。
  expect(FRAME_PROBE_RETRY_DELAY_MS, '探针重试间隔是 80ms').toBe(80);
  expect(
    harness.setTitle,
    '重试成功后读数必须留着 —— 标题不许退回默认',
  ).not.toHaveBeenCalledWith(
    { tabId: 7, title: LOCALIZED_ACTION_TITLE },
    expect.any(Function),
  );
  expect(harness.storageRemove, '读数没作废就不该删掉那份记录').not.toHaveBeenCalled();
});

  it('读数指向的 frame 还在 → 不复位（反向守卫）', async () => {
    // 上一条的**反向守卫**：视频在 iframe 里、那个 iframe 好好地在那儿，
    // 顶层说「我这儿没有视频」是正常的 —— 读数必须留着。
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({
      answered: true,
      payload: { ok: true, video: 'alive', rate: 1.5 },
    });

    reportFocus(7, 0);
    await flush();

    expect(
      harness.setTitle,
      '那个 frame 还活着就不该抹掉读数',
    ).toHaveBeenCalledTimes(1);
  });

  /**
   * 「这一层没有受控视频」的**倍速上报**（不带 rate）→ 接住它。
   *
   * ⚠️ 以前这里直接 `return`，把这句话整个丢掉了 ——
   * 于是「视频被站点换掉 → 那一层说它没有视频了」这条信号**永远到不了**，
   * 标题继续挂着早已不存在的倍速（这正是本次要修的那个故障）。
   *
   * ⚠️ 但**不能**一收到就清读数：倍速可能是**别的** frame 报的
   * （视频在嵌入框里、而这一层是顶层）。
   */
  it('不带 rate 的上报：这一层正是报出这个倍速的那一层 → 复位', async () => {
    report(7, 1.5, 0);

    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
    );
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

  it('不带 rate 的上报：读数是别的 frame 报的、而那个 frame 还活着 → 不复位', async () => {
    // ⚠️ 反向守卫：视频在 iframe 里、顶层 frame 说「我这儿没有视频」是**正常**的。
    // 那时抹掉读数就是让标题在说谎。
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({
      answered: true,
      payload: { ok: true, video: 'alive', rate: 1.5 },
    });

    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
    );
    await flush();

    expect(
      harness.setTitle,
      '别的 frame 报的倍速不该被这条消息抹掉',
    ).toHaveBeenCalledTimes(1);
    expect(harness.storageRemove).not.toHaveBeenCalled();
  });

  it('不带 rate 的上报：读数是别的 frame 报的、而那个 frame 已经没了 → 复位', async () => {
    // 故障链：视频在 iframe 里、调到 1.5 倍；SPA 把 iframe 换掉 →
    // 顶层 frame 报「这一层没有受控视频」（不带 rate）。
    // 那个 iframe 已经不会说话了 → 探针问不到它 → 读数作废。
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({ answered: false });

    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
    );
    await flushSlow();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

  it('不带 rate 的上报：这个标签页本来就没有读数 → 不重写标题', async () => {
    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
    );
    await flush();

    expect(harness.setTitle, '没有读数就没有「复位」可言').not.toHaveBeenCalled();
  });

  it('frame 自己说要走了（页面卸载 / iframe 被换掉）→ 复位', async () => {
    // 这是**唯一确定**的信号：报出这个倍速的那个 frame 自己说它要走了。
    report(7, 1.5, 3);

    harness.messages[0]?.(
      { type: FRAME_GONE_MESSAGE },
      { tab: { id: 7 }, frameId: 3 },
    );
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

  it('走的不是报出这个倍速的那个 frame → 不动', async () => {
    // 别的 frame 走了（页面上还有别的嵌入框）：那份读数与它无关。
    report(7, 1.5, 3);

    harness.messages[0]?.(
      { type: FRAME_GONE_MESSAGE },
      { tab: { id: 7 }, frameId: 5 },
    );
    await flush();

    expect(
      harness.setTitle,
      '别的 frame 走了不该抹掉这份读数',
    ).toHaveBeenCalledTimes(1);
    expect(harness.storageRemove).not.toHaveBeenCalled();
  });

  it('「我走了」到达时读数已经换人了 → 不许拿它清掉新读数', async () => {
    // 竞态：整页导航 → 旧 frame 卸载（发「我走了」）→ 新页面的内容脚本启动
    // （发新上报）。这两条消息可能**乱序**到达。
    //
    // 一旦「我走了」被当成「当前这份读数作废」，用户刚看到的新读数就被抹掉了。
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({ answered: false });

    // 「我走了」这条消息**先**到，但它要等一次异步的读存储 ——
    // 那次 await 期间，新页面的上报到了。
    const stale = harness.messages[0];
    stale?.(
      { type: FRAME_GONE_MESSAGE },
      { tab: { id: 7 }, frameId: 3 },
    );
    report(7, 2, 0);
    await flushSlow();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 2x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
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

/**
 * 「读数版本号」（tabRateRevisions）：新读数赢过旧判据。
 *
 * 每来一份**新的**倍速读数，background 就把这个标签页的版本号 +1
 * （index.ts 的 applySpeed / forgetRate）。
 *
 * 复位标题的那几条路径都是**异步**的 —— 要等探针（一次 IO）或等读 storage.session ——
 * 等待期间如果来了一份新读数，那份新读数必须赢：
 * 「按旧判据清掉」就成了一步错棋（它会把用户刚看到的倍速抹掉，标题在说谎）。
 *
 * ⚠️ 这道闸门散落在**五个**不同的位置，触发消息各不相同：
 *   ① 复核读数（URL 变了）
 *   ② 焦点消息（读数是**别的** frame 报的）
 *   ③ 「我走了」（FRAME_GONE）
 *   ④ 不带 rate 的上报（读数是**这一层**报的）
 *   ⑤ 不带 rate 的上报（读数是**别的** frame 报的）
 * 少写一条用例，那条路径就没人走过 —— 改坏了不会红。
 *
 * ⚠️ 断言量的是**用户真正看到的结果**：工具栏图标标题上显示的倍速
 * （chrome.action.setTitle 的实参），不是内部变量。
 */
describe('读数版本号：新读数赢过旧判据（五道闸门）', () => {
  let harness: Harness;

  beforeEach(async () => {
    vi.resetModules();
    harness = stubChrome();
    await import('./index');
  });

  /** 排空微任务：这些复位路径都是异步的，不等它落地就断言 = 断言「还没发生」。 */
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

  /**
   * 让读数「换了一圈又换回来」。
   *
   * ⚠️ 为什么非要绕这一圈：
   * 复位路径在版本号之后还有一道「读数还一样吗」的比较（比倍速与 frame）。
   * 新读数如果只是**换了值**，那道比较也会拦住复位 —— 那样这条用例就
   * **证明不了**版本号那道闸门的作用（把那个 `if` 删掉，测试照样绿）。
   *
   * 绕一圈之后：最终读数与判据**完全相同**，
   * 只有版本号知道「等待期间有新的读数到过」——
   * 这正是这道闸门唯一能立功的地方（真实的场景：用户在等待期间把速度
   * 调走又调回，最终值与开始时相同）。
   */
  const roundTrip = (tabId: number, frameId: number, rate: number) => {
    report(tabId, rate + 0.5, frameId);
    report(tabId, rate, frameId);
  };

  /**
   * ① 复核读数（URL 变了 → revalidateTabRate）。
   *
   * 触发：chrome.tabs.onUpdated（URL 真变了）。
   * 竞态：复核要等探针，等待期间读数换了一圈。
   * 期望：新读数赢 → 标题保留 1.5x，那份记录也不该被删掉。
   */
  it('① 复核期间读数换了一圈 → 旧判据作废，不复位（新读数赢）', async () => {
    report(7, 1.5, 3);

    harness.probeAnswer = () => {
      // 探针还在路上（IO 没回来）→ 期间读数换了一圈又换回来。
      roundTrip(7, 3, 1.5);
      // 「frame 还在，但它报出去的那个视频已经被页面换掉了」。
      return { answered: true, payload: { ok: true, video: 'gone' } };
    };

    harness.updated[0]?.(7, { url: 'https://example.com/second' });
    await flush();

    // 用户看到的：标题仍然是 1.5 倍（新读数赢），不是默认标题。
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });

  /**
   * ② 焦点消息（读数是**别的** frame 报的）。
   *
   * 触发：FRAME_FOCUS_MESSAGE（不带倍速 = 「我这一层没有受控视频」）。
   * 读数是别的 frame 报的 → 这条路径会去问那个 frame 一句（探针）。
   * 竞态：探针等待期间读数换了一圈。
   */
  it('② 焦点消息 → 探针期间读数换了一圈 → 旧判据作废，不复位（新读数赢）', async () => {
    // 视频在嵌入框里（frame 3 报的 1.5x）。
    report(7, 1.5, 3);

    harness.probeAnswer = () => {
      roundTrip(7, 3, 1.5);
      return { answered: true, payload: { ok: true, video: 'gone' } };
    };

    // 顶层 frame 报焦点，但**不带倍速** = 「我这一层没有受控视频」。
    reportFocus(7, 0);
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });

  /**
   * ③ 「我走了」（FRAME_GONE）。
   *
   * 触发：FRAME_GONE_MESSAGE（frame 自己说它要走了）。
   * 竞态：这条消息要 await 一次读存储，等待期间新读数到了
   * （整页导航时旧 frame 卸载、新页面的内容脚本启动 —— 两条消息可能乱序）。
   *
   * ⚠️ 这条路径**没有**「读数还一样吗」那道比较 —— 版本号是唯一的闸门。
   */
  it('③ 「我走了」→ 读存储期间来了新读数 → 旧判据作废，不清掉新读数', async () => {
    report(7, 1.5, 3);

    // 「我走了」这条消息**先**到，但它要等一次异步的读存储。
    harness.messages[0]?.(
      { type: FRAME_GONE_MESSAGE },
      { tab: { id: 7 }, frameId: 3 },
    );
    // 那次 await 期间，新读数到了（还是这一层报的，但倍速是新的）。
    report(7, 2, 3);
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 2x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });

  /**
   * ④ 不带 rate 的上报（读数是**这一层**报的）。
   *
   * 触发：SPEED_REPORT_MESSAGE（不带倍速 = 「我这一层没有受控视频」）。
   * 竞态：这条消息要 await 一次读存储，等待期间新读数到了。
   * 期望：新读数赢 → 标题保留 2x，那份记录也不该被删掉。
   *
   * ⚠️ 这条用例曾经是红的 —— 生产代码里这道闸门是**死的**：
   * 版本号是在 await 读存储**之后**才记的（index.ts 的 SPEED_REPORT 分支），
   * 所以「等待期间来了新读数」这件事它根本看不见（那段等待里没有别的 await，
   * 版本号不可能变 → 那个 `if` 永远不成立）。
   * 可观测后果：等待期间到达的新读数会被 `resetTabRate` 抹掉，
   * 标题从「— 2x」退回默认的「Video Speed Controller」—— 扩展开始说一个**假**的倍速。
   *
   * 已修：版本号挪到进异步**之前**采样（与 FRAME_GONE 分支同一写法）。
   * 它当时用 it.fails 钉着，产品修好后自己变红提醒改回 it —— 现在改回来了。
   */
  it('④ 不带 rate 的上报 → 读存储期间来了新读数 → 旧判据作废（新读数赢）', async () => {
    report(7, 1.5, 3);

    // 这一层（frame 3）说「我这儿没有受控视频」→ 读数是它报的 → 该复位。
    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE },
      { tab: { id: 7 }, frameId: 3 },
    );
    // 那次 await 期间，新读数到了。
    report(7, 2, 0);
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 2x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });

  /**
   * ⑤ 不带 rate 的上报（读数是**别的** frame 报的）。
   *
   * 触发：SPEED_REPORT_MESSAGE（不带倍速），但读数是别的 frame 报的
   *       → 与 ② 同一个形状、**不同的触发消息**（两条路径必须分别守着）。
   * 竞态：探针等待期间读数换了一圈。
   */
  it('⑤ 不带 rate 的上报 → 探针期间读数换了一圈 → 旧判据作废，不复位（新读数赢）', async () => {
    // 视频在嵌入框里（frame 3 报的 1.5x）。
    report(7, 1.5, 3);

    harness.probeAnswer = () => {
      roundTrip(7, 3, 1.5);
      return { answered: true, payload: { ok: true, video: 'gone' } };
    };

    // 顶层 frame（0）说「我这一层没有受控视频」（不带 rate）。
    harness.messages[0]?.(
      { type: SPEED_REPORT_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
    );
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });
});

/**
 * 读数版本号闸门：**第 6 道与第 7 道**（焦点消息那两条支路）。
 *
 * ⚠️ 上一组用例守的是 ①②③④⑤ 五道闸门。这一组补上两条**当时漏掉**的：
 *
 * **⑥ 焦点消息里「读数就是这一层报的」那一支**（`state.frameId === frameId`）
 * —— 它原来**压根没有版本号闸门**：`await readTabRate` 之后直接
 * `resetTabRate(tabId)`。等待期间来了新读数（整页导航后新页面的内容脚本
 * 启动就会报一次）→ 旧判据把新读数抹掉 → 标题从「— 2x」退回
 * 「Video Speed Controller」，扩展开始说一个**假的**倍速。
 *
 * **⑦ 焦点消息里「读数是别的 frame 报的」那一支** —— 它**有**闸门，
 * 但采样点在 `await readTabRate` **之后**：从采样点到比较点之间只剩探针那一次
 * await，于是「读存储那一次 await 期间到达的新读数」它根本看不见
 * （只挡住了后半截窗口）。
 *
 * ⚠️ 竞态必须发生在**读存储**那一次 await 期间，而不是探针期间 ——
 * 因为「读存储」那一次 await 才是**采样点之前**的那一段窗口。
 *
 * ⚠️ 怎么让「读存储期间」发生一次新上报？`storage.session.get` 是个桩，
 * 可以在它 resolve 的那一瞬间触发回调（见 harness 里的 `roundTripDuringStorageGet`）。
 */
describe('读数版本号：新读数赢过旧判据（补齐的第 6、7 道闸门）', () => {
  let harness: Harness;

  beforeEach(async () => {
    vi.resetModules();
    harness = stubChrome();
    await import('./index');
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const flushSlow = () => new Promise((resolve) => setTimeout(resolve, 200));

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

  /**
   * 让「读存储」那一次 await 期间，读数**换了一圈又换回来**。
   *
   * ⚠️ 「绕一圈」的必要性与上面那组一样：复位路径在版本号之后还有一道
   * 「读数还一样吗」的比较。新读数如果只是**换了值**，那道比较也会拦住复位 ——
   * 那样这条用例就**证明不了**版本号那道闸门的作用（把那个 `if` 删掉，测试照样绿）。
   * 绕一圈之后最终读数与判据**完全相同**，只有版本号知道
   * 「等待期间有新读数到过」。
   *
   * ⚠️ **怎么让竞态恰好落在「读存储」那一次 await 期间**：
   * `readTabRate` 是 async 的 —— 即使命中内存、一次存储都不碰，
   * 它也会在**第一个 await 处**挂起一个微任务。所以：
   * 「焦点消息」处理函数跑完 → 紧接着**同步**发一条新上报 →
   * 那条上报落在 `readTabRate` 恢复**之前**（还在 await 窗口里）。
   *
   * ⚠️ 这不是巧合，是**真实**的形状：service worker 被回收过之后，
   * 焦点消息的那条路径本来就要去 storage.session 里取判据 ——
   * 那一次跨进程往返期间，新页面的内容脚本启动并上报，是完全正常的时序。
   */
  const roundTripAfterTrigger = (
    tabId: number,
    frameId: number,
    rate: number,
  ) => {
    // 同步跟在触发消息**后面** —— 落在那个 await 窗口里。
    report(tabId, rate + 0.5, frameId);
    report(tabId, rate, frameId);
  };

  /**
   * ⑥ 焦点消息里「读数就是这一层报的」那一支。
   *
   * 触发：FRAME_FOCUS_MESSAGE（不带倍速 = 「我这一层没有受控视频」）。
   * 读数是**这一层**报的 → 该复位。
   * 竞态：读存储那一次 await 期间读数换了一圈。
   * 期望：新读数赢 → 标题保留 1.5x，那份记录也不该被删掉。
   *
   * ⚠️ 这条分支原来**压根没有版本号闸门** ——
   * 所以「把闸门删掉」这条变异会让它变红。
   */
  it('⑥ 焦点消息（读数是这一层报的）→ 读存储期间读数换了一圈 → 不复位（新读数赢）', async () => {
    // 视频在 frame 3、调到 1.5x。
    report(7, 1.5, 3);

    // 同一个 frame 现在说「我这儿没有受控视频」→ 那个视频已经不在了 → 该复位。
    reportFocus(7, 3);

    // 那次 await 期间，读数换了一圈又换回来（最终值与判据相同）。
    roundTripAfterTrigger(7, 3, 1.5);
    await flush();

    // 用户看到的：标题仍然是 1.5 倍（新读数赢），不是默认标题。
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });

  /**
   * ⑥ 的**反向守卫**：没有新读数到达时，那条路径**必须**复位。
   *
   * ⚠️ 没有这一条，上面那条可能是因为「这条路径压根不复位」而绿的
   * —— 那样它守的就不是版本号那道闸门，而是「这条路径什么都不做」。
   */
  it('⑥ 的反向守卫：读存储期间**没有**新读数 → 照常复位', async () => {
    report(7, 1.5, 3);

    reportFocus(7, 3);
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

  /**
   * ⑦ 焦点消息里「读数是**别的** frame 报的」那一支。
   *
   * 触发：FRAME_FOCUS_MESSAGE（不带倍速），读数是别的 frame 报的
   *       → 这条路径会去问那个 frame 一句（探针）。
   * 竞态：读存储那一次 await 期间读数换了一圈。
   *
   * ⚠️ 这条路径的闸门**存在**，但采样点在 `await readTabRate` **之后** ——
   * 于是「读存储那一次 await 期间到达的新读数」它看不见（只挡住后半截窗口）。
   */
  it('⑦ 焦点消息（读数是别的 frame 报的）→ 读存储期间读数换了一圈 → 不复位（新读数赢）', async () => {
    // 视频在嵌入框里（frame 3 报的 1.5x）。
    report(7, 1.5, 3);

    // ⚠️ 探针必须说「那个视频已经没了」——否则这条路径在探针那里就 early-return 了，
    // 根本走不到复位那一步，用例就成了**恒真**的假守卫
    // （它绿不是因为版本号闸门，而是因为「压根没复位」）。
    harness.probeAnswer = () => ({
      answered: true,
      payload: { ok: true, video: 'gone' },
    });

    // 顶层 frame（0）报焦点，但**不带倍速** = 「我这一层没有受控视频」。
    reportFocus(7, 0);

    // 那次 await 期间，读数换了一圈又换回来（最终值与判据相同）。
    roundTripAfterTrigger(7, 3, 1.5);
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });

  /**
   * ⑦ 的**反向守卫**：没有新读数到达、且那个 frame 确实没了 → 照常复位。
   */
  it('⑦ 的反向守卫：读存储期间**没有**新读数、那个 frame 没了 → 照常复位', async () => {
    report(7, 1.5, 3);
    harness.probeAnswer = () => ({ answered: false });

    reportFocus(7, 0);
    await flushSlow();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
    expect(harness.storageRemove).toHaveBeenCalledWith('vsc-tab-rate:7');
  });

  /**
   * ⑨ 复核读数（URL 变了 → revalidateTabRate）—— **读存储**那一次 await 的窗口。
   *
   * ⚠️ 上一组里的 ① 守的是**探针**那个窗口（读数换圈发生在探针在途时）。
   * 这一条守的是**更早**的那个窗口：复核刚起步、还在等第一份读数时。
   *
   * ⚠️ 少了这一条，那道闸门就**只挡住后半截窗口** ——
   * 把采样点挪回 `await readTabRate` 之后（原来的位置），
   * ① 照样绿（它守的是探针窗口），而「读存储期间来的新读数」无人看守。
   */
  it('⑨ 复核读数（URL 变了）→ 读存储期间读数换了一圈 → 不复位（新读数赢）', async () => {
    // 视频在嵌入框里（frame 3 报的 1.5x）。
    report(7, 1.5, 3);

    // 探针说「那个视频已经没了」→ 不复位的话就是标题在说谎。
    harness.probeAnswer = () => ({
      answered: true,
      payload: { ok: true, video: 'gone' },
    });

    // URL 真变了 → 触发复核。
    harness.updated[0]?.(7, { url: 'https://example.com/second' });

    // 复核刚起步、还在等第一份读数的那一次 await 期间，读数换了一圈。
    roundTripAfterTrigger(7, 3, 1.5);
    await flushSlow();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
    expect(harness.storageRemove, '新读数还在，不该删掉它').not.toHaveBeenCalled();
  });
});

/**
 * 读数版本号闸门：**第 8 道**（「装完了」那条机制把标题还回读数的那条路）。
 *
 * ⚠️ 这条路径与前七条是**同一个病根**的另一副面孔：
 * **拿着一个快照，跨过一次 await，然后按那个快照写标题。**
 *
 * `clearStaleMark` 的异步续段是 `readTabRate(tabId).then(stored => applyTitle(stored?.rate ?? 1))`
 * —— 等待期间来了一份新读数（焦点消息里带着倍速时走的就是 applySpeed），
 * 那一份已经把标题写对了；这一行随后把**旧快照**写回去，
 * 于是标题从「— 1.5x」退回「Video Speed Controller」——
 * 扩展开始说一个**假的**倍速。
 *
 * ⚠️ 这条路**不在**「读数复位」的六处里 —— 它**写**标题而不是清读数，
 * 所以按「只查 resetTabRate」是查不出来的。**闸门要盖住的是「按旧快照改标题」**
 * 这个动作本身，不只是「清读数」。
 *
 * ⚠️ 复现形状：扩展刚装好 → 那个标签页被标成「过期」（标题写着「请刷新本页」）
 * → 用户刷新它 → 新内容脚本发焦点上报（带 1.5x）→ 标题正确地显示「— 1.5x」
 * → 「装完了」那条机制的异步续段随后把它改回默认标题。
 */
describe('读数版本号：第 8 道闸门（「装完了」还回读数那条路）', () => {
  let harness: Harness;

  beforeEach(async () => {
    vi.resetModules();
    harness = stubChrome();
    await import('./index');
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const reportFocus = (tabId: number, frameId: number, rate?: number) => {
    harness.messages[0]?.(
      { type: FRAME_FOCUS_MESSAGE, ...(rate === undefined ? {} : { rate }) },
      { tab: { id: tabId }, frameId },
    );
  };

  it('「装完了」的异步续段期间来了新读数 → 旧快照不许把标题写回去', async () => {
    // 那个标签页是在扩展装好之前就开着的 → 被标成「过期」。
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    harness.installed[0]?.({ reason: 'install', previousVersion: '' });
    await flush();

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: `${LOCALIZED_ACTION_TITLE} — ${REFRESH_TITLE}` },
      expect.any(Function),
    );

    // 用户刷新了那一页 → 新内容脚本发来焦点上报，**带着**它的倍速。
    // 这条上报让标题正确地变成「— 1.5x」。
    reportFocus(7, 0, 1.5);
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );

    // ⚠️ 但「装完了」那条机制的异步续段还在路上 ——
    // 它手里那份**旧快照**（读数 1.5 / 或者根本没有读数）随后会写标题。
    // 那一次写入必须被版本号闸门挡住，否则新读数被擦掉。
    await flush();

    expect(
      harness.setTitle,
      '等待期间来了新读数 → 旧快照不许把标题写回去（否则扩展开始说一个假的倍速）',
    ).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 1.5x' },
      expect.any(Function),
    );
  });

  it('「装完了」的异步续段期间**没有**新读数 → 照常把标题还回读数（反向守卫）', async () => {
    // 那个标签页是在扩展装好之前就开着的 → 被标成「过期」。
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    harness.installed[0]?.({ reason: 'install', previousVersion: '' });
    await flush();

    // 用户刷新了那一页 → 新内容脚本发来焦点上报（**不带**倍速）。
    reportFocus(7, 0);
    await flush();

    // 标题回到读数（这里是默认标题 —— 那个标签页没有受控视频）。
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
  });
});

/**
 * 读回 storage.session 那一刻，内存里可能已经有一份**更新**的读数了。
 *
 * ⚠️ 这是与「版本号闸门」**同源但不同层**的一个洞。
 *
 * `readTabRate` 的形状是：
 * ```
 * const cachedRate = tabRates.get(tabId);        ← await **之前**取的快照
 * ...
 * const stored = await chrome.storage.session.get(key);   ← await
 * if (cachedRate === undefined) tabRates.set(tabId, rate);  ← 用**旧快照**判断
 * ```
 *
 * 等待存储期间可能来了一份**新**读数（applySpeed 已经写进内存了）——
 * 那份比存储里这份**新**。但「要不要回填」用的却是 await **之前**取的
 * `cachedRate`：它还是 undefined → 于是**旧**的那份被写进内存，
 * 把等待期间到来的新读数**盖掉**了。
 *
 * 后果不是「标题立刻说谎」，而是更隐蔽的那个：
 * **「这个倍速是哪个 frame 报的」也错了** ——
 * 之后每一次判据（复位标题时「报出这个倍速的就是这个 frame 自己吗」）
 * 都在错的基础上算。
 *
 * ⚠️ 为什么它值得一条专门的守卫：它**不在**「六处 resetTabRate」里，
 * 按「只查复位路径」是查不出来的 —— 它在**读**路径上。
 */
describe('读回存储时不能把旧快照盖掉更新的读数', () => {
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

  it('读存储期间来了新读数 → 内存里留下的必须是**新**的那份（否则下一次判据全错）', async () => {
    // 视频在 frame 3、调到 1.5x（先落一份进 storage.session）。
    report(7, 1.5, 3);

    // ⚠️ 模拟 service worker 被回收：内存空了，storage.session 里那份还在。
    vi.resetModules();
    const session = new Map<string, unknown>();
    session.set('vsc-tab-rate:7', { rate: 1.5, frameId: 3 });
    harness = stubChrome(session);
    await import('./index');

    // ⚠️ 读存储那一次 await 期间，新页面的内容脚本报来一份**新的**读数
    // （2 倍，frame 0 —— 换了一个 frame）。
    const original = harness.storageGet.getMockImplementation();
    harness.storageGet.mockImplementation(async (key: string) => {
      const result = original ? await original(key) : {};
      report(7, 2, 0);
      return result;
    });

    // 触发一次「要去 storage.session 里取判据」的路径。
    harness.messages[0]?.(
      { type: FRAME_FOCUS_MESSAGE },
      { tab: { id: 7 }, frameId: 0 },
    );
    await flush();

    // 新读数已经到了：标题应该是 2 倍。
    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 2x' },
      expect.any(Function),
    );

    // ⚠️ **怎么从外面看内存里那份？** —— 内存是私有的，
    // 但它会通过**下一次判据**显形：
    // 「报出这个倍速的是哪个 frame 自己」这条判据读的就是内存。
    //
    // 所以：让**当初报 1.5 倍的那个 frame**（frame 3）再说一次
    // 「我这儿没有受控视频」。
    // - 内存里是**新**的那份（2 倍 / frame 0）→ 读数不是它报的 →
    //   走探针分支（默认答「还在」）→ 读数留着，标题不变。
    // - 内存里被**旧快照**盖成了 1.5 倍 / frame 3 → 读数就是它报的 →
    //   复位！标题退回默认、那份记录也被删掉 ——
    //   而页面上那个视频好好的、正在以 2 倍播着。
    harness.messages[0]?.(
      { type: FRAME_FOCUS_MESSAGE },
      { tab: { id: 7 }, frameId: 3 },
    );
    await flush();

    expect(
      harness.setTitle,
      '内存里被旧快照盖掉 → 判据会以为「1.5 倍是 frame 3 报的」→ 错误地复位',
    ).toHaveBeenLastCalledWith(
      { tabId: 7, title: 'Video Speed Controller — 2x' },
      expect.any(Function),
    );
    expect(
      session.get('vsc-tab-rate:7'),
      '读数还在，不该被删掉',
    ).toEqual({ rate: 2, frameId: 0 });
  });
});
