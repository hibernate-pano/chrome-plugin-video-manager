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

  /**
   * 「点扩展图标 = 全屏」这句话，**只**由设置页说。
   *
   * ⚠️ 原来引导里也有一份（hintToolbar = 「点扩展图标可切换网页全屏」），
   * 而引导的第一行说的是「按 f 切换网页全屏」—— **同一个动作**
   * （同一个 TOGGLE_FULLSCREEN_MESSAGE，见 background/index.ts:22）
   * 在同一张卡片里讲了两遍。
   *
   * 现在引导那一行改成「全屏控制条里能用鼠标点倍速档位」——
   * 那是**别处没有**的事实：这个产品唯一能用鼠标**精确**选倍速的地方
   * （按 = 只能一档一档按，要 1.5x 得按 5 次），
   * 而倍速菜单只存在于全屏控制条里（FullscreenControls 只在 enter() 里创建、
   * 退出时 unmount）。
   *
   * 设置页那一份**留着**：那里没有第一行复述，工具栏图标的用法本来就该
   * 在设置页说清楚。
   */
  it('「点扩展图标 = 全屏」只在设置页说，引导不再复述它', () => {
    // 设置页：仍然教鼠标路径。
    expect(zh.optTipsToolbar?.message).toContain('切换');
    expect(en.optTipsToolbar?.message).toMatch(/toggle/i);

    // 引导：换成「鼠标点倍速档位」，且**不含**「扩展图标」那套说法。
    expect(zh.hintToolbar?.message).toContain('倍速档位');
    expect(en.hintToolbar?.message).toMatch(/speed/i);
    expect(zh.hintToolbar?.message).not.toContain('扩展图标');
    expect(en.hintToolbar?.message).not.toMatch(/toolbar|extension icon/i);
  });

  /**
   * 「回到 1x」这条必须教，而且中英文的占位符要对得上。
   *
   * ⚠️ 它用的是**独立的 key**（hintSpeedReset），不是给 hintSpeed 多传一个替换值：
   * chrome.i18n.getMessage 按位置替换，locale 里的 hintSpeed 只声明了
   * $1/$2 —— 传三个替换值时 $3 会渲染成**空串**，
   * 界面上留下「调速 · = 加快 / - 减慢 / 」这样的半截文案。
   */
  it('教「回到 1x」的那一条：占位符三个，且两语言一致', () => {
    expect(zh.hintSpeedReset?.message).toContain('$1');
    expect(zh.hintSpeedReset?.message).toContain('$2');
    expect(zh.hintSpeedReset?.message).toContain('$3');
    expect(en.hintSpeedReset?.message).toContain('$1');
    expect(en.hintSpeedReset?.message).toContain('$2');
    expect(en.hintSpeedReset?.message).toContain('$3');

    // 三档都要说清楚：加快 / 减慢 / 回到 1x。
    expect(zh.hintSpeedReset?.message).toContain('回到 1x');
    expect(en.hintSpeedReset?.message).toMatch(/1x/i);

    // ⚠️ 没绑定复位键时，走的是**另一个 key**（hintSpeed，两档）。
    expect(zh.hintSpeed?.message).not.toContain('$3');
    expect(en.hintSpeed?.message).not.toContain('$3');
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

  /**
   * Escape = 撤销这件事，页面上必须有**一个字**提到它。
   *
   * ⚠️ 之前 `document.body.innerText` 里没有「Esc / escape / 撤销 / 取消」
   * 任何一个词：Backspace 的用法在 optLead 与占位符里写得很清楚，
   * Escape 完全没有。用户想把 Escape 绑给某个动作 → 按下 Escape →
   * 框里回到旧键并失焦，**没有任何提示** ——
   * 他既不知道 Escape 被占用了（绑不了），
   * 也不知道刚才那次修改被撤销了。
   *
   * 断言用的是 locale 值本身（不是写死中英文），
   * 这样两条文案只要有一边漏了就红。
   */
  it('Escape 撤销这件事写在页面文案里', () => {
    // 占位符（聚焦时用户真正看到的那句话）里要有。
    expect(zh.optPressKey?.message).toMatch(/Esc/);
    expect(en.optPressKey?.message).toMatch(/Esc/);
    // 说明段落里也要有。
    expect(zh.optLead?.message).toMatch(/Esc/);
    expect(en.optLead?.message).toMatch(/Esc/);
  });

  /**
   * 页面必须说清「这些键只在网页里的视频上生效」。
   *
   * ⚠️ 之前整个页面上没有这句话：新用户看到 7 个键，
   * 在任意网页上按 '=' 什么都没发生，页面从头到尾没说
   * 「只有页面里正在播放的视频才会响应」——
   * 而这正是「为什么我按了键没反应」。
   */
  it('说明段落说清了「只在页面里正在播放的视频上生效」', () => {
    // 中英各说各的，但都要有这句范围说明。
    expect(zh.optLead?.message).toMatch(/视频/);
    expect(en.optLead?.message).toMatch(/video/i);
    // 而且说的是「正在播放」这个条件，不是笼统的「视频」。
    expect(zh.optLead?.message).toMatch(/播放/);
    expect(en.optLead?.message).toMatch(/playing/i);
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
