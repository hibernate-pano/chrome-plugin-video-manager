/**
 * 「商店线上版本号」的**内部一致性**守卫。
 *
 * ⚠️ 为什么值得守：线上版本号是**会过期的事实**，而它散落在三份文档里
 * （CHANGELOG.md 头部、CHROMEWEBSTORE.md 的改名说明与版本号自检项）。
 * 一旦过期，后果不是「文档不好看」，而是**让人算错要发什么版本**：
 *
 *   - 真实事故（2026-10-22）：本文件与 CHANGELOG 都写着「线上是 6.0.6」，
 *     而商店里真正跑着的是 6.0.8（v2 API fetchStatus 核实）。
 *     「6.0.8 已发布」这个事实只出现在「版本历史表」里，而那张表的状态列
 *     写的是「In Review」—— 两处各说一半，合起来是错的。
 *   - 更糟的是**版本号门槛**：CWS 拒绝 version ≤ 已发布版本。
 *     如果按「线上是 6.0.6」去判断，会以为 6.0.7 可以重发。
 *
 * ⚠️ 这道守卫能做什么、不能做什么：
 *   - **能**：保证「文档里说的线上版本」在**各处之间**一致，
 *     并且与「版本历史表里标为 Published 的那一行」一致。
 *   - **不能**：判断商店里现在跑着的是哪个版本 —— 那要联网查 API，
 *     属于**发布时的人工动作**（CHROMEWEBSTORE.md 的
 *     「发布前状态核实」那一节就是干这个的）。
 *
 * 所以这道守卫守的是「**别让三处说法各说各话**」，
 * 而「线上到底是几」由 `scripts/store-publish.mjs --dry-run` 旁边那套
 * 人工核实负责 —— 两者缺一不可。
 *
 * ⚠️ **2026-10-23：发布 6.2.0 之后「包版本 == 线上版本」成为常态**
 * （工作树 = 刚发出去的那一版，下一轮才 bump）。
 * 所以「包版本必须**严格高于**线上版本」这条断言放宽成「不低于」——
 * 它守的是「别拿一个比线上旧的版本号去发」；
 * 而「不高于就不许上传」这条更强的保护搬到了
 * `scripts/store-publish.mjs` 上传前那道**版本号闸门**（联网取真实线上版本比对）。
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
const storeDoc = readFileSync(resolve(repoRoot, 'CHROMEWEBSTORE.md'), 'utf8');

/** 从一行文字里抠出版本号（形如 6.0.8）。 */
const versionIn = (text: string): string | null => {
  const match = /\b(\d+\.\d+\.\d+)\b/.exec(text);
  return match ? match[1] : null;
};

/**
 * 找出「线上是 X」「当前线上是 X」这类句子里的版本号。
 *
 * ⚠️ 只认**明确说线上**的句子 —— 像「6.0.8 发布记录」这种标题
 * 说的是历史事件，不是「现在线上是几」。
 */
const statedLiveVersion = (doc: string): string | null => {
  const patterns = [
    /线上(?:版本)?是\s*\*{0,2}(\d+\.\d+\.\d+)/,
    /当前线上\s*(\d+\.\d+\.\d+)/,
    /线上是\s*\*{0,2}(\d+\.\d+\.\d+)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(doc);
    if (match) return match[1];
  }
  return null;
};

describe('商店线上版本号：三处说法必须一致', () => {
  it('CHANGELOG 头部声明的线上版本，与 CHROMEWEBSTORE 里声明的是同一个', () => {
    const fromChangelog = statedLiveVersion(changelog);
    const fromStore = statedLiveVersion(storeDoc);

    expect(fromChangelog, 'CHANGELOG.md 头部没有声明「线上是几」').not.toBeNull();
    expect(fromStore, 'CHROMEWEBSTORE.md 里没有声明「线上是几」').not.toBeNull();

    expect(
      fromChangelog,
      `两份文档说的线上版本不一样：CHANGELOG 说 ${fromChangelog}，` +
        `CHROMEWEBSTORE 说 ${fromStore}。`,
    ).toBe(fromStore);
  });

  it('声明的线上版本，与版本历史表里标为 Published 的最新一行一致', () => {
    const stated = statedLiveVersion(changelog);
    expect(stated).not.toBeNull();

    // 版本历史表：`| 6.0.8 | 2026-10-08 | ... | **Published** |`
    const published = [...storeDoc.matchAll(
      /^\|\s*(\d+\.\d+\.\d+)\s*\|[^|]*\|[^|]*\|\s*\*\*Published\*\*/gm,
    )].map((m) => m[1]);

    expect(
      published.length,
      '版本历史表里找不到标为 **Published** 的行 —— 表格格式变了？',
    ).toBeGreaterThan(0);

    // 标为 Published 的行里，版本号最大的那个就是线上版本。
    const latest = published.sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
    }).at(-1);

    expect(
      stated,
      `文档声明线上是 ${stated}，而版本历史表里最新的 **Published** 是 ${latest}。`,
    ).toBe(latest);
  });

  it('本包版本号不低于线上版本（CWS 拒绝 version ≤ 已发布版本）', () => {
    const stated = statedLiveVersion(changelog);
    expect(stated).not.toBeNull();

    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      version: string;
    };
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'),
    ) as { version: string };

    expect(
      pkg.version,
      'package.json 与 manifest.json 的版本号不一致',
    ).toBe(manifest.version);

    const compare = (a: string, b: string): number => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i += 1) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
      }
      return 0;
    };

    // ⚠️ 这里守的是「**不能低于**」，不是「必须严格高于」。
    //
    // 「包版本 == 线上版本」是一个**合法且必然出现**的状态：
    // 刚把这一版发出去、还没开始下一轮改动时，工作树就等于线上那一版
    // （2026-10-23 发布 6.2.0 之后就是如此）。仓库的版本号是**按审计轮次**
    // 往上 bump 的，下一轮才变成 6.2.1 —— 所以「相等」不是错误，是常态。
    //
    // 那「别上传一个不高于线上的版本号」这条保护去哪了？
    // → 落在 `scripts/store-publish.mjs` 上传前的那道**版本号闸门**：
    //   它在上传前做一次只读的 fetchStatus，拿**真实**的线上版本做判据，
    //   不通过就拒绝上传。那才是这道保护该待的地方 ——
    //   文档守卫只能证明「文档说法一致」，证明不了「线上到底是几」。
    expect(
      compare(pkg.version, stated as string),
      `本包版本 ${pkg.version} 低于线上版本 ${stated} —— CWS 会拒绝上传。`,
    ).toBeGreaterThanOrEqual(0);
  });

  it('「已发布」与「从未发布」的版本清单不重叠', () => {
    // CHANGELOG 头部有一句「X / Y 都还没有单独发布过」。
    // 那句话里点名的版本号，不能同时出现在版本历史表的 **Published** 行里。
    const unpublishedSentence = /都还没有单独发布过[^\n]*/.exec(changelog);
    expect(unpublishedSentence, 'CHANGELOG 头部那句话不见了').not.toBeNull();

    const claimed = [
      ...(unpublishedSentence as RegExpExecArray)[0].matchAll(/\d+\.\d+\.\d+/g),
    ].map((m) => m[0]);

    const published = new Set(
      [...storeDoc.matchAll(
        /^\|\s*(\d+\.\d+\.\d+)\s*\|[^|]*\|[^|]*\|\s*\*\*Published\*\*/gm,
      )].map((m) => m[1]),
    );

    for (const version of claimed) {
      expect(
        published.has(version),
        `CHANGELOG 说 ${version} 从未发布过，但版本历史表里它标着 **Published**。`,
      ).toBe(false);
    }
  });

  it('改动过的三处版本陈述，日期标注都是核实过的', () => {
    // 「线上是 X」这句话后面应该跟着一个核实日期 ——
    // 没有日期，说明它是**凭记忆写的**，而记忆是会过期的。
    const line = changelog.split('\n').find((l) => /线上(?:版本)?是\s*\*{0,2}\d+\.\d+\.\d+/.test(l));
    expect(line, 'CHANGELOG 里找不到「线上是 X」那一行').toBeDefined();

    expect(
      line as string,
      '「线上是 X」这句话没有标注核实日期 —— ' +
        '它会像 2026-10-21 那次一样悄悄过期（当时写的是 6.0.6，实际是 6.0.8）。',
    ).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

/**
 * 为什么单独导出这个 helper：
 * 别的守卫（e.g. 版本 bump）也可能需要「文档说的线上版本」。
 */
export const statedLiveVersionFrom = (doc: string): string | null => {
  const found = statedLiveVersion(doc);
  return found ? versionIn(`v${found}`) : null;
};
