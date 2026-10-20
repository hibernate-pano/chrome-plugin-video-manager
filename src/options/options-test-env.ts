import { vi } from 'vitest';

/**
 * 设置页测试用的 chrome mock + 挂载助手。
 * 抽成共享模块是为了让 options-smoke 与 options-a11y 复用同一份 mock，
 * 而不是每个测试文件各抄一遍。
 */
export interface ChromeMockOptions {
  /** storage.sync 的初始内容，例如 { 'vsc-settings': { ... } }。 */
  sync?: Record<string, unknown>;
  /** storage.local 的初始内容。 */
  local?: Record<string, unknown>;
  /**
   * Chrome **实际选中**的 locale 目录（BCP 47 标签）。
   *
   * 注意不是 getUILanguage()：那是浏览器界面语言，而 Chrome 挑 locale 目录
   * 可能受系统/地区设置影响，两者可以不一致。设置页的 document.lang
   * 跟的是**实际渲染**的语言，所以 mock 也要按这个来。
   */
  locale?: string;
  /** chrome.i18n.getUILanguage() 的返回值（仅供需要它的场景）。 */
  uiLanguage?: string;
  /** chrome.runtime.getManifest().version，决定页脚显示的版本号。 */
  version?: string;
  /** chrome.i18n.getMessage() 的实现，key -> 文案。缺省时全部返回空串（= 走本地回落）。 */
  messages?: Record<string, string>;
}

export interface ChromeMock {
  /** storage.local 每次 set 的入参，用于断言「本不该写入」。 */
  localSets: Array<Record<string, unknown>>;
  /** storage.local 每次 remove 的 key，按调用顺序记录。 */
  localRemoves: string[];
  /** storage.local 的当前内容。 */
  local: Record<string, unknown>;
  /** storage.sync 的当前内容。 */
  sync: Record<string, unknown>;
  /** 重置模块缓存、挂载 #root 并加载设置页，返回根节点。 */
  render: () => Promise<HTMLElement>;
}

/** 排空微任务与一个宏任务，等设置页的 loadSettings().then 回填完成。 */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export const createChromeMock = (options: ChromeMockOptions = {}): ChromeMock => {
  const sync: Record<string, unknown> = { ...(options.sync ?? {}) };
  const local: Record<string, unknown> = { ...(options.local ?? {}) };
  const localSets: Array<Record<string, unknown>> = [];
  const localRemoves: string[] = [];
  const messages: Record<string, string> = { ...(options.messages ?? {}) };

  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      lastError: null,
      openOptionsPage: () => {},
      getManifest: () => ({
        manifest_version: 3,
        name: 'Video Speed Controller — Fullscreen & Keys',
        version: options.version ?? '0.0.0-test',
      }),
    },
    // 设置页读 __vscLocale 这个语言标记键来对齐 <html lang>。
    // 不 mock 的话真实 chrome.i18n 不存在，document.lang 就永远停在 HTML 里写死的值，
    // 「界面语言与 lang 对不上」这个 bug 会变得测不出来。
    i18n: {
      getUILanguage: () => options.uiLanguage ?? 'zh-CN',
      getMessage: (key: string) =>
        key === '__vscLocale' ? (options.locale ?? 'zh-CN') : (messages[key] ?? ''),
    },
    storage: {
      sync: {
        get: (key: string, callback: (result: Record<string, unknown>) => void) =>
          callback(key in sync ? { [key]: sync[key] } : {}),
        set: (value: Record<string, unknown>, callback?: () => void) => {
          Object.assign(sync, value);
          callback?.();
        },
        remove: (key: string, callback?: () => void) => {
          delete sync[key];
          callback?.();
        },
      },
      local: {
        get: (key: string, callback: (result: Record<string, unknown>) => void) =>
          callback(key in local ? { [key]: local[key] } : {}),
        set: (value: Record<string, unknown>, callback?: () => void) => {
          localSets.push(value);
          Object.assign(local, value);
          callback?.();
        },
        remove: (key: string, callback?: () => void) => {
          localRemoves.push(key);
          delete local[key];
          callback?.();
        },
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  };

  const render = async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    await import('./index');
    await flush();
    return document.getElementById('root') as HTMLElement;
  };

  return { localSets, localRemoves, local, sync, render };
};
