import { describe, expect, it } from 'vitest';
import { FIRST_RUN_HINT_KEY } from '../shared/types';
import { createChromeMock, flush } from './options-test-env';

/**
 * 设置页的「重新显示使用引导」按钮。
 *
 * 引导是这个产品**唯一**的可见入口，而它只出现一次 —— 用户在它出现之前
 * 关掉页面、或读着读着按错了键把它关掉，就再也看不到它了。
 *
 * `resetFirstRunHintState()` 早就在 settings.ts 里写好了（一次性清掉
 * 「已展示 / 失败次数 / 冷却时间戳」三个标记），但**没有人调用它** ——
 * 按钮根本没接线，那条功能等于不存在。
 */

/** 失败次数与冷却时间戳的键名（settings.ts 里定义，这里按字面量断言清掉的是它们）。 */
const FAILED_ATTEMPTS_KEY = 'vsc-first-run-hint-failed-attempts';
const COOLDOWN_KEY = 'vsc-first-run-hint-cooldown-until';

describe('设置页：重新显示使用引导', () => {
  it('点一下就把引导的三个状态一起清掉', async () => {
    const { render, localRemoves } = createChromeMock({
      local: {
        [FIRST_RUN_HINT_KEY]: true,
        [FAILED_ATTEMPTS_KEY]: 3,
        [COOLDOWN_KEY]: Date.now() + 60_000,
      },
    });
    const root = await render();

    const button = root.querySelector('#reset-hint') as HTMLButtonElement | null;
    expect(button, '设置页必须有「重新显示使用引导」按钮').not.toBeNull();

    button!.click();
    await flush();

    // ⚠️ 三个标记必须**一起**清：只清「已展示」的话，处在冷却期的用户
    // 点了按钮仍然看不到引导 —— 那是一个不兑现的按钮。
    expect(localRemoves).toEqual([FIRST_RUN_HINT_KEY, FAILED_ATTEMPTS_KEY, COOLDOWN_KEY]);
  });

  it('点完要有看得见的反馈（按钮文案变了，状态栏也说话了）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const button = root.querySelector('#reset-hint') as HTMLButtonElement;
    const status = root.querySelector('#status');
    const before = button.textContent;

    button.click();
    await flush();

    // 引导本来就是一次性、错过就没了的东西。用户点完这个按钮如果什么都没发生，
    // 他只会以为按钮坏了 —— 而「没看到引导」正是他要解决的问题。
    expect(button.textContent, '按钮文案必须变，否则用户以为按钮坏了').not.toBe(before);
    expect(button.textContent).toBe('已重置');
    // 状态栏是 role=status 的 live region —— 读屏用户靠它确认。
    expect(status?.textContent, '状态栏也要给一句确认').toBe('已重置');
  });

  it('清完之后 storage 里确实没有引导状态了', async () => {
    const { render, local } = createChromeMock({
      local: { [FIRST_RUN_HINT_KEY]: true },
    });
    const root = await render();

    (root.querySelector('#reset-hint') as HTMLButtonElement).click();
    await flush();

    expect(local[FIRST_RUN_HINT_KEY]).toBeUndefined();
  });
});
