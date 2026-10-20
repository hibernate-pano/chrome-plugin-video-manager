import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 对外文案的守卫。
 *
 * ⚠️ 为什么这些断言住在 `src/options/`：这一轮的改动范围被限定在
 * `src/content/firstRunHint.ts`、`src/options/**`、`_locales/**`、
 * 几份文档与 `manifest.json`，守卫必须落在这个范围之内。
 *
 * 守的是三件事：
 * 1. **商店描述不许再吹牛**（Chrome Web Store 的 Single Purpose 规则）：
 *    描述必须用 `__MSG_` 引入，且不许出现「any / 任意」这类把范围说大的词。
 * 2. **英文引导要成句**：「= / - speed」不是句子，英文用户读不出这是调速。
 * 3. **文档不许与代码不一致**：同源 iframe 的视频**会被接管但接管不完整**，
 *    文案必须照实说，不能笼统写成「都不接管」也不能吹成「完全支持」。
 */

const repoRoot = resolve(process.cwd());

const readJson = (relative: string) =>
  JSON.parse(readFileSync(resolve(repoRoot, relative), 'utf8')) as Record<string, unknown>;

const readText = (relative: string) =>
  readFileSync(resolve(repoRoot, relative), 'utf8');

const manifest = readJson('manifest.json') as { description?: string; name?: string };

const en = readJson('_locales/en/messages.json') as Record<string, { message?: string }>;
const zh = readJson('_locales/zh_CN/messages.json') as Record<string, { message?: string }>;

describe('manifest 的描述', () => {
  it('用 __MSG_ 占位符引入，而不是写死在 manifest 里', () => {
    const match = /^__MSG_(.+)__$/.exec(manifest.description ?? '');
    expect(
      match,
      `manifest.json 的 description 必须是 __MSG_xxx__ 形式（现在是 ${JSON.stringify(manifest.description)}）`,
    ).not.toBeNull();

    const key = match![1]!;
    expect(en[key]?.message, `en locale 缺少 ${key}`).toBeTruthy();
    expect(zh[key]?.message, `zh_CN locale 缺少 ${key}`).toBeTruthy();
  });

  it('不许出现「any / 任意」这类把范围说大的词', () => {
    // Chrome Web Store 的 Single Purpose 规则要求描述只讲**一件**事，
    // 且不许用「any」把能力说得比实际更大。
    // 扩展只控制 <video>，不控制纯音频 —— 描述必须与 README 的边界一致。
    const key = /^__MSG_(.+)__$/.exec(manifest.description ?? '')?.[1] ?? '';
    const enText = en[key]?.message ?? '';
    const zhText = zh[key]?.message ?? '';

    expect(enText.toLowerCase()).not.toContain('any');
    expect(zhText).not.toContain('任意');
  });

  it('两个 locale 的键集合完全一致（改一条就要两条一起改）', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('引导与设置页的文案', () => {
  it('英文调速提示是一句话', () => {
    // 旧文案 "$1 / $2 speed" 拼出来是 "= / - speed" —— 三个词不成句。
    expect(en.hintSpeed?.message).toContain('to change speed');
    expect(en.hintSpeed?.message).not.toBe('$1 / $2 speed');
  });

  it('英文动作名后面不跟键（键与动作之间由界面自己加分隔符）', () => {
    // 旧写法把键拼进动作名里，英文读出来是 "Fullscreen f" ——
    // 两个词拼在一起，读不出「按这个键」。
    expect(en.hintFullscreen?.message).toBe('Page fullscreen');
    // 「键」不能混在动作名里（旧写法是 "Fullscreen f"）。
    // 注意只能查**独立的** f —— "fullscreen" 里本来就有一个 f。
    expect(en.hintFullscreen?.message).not.toMatch(/\bf\b/i);
  });

  it('中文占位符读得通', () => {
    // 「按下按键」四个字里少一个「要」，读着别扭。
    expect(zh.optPressKey?.message).toBe('按下要绑定的键');
    expect(en.optPressKey?.message).toBe('Press the key to bind');
  });

  it('设置页那两条提示在两个 locale 里都存在，且占位符对应', () => {
    expect(en.optTipsToolbar?.message).toBeTruthy();
    expect(zh.optTipsToolbar?.message).toBeTruthy();
    expect(en.optTipsOptions?.message).toContain('$1');
    expect(zh.optTipsOptions?.message).toContain('$1');
  });

  it('首次引导里写明了「工具栏图标 = 全屏」与「改绑入口」', () => {
    expect(en.hintToolbar?.message).toBeTruthy();
    expect(zh.hintToolbar?.message).toBeTruthy();
    expect(en.hintMore?.message).toBeTruthy();
    expect(zh.hintMore?.message).toBeTruthy();
  });
});

describe('对外文档与代码一致', () => {
  const docs = ['README.md', 'CHROMEWEBSTORE.md'];

  it('同源 iframe 写的是「接管但不完整」，不是笼统的「不接管」', () => {
    docs.forEach((file) => {
      const text = readText(file);
      expect(text, `${file} 没提同源 iframe`).toContain('同源');
      // 「搬不进网页全屏」是同源 iframe 接管不完整的具体表现，
      // 少了它就等于把同源 iframe 说成完全支持。
      expect(text, `${file} 没写清同源 iframe 进不了网页全屏`).toMatch(/搬不进网页全屏|无法把它搬进网页全屏|进不了网页全屏/);
    });
  });

  it('没有把「跨域 iframe 完全不管」写成「同源也不接管」', () => {
    docs.forEach((file) => {
      const text = readText(file);
      expect(text, `${file} 出现了笼统的「都不接管」`).not.toContain('都不接管');
    });
  });

  it('不再宣称接管任意 HTML5 视频', () => {
    const readme = readText('README.md');
    expect(readme.toLowerCase()).not.toContain('any html5 video');
  });
});
