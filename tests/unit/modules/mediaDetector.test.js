/**
 * Tests for MediaDetector
 */

import { MediaDetector } from '../../../src/modules/mediaDetector.js';

describe('MediaDetector', () => {
    let detector;

    beforeEach(() => {
        document.body.innerHTML = '<video id="test-video-1"></video><video id="test-video-2"></video>';
        detector = new MediaDetector();
    });

    afterEach(() => {
        if (detector) {
            detector.destroy();
        }
        document.body.innerHTML = '';
    });

    test('should detect media elements', () => {
        const mediaElements = detector.getAllMediaElements();
        expect(mediaElements).toBeTruthy();
        expect(mediaElements.length).toBeGreaterThanOrEqual(2);
    });

    test('should get target media with hover', () => {
        const video1 = document.getElementById('test-video-1');
        const video2 = document.getElementById('test-video-2');

        video1.dispatchEvent(
            new MouseEvent('mouseover', { bubbles: true, cancelable: true })
        );

        const targetMedia = detector.getTargetMedia();
        expect(targetMedia.id).toBe('test-video-1');
    });

    test('should get largest media', () => {
        const video1 = document.getElementById('test-video-1');
        const video2 = document.getElementById('test-video-2');

        video1.style.width = '400px';
        video1.style.height = '300px';

        const mediaElements = detector.getAllMediaElements();
        const largest = detector.getBiggestMedia(mediaElements);
        expect(largest.id).toBe('test-video-1');
    });

    test('should invalidate cache', () => {
        const mediaElements = detector.getAllMediaElements();
        expect(detector.cache.isStale).toBe(false);

        detector.invalidateCache();
        expect(detector.cache.isStale).toBe(true);
    });
});
