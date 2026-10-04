import { beforeEach, describe, expect, it } from 'vitest';
import { installRuntimeStyles } from './runtimeStyles';

const STYLE_ID = 'vsc-runtime-styles';

describe('installRuntimeStyles', () => {
  // 每个用例开始前保证「有一个已注入的节点」，模块内的 styleElement 也指向它。
  beforeEach(() => {
    document.getElementById(STYLE_ID)?.remove();
    installRuntimeStyles();
  });

  it('injects exactly one style node and is idempotent', () => {
    installRuntimeStyles();
    installRuntimeStyles();

    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
  });

  it('re-injects after the node is removed and install is called again', () => {
    const original = document.getElementById(STYLE_ID);
    expect(original).not.toBeNull();

    original!.remove();
    expect(document.getElementById(STYLE_ID)).toBeNull();

    // 改动前用 getElementById 判断，节点被移除后这里会重建；
    // 但自愈的关键是「脱离文档即重建」，见下一个用例。
    installRuntimeStyles();

    const rebuilt = document.getElementById(STYLE_ID);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toBe(original);
    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
  });

  it('re-injects on its own after the node is removed, without another install call', async () => {
    const original = document.getElementById(STYLE_ID)!;

    // 页面（SPA 重建/站点清理）直接把样式摘走，扩展侧没有任何后续调用。
    original.remove();
    expect(document.getElementById(STYLE_ID)).toBeNull();

    // MutationObserver 回调在微任务里跑，等它落地。
    await new Promise((resolve) => setTimeout(resolve, 0));

    const rebuilt = document.getElementById(STYLE_ID);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toBe(original);
    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
  });
});
