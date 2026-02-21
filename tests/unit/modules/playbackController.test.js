/**
 * Tests for PlaybackController module
 */

import { PlaybackController } from "../../../src/modules/playbackController.js";

describe("PlaybackController", () => {
  let controller;
  let mockIndicator;
  let mockMedia;

  beforeEach(() => {
    mockIndicator = {
      show: jest.fn(),
    };
    controller = new PlaybackController(mockIndicator);

    mockMedia = {
      playbackRate: 1.0,
      volume: 1.0,
      paused: true,
      duration: 100,
      currentTime: 0,
      play: jest.fn().mockResolvedValue(),
      pause: jest.fn(),
    };
  });

  describe("handleSpeed", () => {
    test("should increase speed by 0.1", () => {
      mockMedia.playbackRate = 1.0;
      controller.handleSpeed(mockMedia, "increase");
      expect(mockMedia.playbackRate).toBe(1.1);
    });

    test("should decrease speed by 0.1", () => {
      mockMedia.playbackRate = 1.0;
      controller.handleSpeed(mockMedia, "decrease");
      expect(mockMedia.playbackRate).toBe(0.9);
    });

    test("should reset speed to 1.0", () => {
      mockMedia.playbackRate = 2.0;
      controller.handleSpeed(mockMedia, "reset");
      expect(mockMedia.playbackRate).toBe(1.0);
    });

    test("should not exceed maximum speed of 16", () => {
      mockMedia.playbackRate = 15.9;
      controller.handleSpeed(mockMedia, "increase");
      expect(mockMedia.playbackRate).toBe(16);
    });

    test("should not go below minimum speed of 0.1", () => {
      mockMedia.playbackRate = 0.15;
      controller.handleSpeed(mockMedia, "decrease");
      expect(mockMedia.playbackRate).toBe(0.1);
    });

    test("should handle invalid playbackRate", () => {
      mockMedia.playbackRate = NaN;
      controller.handleSpeed(mockMedia, "increase");
      expect(mockMedia.playbackRate).toBeCloseTo(1.1);
    });
  });

  describe("handleSeek", () => {
    test("should seek forward", () => {
      mockMedia.currentTime = 10;
      mockMedia.duration = 100;
      controller.handleSeek(mockMedia, "forward", 5);
      expect(mockMedia.currentTime).toBe(15);
    });

    test("should seek backward", () => {
      mockMedia.currentTime = 10;
      controller.handleSeek(mockMedia, "backward", 5);
      expect(mockMedia.currentTime).toBe(5);
    });

    test("should not seek past duration", () => {
      mockMedia.currentTime = 99;
      mockMedia.duration = 100;
      controller.handleSeek(mockMedia, "forward", 5);
      expect(mockMedia.currentTime).toBe(100);
    });

    test("should not seek before start", () => {
      mockMedia.currentTime = 3;
      controller.handleSeek(mockMedia, "backward", 5);
      expect(mockMedia.currentTime).toBe(0);
    });
  });

  describe("handleVolume", () => {
    test("should increase volume", () => {
      mockMedia.volume = 0.5;
      controller.handleVolume(mockMedia, "up", 0.1);
      expect(mockMedia.volume).toBe(0.6);
    });

    test("should decrease volume", () => {
      mockMedia.volume = 0.5;
      controller.handleVolume(mockMedia, "down", 0.1);
      expect(mockMedia.volume).toBe(0.4);
    });

    test("should not exceed maximum volume", () => {
      mockMedia.volume = 0.95;
      controller.handleVolume(mockMedia, "up", 0.1);
      expect(mockMedia.volume).toBe(1);
    });

    test("should not go below minimum volume", () => {
      mockMedia.volume = 0.05;
      controller.handleVolume(mockMedia, "down", 0.1);
      expect(mockMedia.volume).toBe(0);
    });
  });

  describe("handlePlayPause", () => {
    test("should play when paused", async () => {
      mockMedia.paused = true;
      await controller.handlePlayPause(mockMedia);
      expect(mockMedia.play).toHaveBeenCalled();
    });

    test("should pause when playing", async () => {
      mockMedia.paused = false;
      await controller.handlePlayPause(mockMedia);
      expect(mockMedia.pause).toHaveBeenCalled();
    });
  });
});
