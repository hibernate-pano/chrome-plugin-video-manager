import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  NOTICE_CARD_TOKENS,
  NOTICE_PILL_TOKENS,
  NOTICE_STALE_TOKENS,
} from './runtimeStyles';
import { EXTENSION_STALE_NOTICE_STYLES } from './runtime';
import { BADGE_STYLES, PILL_STYLES } from './speedToast';
import { TAKEOVER_NOTICE_STYLES } from './takeoverNotice';

/**
 * 「一套视觉语言」的**跨模块**守卫。
 *
 * ⚠️ 这条不变式横跨四个模块，而每个模块单独看都是「正常」的：
 * 胶囊（speedToast.ts）、接管提示（takeoverNotice.ts）、首次引导（firstRunHint.ts）、
 * 扩展已更新的状态通知（runtime.ts）。
 * 任何一处的排版改动都会让它们**长得不一样**，而没有任何单模块的测试会红。
 *
 * 这件事已经发生过一次（2026-10-21 实测的 computed style）：
 * 胶囊 14px / 5px 12px / 淡入 160ms，接管提示 13px / 6px 12px / 淡入 220ms，
 * 引导 13px / 10px 16px / 圆角 12px / 淡入 220ms，角标 12px —— 四个浮层，
 * 4 种字号、3 种圆角、3 种底色、2 种淡入时长、2 种行高。
 * 用户看到的是「四个不同的东西」。
 *
 * ⚠️ 现在是**五个**浮层、三套 token（胶囊 / 卡片 / 状态通知）+ 一个角标：
 * 「扩展已更新」那条提示以前自己写了一份排版（runtime.ts 里），
 * 于是它是唯一一个不跟着 token 走的浮层 —— 这份守卫现在把它也罩住了。
 *
 * 所以守卫写在这里：**token 定义在 runtimeStyles.ts，而「谁用了哪一套」
 * 是跨模块的事实**，只有从外面看才看得见。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * firstRunHint.ts 的源码。
 *
 * ⚠️ 引导的样式对象**没有导出**（它只在自己的模块里用），
 * 所以这里扫源码来确认它用的是卡片 token ——
 * 扫源码是这个仓库已有的做法（见 `src/shared/i18n-fallback.test.ts`）。
 */
const firstRunHintSource = readFileSync(
  join(repoRoot, 'src', 'content', 'firstRunHint.ts'),
  'utf8',
);

/**
 * 「形状」属性白名单。
 *
 * ⚠️ 形状 = **底色 / 圆角 / 内边距 / 淡入时长**。
 *
 * 这四项之外的一切（字号、字重、行高、字体族……）都必须逐项相同 ——
 * 差一个就是两副嗓子，用户看到的就是两个产品。
 *
 * ⚠️ 'padding-right' 在名单里：引导卡片的右边要给关闭按钮腾位置（26px），
 * 而这个覆盖**必须**住在 token 里（不能由 firstRunHint 事后 setProperty 改一次）——
 * 否则同一个内边距就有两份（token 里的 16px 与事后的 26px），
 * 而渲染出来的是哪一份只有浏览器知道。
 * 它属于「形状」，所以不与「排版两家必须一致」那条承诺冲突。
 */
const SHAPE_PROPERTIES = [
  'background-color',
  'border-radius',
  'padding',
  'padding-right',
  '--vsc-notice-fade',
];

/**
 * 「定位类」属性白名单。
 *
 * ⚠️ 只有这几个属性允许出现在 token **之外**：
 * 它们决定提示**贴在哪**，不属于「它长什么样」——
 * 胶囊贴视频左上角、接管提示贴视频左下角、状态通知贴视口左上角，
 * 各自的锚点当然不一样。
 *
 * 名单之外的任何一项出现在 token 之外，都意味着某个模块**自己写了一份排版**：
 * 那正是这套视觉语言要消灭的漂移。
 */
const POSITIONING_PROPERTIES = ['max-width', 'bottom', 'left', 'right', 'top'];

/**
 * 两个 token 集合之间「不在形状上的差异」。
 *
 * @param a 第一个 token 集合
 * @param b 第二个 token 集合
 * @returns 那些「值不同、又不在形状白名单里」的属性名
 */
const differencesOutsideShape = (
  a: Record<string, string>,
  b: Record<string, string>,
): string[] => {
  const allProperties = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...allProperties].filter(
    (property) => a[property] !== b[property] && !SHAPE_PROPERTIES.includes(property),
  );
};

/**
 * 某份样式里「token 之外、且不是定位类」的那些键。
 *
 * @param styles 某个模块真正写下去的那份样式
 * @param tokens 它应该用的那套 token
 */
const nonPositioningExtras = (
  styles: Record<string, string>,
  tokens: Record<string, string>,
): string[] =>
  Object.keys(styles).filter(
    (property) =>
      !(property in tokens) && !POSITIONING_PROPERTIES.includes(property),
  );

describe('页面级浮层的排版只有三套', () => {
  it('胶囊与接管提示用的是**同一套** token', () => {
    // 这两个是同一类东西：都锚在视频上、都是一次性的短提示。
    // 用户看到两个形状相同的东西却长得不一样，会以为是两个不同的功能。
    for (const [property, value] of Object.entries(NOTICE_PILL_TOKENS)) {
      expect(PILL_STYLES[property], `胶囊的 ${property} 必须是 token 里的那个值`).toBe(value);
      expect(
        TAKEOVER_NOTICE_STYLES[property],
        `接管提示的 ${property} 必须是 token 里的那个值`,
      ).toBe(value);
    }
  });

  it('接管提示可以在 token 之外加自己的定位，但**不许**覆盖排版', () => {
    // 它自己的那几项（max-width / bottom / left）是**定位**，不是排版 ——
    // 排版那一族必须逐项来自 token。
    //
    // ⚠️ 这里为什么是「子集」而不是「逐个相等」：
    // 旧写法（多出来的键必须恰好等于 ['bottom','left','max-width']）是一条
    // **会过期**的断言 —— 有人合法地多加一个定位键（比如 'top'）它就红，
    // 而红的时候下一个人根本不知道该改哪里：他很可能去「修」本来没坏的代码。
    // 关系式断言问的才是这条守卫真正想说的话：
    // 「多出来的那些，**是不是**定位类属性」。
    expect(
      nonPositioningExtras(TAKEOVER_NOTICE_STYLES, NOTICE_PILL_TOKENS),
      '接管提示只能在 token 之外加定位类属性（max-width / bottom / left / right / top）—— ' +
        '多出来的排版属性意味着它自己写了一份样式',
    ).toEqual([]);
  });

  it('这条守卫本身**会咬人**：多一个非定位的键（font-style）必须被抓出来', () => {
    // 变异验证的固化版本：把「加一个排版属性」这件事本身做成断言。
    // 没有它的话，有人把上面那条守卫改弱（或者反过来，
    // 有人以为「多加一个键没关系」）都不会有人发现。
    expect(
      nonPositioningExtras(
        { ...NOTICE_PILL_TOKENS, 'font-style': 'italic' },
        NOTICE_PILL_TOKENS,
      ),
      'font-style 不是定位类属性 —— 它必须被抓出来',
    ).toEqual(['font-style']);

    // 反过来：合法地多加一个定位键（top）**不许**被抓出来。
    expect(
      nonPositioningExtras({ ...NOTICE_PILL_TOKENS, top: '16px' }, NOTICE_PILL_TOKENS),
      'top 是定位类属性 —— 多加它不该被当成违规',
    ).toEqual([]);
  });

  it('引导用的是卡片 token（形状不同，排版那一族相同）', () => {
    expect(
      firstRunHintSource,
      'firstRunHint.ts 必须 import NOTICE_CARD_TOKENS —— ' +
        '引导的排版要是自己写一份，它就会变成「另一个产品」',
      // ⚠️ 词边界 \b 是必须的：没有它，`NOTICE_CARD_TOKENS_DISABLED`
      // 也会被当成匹配（`_` 是单词字符，`TOKENS` 后面没有边界）——
      // 那条守卫就成了恒真的摆设。
    ).toMatch(/import\s*\{[^}]*NOTICE_CARD_TOKENS\b[^}]*\}\s*from\s*'\.\/runtimeStyles'/);

    expect(
      firstRunHintSource,
      '引导的样式对象必须展开 NOTICE_CARD_TOKENS（...NOTICE_CARD_TOKENS）',
    ).toMatch(/\.\.\.NOTICE_CARD_TOKENS\b/);
  });

  it('扩展已更新那条提示用的是第三套 token（状态通知）', () => {
    // ⚠️ 这条提示以前**自己写了一份排版**（runtime.ts 里写死 13px / 8px 14px /
    // rgba(0,0,0,0.82) …），于是它是五个浮层里唯一一个不跟着 token 走的：
    // 改字号、改底色时它不动，「一套视觉语言」这句话就悄悄作废了。
    for (const [property, value] of Object.entries(NOTICE_STALE_TOKENS)) {
      expect(
        EXTENSION_STALE_NOTICE_STYLES[property],
        `状态通知的 ${property} 必须是 token 里的那个值`,
      ).toBe(value);
    }

    // 它同样只许在 token 之外加**定位**（贴视口左上角 + 宽度上限）。
    expect(
      nonPositioningExtras(EXTENSION_STALE_NOTICE_STYLES, NOTICE_STALE_TOKENS),
      '状态通知只能在 token 之外加定位类属性',
    ).toEqual([]);
  });

  it('三套 token 在「字号 / 字重 / 行高 / 字体族」上逐项相同', () => {
    // 这是「一套视觉语言」的承诺本身：引导是这个产品唯一的入口，
    // 它不该看起来像另一个产品；而「扩展已更新」是系统通知，
    // 它也不该换一副嗓子 —— 用户看到的仍是同一个产品在说同一句话。
    for (const property of ['font-size', 'font-weight', 'line-height', 'font-family']) {
      expect(
        NOTICE_CARD_TOKENS[property],
        `${property}：卡片与胶囊必须一致 —— 差这一个属性就是两个产品`,
      ).toBe(NOTICE_PILL_TOKENS[property]);
      expect(
        NOTICE_STALE_TOKENS[property],
        `${property}：状态通知与胶囊必须一致 —— 它是「通知」不是「另一个产品」`,
      ).toBe(NOTICE_PILL_TOKENS[property]);
    }
  });

  it('三套 token 的差别**只**能出现在形状属性上', () => {
    // 形状 = 底色 / 圆角 / 内边距 / 淡入时长（见 SHAPE_PROPERTIES）。
    // 排版属性一旦分家，五个浮层就变回「五个不同的东西」。
    expect(
      differencesOutsideShape(NOTICE_CARD_TOKENS, NOTICE_PILL_TOKENS),
      '卡片与胶囊只允许在「形状」上不同（底色 / 圆角 / 内边距 / 淡入时长）',
    ).toEqual([]);

    expect(
      differencesOutsideShape(NOTICE_STALE_TOKENS, NOTICE_PILL_TOKENS),
      '状态通知与胶囊只允许在「形状」上不同（底色 / 圆角 / 内边距 / 淡入时长）',
    ).toEqual([]);

    expect(
      differencesOutsideShape(NOTICE_STALE_TOKENS, NOTICE_CARD_TOKENS),
      '状态通知与卡片只允许在「形状」上不同（底色 / 圆角 / 内边距 / 淡入时长）',
    ).toEqual([]);
  });

  it('三套 token 各自的**形状**必须是不同的（长得一样就分不出谁是谁）', () => {
    // 胶囊 999px / 卡片 12px / 状态通知 10px —— 三个不同的身份。
    const radii = [
      NOTICE_PILL_TOKENS['border-radius'],
      NOTICE_CARD_TOKENS['border-radius'],
      NOTICE_STALE_TOKENS['border-radius'],
    ];

    expect(new Set(radii).size, `三套 token 的圆角撞了：${radii.join(' / ')}`).toBe(3);

    // 状态通知的底色比胶囊更实（它要压得住任何背景，且它不会自己消失）。
    expect(NOTICE_STALE_TOKENS['background-color']).not.toBe(
      NOTICE_PILL_TOKENS['background-color'],
    );
    expect(NOTICE_STALE_TOKENS['background-color']).toMatch(/^rgba\(0, 0, 0, 0\./);
  });

  it('角标是更小的一档（字号阶梯只有两档：角标 < 胶囊 = 引导 = 状态通知）', () => {
    const badgeSize = parseFloat(BADGE_STYLES['font-size']);
    const pillSize = parseFloat(NOTICE_PILL_TOKENS['font-size']);

    expect(badgeSize, '角标必须比胶囊小一档').toBeLessThan(pillSize);
    expect(pillSize).toBe(parseFloat(NOTICE_CARD_TOKENS['font-size']));
    expect(pillSize).toBe(parseFloat(NOTICE_STALE_TOKENS['font-size']));
  });

  it('角标保留自己的形状（小方角 + 更实的底板）—— 它是「钉在视频上的读数」，不是通知', () => {
    expect(BADGE_STYLES['border-radius']).not.toBe(NOTICE_PILL_TOKENS['border-radius']);
    expect(BADGE_STYLES['background-color']).not.toBe(NOTICE_PILL_TOKENS['background-color']);
    // 但底色仍属同一族：都是深色半透明，不是浅色。
    expect(BADGE_STYLES['background-color']).toMatch(/^rgba\(0, 0, 0, 0\./);
  });
});
