/**
 * 读屏播报通道。
 *
 * 为什么需要它：这个产品**全部**的用户可见反馈都是视觉元素 —— 调速胶囊
 * 显示一个 "1.5x"、首次引导显示两行字、接管失败显示一句话。读屏用户从这些
 * 元素里得不到任何信息：它们要么是 `aria-hidden="true"`，要么只是一个
 * 没有语义的视觉节点。
 *
 * 而这恰恰是产品**唯一**的反馈通道：控制条 3 秒无操作就隐藏，键盘调速时它
 * 往往根本不在屏幕上。于是读屏用户按了 `=`，什么也听不到 —— 他无法确认
 * 任何操作生效了。这不是"体验差一点"，而是**功能对这一类用户不可用**。
 *
 * 做法：一个视觉上完全不可见（1px + clip）的 `role="status"` 区域，
 * 把同样的文本喂给屏幕阅读器。屏幕阅读器读的是 aria-live 区域的内容，
 * 与它在视觉上是否可见无关 —— 这正是 aria-live 存在的意义。
 *
 * 三个提示各自播报自己的内容，但共用这一个区域：屏幕上同时出现两条提示
 * 的概率极低，而多个 live region 会让读屏用户听到互相打断的播报。
 *
 * ## 串行队列
 *
 * 两条播报通道（普通播报 `announce` 与节流播报 `announceThrottled`）写的
 * 是**同一个** live region，而写入即替换 —— 后来的消息会把先前的**整段**
 * 顶掉。实测的 live region 内容序列是：
 *
 *   [null, "播放速度 1.1x", "网页全屏 · f\n= / - 调速\n…"]
 *
 * 首条倍速播报被整段引导文案顶掉了：读屏用户按下 `=` 之后**什么都没听到**
 * —— 而那条倍速播报恰恰是整个产品对读屏用户最重要的确认。
 *
 * 所以这里加了一条**串行队列**：消息按到达顺序排队。一条消息被写进
 * live region 之后要占住它一小段时间（`MESSAGE_HOLD`），下一条才顶上。
 * 两条消息于是都会被读屏器读到，顺序也保持一致。
 *
 * ⚠️ 占位时长是**固定**的，不随文案长度变化：长文案（首次引导那四行）
 * 不会把后面的短文案饿死 —— 每条消息最多只让后面那条等 `MESSAGE_HOLD`。
 * 读屏器自己会把长文案整段念完，我们不需要替它估算朗读时长。
 */

const LIVE_REGION_ID = 'vsc-live-region';

/** 重复同一句话时的重新播报延迟（毫秒）。 */
const REANNOUNCE_DELAY = 50;

/**
 * 一条消息占住 live region 的时间（毫秒）。
 *
 * 这段时间是「读屏器还没来得及取走这条消息」的余量。太短的话两次写入
 * 会被读屏器合并成一条（等于丢了一条播报）；太长则每条消息都要等它
 * 才轮到下一条，用户连按十次快进就要等好几秒。
 *
 * 500ms 是个折中：远小于读屏器念完一句的时间（所以队列不会拖住朗读），
 * 又远大于浏览器把 DOM 变化同步给读屏器所需的时间（所以不会漏）。
 */
const MESSAGE_HOLD = 500;

/**
 * 队列上限。
 *
 * 队列按到达顺序排，理论上可以无限增长（用户狂按快进）。超过上限时丢掉
 * **最旧**的那条：宁可少播一条旧的，也不能让最新的那条永远排不到 ——
 * 用户最需要知道的是「现在」的状态。
 */
const MAX_QUEUE_LENGTH = 8;

let region: HTMLElement | null = null;
let announceTimer: number | null = null;
let holdTimer: number | null = null;
/** 等待上屏的消息（按到达顺序）。 */
let queue: string[] = [];
/** 当前占着 live region 的那条；null = 通道空着。 */
let activeText: string | null = null;
/** 当前那条是什么时候上屏的（毫秒时间戳）。 */
let activeSince = 0;

/**
 * 连续变化的播报之间的最小间隔（毫秒）。
 *
 * 为什么需要节流：`aria-live="polite"` 不是「丢弃」，而是**排队** ——
 * 读屏用户会一条一条听下去。连续调速时每 120ms 就有一条新值要播报，
 * 排队速度远快于朗读速度，队列会**无界增长**：用户松开键之后，
 * 读屏还在念一分钟前的 1.3 倍、1.4 倍、1.5 倍……
 *
 * 实测（jsdom 里数 live region 的 DOM 变更次数）：按住 `=` 一秒 →
 * live region 被写 **9 次** → 读屏要念 9 句。
 *
 * 1 秒这个间隔的取舍：单次轻点 `=` 仍然**立刻**播报（不受影响），
 * 而长按时每 1 秒最多一句，且永远播**最新**的值 ——
 * 用户只关心「最后停在几倍」，中间那些过程值对他没有价值。
 */
const ANNOUNCE_MIN_INTERVAL = 1000;

let throttleTimer: number | null = null;
let pendingThrottledText: string | null = null;
let lastThrottledText: string | null = null;
let lastThrottledAt = 0;

/**
 * 建一个**空**的 live region。
 *
 * ⚠️ 必须先存在、内容后变 —— 这是 aria-live 的通行要求。把**带内容的**
 * 节点插进 DOM，部分读屏器（尤其 VoiceOver / JAWS 的某些配置）不会播报
 * 首条内容。所以内容脚本启动时就把空节点建好（见 prepareLiveRegion），
 * 这里只负责「造节点」这件事。
 */
const createRegion = (): HTMLElement | null => {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  const element = document.createElement('div');
  element.id = LIVE_REGION_ID;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  // ⚠️ 这里**故意**留在 <body> 上，不跟着别的浮层搬到 <html>（见 viewportRoot.ts）。
  //
  // 理由：读屏播报靠的是「节点存在 + 内容变化」，与它在哪儿**毫无关系** ——
  // 这个节点视觉上只有 1px 且被裁掉，站点给 body 加 transform 让它偏几个像素，
  // 读屏器一个字都不会少念。而留在 <body> 里对读屏器更常规，
  // 也少一处「浮层挂到 <html> 上会不会影响无障碍树」的疑虑。
  document.body.appendChild(element);
  region = element;
  return element;
};

/**
 * 取（必要时重建）live region 节点。
 *
 * 自愈的必要性与其他注入节点相同：个别站点会主动清理不认识的外来 DOM，
 * 节点被摘走后若继续复用游离引用，播报会静默失效。
 */
const ensureRegion = (): HTMLElement | null => {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  if (region && region.isConnected) {
    return region;
  }

  return createRegion();
};

/**
 * 提前把空的 live region 建好。
 *
 * 内容脚本启动时调用（见 runtime.ts 的 start()）。
 *
 * 为什么必须提前：aria-live 的通行要求是「live region 必须先存在于无障碍树里，
 * 内容后变」。惰性创建的话，第一次调速时是「插入一个带内容的节点」——
 * 部分读屏器不会播报首条内容。而那条首条恰恰是整个产品对读屏用户最重要的
 * 确认（「按了 `=` 之后到底生效没有」）。
 */
export const prepareLiveRegion = () => {
  ensureRegion();
};

const clearAnnounceTimer = () => {
  if (announceTimer !== null) {
    window.clearTimeout(announceTimer);
    announceTimer = null;
  }
};

const clearHoldTimer = () => {
  if (holdTimer !== null) {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
};

/**
 * 站点把节点摘走了：队列里的消息读屏器根本没看到过，状态要重来。
 *
 * 不重来的话，队列会以为「当前那条还在占位」，新来的消息被塞进队列里
 * 等一个永远不会到来的释放时机 —— 播报就此静默失效。
 */
const resetIfRegionLost = () => {
  if (!region || region.isConnected) {
    return;
  }

  region = null;
  activeText = null;
  queue = [];
  clearHoldTimer();
  // 这个待写回的定时器握着的是**已经脱离文档**的旧节点，写进去没人看得见。
  clearAnnounceTimer();
};

/**
 * 把文本写进 live region。
 *
 * 重复同一句话时需要重新播报：屏幕阅读器只在**内容发生变化**时才会播报，
 * 把同样的文字再写一遍不算变化。所以清空一次、隔一小段时间再写回去。
 */
const writeText = (text: string) => {
  const element = ensureRegion();
  if (!element) {
    return;
  }

  clearAnnounceTimer();

  if (element.textContent !== text) {
    element.textContent = text;
    return;
  }

  element.textContent = '';
  announceTimer = window.setTimeout(() => {
    announceTimer = null;
    // ⚠️ 过期的不许写回来：这条写回是「重播当前那条」，若当前那条已经被
    // 换掉（写进了更新的消息），写回来就是把**旧消息**盖在新消息上面。
    if (element.isConnected && activeText === text && element.textContent === '') {
      element.textContent = text;
    }
  }, REANNOUNCE_DELAY);
};

/**
 * 当前那条占位结束：把队首换上来。
 *
 * 队列空了就把通道让出来（activeText = null），下一条消息可以直接上屏。
 */
const releaseSlot = () => {
  clearHoldTimer();

  if (activeText === null) {
    return;
  }

  activeText = null;

  if (queue.length === 0) {
    return;
  }

  const next = queue.shift()!;
  activeText = next;
  activeSince = Date.now();
  writeText(next);
  scheduleHold();
};

const scheduleHold = () => {
  clearHoldTimer();
  holdTimer = window.setTimeout(releaseSlot, MESSAGE_HOLD);
};

/**
 * 把一条消息放进队列（**队列的唯一入口**）。
 *
 * `announce` 与 `announceThrottled` 都走这里，所以两条通道不会互相顶掉。
 */
const enqueue = (text: string) => {
  resetIfRegionLost();

  // 当前那条已经占位很久了 → 让位，新消息直接上屏。
  //
  // 为什么要这条「按实际年龄判断」的快路径，而不是只靠计时器：
  // 1. 标签页切到后台时浏览器会把定时器节流到 1 秒以上，计时器可能晚到；
  // 2. 系统时钟被调整时（跨夏令时、用户改时间）定时器的相对关系也会乱。
  // 读**真实经过的时间**比读「我以为过了多久」可靠。
  if (activeText !== null && Date.now() - activeSince >= MESSAGE_HOLD) {
    releaseSlot();
  }

  if (activeText === null) {
    activeText = text;
    activeSince = Date.now();
    writeText(text);
    scheduleHold();
    return;
  }

  if (activeText === text) {
    // 同一条消息的重复播报：立刻重播（读屏器只在内容变化时才出声）。
    activeSince = Date.now();
    writeText(text);
    scheduleHold();
    return;
  }

  if (queue.length >= MAX_QUEUE_LENGTH) {
    // 丢掉最旧的一条：用户最需要知道的是「现在」，不是十分钟前。
    queue.shift();
  }

  queue.push(text);
};

/**
 * 播报一条文本。
 *
 * `role="status"` + `aria-live="polite"` 的组合是「非紧急、不打断当前朗读」
 * 的正确选择：用户正在读别的东西时，播报会排队等当前这句读完。
 */
export const announce = (text: string) => {
  // 非节流消息与节流消息互不知情，两边的状态会各说各话：
  // 攒在 pending 里的那条倍速会在 1 秒后才播出来 —— 那时用户已经听到别的
  // 消息了，他听到的是一条**过期**的倍速。
  pendingThrottledText = null;
  if (throttleTimer !== null) {
    window.clearTimeout(throttleTimer);
    throttleTimer = null;
  }

  // 节流只作用于「连续同类消息」：被一条非节流消息打断之后，
  // 下一条节流消息重新起算窗口（可以立刻播报）。
  lastThrottledAt = 0;

  enqueue(text);
};

/** 清理。内容脚本卸载时调用，避免留下一个孤儿节点。 */
export const destroyLiveRegion = () => {
  clearAnnounceTimer();
  clearHoldTimer();

  if (throttleTimer !== null) {
    window.clearTimeout(throttleTimer);
    throttleTimer = null;
  }

  pendingThrottledText = null;
  lastThrottledText = null;
  lastThrottledAt = 0;

  queue = [];
  activeText = null;
  activeSince = 0;

  region?.remove();
  region = null;
};

/**
 * 播报一条「会连续变化」的消息。
 *
 * 与 `announce` 的区别：它在短时间内只播一次，且播的永远是**最新**的那条。
 * 适合「倍速」「进度」这类每 100 多毫秒就变一次的值。
 *
 * 单次调用（间隔已经够了）走的是立刻播报 —— 所以「轻点一下 `=`」
 * 的体验与以前完全一样。
 */
export const announceThrottled = (text: string) => {
  const now = Date.now();
  const elapsed = now - lastThrottledAt;

  if (elapsed >= ANNOUNCE_MIN_INTERVAL) {
    lastThrottledAt = now;
    lastThrottledText = text;
    pendingThrottledText = null;
    // 走队列（而不是 announce）：announce 会清掉节流状态、清掉 pending ——
    // 那会把「连续同类消息」的窗口自己打断掉。
    enqueue(text);
    return;
  }

  // 攒下最新的一条；中间那些旧值不播（用户只关心最后那个）。
  pendingThrottledText = text;

  if (throttleTimer === null) {
    throttleTimer = window.setTimeout(() => {
      throttleTimer = null;
      const pending = pendingThrottledText;
      pendingThrottledText = null;
      if (pending === null || pending === lastThrottledText) {
        return;
      }

      lastThrottledAt = Date.now();
      lastThrottledText = pending;
      enqueue(pending);
    }, ANNOUNCE_MIN_INTERVAL - elapsed);
  }
};
