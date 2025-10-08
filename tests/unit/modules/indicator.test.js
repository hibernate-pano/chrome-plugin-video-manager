/**
 * Tests for SpeedIndicator module
 */

import { SpeedIndicator } from "../../../src/modules/indicator.js";

describe("SpeedIndicator", () => {
  let indicator;
  let mockMediaElement;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = "";

    // Mock media element
    mockMediaElement = {
      getBoundingClientRect: jest.fn(() => ({
        top: 100,
        left: 100,
        width: 640,
        height: 480,
      })),
    };

    indicator = new SpeedIndicator();
  });

  afterEach(() => {
    if (indicator) {
      indicator.destroy();
    }
  });

  test("should create indicator element on init", () => {
    const indicatorElement = document.getElementById("video-speed-indicator");
    expect(indicatorElement).toBeTruthy();
  });

  test("should show indicator with speed value", () => {
    indicator.show(1.5, mockMediaElement);

    const indicatorElement = document.getElementById("video-speed-indicator");
    expect(indicatorElement.textContent).toBe("1.50x");
    expect(indicatorElement.classList.contains("visible")).toBe(true);
  });

  test("should show indicator with custom text", () => {
    indicator.show("⏩ 5秒", mockMediaElement);

    const indicatorElement = document.getElementById("video-speed-indicator");
    expect(indicatorElement.textContent).toBe("⏩ 5秒");
    expect(indicatorElement.classList.contains("visible")).toBe(true);
  });

  test("should hide indicator", () => {
    indicator.show(1.5, mockMediaElement);
    indicator.hide();

    const indicatorElement = document.getElementById("video-speed-indicator");
    expect(indicatorElement.classList.contains("visible")).toBe(false);
  });

  test("should auto-hide after timeout", (done) => {
    jest.useFakeTimers();

    indicator.show(1.5, mockMediaElement);

    const indicatorElement = document.getElementById("video-speed-indicator");
    expect(indicatorElement.classList.contains("visible")).toBe(true);

    jest.advanceTimersByTime(1500);

    expect(indicatorElement.classList.contains("visible")).toBe(false);

    jest.useRealTimers();
    done();
  });

  test("should destroy indicator element", () => {
    indicator.destroy();

    const indicatorElement = document.getElementById("video-speed-indicator");
    expect(indicatorElement).toBeNull();
  });
});
