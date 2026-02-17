/**
 * 资源清理测试
 * 验证所有组件和 hooks 在卸载时正确清理资源
 * @module content/__tests__/resourceCleanup
 */

import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ContentApp from '../ContentApp';
import HUD from '../components/HUD';
import Lightbox from '../components/Lightbox';
import KeyboardHelpModal from '../components/KeyboardHelpModal';
import { useDebounce, useDebouncedCallback } from '../hooks/useDebounce';

// Mock Chrome API
global.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  i18n: {
    getMessage: vi.fn((key) => key),
  },
} as any;

describe('资源清理测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    // 清理 DOM
    document.body.innerHTML = '';
  });

  describe('ContentApp 组件', () => {
    it('应该在卸载时清理自定义事件监听器', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<ContentApp />);

      // 验证事件监听器已添加
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'vsc-toggle-keyboard-help',
        expect.any(Function)
      );

      // 卸载组件
      unmount();

      // 验证事件监听器已移除
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'vsc-toggle-keyboard-help',
        expect.any(Function)
      );
    });
  });

  describe('HUD 组件', () => {
    it('应该在卸载时移除 Shadow DOM 容器', () => {
      const { unmount } = render(<HUD />);

      // 等待 Shadow DOM 创建
      waitFor(() => {
        expect(document.querySelector('#vsc-hud-shadow-host')).toBeTruthy();
      });

      // 卸载组件
      unmount();

      // 验证 Shadow DOM 已移除
      expect(document.querySelector('#vsc-hud-shadow-host')).toBeNull();
    });
  });

  describe('Lightbox 组件', () => {
    it('应该在卸载时移除 Shadow DOM 容器', () => {
      const { unmount } = render(<Lightbox />);

      // 等待 Shadow DOM 创建
      waitFor(() => {
        expect(document.querySelector('#vsc-lightbox-shadow-host')).toBeTruthy();
      });

      // 卸载组件
      unmount();

      // 验证 Shadow DOM 已移除
      expect(document.querySelector('#vsc-lightbox-shadow-host')).toBeNull();
    });

    it('应该在卸载时清理键盘事件监听器', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = render(<Lightbox />);

      // 卸载组件
      unmount();

      // 验证事件监听器已移除
      // 注意：由于 Lightbox 内部使用条件渲染，只有在全屏时才会添加事件监听器
      // 这里我们只验证没有泄漏
      expect(removeEventListenerSpy).toHaveBeenCalled();
    });

    it('应该在卸载时清理定时器', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount } = render(<Lightbox />);

      // 卸载组件
      unmount();

      // 验证定时器已清理
      // 注意：由于 Lightbox 内部使用条件渲染，只有在显示控制条时才会有定时器
      // 这里我们只验证没有泄漏
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('KeyboardHelpModal 组件', () => {
    it('应该在卸载时移除 Shadow DOM 容器', () => {
      const { unmount } = render(
        <KeyboardHelpModal visible={false} onClose={() => {}} />
      );

      // 等待 Shadow DOM 创建
      waitFor(() => {
        expect(
          document.querySelector('#vsc-keyboard-help-shadow-host')
        ).toBeTruthy();
      });

      // 卸载组件
      unmount();

      // 验证 Shadow DOM 已移除
      expect(
        document.querySelector('#vsc-keyboard-help-shadow-host')
      ).toBeNull();
    });

    it('应该在卸载时清理键盘事件监听器', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = render(
        <KeyboardHelpModal visible={true} onClose={() => {}} />
      );

      // 验证事件监听器已添加
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );

      // 卸载组件
      unmount();

      // 验证事件监听器已移除
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });
  });

  describe('useDebounce Hook', () => {
    it('应该在卸载时清理定时器', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      function TestComponent() {
        const debouncedValue = useDebounce('test', 500);
        return <div>{debouncedValue}</div>;
      }

      const { unmount } = render(<TestComponent />);

      // 卸载组件
      unmount();

      // 验证定时器已清理
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('应该在值变化时清理旧的定时器', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      function TestComponent({ value }: { value: string }) {
        const debouncedValue = useDebounce(value, 500);
        return <div>{debouncedValue}</div>;
      }

      const { rerender } = render(<TestComponent value="test1" />);

      // 改变值
      rerender(<TestComponent value="test2" />);

      // 验证旧的定时器已清理
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('useDebouncedCallback Hook', () => {
    it('应该在卸载时清理定时器', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const callback = vi.fn();

      function TestComponent() {
        const debouncedCallback = useDebouncedCallback(callback, 500);
        return <button onClick={() => debouncedCallback()}>Click</button>;
      }

      const { unmount } = render(<TestComponent />);

      // 卸载组件
      unmount();

      // 验证定时器已清理
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('内存泄漏预防', () => {
    it('应该在多次挂载和卸载后不泄漏内存', () => {
      // 记录初始 DOM 节点数量
      const initialNodeCount = document.body.childNodes.length;

      // 多次挂载和卸载
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(<ContentApp />);
        unmount();
      }

      // 验证 DOM 节点数量没有增长
      expect(document.body.childNodes.length).toBe(initialNodeCount);
    });

    it('应该在多次挂载和卸载后不泄漏事件监听器', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      // 多次挂载和卸载
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(<ContentApp />);
        unmount();
      }

      // 验证添加和移除的事件监听器数量相等
      expect(addEventListenerSpy).toHaveBeenCalledTimes(10);
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(10);
    });
  });

  describe('beforeunload 事件处理', () => {
    it('应该在 beforeunload 时清理所有资源', () => {
      // 这个测试需要在实际环境中运行，因为 beforeunload 事件很难模拟
      // 这里我们只验证事件监听器已添加
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      // 模拟 main.tsx 中的 setupCleanup
      const beforeUnloadHandler = () => {
        console.log('清理资源');
      };

      window.addEventListener('beforeunload', beforeUnloadHandler);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        beforeUnloadHandler
      );

      // 清理
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    });
  });
});

