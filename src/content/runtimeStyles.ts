const STYLE_ID = 'vsc-runtime-styles';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/**
 * 页面级提示与视频边缘之间的距离（px）。
 *
 * 调速胶囊（SpeedToast）贴视频**左上角**，接管提示（TakeoverNotice）贴视频
 * **左下角**：两者共用同一个内缩距离，靠不同的角错开。
 *
 * 为什么必须错开：两个提示曾经用逐字相同的锚点公式，都贴在左上角，
 * 而接管提示更宽（154px vs 胶囊 54px）—— 它会把胶囊整个盖住，
 * 用户看到的是「文字压文字」（6.0.9 实测）。
 *
 * 放在这里而不是各自模块里：这两个提示必须**一起**改，
 * 一旦有人只改其中一个的角，就会重新撞车。
 */
export const NOTICE_INSET = 16;

/**
 * 页面级提示的**三套**视觉语言。
 *
 * ⚠️ 为什么是「三套」而不是「一套」：五个页面级提示在产品上是**四类**东西，
 * 全做成一个样子反而更糟。
 *
 * 1. **胶囊**（调速胶囊、接管提示）：都锚在视频上、都是一次性的、
 *    都是「刚刚发生 / 出了点问题」的短提示。
 *    两者**必须像素一致** —— 用户看到两个形状相同的东西却长得不一样，
 *    会以为是两个不同的功能（实测：胶囊 14px、接管提示 13px，
 *    两个 999px 圆角的深色底并排出现，像是两个不相干的功能）。
 * 2. **卡片**（首次引导）：它是一张带关闭按钮的**教学卡片**，
 *    用户要读它、要点它 —— 所以它保留「卡片」身份（自己的底色、
 *    比胶囊直一点的圆角），但**字号、字重、行高、字体族**与胶囊一致：
 *    它是同一个产品的话，就不该换一副嗓子。
 * 3. **状态通知**（扩展已更新，请刷新本页）：第三套，理由见
 *    `NOTICE_STALE_TOKENS` 的注释 —— 它既不是「读数」也不是「教学卡片」，
 *    而是**站着不走的系统消息**，形状得自己一套，
 *    但**字号、字重、行高、字体族仍然与前两套逐项相同**。
 * 4. **常驻小角标**（speedToast 的 badge）：更小更弱，第四类东西，
 *    尺寸不动（见 speedToast.ts）—— 它是「钉在视频上的读数」，
 *    压根不是通知。
 *
 * ⚠️ token 为什么住在本文件：这几个提示分属不同模块（speedToast /
 * takeoverNotice / firstRunHint / runtime），token 若各写一份，
 * 改一处忘一处就会重新漂移 —— 那正是这套视觉语言要消灭的东西。
 *
 * ⚠️ 以前「扩展已更新」那条提示**自己写了一份排版**（runtime.ts 里），
 * 于是它成了唯一一个不跟着 token 走的浮层：改字号、改底色时它不动，
 * 「五个浮层是一套视觉语言」这句话就悄悄作废了。
 * 现在它也住在这里（`NOTICE_STALE_TOKENS`）。
 */

/**
 * 胶囊类提示的排版 token（调速胶囊 + 接管提示共用）。
 *
 * ⚠️ 这里的每个值都会**连带**影响两个派生量：
 * `NOTICE_ROW_HEIGHT`（胶囊那一行有多高）与 `NOTICE_MAX_HEIGHT`
 * （接管提示最多能有多高）。改了这里必须重算那两个 ——
 * 见 runtimeStyles.test.ts 里的高度预算守卫。
 */
export const NOTICE_PILL_TOKENS: Record<string, string> = {
  'font-size': '13px',
  'font-weight': '600',
  'line-height': '1.4',
  padding: '6px 12px',
  'border-radius': '999px',
  'background-color': 'rgba(0, 0, 0, 0.66)',
  color: '#f8fafc',
  'font-family': FONT_STACK,
  /**
   * 淡入淡出：胶囊是「刚刚发生」的一瞥，进出都快。
   *
   * ⚠️ 自定义属性**故意不带 !important**：`prefers-reduced-motion`
   * 的媒体查询要靠 !important 才压得住它（用户的「减少动效」必须赢）。
   * 隔离机制见 setImportantAll 的注释。
   */
  '--vsc-notice-fade': '160ms',
};

/**
 * 卡片类提示的排版 token（首次引导）。
 *
 * 与胶囊的差别只有两处，而且都是**形状**上的：
 * 自己的底色（深蓝灰而不是纯黑）+ 比胶囊直一点的圆角（12px 而不是 999px）。
 *
 * 字号、字重、行高、字体族与胶囊**逐项相同** —— 这是「一套视觉语言」的
 * 承诺：引导是这个产品唯一的入口，它不该看起来像另一个产品。
 */
export const NOTICE_CARD_TOKENS: Record<string, string> = {
  'font-size': '13px',
  'font-weight': '600',
  'line-height': '1.4',
  padding: '10px 16px',
  /**
   * 右侧给**关闭按钮**留的位置。
   *
   * ⚠️ 它必须在这里，而不是由 firstRunHint 单独 `setProperty` 改一次 ——
   * 那样同一个内边距就有**两份**（token 里的 16px 与事后的 26px），
   * 而渲染出来的是哪一份只有浏览器知道。守卫查「源码里有没有引用 token」，
   * 查不出最终 padding 是多少。
   *
   * 放在 token 里还有一个好处：这是**形状**属性（卡片特有的），
   * 与「排版属性两家必须一致」那条承诺不冲突。
   */
  'padding-right': '26px',
  'border-radius': '12px',
  'background-color': 'rgba(15, 23, 42, 0.88)',
  color: '#f8fafc',
  'font-family': FONT_STACK,
  /**
   * 卡片比胶囊**慢一点**淡入（220ms vs 160ms）。
   *
   * 为什么只有它慢：它是一张要**读**的卡片（4 行），胶囊是看一眼就够的
   * 读数。卡片抢注意力的那一下不该和读数一样急。
   */
  '--vsc-notice-fade': '220ms',
};

/**
 * 状态通知类提示的排版 token（扩展已更新，请刷新本页）。
 *
 * ⚠️ 为什么它是**第三套**（而不是并进胶囊或并进卡片）：
 *
 * - **不是胶囊**：胶囊是「刚刚发生的一瞥」（约 1 秒后淡出），
 *   而这条消息**不会自己消失** —— 它只能靠刷新页面才走。
 *   把它做成胶囊的样子，用户会以为它也会消失，然后错过「要刷新页面」
 *   这件唯一重要的事。
 * - **不是卡片**：卡片是这个产品**唯一的入口**（教用户怎么用），
 *   带关闭按钮；而系统消息没有「关闭」这个选项 —— 它的消失方式由
 *   用户决定（刷新），不由一个 × 决定。
 *
 * 但**嗓子必须一样**：字号 / 字重 / 行高 / 字体族与胶囊、卡片**逐项相同**。
 * 「读数还是通知」是产品上的分类，不该变成两副嗓子 ——
 * 用户看到的仍然应该是同一个产品在说同一句话。
 *
 * 形状是它自己的：
 * - 底色更实（黑 0.82 而不是胶囊的 0.66）：系统消息要压得住任何背景；
 * - 圆角更方（10px）：它既不是胶囊（999px）也不是卡片（12px）；
 * - 内边距更松（8px 14px）：一行字，但它要待很久，得待得住。
 */
export const NOTICE_STALE_TOKENS: Record<string, string> = {
  'font-size': '13px',
  'font-weight': '600',
  'line-height': '1.4',
  padding: '8px 14px',
  'border-radius': '10px',
  'background-color': 'rgba(0, 0, 0, 0.82)',
  color: '#f8fafc',
  'font-family': FONT_STACK,
  /**
   * 淡入 220ms：与卡片同速，而不是胶囊的 160ms。
   *
   * 为什么：胶囊是「一扫而过」的读数，而这条消息要求用户**读完并采取行动**
   * （去刷新页面）—— 它要的是「被注意到」，不是「被瞥见」。
   */
  '--vsc-notice-fade': '220ms',
};

/**
 * 「扩展已更新，请刷新本页」这条提示的 DOM id。
 *
 * ⚠️ 为什么住在本文件而不是 runtime.ts：它同时出现在**两个地方** ——
 * runtime.ts 创建节点时的 `element.id`，以及本文件那段
 * `prefers-reduced-motion` 媒体查询里的选择器。
 * 两处各写一份字面量的话，改了一处忘了另一处 = 「减少动效」对这条提示
 * 静默失效 —— 而那恰恰是它最该生效的时刻：扩展刚更新、用户正要读它。
 */
export const EXTENSION_STALE_NOTICE_ID = 'vsc-extension-stale-notice';

/**
 * 视频左上角那一行的高度（px），从视频顶边算起。
 *
 * 这一行是**调速胶囊**占的，而胶囊的排版现在由 `NOTICE_PILL_TOKENS` 决定：
 * 16px 内缩 + 13px 字号 × line-height 1.4 + 上下各 6px 内边距
 * = 16 + 18.2 + 12 = 46.2 → **47px**。
 *
 * 接管提示贴视频左下角时，下边缘必须落在这一行**下面** ——
 * 视频太矮时（高度不足一行 + 一条提示），否则两个提示会重叠。
 *
 * ⚠️ 胶囊的字号从 14px 降到 13px、内边距从 5px 变成 6px ——
 * 两者几乎抵消（少 1.6px 的字号、多 2px 的内边距），这一行只长了 1px。
 * 看着像没变，但它现在是**从 token 推出来的**：改了 token 就必须重算这里，
 * 否则接管提示会爬回胶囊那一行去压住它。
 */
export const NOTICE_ROW_HEIGHT = 47;

/**
 * 接管提示可能占的最大高度（px）。
 *
 * 接管提示的排版现在与胶囊**完全一致**（同一套 `NOTICE_PILL_TOKENS`）：
 * 13px 字号 × line-height 1.4 = 每行 18.2px，上下各 6px 内边距 = 12px。
 * 于是
 *   一行 = 18.2 + 12 = 30.2px
 *   两行 = 36.4 + 12 = 48.4px
 *
 * 英文文案更长（"This video cannot be controlled here"），在窄视频上会折成
 * 两行，所以按**两行**预留，并向上取整到 49。
 *
 * ⚠️ 之前这里写的是 44 —— 那是从「两行 ≈ 44px」估出来的，比实际少了 4.4px。
 * 少算的后果不是「提示被裁掉」，而是**提示的下边缘会越过视口底边**：
 * 窄视频 + 英文长文案 + 矮视频时，用户看到的是一段被切掉一半的字。
 *
 * 只用于「视频太矮时把提示挤到胶囊下面」那条分支的高度预算，
 * 不参与实际定位（定位锚在 bottom 上，不需要知道高度）。
 */
export const NOTICE_MAX_HEIGHT = 49;

/**
 * 网页全屏背板的 DOM id。
 *
 * 它是「此刻处于网页全屏」这个事实的**唯一可靠来源**：
 * enter() 时创建、exit() 时被摘掉，且增删是 body 的直接子节点变化，
 * 因此可以被 MutationObserver 订阅。
 *
 * ⚠️ 不要改用控制条（#vsc-controls）当全屏信号：控制条只是全屏 UI 的
 * 一个零件，它缺席不等于全屏缺席（mount() 在没有可挂载宿主时会直接返回），
 * 而且它的增删不覆盖「退出全屏」这条路径。
 * 详见 speedToast.ts 里 isFullscreenActive() 的注释。
 */
export const FULLSCREEN_OVERLAY_ID = 'vsc-page-fullscreen-overlay';

/**
 * 全屏里的层叠顺序（从下到上）。
 *
 * 这三个值必须**同时**写在 CSS 与 JS 里：控制条、字幕、视频分别由
 * 不同的模块创建（runtimeStyles / fullscreenController），
 * 任何一边单独改都会让某一层被另一层压住。
 *
 * ⚠️ 32 位有符号整数的上限是 2147483647。CSS 的 z-index 用的是有符号
 * 32 位整数，写 2147483648 会溢出成 -2147483648（变成最小值，排在最底层）。
 * 所以真正的顶层不能超过 2147483647。
 *
 * 分层理由：
 * - 视频在最后，是背景层，压低无所谓。
 * - 字幕必须在视频**之上**，否则被视频整个盖住（6.0.8 号称修好的问题，
 *   实测并未生效：字幕原本是 z-index:auto，DOM 顺序排在视频之后也没用）。
 * - 控制条在字幕之上：它出现时正好在画面底部，与字幕重叠，
 *   字幕被它盖住同样等于"字幕消失"。
 *
 * ⚠️ 页面级提示与 live region 排在控制条**之上**（它们是「刚刚发生」的信息，
 *   不该被控制条挡住），而 live region 又在最顶 —— 它虽然**视觉上不可见**，
 *   但它是读屏用户唯一的反馈通道，不该被任何东西压住。
 */
export const OVERLAY_Z_INDEX = 2147483642;
export const VIDEO_Z_INDEX = 2147483643;
export const STAGE_Z_INDEX = 2147483643;
export const SUBTITLE_Z_INDEX = 2147483644;
export const CONTROLS_Z_INDEX = 2147483645;
/**
 * 页面级的一次性提示（调速胶囊、接管提示、首次引导、扩展已更新）。
 *
 * ⚠️ 以前它与 live region **挤在同一个值**（2147483647）—— 五个浮层
 * 全部同层，彼此可能互相盖住。现在它排在 live region 之下，
 * 整条阶梯严格递增（见 runtimeStyles.test.ts 的顺序守卫）。
 */
export const NOTICE_Z_INDEX = 2147483646;
/**
 * 读屏播报通道（`#vsc-live-region`）。
 *
 * 视觉上完全不可见，但**必须留在最顶**：它是读屏用户唯一的反馈通道，
 * 而屏幕阅读器读的是 aria-live 区域的内容，与它是否可见无关。
 */
export const LIVE_REGION_Z_INDEX = 2147483647;

const styles = `
/* --- Page fullscreen overlay --- */

/*
 * ⚠️ 这两条规则是**兜底**，不是生效的那一份。
 *
 * 背板与舞台真正的样式写在**内联 !important** 上
 * （见本文件下半部分「网页全屏背板的样式隔离」）：
 * 这里是**普通作者声明**，站点的 "html > div { display: none !important }"
 * 赢过它 —— 而背板正是 <html> 的直接子节点（6.2.0 改了挂载点）。
 * display 由 setOverlayActive() 按状态**内联**切换，
 * class 只是「此刻处于网页全屏」的标记。
 */

#${FULLSCREEN_OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: ${OVERLAY_Z_INDEX};
  display: none;
  background: #000;
}

#${FULLSCREEN_OVERLAY_ID}.vsc-active {
  display: block;
}

#vsc-page-fullscreen-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  z-index: ${STAGE_Z_INDEX};
}

.vsc-page-fullscreen-video {
  display: block;
  position: fixed;
  inset: 0;
  margin: auto;
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  object-fit: contain;
  z-index: ${VIDEO_Z_INDEX};
  background: #000;
}

.vsc-page-fullscreen-video--reparent {
  isolation: isolate;
}

.vsc-page-fullscreen-video--css-cover {
  /* 页面祖先带 transform/filter/opacity/contain 时会新建层叠上下文，
     把 fixed 视频关在里面；这一模式下 overlay 背板反而会盖住视频，
     所以只靠视频自身的黑底 + object-fit:contain 撑满视口。 */
  isolation: isolate;
}

/* --- Fullscreen controls ---
 *
 * 控制条的样式**不在这里**，在 controlsStyles.ts。
 *
 * 它必须单独放：控制条住在自己的 shadow root 里，页面里这份 <style>
 * 进不去 shadow tree，shadow tree 里的样式也出不来 —— 所以控制条必须
 * 自带一份完整样式。
 *
 * 为什么最后选了 shadow root：我们注入到**任意站点**的 DOM 里，站点的全局
 * CSS 会顺着继承和元素选择器把控制条彻底摧毁。实测一个"有自己的设计系统"
 * 的站点就能把控制条变成红色大块、按钮塌成 22x48、时间变 Comic Sans。
 * 逐属性重声明挡不住作者 !important；all: revert 也不行（只回退一层）。
 * shadow root 是**结构性**的边界，不是逐个属性地打补丁。
 *
 * ⚠️ 这一段曾经写的是"解法不是 shadow DOM"，那是迁移前的旧方案，
 * 早已作废。留着旧说法会让下一个人照着**已经废弃**的思路改代码。
 */

/* --- 页面级提示 ---
 *
 * 调速胶囊（SpeedToast）、常驻角标、接管提示（TakeoverNotice）、
 * 首次引导（FirstRunHint）、扩展已更新提示（runtime.ts）的样式
 * **不在这里** —— 它们写在**内联样式**里，
 * 原因见本文件下半部分「页面级提示的样式隔离」那一节。
 *
 * 为什么不能留在这里：这里这份 <style> 是**普通作者声明**，
 * 而站点的 div { ... !important } 是**带 !important 的作者声明** ——
 * 后者赢。而这五个提示恰恰是「挂在页面里、会被站点的元素选择器命中」
 * 的那一类（控制条住在 shadow root 里，天然不受影响）。
 */

/* --- 读屏播报通道 ---
 *
 * 页面级的一次性提示（调速胶囊、首次引导、接管失败）全是纯视觉元素：
 * 它们只显示一个数字或一句话，读屏用户从中得不到任何信息。
 * 而这恰恰是这个产品**唯一**的反馈通道 —— 控制条 3 秒就隐藏，
 * 键盘调速后如果读屏用户听不到"现在 1.5x"，他无法确认任何操作生效了。
 *
 * 所以这里留一个**视觉上完全不可见**的 live region：它不显示任何东西，
 * 只把同样的文本喂给屏幕阅读器。屏幕阅读器读的是 aria-live 区域的内容，
 * 与它是否在视觉上可见无关 —— 这正是 aria-live 存在的意义。
 *
 * 尺寸必须压到 1px 并 clip：否则这个区域会在页面上占位置、挡住内容。
 * aria-hidden 必须**不**加在这上面：加了等于对读屏用户彻底隐形，
 * 那就与不做一模一样。
 */

#vsc-live-region {
  position: fixed;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  z-index: ${LIVE_REGION_Z_INDEX};
  pointer-events: none;
}

/* --- 降低动效 ---
 *
 * 前庭功能障碍用户对动画敏感（WCAG 2.3.3）。我们的动画只有淡入淡出与
 * 几像素的位移 —— 视觉上很轻，但规则就是规则：用户声明了"减少动效"，
 * 我们就该把过渡关掉，而不是替用户判断"这个动画够轻"。
 *
 * 注意用的是 transition 而不是 animation：我们没有 keyframes 动画，
 * 关掉 transition 就能让所有淡入淡出变成瞬时切换。
 */

@media (prefers-reduced-motion: reduce) {
  #vsc-speed-toast,
  #vsc-first-run-hint,
  #vsc-takeover-notice,
  #${EXTENSION_STALE_NOTICE_ID} {
    /*
     * ⚠️ 这里改的是**自定义属性**，不是 transition 本身。
     *
     * 提示的 transition 写在**内联样式**里（带 !important，见下面
     * 「页面级提示的样式隔离」），而 style 属性在同一优先级里**永远**赢 ——
     * 媒体查询改不动它。时长走自定义属性才改得动：
     * 作者源里带 !important 的声明压得住**普通的**内联声明。
     */
    --vsc-notice-fade: 0ms !important;
  }
}
`;

/* --- 页面级提示的样式隔离 ---
 *
 * 调速胶囊、常驻角标、接管提示、首次引导、扩展已更新提示这五个提示
 * 挂在页面里（浮层层，挂在 <html> 上 —— 见 viewportRoot.ts），
 * 站点的全局 CSS 能顺着元素选择器把它们打穿。
 * 实测一个「有自己的设计系统」的站点：
 *
 *   div { color:#f00 !important; background-color:#0f0 !important;
 *         font-size:40px !important; font-family:"Comic Sans MS" !important;
 *         border-radius:0 !important; padding:20px !important; }
 *
 * 结果是调速胶囊变成洋红底的 Comic Sans 大字（实测 54×30 变成 130×96），
 * 常驻角标的对比度从 11.21:1 掉到 2.29:1 —— 连 AA-large 的 3:1 都过不了。
 *
 * ⚠️ 为什么**不是** shadow root（控制条用的就是它）：
 *
 * 这五个提示必须留在 light DOM 里 ——
 * - 读屏要读它们的文本（调速胶囊是 aria-hidden 的，但接管提示与首次引导
 *   的文案要能被读屏用户拿到）；
 * - 既有单测与 E2E 按 id 找它们、读它们的 textContent；
 * - 全屏时按它们的盒子算坐标。
 * 搬进 shadow root 会同时破坏这三条。
 *
 * 那用什么挡？**style 属性**。
 *
 * 按 CSS Cascade 4，作者源里带 !important 的声明按「特异性」排序，
 * 而 **style 属性高于任何选择器**。于是 `all: initial !important`
 * 能把站点的 `div { ... !important }` 整条掀掉，再逐条 important 写回
 * 我们要的值。真实 Chromium 实测（同一页面）：
 *
 *   只写 `color: ... !important`            → color 保住，font-size 仍 40px
 *   写 `all: initial !important`            → font-size 回到 16px，整条掀掉
 *   页面再加 `#app div { ... !important }`  → `all: initial` 仍然赢
 *
 * ⚠️ 而**我们自己样式表**里的 `#vsc-speed-toast { ... !important }`
 * 挡不住 `#app div { ... !important }`（特异性 1,0,0 vs 1,0,1）——
 * 只有 style 属性能赢。这就是为什么这五个提示的样式搬进了内联样式。
 *
 * ⚠️ 因此有一条铁律：**凡是写在这五个提示上的内联样式都必须带 !important**，
 * 包括后来才写的位置坐标（left/top/bottom/right）——
 * 否则 `all: initial`（important）会把后写的普通内联样式盖掉。
 */

/**
 * 提示的淡入淡出时长。
 *
 * 走自定义属性而不是写死，是为了让 `prefers-reduced-motion` 的媒体查询
 * 改得动它（见 styles 里那段媒体查询的注释）。
 */
export const NOTICE_FADE = 'opacity var(--vsc-notice-fade, 160ms) ease';
// ⚠️ 括号里的 160ms 是**兜底值**，不是任何一套提示的真实时长：
// 外壳总会先写 `--vsc-notice-fade`（见 NOTICE_SHELL_STYLES），
// 各套 token 再按自己的节奏覆盖它（状态通知是 220ms）。
// 写在这里是为了「万一某个分支没写那个自定义属性」时仍有动画，
// 而不是让它一点都不动。

/**
 * 页面级提示共用的「外壳」。
 *
 * `all: initial` 之后的**逐条 important**：把初始值里那些不适合提示的值
 * （display:inline、background:transparent 之外的一切）换成本产品要的样子。
 */
export const NOTICE_SHELL_STYLES: Record<string, string> = {
  position: 'fixed',
  display: 'block',
  'box-sizing': 'border-box',
  margin: '0',
  padding: '0',
  border: 'none',
  outline: 'none',
  'background-color': 'transparent',
  color: '#f8fafc',
  'font-family': FONT_STACK,
  'font-style': 'normal',
  'font-weight': '600',
  'font-variant-numeric': 'tabular-nums',
  'line-height': '1.4',
  'text-align': 'left',
  'white-space': 'normal',
  'letter-spacing': 'normal',
  'word-spacing': 'normal',
  'text-transform': 'none',
  'text-decoration': 'none',
  'text-indent': '0',
  'text-shadow': 'none',
  'box-shadow': 'none',
  'vertical-align': 'baseline',
  opacity: '0',
  visibility: 'visible',
  overflow: 'visible',
  'pointer-events': 'none',
  'z-index': String(NOTICE_Z_INDEX),
  // 淡入淡出的时长：普通内联声明（媒体查询的 !important 才压得住它）。
  '--vsc-notice-fade': '160ms',
  transition: NOTICE_FADE,
};

/* ------------------------------------------------------------------ *
 * 网页全屏背板的样式隔离
 *
 * ⚠️ 为什么背板也要内联隔离（6.2.0 回归的根因）：
 *
 * 6.2.0 把浮层从 `<body>` 挂到了 `<html>`（见 viewportRoot.ts）——
 * **挂载点换了，隔离策略却没跟着换**：背板与控制条宿主的样式仍留在
 * 注入的那份 `<style>` 里，而那是**普通作者声明**。
 *
 * 于是站点一条 `html > div { display: none !important }`
 * （「只认我自己的顶层节点」是站点做框架布局时的常见写法）就能打掉它们：
 * 背板没了 → 视频退化成 css-cover；控制条没了 → **连退出按钮都没有**，
 * 用户只剩 Escape 能退出全屏。
 *
 * ⚠️ 而**内联 `!important` 在级联里高于任何作者 `!important`**
 * （style 属性高于所有选择器），所以底座必须内联 ——
 * 这与页面级提示（`isolateNotice`）用的是同一套机制，不另发明一套。
 * ------------------------------------------------------------------ */

/**
 * 背板的**内联隔离底座**（`all: initial` 之后逐条 important 写回）。
 *
 * 与样式表里那段 `#vsc-page-fullscreen-overlay { … }` 一一对应，
 * 区别只有两点：这里是**内联**的，且 `display` 不在这里（它按状态切）。
 */
export const OVERLAY_ISOLATION_STYLES: Record<string, string> = {
  position: 'fixed',
  inset: '0',
  'z-index': String(OVERLAY_Z_INDEX),
  'box-sizing': 'border-box',
  /**
   * ⚠️ 写 `auto` 而不是 `100%`：`inset: 0` + `auto` 的几何与今天完全一致
   * （铺满视口），而 `100%` 是按包含块算的 —— 页面带滚动条时可能比视口宽。
   */
  width: 'auto',
  height: 'auto',
  margin: '0',
  padding: '0',
  border: 'none',
  background: '#000',
};

/**
 * 舞台（背板里装视频的那一层）的**内联隔离底座**。
 *
 * ⚠️ 为什么它也要隔离：舞台是一个 `div`，而站点爱写 `div { … !important }`。
 * 舞台没了 → 视频没了 → 全屏画面整个消失。
 */
export const STAGE_ISOLATION_STYLES: Record<string, string> = {
  position: 'absolute',
  inset: '0',
  display: 'flex',
  'align-items': 'center',
  'justify-content': 'center',
  overflow: 'hidden',
  'z-index': String(STAGE_Z_INDEX),
};

/**
 * 写一条内联样式，**带 !important**。
 *
 * 为什么所有写内联样式的地方都得用它：见上面「样式隔离」那段的铁律。
 */
export const setImportant = (element: HTMLElement, property: string, value: string): void => {
  element.style.setProperty(property, value, 'important');
};

/**
 * 批量写内联样式，全部带 !important —— **自定义属性除外**。
 *
 * ⚠️ 自定义属性是**故意**不写 !important 的：
 *
 * 淡入淡出的时长走自定义属性（见 NOTICE_FADE），而
 * `prefers-reduced-motion` 的媒体查询要靠 !important 才能压住它 ——
 * 按 CSS Cascade，**带 !important 的作者声明**压得住普通的内联声明，
 * 而内联的 !important 又压得住任何选择器。
 *
 * 于是：
 * - 媒体查询写 `--vsc-notice-fade: 0ms !important` → 压得住我们的普通内联 ✓
 * - 我们的内联若也带 !important → 媒体查询就再也压不动了 ✗
 *
 * 这个取舍是刻意的：**用户的「减少动效」偏好必须赢**。
 * 代价是站点的 CSS 有可能改到这个自定义属性（它得知道这个名字才行），
 * 后果不过是淡入淡出慢一点 —— 远比「用户明确要求了关掉动效却关不掉」轻。
 */
export const setImportantAll = (element: HTMLElement, styles: Record<string, string>): void => {
  Object.entries(styles).forEach(([property, value]) => {
    if (property.startsWith('--')) {
      element.style.setProperty(property, value);
      return;
    }
    setImportant(element, property, value);
  });
};

/**
 * 把一个页面级提示节点**隔离**起来。
 *
 * @param element 提示节点
 * @param styles 这个提示自己的外观（叠在共用外壳之上）
 */
export const isolateNotice = (
  element: HTMLElement,
  styles: Record<string, string> = {},
): void => {
  // `all` 必须**第一个**声明：它是简写，会把后面所有长写属性都盖住
  // （同一优先级下后声明的赢）。先把整个 style 属性摘掉再重建，
  // 保证声明顺序永远是「all → 外壳 → 本提示」。
  element.removeAttribute('style');
  setImportant(element, 'all', 'initial');
  setImportantAll(element, NOTICE_SHELL_STYLES);
  setImportantAll(element, styles);
};

/**
 * 把网页全屏背板（连同它里面的舞台）**隔离**起来。
 *
 * 与 `isolateNotice` 同一套机制：`all: initial !important` 起手，
 * 再把我们要的每一条逐条 important 写回。
 *
 * ⚠️ 必须在**挂上页面之前**调用：站点的一条全局 CSS 随时可能命中它，
 * 而背板是要铺满整个视口的，样式被打穿就没有「全屏」可言了。
 *
 * @param overlay 背板（#vsc-page-fullscreen-overlay）
 * @param stage 舞台（#vsc-page-fullscreen-stage）
 */
export const isolateFullscreenOverlay = (overlay: HTMLElement, stage: HTMLElement): void => {
  overlay.removeAttribute('style');
  setImportant(overlay, 'all', 'initial');
  setImportantAll(overlay, OVERLAY_ISOLATION_STYLES);
  // 起始状态是「不显示」——与样式表里的 `display: none` 保持一致。
  setImportant(overlay, 'display', 'none');

  stage.removeAttribute('style');
  setImportant(stage, 'all', 'initial');
  setImportantAll(stage, STAGE_ISOLATION_STYLES);
};

/**
 * 背板的显隐。
 *
 * ⚠️ `display` **必须**同时写内联：样式表里的 `.vsc-active { display: block }`
 * 是普通作者声明，站点的 `html > div { display: none !important }` 赢 ——
 * 实测症状是「视频回退成 css-cover、页面滚动锁死、却没有控制条也没有退出按钮」。
 * 内联 `!important` 赢过任何作者 `!important`。
 *
 * class 照旧增删：它是「此刻处于网页全屏」的标记，
 * 单测与 e2e 都按它判断（speedToast 的 isFullscreenActive() 也看它）。
 */
export const setOverlayActive = (overlay: HTMLElement, active: boolean): void => {
  overlay.classList.toggle('vsc-active', active);
  setImportant(overlay, 'display', active ? 'block' : 'none');
};

/**
 * 让提示显形（淡入）。
 *
 * 显形走**内联 opacity**而不是 CSS 类：类只能由样式表控制，
 * 而样式表里的普通声明挡不住站点的 !important（见上面那段说明）。
 * `.vsc-visible` 类仍然照旧增删 —— 它是「这个提示正显示着」的标记，
 * 单测与 E2E 都按它判断。
 */
export const showNotice = (element: HTMLElement, visibleClass: string): void => {
  element.classList.remove(visibleClass);
  element.style.setProperty('opacity', '0', 'important');
  // 强制回流：让淡入动画每次都能重新开始（否则连续两次显示是「闪一下」）。
  void element.offsetWidth;
  element.classList.add(visibleClass);
  element.style.setProperty('opacity', '1', 'important');
};

/** 让提示淡出。 */
export const hideNotice = (element: HTMLElement, visibleClass: string): void => {
  element.classList.remove(visibleClass);
  element.style.setProperty('opacity', '0', 'important');
};

// 缓存已注入的节点：仅靠 document.getElementById 只能确认「现在在文档里」，
// 但被移除后还想知道要不要重建，所以持引用 + isConnected 判定（与 speedToast 同思路）。
let styleElement: HTMLStyleElement | null = null;
let styleWatcher: MutationObserver | null = null;

const injectStyles = () => {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styles;
  document.documentElement.appendChild(style);
  styleElement = style;
};

export const installRuntimeStyles = () => {
  // 自愈：SPA 重建、站点清理外来节点都可能把 style 摘掉；脱离文档就重建，
  // 否则 overlay/controls 会退化成无定位样式（position 从 fixed 变 static）。
  if (styleElement && styleElement.isConnected) {
    return;
  }

  injectStyles();

  // 被移除后不一定再有人调用本函数（全屏期间用户可能不再操作），
  // 只靠调用时检查不够；挂一个轻量观察者盯 html 的直接子节点，
  // 发现样式脱离文档立刻重注入。只 observe childList、不递归，开销可忽略。
  if (!styleWatcher) {
    styleWatcher = new MutationObserver(() => {
      if (styleElement && !styleElement.isConnected) {
        injectStyles();
      }
    });
    styleWatcher.observe(document.documentElement, { childList: true });
  }
};

/**
 * 撤掉注入的 runtime 样式并停掉自愈观察者。
 *
 * ⚠️ 为什么需要这个：扩展上下文失效（扩展被更新/重载）时，运行时会
 * `stop()` 掉自己创建的**一切** —— 胶囊、角标、live region、各种提示。
 * 但这段 `<style>` 原来不在那条清理路径上：它是模块级变量，
 * 没有卸载入口，于是旧页面上会永远留着一个 `<style id="vsc-runtime-styles">`。
 *
 * 实测（扩展重载后，旧页面上的残留节点）：
 *   vsc-runtime-styles count=1，其余（胶囊/角标/live region/提示）全是 0
 *
 * 影响很小（那段 CSS 只样式化我们自己的 id），但它是「东西没被释放」
 * 的一个实例 —— 而且它会让「旧页面上的扩展已经彻底退场」这句话不成立。
 *
 * ⚠️ 必须先断开观察者再摘节点：否则摘的那一刻观察者会看到
 * 「style 脱离文档」并**立刻重注入**，等于没摘。
 */
export const uninstallRuntimeStyles = () => {
  styleWatcher?.disconnect();
  styleWatcher = null;

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  // 兜底：模块变量可能是被别处摘掉之后重建的（或页面重建了 <html>），
  // 按 id 再摘一次，保证「卸载后页面里一个都不剩」。
  document.getElementById(STYLE_ID)?.remove();
};
