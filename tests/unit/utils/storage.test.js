/**
 * Tests for storage utility functions
 */

import {
  defaultShortcuts,
  loadShortcutSettings,
  saveShortcutSettings,
} from "../../../src/utils/storage.js";

// Mock Chrome API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
  runtime: {
    lastError: null,
  },
};

describe("storage utilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should have default shortcuts defined", () => {
    expect(defaultShortcuts).toBeDefined();
    expect(defaultShortcuts.increase).toBe("=");
    expect(defaultShortcuts.decrease).toBe("-");
    expect(defaultShortcuts.reset).toBe("0");
    expect(defaultShortcuts["toggle-fullscreen"]).toBe("f");
  });

  test("should load shortcuts from storage", async () => {
    const mockShortcuts = { ...defaultShortcuts };
    chrome.storage.sync.get.mockImplementation((defaults, callback) => {
      callback({ shortcuts: mockShortcuts });
    });

    const shortcuts = await loadShortcutSettings();

    expect(chrome.storage.sync.get).toHaveBeenCalled();
    expect(shortcuts).toEqual(mockShortcuts);
  });

  test("should save shortcuts to storage", async () => {
    chrome.storage.sync.set.mockImplementation((data, callback) => {
      callback();
    });

    const newShortcuts = { ...defaultShortcuts, increase: "ctrl+=" };
    await saveShortcutSettings(newShortcuts);

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      { shortcuts: newShortcuts },
      expect.any(Function)
    );
  });

  test("should handle storage errors", async () => {
    chrome.runtime.lastError = { message: "Storage error" };
    chrome.storage.sync.set.mockImplementation((data, callback) => {
      callback();
    });

    const newShortcuts = { ...defaultShortcuts };

    await expect(saveShortcutSettings(newShortcuts)).rejects.toMatchObject({
      message: "Storage error",
    });

    chrome.runtime.lastError = null;
  });
});
