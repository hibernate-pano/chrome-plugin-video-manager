import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * 「回落文案」与 `_locales/zh_CN/messages.json` 必须说的是**同一句话**。
 *
 * ## 为什么这道守卫是必要的
 *
 * `src/shared/i18n.ts` 把一条不变式写在最前面：
 *
 *   > 最重要的一条不变式：**有 chrome.i18n 与没有 chrome.i18n 时，
 *   > 渲染结果必须一致。**
 *
 * 但「回落文案」在源码里是**手写的第二份副本** ——
 * 内容脚本写 `t('hintToolbar', '点扩展图标可进入网页全屏')`，
 * 设置页写一张 `FALLBACKS` 表。而真正的文案在
 * `_locales/zh_CN/messages.json` 里。于是同一句话有两个地方可以改：
 *
 *   - 改了 messages.json → 真用户（走 chrome.i18n）看到新文案，
 *     而**单元测试**（没有 chrome.i18n，走回落路径）仍然断言旧文案 ——
 *     于是测试守住的是一份**已经不存在的文案**，而且它照样是绿的。
 *   - 改了源码里的回落文案 → 反过来：测试绿，真用户看到的是旧文案。
 *
 * 两种情况都不会让任何测试变红。**两份事实源 = 两处都会悄悄过期。**
 *
 * ## 比的是「同一句话」，不是「同一个字符串」
 *
 * 占位符的**写法**允许两边不同，而且是**故意**不同的：
 *
 *   locale 里用 Chrome 的位置占位符 `$1`；
 *   回落文案里用具名 token `{rate}`。
 *
 * 这么写是为了迁移兼容（见 `i18n.ts` 的 `deriveValues`：具名 token 会被
 * 原样传给 Chrome，于是 locale 里的 `$1` 被填成 `"{rate}"`，
 * 调用点后面 `.replace('{rate}', x)` 依然有效，旧调用点不用改）。
 *
 * 所以本守卫**按占位符归一化**之后再比较：把 `$1` / `{rate}` 这类槽位
 * 统一编号成 `{p0}` / `{p1}`，然后比剩下的字面部分。
 * 这样「改了措辞」会被抓住，「换了占位符写法」不会误报。
 */

const repoRoot = resolve(process.cwd());

const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8')) as Record<
    string,
    { message?: string }
  >;

const zh = readJson('_locales/zh_CN/messages.json');
const en = readJson('_locales/en/messages.json');

/** 递归列出 src 下的所有 .ts（排除测试文件自己）。 */
const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
};

/** 把 JS 字符串字面量的转义还原回真正的字符。 */
const unescape = (literal: string): string =>
  literal.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

/**
 * 把占位符归一化成 `{p0}`、`{p1}`…（按出现顺序编号）。
 *
 * `$1` 与 `{name}` 都算一个槽位；两种写法混在一条消息里也照样按顺序编号。
 */
const normalizeSlots = (text: string): string => {
  let index = 0;
  return text.replace(/\$\d|\{[A-Za-z0-9_]+\}/g, () => `{p${index++}}`);
};

/** 源码里 `t('键', '回落文案')` 形式的调用点。 */
const inlineFallbacks = (): Map<string, { fallback: string; where: string }> => {
  const found = new Map<string, { fallback: string; where: string }>();
  const pattern = /\bt\(\s*'([A-Za-z0-9_]+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;

  for (const file of sourceFiles(resolve(repoRoot, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const key = match[1]!;
      const fallback = unescape(match[2]!);
      const where = relative(repoRoot, file);
      const previous = found.get(key);
      if (previous && previous.fallback !== fallback) {
        throw new Error(
          `同一个键 ${key} 在两处有不同的回落文案：\n` +
            `  ${previous.where} → ${JSON.stringify(previous.fallback)}\n` +
            `  ${where} → ${JSON.stringify(fallback)}`,
        );
      }
      found.set(key, { fallback, where });
    }
  }

  return found;
};

/** 设置页的 `FALLBACKS` 表。 */
const optionsFallbacks = (): Map<string, string> => {
  const file = resolve(repoRoot, 'src/options/index.ts');
  const text = readFileSync(file, 'utf8');
  const block = /const FALLBACKS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(text);
  if (!block) {
    throw new Error('src/options/index.ts 里找不到 FALLBACKS 表');
  }

  const found = new Map<string, string>();
  // 键是**裸标识符**（`optSubtitle: '快捷键'`），不是带引号的。
  const pattern = /([A-Za-z0-9_]+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  for (const match of block[1]!.matchAll(pattern)) {
    found.set(match[1]!, unescape(match[2]!));
  }
  return found;
};

/** 比一对「回落文案」与「locale 消息」是不是同一句话。 */
const compare = (
  key: string,
  fallback: string,
  where: string,
): string | null => {
  const expected = zh[key]?.message;
  if (expected === undefined) {
    return `${key}（${where}）：zh_CN/messages.json 里根本没有这个键`;
  }
  if (normalizeSlots(fallback) !== normalizeSlots(expected)) {
    return (
      `${key}（${where}）：\n` +
      `      源码回落：${JSON.stringify(fallback)}\n` +
      `      zh_CN 消息：${JSON.stringify(expected)}`
    );
  }
  return null;
};

describe('回落文案与 zh_CN/messages.json 是同一份事实', () => {
  it('源码里每条 t() 的回落文案都等于 zh_CN 的消息（占位符归一化后）', () => {
    const fallbacks = inlineFallbacks();
    expect(fallbacks.size, '一条 t() 都没扫到 —— 扫描规则失效了，不是代码没有文案').toBeGreaterThan(0);

    const mismatches = [...fallbacks]
      .map(([key, { fallback, where }]) => compare(key, fallback, where))
      .filter((item): item is string => item !== null);

    expect(
      mismatches,
      `这些回落文案与 _locales/zh_CN/messages.json 不一致 —— 改文案只改一处。\n${mismatches.join('\n')}`,
    ).toEqual([]);
  });

  it('设置页 FALLBACKS 表与 zh_CN 的消息一致（占位符归一化后）', () => {
    const fallbacks = optionsFallbacks();
    expect(fallbacks.size, 'FALLBACKS 表是空的 —— 解析规则失效了').toBeGreaterThan(0);

    const mismatches = [...fallbacks]
      .map(([key, fallback]) => compare(key, fallback, 'src/options/index.ts'))
      .filter((item): item is string => item !== null);

    expect(
      mismatches,
      `设置页的 FALLBACKS 与 _locales/zh_CN/messages.json 不一致。\n${mismatches.join('\n')}`,
    ).toEqual([]);
  });

  it('源码里用到的每一个键，两个 locale 都有', () => {
    const used = new Set<string>([...inlineFallbacks().keys(), ...optionsFallbacks().keys()]);
    const missingEn = [...used].filter((key) => en[key]?.message === undefined);
    const missingZh = [...used].filter((key) => zh[key]?.message === undefined);

    expect(missingEn, `en locale 缺这些键（英文用户会看到中文回落文案）：${missingEn.join(', ')}`).toEqual([]);
    expect(missingZh, `zh_CN locale 缺这些键：${missingZh.join(', ')}`).toEqual([]);
  });

  it('英文 locale 的措辞也不能漏（英文用户看到的是英文，不是中文回落）', () => {
    // 回落文案是中文的，所以英文 locale 缺键时，英文用户会直接看到中文。
    // 这条断言让「英文缺键」变成红灯，而不是上线后才发现。
    const used = new Set<string>([...inlineFallbacks().keys(), ...optionsFallbacks().keys()]);
    const missing = [...used].filter((key) => en[key]?.message === undefined);
    expect(missing, `en locale 缺这些键：${missing.join(', ')}`).toEqual([]);
  });

  it('每个 locale 都有 __vscLocale 标记键（currentLocale() 靠它判断）', () => {
    expect(zh.__vscLocale?.message, 'zh_CN 缺 __vscLocale').toBeTruthy();
    expect(en.__vscLocale?.message, 'en 缺 __vscLocale').toBeTruthy();
    expect(zh.__vscLocale?.message).not.toBe(en.__vscLocale?.message);
  });

  it('两个 locale 的键集合完全一致', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});
