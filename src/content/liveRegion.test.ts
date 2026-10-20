import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, destroyLiveRegion } from './liveRegion';

/**
 * 读屏播报通道。
 *
 * 这是产品**唯一**对读屏用户可用的反馈路径（调速胶囊、首次引导、接管失败
 * 提示全是纯视觉元素），所以它的每条行为都要守住 —— 它坏了没有任何
 * 视觉信号能暴露出来，只有读屏用户会觉得"按了键什么都没发生"。
 */

const REGION_ID = 'vsc-live-region';

const region = () => document.getElementById(REGION_ID);

describe('liveRegion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    destroyLiveRegion();
    vi.useRealTimers();
  });

  it('创建 role=status 的 live region 并写入文本', () => {
    announce('播放速度 1.5x');

    const element = region();
    expect(element, '应当创建播报区域').not.toBeNull();
    expect(element!.textContent).toBe('播放速度 1.5x');
  });

  it('区域必须带 role=status + aria-live=polite', () => {
    // 少了 aria-live，读屏器根本不会读；写成 assertive 会打断用户正在听的内容。
    // 这两个属性是"能不能用"的开关，不是可选修饰。
    announce('x');

    const element = region()!;
    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('aria-live')).toBe('polite');
    expect(element.getAttribute('aria-atomic')).toBe('true');
  });

  it('连续播报不同文本时复用同一个区域', () => {
    // 多个 live region 会让读屏用户听到互相打断的播报。
    announce('1.5x');
    announce('2x');

    expect(document.querySelectorAll(`#${REGION_ID}`).length).toBe(1);
    expect(region()!.textContent).toBe('2x');
  });

  it('重复同一句话时会清空再写回（否则读屏器不播报）', () => {
    // 屏幕阅读器只在**内容发生变化**时播报。把同样的文字再写一遍不算变化，
    // 于是用户连按两次减速到同一个值、或重进同一个提示时，第二次是静默的。
    announce('1.5x');
    expect(region()!.textContent).toBe('1.5x');

    announce('1.5x');
    // 先清空 —— 这就是"制造一次变化"。
    expect(region()!.textContent, '重复播报必须先清空').toBe('');

    vi.advanceTimersByTime(100);
    expect(region()!.textContent, '延迟后必须写回').toBe('1.5x');
  });

  it('重复播报的延迟期间来了新文本，以新文本为准', () => {
    // 先清空、再延迟写回，中间有一个窗口。用户在这 50ms 内又按了一次键，
    // 若旧文本仍会写回，读屏用户听到的就是**过期**的倍速。
    announce('1.5x');
    announce('1.5x');
    announce('2x');

    expect(region()!.textContent).toBe('2x');

    vi.advanceTimersByTime(200);
    expect(region()!.textContent, '过期的重播不能覆盖新文本').toBe('2x');
  });

  it('区域被站点摘掉后能自愈重建', () => {
    // 个别站点会主动清理不认识的外来 DOM。节点被摘走后若继续复用游离引用，
    // 播报会静默失效 —— 而且失效时没有任何视觉线索。
    announce('1.5x');
    region()!.remove();

    announce('2x');

    const rebuilt = region();
    expect(rebuilt, '应当重建播报区域').not.toBeNull();
    expect(rebuilt!.textContent).toBe('2x');
  });

  it('destroy 把节点从文档里摘掉', () => {
    announce('1.5x');
    expect(region()).not.toBeNull();

    destroyLiveRegion();

    expect(region(), 'destroy 之后节点必须离开文档').toBeNull();
  });

  it('destroy 之后再次播报会重建节点，且不会被待播的旧文本污染', () => {
    // destroy 时若有一个待写回的定时器在飞，它的闭包握着**旧节点**。
    // 旧节点已脱离文档，写进去不可见 —— 但必须确认它不会盖住新节点的内容。
    announce('1.5x');
    announce('1.5x'); // 制造一个待写回的定时器
    destroyLiveRegion();

    announce('2x');
    expect(region()!.textContent).toBe('2x');

    vi.advanceTimersByTime(200);
    expect(region()!.textContent, '过期的旧文本不能盖住新内容').toBe('2x');
  });

  it('没有 body 时不抛错', () => {
    // 回归：SVG + foreignObject 文档里 document.body 为 null。
    // 播报是按键路径上的副作用，抛错会把按键一起带崩。
    Object.defineProperty(document, 'body', { value: null, configurable: true });

    try {
      expect(() => announce('1.5x')).not.toThrow();
      expect(region()).toBeNull();
    } finally {
      // 必须放在 finally：断言失败时若跳过还原，覆盖会泄漏给后面所有用例。
      delete (document as unknown as { body?: unknown }).body;
    }
  });
});
