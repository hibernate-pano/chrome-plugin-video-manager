/**
 * 测试工具函数的测试
 * 验证自定义 render 和辅助函数是否正常工作
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import {
  render,
  renderWithStore,
  createMockMediaElement,
  createMockChromeStorage,
} from './test-utils';

// 简单的测试组件
function TestComponent() {
  return <div>Test Component</div>;
}

// 使用 i18n 的测试组件
function I18nTestComponent() {
  return <div>Internationalized Component</div>;
}

describe('test-utils', () => {
  describe('render', () => {
    it('should render component with providers', () => {
      render(<TestComponent />);
      expect(screen.getByText('Test Component')).toBeInTheDocument();
    });

    it('should render component with i18n provider', () => {
      render(<I18nTestComponent />);
      expect(screen.getByText('Internationalized Component')).toBeInTheDocument();
    });
  });

  describe('renderWithStore', () => {
    it('should render component with store access', () => {
      renderWithStore(<TestComponent />);
      expect(screen.getByText('Test Component')).toBeInTheDocument();
    });
  });

  describe('createMockMediaElement', () => {
    it('should create mock media element with default values', () => {
      const mockMedia = createMockMediaElement();

      expect(mockMedia.playbackRate).toBe(1.0);
      expect(mockMedia.volume).toBe(1.0);
      expect(mockMedia.currentTime).toBe(0);
      expect(mockMedia.duration).toBe(100);
      expect(mockMedia.paused).toBe(true);
    });

    it('should create mock media element with custom values', () => {
      const mockMedia = createMockMediaElement({
        playbackRate: 1.5,
        volume: 0.8,
        currentTime: 50,
      });

      expect(mockMedia.playbackRate).toBe(1.5);
      expect(mockMedia.volume).toBe(0.8);
      expect(mockMedia.currentTime).toBe(50);
    });

    it('should have mock methods', () => {
      const mockMedia = createMockMediaElement();

      expect(mockMedia.play).toBeDefined();
      expect(mockMedia.pause).toBeDefined();
      expect(mockMedia.load).toBeDefined();
      expect(vi.isMockFunction(mockMedia.play)).toBe(true);
    });
  });

  describe('createMockChromeStorage', () => {
    it('should create mock storage with get/set methods', () => {
      const mockStorage = createMockChromeStorage();

      expect(mockStorage.get).toBeDefined();
      expect(mockStorage.set).toBeDefined();
      expect(mockStorage.remove).toBeDefined();
      expect(mockStorage.clear).toBeDefined();
    });

    it('should store and retrieve values', async () => {
      const mockStorage = createMockChromeStorage();

      await mockStorage.set({ key1: 'value1', key2: 'value2' });

      const result = await mockStorage.get('key1');
      expect(result).toEqual({ key1: 'value1' });
    });

    it('should retrieve multiple values', async () => {
      const mockStorage = createMockChromeStorage();

      await mockStorage.set({ key1: 'value1', key2: 'value2' });

      const result = await mockStorage.get(['key1', 'key2']);
      expect(result).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should remove values', async () => {
      const mockStorage = createMockChromeStorage();

      await mockStorage.set({ key1: 'value1', key2: 'value2' });
      await mockStorage.remove('key1');

      const result = await mockStorage.get('key1');
      expect(result).toEqual({ key1: undefined });
    });

    it('should clear all values', async () => {
      const mockStorage = createMockChromeStorage();

      await mockStorage.set({ key1: 'value1', key2: 'value2' });
      await mockStorage.clear();

      const result = await mockStorage.get(['key1', 'key2']);
      expect(result).toEqual({ key1: undefined, key2: undefined });
    });
  });
});
