/**
 * Tests for debounce utility functions
 */

import { debounce, enhancedDebounce } from "../../../src/utils/debounce.js";

describe("debounce", () => {
  jest.useFakeTimers();

  test("should debounce function calls", () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test("should pass arguments to debounced function", () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn("arg1", "arg2");

    jest.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledWith("arg1", "arg2");
  });
});

describe("enhancedDebounce", () => {
  jest.useFakeTimers();

  test("should debounce function calls with immediate=false", () => {
    const mockFn = jest.fn();
    const debouncedFn = enhancedDebounce(mockFn, 100, false);

    debouncedFn();
    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test("should call immediately when immediate=true", () => {
    const mockFn = jest.fn();
    const debouncedFn = enhancedDebounce(mockFn, 100, true);

    debouncedFn();
    expect(mockFn).toHaveBeenCalledTimes(1);

    debouncedFn();
    jest.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(1); // Still only 1 call
  });
});
