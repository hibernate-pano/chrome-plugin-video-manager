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

   - 查看 [Issues](https://github.com/hibernate-pano/chrome-plugin-video-manager/issues)
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

- Node.js 24+（Active LTS）和 pnpm
- Git
- Chrome 浏览器
- 代码编辑器（推荐 VS Code）

### 设置步骤

1. **Fork 并克隆仓库**

   ```bash
   git clone https://github.com/hibernate-pano/chrome-plugin-video-manager.git
   cd chrome-plugin-video-manager
   ```

2. **添加上游仓库**

   ```bash
   git remote add upstream https://github.com/hibernate-pano/chrome-plugin-video-manager.git
   ```

3. **安装依赖**

   ```bash
   pnpm install
   ```

4. **构建项目**

   ```bash
   pnpm build
   ```

5. **在 Chrome 中加载扩展**

   - 访问 `chrome://extensions/`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择构建产物目录 `dist/`

6. **开发模式**
   ```bash
   pnpm dev
   ```
   `pnpm dev` 只用于调试设置页（vite dev server），不会产出可加载的扩展。改完 content script 后需要重新 `pnpm build`，并在 `chrome://extensions/` 点击刷新。

### VS Code 推荐设置

创建 `.vscode/settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["javascript"]
}
```

推荐扩展：

- ESLint
- Prettier
- GitLens
- Vitest

## 📐 代码规范

### JavaScript 风格

本仓库暂无 lint / format script。仓库提供 `.eslintrc.json` 与 `.prettierrc`，请在编辑器中自行遵守。

**基本规则（来自 `.prettierrc`）：**

- 使用 2 空格缩进（`tabWidth: 2`）
- 使用单引号（`singleQuote: true`）
- 语句末尾使用分号（`semi: true`）
- 尾随逗号使用 ES5 风格（`trailingComma: "es5"`）
- 每行最大长度 100 字符（`printWidth: 100`）
- 使用驼峰命名法

### 命名约定

- **变量和函数**：驼峰命名 (`myVariable`, `myFunction`)
- **类和构造函数**：帕斯卡命名 (`MyClass`)
- **常量**：大写下划线 (`MAX_COUNT`, `DEFAULT_VALUE`)
- **私有属性**：下划线前缀 (`_privateMethod`)

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
- 新功能需要附带对应的单元测试（本仓库暂无覆盖率门槛）
- 使用描述性的测试名称

```javascript
describe("MyModule", () => {
  test("should do something correctly", () => {
    // 测试代码
  });
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
- 运行测试：`pnpm test`（vitest 单元 + 契约测试）
- 运行全部 Playwright：`pnpm test:e2e`
- 运行真扩展 E2E：`pnpm test:e2e:ext`
- 构建项目：`pnpm build`
- 出包与商店发布：`pnpm build:ext`、`pnpm icons`、`pnpm store:assets`、`pnpm store:auth`、`pnpm store:publish`

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

- [版本号发布约定](./.memory/version-bump-not-force-tag.md)：bump version → commit → 打新 tag `vX.Y.Z` → push，绝不 force 移动已存在的 tag
- [Chrome Extension 文档](https://developer.chrome.com/docs/extensions/)
- [ES6+ 语法指南](https://es6.io/)
- [Vitest 测试文档](https://vitest.dev/)
- [Playwright 测试文档](https://playwright.dev/)
- [ESLint 规则](https://eslint.org/docs/rules/)

## 🎉 成为贡献者

首次贡献被接受后，您的名字将被添加到 README.md 的贡献者列表中！

## 💬 获取帮助

如果您有任何问题：

- 查看现有的 [Issues](https://github.com/hibernate-pano/chrome-plugin-video-manager/issues)
- 创建新的 Discussion
- 联系维护者

---

感谢您的贡献！🙌
