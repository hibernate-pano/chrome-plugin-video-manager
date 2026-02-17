/**
 * HUD Store 测试
 * @module shared/stores/__tests__/hudStore
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useHUDStore } from '../hudStore';
import { act } from '@testing-library/react';

describe('hudStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // 重置 store 到初始状态
        act(() => {
            useHUDStore.getState().reset();
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('初始状态', () => {
        it('应该有正确的初始值', () => {
            const state = useHUDStore.getState();

            expect(state.visible).toBe(false);
            expect(state.type).toBeNull();
            expect(state.value).toBe(0);
            expect(state.timeout).toBeNull();
        });

        it('应该有默认配置', () => {
            const state = useHUDStore.getState();

            expect(state.config.displayDuration).toBe(2000);
            expect(state.config.animationDuration).toBe(300);
            expect(state.config.position).toBe('center');
        });
    });

    describe('show', () => {
        it('应该显示 HUD 并设置正确的值', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'speed',
                    value: 1.5,
                });
            });

            const state = useHUDStore.getState();
            expect(state.visible).toBe(true);
            expect(state.type).toBe('speed');
            expect(state.value).toBe(1.5);
            expect(state.timeout).not.toBeNull();
        });

        it('应该在指定时间后自动隐藏', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'volume',
                    value: 0.8,
                });
            });

            expect(useHUDStore.getState().visible).toBe(true);

            // 快进时间
            act(() => {
                vi.advanceTimersByTime(2000);
            });

            expect(useHUDStore.getState().visible).toBe(false);
            expect(useHUDStore.getState().type).toBeNull();
        });

        it('应该支持自定义显示持续时间', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'seek',
                    value: 10,
                    duration: 1000,
                });
            });

            expect(useHUDStore.getState().visible).toBe(true);

            // 快进 1000ms
            act(() => {
                vi.advanceTimersByTime(1000);
            });

            expect(useHUDStore.getState().visible).toBe(false);
        });

        it('应该取消之前的定时器', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'speed',
                    value: 1.0,
                });
            });

            const firstTimeout = useHUDStore.getState().timeout;

            act(() => {
                useHUDStore.getState().show({
                    type: 'speed',
                    value: 1.5,
                });
            });

            const secondTimeout = useHUDStore.getState().timeout;

            expect(firstTimeout).not.toBe(secondTimeout);
            expect(useHUDStore.getState().value).toBe(1.5);
        });
    });

    describe('hide', () => {
        it('应该隐藏 HUD', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'speed',
                    value: 1.5,
                });
                useHUDStore.getState().hide();
            });

            const state = useHUDStore.getState();
            expect(state.visible).toBe(false);
            expect(state.type).toBeNull();
            expect(state.timeout).toBeNull();
        });

        it('应该取消自动隐藏定时器', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'speed',
                    value: 1.5,
                });
            });

            expect(useHUDStore.getState().timeout).not.toBeNull();

            act(() => {
                useHUDStore.getState().hide();
            });

            expect(useHUDStore.getState().timeout).toBeNull();

            // 快进时间，HUD 应该保持隐藏
            act(() => {
                vi.advanceTimersByTime(3000);
            });

            expect(useHUDStore.getState().visible).toBe(false);
        });
    });

    describe('updateConfig', () => {
        it('应该更新配置', () => {
            act(() => {
                useHUDStore.getState().updateConfig({
                    displayDuration: 3000,
                    position: 'bottom-right',
                });
            });

            const config = useHUDStore.getState().config;
            expect(config.displayDuration).toBe(3000);
            expect(config.position).toBe('bottom-right');
            expect(config.animationDuration).toBe(300); // 未更改的值应该保持
        });
    });

    describe('cancelTimeout', () => {
        it('应该取消当前的定时器', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'speed',
                    value: 1.5,
                });
            });

            expect(useHUDStore.getState().timeout).not.toBeNull();

            act(() => {
                useHUDStore.getState().cancelTimeout();
            });

            expect(useHUDStore.getState().timeout).toBeNull();
        });

        it('当没有定时器时应该不抛出错误', () => {
            act(() => {
                useHUDStore.getState().cancelTimeout();
            });

            // 不应该抛出错误
            expect(useHUDStore.getState().timeout).toBeNull();
        });
    });

    describe('reset', () => {
        it('应该重置所有状态到初始值', () => {
            act(() => {
                useHUDStore.getState().show({
                    type: 'speed',
                    value: 1.5,
                });
                useHUDStore.getState().updateConfig({
                    displayDuration: 3000,
                });
                useHUDStore.getState().reset();
            });

            const state = useHUDStore.getState();
            expect(state.visible).toBe(false);
            expect(state.type).toBeNull();
            expect(state.value).toBe(0);
            expect(state.timeout).toBeNull();
            expect(state.config.displayDuration).toBe(2000); // 恢复默认值
        });
    });

    describe('便捷 Hooks', () => {
        it('useShowSpeed 应该显示速度指示器', () => {
            const showSpeed = useHUDStore.getState().show;

            act(() => {
                showSpeed({
                    type: 'speed',
                    value: 1.5,
                });
            });

            const state = useHUDStore.getState();
            expect(state.type).toBe('speed');
            expect(state.value).toBe(1.5);
        });

        it('useShowVolume 应该显示音量指示器', () => {
            const show = useHUDStore.getState().show;

            act(() => {
                show({
                    type: 'volume',
                    value: 0.8,
                });
            });

            const state = useHUDStore.getState();
            expect(state.type).toBe('volume');
            expect(state.value).toBe(0.8);
        });

        it('useShowSeek 应该显示跳转指示器', () => {
            const show = useHUDStore.getState().show;

            act(() => {
                show({
                    type: 'seek',
                    value: 10,
                });
            });

            const state = useHUDStore.getState();
            expect(state.type).toBe('seek');
            expect(state.value).toBe(10);
        });

        it('useShowReset 应该显示重置指示器', () => {
            const show = useHUDStore.getState().show;

            act(() => {
                show({
                    type: 'reset',
                    value: 1.0,
                });
            });

            const state = useHUDStore.getState();
            expect(state.type).toBe('reset');
            expect(state.value).toBe(1.0);
        });
    });
});
