import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { buildGuideText, FirstRunHint } from './firstRunHint';
import { DEFAULT_SHORTCUTS, type ShortcutSettings } from '../shared/types';

const HINT_ID = 'vsc-first-run-hint';

const createShortcuts = (overrides: Partial<ShortcutSettings> = {}): ShortcutSettings => ({
  ...DEFAULT_SHORTCUTS,
  ...overrides,
});

const createVideo = () => document.createElement('video');

const hintNode = () => document.getElementById(HINT_ID);
const isVisible = () => hintNode()?.classList.contains('vsc-visible') ?? false;

describe('buildGuideText', () => {
  it('lists the fullscreen key and the speed step pair, with real labels', () => {
    const text = buildGuideText(createShortcuts());

    expect(text).toContain('F');
    expect(text).toContain('= / -');
    // 断言动作名本身：i18n 键名写错时会把**键名**渲染给用户（曾经就把
    // "fullscreen" 当动作名显示了出来），只断言键位是抓不到的。
    expect(text).toContain('网页全屏');
    expect(text).not.toContain('fullscreen');
    expect(text).toContain('调速');
    // 两个动作之间要有可见间隔：HTML 会折叠连续空格，靠空格排版会挤成一团。
    expect(text).toContain('  ·  ');
  });

  it('renders the user\'s own bindings instead of the defaults', () => {
    const text = buildGuideText(
      createShortcuts({ fullscreen: 'q', increaseSpeed: ']', decreaseSpeed: '[' }),
    );

    // 照默认值写死的提示会教用户按一个已经改掉的键。
    expect(text).toContain('Q');
    expect(text).toContain('] / [');
    expect(text).not.toContain('= / -');
  });

  it('omits the speed line when only one of the two step keys is bound', () => {
    const text = buildGuideText(createShortcuts({ decreaseSpeed: '' }));

    expect(text).toContain('F');
    expect(text).not.toContain('=');
  });

  it('returns null when every action it would teach is disabled', () => {
    expect(buildGuideText(createShortcuts({
      fullscreen: '',
      increaseSpeed: '',
      decreaseSpeed: '',
    }))).toBeNull();
  });

  it('never teaches play/pause, which the user just used to start the video', () => {
    expect(buildGuideText(createShortcuts())).not.toContain('Space');
  });
});

describe('FirstRunHint', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let hint: FirstRunHint;

  const start = async (video: HTMLVideoElement) => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
    });
    hint.start();
    await Promise.resolve();
    await Promise.resolve();
    video.dispatchEvent(new Event('play', { bubbles: true }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
  });

  afterEach(() => {
    hint?.destroy();
    vi.useRealTimers();
  });

  it('shows nothing until the video has actually been watched for a while', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);

    // 自动播放的广告位、悬停预览都会派发 play；只按 play 就弹提示等于打扰。
    vi.advanceTimersByTime(2000);
    expect(isVisible()).toBe(false);

    vi.advanceTimersByTime(600);
    expect(isVisible()).toBe(true);
    expect(hintNode()?.textContent).toContain('F');
  });

  it('records that it was shown, exactly once', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    expect(markShown).toHaveBeenCalledTimes(1);

    // 同一页面里再次播放（切集、重播）不该再弹一次。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('stays silent forever once the flag is set', async () => {
    wasShown = vi.fn(async (): Promise<boolean> => true);
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(5000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('treats a failed read as already shown rather than nagging on every reload', async () => {
    wasShown = vi.fn(async (): Promise<boolean> => {
      throw new Error('storage unavailable');
    });
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(5000);

    expect(isVisible()).toBe(false);
  });

  it('stays silent when the user pauses during the wait', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);

    // 等 2.5 秒的窗口里用户按了暂停：这时弹提示是在打断他。
    // 判定必须靠真实的 pause 事件，而不是去读 video.paused 的状态快照。
    video.dispatchEvent(new Event('pause', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('stays silent when the video ends during the wait', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);

    video.dispatchEvent(new Event('ended', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
  });

  it('gives a paused video the full wait again after it resumes', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);

    video.dispatchEvent(new Event('pause', { bubbles: true }));
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(false);

    // 恢复播放后重新计时，而不是因为「已经等过一次」就永久放弃。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);
  });

  it('stays silent when the video left the document during the wait', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);

    video.remove();
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('does not mark itself shown when all the actions it would teach are disabled', async () => {
    shortcuts = createShortcuts({ fullscreen: '', increaseSpeed: '', decreaseSpeed: '' });
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    // 什么都没显示出来，就不该消耗掉这一次引导——用户改回绑定后仍应看到。
    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('disappears as soon as the user starts operating the extension', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    expect(isVisible()).toBe(false);
  });

  it('disappears on a click too', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(isVisible()).toBe(false);
  });

  it('fades out on its own instead of staying on screen', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);

    vi.advanceTimersByTime(12000);
    expect(isVisible()).toBe(false);
  });

  it('leaves no trace after destroy', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(hintNode()).not.toBeNull();

    hint.destroy();

    expect(hintNode()).toBeNull();
    // 销毁后既不能再弹，也不能留下定时器（jsdom 会对残留定时器报错）。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    expect(() => vi.advanceTimersByTime(20000)).not.toThrow();
    expect(isVisible()).toBe(false);
  });
});
