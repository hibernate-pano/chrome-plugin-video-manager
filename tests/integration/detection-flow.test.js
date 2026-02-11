/**
 * Integration tests for complete media detection and control flow
 */

import { MediaDetector } from '../../src/modules/mediaDetector.js';
import { PlaybackController } from '../../src/modules/playbackController.js';
import { SpeedIndicator } from '../../src/modules/indicator.js';

describe('Integration Tests - Media Detection and Control Flow', () => {
    let mediaDetector;
    let playbackController;
    let indicator;

    beforeEach(() => {
        document.body.innerHTML = '<video id="test-video-1" width="400" height="300"></video>';
        mediaDetector = new MediaDetector();
        indicator = new SpeedIndicator();
        playbackController = new PlaybackController(indicator);
        mediaDetector.setupMediaElementDetection();
    });

    afterEach(() => {
        if (indicator) {
            indicator.destroy();
        }
        if (mediaDetector) {
            mediaDetector.destroy();
        }
        document.body.innerHTML = '';
    });

    test('should detect media elements on page load', () => {
        const mediaElements = mediaDetector.getAllMediaElements();
        expect(mediaElements).toBeTruthy();
        expect(mediaElements.length).toBeGreaterThanOrEqual(1);
    });

    test('should identify target media with hover', () => {
        const video = document.getElementById('test-video-1');

        video.dispatchEvent(
            new MouseEvent('mouseover', { bubbles: true, cancelable: true })
        );

        const targetMedia = mediaDetector.getTargetMedia();
        expect(targetMedia).toBeTruthy();
        expect(targetMedia.id).toBe('test-video-1');
    });

    test('should apply speed control to media', () => {
        const video = document.getElementById('test-video-1');

        playbackController.handleSpeed(video, 'increase');
        expect(video.playbackRate).toBeCloseTo(1.1, 0.01);
    });

    test('should handle speed reset', () => {
        const video = document.getElementById('test-video-1');
        video.playbackRate = 2.0;

        playbackController.handleSpeed(video, 'reset');
        expect(video.playbackRate).toBe(1.0);
    });

    test('should show speed indicator', () => {
        const video = document.getElementById('test-video-1');

        playbackController.handleSpeed(video, 'increase');

        const indicatorElement = indicator.indicator;
        expect(indicatorElement).toBeTruthy();

        const shadowRoot = indicatorElement.shadowRoot;
        expect(shadowRoot).toBeTruthy();

        const speedValue = shadowRoot.querySelector('.speed-value');
        expect(speedValue).toBeTruthy();
        expect(speedValue.textContent).toContain('1.10x');
    });
});
