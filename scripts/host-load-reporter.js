/**
 * e2e 的**宿主负载** reporter。
 *
 * ⚠️ 它解决的是一个具体的问题：**「产品坏了」和「机器被压垮了」长得一模一样。**
 *
 * 这套 e2e 的失败，绝大多数长这样：
 *
 *     Error: Test timeout of 30000ms exceeded.
 *
 * 没有断言差异、没有堆栈、没有「期望 X 实际 Y」——
 * 只有一句「超时了」。于是每一次分诊都要从头来一遍：
 * 这是回归吗？还是这台机器正忙？
 *
 * 实测（2026-10-22，本机 load average 一度 96）：
 * 同一套代码连着两次全量跑，失败集合**完全不同**（一次 3 条、一次 7 条，
 * 分布在 5 个互不相干的 spec 里），而把这 5 个 spec 单独串行重跑 —— 24/24 全绿。
 * 结论是「宿主被压垮」，不是「产品坏了」；
 * 但**这个结论每次都要重新挣一遍**，而挣错一次就可能去改产品。
 *
 * 所以把答案直接印在失败旁边：跑完就看到当时的负载、并发度，
 * 以及「该用什么命令做对照复跑」。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatHostLoad, hostLoad, saturation } from './host-load.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 失败用例的最小记录（只留能定位的信息，堆栈已经在 Playwright 的输出里）。
 *
 * ⚠️ 只取**第一行**是不够的：Playwright 的断言错误第一行长这样 ——
 *
 *     Error: expect(received).toBe(expected) // Object.is equality
 *
 * 「期望什么、实际什么」全在**后面几行**。只留第一行等于告诉你
 * 「有个断言挂了」，却没告诉你挂在哪 —— 而这正是失败报告唯一该回答的事。
 * 所以留前几行（够看到 Expected / Received），并设一个总长上限。
 */
const describeFailure = (test, result) => {
  const message = (result.error?.message ?? '')
    .replace(/\u001b?\[\d+m/g, '') // 去掉 ANSI 颜色，免得日志里全是转义序列
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .slice(0, 4)
    .join('\n      ')
    .slice(0, 400);

  return {
    title: test.title,
    file: test.location?.file,
    line: test.location?.line,
    status: result.status,
    error: message,
  };
};

export default class HostLoadReporter {
  constructor() {
    /** 开跑时的快照 —— 失败发生在那之后。 */
    this._start = hostLoad();
    this._end = this._start;
    this._workers = 0;
    this._failures = [];
  }

  onBegin(config) {
    this._start = hostLoad();
    this._workers = config?.workers ?? 0;
    const ratio = saturation(this._start);
    // 机器忙不忙，**跑之前**就说清楚 —— 别让人在结果里才发现。
    console.log(
      `\n[vsc] 宿主负载：${formatHostLoad(this._start)}\n` +
        `[vsc] 本轮 worker 数：${this._workers}` +
        (ratio > 0.75
          ? '（机器已经忙起来了 → 已自动降到 1）'
          : '（机器还宽裕）'),
    );
  }

  onTestEnd(test, result) {
    if (result.status === 'failed' || result.status === 'timedOut') {
      this._failures.push(describeFailure(test, result));
    }
  }

  onEnd(result) {
    this._end = hostLoad();
    const ratio = saturation(this._end);

    // 落一份快照到 test-results/ —— CI 失败时它会跟着 artifact 一起上传，
    // 于是「当时那台机器到底忙不忙」不用再猜。
    const snapshot = {
      startedAt: new Date().toISOString(),
      workers: this._workers,
      start: this._start,
      end: this._end,
      saturation: ratio,
      failures: this._failures,
      total: result?.stats?.expected ?? undefined,
    };
    try {
      const target = resolve(repoRoot, 'test-results', 'host-load.json');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    } catch {
      // 写不进去也不该让整轮测试挂掉 —— 这是诊断信息，不是断言。
    }

    if (this._failures.length === 0) {
      if (ratio > 0.75) {
        console.log(
          `\n[vsc] 本轮全绿，但宿主饱和度 ${ratio.toFixed(2)}（偏高）—— ` +
            '这一轮的时间数据别太当真。',
        );
      }
      return;
    }

    const lines = [
      '',
      '════════════════════════════════════════════════════════════',
      '[vsc] 有失败 —— 先看宿主负载，再决定这是不是「产品坏了」',
      `  跑之前的负载：${formatHostLoad(this._start)}`,
      `  跑完之后的负载：${formatHostLoad(this._end)}`,
      `  本轮 worker 数：${this._workers}`,
      `  失败用例：${this._failures.length} 条`,
      '',
    ];
    for (const failure of this._failures) {
      lines.push(`  · ${failure.file}:${failure.line} ${failure.title}`);
      if (failure.error) lines.push(`      ${failure.error}`);
    }
    lines.push('');
    if (ratio > 0.75) {
      lines.push(
        '  ⚠️ 宿主饱和度 > 0.75 —— **这批失败更可能是机器被压垮，不是产品回归**。',
        '     对照做法：同一批用例单独串行复跑一次（下面那条命令），',
        '     全绿就说明是环境问题，别去改产品。',
        '',
        '       PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright \\',
        '         npx playwright test <失败的 spec> --workers=1',
        '',
        '  ⚠️ 也请确认失败集合**每次都不一样**：',
        '     位置随机 = 环境；位置固定 = 产品。',
      );
    } else {
      lines.push(
        '  宿主不忙 → 更可能是产品回归。',
        '  单跑是绿、全量是红时，先构造一个能稳定复现的条件再改产品',
        '  （见 docs/ARCHITECTURE.md 的判据 13）。',
      );
    }
    lines.push('════════════════════════════════════════════════════════════');
    console.log(lines.join('\n'));
  }
}
