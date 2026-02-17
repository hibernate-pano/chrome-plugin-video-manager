/**
 * Media Store 测试
 * @module shared/stores/__tests__/mediaStore
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMediaStore } from '../mediaStore';
import { act } from '@testing-library/react';

describe('mediaStore', () => {
    beforeEach(() => {
    // 重置 store 到初始状态
        act(() => {
            useMediaStore.getState().reset();
        });
    });

    describe('初始状态', () => {
        it('应该有正确的初始值', () => {
            const state = useMediaStore.getState();

            expect(state.currentMedia).toBeNull();
            expect(state.playbackRate).toBe(1.0);
            expect(state.volume).toBe(1.0);
            expect(state.isPaused).toBe(true);
            expect(state.currentTime).toBe(0);
            expect(state.duration).toBe(0);
            expect(state.isFullscreen).toBe(false);
        });
    });

    describe('setCurrentMedia', () => {
        it('应该设置当前媒体元素', () => {
            const mockMedia = document.createElement('video');

            // 使用 Object.defineProperty 设置只读属性
            Object.defineProperty(mockMedia, 'paused', {
                value: false,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(mockMedia, 'duration', {
                value: 100,
                writable: true,
                configurable: true,
            });

            mockMedia.playbackRate = 1.5;
            mockMedia.volume = 0.8;
            mockMedia.currentTime = 10;

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
            });

            const state = useMediaStore.getState();
            expect(state.currentMedia).toBe(mockMedia);
            expect(state.playbackRate).toBe(1.5);
            expect(state.volume).toBe(0.8);
            expect(state.isPaused).toBe(false);
            expect(state.currentTime).toBe(10);
            expect(state.duration).toBe(100);
        });

        it('当设置为 null 时应该重置状态', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().setCurrentMedia(null);
            });

            const state = useMediaStore.getState();
            expect(state.currentMedia).toBeNull();
            expect(state.playbackRate).toBe(1.0);
            expect(state.volume).toBe(1.0);
            expect(state.isPaused).toBe(true);
        });
    });

    describe('setPlaybackRate', () => {
        it('应该设置播放速率', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().setPlaybackRate(1.5);
            });

            expect(useMediaStore.getState().playbackRate).toBe(1.5);
            expect(mockMedia.playbackRate).toBe(1.5);
        });

        it('应该限制播放速率在 0.25 到 16.0 之间', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().setPlaybackRate(20);
            });

            expect(useMediaStore.getState().playbackRate).toBe(16.0);

            act(() => {
                useMediaStore.getState().setPlaybackRate(0.1);
            });

            expect(useMediaStore.getState().playbackRate).toBe(0.25);
        });
    });

    describe('increasePlaybackRate', () => {
        it('应该增加播放速率', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().increasePlaybackRate();
            });

            expect(useMediaStore.getState().playbackRate).toBe(1.25);
        });

        it('应该支持自定义步长', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().increasePlaybackRate(0.5);
            });

            expect(useMediaStore.getState().playbackRate).toBe(1.5);
        });
    });

    describe('decreasePlaybackRate', () => {
        it('应该降低播放速率', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().decreasePlaybackRate();
            });

            expect(useMediaStore.getState().playbackRate).toBe(0.75);
        });
    });

    describe('resetPlaybackRate', () => {
        it('应该重置播放速率为 1.0', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().setPlaybackRate(2.0);
                useMediaStore.getState().resetPlaybackRate();
            });

            expect(useMediaStore.getState().playbackRate).toBe(1.0);
        });
    });

    describe('setVolume', () => {
        it('应该设置音量', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().setVolume(0.5);
            });

            expect(useMediaStore.getState().volume).toBe(0.5);
            expect(mockMedia.volume).toBe(0.5);
        });

        it('应该限制音量在 0 到 1 之间', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().setVolume(1.5);
            });

            expect(useMediaStore.getState().volume).toBe(1.0);

            act(() => {
                useMediaStore.getState().setVolume(-0.5);
            });

            expect(useMediaStore.getState().volume).toBe(0);
        });
    });

    describe('increaseVolume', () => {
        it('应该增加音量', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().increaseVolume();
            });

            expect(useMediaStore.getState().volume).toBe(1.0); // 从 1.0 增加 0.1，但限制在 1.0
        });
    });

    describe('decreaseVolume', () => {
        it('应该降低音量', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().decreaseVolume();
            });

            expect(useMediaStore.getState().volume).toBe(0.9);
        });
    });

    describe('togglePlayPause', () => {
        it('应该切换播放/暂停状态', () => {
            const mockMedia = document.createElement('video');
            mockMedia.play = vi.fn().mockResolvedValue(undefined);
            mockMedia.pause = vi.fn();

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().togglePlayPause();
            });

            expect(mockMedia.play).toHaveBeenCalled();
            expect(useMediaStore.getState().isPaused).toBe(false);

            act(() => {
                useMediaStore.getState().togglePlayPause();
            });

            expect(mockMedia.pause).toHaveBeenCalled();
            expect(useMediaStore.getState().isPaused).toBe(true);
        });

        it('当没有媒体元素时应该不执行任何操作', () => {
            act(() => {
                useMediaStore.getState().togglePlayPause();
            });

            // 不应该抛出错误
            expect(useMediaStore.getState().isPaused).toBe(true);
        });
    });

    describe('seekForward', () => {
        it('应该快进指定秒数', () => {
            const mockMedia = document.createElement('video');
            mockMedia.currentTime = 10;

            Object.defineProperty(mockMedia, 'duration', {
                value: 100,
                writable: true,
                configurable: true,
            });

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().seekForward(5);
            });

            expect(mockMedia.currentTime).toBe(15);
            expect(useMediaStore.getState().currentTime).toBe(15);
        });

        it('不应该超过视频总时长', () => {
            const mockMedia = document.createElement('video');
            mockMedia.currentTime = 95;

            Object.defineProperty(mockMedia, 'duration', {
                value: 100,
                writable: true,
                configurable: true,
            });

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().seekForward(10);
            });

            expect(mockMedia.currentTime).toBe(100);
        });
    });

    describe('seekBackward', () => {
        it('应该快退指定秒数', () => {
            const mockMedia = document.createElement('video');
            mockMedia.currentTime = 20;

            Object.defineProperty(mockMedia, 'duration', {
                value: 100,
                writable: true,
                configurable: true,
            });

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().seekBackward(5);
            });

            expect(mockMedia.currentTime).toBe(15);
            expect(useMediaStore.getState().currentTime).toBe(15);
        });

        it('不应该小于 0', () => {
            const mockMedia = document.createElement('video');
            mockMedia.currentTime = 5;

            Object.defineProperty(mockMedia, 'duration', {
                value: 100,
                writable: true,
                configurable: true,
            });

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().seekBackward(10);
            });

            expect(mockMedia.currentTime).toBe(0);
        });
    });

    describe('reset', () => {
        it('应该重置所有状态到初始值', () => {
            const mockMedia = document.createElement('video');

            act(() => {
                useMediaStore.getState().setCurrentMedia(mockMedia);
                useMediaStore.getState().setPlaybackRate(2.0);
                useMediaStore.getState().setVolume(0.5);
                useMediaStore.getState().reset();
            });

            const state = useMediaStore.getState();
            expect(state.currentMedia).toBeNull();
            expect(state.playbackRate).toBe(1.0);
            expect(state.volume).toBe(1.0);
            expect(state.isPaused).toBe(true);
        });
    });
});
