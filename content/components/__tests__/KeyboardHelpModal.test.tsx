/**
 * KeyboardHelpModal 组件测试
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KeyboardHelpModal from '../KeyboardHelpModal';

// Mock Zustand store
vi.mock('../../../shared/stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      shortcuts: {
        'increase': '=',
        'decrease': '-',
        'reset': '0',
        'toggle-fullscreen': 'f',
        'play-pause': ' ',
        'volume-up': ']',
        'volume-down': '[',
        'seek-forward': '.',
        'seek-backward': ',',
        'show-help': '?',
        'preset-1': '7',
        'preset-2': '8',
        'preset-3': '9',
        'preset-4': '4',
        'preset-5': '5',
        'preset-6': '6',
        'preset-7': '1',
      },
      language: 'en',
      presets: [
        { id: '1', speed: 0.5, label: '0.5x', shortcut: '7' },
        { id: '2', speed: 0.75, label: '0.75x', shortcut: '8' },
        { id: '3', speed: 1.0, label: '1.0x', shortcut: '9' },
        { id: '4', speed: 1.25, label: '1.25x', shortcut: '4' },
        { id: '5', speed: 1.5, label: '1.5x', shortcut: '5' },
        { id: '6', speed: 1.75, label: '1.75x', shortcut: '6' },
        { id: '7', speed: 2.0, label: '2.0x', shortcut: '1' },
      ],
    };
    return selector ? selector(state) : state;
  }),
}));

describe('KeyboardHelpModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it('should not render when visible is false', () => {
    const { container } = render(
      <KeyboardHelpModal visible={false} onClose={mockOnClose} />
    );

    // Shadow DOM 容器应该存在，但内容不应该渲染
    expect(container.querySelector('#vsc-keyboard-help-shadow-host')).toBeTruthy();
  });

  it('should render when visible is true', () => {
    render(<KeyboardHelpModal visible={true} onClose={mockOnClose} />);

    // 检查 Shadow DOM 容器是否创建
    const shadowHost = document.querySelector('#vsc-keyboard-help-shadow-host');
    expect(shadowHost).toBeTruthy();
    expect(shadowHost?.shadowRoot).toBeTruthy();
  });

  it('should call onClose when ESC key is pressed', () => {
    render(<KeyboardHelpModal visible={true} onClose={mockOnClose} />);

    // 模拟按下 ESC 键
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when ? key is pressed', () => {
    render(<KeyboardHelpModal visible={true} onClose={mockOnClose} />);

    // 模拟按下 ? 键
    fireEvent.keyDown(document, { key: '?' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should cleanup shadow DOM on unmount', () => {
    const { unmount } = render(
      <KeyboardHelpModal visible={true} onClose={mockOnClose} />
    );

    const shadowHost = document.querySelector('#vsc-keyboard-help-shadow-host');
    expect(shadowHost).toBeTruthy();

    unmount();

    // Shadow DOM 容器应该被移除
    expect(document.querySelector('#vsc-keyboard-help-shadow-host')).toBeFalsy();
  });
});
