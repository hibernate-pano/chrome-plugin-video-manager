import { describe, expect, it, vi } from 'vitest';
import { TOGGLE_FULLSCREEN_MESSAGE } from '../shared/types';

type ClickListener = (tab: { id?: number }) => void;

describe('background action click', () => {
  const stubChrome = (clickListeners: ClickListener[], sendMessage: ReturnType<typeof vi.fn>) => {
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: (fn: ClickListener) => clickListeners.push(fn) } },
      tabs: { sendMessage },
      runtime: { lastError: null },
    });
  };

  it('sends a fullscreen toggle to the clicked tab', async () => {
    const clickListeners: ClickListener[] = [];
    const sendMessage = vi.fn();
    stubChrome(clickListeners, sendMessage);

    await import('./index');
    clickListeners[0]?.({ id: 7 });

    expect(sendMessage).toHaveBeenCalledWith(
      7,
      { type: TOGGLE_FULLSCREEN_MESSAGE },
      expect.any(Function),
    );
  });

  it('ignores tabs without an id', async () => {
    const clickListeners: ClickListener[] = [];
    const sendMessage = vi.fn();
    stubChrome(clickListeners, sendMessage);

    await import('./index');
    clickListeners[0]?.({});

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
