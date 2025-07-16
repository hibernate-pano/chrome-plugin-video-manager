(() => {
    let indicatorTimeout;
    let lastActiveMedia = null;
    let shortcuts = {};
    
    // 媒体元素缓存系统
    let mediaElementsCache = {
        timestamp: 0,
        elements: [],
        shadowElements: [],
        isStale: true,
        timeoutId: null
    };
    
    // 存储元素可见性状态
    const elementVisibilityMap = new WeakMap();
    
    // 缓存媒体元素尺寸
    const mediaSizeCache = new WeakMap();
    
    // 标记插件功能初始化状态
    let isFullFunctionalityInitialized = false;
    let intersectionObserver;
    
    // 增强的防抖函数，支持立即执行选项
    function enhancedDebounce(func, wait, immediate = false) {
        let timeout;
        return function(...args) {
            const context = this;
            const later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    }
    
    // 原始防抖函数保持不变，以便与现有代码兼容
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // --- Lightbox State ---
    let lightboxActive = false;
    let originalParent = null;
    let originalNextSibling = null;
    let originalVideoStyles = {};

    const defaultShortcuts = {
        increase: '=',
        decrease: '-',
        reset: '0',
        'toggle-play': ' ',
        'toggle-fullscreen': 'f',
    };

    // 加载快捷键设置
    function loadShortcutSettings() {
        chrome.storage.sync.get({ shortcuts: defaultShortcuts }, (data) => {
            try {
                shortcuts = data.shortcuts;
            } catch (e) {
                console.error('加载快捷键失败:', e);
                shortcuts = defaultShortcuts; // 使用默认值作为后备
            }
        });
    }
    
    // 监听快捷键变更
    chrome.storage.onChanged.addListener((changes, namespace) => {
        try {
            if (namespace === 'sync' && changes.shortcuts) {
                shortcuts = changes.shortcuts.newValue;
            }
        } catch (e) {
            console.error('处理快捷键变更失败:', e);
        }
    });

    // 预先创建指示器元素
    let indicator;
    function createIndicator() {
        indicator = document.createElement('div');
        indicator.id = 'video-speed-indicator';
        document.body.appendChild(indicator);
    }

    function showIndicator(speed, mediaElement) {
        try {
            // 确保指示器已创建
            if (!indicator) {
                createIndicator();
            }
            
            const rect = mediaElement.getBoundingClientRect();
            // FIX: Indicator is position:fixed, so its position should always be relative to the viewport.
            // Do not add scrollX/scrollY offsets.
            indicator.style.top = `${rect.top + 10}px`;
            indicator.style.left = `${rect.left + 10}px`;
            indicator.textContent = typeof speed === 'string' ? speed : `${speed.toFixed(2)}x`;
            indicator.classList.add('visible');

            clearTimeout(indicatorTimeout);
            indicatorTimeout = setTimeout(() => {
                indicator.classList.remove('visible');
            }, 1500);
        } catch (e) {
            console.error('显示指示器失败:', e);
        }
    }

    function handlePlayback(media, action) {
        try {
            if (action === 'toggle-fullscreen') {
                toggleLightboxFullscreen(media);
                return;
            }

            let newSpeed;
            switch (action) {
                case 'increase':
                    newSpeed = Math.min(media.playbackRate + 0.1, 16);
                    break;
                case 'decrease':
                    newSpeed = Math.max(media.playbackRate - 0.1, 0.1);
                    break;
                case 'reset':
                    newSpeed = 1.0;
                    break;
                case 'toggle-play':
                    if (media.paused) {
                        const playPromise = media.play();
                        if (playPromise !== undefined) {
                            playPromise
                                .then(() => {
                                    showIndicator(`${media.playbackRate.toFixed(2)}x`, media);
                                })
                                .catch(error => {
                                    console.error('播放媒体失败:', error);
                                    showIndicator('播放失败', media);
                                });
                        } else {
                            showIndicator(`${media.playbackRate.toFixed(2)}x`, media);
                        }
                    } else {
                        media.pause();
                        showIndicator('已暂停', media);
                    }
                    return;
            }
            media.playbackRate = newSpeed;
            showIndicator(newSpeed, media);
        } catch (e) {
            console.error('处理媒体播放操作失败:', e);
        }
    }

    // 使用事件委托处理媒体元素hover事件
    function setupMediaEventDelegation() {
        // 优化后的鼠标事件处理函数
        function handleMouseEvent(event) {
            try {
                const target = event.target;
                if (target.tagName === 'VIDEO' || target.tagName === 'AUDIO') {
                    lastActiveMedia = target;
                    // 标记缓存元素中的此媒体为最近交互
                    const cachedIndex = mediaElementsCache.elements.indexOf(target);
                    if (cachedIndex >= 0) {
                        // 如果在缓存中找到了，可以记录其他信息
                        mediaSizeCache.delete(target); // 清除尺寸缓存，因为用户可能调整了大小
                    }
                }
            } catch (e) {
                console.error('处理鼠标事件失败:', e);
            }
        }
        
        // 使用增强版防抖函数
        const debouncedMouseHandler = enhancedDebounce(handleMouseEvent, 100);
        document.addEventListener('mouseover', debouncedMouseHandler, true);
    }

    function getTargetMedia() {
        try {
            // 确保完整功能已初始化
            ensureFullFunctionalityInitialized();
            
            // 1. 首先检查是否有处于lightbox模式的视频
            if (lightboxActive) {
                const lightboxVideo = document.querySelector('#vsc-lightbox-overlay video');
                if (lightboxVideo) return lightboxVideo;
            }

            // 获取所有媒体元素（使用缓存）
            const allMedia = getAllMediaElements();
            if (allMedia.length === 0) return null;
            
            // 2. 检查是否有鼠标悬停的媒体
            const hoveredMedia = allMedia.find(m => m.matches && m.matches(':hover'));
            if (hoveredMedia) return hoveredMedia;
            
            // 3. 检查最后一个交互的媒体元素是否仍在播放
            if (lastActiveMedia && !lastActiveMedia.paused && !lastActiveMedia.ended && lastActiveMedia.readyState > 2) {
                // 确保媒体元素仍然存在于DOM中或iframe中
                if (document.body.contains(lastActiveMedia) || isInIframe(lastActiveMedia)) {
                    return lastActiveMedia;
                }
            }
            
            // 4. 尝试找到正在播放的媒体
            const playingMedia = allMedia.filter(m => !m.paused && !m.ended && m.readyState > 2);
            
            if (playingMedia.length === 1) {
                // 只有一个正在播放的媒体，直接返回
                return playingMedia[0];
            } else if (playingMedia.length > 1) {
                // 多个正在播放的媒体，按优先级选择
                // 首先检查哪些在视口内
                const visiblePlayingMedia = playingMedia.filter(m => isElementInViewport(m));
                
                if (visiblePlayingMedia.length >= 1) {
                    // 在可见的正在播放的媒体中，选择尺寸最大的
                    return getBiggestMedia(visiblePlayingMedia);
                } else {
                    // 如果没有可见的，选择所有播放媒体中尺寸最大的
                    return getBiggestMedia(playingMedia);
                }
            }
            
            // 5. 没有播放中的媒体，找一个在视口中最大的媒体元素
            const visibleMedia = allMedia.filter(m => isElementInViewport(m));
            if (visibleMedia.length > 0) {
                return getBiggestMedia(visibleMedia);
            }
            
            // 6. 如果还是没找到，返回第一个媒体元素
            return allMedia[0];
        } catch (e) {
            console.error('查找目标媒体失败:', e);
            return null;
        }
    }
    
    // 辅助函数：获取所有媒体元素，包括iframe中的
    function getAllMediaElements() {
        // 如果缓存未过期且有元素，直接返回缓存
        if (!mediaElementsCache.isStale && mediaElementsCache.elements.length > 0) {
            return mediaElementsCache.elements;
        }
        
        // 否则，重新获取媒体元素
        const mainDocMedia = Array.from(document.querySelectorAll('video, audio'));
        const iframeMedia = getMediaFromIframes();
        
        // 更新缓存
        mediaElementsCache.elements = [...mainDocMedia, ...iframeMedia];
        mediaElementsCache.timestamp = Date.now();
        mediaElementsCache.isStale = false;
        
        // 设置缓存过期
        clearTimeout(mediaElementsCache.timeoutId);
        mediaElementsCache.timeoutId = setTimeout(() => {
            mediaElementsCache.isStale = true;
        }, 2000); // 2秒后缓存过期
        
        return mediaElementsCache.elements;
    }
    
    // 辅助函数：从iframe中获取媒体元素
    function getMediaFromIframes() {
        const iframeMedia = [];
        try {
            // 获取所有iframe，优先处理视口内的
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const visibleIframes = iframes.filter(iframe => isElementInViewport(iframe));
            const framesToProcess = [...visibleIframes, ...iframes.filter(iframe => !visibleIframes.includes(iframe))];
            
            for (const iframe of framesToProcess) {
                try {
                    // 只访问同源iframe
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        const mediaInIframe = Array.from(iframeDoc.querySelectorAll('video, audio'));
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
    
    // 设置IntersectionObserver
    function setupIntersectionObserver() {
        // 如果浏览器支持IntersectionObserver
        if ('IntersectionObserver' in window) {
            intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    elementVisibilityMap.set(entry.target, entry.isIntersecting);
                });
            });
        }
    }
    
    // 辅助函数：检查元素是否在视口内
    function isElementInViewport(el) {
        try {
            // 如果有缓存的可见性信息，优先使用
            if (elementVisibilityMap.has(el)) {
                return elementVisibilityMap.get(el);
            }
            
            // 如果支持IntersectionObserver，添加到观察列表
            if (intersectionObserver) {
                intersectionObserver.observe(el);
                // 首次调用仍使用getBoundingClientRect计算，后续会由观察器更新
            }
            
            // 手动计算可见性
            const rect = el.getBoundingClientRect();
            const isVisible = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
            
            // 缓存结果
            elementVisibilityMap.set(el, isVisible);
            return isVisible;
        } catch (e) {
            return false;
        }
    }
    
    // 辅助函数：检查元素是否在iframe中
    function isInIframe(el) {
        try {
            // 遍历所有iframe
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc && iframeDoc.contains(el)) {
                        return true;
                    }
                } catch (e) {
                    // 跨域iframe会抛出错误，忽略
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    }
    
    // 辅助函数：从媒体数组中获取尺寸最大的
    function getBiggestMedia(mediaArray) {
        if (!mediaArray || mediaArray.length === 0) return null;
        if (mediaArray.length === 1) return mediaArray[0];
        
        return mediaArray.reduce((biggest, current) => {
            try {
                // 获取或计算最大元素的面积
                let biggestArea = mediaSizeCache.get(biggest);
                if (biggestArea === undefined) {
                    const biggestRect = biggest.getBoundingClientRect();
                    biggestArea = biggestRect.width * biggestRect.height;
                    mediaSizeCache.set(biggest, biggestArea);
                }
                
                // 获取或计算当前元素的面积
                let currentArea = mediaSizeCache.get(current);
                if (currentArea === undefined) {
                    const currentRect = current.getBoundingClientRect();
                    currentArea = currentRect.width * currentRect.height;
                    mediaSizeCache.set(current, currentArea);
                }
                
                return currentArea > biggestArea ? current : biggest;
            } catch (e) {
                return biggest;
            }
        }, mediaArray[0]);
    }

    function toggleLightboxFullscreen(media) {
        try {
            if (!media || media.tagName !== 'VIDEO') return;

            const lightbox = document.getElementById('vsc-lightbox-overlay');

            if (lightboxActive && lightbox) {
                // --- Exit Lightbox ---
                const video = lightbox.querySelector('video');
                if (video) {
                    // Clean up the click listener we added
                    if (lightbox.videoClickHandler) {
                        video.removeEventListener('click', lightbox.videoClickHandler);
                    }

                    if (originalParent) {
                        originalParent.insertBefore(video, originalNextSibling);
                    } else {
                        document.body.appendChild(video);
                    }
                    video.style.cssText = originalVideoStyles.cssText;
                    video.controls = originalVideoStyles.controls;
                    video.classList.remove('vsc-lightbox-video');
                }

                lightbox.remove();
                document.body.classList.remove('vsc-body-lock');
                lightboxActive = false;
            } else {
                // --- Enter Lightbox ---
                originalParent = media.parentElement;
                originalNextSibling = media.nextSibling;
                originalVideoStyles = { cssText: media.style.cssText, controls: media.controls };

                const newLightbox = document.createElement('div');
                newLightbox.id = 'vsc-lightbox-overlay';

                const handleLightboxVideoClick = () => {
                    // After a click, blur the video after a delay to allow controls to auto-hide.
                    setTimeout(() => {
                        if (document.activeElement === media) {
                            media.blur();
                        }
                    }, 2000);
                };

                media.classList.add('vsc-lightbox-video');
                media.controls = true;
                media.addEventListener('click', handleLightboxVideoClick);

                // Store the handler on the lightbox element so we can remove it when exiting.
                newLightbox.videoClickHandler = handleLightboxVideoClick;

                newLightbox.appendChild(media);
                document.body.appendChild(newLightbox);
                document.body.classList.add('vsc-body-lock');
                lightboxActive = true;
            }
        } catch (e) {
            console.error('切换全屏模式失败:', e);
        }
    }

    function handleKeyDown(e) {
        try {
            // 特殊处理ESC键退出网页全屏
            if (e.key === 'Escape' && lightboxActive) {
                const lightbox = document.getElementById('vsc-lightbox-overlay');
                if (lightbox) {
                    const video = lightbox.querySelector('video');
                    if (video) {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleLightboxFullscreen(video);
                        return;
                    }
                }
            }

            // 原有的快捷键处理逻辑保持不变
            // When lightbox is active, some keys (like arrows) might be meant for video seeking.
            // We only intercept the shortcuts defined in our extension.
            const shortcutPressed = (
                (e.ctrlKey ? 'ctrl+' : '') +
                (e.altKey ? 'alt+' : '') +
                (e.shiftKey ? 'shift+' : '') +
                (e.metaKey ? 'meta+' : '') +
                e.key.toLowerCase()
            );
            const action = Object.keys(shortcuts).find(key => shortcuts[key] === shortcutPressed);

            if (!action) {
                return;
            }
            
            // 检查是否在可编辑区域
            if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                // 在输入框中不拦截快捷键
                return;
            }

            // 先检查是否有可用的媒体元素
            const media = getTargetMedia();
            if (!media) return; // 如果没有媒体元素，直接返回，不阻止默认行为

            // 只有找到媒体元素时才阻止默认行为
            e.preventDefault();
            e.stopPropagation();

            handlePlayback(media, action);
        } catch (e) {
            console.error('处理键盘事件失败:', e);
        }
    }

    // 兼容性处理：不是所有浏览器都支持matches方法
    if (!Element.prototype.matches) {
        Element.prototype.matches = 
            Element.prototype.matchesSelector || 
            Element.prototype.mozMatchesSelector || 
            Element.prototype.msMatchesSelector || 
            Element.prototype.oMatchesSelector || 
            Element.prototype.webkitMatchesSelector || 
            function(s) {
                var matches = (this.document || this.ownerDocument).querySelectorAll(s),
                    i = matches.length;
                while (--i >= 0 && matches.item(i) !== this) {}
                return i > -1;            
            };
    }

    // 处理Shadow DOM中的媒体元素
    function handleShadowDOMMedia() {
        try {
            const mediaInShadow = querySelectorAllIncludingShadowDOM('video, audio');
            if (mediaInShadow.length > 0) {
                // 标记这些元素在缓存中
                for (const media of mediaInShadow) {
                    if (!mediaElementsCache.elements.includes(media)) {
                        mediaElementsCache.elements.push(media);
                    }
                }
            }
        } catch (e) {
            console.error('处理Shadow DOM媒体失败:', e);
        }
    }

    // 检查Shadow DOM支持
    function querySelectorAllIncludingShadowDOM(selector) {
        try {
            // 检查是否已有缓存结果
            if (!mediaElementsCache.isStale && mediaElementsCache.shadowElements.length > 0) {
                return mediaElementsCache.shadowElements;
            }
            
            const elements = Array.from(document.querySelectorAll(selector));
            
            // 优先检查视口内的元素
            const allElements = document.querySelectorAll('*');
            const visibleElements = Array.from(allElements)
                .filter(el => isElementInViewport(el))
                .slice(0, 100); // 限制数量，避免过度处理
                
            for (const element of visibleElements) {
                if (element.shadowRoot) {
                    elements.push(...element.shadowRoot.querySelectorAll(selector));
                }
            }
            
            // 缓存结果
            mediaElementsCache.shadowElements = elements;
            return elements;
        } catch (e) {
            console.error('Shadow DOM查询失败:', e);
            return [];
        }
    }

    // 检查页面媒体元素
    function checkForMediaElements() {
        try {
            const hasMedia = document.querySelector('video, audio') !== null;
            if (hasMedia) {
                // 找到媒体元素，停止定时检查
                if (mediaCheckInterval) {
                    clearInterval(mediaCheckInterval);
                    mediaCheckInterval = null;
                }
                
                // 标记缓存为过期，下次会重新获取媒体元素
                mediaElementsCache.isStale = true;
                
                // 获取并处理Shadow DOM中的媒体
                handleShadowDOMMedia();
            }
        } catch (e) {
            console.error('检查媒体元素失败:', e);
        }
    }
    
    // 使用递减间隔的检查策略
    let mediaCheckInterval;
    function setupMediaElementDetection() {
        // 初始检查
        checkForMediaElements();
        
        // 使用递减的间隔时间：先频繁检查，然后逐渐减少
        const intervals = [500, 1000, 2000, 5000]; // 毫秒
        let intervalIndex = 0;
        
        function scheduleNextCheck() {
            if (mediaCheckInterval) {
                clearInterval(mediaCheckInterval);
            }
            
            if (intervalIndex < intervals.length) {
                const currentInterval = intervals[intervalIndex++];
                mediaCheckInterval = setInterval(() => {
                    checkForMediaElements();
                    if (intervalIndex >= intervals.length) {
                        // 达到最长间隔，不再增加
                        return;
                    }
                    // 调度下一个更长的间隔
                    scheduleNextCheck();
                }, currentInterval);
            }
        }
        
        scheduleNextCheck();
        
        // 使用MutationObserver观察DOM变化
        try {
            const observer = new MutationObserver(() => {
                // 将缓存标记为过期，下次获取会重新查询
                mediaElementsCache.isStale = true;
                checkForMediaElements();
            });
            observer.observe(document.body, { 
                childList: true, 
                subtree: true,
                attributes: false, 
                characterData: false 
            });
        } catch (e) {
            console.error('设置MutationObserver失败:', e);
        }
        
        // 当页面可见性改变时重新检查
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                mediaElementsCache.isStale = true;
                checkForMediaElements();
            }
        });
    }

    // 确保完整功能已初始化
    function ensureFullFunctionalityInitialized() {
        if (isFullFunctionalityInitialized) return;
        
        // 执行更全面的初始化
        handleShadowDOMMedia();
        
        // 标记为已初始化
        isFullFunctionalityInitialized = true;
    }
    
    // 初始化插件
    function initializePlugin() {
        // 创建指示器元素
        createIndicator();
        
        // 设置IntersectionObserver
        setupIntersectionObserver();
        
        // 加载快捷键设置
        loadShortcutSettings();
        
        // 设置媒体检测
        setupMediaElementDetection();
        
        // 设置事件委托
        setupMediaEventDelegation();
        
        // 全局键盘事件监听
        window.addEventListener('keydown', handleKeyDown, true);
    }
    
    // 初始化插件
    initializePlugin();

})();