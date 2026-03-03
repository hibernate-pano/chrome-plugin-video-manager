# React Testing Library 配置和使用指南

## 概述

本目录包含 React Testing Library 的配置和测试工具函数，用于测试 React 组件。

## 文件说明

### setup.ts

测试环境的全局设置文件，包含：

- **自动清理**：每个测试后自动清理 DOM
- **Chrome API Mock**：模拟 Chrome 扩展 API
- **jest-dom 匹配器**：提供额外的 DOM 断言方法

### test-utils.tsx

测试工具函数库，提供：

1. **自定义 render 函数**：自动包装必要的 Provider
2. **renderWithStore**：用于测试需要 Zustand store 的组件
3. **createMockMediaElement**：创建 mock 的 HTMLMediaElement
4. **createMockChromeStorage**：创建 mock 的 Chrome Storage API
5. **waitForElementToBeRemoved**：等待元素从 DOM 中移除

## 使用方法

### 基础组件测试

```typescript
import { render, screen } from '@/utils/__tests__/test-utils';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### 测试需要 i18n 的组件

自定义 render 函数已经自动包装了 I18nextProvider，无需额外配置：

```typescript
import { render, screen } from '@/utils/__tests__/test-utils';
import { MyI18nComponent } from '../MyI18nComponent';

describe('MyI18nComponent', () => {
  it('should display translated text', () => {
    render(<MyI18nComponent />);
    // i18n 已经自动配置
    expect(screen.getByText(/translated/i)).toBeInTheDocument();
  });
});
```

### 测试需要 Zustand Store 的组件

```typescript
import { renderWithStore, screen } from '@/utils/__tests__/test-utils';
import { MyStoreComponent } from '../MyStoreComponent';

describe('MyStoreComponent', () => {
  it('should access store data', () => {
    renderWithStore(<MyStoreComponent />);
    // 组件可以访问 Zustand store
    expect(screen.getByText(/store data/i)).toBeInTheDocument();
  });
});
```

### 测试媒体相关功能

```typescript
import { render, createMockMediaElement } from '@/utils/__tests__/test-utils';
import { MediaController } from '../MediaController';

describe('MediaController', () => {
  it('should control media playback', () => {
    const mockMedia = createMockMediaElement({
      playbackRate: 1.5,
      volume: 0.8,
    });

    render(<MediaController media={mockMedia} />);

    // 测试媒体控制逻辑
    expect(mockMedia.playbackRate).toBe(1.5);
  });
});
```

### 测试 Chrome Storage 功能

```typescript
import { render, createMockChromeStorage } from '@/utils/__tests__/test-utils';
import { SettingsComponent } from '../SettingsComponent';

describe('SettingsComponent', () => {
  it('should save settings to Chrome storage', async () => {
    const mockStorage = createMockChromeStorage();
    global.chrome.storage.sync = mockStorage;

    render(<SettingsComponent />);

    // 触发保存操作
    // ...

    expect(mockStorage.set).toHaveBeenCalledWith({
      settings: expect.any(Object),
    });
  });
});
```

### 用户交互测试

```typescript
import { render, screen } from '@/utils/__tests__/test-utils';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('should handle click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Click me</Button>);

    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### 异步测试

```typescript
import { render, screen, waitFor } from '@/utils/__tests__/test-utils';
import { AsyncComponent } from '../AsyncComponent';

describe('AsyncComponent', () => {
  it('should load data asynchronously', async () => {
    render(<AsyncComponent />);

    // 等待加载完成
    await waitFor(() => {
      expect(screen.getByText('Data loaded')).toBeInTheDocument();
    });
  });
});
```

## 可用的断言方法

通过 `@testing-library/jest-dom`，你可以使用以下额外的断言方法：

- `toBeInTheDocument()` - 元素在文档中
- `toBeVisible()` - 元素可见
- `toBeDisabled()` - 元素被禁用
- `toHaveClass()` - 元素有指定的 class
- `toHaveStyle()` - 元素有指定的样式
- `toHaveTextContent()` - 元素有指定的文本内容
- `toHaveValue()` - 输入元素有指定的值
- 更多方法请参考：https://github.com/testing-library/jest-dom

## 最佳实践

1. **使用 screen 查询**：优先使用 `screen.getByRole()` 等可访问性友好的查询方法
2. **避免实现细节**：测试用户行为，而不是实现细节
3. **使用 userEvent**：模拟真实的用户交互
4. **等待异步操作**：使用 `waitFor` 或 `findBy*` 查询等待异步操作完成
5. **清理副作用**：测试中的副作用会自动清理，但如果有特殊需求可以在 `afterEach` 中手动清理

## 运行测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage

# 使用 UI 界面
pnpm test:ui
```

## 参考资源

- [React Testing Library 文档](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest 文档](https://vitest.dev/)
- [jest-dom 匹配器](https://github.com/testing-library/jest-dom)
- [用户事件 API](https://testing-library.com/docs/user-event/intro)
