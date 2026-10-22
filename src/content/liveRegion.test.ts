import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, announceThrottled, destroyLiveRegion, prepareLiveRegion } from './liveRegion';

/**
 * 读屏播报通道。
 *
 * 这是产品**唯一**对读屏用户可用的反馈路径（调速胶囊、首次引导、接管失败
 * 提示全是纯视觉元素），所以它的每条行为都要守住 —— 它坏了没有任何
 * 视觉信号能暴露出来，只有读屏用户会觉得"按了键什么都没发生"。
 */

const REGION_ID = 'vsc-live-region';

const region = () => document.getElementById(REGION_ID);

/**
 * 数 live region 被写了几次 —— 每次写入对应一次读屏播报。
 *
 * ⚠️ 必须**同步**地数：MutationObserver 的回调是微任务，
 * 断言前若没把微任务排空，读到的会是 0 —— 那种断言永远不会红，
 * 是一道假守卫。所以这里直接包住 `textContent` 的 setter。
 *
 * ⚠️ 为什么非要数「写入次数」而不是看最终文本：`announce()` 自己就是
 * 「清空 → 50ms 后写回」，所以重播一次之后**最终文本和不重播完全一样**。
 * 只有写入次数能区分「没播」与「播了又写回」。
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

/**
 * 记下 live region 被写进去的**每一条**文本（按写入顺序）。
 *
 * 与 countWrites 同源的同步计数法 —— 必须包住 setter，MutationObserver
 * 的回调是微任务，断言前没排空微任务的话读到的是 0。
 */
const recordWrites = (run: () => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  if (!descriptor?.set) {
    throw new Error('拿不到 textContent 的 setter');
  }

  const values: string[] = [];
  Object.defineProperty(Node.prototype, 'textContent', {
    ...descriptor,
    set(this: Node, value: string) {
      if (this instanceof HTMLElement && this.id === REGION_ID && value) {
        values.push(value);
      }
      descriptor.set!.call(this, value);
    },
  });

  try {
    run();
  } finally {
    Object.defineProperty(Node.prototype, 'textContent', descriptor);
  }

  return values;
};

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
    // 第二条要排队等第一条让位（见下面「后来的消息不能顶掉前一条」那条）。
    vi.advanceTimersByTime(1000);
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
    announce('1.5x'); // 制造一个待写回的定时器
    announce('2x'); // 新消息排队

    vi.advanceTimersByTime(1000);
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
   * live region 必须**先存在、内容后变**。
   *
   * aria-live 的通行要求：区域先进入无障碍树，内容再变。
   * 惰性创建的话，第一次播报是「插入一个带内容的节点」—— 部分读屏器
   * （尤其 VoiceOver / JAWS 的某些配置）根本不播报首条内容。而那条首条
   * 恰恰是整个产品对读屏用户最重要的确认（「按了 `=` 之后生效没有」）。
   */
  it('prepareLiveRegion 提前建好一个空的 live region', () => {
    prepareLiveRegion();

    const element = region();
    expect(element, 'live region 必须先存在').not.toBeNull();
    expect(element!.textContent, '建的时候必须是空的（内容后变）').toBe('');
    expect(element!.getAttribute('role')).toBe('status');
    expect(element!.getAttribute('aria-live')).toBe('polite');
  });

  /**
   * 串行队列：两条消息不能互相顶掉。
   *
   * 这是产品的**功能**问题，不是体验问题：写入即替换时，后来的引导文案
   * 会把先前的倍速播报**整段**顶掉，读屏用户按了 `=` 之后什么都没听到。
   */
  describe('串行队列', () => {
    it('后来的消息不能立刻顶掉前一条', () => {
      announce('播放速度 1.1x');
      expect(region()!.textContent).toBe('播放速度 1.1x');

      announce('网页全屏 · f');
      expect(region()!.textContent, '后来的消息不能立刻顶掉前一条').toBe('播放速度 1.1x');

      vi.advanceTimersByTime(1000);
      expect(region()!.textContent, '队列轮到第二条时才上屏').toBe('网页全屏 · f');
    });

    it('按到达顺序播', () => {
      // 顺序不能乱：每一条都要真的上过屏，而且次序与到达次序一致。
      const seen = recordWrites(() => {
        announce('第一条');
        announce('第二条');
        announce('第三条');
        vi.advanceTimersByTime(3000);
      });

      expect(seen).toEqual(['第一条', '第二条', '第三条']);
    });

    it('长文案不会把后面的短文案饿死', () => {
      // 首次引导那四行很长。队列的占位时长是固定的，所以它最多只让后面
      // 那条短文案等一小会儿 —— 不会被无限期压住。
      announce('网页全屏 · f\n= / - 调速\n点扩展图标可进入网页全屏\n全部快捷键可在扩展设置里改绑（右键扩展图标 → 选项）');
      announce('已暂停');

      vi.advanceTimersByTime(2000);
      expect(region()!.textContent, '短文案必须排到长文案后面并被播出来').toBe('已暂停');
    });

    it('节流播报与普通播报共用同一条队列', () => {
      announceThrottled('播放速度 1.1x');
      announce('已进入网页全屏');

      expect(region()!.textContent, '普通播报不能顶掉节流播报').toBe('播放速度 1.1x');

      vi.advanceTimersByTime(1000);
      expect(region()!.textContent).toBe('已进入网页全屏');
    });

    it('普通播报会作废攒着的节流文本（不能延迟补播一条过期的倍速）', () => {
      announceThrottled('播放速度 1.1x'); // 立刻播
      vi.advanceTimersByTime(200);
      announceThrottled('播放速度 1.2x'); // 攒下，等窗口结束
      announce('已暂停'); // 非节流消息插进来

      vi.advanceTimersByTime(2000);
      // 那条过期的 1.2x 不能在 1 秒后才被补播出来。
      expect(region()!.textContent).toBe('已暂停');
    });

    it('非节流消息打断这一串节流播报之后，下一条节流播报重新起算', () => {
      announceThrottled('播放速度 1.1x'); // 立刻播
      vi.advanceTimersByTime(100);
      announce('已暂停'); // 非节流消息打断这一串
      vi.advanceTimersByTime(600); // 队列排空，通道空着

      const writes = countWrites(() => {
        // 同一个倍速，但这一串被打断过 → 应当重新播一遍。
        announceThrottled('播放速度 1.1x');
        vi.advanceTimersByTime(3000);
      });

      expect(writes, '打断之后同一个倍速应当重新播报').toBeGreaterThan(0);
    });
  });

  /**
   * 连续变化的播报必须节流。
   *
   * `aria-live="polite"` 不是「丢弃」，而是**排队** —— 读屏用户会一条一条
   * 听下去。连按加速时每 120ms 就有一个新值，排队速度远快于朗读速度，
   * 队列会无界增长：用户松开键之后，读屏还在念一分钟前的 1.3 倍、1.4 倍。
   */
  describe('announceThrottled', () => {
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

    it('值没变时不重复播报（写入次数不增加）', () => {
      // ⚠️ 只看最终 textContent 区分不了「没播」与「播了又写回」：
      // announce() 自己就是「清空 → 延迟后写回」，重播一次之后最终文本
      // 与不重播**完全一样**。只有写入次数能区分。
      const writes = countWrites(() => {
        announceThrottled('播放速度 1.1x');
        announceThrottled('播放速度 1.1x');
        vi.advanceTimersByTime(2000);
      });

      // 第一次播报写一次；第二个 1.1x 是同一个值，不该再写。
      // 变异验证：删掉 `pending === lastThrottledText` 那半个条件 → 3 次写入。
      expect(writes, '同一个值不该被重复播报').toBe(1);
    });

    it('节流窗口到期后，紧跟着的那次播报仍然走节流（不插播）', () => {
      // 关键：窗口到期那一刻起算**新的** 1 秒窗口。
      // 若节流回调没有更新 lastThrottledAt，`now - lastThrottledAt` 还是
      // 旧窗口的长度 → 下一条会被当成「间隔够了」而**立刻**播报，
      // 读屏用户连着听两句。
      announceThrottled('播放速度 1.1x'); // 立刻播
      vi.advanceTimersByTime(200);
      announceThrottled('播放速度 1.2x'); // 攒下，等窗口结束

      vi.advanceTimersByTime(1000); // 窗口到期 → 播报 1.2x
      expect(region()!.textContent).toBe('播放速度 1.2x');

      const writes = countWrites(() => {
        announceThrottled('播放速度 1.3x');
      });

      expect(region()!.textContent, '新窗口里的第一条不该立刻播').toBe('播放速度 1.2x');
      expect(writes, '新窗口里的第一条不该写进 live region').toBe(0);
    });

    it('一个节流窗口里只挂一个计时器', () => {
      // 窗口内连着按 7 次，若每次都挂一个计时器，就会攒出 7 个回调同时落地。
      // 它们最终只会播一条（第一个回调把 pending 取走，其余拿到 null），
      // 所以**写入次数**区分不出来 —— 只有「挂了几个计时器」能区分。
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      announceThrottled('播放速度 1.1x'); // 立刻播（文本不同，不会再挂重播计时器）
      setTimeoutSpy.mockClear();

      for (let i = 2; i <= 8; i += 1) {
        announceThrottled(`播放速度 ${(1 + i * 0.1).toFixed(1)}x`);
        vi.advanceTimersByTime(120);
      }

      expect(setTimeoutSpy, '一个窗口里只该挂一个节流计时器').toHaveBeenCalledTimes(1);
    });

    it('立即播报时要把攒着的那条作废（不能补播过期值）', () => {
      // 场景：窗口末尾的那一次调速走了「立刻播报」分支，
      // 而上一条还攒在 pending 里。若不作废，窗口到期的定时器会把那条
      // **过期**的值再播一遍 —— 用户听到的是自己早就调掉的倍速。
      const t0 = Date.now();
      announceThrottled('播放速度 1.1x'); // 立刻播

      vi.advanceTimersByTime(200);
      announceThrottled('播放速度 1.2x'); // 攒下，计时器挂在窗口末尾

      // 只挪时钟、不跑定时器：让「立刻播报」分支先于那个计时器落地。
      vi.setSystemTime(t0 + 1000);
      announceThrottled('播放速度 1.3x'); // elapsed == 1000 → 立刻播报分支
      expect(region()!.textContent).toBe('播放速度 1.3x');

      // 现在让那个还挂着的计时器落地。
      vi.runAllTimers();

      // 过期的那条不该被补播。
      expect(region()!.textContent, '过期值不能盖住最新值').toBe('播放速度 1.3x');
    });
  });
});
