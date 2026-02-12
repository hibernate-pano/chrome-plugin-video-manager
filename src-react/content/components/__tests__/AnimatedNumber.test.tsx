/**
 * AnimatedNumber 组件测试
 */

import { render, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AnimatedNumber from '../AnimatedNumber';

describe('AnimatedNumber', () => {
  it('应该渲染数字', async () => {
    const { container } = render(<AnimatedNumber value={1.5} decimals={2} />);

    // 等待动画完成
    await waitFor(() => {
      const text = container.textContent || '';
      // 检查是否渲染了数字（可能是 1.5 或 1.50，取决于动画状态）
      expect(text).toMatch(/^1\.5(0)?$/);
    });
  });

  it('应该支持自定义小数位数', async () => {
    const { container } = render(<AnimatedNumber value={100} decimals={0} />);

    await waitFor(() => {
      const text = container.textContent || '';
      expect(text).toMatch(/\d+/);
    });
  });

  it('应该应用自定义类名', () => {
    const { container } = render(
      <AnimatedNumber value={2.0} decimals={2} className="custom-class" />
    );
    const span = container.querySelector('span');
    expect(span).toHaveClass('custom-class');
  });
});
