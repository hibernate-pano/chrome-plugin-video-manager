import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, announceThrottled, destroyLiveRegion } from './liveRegion';

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

  /**
   * 连续变化的播报必须节流。
   *
   * `aria-live="polite"` 不是「丢弃」，而是**排队** —— 读屏用户会一条一条
   * 听下去。连按加速时每 120ms 就有一个新值，排队速度远快于朗读速度，
   * 队列会无界增长：用户松开键之后，读屏还在念一分钟前的 1.3 倍、1.4 倍。
   */
  describe('announceThrottled', () => {
    /**
     * 数 live region 被写了几次 —— 每次写入对应一次读屏播报。
     *
     * ⚠️ 必须**同步**地数：MutationObserver 的回调是微任务，
     * 断言前若没把微任务排空，读到的会是 0 —— 那种断言永远不会红，
     * 是一道假守卫。所以这里直接包住 `textContent` 的 setter。
     */
    const countWrites = (run: () => void) => {
      const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      if (!descriptor?.set) {
        throw new Error('拿不到 textContent 的 setter');
      }

      let writes = 0;
      Object.defineProperty(Node.prototype, 'textContent', {
        ...descriptor,
        set(this: Node, value: string) {
          if (this instanceof HTMLElement && this.id === 'vsc-live-region') {
            writes += 1;
          }
          descriptor.set!.call(this, value);
        },
      });

      try {
        run();
      } finally {
        Object.defineProperty(Node.prototype, 'textContent', descriptor);
      }

      return writes;
    };

    it('单次播报立刻生效（轻点一下 `=` 的体验不变）', () => {
      announceThrottled('播放速度 1.1x');

      expect(region()!.textContent).toBe('播放速度 1.1x');
    });

    it('连按调速时不会每次都播报', () => {
      const writes = countWrites(() => {
        // 模拟按住 `=` 一秒：每 120ms 一次（与键盘控制器的连发机制同频）。
        for (let i = 0; i < 8; i += 1) {
          announceThrottled(`播放速度 ${(1 + i * 0.1).toFixed(1)}x`);
          vi.advanceTimersByTime(120);
        }
      });

      // 修复前是 9 次（每次写入都会让读屏念一句）。
      expect(writes, '长按一秒不该产生 9 次播报').toBeLessThanOrEqual(2);
      expect(writes, '守卫本身要能数到写入（否则是假守卫）').toBeGreaterThan(0);
    });

    it('长按结束时播报的是**最新**的值', () => {
      announceThrottled('播放速度 1.1x');

      for (let i = 2; i <= 8; i += 1) {
        announceThrottled(`播放速度 ${(1 + i * 0.1).toFixed(1)}x`);
        vi.advanceTimersByTime(120);
      }

      // 节流窗口到了 → 播最新那个，不是第一个。
      vi.advanceTimersByTime(1000);
      expect(region()!.textContent).toBe('播放速度 1.8x');
    });

    it('值没变时不重复播报', () => {
      announceThrottled('播放速度 1.1x');
      announceThrottled('播放速度 1.1x');

      vi.advanceTimersByTime(2000);
      expect(region()!.textContent).toBe('播放速度 1.1x');
    });
  });
});
