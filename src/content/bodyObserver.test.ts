import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeBody } from './bodyObserver';

/**
 * 「body 会被站点换掉」的观察工具。
 *
 * ⚠️ 这些用例守的是一个**真实故障**：注册表的观察者当初直接绑在
 * `document.body` 上，站点 `document.body.replaceWith(newBody)` 之后
 * 观察者就成了孤儿 —— 新 body 里的任何变化都看不见，
 * 「DOM 变更代次」永远不前进 → 快捷键路径缓存里的 `null` 永不过期
 * → **所有快捷键静默失灵**（而图标那条路按帧重算，不受影响）。
 */

/** 等 MutationObserver 的回调落地（它是微任务）。 */
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('observeBody', () => {
  afterEach(() => {
    // 用例可能把 body 换掉过 —— 换回一个干净的，别影响后面的用例。
    if (!document.body) {
      const body = document.createElement('body');
      document.documentElement.appendChild(body);
    }
    document.body.innerHTML = '';
  });

  it('body 被换成另一个元素：必须回调我', async () => {
    const onBodyReplaced = vi.fn();
    const observer = observeBody({ onBodyReplaced });

    const next = document.createElement('body');
    document.body.replaceWith(next);
    await flush();

    expect(onBodyReplaced, 'body 换人必须被通知').toHaveBeenCalledTimes(1);
    expect(onBodyReplaced).toHaveBeenCalledWith(next);
    expect(observer.body, '观察者必须跟着换到新 body 上').toBe(next);

    observer.disconnect();
  });

  it('body 被换掉之后：新 body 里的变化必须看得见', async () => {
    const onBodyMutation = vi.fn();
    const observer = observeBody({ onBodyMutation });

    const next = document.createElement('body');
    document.body.replaceWith(next);
    await flush();
    onBodyMutation.mockClear();

    next.appendChild(document.createElement('div'));
    await flush();

    expect(
      onBodyMutation,
      '观察者若还挂在旧 body 上，新 body 里的变化就永远看不见',
    ).toHaveBeenCalledTimes(1);

    observer.disconnect();
  });

  it('body 被换掉之后：旧 body 里的变化不再算数', async () => {
    const onBodyMutation = vi.fn();
    const observer = observeBody({ onBodyMutation });

    const old = document.body;
    const next = document.createElement('body');
    old.replaceWith(next);
    await flush();
    onBodyMutation.mockClear();

    old.appendChild(document.createElement('div'));
    await flush();

    expect(
      onBodyMutation,
      '旧 body 已经脱离文档，它的变化与页面无关',
    ).not.toHaveBeenCalled();

    observer.disconnect();
  });

  it('body 内部的变化：走 body 回调', async () => {
    const onBodyMutation = vi.fn();
    const onHostMutation = vi.fn();
    const observer = observeBody({ onBodyMutation, onHostMutation });

    document.body.appendChild(document.createElement('div'));
    await flush();

    expect(onBodyMutation).toHaveBeenCalledTimes(1);
    expect(
      onHostMutation,
      'body 内部的变化不该惊动 <html> 那一层',
    ).not.toHaveBeenCalled();

    observer.disconnect();
  });

  it('我们自己的浮层（挂在 <html> 上）：不算 body 的变化', async () => {
    // ⚠️ 这是整个工具最要紧的一条不变量。
    //
    // 我们的浮层（控制条、全屏背板、调速胶囊、提示卡）全都挂在 <html> 上
    // （见 viewportRoot.ts）。若这一层被算成「DOM 变化」，
    // 注册表的变更代次每次浮层显隐都前进一次 ——
    // 6.2.0 那套「测量结果按帧复用」的优化就被打回原形。
    const onBodyMutation = vi.fn();
    const onHostMutation = vi.fn();
    const observer = observeBody({ onBodyMutation, onHostMutation });

    const overlay = document.createElement('div');
    document.documentElement.appendChild(overlay);
    await flush();

    expect(
      onBodyMutation,
      '挂在 <html> 上的浮层不该被当成 body 的变化',
    ).not.toHaveBeenCalled();
    expect(
      onHostMutation,
      '但 <html> 这一层必须能收到通知（浮层被摘掉时要重建）',
    ).toHaveBeenCalled();

    overlay.remove();
    await flush();

    expect(onBodyMutation).not.toHaveBeenCalled();

    observer.disconnect();
  });

  it('body 被整个拿掉：也要回调（body 变成 null）', async () => {
    const onBodyReplaced = vi.fn();
    const observer = observeBody({ onBodyReplaced });

    document.body.remove();
    await flush();

    expect(onBodyReplaced).toHaveBeenCalledTimes(1);
    expect(onBodyReplaced).toHaveBeenCalledWith(null);
    expect(observer.body).toBeNull();

    observer.disconnect();
  });

  it('disconnect 之后不再有任何回调', async () => {
    const onBodyMutation = vi.fn();
    const onBodyReplaced = vi.fn();
    const onHostMutation = vi.fn();
    const observer = observeBody({ onBodyMutation, onBodyReplaced, onHostMutation });

    observer.disconnect();

    document.body.appendChild(document.createElement('div'));
    const next = document.createElement('body');
    document.body.replaceWith(next);
    await flush();

    expect(onBodyMutation).not.toHaveBeenCalled();
    expect(onBodyReplaced).not.toHaveBeenCalled();
    expect(onHostMutation).not.toHaveBeenCalled();
  });
});
