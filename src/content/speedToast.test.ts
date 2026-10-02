import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeedToast, formatRate } from './speedToast';

describe('formatRate', () => {
  it('trims trailing zeros', () => {
    expect(formatRate(1)).toBe('1');
    expect(formatRate(1.5)).toBe('1.5');
    expect(formatRate(1.25)).toBe('1.25');
    expect(formatRate(2)).toBe('2');
  });
});

describe('SpeedToast', () => {
  let video: HTMLVideoElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    video = document.createElement('video');
    document.body.appendChild(video);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the rate and hides itself after the delay', () => {
    const toast = new SpeedToast();
    toast.show(1.5, video);

    const root = document.getElementById('vsc-speed-toast')!;
    expect(root.textContent).toBe('1.5x');
    expect(root.classList.contains('vsc-visible')).toBe(true);

    vi.advanceTimersByTime(900);
    expect(root.classList.contains('vsc-visible')).toBe(false);
    toast.destroy();
  });

  it('reuses one element and updates the text on repeat shows', () => {
    const toast = new SpeedToast();
    toast.show(1.1, video);
    toast.show(1.2, video);

    expect(document.querySelectorAll('#vsc-speed-toast').length).toBe(1);
    expect(document.getElementById('vsc-speed-toast')!.textContent).toBe('1.2x');
    toast.destroy();
  });

  it('removes the element on destroy', () => {
    const toast = new SpeedToast();
    toast.show(1.5, video);
    toast.destroy();

    expect(document.getElementById('vsc-speed-toast')).toBeNull();
  });
});
