/**
 * HUD 组件测试
 * 验证 HUD 组件的基本功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHUDStore } from '../../shared/stores/hudStore';

describe('HUD Store Integration', () => {
    beforeEach(() => {
    // 重置 store 状态
        useHUDStore.getState().reset();
    });

    afterEach(() => {
    // 清理
        useHUDStore.getState().reset();
    });

    it('应该能够显示速度指示器', () => {
        const { result } = renderHook(() => useHUDStore());

        act(() => {
            result.current.show({
                type: 'speed',
                value: 1.5,
            });
        });

        expect(result.current.visible).toBe(true);
        expect(result.current.type).toBe('speed');
        expect(result.current.value).toBe(1.5);
    });

    it('应该能够显示音量指示器', () => {
        const { result } = renderHook(() => useHUDStore());

        act(() => {
            result.current.show({
                type: 'volume',
                value: 0.8,
            });
        });

        expect(result.current.visible).toBe(true);
        expect(result.current.type).toBe('volume');
        expect(result.current.value).toBe(0.8);
    });

    it('应该能够显示快进指示器', () => {
        const { result } = renderHook(() => useHUDStore());

        act(() => {
            result.current.show({
                type: 'seek',
                value: 10,
            });
        });

        expect(result.current.visible).toBe(true);
        expect(result.current.type).toBe('seek');
        expect(result.current.value).toBe(10);
    });

    it('应该能够隐藏 HUD', () => {
        const { result } = renderHook(() => useHUDStore());

        act(() => {
            result.current.show({
                type: 'speed',
                value: 1.5,
            });
        });

        expect(result.current.visible).toBe(true);

        act(() => {
            result.current.hide();
        });

        expect(result.current.visible).toBe(false);
        expect(result.current.type).toBe(null);
    });

    it('应该能够更新配置', () => {
        const { result } = renderHook(() => useHUDStore());

        act(() => {
            result.current.updateConfig({
                displayDuration: 3000,
                position: 'top-right',
            });
        });

        expect(result.current.config.displayDuration).toBe(3000);
        expect(result.current.config.position).toBe('top-right');
    });
});
