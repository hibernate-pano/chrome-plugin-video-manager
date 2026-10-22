import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { closestSelector, matchesSelector, probeClosest } from './domMatches';

/**
 * 「页面可以把 DOM 原型改坏」这件事的守卫。
 *
 * ⚠️ 为什么这个模块值得自己一份测试：它是**两份**核心判定的共同底座
 * ——「站点有没有点名这条视频」（决定接管与引导）
 * 与「用户当时点的是哪条视频」（决定证据）。
 * 两边都在「装饰性预览」这条核心路径上，抛异常的后果是
 * **整个扩展静默失灵**（用户看到的是「按了没反应」）。
 *
 * 退化方向必须一致：**判不出来就当「不匹配 / 没有」** ——
 * 少一条豁免、少一条证据，而不是把整条链路带崩。
 */
describe('选择器匹配（页面可以把原型改坏）', () => {
  /** 把 Element.prototype.matches 换成会抛异常的版本。 */
  const breakMatches = () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'matches');
    Object.defineProperty(Element.prototype, 'matches', {
      value: () => {
        throw new Error('页面把 matches 改坏了');
      },
      configurable: true,
      writable: true,
    });
    return () => {
      if (original) {
        Object.defineProperty(Element.prototype, 'matches', original);
      }
    };
  };

  /** 把 Element.prototype.closest 换成会抛异常的版本。 */
  const breakClosest = () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'closest');
    Object.defineProperty(Element.prototype, 'closest', {
      value: () => {
        throw new Error('页面把 closest 改坏了');
      },
      configurable: true,
      writable: true,
    });
    return () => {
      if (original) {
        Object.defineProperty(Element.prototype, 'closest', original);
      }
    };
  };

  it('正常情况：匹配与不匹配', () => {
    const div = document.createElement('div');
    expect(matchesSelector(div, 'div')).toBe(true);
    expect(matchesSelector(div, 'span')).toBe(false);
  });

  it('页面把 matches 改坏时：判成「不匹配」，而不是抛出去', () => {
    const restore = breakMatches();
    try {
      const div = document.createElement('div');
      expect(() => matchesSelector(div, 'div')).not.toThrow();
      expect(matchesSelector(div, 'div')).toBe(false);
    } finally {
      restore();
    }
  });

  it('页面提供的 safeMatches 自己抛异常时：同样判成「不匹配」', () => {
    const div = document.createElement('div') as Element & {
      safeMatches?: (selector: string) => boolean;
    };
    div.safeMatches = () => {
      throw new Error('页面提供的 safeMatches 也抛');
    };
    expect(() => matchesSelector(div, 'div')).not.toThrow();
    expect(matchesSelector(div, 'div')).toBe(false);
  });

  it('closest 正常：沿祖先链找到第一个匹配的', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('span');
    outer.appendChild(inner);
    expect(closestSelector(inner, 'div')).toBe(outer);
    expect(closestSelector(inner, 'section')).toBeNull();
  });

  it('页面把 closest 改坏时：判成「没有」，而不是抛出去', () => {
    const restore = breakClosest();
    try {
      const div = document.createElement('div');
      expect(() => closestSelector(div, 'div')).not.toThrow();
      expect(closestSelector(div, 'div')).toBeNull();
    } finally {
      restore();
    }
  });

  it('页面把 closest 整个删掉时：判成「没有」', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'closest');
    // @ts-expect-error —— 故意模拟「页面删掉了这个原型方法」
    delete Element.prototype.closest;
    try {
      const div = document.createElement('div');
      expect(() => closestSelector(div, 'div')).not.toThrow();
      expect(closestSelector(div, 'div')).toBeNull();
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, 'closest', original);
      }
    }
  });

  it('probeClosest 是三态：找到了 / 确实没有 / 判不出来', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('span');
    outer.appendChild(inner);

    expect(probeClosest(inner, 'div')).toBe('found');
    expect(probeClosest(inner, 'section')).toBe('absent');

    const restore = breakClosest();
    try {
      expect(probeClosest(inner, 'div')).toBe('unknown');
    } finally {
      restore();
    }
  });

  it('生产代码里不许有裸调的 matches / closest（必须走带 try/catch 的那一份）', () => {
    // ⚠️ 这条是**结构守卫**，不是行为守卫：
    // 它守的是「以后新写的代码会不会又裸调一次」。
    //
    // 为什么值得守：`matches` 与 `closest` 都是**页面能改坏**的原型方法，
    // 而它们出现在核心路径上（接管判定 / 引导证据 / 字幕层探测）。
    // 每加一处裸调，就多一个「页面一改坏、整个扩展静默失灵」的入口 ——
    // 而那种失败用户完全看不出来（他只看到「按了没反应」）。
    const root = resolve(__dirname, '..');
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        // 测试文件自己会裸调（它们就是要模拟被改坏的样子）。
        if (entry.endsWith('.test.ts')) continue;
        // 这份模块本身就是「那份带 try/catch 的实现」。
        if (full.endsWith(join('shared', 'domMatches.ts'))) continue;

        // ⚠️ 先去掉注释再扫：注释里会写「Element.prototype.closest」这种
        // 说明文字（而那恰恰是**最该出现**这些字的地方）。
        const source = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');

        source.split('\n').forEach((line, index) => {
          // 只认**调用**：`\.closest(` / `\.closest?.(`。
          // 属性读取不算 —— `typeof el.closest !== 'function'` 是防御性检查，
          // `window.matchMedia(...).matches` 是 MediaQueryList 的属性，
          // 两者都不是「拿页面的原型方法去判元素」。
          if (/\.(matches|closest)\s*\.?\s*\(/.test(line)) {
            offenders.push(`${relative(root, full)}:${index + 1}  ${line.trim()}`);
          }
        });
      }
    };

    walk(root);

    expect(
      offenders,
      `生产代码里出现了裸调的 matches / closest：\n${offenders.join('\n')}\n` +
        '它们必须走 src/shared/domMatches.ts —— 页面能把这两个原型方法改坏。',
    ).toEqual([]);
  });
});
