(() => {
    let indicatorTimeout;
    let lastActiveMedia = null;

    // Create the speed indicator element once
    const indicator = document.createElement('div');
    indicator.id = 'video-speed-indicator';
    document.body.appendChild(indicator);

    function showIndicator(speed, mediaElement) {
        // Position and show the indicator
        const rect = mediaElement.getBoundingClientRect();
        indicator.style.top = `${window.scrollY + rect.top + 10}px`;
        indicator.style.left = `${window.scrollX + rect.left + 10}px`;
        indicator.textContent = `${speed.toFixed(2)}x`;
        indicator.classList.add('visible');

        // Clear previous timeout and set a new one to hide it
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
                media.paused ? media.play() : media.pause();
                showIndicator(media.paused ? 'Paused' : `${media.playbackRate.toFixed(2)}x`, media);
                return;
        }
        media.playbackRate = newSpeed;
        showIndicator(newSpeed, media);
    }

    function getTargetMedia() {
        // Priority: 1. Hovered media, 2. Last active media, 3. First media on screen
        const allMedia = Array.from(document.querySelectorAll('video, audio'));
        const hoveredMedia = allMedia.find(m => m.matches(':hover'));
        if (hoveredMedia) return hoveredMedia;
        if (lastActiveMedia && !lastActiveMedia.paused) return lastActiveMedia;
        
        // Find the first media element visible on the screen
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
        // Ignore inputs in text fields
        if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        const media = getTargetMedia();
        if (!media) return;

        let action = null;
        switch (e.key) {
            case '=':
            case '+':
                action = 'increase';
                break;
            case '-':
                action = 'decrease';
                break;
            case '0':
                action = 'reset';
                break;
            case '[':
                action = 'set-1.5';
                break;
            case ']':
                action = 'set-2.0';
                break;
            case ' ':
                action = 'toggle-play';
                break;
        }

        if (action) {
            e.preventDefault();
            e.stopPropagation();
            handlePlayback(media, action);
        }
    }, true); // Use capture phase to get events first

})();
