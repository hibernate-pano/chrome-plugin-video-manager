(() => {
    let indicatorTimeout;
    let lastActiveMedia = null;
    let shortcuts = {};

    const defaultShortcuts = {
        increase: '=',
        decrease: '-',
        reset: '0',
        'toggle-play': ' ',
        'set-1.5': '[',
        'set-2.0': ']'
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
        indicator.style.top = `${window.scrollY + rect.top + 10}px`;
        indicator.style.left = `${window.scrollX + rect.left + 10}px`;
        indicator.textContent = typeof speed === 'string' ? speed : `${speed.toFixed(2)}x`;
        indicator.classList.add('visible');

        clearTimeout(indicatorTimeout);
        indicatorTimeout = setTimeout(() => {
            indicator.classList.remove('visible');
        }, 1500);
    }

    function handlePlayback(media, action) {
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
            case 'set-1.5':
                newSpeed = 1.5;
                break;
            case 'set-2.0':
                newSpeed = 2.0;
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
        const allMedia = Array.from(document.querySelectorAll('video, audio'));
        const hoveredMedia = allMedia.find(m => m.matches(':hover'));
        if (hoveredMedia) return hoveredMedia;
        if (lastActiveMedia && !lastActiveMedia.paused) return lastActiveMedia;
        return allMedia.find(m => {
            const rect = m.getBoundingClientRect();
            return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        });
    }

    document.addEventListener('mouseover', event => {
        if (event.target.tagName === 'VIDEO' || event.target.tagName === 'AUDIO') {
            lastActiveMedia = event.target;
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        const media = getTargetMedia();
        if (!media) return;

        const action = Object.keys(shortcuts).find(key => shortcuts[key] === e.key);

        if (action) {
            e.preventDefault();
            e.stopPropagation();
            handlePlayback(media, action);
        }
    }, true);

})();