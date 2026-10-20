import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setSubtitleOffset,
  restoreSubtitleOffset,
  restoreAllSubtitleOffsets,
} from './subtitleOffset';

describe('字幕避让位移', () => {
  beforeEach(() => {
    restoreAllSubtitleOffsets();
    document.body.innerHTML = '';
  });

  /**
   * 站点自己的 transform 必须活下来。
   *
   * 字幕是**站点自己的节点**。站点常在它身上写 transform（垂直居中用
   * `translateY(-50%)`、入场动画用 `scale()`）。我们退出全屏时只该撤掉
   * **我们加的那部分**位移 —— 早先的实现是 `removeProperty('transform')`，
   * 把站点的位移一起抹了，于是「退出全屏后字幕歪了」。
   */
  it('撤销位移时保留站点自己的 transform', () => {
    const caption = document.createElement('div');
    caption.style.setProperty('transform', 'translateY(-50%)');
    document.body.appendChild(caption);

    setSubtitleOffset(caption, 40);
    expect(caption.style.transform).toContain('translateY(-40px)');
    expect(caption.style.transform).toContain('translateY(-50%)');

    restoreSubtitleOffset(caption);
    expect(caption.style.transform).toBe('translateY(-50%)');
  });

  /**
   * ⚠️ 这条是**语义**断言，不是字符串相等。
   *
   * jsdom 的 `getComputedStyle().transform` 返回**未解析的** `translateY(-50%)`，
   * 真实 Chrome 返回**已解析的** `matrix(1, 0, 0, 1, 0, -50)`。
   * 早先这里断言的是字符串相等，于是：
   * - 在 jsdom 里通过（未解析）
   * - 在真实浏览器里必然失败（已解析）
   * 换句话说，这条断言在真浏览器下是**假**的。
   *
   * 现在断言的是「站点那条规则还在、且没有被像素值顶掉」——
   * 这条在两个环境里都成立，且**必须**成立。
   */
  it('撤销位移时不得用计算值顶掉站点样式表里的 transform', () => {
    const caption = document.createElement('div');
    document.body.appendChild(caption);

    // 模拟"站点把 transform 写在样式表里"：jsdom 里 getComputedStyle
    // 读不到样式表，所以直接 stub 出**已解析**的计算值 —— 与真实 Chrome 一致。
    const computed = vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: 'matrix(1, 0, 0, 1, -320, 0)' }) as CSSStyleDeclaration,
    );

    try {
      setSubtitleOffset(caption, 40);
      // 加位移时基准取计算值：站点在样式表里的 transform 不会丢。
      expect(caption.style.transform).toContain('matrix(1, 0, 0, 1, -320, 0)');
      expect(caption.style.transform).toContain('translateY(-40px)');

      restoreSubtitleOffset(caption);

      // ⚠️ 核心断言：还原后**不能**留下那个 matrix。
      // 留下就等于把站点样式表里那条 `translateX(-50%)` 永久顶成像素值 ——
      // 容器一变宽，站点的居中就再也不重算了。
      expect(caption.style.getPropertyValue('transform')).toBe('');
      expect(caption.style.getPropertyValue('transform')).not.toContain('matrix');
    } finally {
      computed.mockRestore();
    }
  });

  /**
   * 站点写的是**内联** transform 且带百分比时，还原必须原样写回。
   *
   * 不能写回计算值：站点的 `translateX(-50%)` 会跟着容器宽度重算，
   * 写回 `matrix(..., -320, 0)` 就把它的百分比语义永久钉死了。
   */
  it('站点内联 transform 带百分比时，原样写回而不是写回计算值', () => {
    const caption = document.createElement('div');
    caption.style.setProperty('transform', 'translateX(-50%)');
    document.body.appendChild(caption);

    const computed = vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: 'matrix(1, 0, 0, 1, -320, 0)' }) as CSSStyleDeclaration,
    );

    try {
      setSubtitleOffset(caption, 40);
      restoreSubtitleOffset(caption);

      // 必须还是站点自己写的那条百分比规则。
      expect(caption.style.getPropertyValue('transform')).toBe('translateX(-50%)');
      expect(caption.style.getPropertyValue('transform')).not.toContain('matrix');
    } finally {
      computed.mockRestore();
    }
  });

  /** 原本没有内联 transform 时，撤销后整个属性消失，样式表重新接管。 */
  it('原本没有 transform 时，撤销后属性被删除', () => {
    const caption = document.createElement('div');
    document.body.appendChild(caption);

    setSubtitleOffset(caption, 40);
    expect(caption.style.transform).not.toBe('');

    restoreSubtitleOffset(caption);
    expect(caption.style.getPropertyValue('transform')).toBe('');
  });

  /** 反复加/撤不能让位移累积（否则字幕会一路飘上去）。 */
  it('反复调用不会累积位移', () => {
    const caption = document.createElement('div');
    document.body.appendChild(caption);

    setSubtitleOffset(caption, 40);
    setSubtitleOffset(caption, 40);
    setSubtitleOffset(caption, 40);

    restoreSubtitleOffset(caption);
    expect(caption.style.getPropertyValue('transform')).toBe('');
  });

  /**
   * 位移变化时要从**基准值**重算，而不是在上一次的结果上再叠一层。
   *
   * 控制条的高度会随内容变化（时间变长、菜单展开），避让高度也跟着变。
   * 如果实现是「在当前 transform 上追加」，第二次就会变成两倍位移。
   */
  it('位移变化时从基准值重算，不在上一次结果上叠加', () => {
    const caption = document.createElement('div');
    document.body.appendChild(caption);

    setSubtitleOffset(caption, 40);
    setSubtitleOffset(caption, 25);

    // 只能有一个我们自己的 translateY(-25px)，不能是 -40 与 -25 叠加。
    const matches = caption.style.transform.match(/translateY\(-25px\)/g) ?? [];
    expect(matches.length).toBe(1);
    expect(caption.style.transform).not.toContain('translateY(-40px)');
  });

  /**
   * 加位移时用 !important：站点的 transform 可能也带 !important。
   *
   * 站点用 `!important` 写 transform 的情况很常见（主题切换、媒体查询）。
   * 我们用普通内联写位移，会被站点那条整个吃掉 —— 字幕在全屏里不抬起来，
   * 被控制条盖住。
   */
  it('加位移时用 important，压过站点自己的 important 规则', () => {
    const caption = document.createElement('div');
    document.body.appendChild(caption);

    setSubtitleOffset(caption, 40);

    expect(caption.style.getPropertyPriority('transform')).toBe('important');
  });

  /**
   * 还原时必须**恢复站点自己的优先级**。
   *
   * 站点写的是 `transform: x !important` 时，我们撤位移后必须把它自己的
   * `!important` 还回去 —— 撤成普通优先级会让它被样式表里的普通规则接管，
   * 效果可能不一样。
   */
  it('还原时恢复站点自己的 important 优先级', () => {
    const caption = document.createElement('div');
    caption.style.setProperty('transform', 'translateY(-50%)', 'important');
    document.body.appendChild(caption);

    setSubtitleOffset(caption, 40);
    restoreSubtitleOffset(caption);

    expect(caption.style.getPropertyPriority('transform')).toBe('important');
    expect(caption.style.getPropertyValue('transform')).toBe('translateY(-50%)');
  });

  /** 撤销不认识的节点不能抛错。 */
  it('撤销没登记过的节点不会抛错', () => {
    const caption = document.createElement('div');
    expect(() => restoreSubtitleOffset(caption)).not.toThrow();
  });

  /** 脱离文档的节点直接跳过 —— 站点可能在全屏期间把字幕节点换掉。 */
  it('已脱离文档的节点被跳过', () => {
    const caption = document.createElement('div');
    document.body.appendChild(caption);
    caption.remove();

    expect(() => setSubtitleOffset(caption, 40)).not.toThrow();
    expect(caption.style.transform).toBe('');
  });
});
