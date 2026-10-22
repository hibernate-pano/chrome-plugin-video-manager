import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FRAME_EXPAND_MESSAGE,
  FRAME_RESTORE_MESSAGE,
  FrameExpander,
} from './iframeExpansion';

/**
 * 「iframe 里的网页全屏」的单元测试。
 *
 * 这个模块的两侧都能在 jsdom 里测：
 * - 父文档侧：靠 **message 事件**驱动。jsdom 的 window.postMessage 不填
 *   event.source（它自己的 TODO），所以这里直接派发带 source 的
 *   MessageEvent —— 那正是浏览器会交给我们的东西。
 * - 子文档侧：靠注入一个「父窗口」来观察我们发出的请求。
 *
 * ⚠️ 但 jsdom 没有布局引擎，「撑大之后 iframe 真的铺满顶层视口」这件事
 * jsdom 证不出来 —— 那部分由 tests/e2e/iframe-fullscreen.spec.js 在
 * 真实 Chromium 里量浏览器的实际渲染结果。
 */

/** 造一个「我们被嵌在别人的 frame 里」的假窗口，并记录我们发给父文档的消息。 */
const createEmbeddedWindow = () => {
  const posted: { data: { type?: unknown }; targetOrigin: string }[] = [];
  const listeners = new Map<string, ((event: Event) => void)[]>();

  const parent = {
    postMessage: (data: { type?: unknown }, targetOrigin: string) => {
      posted.push({ data, targetOrigin });
    },
  };

  const win = {
    parent,
    addEventListener: (type: string, handler: (event: Event) => void) => {
      const existing = listeners.get(type) ?? [];
      existing.push(handler);
      listeners.set(type, existing);
    },
    removeEventListener: (type: string, handler: (event: Event) => void) => {
      const existing = listeners.get(type) ?? [];
      const index = existing.indexOf(handler);
      if (index >= 0) {
        existing.splice(index, 1);
      }
    },
    dispatchEvent: (event: Event) => {
      (listeners.get(event.type) ?? []).forEach((handler) => handler(event));
      return true;
    },
  };

  return { win: win as unknown as Window, posted };
};

/** 在真实窗口里派发一条「来自某个 iframe」的消息。 */
const postFromFrame = (frame: HTMLIFrameElement, type: string) => {
  const event = new MessageEvent('message', {
    data: { type },
    source: frame.contentWindow as unknown as Window,
  });
  window.dispatchEvent(event);
};

const expanders: FrameExpander[] = [];

/** 造一个装好监听器的父文档侧实例，并在测试结束后卸掉。 */
const createParentExpander = () => {
  const expander = new FrameExpander(window, document);
  expander.install();
  expanders.push(expander);
  return expander;
};

const createFrame = (inlineStyle?: string) => {
  const frame = document.createElement('iframe');
  if (inlineStyle !== undefined) {
    frame.setAttribute('style', inlineStyle);
  }
  document.body.appendChild(frame);
  return frame;
};

/**
 * 造一个「播放器卡片」：祖先带 transform，里面装着 iframe。
 *
 * 这正是 B2 的现场：撑大的 iframe 是 `position: fixed`，而祖先上的 transform
 * 会成为它的**包含块** —— iframe 于是被关在卡片那么大的盒子里，铺不满视口。
 */
const createCardWithFrame = (ancestorStyle: string) => {
  const card = document.createElement('div');
  card.setAttribute('style', ancestorStyle);
  const frame = document.createElement('iframe');
  card.appendChild(frame);
  document.body.appendChild(card);
  return { card, frame };
};

describe('FrameExpander', () => {
  afterEach(() => {
    while (expanders.length > 0) {
      expanders.pop()?.uninstall();
    }
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    document.body.removeAttribute('style');
  });

  describe('父文档侧：认领子 frame 的撑大请求', () => {
    it('把发出请求的那个 iframe 撑满自己的视口', () => {
      const frame = createFrame();
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);

      expect(frame.style.getPropertyValue('position')).toBe('fixed');
      expect(frame.style.getPropertyValue('width')).toBe('100vw');
      expect(frame.style.getPropertyValue('height')).toBe('100vh');
      // 必须带 !important：站点一条全局 CSS 就能压住普通的内联样式。
      expect(frame.getAttribute('style')).toContain('!important');
      // z-index 要压过页面里的一切，且不能超过 32 位有符号整数的上限。
      expect(frame.style.getPropertyValue('z-index')).toBe('2147483647');
      // ⚠️ transform 必须清掉：站点很爱给 iframe 加 transform: scale(...)，
      // 留着它，撑大的就是「缩放后的那个框」，铺不满视口。
      expect(frame.style.getPropertyValue('transform'), 'transform 必须被清掉').toBe('none');
      // max-width/max-height 同理：站点的自适应布局常用它们限制 iframe 尺寸。
      expect(frame.style.getPropertyValue('max-width')).toBe('none');
      expect(frame.style.getPropertyValue('max-height')).toBe('none');
      // margin / border / padding 也要归零，否则边框会挤掉几个像素。
      expect(frame.style.getPropertyValue('margin')).toBe('0px');
      expect(frame.style.getPropertyValue('border')).toBe('0px');
      expect(frame.style.getPropertyValue('padding')).toBe('0px');
    });

    it('只认领发出消息的那一个 iframe，别的 iframe 不动', () => {
      const first = createFrame();
      const second = createFrame();
      createParentExpander();

      postFromFrame(second, FRAME_EXPAND_MESSAGE);

      expect(second.style.getPropertyValue('position')).toBe('fixed');
      expect(first.style.getPropertyValue('position')).toBe('');
      expect(first.getAttribute('style')).toBeNull();
    });

    it('顶层窗口自己发来的消息一律忽略（页面伪造消息的门被堵住）', () => {
      const frame = createFrame();
      createParentExpander();

      // source 是顶层窗口自己：顶层文档里没有任何 iframe 的 contentWindow
      // 等于顶层窗口，比对不上 → 必须原样不动。
      const forged = new MessageEvent('message', {
        data: { type: FRAME_EXPAND_MESSAGE },
        source: window,
      });
      window.dispatchEvent(forged);

      expect(frame.getAttribute('style')).toBeNull();
      expect(document.body.style.overflow).toBe('');
    });

    it('消息里自称要撑大哪个 iframe 也没用（消息体里根本没有这个字段）', () => {
      const frame = createFrame();
      createParentExpander();

      const forged = new MessageEvent('message', {
        data: { type: FRAME_EXPAND_MESSAGE, target: 'f1' },
        source: window,
      });
      window.dispatchEvent(forged);

      expect(frame.getAttribute('style')).toBeNull();
    });

    it('撑大期间锁住顶层页面的滚动条，还原时把它放回去', () => {
      const frame = createFrame();
      document.body.style.overflow = 'scroll';
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expect(document.body.style.overflow).toBe('hidden');

      postFromFrame(frame, FRAME_RESTORE_MESSAGE);
      expect(document.body.style.overflow).toBe('scroll');
    });

    it('还原请求把 iframe 原来的内联样式原样还回去', () => {
      const original = 'width: 320px; height: 220px; border: 1px solid red';
      const frame = createFrame(original);
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expect(frame.getAttribute('style')).not.toBe(original);

      postFromFrame(frame, FRAME_RESTORE_MESSAGE);
      // 站点自己的内联样式必须一字不差地回来 —— 不能变成我们撑大时那一份。
      expect(frame.getAttribute('style')).toBe(original);
    });

    it('原本没有内联样式的 iframe，还原后不该多出 style 属性', () => {
      const frame = createFrame();
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expect(frame.getAttribute('style')).not.toBeNull();

      postFromFrame(frame, FRAME_RESTORE_MESSAGE);
      expect(frame.getAttribute('style')).toBeNull();
    });

    it('iframe 被页面摘掉后发来的还原请求仍能被认领', () => {
      // 实测（真实 Chromium）：iframe 元素被从 DOM 里摘掉后，
      // 它的 contentWindow 立刻变成 null，而子文档在 pagehide 里发来的
      // 还原请求的 event.source 仍指向那个**旧的**窗口对象。
      //
      // 所以认领必须跟我们**当初记下的**窗口比 —— 只扫 DOM 会认不出来，
      // 那个 iframe 元素就永远带着「满屏」样式留在那儿。
      const original = 'width: 320px; height: 220px';
      const frame = createFrame(original);
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expect(frame.style.getPropertyValue('position')).toBe('fixed');

      // 模拟「元素被摘掉，contentWindow 变 null，但消息里的 source 仍是旧窗口」。
      const source = frame.contentWindow;
      Object.defineProperty(frame, 'contentWindow', { value: null, configurable: true });
      frame.remove();

      const event = new MessageEvent('message', {
        data: { type: FRAME_RESTORE_MESSAGE },
        source: source as unknown as Window,
      });
      window.dispatchEvent(event);

      expect(frame.getAttribute('style'), '元素被摘掉也必须还原样式').toBe(original);
    });

    it('没撑大过的 iframe 收到还原请求时样式不许被碰', () => {
      const original = 'width: 320px; height: 220px';
      const frame = createFrame(original);
      createParentExpander();

      // ⚠️ 断言必须盯「**这个元素的 style 属性有没有被写过**」，
      // 而不是「最终值对不对」—— 后者在两种错误实现下都成立：
      // 「跳过还原」与「先写空再写回原值」。
      // 办法：给 setAttribute/removeAttribute 装计数器。
      const writes: string[] = [];
      const originalSetAttribute = frame.setAttribute.bind(frame);
      const originalRemoveAttribute = frame.removeAttribute.bind(frame);
      frame.setAttribute = (name: string, value: string) => {
        writes.push(`set:${name}=${value}`);
        originalSetAttribute(name, value);
      };
      frame.removeAttribute = (name: string) => {
        writes.push(`remove:${name}`);
        originalRemoveAttribute(name);
      };

      postFromFrame(frame, FRAME_RESTORE_MESSAGE);

      expect(writes, '没撑大过的 iframe 不该被写任何样式').toEqual([]);
      expect(frame.getAttribute('style')).toBe(original);
    });

    it('重复的撑大请求不会把「撑大后的样式」当成原样记下来', () => {
      const original = 'width: 320px; height: 220px';
      const frame = createFrame(original);
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      postFromFrame(frame, FRAME_RESTORE_MESSAGE);

      expect(frame.getAttribute('style')).toBe(original);
    });

    it('不是我们的消息（别的 type）被忽略 —— 不许被当成「还原」', () => {
      const frame = createFrame('width: 320px; height: 220px');
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expect(frame.style.getPropertyValue('position'), '前置条件：iframe 已被撑大').toBe('fixed');

      // 别的 type 的一条消息：必须**完全不被理会**。
      // ⚠️ 这里不能只断言「iframe 没被撑大」—— 那条断言区分不出
      // 「被忽略」与「被当成了还原请求」（后者对没撑大过的 iframe 也是 no-op）。
      // 所以先把它撑大，再发一条别的 type 的消息：它若被当成还原，
      // 撑大就会被撤销，断言立刻变红。
      postFromFrame(frame, 'some-other-extension');

      expect(frame.style.getPropertyValue('position'), '别的 type 不该被当成还原请求').toBe('fixed');
    });

    it('垃圾数据（不是对象）被忽略，且不抛异常', () => {
      const frame = createFrame();
      createParentExpander();

      const garbage = new MessageEvent('message', {
        data: 'not-an-object',
        source: frame.contentWindow as unknown as Window,
      });
      window.dispatchEvent(garbage);

      expect(frame.getAttribute('style')).toBeNull();
    });
  });

  /**
   * 祖先的包含块：撑大之前必须一起清掉。
   *
   * ## 要守住的承诺
   *
   * 撑大的 iframe 是 `position: fixed; inset: 0; width: 100vw; height: 100vh`。
   * fixed 的包含块**默认**是视口 —— 但祖先上的 transform / filter / contain /
   * will-change 会把包含块换成那个祖先，撑大的 iframe 于是被关在卡片那么大的
   * 盒子里（「全屏」名不副实）。动画播放器卡片极其常见。
   *
   * 还原必须**成对且精确**：只还原我们改过的那几个属性，且只在「当前值仍是
   * 我们写的那份」时才还原 —— 站点自己在这期间改的值不能被我们覆盖回去。
   */
  describe('父文档侧：祖先的包含块', () => {
    it('祖先带 transform 时，撑大之前先把它清掉', () => {
      const { card, frame } = createCardWithFrame('transform: translateX(10px)');
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);

      // ⚠️ 必须带 !important：站点的全局 CSS 可能给 transform 写了 !important，
      // 普通内联样式压不过它。
      expect(card.style.getPropertyValue('transform'), '祖先的 transform 必须被清掉').toBe('none');
      expect(card.style.getPropertyPriority('transform')).toBe('important');
    });

    it('退出时祖先的 transform 原样还回来', () => {
      const { card, frame } = createCardWithFrame('transform: translateX(10px)');
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expect(card.style.getPropertyValue('transform')).toBe('none');

      postFromFrame(frame, FRAME_RESTORE_MESSAGE);

      // 站点自己的内联样式必须一字不差地回来 —— 不能变成我们撑大时那一份。
      expect(card.style.getPropertyValue('transform')).toBe('translateX(10px)');
      // 而且优先级也要还原：我们写的是 important，站点原本没有。
      expect(card.style.getPropertyPriority('transform')).toBe('');
    });

    it('祖先带 filter / will-change / contain / perspective 时同样被清掉', () => {
      // ⚠️ backdrop-filter 不在这张表里：jsdom 的 CSSOM 根本没有实现这个属性
      // （读出来是空串，写进去也被丢掉），在 jsdom 里断言它等于断言一个
      // 浏览器里才存在的行为。产品代码里那条分支与 filter 完全同路。
      const cases: Array<[string, string, string]> = [
        ['filter', 'filter: blur(2px)', 'none'],
        ['will-change', 'will-change: transform', 'auto'],
        ['contain', 'contain: paint', 'none'],
        ['perspective', 'perspective: 100px', 'none'],
      ];

      for (const [property, style, expected] of cases) {
        const { card, frame } = createCardWithFrame(style);
        createParentExpander();

        postFromFrame(frame, FRAME_EXPAND_MESSAGE);

        expect(
          card.style.getPropertyValue(property),
          `${property} 必须被清掉（它会让祖先成为 fixed 后代的包含块）`,
        ).toBe(expected);

        postFromFrame(frame, FRAME_RESTORE_MESSAGE);

        expect(
          card.style.getPropertyValue(property),
          `${property} 必须在退出时原样还回来`,
        ).toBe(style.split(': ')[1]);
      }
    });

    it('不会形成包含块的值不被清掉（不误伤页面）', () => {
      // ⚠️ `contain: size` 只锁尺寸，不关住 fixed 后代；清掉它纯属白改页面布局。
      const { card, frame } = createCardWithFrame('contain: size');
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);

      expect(card.style.getPropertyValue('contain'), 'contain: size 不形成包含块，不该被动').toBe('size');
    });

    it('祖先身上没有这些属性时，一个字都不许动', () => {
      const { card, frame } = createCardWithFrame('width: 320px');
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);

      // 断言「style 属性有没有被写过」，而不是「最终值对不对」——
      // 后者在「先写空再写回」的错误实现下也成立。
      expect(card.getAttribute('style'), '不该碰祖先的样式').toBe('width: 320px');
    });

    it('嵌套两层时每一层的祖先都被清掉，退出时逐层还原', () => {
      const outer = document.createElement('div');
      outer.setAttribute('style', 'transform: rotate(3deg)');
      const inner = document.createElement('div');
      inner.setAttribute('style', 'filter: blur(1px)');
      const frame = document.createElement('iframe');
      inner.appendChild(frame);
      outer.appendChild(inner);
      document.body.appendChild(outer);
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);

      expect(outer.style.getPropertyValue('transform')).toBe('none');
      expect(inner.style.getPropertyValue('filter')).toBe('none');

      postFromFrame(frame, FRAME_RESTORE_MESSAGE);

      expect(outer.style.getPropertyValue('transform')).toBe('rotate(3deg)');
      expect(inner.style.getPropertyValue('filter')).toBe('blur(1px)');
    });

    it('站点自己在全屏期间改了祖先的 transform，我们不能覆盖回去', () => {
      const { card, frame } = createCardWithFrame('transform: translateX(10px)');
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);

      // 站点在全屏期间改了同一��属性（换布局、重新挂动画）。
      card.style.setProperty('transform', 'scale(2)');

      postFromFrame(frame, FRAME_RESTORE_MESSAGE);

      expect(
        card.style.getPropertyValue('transform'),
        '站点自己改过的值不能被我们还原回去',
      ).toBe('scale(2)');
    });

    it('撑大与还原必须成对：退出后祖先身上不留任何我们的残留', () => {
      const { card, frame } = createCardWithFrame('transform: translateX(10px)');
      createParentExpander();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      postFromFrame(frame, FRAME_RESTORE_MESSAGE);

      // 祖先的 style 属性必须回到一字不差的那一份（我们只碰过 transform）。
      expect(card.getAttribute('style')).toBe('transform: translateX(10px);');
    });

    it('两个 frame 共用同一个祖先时，先还原的那个不能把祖先提前放回去', () => {
      // 同一个祖先被两个被撑大的 frame 共用（页面上两个播放器在同一个卡片里）。
      // 先还原其中一个时，另一个还在全屏 —— 祖先的包含块必须**继续**被清着，
      // 否则那个还在全屏的 iframe 立刻被裁回小盒子。
      const card = document.createElement('div');
      card.setAttribute('style', 'transform: translateX(10px)');
      const first = document.createElement('iframe');
      const second = document.createElement('iframe');
      card.append(first, second);
      document.body.appendChild(card);
      createParentExpander();

      postFromFrame(first, FRAME_EXPAND_MESSAGE);
      postFromFrame(second, FRAME_EXPAND_MESSAGE);
      expect(card.style.getPropertyValue('transform')).toBe('none');

      postFromFrame(first, FRAME_RESTORE_MESSAGE);
      expect(
        card.style.getPropertyValue('transform'),
        '另一个 frame 还在全屏，祖先不能被提前还原',
      ).toBe('none');

      postFromFrame(second, FRAME_RESTORE_MESSAGE);
      expect(card.style.getPropertyValue('transform')).toBe('translateX(10px)');
    });

    it('卸载（页面销毁）时祖先的样式同样被还原', () => {
      const { card, frame } = createCardWithFrame('transform: translateX(10px)');
      const expander = new FrameExpander(window, document);
      expander.install();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expect(card.style.getPropertyValue('transform')).toBe('none');

      expander.uninstall();

      expect(card.style.getPropertyValue('transform')).toBe('translateX(10px)');
    });
  });

  describe('子文档侧：请求父文档撑大', () => {    it('我们进全屏时请求父文档把装着我们的 frame 撑大', () => {
      const { win, posted } = createEmbeddedWindow();
      const expander = new FrameExpander(win, document);
      expander.install();

      expander.setOwnFullscreen(true);

      expect(posted).toHaveLength(1);
      expect(posted[0].data.type).toBe(FRAME_EXPAND_MESSAGE);
      // 父文档的 origin 我们不知道（跨源时连 location.href 都读不到），
      // 只能发给 '*' —— 真正的授权靠父文档自己的 event.source 同一性比对。
      expect(posted[0].targetOrigin).toBe('*');
    });

    it('我们退出全屏时请求还原（撑大与还原必须成对）', () => {
      const { win, posted } = createEmbeddedWindow();
      const expander = new FrameExpander(win, document);
      expander.install();

      expander.setOwnFullscreen(true);
      expander.setOwnFullscreen(false);

      expect(posted.map((item) => item.data.type)).toEqual([
        FRAME_EXPAND_MESSAGE,
        FRAME_RESTORE_MESSAGE,
      ]);
    });

    it('顶层文档不发任何请求 —— 顶层自己的网页全屏是老路径', () => {
      // 真实 jsdom 窗口的 parent 就是自己：postToParent 必须直接短路。
      const spy = vi.spyOn(window, 'postMessage');
      const expander = new FrameExpander(window, document);
      expander.install();

      expander.setOwnFullscreen(true);

      expect(spy).not.toHaveBeenCalled();
      expander.uninstall();
      spy.mockRestore();
    });

    it('页面卸载时请求还原（否则父文档里的 frame 会永远保持满屏）', () => {
      const { win, posted } = createEmbeddedWindow();
      const expander = new FrameExpander(win, document);
      expander.install();

      expander.setOwnFullscreen(true);
      posted.length = 0;

      win.dispatchEvent(new Event('pagehide'));

      expect(posted.map((item) => item.data.type)).toEqual([FRAME_RESTORE_MESSAGE]);
    });

    it('我们撑大了子 frame 时，链式地请上一级也把我们撑大', () => {
      const { win, posted } = createEmbeddedWindow();
      const expander = new FrameExpander(win, document);
      expander.install();

      // 有人来请求撑大我们文档里的某个 iframe。
      const frame = createFrame();
      const event = new MessageEvent('message', {
        data: { type: FRAME_EXPAND_MESSAGE },
        source: frame.contentWindow as unknown as Window,
      });
      win.dispatchEvent(event);

      // 我们的子 frame 要铺满**我们的**视口，而我们自己也可能只是顶层页面里
      // 的一小块 —— 所以必须再往上一级请求一次。
      expect(posted.map((item) => item.data.type)).toEqual([FRAME_EXPAND_MESSAGE]);
    });

    it('子 frame 还原之后，链式的撑大请求也跟着撤销', () => {
      const { win, posted } = createEmbeddedWindow();
      const expander = new FrameExpander(win, document);
      expander.install();

      const frame = createFrame();
      const send = (type: string) => {
        win.dispatchEvent(
          new MessageEvent('message', {
            data: { type },
            source: frame.contentWindow as unknown as Window,
          })
        );
      };

      send(FRAME_EXPAND_MESSAGE);
      posted.length = 0;
      send(FRAME_RESTORE_MESSAGE);

      expect(posted.map((item) => item.data.type)).toEqual([FRAME_RESTORE_MESSAGE]);
    });
  });

  describe('销毁', () => {
    it('卸掉监听器后不再处理子 frame 的请求', () => {
      const frame = createFrame();
      const expander = new FrameExpander(window, document);
      expander.install();
      expander.uninstall();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);

      expect(frame.getAttribute('style')).toBeNull();
    });

    it('卸掉监听器时把还撑大着的 iframe 还原', () => {
      const original = 'width: 320px; height: 220px';
      const frame = createFrame(original);
      const expander = new FrameExpander(window, document);
      expander.install();

      postFromFrame(frame, FRAME_EXPAND_MESSAGE);
      expander.uninstall();

      expect(frame.getAttribute('style')).toBe(original);
    });
  });
});
