import { matchesSelector } from '../shared/domMatches';
import { getSiteAdapter } from './siteAdapters';

/**
 * 「站点摆在那儿的装饰性自动播放视频」——**唯一一份**判定。
 *
 * ⚠️⚠️ 这份规则原先在两个文件里各写了一份：
 * - `src/content/videoRegistry.ts` 的 `isAmbientPreview()`
 * - `src/content/firstRunHint.ts` 的 `isAmbientAutoplay()`（两条属性判据）
 *
 * 两份已经**漂移**了：videoRegistry 那份被重写成「六条证据」
 * （当时的说法；如今是**七条**），firstRunHint 那份却还停在最老的属性判据上。
 * 后果是同一条视频，
 * 「要不要接管它」说它不是装饰、「要不要给它弹引导」说它是装饰 ——
 * 于是用户在一个用自制播放器的网站上看视频：键盘接管了（对的），
 * 但引导永远不出现（错的，唯一一次教学机会被白白烧掉）。
 *
 * 所以规则必须**只有一份**。这一条与「抄一份的代价是改一处忘一处」正相反：
 * 抄一份在两个文件里**已经发生并造成了 bug**。
 *
 * ─────────────────────────────────────────────────────────────
 * **七条**证据（**全部**成立才算「装饰」），分属**三个地方**：
 *
 * | # | 证据 | 谁提供 |
 * | --- | --- | --- |
 * | 1 | 站点**没有**点名它是主播放器 | 本文件 `isDecorativeAutoplay`（`isMainPlayer`，判据见 `isSiteMainPlayerVideo`） |
 * | 2 | 不是**我们**接管着的 | 本文件 `isDecorativeAutoplay`（`isTakenOverByUs`） |
 * | 3 | 用户**从未**碰过它 | 本文件 `isDecorativeAutoplay`（`wasChosenByUser`）—— 证据只有 VideoRegistry 知道 |
 * | 4 | 它**没有原生 controls** | 本文件 `isDecorativeAutoplay` |
 * | 5 | 它是**站点自己**播起来的 | 本文件 `isDecorativeAutoplay`（`wasStartedBySite`）—— 证据只有 VideoRegistry 知道 |
 * | 6 | 它**没有占满大半个视口** | 本文件 `isPageMainContent`（独立导出） |
 * | 7 | **键盘刚命中过它** | `src/content/videoRegistry.ts` 的私有证据 `wasTargetedByKeyboard` |
 *
 * 换句话说：**前 5 条是共享规则**（本文件的 `isDecorativeAutoplay`），
 * 第 6 条是本文件的另一个 helper，**第 7 条只有 VideoRegistry 知道** ——
 * 它是「我们自己打分打出来的结果」，别人算不出来。
 *
 * ⚠️ 第 5 条为什么不能省：它把「装饰性预览」与「没人开过、正等着用户
 * 先调速再播放的视频」区分开。两者在 DOM 上可能一模一样（没有 controls、
 * 暂停着），区别只在**谁开的**。少了这一条，「先调速再播放」这条最常见的
 * 用法会在任何用自制播放器的网站上直接失效。
 *
 * ⚠️ 第 6 条为什么不能省：站点的**主播放器**常常也是「autoplay + 无 controls」
 * —— 与装饰性预览形状完全一样。只看属性就分不出来，于是 6.0.9 把 iQiyi 首页
 * 的主播放器判成装饰，整页放弃接管（实测：按 = / Space / f 全部无反应，
 * 扩展等于没装）。
 *
 * ⚠️ 第 7 条为什么不能省：没有原生 controls 的自定义播放器（不少站点都自己画
 * 控制条）一旦被站点调 play() 播起来，第 5 条就成立 —— 它会被判成
 * 「装饰性预览」而丢掉，但用户明明正在用快捷键调它。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 第 1 条的判据住在**本文件**（`isSiteMainPlayerVideo`）——
 * 「站点有没有点名这条视频是主播放器」这句话，本项目里**只有这一份**实现：
 *
 * - `src/content/videoRegistry.ts` 的接管路径（`isWatchedVideo` 第 2 档）
 * - `src/content/videoRegistry.ts` 的装饰路径（`computeAmbientPreview` 第 1 条）
 * - `src/content/firstRunHint.ts` 的兜底路径（第 1 条）
 *
 * ⚠️ 曾经有**两份**：一份是「唯一性」版（站点有多个 mainSelectors 时，
 * 命中第一个有候选的选择器就停），一份是「是不是站点点名的」版
 * （任何一条 mainSelector 命中都算）。两版在 YouTube watch 页上不等价
 * （`video.html5-main-video` 与 `.html5-video-player video` 并存）——
 * 于是**同一个模块内部**对同一条视频给出两个相反的结论：
 * 「要不要接管它」说它不是主播放器、「要不要给它弹引导」说它是。
 * 统一之后保住的语义是「**点名**」这个事实：
 * `siteAdapters` 的 `mainSelectors` 里有没有命中这条视频。
 */

/** 站点的「主播放器」豁免比例：占视口 ≥ 60% 就是页面主角，不是装饰。 */
export const PAGE_MAIN_CONTENT_FRACTION = 0.6;

/**
 * 这个文档有没有可用的**布局几何**。
 *
 * 判据是**根元素的 clientWidth**：真实浏览器里它恒等于视口宽度
 * （实测 HTML、SVG、XML 三种文档都是 1280），无布局引擎的环境（如单测用的
 * jsdom）恒为 0。
 *
 * ⚠️ 曾经用「元素的 computed display 是否为空」来判 —— 那是错的，
 * 而且错得很隐蔽：我们自己注入的 runtimeStyles 里有
 * `.vsc-page-fullscreen-video { display: block }`，于是**一进全屏**，
 * 视频元素的 computed display 就从空变成了 'block'，判定从「无布局」翻成
 * 「有布局」。接下来所有 rect 判定（此时恒为 0）开始生效，视频被判成
 * 「看不见」→ 快捷键在全屏里彻底失灵。
 * 根元素的 clientWidth 不受任何页面样式影响，判据本身是稳的。
 *
 * ⚠️ 为什么搬到这里：布局相关的豁免（本文件的 `isPageMainContent`）
 * 与「装饰性预览」在同一条判定链上，判据必须住在**一处** ——
 * 两边各写一份就会漂移，而漂移过一次已经出过事故。
 */
export const hasReliableLayout = (doc: Document | null | undefined): boolean =>
  (doc?.documentElement?.clientWidth ?? 0) > 0;

/**
 * 视口面积（像素²）。拿不到就返回 0 —— 调用方据此放弃「页面主角」豁免。
 *
 * ⚠️ 用**视频自己所在文档**的视口，不是顶层视口：同源 iframe 里的视频
 * 只占顶层视口的一小块，但它是**那个画框里的主要内容**。
 */
export const viewportAreaOf = (video: HTMLVideoElement): number => {
  const view = video.ownerDocument.defaultView ?? window;
  return (view.innerWidth || 0) * (view.innerHeight || 0);
};

/**
 * 站点有没有**点名**这条视频是主播放器。
 *
 * ⚠️ 这是**唯一一份**「站点主播放器」判据（接管路径、装饰路径、
 * 引导的兜底路径都调它）。曾经有两份：
 *
 * - 「唯一性」版：站点有多个 mainSelectors 时，命中第一个有候选的
 *   选择器就停 —— 它回答的是「**哪一个**是主播放器」；
 * - 「是不是站点点名的」版：任何一条 mainSelector 命中都算 ——
 *   它回答的是「站点**点名过**它没有」。
 *
 * ⚠️ 统一之后保住的语义是**后者**：「点名」这个事实。
 * 为什么不保「唯一性」那份：它把「选择器的书写顺序」当成了判据 ——
 * YouTube watch 页上 `video.html5-main-video` 与 `.html5-video-player video`
 * 并存时，站在后者里的那条视频在唯一性版里**不算**主播放器
 * （前面的选择器已经有候选了），而站点明明点名了它所在的容器。
 * 于是**同一个模块内部**对同一条视频给出两个相反的结论：
 * 「要不要接管它」说它不是主播放器、「要不要给它弹引导」说它是。
 *
 * ⚠️ 「多认一两个主播放器」不影响后果：主播放器豁免只是
 * 「不当成装饰物」「优先接管」「可以抢空格」，而这些视频本来就该被当内容看。
 * 反过来「少认」才是会出事的那个方向（该接管的没接管、
 * 该弹引导的没弹）。
 *
 * ⚠️ 为什么主播放器这件事值得单独一条判据：YouTube 的主播放器是
 * **静音自动播放**的（浏览器只允许静音自动播）。若把「静音」当作排除依据，
 * 用户在 YouTube 上按 f 就会没反应 —— 而那正是这个扩展最该工作的场景。
 * 站点能指名谁是主播放器，于是那条禁令就不适用于它。
 *
 * @param video 要问的那条视频。
 * @param hostname 站点适配器按哪个域名匹配（默认当前文档的域名）。
 *   注入它只是为了**单测**（jsdom 的 location 改不动）。
 */
export const isSiteMainPlayerVideo = (
  video: HTMLVideoElement,
  hostname: string = window.location.hostname,
): boolean => {
  const { mainSelectors } = getSiteAdapter(hostname);
  return mainSelectors.some((selector) => matchesSelector(video, selector));
};

/**
 * 这个视频是不是「站点摆在那儿的装饰物，用户从没选过它」。
 *
 * ⚠️ 这是**七条证据里的第 1–5 条**（共享规则）：
 * 第 6 条（占满大半个视口）在 `isPageMainContent`，
 * 第 7 条（键盘刚命中过它）只有 `VideoRegistry` 知道。
 * 三处拼起来才是完整判定 —— 拼装的地方是 `VideoRegistry.computeAmbientPreview`。
 *
 * ⚠️ 这份判定**不依赖布局**：它只看属性与「谁开的」这些证据。
 * 依赖布局的「占满大半个视口」那条在别处判（见 isPageMainContent），
 * 因为在没有布局引擎的环境里（单测的 jsdom）量出来的尺寸恒为 0。
 */
export const isDecorativeAutoplay = (
  video: HTMLVideoElement,
  options: {
    /** 站点有没有点名它是主播放器。 */
    isMainPlayer: boolean;
    /** 用户是否亲手选过它。 */
    wasChosenByUser: boolean;
    /** 是不是**我们**接管着的（进全屏时我们会把 controls 弄掉）。 */
    isTakenOverByUs?: boolean;
    /**
     * 是不是**站点自己**播起来的（autoplay 属性，或站点调 play()）。
     *
     * ⚠️ `undefined` 的含义是「**拿不到证据**」，**不是**「是」。
     * 这一条是**有证据**的判据（证据 = `autoplay` 属性 / 站点调 play()），
     * 证据缺失不等于证据为真 —— 所以 `undefined` 与 `false` 同义：
     * 「不能证明是站点自己开的」→ 不当成装饰物。
     *
     * ⚠️ 为什么这么定：判错的两个方向代价**不对称**。
     * 把「不知道」当成「站点自己开的」→ 视频被判成装饰物 → 扩展不接管它、
     * 引导也不为它弹 → 用户在一个正经播放器上什么都得不到
     * （「功能等于不存在」）。
     * 把「不知道」当成「不是站点自己开的」→ 最多多接管一次、多提示一次 ——
     * 而引导是这个产品**全部**的可见入口，宁可多弹也不能不弹。
     *
     * ⚠️ 目前两个调用方都传明确布尔值（VideoRegistry 问自己的证据表、
     * firstRunHint 的兜底读 `autoplay` 属性），所以这条语义目前**不影响**
     * 线上行为 —— 它写在这里是为了让下一个调用方不会把 `undefined`
     * 当成「站点自己开的」。
     */
    wasStartedBySite?: boolean;
  },
): boolean => {
  // 1. 站点点名它是主播放器 → 那是站点的声明，比我们的推断硬。
  if (options.isMainPlayer) {
    return false;
  }

  // 2. 我们接管着的 → 判定必须对「我们自己造成的变化」免疫。
  //
  // 进全屏时我们把 `video.controls = false`（用自制控制条取代原生控件），
  // 而这会**反射性地移除 `controls` 属性**。于是：
  //   进全屏前：`<video controls autoplay>` → 有 controls → 不是装饰视频 → 接管
  //   进全屏后：controls 属性没了        → 变成「装饰视频」 → **快捷键彻底失灵**
  //
  // 实测（真实浏览器）：进全屏后按 `=` 速度纹丝不动，退出全屏后又好了。
  if (options.isTakenOverByUs) {
    return false;
  }

  // 3. 用户碰过它 → 那是用户自己的选择，任何推断都推翻不了。
  if (options.wasChosenByUser) {
    return false;
  }

  // 4. 有原生控件 = 站点把它当成一个正经播放器给人用。
  if (video.hasAttribute('controls')) {
    return false;
  }

  // 5. 站点自己播起来的（用户没要求过，它自己播起来了）。
  //
  // ⚠️ 这一条**不能省**：少了它，「没人开过、正等着用户先调速再播放的视频」
  // 会被误判成装饰物 —— 那是最常见的用法。
  //
  // ⚠️ 只有**明确的 true** 才算「站点自己开的」：这是**有证据**的判据，
  // `undefined`（拿不到证据）不能当成证据为真（见上面参数的说明）。
  if (options.wasStartedBySite !== true) {
    return false;
  }

  return true;
};

/**
 * 「这一层把哪条视频判成了页面预览」—— 判定的**对外一格**。
 *
 * ⚠️ 为什么判定结果要有一格**别处能读到**的地方：
 *
 * 规则只有一份（本文件 + VideoRegistry 的两条私有证据），但**说这句话**的有两处：
 * - **快捷键路径**：拿不到可接管的目标时，它只知道「这里没有目标」，
 *   不知道「不是没有视频，是有一条被当成页面预览的视频」——
 *   于是它只能问「别的 frame 有没有视频」，别的 frame 说没有，它就**一声不吭**。
 * - **接管失败提示**：要说出「为什么接管不了」，就得知道这条视频是不是页面预览。
 *
 * 而这两处都**够不着 VideoRegistry**：快捷键控制器刻意不依赖它的实现
 * （见 keyboardController.ts 的「只取类型，不引入运行时依赖」），
 * 接管提示则由运行时直接 new 出来、没有接缝。
 *
 * 所以判定结果落在**规则所在的那个模块**里 —— 谁判的谁登记，谁要解释谁来读。
 * ⚠️ 它是**本 frame** 的：内容脚本每个 frame 各有一份，不跨 frame
 * （跨 frame 的「视频在哪儿」是 background 那套广播协议的事）。
 */
let ambientPreviewVideo: HTMLVideoElement | null = null;

/**
 * 登记「这一层把哪条视频判成了页面预览」。
 *
 * 由 VideoRegistry 在**判定刚做完**时调用：判出目标就登记 null
 * （没有页面预览），判不出目标但有页面预览就登记那一条。
 *
 * ⚠️ 登记 null 同样重要：否则上一轮的结论会留在那里，
 * 而「这条视频是不是页面预览」会被用来说错原因。
 */
export const publishAmbientPreview = (video: HTMLVideoElement | null): void => {
  ambientPreviewVideo = video;
};

/**
 * 读出「这一层把哪条视频判成了页面预览」（没有则 null）。
 *
 * ⚠️ 读到的结论是**上一次判定**的：判定由 registry 缓存
 * （见 videoRegistry.ts 的 getWatchedTarget），命中缓存时不会重判，
 * 所以这里读到的也是与那份缓存**同一份**结论 —— 两者不会互相矛盾。
 */
export const readAmbientPreview = (): HTMLVideoElement | null => ambientPreviewVideo;

/**
 * 这个视频是不是「页面主角」（占视口 ≥ 60%）—— 不成立就不是装饰物。
 *
 * 无布局引擎时判不了（量出来的尺寸恒为 0）→ 返回 false，即「不豁免」。
 * 那种环境（单测的 jsdom）里这个豁免本来也测不出来。
 *
 * ⚠️ `hasReliableLayout` 为什么**不**是参数：它就住在**本文件**里，
 * 而让调用方 import 它再传回来，等于多开一个「调用方传错了」的入口
 * （传错了不会报错，只会静默地判错）。判据住在哪，用它的人就自己调。
 */
export const isPageMainContent = (
  video: HTMLVideoElement,
  rect: { width: number; height: number },
): boolean => {
  if (!hasReliableLayout(video.ownerDocument)) {
    return false;
  }

  const viewportArea = viewportAreaOf(video);
  if (viewportArea <= 0) {
    return false;
  }

  return (rect.width * rect.height) / viewportArea >= PAGE_MAIN_CONTENT_FRACTION;
};
