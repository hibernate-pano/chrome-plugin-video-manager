/**
 * 媒体元素检测模块
 * @module modules/mediaDetector
 */

import {
    isElementInViewport,
    isInIframe,
    querySelectorAllIncludingShadowDOM,
} from '../utils/dom.js';

/**
 * 媒体元素检测器
 */
export class MediaDetector {
    /**
     * 缓存过期时间（毫秒）
     */
    static CACHE_EXPIRY_MS = 500;

    constructor() {
        this.elementVisibilityMap = new WeakMap();
        this.mediaSizeCache = new WeakMap();
        this.intersectionObserver = null;
        this.lastActiveMedia = null;
        this.mediaCheckInterval = null;
        this.mutationObserver = null;
        this.visibilityChangeHandler = null;
        this.debouncedHandler = null;
        this.cache = {
            elements: [],
            timestamp: 0,
            isStale: true,
            timeoutId: null,
        };

        this.setupIntersectionObserver();
    }

    /**
     * 设置IntersectionObserver
     */
    setupIntersectionObserver() {
        if ('IntersectionObserver' in window) {
            this.intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    this.elementVisibilityMap.set(entry.target, entry.isIntersecting);
                });
            });
        }
    }

    /**
     * 获取所有媒体元素，包括iframe中的
     * @returns {Array<HTMLMediaElement>} 媒体元素数组
     */
    getAllMediaElements() {
        // 如果缓存未过期且有元素，直接返回缓存
        if (!this.cache.isStale && this.cache.elements.length > 0) {
            return this.cache.elements;
        }

        // 否则，重新获取媒体元素
        const mainDocMedia = Array.from(document.querySelectorAll('video, audio'));
        const iframeMedia = this.getMediaFromIframes();

        // 更新缓存
        this.cache.elements = [...mainDocMedia, ...iframeMedia];
        this.cache.timestamp = Date.now();
        this.cache.isStale = false;

        // 设置缓存过期
        clearTimeout(this.cache.timeoutId);
        this.cache.timeoutId = setTimeout(() => {
            this.cache.isStale = true;
        }, MediaDetector.CACHE_EXPIRY_MS); // 500ms后缓存过期

        return this.cache.elements;
    }

    /**
     * 从iframe中获取媒体元素
     * @returns {Array<HTMLMediaElement>} iframe中的媒体元素
     */
    getMediaFromIframes() {
        const iframeMedia = [];
        try {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const visibleIframes = iframes.filter((iframe) =>
                isElementInViewport(iframe, this.elementVisibilityMap, this.intersectionObserver)
            );
            const framesToProcess = [
                ...visibleIframes,
                ...iframes.filter((iframe) => !visibleIframes.includes(iframe)),
            ];

            for (const iframe of framesToProcess) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        const mediaInIframe = Array.from(
                            iframeDoc.querySelectorAll('video, audio')
                        );
                        iframeMedia.push(...mediaInIframe);
                    }
                } catch (e) {
                    // 跨域iframe会抛出错误，忽略它
                }
            }
        } catch (e) {
            // 出现异常，忽略iframe内容
        }

        return iframeMedia;
    }

    /**
     * 处理Shadow DOM中的媒体元素
     */
    handleShadowDOMMedia() {
        try {
            const mediaInShadow = querySelectorAllIncludingShadowDOM(
                'video, audio',
                this.cache.shadowElements,
                this.cache.isStale
            );

            if (mediaInShadow.length > 0) {
                for (const media of mediaInShadow) {
                    if (!this.cache.elements.includes(media)) {
                        this.cache.elements.push(media);
                    }
                }
            }
        } catch (e) {
            console.error('处理Shadow DOM媒体失败:', e);
        }
    }

    /**
     * 从媒体数组中获取尺寸最大的
     * @param {Array<HTMLMediaElement>} mediaArray - 媒体元素数组
     * @returns {HTMLMediaElement|null} 最大的媒体元素
     */
    getBiggestMedia(mediaArray) {
        if (!mediaArray || mediaArray.length === 0) return null;
        if (mediaArray.length === 1) return mediaArray[0];

        return mediaArray.reduce((biggest, current) => {
            try {
                let biggestArea = this.mediaSizeCache.get(biggest);
                if (biggestArea === undefined) {
                    const biggestRect = biggest.getBoundingClientRect();
                    biggestArea = biggestRect.width * biggestRect.height;
                    this.mediaSizeCache.set(biggest, biggestArea);
                }

                let currentArea = this.mediaSizeCache.get(current);
                if (currentArea === undefined) {
                    const currentRect = current.getBoundingClientRect();
                    currentArea = currentRect.width * currentRect.height;
                    this.mediaSizeCache.set(current, currentArea);
                }

                return currentArea > biggestArea ? current : biggest;
            } catch (e) {
                return biggest;
            }
        }, mediaArray[0]);
    }

    /**
     * 获取目标媒体元素
     * @param {boolean} lightboxActive - 是否处于全屏模式
     * @returns {HTMLMediaElement|null} 目标媒体元素
     */
    getTargetMedia(lightboxActive = false) {
        try {
            // 首先检查是否有处于lightbox模式的视频
            if (lightboxActive) {
                const lightboxVideo = document.querySelector('#vsc-lightbox-overlay video');
                if (lightboxVideo) return lightboxVideo;
            }

            // 获取所有媒体元素（使用缓存）
            const allMedia = this.getAllMediaElements();
            if (allMedia.length === 0) return null;

            // 检查是否有鼠标悬停的媒体
            const hoveredMedia = allMedia.find((m) => m.matches && m.matches(':hover'));
            if (hoveredMedia) return hoveredMedia;

            // 检查最后一个交互的媒体元素是否仍在播放
            if (
                this.lastActiveMedia &&
                !this.lastActiveMedia.paused &&
                !this.lastActiveMedia.ended &&
                this.lastActiveMedia.readyState > 2
            ) {
                if (
                    document.body.contains(this.lastActiveMedia) ||
                    isInIframe(this.lastActiveMedia)
                ) {
                    return this.lastActiveMedia;
                }
            }

            // 尝试找到正在播放的媒体
            const playingMedia = allMedia.filter((m) => !m.paused && !m.ended && m.readyState > 2);

            if (playingMedia.length === 1) {
                return playingMedia[0];
            } else if (playingMedia.length > 1) {
                const visiblePlayingMedia = playingMedia.filter((m) =>
                    isElementInViewport(m, this.elementVisibilityMap, this.intersectionObserver)
                );

                if (visiblePlayingMedia.length >= 1) {
                    return this.getBiggestMedia(visiblePlayingMedia);
                } else {
                    return this.getBiggestMedia(playingMedia);
                }
            }

            // 没有播放中的媒体，找一个在视口中最大的媒体元素
            const visibleMedia = allMedia.filter((m) =>
                isElementInViewport(m, this.elementVisibilityMap, this.intersectionObserver)
            );
            if (visibleMedia.length > 0) {
                return this.getBiggestMedia(visibleMedia);
            }

            // 如果还是没找到，返回第一个媒体元素
            return allMedia[0];
        } catch (e) {
            console.error('查找目标媒体失败:', e);
            return null;
        }
    }

    /**
     * 检查页面媒体元素
     */
    checkForMediaElements() {
        try {
            const hasMedia = document.querySelector('video, audio') !== null;
            if (hasMedia) {
                if (this.mediaCheckInterval) {
                    clearInterval(this.mediaCheckInterval);
                    this.mediaCheckInterval = null;
                }

                this.cache.isStale = true;
                this.handleShadowDOMMedia();
            }
        } catch (e) {
            console.error('检查媒体元素失败:', e);
        }
    }

    /**
     * 设置媒体元素检测
     */
    setupMediaElementDetection() {
        this.checkForMediaElements();

        const intervals = [200, 400, 800, 1200];
        let intervalIndex = 0;

        const scheduleNextCheck = () => {
            if (this.mediaCheckInterval) {
                clearInterval(this.mediaCheckInterval);
            }

            if (intervalIndex < intervals.length) {
                const currentInterval = intervals[intervalIndex++];
                this.mediaCheckInterval = setInterval(() => {
                    this.checkForMediaElements();
                    if (intervalIndex >= intervals.length) {
                        return;
                    }
                    scheduleNextCheck();
                }, currentInterval);
            }
        };

        scheduleNextCheck();

        // 使用MutationObserver观察DOM变化
        try {
            const observer = new MutationObserver(() => {
                this.cache.isStale = true;
                this.checkForMediaElements();
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false,
            });
        } catch (e) {
            console.error('设置MutationObserver失败:', e);
        }

        // 当页面可见性改变时重新检查
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.cache.isStale = true;
                this.checkForMediaElements();
            }
        });
    }

    /**
     * 设置媒体事件委托
     */
    setupMediaEventDelegation() {
        const handleMouseEvent = (event) => {
            try {
                const target = event.target;
                if (target.tagName === 'VIDEO' || target.tagName === 'AUDIO') {
                    this.lastActiveMedia = target;
                    const cachedIndex = this.cache.elements.indexOf(target);
                    if (cachedIndex >= 0) {
                        this.mediaSizeCache.delete(target);
                    }
                }
            } catch (e) {
                console.error('处理鼠标事件失败:', e);
            }
        };

        // 使用防抖
        let timeout;
        this.debouncedHandler = (event) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => handleMouseEvent(event), 100);
        };

        document.addEventListener('mouseover', this.debouncedHandler, true);
    }

    /**
     * 标记缓存为过期
     */
    invalidateCache() {
        this.cache.isStale = true;
    }

    /**
     * 清理资源
     */
    destroy() {
        // 清理 interval
        if (this.mediaCheckInterval) {
            clearInterval(this.mediaCheckInterval);
            this.mediaCheckInterval = null;
        }

        // 清理缓存超时
        if (this.cache.timeoutId) {
            clearTimeout(this.cache.timeoutId);
            this.cache.timeoutId = null;
        }

        // 清理 MutationObserver
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }

        // 清理 visibilitychange 事件
        if (this.visibilityChangeHandler) {
            document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
            this.visibilityChangeHandler = null;
        }

        // 清理 IntersectionObserver
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }

        // 清理鼠标事件
        if (this.debouncedHandler) {
            document.removeEventListener('mouseover', this.debouncedHandler, true);
            this.debouncedHandler = null;
        }
    }
}
