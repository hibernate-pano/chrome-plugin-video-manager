import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EXTENSION_INSTALLED_MESSAGE, FRAME_FOCUS_MESSAGE } from '../shared/types';

/**
 * 「装完了」：扩展装好/更新时，**当时已经开着**的那些标签页要刷新。
 *
 * ⚠️ 这条机制与「已经失效了」是**两件事**，别混成一条：
 * - 「已经失效了」= 内容脚本发现自己的上下文死了 → 它在**页面里**说
 *   （见 `src/content/runtime.test.ts`）；
 * - 「装完了」= background 在装好时从**外面**说 ——
 *   那些标签页里的内容脚本要么压根不存在（刚装），
 *   要么只剩一个上下文已死的僵尸（刚更新），**它们自己说不出话**。
 *
 * ⚠️ 为什么问的是**版本号**而不是「有没有回答」：
 * 一个「装好之后打开、但内容脚本还在启动中」的标签页也答不上来 ——
 * 把它当成「过期」只是多提醒一次刷新；
 * 而反过来（拿「有没有回答」当判据）在「刚更新」时会漏掉
 * 那个跑着旧副本的标签页。
 *
 * ⚠️ 答不上来的那两种情况在回调里长得**一模一样**
 * （"Could not establish connection. Receiving end does not exist."），
 * 所以这里刻意**不区分**它们。
 *
 * （这个文件与 `title.test.ts` 是分开的：那个文件是「标题 = 倍速」的，
 * 而这条机制是「标题 = 该刷新了」—— 两条链路共用同一个标题位。）
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJson = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;

const enMessages = readJson('_locales/en/messages.json') as Record<string, { message?: string }>;

/** chrome.i18n 查到的 actionTitle（真实环境里跟着 UI 语言走）。 */
const LOCALIZED_ACTION_TITLE = enMessages.actionTitle?.message ?? 'Video Speed Controller';
/** chrome.i18n 查到的 refreshThisPage（「请刷新本页」）。 */
const REFRESH_TITLE = enMessages.refreshThisPage?.message ?? 'Refresh this page';

type MessageListener = (
  message: unknown,
  sender: { tab?: { id?: number }; frameId?: number },
) => void;
type InstalledListener = (details: { reason?: string; previousVersion?: string }) => void;
type UpdatedListener = (tabId: number, changeInfo: { status?: string; url?: string }) => void;

interface Harness {
  messages: MessageListener[];
  installed: InstalledListener[];
  updated: UpdatedListener[];
  setTitle: Mock;
  storageSet: Mock;
  /**
   * `chrome.storage.local` 的写入。
   *
   * ⚠️ 必须**单独**留一个桩：`storage.session` 与 `storage.local` 是**两个区**，
   * 用同一个桩量就会**量错对象** ——
   * 「往 local 写了一份没人读的东西」在 session 的桩上永远是绿的。
   */
  localStorageSet: Mock;
  /**
   * 「这个标签页跑的是哪一版？」（回答 vsc-extension-installed）。
   *
   * 默认：答不上来（lastError）—— 那是「装好之前就开着」的标签页的样子。
   */
  tabVersion: (tabId: number) => string | null;
  /** tabs.query 返回的标签页。 */
  openTabs: Array<{ id?: number; url?: string }>;
}

const CURRENT_VERSION = '6.2.0';

const stubChrome = (): Harness => {
  const harness: Harness = {
    messages: [],
    installed: [],
    updated: [],
    setTitle: vi.fn(),
    storageSet: vi.fn(async () => undefined),
    localStorageSet: vi.fn(async () => undefined),
    tabVersion: () => null,
    openTabs: [],
  };

  const chromeStub = {
    action: {
      onClicked: { addListener: () => undefined },
      setTitle: harness.setTitle,
    },
    commands: { onCommand: { addListener: () => undefined } },
    i18n: {
      getMessage: (key: string) => {
        if (key === 'actionTitle') return LOCALIZED_ACTION_TITLE;
        if (key === 'refreshThisPage') return REFRESH_TITLE;
        return '';
      },
    },
    tabs: {
      query: vi.fn(async () => harness.openTabs),
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

        const type = (message as { type?: unknown } | null)?.type;

        if (type === EXTENSION_INSTALLED_MESSAGE) {
          const version = harness.tabVersion(_tabId);
          if (version === null) {
            chromeStub.runtime.lastError = {
              message: 'Could not establish connection. Receiving end does not exist.',
            };
            callback(undefined);
            chromeStub.runtime.lastError = null;
            return;
          }

          callback({ ok: true, version });
          return;
        }

        callback(undefined);
      }),
      onRemoved: { addListener: () => undefined },
      onUpdated: { addListener: (fn: UpdatedListener) => harness.updated.push(fn) },
    },
    runtime: {
      lastError: null as { message: string } | null,
      id: 'test-extension-id',
      getManifest: () => ({
        name: 'Video Speed Controller',
        version: CURRENT_VERSION,
        action: { default_title: '__MSG_actionTitle__' },
      }),
      onMessage: { addListener: (fn: MessageListener) => harness.messages.push(fn) },
      onInstalled: { addListener: (fn: InstalledListener) => harness.installed.push(fn) },
      openOptionsPage: vi.fn(),
    },
    storage: {
      session: {
        set: harness.storageSet,
        remove: vi.fn(async () => undefined),
        get: vi.fn(async () => ({})),
      },
      local: {
        set: harness.localStorageSet,
        remove: vi.fn(async () => undefined),
        get: vi.fn(async () => ({})),
      },
    },
  };

  vi.stubGlobal('chrome', chromeStub);

  return harness;
};

describe('background：「装完了」要告诉当时开着的标签页去刷新', () => {
  let harness: Harness;

  beforeEach(async () => {
    // background 的顶层代码（注册监听器）只在模块首次导入时执行一次，
    // 所以每个用例都要重置模块缓存，否则拿到的是缓存、监听器不再注册。
    vi.resetModules();
    harness = stubChrome();
    await import('./index');
  });

  const install = async (reason = 'install') => {
    harness.installed[0]?.({ reason, previousVersion: '' });
    // 挨个问标签页是异步的（要等一次跨进程往返）。
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('onInstalled 之后，答不上来的标签页的标题变成「请刷新本页」', async () => {
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    // 答不上来 = 那个标签页跑的不是当前版本（刚装：没有内容脚本）。
    harness.tabVersion = () => null;

    await install();

    expect(harness.setTitle).toHaveBeenCalledWith(
      { tabId: 7, title: `${LOCALIZED_ACTION_TITLE} — ${REFRESH_TITLE}` },
      expect.any(Function),
    );
  });

  it('版本一致的标签页**不用**提醒（它是装好之后才打开的）', async () => {
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    harness.tabVersion = () => CURRENT_VERSION;

    await install();

    expect(
      harness.setTitle,
      '版本一样的标签页跑的就是当前版本 —— 提醒它刷新是假话',
    ).not.toHaveBeenCalled();
  });

  it('版本不一致的标签页要提醒（它跑的是旧副本）', async () => {
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    harness.tabVersion = () => '6.1.0';

    await install();

    expect(harness.setTitle).toHaveBeenCalledWith(
      { tabId: 7, title: `${LOCALIZED_ACTION_TITLE} — ${REFRESH_TITLE}` },
      expect.any(Function),
    );
  });

  it('扩展自己的页面不参与（那里本来就该是最新版）', async () => {
    harness.openTabs = [{ id: 7, url: 'chrome-extension://abc/options.html' }];
    harness.tabVersion = () => null;

    await install();

    expect(harness.setTitle, '设置页不该被提醒去刷新').not.toHaveBeenCalled();
  });

  it('那个标签页一开口（焦点上报），标题就回到倍速读数', async () => {
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    harness.tabVersion = () => null;
    await install();

    // 用户刷新过了 → 新的内容脚本发来焦点上报。
    harness.messages[0]?.(
      { type: FRAME_FOCUS_MESSAGE, rate: 1.5 },
      { tab: { id: 7 }, frameId: 0 },
    );

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: `${LOCALIZED_ACTION_TITLE} — 1.5x` },
      expect.any(Function),
    );
  });

  it('那个标签页一导航（刷新/换页），标题也回到倍速读数', async () => {
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    harness.tabVersion = () => null;
    await install();

    // 同页刷新不改 URL，但内容脚本确实换了 ——
    // 而「装好之前就开着」的那个标签页正是靠刷新才能救回来的。
    harness.updated[0]?.(7, { status: 'loading' });
    // 复位标题这条路径是**异步**的（可能要从 storage.session 里读回读数）。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.setTitle).toHaveBeenLastCalledWith(
      { tabId: 7, title: LOCALIZED_ACTION_TITLE },
      expect.any(Function),
    );
  });

  it('这一条机制**不落盘**（没有人读的东西就不该写）', async () => {
    // 写一份没人读的 storage.local = 多一份隐私披露义务
    // （见 PRIVACY.md 的存储表），而商店审核会核对它。
    harness.openTabs = [{ id: 7, url: 'https://example.com/' }];
    harness.tabVersion = () => null;

    await install();

    expect(
      harness.localStorageSet,
      '「装完了」不许往 storage.local 里写任何东西 —— ' +
        '写一份没人读的东西 = 多一份隐私披露义务（PRIVACY.md 的存储表）',
    ).not.toHaveBeenCalled();
    expect(
      harness.storageSet,
      '「装完了」也不许往 storage.session 里写任何东西',
    ).not.toHaveBeenCalled();
  });
});
