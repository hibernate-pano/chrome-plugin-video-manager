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
  it('调速提示是「动作名 · 键」的结构（中英一致），而且**带方向**', () => {
    // 旧文案 "$1 / $2 speed" 拼出来是 "= / - speed" —— 三个词不成句；
    // 写成 "= / - to change speed" 也是半句话（键甩在最前面）。
    //
    // 引导里的每一条都必须是「动作名 · 键」（与 "Page fullscreen" 同构），
    // 所以这里守的是**结构**而不是某一句具体的英文 —— 文案可以改，
    // 但不能退回「键名 + 半句话」那种读不通的写法。
    //
    // ⚠️ 而且必须带**方向**：原来只写「调速 · = / -」，
    // 用户分不清哪个是加速、哪个是减速 —— 而按错的代价是「速度反了」。
    expect(en.hintSpeed?.message).toMatch(/^[^$]+· \$1 faster \/ \$2 slower$/);
    expect(zh.hintSpeed?.message).toMatch(/^[^$]+· \$1 加快 \/ \$2 减慢$/);
    expect(en.hintSpeed?.message).not.toBe('$1 / $2 speed');
  });

  it('全屏那行说清是「切换」，中英一致', () => {
    // 设置页原来写的是「进入或退出网页全屏」，引导原来只写「网页全屏」——
    // 用户读到那儿根本不知道按下去会发生什么。
    expect(zh.hintFullscreen?.message).toContain('切换网页全屏');
    expect(en.hintFullscreen?.message).toMatch(/toggle page fullscreen/i);
    // 键必须由界面填进去（占位符），不能写死在动作名里。
    expect(zh.hintFullscreen?.message).toContain('$1');
    expect(en.hintFullscreen?.message).toContain('$1');
    // ⚠️ 设置页里那个键的说明也要说「切换」——
    // 同一个键，引导说「切换」、设置页说「进入或退出」，用户读到两处会以为按错了。
    expect(zh.actionFullscreenDesc?.message).toBe('切换网页全屏');
    expect(en.actionFullscreenDesc?.message).toMatch(/toggle page fullscreen/i);
  });

  it('英文动作名后面不跟键（键与动作之间由界面自己加分隔符）', () => {
    // 旧写法把键拼进动作名里，英文读出来是 "Fullscreen f" ——
    // 两个词拼在一起，读不出「按这个键」。
    expect(en.hintFullscreen?.message).not.toMatch(/\bf\b/i);
  });

  it('工具栏图标在引导与设置页里说的是同一件事（切换，不是进入）', () => {
    // 两边曾经一个说「进入」、一个说「切换」—— 同一个图标、两种说法。
    expect(zh.hintToolbar?.message).toContain('切换');
    expect(en.hintToolbar?.message).toMatch(/toggle/i);
    expect(zh.optTipsToolbar?.message).toContain('切换');
    expect(en.optTipsToolbar?.message).toMatch(/toggle/i);
  });

  it('中文占位符读得通，而且说清了怎么清空绑定', () => {
    // 「按下按键」四个字里少一个「要」，读着别扭。
    expect(zh.optPressKey?.message).toContain('按下要绑定的键');
    // ⚠️ 输入框是只读的（readOnly），用户看不到「怎么变成空」——
    // 而「留空 = 禁用该动作」是设置页明写着的规则。
    expect(zh.optPressKey?.message).toMatch(/Backspace/);
    expect(en.optPressKey?.message).toMatch(/Backspace/);
    // 设置页的说明段落也要说清同一件事。
    expect(zh.optLead?.message).toMatch(/Backspace/);
    expect(en.optLead?.message).toMatch(/Backspace/);
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

  it('嵌入框（iframe）的能力写的是 6.2.0 的真实行为', () => {
    docs.forEach((file) => {
      const text = readText(file);
      expect(text, `${file} 没提同源 iframe`).toContain('同源');

      // ⚠️ 这条断言在 6.2.0 之前是反的。
      //
      // 它原来要求文档里出现「搬不进网页全屏 / 进不了网页全屏」——
      // 那说的是 6.1.0 的事实：嵌入框里的视频搬不进网页全屏。
      // 6.2.0 把它改掉了（`src/content/iframeExpansion.ts`：父文档把装着
      // 视频的那个 `<iframe>` 元素撑满顶层视口，画面真的铺满整页）。
      //
      // 而这条断言当时**是绿的，却是假绿**：它要找的「进不了网页全屏」
      // 出现在另一句里 —— 说的是「焦点在嵌入框里时，**顶层页面**的视频
      // 进不了网页全屏」，主语根本不是嵌入框里的视频。
      // 断言守的不是它声称在守的东西，却让人以为「同源 iframe 搬不进全屏」
      // 仍是被守着的约定。
      //
      // 现在守的是**当前的真话**：嵌入框里的视频能进网页全屏，而且铺满整页。
      expect(
        text,
        `${file} 没写清「嵌入框里的网页全屏铺满的是整个页面」（6.1.0 时它只铺满嵌入框自己那一小块）`,
      ).toMatch(/铺满整个页面|铺满整页/);
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

  it('README 开头不把「任意网页里的视频」说成「随便哪个视频都能接管」', () => {
    // 「只做三件事」那条定位句里，扩展只对**你正在看的那个**视频生效 ——
    // 写「任意」会与同一份文档里「不接管你没在看的视频」自相矛盾。
    const readme = readText('README.md');
    expect(readme, 'README 仍写着「把任意网页里的视频铺满视口」').not.toContain('把任意网页里的视频');
  });
});
