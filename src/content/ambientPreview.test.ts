import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isDecorativeAutoplay,
  isPageMainContent,
  isSiteMainPlayerVideo,
  publishAmbientPreview,
  readAmbientPreview,
} from './ambientPreview';

/**
 * 「装饰性预览」这份判定**只有一份**（ambientPreview.ts）。
 *
 * ⚠️ 这份规则曾经散在两个文件里，并且**已经漂移**：
 * - videoRegistry 那份被重写成「六条证据」（当时的说法；如今是**七条**）
 * - firstRunHint 那份还停在最老的属性判据（autoplay + 无 controls）
 *
 * 后果是同一条视频，两边给出**相反**的结论：「要不要接管它」说不是装饰，
 * 「要不要给它弹引导」说是装饰 —— 于是用户能调速，却从来不知道扩展会做什么。
 *
 * 这些用例守的是**规则本身**（不是调用点）：调用点的接线由
 * videoRegistry.test.ts / firstRunHint.test.ts 各守一条。
 */
describe('ambientPreview：装饰性预览的判定', () => {
  const makeVideo = (attributes: Record<string, string> = {}) => {
    const video = document.createElement('video');
    for (const [name, value] of Object.entries(attributes)) {
      video.setAttribute(name, value);
    }
    return video;
  };

  it('autoplay + 没有 controls + 没人管 → 装饰物', () => {
    const video = makeVideo({ autoplay: '' });
    expect(isDecorativeAutoplay(video, {
      isMainPlayer: false,
      wasChosenByUser: false,
      wasStartedBySite: true,
    })).toBe(true);
  });

  it('有原生 controls → 不是装饰物（站点把它当正经播放器）', () => {
    const video = makeVideo({ autoplay: '', controls: '' });
    expect(isDecorativeAutoplay(video, {
      isMainPlayer: false,
      wasChosenByUser: false,
      wasStartedBySite: true,
    })).toBe(false);
  });

  it('站点点名它是主播放器 → 不是装饰物', () => {
    // YouTube 的主播放器恰恰就是「autoplay + 无 controls」，
    // 只看属性分不出来 —— 少了这条豁免，YouTube 上整页失键。
    const video = makeVideo({ autoplay: '' });
    expect(isDecorativeAutoplay(video, {
      isMainPlayer: true,
      wasChosenByUser: false,
      wasStartedBySite: true,
    })).toBe(false);
  });

  it('用户亲手选过 → 不是装饰物（任何推断都推翻不了用户的手势）', () => {
    const video = makeVideo({ autoplay: '' });
    expect(isDecorativeAutoplay(video, {
      isMainPlayer: false,
      wasChosenByUser: true,
      wasStartedBySite: true,
    })).toBe(false);
  });

  it('是我们自己接管着的 → 不是装饰物', () => {
    // 进全屏时我们把 video.controls = false，那会反射性地移除 controls 属性。
    // 少了这条豁免，进全屏后视频被判成装饰物 → 快捷键彻底失灵。
    const video = makeVideo({ autoplay: '' });
    expect(isDecorativeAutoplay(video, {
      isMainPlayer: false,
      wasChosenByUser: false,
      isTakenOverByUs: true,
      wasStartedBySite: true,
    })).toBe(false);
  });

  it('没人开过（等着用户先调速再播放）→ 不是装饰物', () => {
    // ⚠️ 这一条最容易被当成多余的：少了它，「先调速再播放」这条最常见的
    // 用法会在任何用自制播放器的网站上直接失效。
    const video = makeVideo();
    expect(isDecorativeAutoplay(video, {
      isMainPlayer: false,
      wasChosenByUser: false,
      wasStartedBySite: false,
    })).toBe(false);
  });

  it('拿不到「站点自己开的」这个证据 → 也不能当成装饰物', () => {
    // ⚠️ `wasStartedBySite` 省略掉 = **拿不到证据**。
    //
    // 这一条是「有证据」的判据（证据 = autoplay 属性 / 站点调 play()），
    // 证据缺失不等于证据为真 —— 所以 undefined 与 false 同义。
    //
    // ⚠️ 判错的两个方向代价不对称：
    // 把「不知道」当成「站点自己开的」→ 判成装饰物 → 扩展不接管、引导不弹
    //   （用户在一个正经播放器上什么都得不到 = 功能等于不存在）；
    // 把「不知道」当成「不是站点自己开的」→ 最多多接管一次、多提示一次。
    const video = makeVideo({ autoplay: '' });
    expect(isDecorativeAutoplay(video, {
      isMainPlayer: false,
      wasChosenByUser: false,
    })).toBe(false);
  });
});

/**
 * 「站点有没有点名这条视频是主播放器」——**只有一份**判据。
 *
 * ⚠️ 这条判据曾经有两份（videoRegistry 一份、firstRunHint 一份，逐字相同），
 * 而 videoRegistry 内部还有一份**不等价**的「唯一性」版 ——
 * 于是在 YouTube watch 页上，同一条视频在同一个模块里得到两个相反的结论。
 *
 * 这里的用例守的是**语义**：站点的 `mainSelectors` 里有没有命中这条视频。
 */
describe('ambientPreview：站点主播放器判据（只有一份）', () => {
  const makeVideo = () => document.createElement('video');

  it('站点点名的视频 → 是主播放器', () => {
    // YouTube 的 mainSelectors：['video.html5-main-video', '.html5-video-player video']
    const video = makeVideo();
    video.className = 'html5-main-video';
    expect(isSiteMainPlayerVideo(video, 'www.youtube.com')).toBe(true);
  });

  it('站在**第二条** mainSelector 里的视频 → 也是主播放器（站点点名过它）', () => {
    // ⚠️ 这条是「统一到一份」之后的关键语义：
    // 「唯一性」版在这里会说「不是主播放器」（前面的选择器已经有候选了），
    // 而站点明明点名了它所在的容器。
    //
    // 统一之后保住的语义是「**点名**」这个事实 ——
    // `mainSelectors` 里有没有命中这条视频，仅此而已。
    const wrapper = document.createElement('div');
    wrapper.className = 'html5-video-player';
    const video = makeVideo();
    wrapper.appendChild(video);

    expect(isSiteMainPlayerVideo(video, 'www.youtube.com')).toBe(true);
  });

  it('站点没点名的视频 → 不是主播放器', () => {
    const video = makeVideo();
    expect(isSiteMainPlayerVideo(video, 'www.youtube.com')).toBe(false);
  });

  it('通用站点没有 mainSelectors → 永远不是主播放器', () => {
    // 通用适配器的 mainSelectors 是空的：没有站点的声明就没有豁免。
    const video = makeVideo();
    video.className = 'html5-main-video';
    expect(isSiteMainPlayerVideo(video, 'example.com')).toBe(false);
  });
});

describe('ambientPreview：页面主角豁免', () => {
  /**
   * 造出「有没有布局」与「视口多大」这两个环境变量。
   *
   * ⚠️ 为什么必须自己造：豁免的判据住在**同一个文件**里
   * （`hasReliableLayout` 读根元素的 clientWidth、`viewportAreaOf` 读
   * window.innerWidth/innerHeight），不再由调用方注入。
   *
   * jsdom 里：clientWidth 恒为 0（没有布局引擎）→ 豁免永远判不出来；
   * innerWidth/innerHeight 恒为 1024/768。
   * 不改这两个，「视口面积拿不到 → 不豁免」那条分支在 jsdom 里
   * **根本不可达**（那正是这份用例集里曾经留下一条恒真用例的原因）。
   */
  const setLayout = (options: {
    clientWidth?: number;
    innerWidth?: number;
    innerHeight?: number;
  }) => {
    if (options.clientWidth !== undefined) {
      Object.defineProperty(document.documentElement, 'clientWidth', {
        value: options.clientWidth,
        configurable: true,
      });
    }

    if (options.innerWidth !== undefined) {
      Object.defineProperty(window, 'innerWidth', {
        value: options.innerWidth,
        configurable: true,
      });
    }

    if (options.innerHeight !== undefined) {
      Object.defineProperty(window, 'innerHeight', {
        value: options.innerHeight,
        configurable: true,
      });
    }
  };

  afterEach(() => {
    // 还原成 jsdom 的默认值：删掉自己定义的那些属性，
    // 原型上的 getter 就重新露出来。
    delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
    delete (window as unknown as Record<string, unknown>).innerWidth;
    delete (window as unknown as Record<string, unknown>).innerHeight;
  });

  it('占视口 ≥ 60% → 是页面主角（豁免成立）', () => {
    // jsdom 的默认视口是 1024×768 = 786_432。
    // 800×600 = 480_000 → 61% → 过线。
    setLayout({ clientWidth: 1024 });
    const video = document.createElement('video');
    expect(isPageMainContent(video, { width: 800, height: 600 })).toBe(true);
  });

  it('占视口不足 60% → 不豁免（装饰物就该是装饰物）', () => {
    // 640×360 = 230_400 → 29%，不够。
    setLayout({ clientWidth: 1024 });
    const video = document.createElement('video');
    expect(isPageMainContent(video, { width: 640, height: 360 })).toBe(false);
  });

  it('没有布局引擎时判不了 → 不豁免（交给别的判据）', () => {
    // 单测的 jsdom 里量出来的尺寸恒为 0；这个豁免在那儿本来就测不出来，
    // 所以必须显式地「不豁免」而不是「豁免」。
    //
    // ⚠️ 尺寸故意给成「本来能过线」的那一组（800×600）——
    // 否则这条用例会因为尺寸不够而恒真，量不出「没有布局」这一条。
    setLayout({ clientWidth: 0 });
    const video = document.createElement('video');
    expect(isPageMainContent(video, { width: 800, height: 600 })).toBe(false);
  });

  it('视口面积拿不到 → 不豁免', () => {
    // ⚠️ 这一条以前在 jsdom 里**不可达**：视口恒为 1024×768，
    // 于是「viewportArea <= 0」那个分支永远走不到 ——
    // 覆盖它的用例与前一条逐字重复，成了充数的假守卫。
    //
    // 现在把视口面积真的造成为 0（innerWidth/innerHeight = 0），
    // 这一条才真正测到了那条分支。
    // 尺寸同样故意给成「本来能过线」的那一组：唯一让它不豁免的
    // 理由必须是「视口面积拿不到」。
    setLayout({ clientWidth: 1024, innerWidth: 0, innerHeight: 0 });
    const video = document.createElement('video');
    expect(isPageMainContent(video, { width: 800, height: 600 })).toBe(false);
  });
});

/**
 * 「判定只有一份」的**结构守卫**。
 *
 * ⚠️ 为什么读源码而不是靠行为断言：这批修复合并的是**重复**，
 * 两份的行为一模一样 —— 重复的那份一旦漂移，行为断言要等到漂移之后才红。
 * 而这个仓库已经有一处同样的守卫（runtime.ts 的接线守卫，
 * 见 firstRunHint.test.ts）。
 *
 * ⚠️ 为什么剥掉注释：注释里也会提到这些名字（「mainSelectors」「
 * matchesSelector」），不剥掉就会把注释当成代码。
 */
describe('ambientPreview：判定只有一份（结构守卫）', () => {
  const CALLERS = ['src/content/videoRegistry.ts', 'src/content/firstRunHint.ts'];

  const readSource = (path: string) =>
    readFileSync(resolve(process.cwd(), path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

  it('「站点有没有点名主播放器」只有一份实现', () => {
    // 曾经：videoRegistry.ts 与 firstRunHint.ts 各写了一份
    // `mainSelectors.some(...)`（逐字相同），而本文件的文件头却声称
    // 那是本文件提供的 —— 读者会以为改这里就够了。
    //
    // ⚠️ 判据是「**不许提到 mainSelectors**」而不是「不许出现某个写法」：
    // 抄一份的人可以把它写成 `.some()`、`.filter().length > 0`、
    // 甚至换个变量名 —— 按写法去抓，抓不全。
    // 「取选择器」这件事只有一个入口：`isSiteMainPlayerVideo`。
    for (const path of CALLERS) {
      const source = readSource(path);
      expect(
        source,
        `${path} 不能自己碰 mainSelectors（取选择器的入口只有 isSiteMainPlayerVideo）`,
      ).not.toMatch(/mainSelectors/);
      expect(
        source,
        `${path} 必须调用本文件的 isSiteMainPlayerVideo`,
      ).toMatch(/isSiteMainPlayerVideo\(/);
    }
  });

  it('选择器匹配只有一份实现（两份副本的健壮性曾经不同）', () => {
    // 曾经：firstRunHint 那份有 try/catch，videoRegistry 那份没有 ——
    // 而后者已经接进了装饰性判定的核心路径，
    // 一个改坏 matches 的站点能让整条候选扫描抛掉。
    for (const path of CALLERS) {
      const source = readSource(path);
      expect(
        source,
        `${path} 不能再自己定义一份 matchesSelector`,
      ).not.toMatch(/const\s+matchesSelector\s*=/);
    }

    // 真正还要匹配选择器的那一份（videoRegistry 的 preferred 链）
    // 必须用 shared 里那一份。
    expect(
      readSource('src/content/videoRegistry.ts'),
      'videoRegistry 必须用 shared/domMatches 的那份匹配器',
    ).toMatch(/from\s+'\.\.\/shared\/domMatches'/);
  });

  it('「页面主角豁免」的布局判据住在真源里，不由调用方传进来', () => {
    // `hasReliableLayout` 就住在 ambientPreview.ts 里，
    // 让调用方 import 它再传回来 = 多开一个「调用方传错了」的入口
    //（传错了不会报错，只会静默地判错）。
    for (const path of CALLERS) {
      const source = readSource(path);
      expect(
        source,
        `${path} 不能给 isPageMainContent 传第三个参数`,
      ).not.toMatch(/isPageMainContent\([^)]*,[^)]*,/);
    }
  });
});

/**
 * 「判定的对外一格」—— 判定结果要有一处**别处能读到**的地方。
 *
 * ⚠️ 为什么需要它：规则只有一份（本文件 + VideoRegistry 的两条私有证据），
 * 但**说这句话**的有两处（快捷键路径、接管失败提示），
 * 而它们各自只拿到「这里没有可接管的目标」这一半。
 *
 * 所以这里守的是「登记了就能读到、没登记就是没有」——
 * 没有它，两处会各自去猜「为什么接管不了」，于是又出现两份判据。
 */
describe('ambientPreview：判定结果对外可见', () => {
  afterEach(() => {
    publishAmbientPreview(null);
  });

  it('登记了就能读到，读到的是同一条视频', () => {
    const video = document.createElement('video');

    publishAmbientPreview(video);

    expect(readAmbientPreview()).toBe(video);
  });

  it('登记 null 就是「这一层没有页面预览」', () => {
    const video = document.createElement('video');
    publishAmbientPreview(video);

    publishAmbientPreview(null);

    expect(readAmbientPreview()).toBeNull();
  });
});
