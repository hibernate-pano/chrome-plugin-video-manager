/**
 * Tests for SpeedIndicator
 */

import { SpeedIndicator } from '../../../src/modules/indicator.js';

describe('SpeedIndicator', () => {
    let indicator;

    beforeEach(() => {
        document.body.innerHTML = '';
        indicator = new SpeedIndicator();
    });

    afterEach(() => {
        if (indicator) {
            indicator.destroy();
        }
    });

    test('should create indicator element on initialization', () => {
        expect(indicator.indicator).toBeTruthy();
        expect(indicator.indicator.id).toBe('vsc-speed-indicator');
    });

    test('should show indicator with speed', () => {
        const mockMedia = {
            getBoundingClientRect: () => ({
                top: 100,
                left: 200,
            }),
            tagName: 'DIV',
        };
        document.body.appendChild(mockMedia);

        indicator.show(1.5, mockMedia);

        expect(indicator.indicator.classList.contains('visible')).toBe(true);

        const speedElement = indicator.indicator.shadowRoot.querySelector('.speed-value');
        expect(speedElement.textContent).toBe('1.50x');

        document.body.removeChild(mockMedia);
    });

    test('should hide indicator after timeout', (done) => {
        jest.useFakeTimers();

        const mockMedia = {
            getBoundingClientRect: () => ({
                top: 100,
                left: 200,
            }),
            tagName: 'DIV',
        };
        document.body.appendChild(mockMedia);

        indicator.show(1.5, mockMedia);

        expect(indicator.indicator.classList.contains('visible')).toBe(true);

        jest.advanceTimersByTime(1600);

        setTimeout(() => {
            expect(indicator.indicator.classList.contains('visible')).toBe(false);
            done();
        }, 100);

        jest.useRealTimers();
    });

    test('should hide indicator explicitly', () => {
        const mockMedia = {
            getBoundingClientRect: () => ({
                top: 100,
                left: 200,
            }),
            tagName: 'DIV',
        };
        document.body.appendChild(mockMedia);

        indicator.show(1.5, mockMedia);

        expect(indicator.indicator.classList.contains('visible')).toBe(true);

        indicator.hide();

        expect(indicator.indicator.classList.contains('visible')).toBe(false);

        document.body.removeChild(mockMedia);
    });

    test('should clean up indicator on destroy', () => {
        const indicatorElement = indicator.indicator;

        indicator.destroy();

        expect(document.body.contains(indicatorElement)).toBe(false);
        expect(indicator.indicator).toBeNull();
    });
});
