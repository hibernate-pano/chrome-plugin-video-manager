/**
 * 键盘事件处理模块
 * @module modules/keyboardHandler
 */

import { isTypingInEditable } from '../utils/dom.js';
import { findPresetByKey, loadSpeedPresets } from '../utils/presets.js';
import { defaultShortcuts } from '../utils/storage.js';

/**
 * 键盘事件处理器类
 */
export class KeyboardHandler {
    constructor(
        shortcuts,
        mediaDetector,
        playbackController,
        lightboxManager,
        keyboardHelp
    ) {
        this.shortcuts = shortcuts;
        this.mediaDetector = mediaDetector;
        this.playbackController = playbackController;
        this.lightboxManager = lightboxManager;
        this.keyboardHelp = keyboardHelp;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleLightboxKeys = this.handleLightboxKeys.bind(this);
        this.backupKeyDownHandler = null;
    }

    /**
     * 更新快捷键配置
     * @param {Object} newShortcuts - 新的快捷键配置
     */
    updateShortcuts(newShortcuts) {
        this.shortcuts = newShortcuts;
    }

    /**
     * 处理速度预设按键
     * @param {string} key - 按键
     */
    async handlePresetKey(key) {
        try {
            const presets = await loadSpeedPresets();
            const preset = findPresetByKey(key, presets);
            if (!preset) return;

            const media = this.mediaDetector.getTargetMedia();
            if (!media) return;

            media.playbackRate = preset.value;
            this.playbackController.hud.showSpeed(preset.value);
        } catch (error) {
            console.error('处理速度预设失败:', error);
        }
    }

    /**
     * 检测当前网站是否为YouTube
     * @returns {boolean}
     */
    isYouTubeSite() {
        return (
            window.location.hostname.includes('youtube.com') ||
            window.location.hostname.includes('youtu.be')
        );
    }

    /**
     * 处理全屏模式下的特殊按键
     * @param {KeyboardEvent} e - 键盘事件
     * @returns {boolean} 是否已处理
     */
    handleLightboxKeys(e) {
        const video = this.lightboxManager.getVideo();
        if (!video) return false;

        // ESC键退出全屏
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.lightboxManager.exit();
            return true;
        }

        // 方向键控制
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();

            switch (e.key) {
            case 'ArrowLeft':
                this.playbackController.handleSeek(video, 'backward', 5);
                break;
            case 'ArrowRight':
                this.playbackController.handleSeek(video, 'forward', 5);
                break;
            case 'ArrowUp':
                this.playbackController.handleVolume(video, 'up', 0.1);
                break;
            case 'ArrowDown':
                this.playbackController.handleVolume(video, 'down', 0.1);
                break;
            }
            return true;
        }

        // 空格键播放/暂停（非YouTube网站）
        if (e.key === ' ' && !this.isYouTubeSite()) {
            e.preventDefault();
            e.stopPropagation();
            this.playbackController.handlePlayPause(video);
            return true;
        }

        return false;
    }

    /**
     * 处理键盘按下事件
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyDown(e) {
        try {
            // 全屏模式下的特殊处理
            if (this.lightboxManager.isActive()) {
                if (this.handleLightboxKeys(e)) {
                    return;
                }
            }

            // 检查是否为数字键（速度预设）
            if (
                ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(
                    e.key
                ) &&
                !e.ctrlKey &&
                !e.altKey &&
                !e.metaKey
            ) {
                if (!isTypingInEditable(e)) {
                    this.handlePresetKey(e.key);
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }

            // 构建快捷键字符串
            const shortcutPressed =
                (e.ctrlKey ? 'ctrl+' : '') +
                (e.altKey ? 'alt+' : '') +
                (e.shiftKey ? 'shift+' : '') +
                (e.metaKey ? 'meta+' : '') +
                e.key.toLowerCase();

            // YouTube网站特殊处理：不干预空格键
            if (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                if (this.isYouTubeSite()) {
                    return;
                }
                // 非全屏模式下，其他网站也不处理空格键
                if (!this.lightboxManager.isActive()) {
                    return;
                }
            }

            // 检查音量控制快捷键
            if (this.shortcuts['volume-up'] === shortcutPressed) {
                if (isTypingInEditable(e)) return;
                const media = this.mediaDetector.getTargetMedia();
                if (!media) return;

                this.playbackController.handleVolume(media, 'up', 0.1);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (this.shortcuts['volume-down'] === shortcutPressed) {
                if (isTypingInEditable(e)) return;
                const media = this.mediaDetector.getTargetMedia();
                if (!media) return;

                this.playbackController.handleVolume(media, 'down', 0.1);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // 检查快进快退快捷键
            if (this.shortcuts['seek-forward'] === shortcutPressed) {
                if (isTypingInEditable(e)) return;
                const media = this.mediaDetector.getTargetMedia();
                if (!media) return;

                this.playbackController.handleSeek(media, 'forward', 5);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (this.shortcuts['seek-backward'] === shortcutPressed) {
                if (isTypingInEditable(e)) return;
                const media = this.mediaDetector.getTargetMedia();
                if (!media) return;

                this.playbackController.handleSeek(media, 'backward', 5);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // 检查帮助快捷键（不依赖媒体元素）
            if (
                this.shortcuts['show-help'] === shortcutPressed &&
                !isTypingInEditable(e)
            ) {
                this.keyboardHelp.toggle();
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // 查找匹配的动作
            const action = Object.keys(this.shortcuts).find(
                (key) => this.shortcuts[key] === shortcutPressed
            );

            console.log('快捷键调试:', { shortcutPressed, action, shortcuts: this.shortcuts });

            if (!action) return;

            // 检查是否在可编辑区域
            if (isTypingInEditable(e)) {
                return;
            }

            // 获取目标媒体元素
            const media = this.lightboxManager.isActive()
                ? this.lightboxManager.getVideo()
                : this.mediaDetector.getTargetMedia();

            if (!media) return;

            // 检查是否应该允许快捷键
            let shouldAllowShortcut = false;
            if (this.lightboxManager.isActive()) {
                shouldAllowShortcut = true;
            } else {
                const allMedia = this.mediaDetector.getAllMediaElements();
                const isDirectlyTargetingMedia = media === e.target || media.contains(e.target);
                const mediaHasFocus = document.activeElement === media;
                const isHovering = media.matches && media.matches(':hover');

                // 页面上只有一个媒体元素时，始终允许快捷键
                if (allMedia.length === 1) {
                    shouldAllowShortcut = true;
                } else if (isDirectlyTargetingMedia || mediaHasFocus || isHovering) {
                    shouldAllowShortcut = true;
                }
            }

            if (!shouldAllowShortcut) {
                console.log('快捷键被阻止:', {
                    allMediaCount: this.mediaDetector.getAllMediaElements().length,
                    media: media?.tagName,
                    lightboxActive: this.lightboxManager.isActive()
                });
                return;
            }

            // 阻止默认行为
            e.preventDefault();
            e.stopPropagation();

            // 执行对应的动作
            if (action === 'toggle-fullscreen') {
                this.lightboxManager.toggle(media);
            } else {
                this.playbackController.handleSpeed(media, action);
            }
        } catch (e) {
            console.error('处理键盘事件失败:', e);
        }
    }

    /**
     * 初始化键盘事件监听
     */
    init() {
        // 全局键盘事件监听（捕获阶段）
        window.addEventListener('keydown', this.handleKeyDown, true);

        // 备用监听器，用于全屏模式的特殊按键
        this.backupKeyDownHandler = (e) => {
            if (!this.lightboxManager.isActive()) return;

            if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                this.handleKeyDown(e);
            }
        };
        document.addEventListener('keydown', this.backupKeyDownHandler, true);
    }

    /**
     * 清理事件监听
     */
    destroy() {
        window.removeEventListener('keydown', this.handleKeyDown, true);
        if (this.backupKeyDownHandler) {
            document.removeEventListener('keydown', this.backupKeyDownHandler, true);
            this.backupKeyDownHandler = null;
        }
    }
}
