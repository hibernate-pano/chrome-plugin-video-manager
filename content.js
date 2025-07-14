(() => {
    let indicatorTimeout;
    let lastActiveMedia = null;
    let shortcuts = {};

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

    // Load shortcuts from storage
    chrome.storage.sync.get({ shortcuts: defaultShortcuts }, (data) => {
        shortcuts = data.shortcuts;
    });

    // Listen for changes in shortcuts
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.shortcuts) {
            shortcuts = changes.shortcuts.newValue;
        }
    });

    const indicator = document.createElement('div');
    indicator.id = 'video-speed-indicator';
    document.body.appendChild(indicator);

    function showIndicator(speed, mediaElement) {
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
    }

    function handlePlayback(media, action) {
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
                    media.play();
                    showIndicator(`${media.playbackRate.toFixed(2)}x`, media);
                } else {
                    media.pause();
                    showIndicator('Paused', media);
                }
                return;
        }
        media.playbackRate = newSpeed;
        showIndicator(newSpeed, media);
    }

    function getTargetMedia() {
        const lightboxVideo = document.querySelector('#vsc-lightbox-overlay video');
        if (lightboxVideo) return lightboxVideo;

        const allMedia = Array.from(document.querySelectorAll('video, audio'));
        const hoveredMedia = allMedia.find(m => m.matches(':hover'));
        if (hoveredMedia) return hoveredMedia;
        if (lastActiveMedia && !lastActiveMedia.paused) return lastActiveMedia;
        return allMedia.find(m => {
            const rect = m.getBoundingClientRect();
            return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        });
    }

    function toggleLightboxFullscreen(media) {
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
    }

    function handleKeyDown(e) {
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
        
        // Prevent default action if the key is one of our shortcuts
        e.preventDefault();
        e.stopPropagation();

        if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            // But allow it if the user is typing in an input field (except for our shortcuts)
            return;
        }

        const media = getTargetMedia();
        if (!media) return;

        handlePlayback(media, action);
    }

    document.addEventListener('mouseover', event => {
        if (event.target.tagName === 'VIDEO' || event.target.tagName === 'AUDIO') {
            lastActiveMedia = event.target;
        }
    });

    // Listen on the whole window, using capture to catch events early.
    window.addEventListener('keydown', handleKeyDown, true);

})();