/**
 * Tests for LightboxManager module
 */

import { LightboxManager } from "../../../src/modules/lightbox.js";

describe("LightboxManager", () => {
  let lightbox;
  let mockVideo;

  beforeEach(() => {
    lightbox = new LightboxManager();
    
    mockVideo = {
      tagName: "VIDEO",
      parentElement: {
        insertBefore: jest.fn(),
      },
      nextSibling: null,
      style: {
        cssText: "",
      },
      controls: false,
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getBoundingClientRect: jest.fn().mockReturnValue({
        left: 100,
        top: 100,
        width: 800,
        height: 450,
      }),
      dispatchEvent: jest.fn(),
      setAttribute: jest.fn(),
      removeAttribute: jest.fn(),
    };

    document.body.appendChild = jest.fn();
    document.body.classList.add = jest.fn();
    document.body.classList.remove = jest.fn();
    document.getElementById = jest.fn().mockReturnValue(null);
    document.createElement = jest.fn().mockImplementation((tag) => {
      if (tag === 'div') {
        return {
          id: 'vsc-lightbox-overlay',
          appendChild: jest.fn(),
          remove: jest.fn(),
          querySelector: jest.fn().mockReturnValue(mockVideo),
          videoClickHandler: null,
        };
      }
      return {};
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("isActive", () => {
    test("should return false initially", () => {
      expect(lightbox.isActive()).toBe(false);
    });
  });

  describe("enter", () => {
    test("should enter lightbox mode", () => {
      lightbox.enter(mockVideo);
      expect(lightbox.isActive()).toBe(true);
    });

    test("should not enter for non-video elements", () => {
      const mockAudio = { ...mockVideo, tagName: "AUDIO" };
      lightbox.enter(mockAudio);
      expect(lightbox.isActive()).toBe(false);
    });
  });

  describe("exit", () => {
    test("should exit lightbox mode when active", () => {
      const mockLightbox = {
        id: 'vsc-lightbox-overlay',
        querySelector: jest.fn().mockReturnValue(mockVideo),
        videoClickHandler: null,
        remove: jest.fn(),
      };
      document.getElementById = jest.fn().mockReturnValue(mockLightbox);
      lightbox.enter(mockVideo);
      lightbox.exit();
      expect(lightbox.isActive()).toBe(false);
    });
  });

  describe("toggle", () => {
    test("should toggle to active", () => {
      lightbox.toggle(mockVideo);
      expect(lightbox.isActive()).toBe(true);
    });

    test("should toggle to inactive", () => {
      const mockLightbox = {
        id: 'vsc-lightbox-overlay',
        querySelector: jest.fn().mockReturnValue(mockVideo),
        videoClickHandler: null,
        remove: jest.fn(),
      };
      document.getElementById = jest.fn().mockReturnValue(mockLightbox);
      lightbox.enter(mockVideo);
      lightbox.toggle(mockVideo);
      expect(lightbox.isActive()).toBe(false);
    });
  });

  describe("getVideo", () => {
    test("should return null when not active", () => {
      expect(lightbox.getVideo()).toBeNull();
    });

    test("should return video when active", () => {
      const mockLightbox = {
        id: 'vsc-lightbox-overlay',
        querySelector: jest.fn().mockReturnValue(mockVideo),
      };
      document.getElementById = jest.fn().mockReturnValue(mockLightbox);
      lightbox.enter(mockVideo);
      expect(lightbox.getVideo()).toBe(mockVideo);
    });
  });
});
