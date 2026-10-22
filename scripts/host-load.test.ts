/**
 * 「宿主负载 → worker 数」这条决策的守卫。
 *
 * ⚠️ 为什么这个决策要有测试：它决定了 e2e 会不会在忙着的机器上**随机翻车**。
 * 而「随机翻车」这件事的代价不是慢，是**误导**——
 * 失败长得和「产品坏了」一模一样，于是人会去改产品。
 *
 * 实测（2026-10-22）：同一套代码连着两次全量跑，失败集合完全不同
 * （3 条 / 7 条，分布在 5 个互不相干的 spec 里），
 * 而这 5 个 spec 单独串行重跑 24/24 全绿 —— 结论是宿主被压垮。
 * 那次 load average 是 96。
 */
import { describe, expect, it } from 'vitest';
import { formatHostLoad, hostLoad, saturation, suggestWorkers } from './host-load.mjs';

/** 造一份负载快照。 */
const snapshot = (cpuCount: number, one: number, five = one) => ({
  cpuCount,
  one,
  five,
  fifteen: five,
});

const withEnv = (value: string | undefined, run: () => void) => {
  const previous = process.env.VSC_E2E_WORKERS;
  if (value === undefined) {
    delete process.env.VSC_E2E_WORKERS;
  } else {
    process.env.VSC_E2E_WORKERS = value;
  }
  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.VSC_E2E_WORKERS;
    } else {
      process.env.VSC_E2E_WORKERS = previous;
    }
  }
};

describe('宿主负载 → e2e 并发度', () => {
  it('机器宽裕时用 2 个 worker（沿用验证过的值）', () => {
    withEnv(undefined, () => {
      // 12 核、负载 2 → 饱和度 0.17
      expect(suggestWorkers(snapshot(12, 2))).toBe(2);
      // CI 的 4 核 runner，负载 0.5
      expect(suggestWorkers(snapshot(4, 0.5))).toBe(2);
    });
  });

  it('机器已经被压垮时降到 1 个 worker', () => {
    withEnv(undefined, () => {
      // 实测那台机器：12 核、负载 96
      expect(suggestWorkers(snapshot(12, 96))).toBe(1);
      // 刚安静下来但 5 分钟均值还高 → 也要降（看的是 max(one, five)）
      expect(suggestWorkers(snapshot(12, 3, 40))).toBe(1);
    });
  });

  it('饱和度 = max(1 分钟, 5 分钟) 负载 ÷ 核数', () => {
    expect(saturation(snapshot(12, 6))).toBeCloseTo(0.5, 5);
    expect(saturation(snapshot(12, 2, 9))).toBeCloseTo(0.75, 5);
    // 核数至少按 1 算，不许除以 0
    expect(saturation(snapshot(1, 1))).toBeCloseTo(1, 5);
  });

  it('VSC_E2E_WORKERS 显式覆盖一切（CI 靠它钉死并发度）', () => {
    withEnv('4', () => {
      expect(suggestWorkers(snapshot(12, 96))).toBe(4);
    });
    withEnv('1', () => {
      expect(suggestWorkers(snapshot(12, 0.2))).toBe(1);
    });
  });

  it('覆盖值不合法时退回「按负载算」，而不是照单全收', () => {
    // 写错一个字符就变成 NaN → worker 数变成 NaN → Playwright 直接报错。
    for (const bad of ['', 'abc', '0', '-1', '2.5']) {
      withEnv(bad, () => {
        const workers = suggestWorkers(snapshot(12, 96));
        expect(Number.isInteger(workers), `「${bad}」不该变成 ${workers}`).toBe(true);
        expect(workers).toBe(1);
      });
    }
  });

  it('真实机器的快照能算出一个合理的并发度（不许 NaN / 不许 > 核数）', () => {
    const real = hostLoad();
    expect(real.cpuCount).toBeGreaterThan(0);
    expect(Number.isFinite(real.one)).toBe(true);

    const workers = suggestWorkers(real);
    expect(Number.isInteger(workers)).toBe(true);
    expect(workers).toBeGreaterThanOrEqual(1);
    expect(workers).toBeLessThanOrEqual(real.cpuCount);
  });

  it('负载快照能被人读懂（失败时要印在报告旁边）', () => {
    const text = formatHostLoad(snapshot(12, 96, 79, 70));
    expect(text).toContain('12 核');
    expect(text).toContain('96.00');
    expect(text).toContain('79.00');
    expect(text).toContain('饱和度');
  });
});
