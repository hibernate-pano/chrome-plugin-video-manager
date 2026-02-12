# 贡献指南 (Contributing Guide)

感谢您考虑为这个项目做出贡献！本文档将指导您如何参与到项目开发中。

## 📋 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境设置](#开发环境设置)
- [代码规范](#代码规范)
- [提交指南](#提交指南)
- [Pull Request 流程](#pull-request-流程)
- [问题报告](#问题报告)

## 🤝 行为准则

参与本项目即表示您同意遵守我们的行为准则：

- 尊重所有贡献者
- 提供建设性的反馈
- 专注于对项目最有利的事情
- 展现同理心

## 🎯 如何贡献

有许多方式可以为项目做出贡献：

### 报告 Bug

如果您发现了 bug，请创建一个 issue 并包含：

- 清晰的标题和描述
- 重现步骤
- 预期行为和实际行为
- 截图（如果适用）
- 环境信息（浏览器版本、操作系统等）

### 建议功能

如果您有新功能的想法：

- 检查是否已有相关 issue
- 创建详细的功能建议
- 解释为什么这个功能有用
- 如果可能，提供实现思路

### 提交代码

1. **选择任务**

   - 查看 [Issues](https://github.com/yourusername/chrome-plugin-video-manager/issues)
   - 寻找标有 `good first issue` 或 `help wanted` 的问题
   - 在开始工作前评论表明您的意图

2. **编写代码**

   - 遵循项目代码规范
   - 添加或更新相关测试
   - 更新文档

3. **提交 Pull Request**
   - 参考下面的 PR 流程

## 🛠️ 开发环境设置

### 前置要求

- Node.js 18+ 和 pnpm 8+（推荐）或 npm 9+
- Git
- Chrome 浏览器
- 代码编辑器（推荐 VS Code）

### 设置步骤

1. **Fork 并克隆仓库**

   ```bash
   git clone https://github.com/YOUR-USERNAME/chrome-plugin-video-manager.git
   cd chrome-plugin-video-manager
   ```

2. **添加上游仓库**

   ```bash
   git remote add upstream https://github.com/ORIGINAL-OWNER/chrome-plugin-video-manager.git
   ```

3. **选择开发版本**

   **原版（v1.x）：**
   ```bash
   npm install
   npm run build
   ```

   **React 版（v2.0 - 推荐）：**
   ```bash
   cd src-react
   pnpm install
   pnpm build
   ```

4. **在 Chrome 中加载扩展**

   - 访问 `chrome://extensions/`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - **原版**：选择项目根目录
   - **React 版**：选择 `src-react/dist` 目录

5. **开发模式**

   **原版：**
   ```bash
   npm run dev
   ```

   **React 版：**
   ```bash
   cd src-react
   pnpm dev
   ```
   这将启动 Vite 开发服务器，支持 HMR 热更新。

### VS Code 推荐设置

创建 `.vscode/settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["javascript", "typescript", "typescriptreact"],
  "typescript.tsdk": "src-react/node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

推荐扩展：

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense
- Jest Runner
- GitLens
- Error Lens

## 📐 代码规范

### 项目版本

本项目包含两个版本，请根据您要贡献的版本遵循相应的规范：

#### v1.x（原版 JavaScript）

我们使用 ESLint 来保持代码一致性：

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint:fix
```

**基本规则：**
- 使用 4 空格缩进
- 使用单引号
- 语句末尾使用分号
- 每行最大长度 100 字符
- 使用驼峰命名法

#### v2.0（React + TypeScript）

```bash
cd src-react

# 检查代码
pnpm lint

# 类型检查
pnpm type-check

# 自动修复
pnpm lint:fix
```

**基本规则：**
- 使用 2 空格缩进（React/TypeScript 标准）
- 使用单引号（字符串）和双引号（JSX 属性）
- 语句末尾使用分号
- 使用 TypeScript 严格模式
- 遵循 React Hooks 规则
- 使用 Tailwind CSS 实用类优先

### 命名约定

#### v1.x（JavaScript）
- **变量和函数**：驼峰命名 (`myVariable`, `myFunction`)
- **类和构造函数**：帕斯卡命名 (`MyClass`)
- **常量**：大写下划线 (`MAX_COUNT`, `DEFAULT_VALUE`)
- **私有属性**：下划线前缀 (`_privateMethod`)

#### v2.0（TypeScript + React）
- **变量和函数**：驼峰命名 (`myVariable`, `myFunction`)
- **React 组件**：帕斯卡命名 (`MyComponent`)
- **类型和接口**：帕斯卡命名 (`MyInterface`, `MyType`)
- **常量**：大写下划线 (`MAX_COUNT`) 或驼峰命名 (`defaultConfig`)
- **文件名**：
  - 组件：帕斯卡命名 (`MyComponent.tsx`)
  - 工具函数：驼峰命名 (`myUtil.ts`)
  - Hooks：驼峰命名，use 前缀 (`useMyHook.ts`)
  - Store：驼峰命名，Store 后缀 (`myStore.ts`)

### 文件组织

```javascript
// 1. 导入语句
import { something } from "./module.js";

// 2. 常量定义
const CONSTANT_VALUE = 100;

// 3. 类或函数定义
class MyClass {
  // ...
}

// 4. 导出语句
export { MyClass };
```

### 注释规范

使用 JSDoc 格式：

```javascript
/**
 * 函数描述
 * @param {string} name - 参数描述
 * @param {number} age - 参数描述
 * @returns {Object} 返回值描述
 */
function myFunction(name, age) {
  // 实现
}
```

### 测试要求

- 所有新功能必须包含测试
- 保持测试覆盖率 >80%
- 使用描述性的测试名称

#### v1.x（Jest）
```javascript
describe("MyModule", () => {
  test("should do something correctly", () => {
    // 测试代码
  });
});
```

#### v2.0（Vitest + Jest + Playwright）

**单元测试（Vitest）：**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

**扩展 API 测试（Jest）：**
```typescript
import { describe, it, expect } from '@jest/globals';
import { myModule } from '@/modules/myModule';

describe('myModule', () => {
  it('should work with Chrome API', () => {
    // 测试代码
  });
});
```

**E2E 测试（Playwright）：**
```typescript
import { test, expect } from '@playwright/test';

test('should control video speed', async ({ page }) => {
  await page.goto('https://example.com');
  // 测试代码
});
```

## 📝 提交指南

### 提交信息格式

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型 (type)：**

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 仅文档更改
- `style`: 代码格式调整（不影响功能）
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例：**

```
feat(indicator): add custom position option

Add ability for users to customize the position of the speed indicator.

Closes #123
```

### 提交最佳实践

- 每个提交应该是一个逻辑单元
- 提交信息要清晰描述性强
- 避免大规模的提交
- 经常提交小的改动

## 🔄 Pull Request 流程

### 1. 准备工作

```bash
# 确保您的 fork 是最新的
git fetch upstream
git checkout main
git merge upstream/main

# 创建新分支
git checkout -b feature/my-new-feature
```

### 2. 开发

- 编写代码
- 添加测试
- 运行测试：
  - **v1.x**: `npm test`
  - **v2.0**: `cd src-react && pnpm test`
- 运行 lint：
  - **v1.x**: `npm run lint`
  - **v2.0**: `cd src-react && pnpm lint`
- 构建项目：
  - **v1.x**: `npm run build`
  - **v2.0**: `cd src-react && pnpm build`

### 3. 提交更改

```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/my-new-feature
```

### 4. 创建 Pull Request

- 访问 GitHub 仓库
- 点击"New Pull Request"
- 选择您的分支
- 填写 PR 模板：
  - 描述您的更改
  - 关联相关 issue
  - 添加截图（如果适用）
  - 列出测试清单

### 5. 代码审查

- 响应审查意见
- 进行必要的修改
- 推送更新

### 6. 合并

- 获得批准后，维护者将合并您的 PR
- 删除您的特性分支

## 🐛 问题报告

### Bug 报告模板

创建 issue 时请包含：

```markdown
**描述**
清晰简洁地描述 bug。

**重现步骤**

1. 访问 '...'
2. 点击 '...'
3. 看到错误

**预期行为**
描述您期望发生什么。

**截图**
如果适用，添加截图。

**环境：**

- OS: [例如 Windows 10]
- 浏览器: [例如 Chrome 120]
- 扩展版本: [例如 2.0.0]

**附加信息**
任何其他相关信息。
```

### 功能请求模板

```markdown
**功能描述**
清晰简洁地描述您想要的功能。

**使用场景**
描述为什么需要这个功能。

**期望解决方案**
描述您期望的实现方式。

**替代方案**
描述您考虑过的其他方案。

**附加信息**
任何其他相关信息或截图。
```

## 📚 其他资源

- [Chrome Extension 文档](https://developer.chrome.com/docs/extensions/)
- [React 文档](https://react.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [Vite 文档](https://vitejs.dev/)
- [Vitest 文档](https://vitest.dev/)
- [Jest 测试文档](https://jestjs.io/)
- [Playwright 文档](https://playwright.dev/)
- [ESLint 规则](https://eslint.org/docs/rules/)
- [项目架构文档](docs/ARCHITECTURE.md)
- [迁移指南](docs/MIGRATION.md)

## 🎉 成为贡献者

首次贡献被接受后，您的名字将被添加到 README.md 的贡献者列表中！

## 💬 获取帮助

如果您有任何问题：

- 查看现有的 [Issues](https://github.com/yourusername/chrome-plugin-video-manager/issues)
- 创建新的 Discussion
- 联系维护者

---

感谢您的贡献！🙌
