import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyLiveRegion } from './liveRegion';
import { TransientPill } from './transientPill';
import { resetExtensionDom } from './testDom';

const PILL_ID = 'vsc-test-pill';
const LIVE_REGION_ID = 'vsc-live-region';

/**
 * 一次性文字提示的公共骨架。
 *
 * 两个使用方：首次使用引导、全屏接管失败提示。两者都是**产品唯一的告知渠道**
 * —— 页面上除了这一块贴片之外没有任何别的地方会告诉用户「发生了什么」。
 */

describe('TransientPill', () => {
  let pill: TransientPill;

  beforeEach(() => {
    vi.useFakeTimers();
    resetExtensionDom();
    pill = new TransientPill({
      id: PILL_ID,
      visibleClass: 'vsc-visible',
      duration: 1000,
    });
  });

  afterEach(() => {
    pill.destroy();
    destroyLiveRegion();
    vi.useRealTimers();
  });

  it('显示文本并加上可见类', () => {
    expect(pill.show('接管失败')).toBe(true);

    const root = document.getElementById(PILL_ID)!;
    expect(root.textContent).toBe('接管失败');
    expect(root.classList.contains('vsc-visible')).toBe(true);
  });

  it('必须通过 live region 播报（它是产品唯一的读屏反馈通道）', () => {
    // 视觉节点本身是 aria-hidden 的纯视觉元素，读屏用户从中得不到任何信息。
    // liveRegion.ts 的注释写着这是产品**唯一**对读屏用户可用的反馈路径 ——
    // 删掉 announce(text) 这一行，读屏用户按了键什么也听不到，
    // 而且**没有任何视觉症状**（提示照样显示）。
    pill.show('接管失败');

    const region = document.getElementById(LIVE_REGION_ID);
    expect(region, '必须有 live region').not.toBeNull();
    expect(region!.textContent).toBe('接管失败');
  });

  it('announce: false 时不播报', () => {
    const silent = new TransientPill({
      id: 'vsc-silent-pill',
      visibleClass: 'vsc-visible',
      duration: 1000,
      announce: false,
    });

    silent.show('安静');

    expect(document.getElementById(LIVE_REGION_ID), 'announce: false 不该建 live region').toBeNull();
    silent.destroy();
  });

  it('视觉节点是 aria-hidden 的（播报走独立的 live region）', () => {
    // 保留 aria-hidden 可以避免某些读屏器在 DOM 变化时把贴片再念一遍 ——
    // 播报已经由 live region 负责了。
    pill.show('接管失败');

    expect(document.getElementById(PILL_ID)!.getAttribute('aria-hidden')).toBe('true');
  });

  it('节点被站点摘掉后能自愈重建', () => {
    // 站点会主动清理不认识的外来 DOM。root 被摘走后继续复用游离引用，
    // 提示会**静默失效** —— 失效时没有任何视觉线索（节点不在文档里，
    // 界面上什么都没有，但代码一切正常）。
    pill.show('第一条');
    const first = document.getElementById(PILL_ID)!;
    first.remove();

    pill.show('第二条');

    const rebuilt = document.getElementById(PILL_ID);
    expect(rebuilt, '应当重建提示节点').not.toBeNull();
    expect(rebuilt, '不能继续复用那个被摘掉的游离节点').not.toBe(first);
    expect(rebuilt!.isConnected).toBe(true);
    expect(rebuilt!.textContent).toBe('第二条');
  });

  it('连续显示复用同一个节点', () => {
    // 每次显示都新建一个节点的话，DOM 里会攒下好几个同 id 的节点，
    // getElementById 只会返回最早那个 —— 用户看到的是**上一次的旧文案**。
    pill.show('第一条');
    pill.show('第二条');

    expect(document.querySelectorAll(`#${PILL_ID}`).length).toBe(1);
    expect(document.getElementById(PILL_ID)!.textContent).toBe('第二条');
  });

  it('连续显示时，上一次的隐藏计时器要作废', () => {
    // 计时器不取消的话，上一次的 hide 会把**这一次**的提示提前隐藏 ——
    // 用户连按两次，第二次的提示刚出现就没了。
    pill.show('第一条', 1000);
    vi.advanceTimersByTime(500);

    pill.show('第二条', 1000);

    // 第一条的计时器本来落在 t=1000；它不该把第二条提前隐藏。
    vi.advanceTimersByTime(600);
    expect(
      document.getElementById(PILL_ID)!.classList.contains('vsc-visible'),
      '上一次的隐藏计时器不该提前把新提示藏掉',
    ).toBe(true);

    // 第二条的计时器落在 t=1500。
    vi.advanceTimersByTime(400);
    expect(document.getElementById(PILL_ID)!.classList.contains('vsc-visible')).toBe(false);
  });

  it('连续显示时先摘掉可见类（让淡入动画每次都能重新开始）', () => {
    // 元素一直是「可见的」的话，opacity 的过渡就不会重新跑 ——
    // 第二次提示是「闪一下」而不是淡入。
    //
    // ⚠️ 用 MutationObserver 的 **takeRecords()** 同步取记录：
    // 观察者的回调是微任务，等它排空再读会读到「什么都没有」。
    pill.show('第一条');
    const root = document.getElementById(PILL_ID)!;

    const records: MutationRecord[] = [];
    const observer = new MutationObserver(() => undefined);
    observer.observe(root, { attributes: true, attributeOldValue: true });

    pill.show('第二条');
    records.push(...observer.takeRecords());
    observer.disconnect();

    // 「摘掉 → 强制回流 → 再加上」是**两次** class 变动。
    // 只判「有没有一条记录提到 vsc-visible」是不够的：jsdom 对
    // classList.add 一个**已经存在**的类也会记一条（oldValue 仍是
    // 'vsc-visible'），那样「压根没摘过」也会蒙混过关。
    expect(records.length, '摘掉 + 重新加上 = 两次 class 变动').toBeGreaterThanOrEqual(2);
    // 第二条记录的 oldValue 是空串 —— 说明那一刻 class 是空的，
    // 也就是**确实被摘掉过**。
    expect(
      records.some((record) => record.oldValue === ''),
      '第二次显示前必须先摘掉可见类',
    ).toBe(true);
  });

  it('没有可挂载的宿主时返回 false 而不是抛错', () => {
    // SVG + foreignObject 这类文档里 document.body 为 null，
    // 裸调 appendChild 会抛 TypeError —— 把按键路径一起带崩。
    const body = document.body;
    body.remove();

    try {
      expect(() => pill.show('接管失败')).not.toThrow();
      expect(pill.show('接管失败')).toBe(false);
    } finally {
      document.documentElement.appendChild(body);
    }
  });
});
