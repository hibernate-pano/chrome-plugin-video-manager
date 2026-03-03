# Chrome API 测试

本目录包含使用 Jest 测试框架对 Chrome 扩展 API 的测试。

## 测试文件

- `storage.jest.ts` - Chrome Storage API 测试
- `runtime.jest.ts` - Chrome Runtime API 测试
- `tabs.jest.ts` - Chrome Tabs API 测试
- `i18n.jest.ts` - Chrome i18n API 测试

## 运行测试

```bash
# 运行所有 Jest 测试
pnpm test:jest

# 监听模式（自动重新运行）
pnpm test:jest:watch

# 生成覆盖率报告
pnpm test:jest:coverage

# 运行特定测试文件
pnpm test:jest storage.jest.ts

# 运行所有测试（Vitest + Jest）
pnpm test:all
```

## 测试结构

每个测试文件遵循以下结构：

```typescript
import { chromeMock } from '../mocks/chrome';

describe('API 名称', () => {
  beforeEach(() => {
    // 每个测试前重置 mock
    chromeMock.__reset();
  });

  describe('具体功能', () => {
    it('应该做某事', async () => {
      // 测试代码
      expect(result).toBe(expected);
    });
  });
});
```

## Chrome API Mock

所有 Chrome API 都通过 `tests/mocks/chrome.ts` 进行 mock。Mock 提供了以下功能：

### Storage API
- `chrome.storage.sync.get/set/remove/clear`
- `chrome.storage.local.get/set/remove/clear`
- 支持 Promise 和回调两种方式

### Runtime API
- `chrome.runtime.sendMessage`
- `chrome.runtime.lastError`
- `chrome.runtime.getURL`
- `chrome.runtime.getManifest`
- `chrome.runtime.onMessage`

### Tabs API
- `chrome.tabs.query`
- `chrome.tabs.sendMessage`
- `chrome.tabs.onUpdated`
- `chrome.tabs.onActivated`

### i18n API
- `chrome.i18n.getMessage`
- `chrome.i18n.getUILanguage`
- `chrome.i18n.detectLanguage`

## 辅助函数

Mock 提供了一些辅助函数用于测试：

```typescript
import {
  chromeMock,
  setRuntimeError,
  clearRuntimeError,
  getStorageData,
  setStorageData
} from '../mocks/chrome';

// 重置所有 mock
chromeMock.__reset();

// 设置运行时错误
setRuntimeError('Error message');

// 清除运行时错误
clearRuntimeError();

// 获取存储数据（用于验证）
const data = getStorageData();

// 设置存储数据（用于测试准备）
setStorageData({ key: 'value' }, 'sync');
```

## 测试最佳实践

1. **每个测试前重置 mock**
   ```typescript
   beforeEach(() => {
     chromeMock.__reset();
   });
   ```

2. **测试异步操作**
   ```typescript
   it('应该异步操作', async () => {
     const result = await chrome.storage.sync.get('key');
     expect(result).toBeDefined();
   });
   ```

3. **测试回调函数**
   ```typescript
   it('应该支持回调', (done) => {
     chrome.storage.sync.get('key', (result) => {
       expect(result).toBeDefined();
       done();
     });
   });
   ```

4. **测试错误处理**
   ```typescript
   it('应该处理错误', async () => {
     setRuntimeError('Test error');
     // 测试错误处理逻辑
     expect(chrome.runtime.lastError).toBeDefined();
   });
   ```

## 与 Vitest 的分工

- **Jest**: 测试 Chrome API、扩展特定功能、原生 JS 模块
- **Vitest**: 测试 React 组件、UI 交互、Hooks

这种分工确保了：
- Chrome API 测试使用专门的 mock 环境
- React 组件测试使用 React Testing Library
- 两种测试框架互不干扰，各司其职

## 覆盖率目标

- Chrome API 测试：≥90%
- 核心逻辑模块：≥90%
- 工具函数：≥95%

## 故障排除

### 问题：测试无法找到 Chrome API

**解决方案**：确保 `tests/jest.setup.ts` 正确配置了 Chrome mock：

```typescript
import { chromeMock } from './mocks/chrome';
global.chrome = chromeMock as any;
```

### 问题：ES 模块导入错误

**解决方案**：使用 `NODE_OPTIONS=--experimental-vm-modules` 运行 Jest：

```bash
NODE_OPTIONS=--experimental-vm-modules jest
```

### 问题：TypeScript 类型错误

**解决方案**：确保安装了 `@types/chrome` 和 `@types/jest`：

```bash
pnpm add -D @types/chrome @types/jest
```
