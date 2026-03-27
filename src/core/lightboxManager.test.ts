import { beforeEach, describe, expect, it } from 'vitest';
import { LightboxManager } from './lightboxManager';

describe('LightboxManager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reparents the original video and restores it on exit', () => {
    const manager = new LightboxManager();
    const host = document.createElement('div');
    const sibling = document.createElement('span');
    const video = document.createElement('video');
    host.append(video, sibling);
    document.body.appendChild(host);

    expect(manager.enter(video)).toBe(true);
    expect(manager.getMedia()).toBe(video);
    expect(video.parentElement?.id).toBe('vsc-lightbox-stage');

    manager.exit();

    expect(host.firstChild).toBe(video);
    expect(manager.isActive()).toBe(false);
  });

  it('ignores non-video media', () => {
    const manager = new LightboxManager();
    const audio = document.createElement('audio');
    document.body.appendChild(audio);

    expect(manager.enter(audio)).toBe(false);
    expect(manager.isActive()).toBe(false);
  });
});
