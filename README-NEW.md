# 视频 & 音频速度控制器 (Video & Audio Speed Controller)

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

一个强大的 Chrome 浏览器扩展，允许您使用键盘快捷键轻松控制网页上视频和音频的播放速度。专为在线学习、视频会议和媒体爱好者设计。

![图标](icons/icon128.png)

## ✨ 功能特点

- 🚀 **自定义快捷键**：可定制的键盘快捷键控制媒体播放
- 🎯 **智能媒体检测**：自动检测页面上的视频和音频元素，包括动态加载的内容
- 🌐 **跨站点兼容**：适用于几乎所有网站，包括 YouTube、Bilibili、网课平台等
- 🌈 **视觉反馈**：调整速度时显示美观的屏幕提示
- 🎭 **网页全屏模式**：一键进入沉浸式观看模式，不受网站原有 UI 干扰
- 🔍 **Shadow DOM 支持**：能够检测和控制 Shadow DOM 中的媒体元素
- 🧩 **iframe 支持**：控制嵌入在 iframe 中的媒体
- 📱 **响应式设计**：在各种屏幕尺寸下都能正常工作
- 🔋 **高性能设计**：极低的资源占用，不影响浏览体验
- 🌍 **国际化支持**：内置中英文界面

## 🎮 默认快捷键

| 功能     | 快捷键 | 描述                        |
| -------- | ------ | --------------------------- |
| 加速     | `=`    | 增加播放速度 (+0.1)         |
| 减速     | `-`    | 降低播放速度 (-0.1)         |
| 重置速度 | `0`    | 将速度重置为 1.0x(正常速度) |
| 网页全屏 | `f`    | 进入/退出网页全屏模式       |

> 💡 所有快捷键均可在扩展选项中自定义

### 网页全屏模式特殊快捷键

在网页全屏模式下，还支持以下额外控制：

| 功能     | 快捷键 | 描述             |
| -------- | ------ | ---------------- |
| 快退     | `←`    | 快退 5 秒        |
| 快进     | `→`    | 快进 5 秒        |
| 增加音量 | `↑`    | 增加音量         |
| 减小音量 | `↓`    | 减小音量         |
| 退出全屏 | `ESC`  | 退出网页全屏模式 |

## 📦 安装方法

### 从 Chrome 网上应用店安装（推荐）

1. 访问 [Chrome 网上应用店](https://chrome.google.com/webstore/category/extensions)（链接待更新）
2. 点击"添加到 Chrome"按钮
3. 确认安装

### 手动安装（开发版）

#### 前置要求

- Node.js 16+ 和 npm
- Chrome 浏览器

#### 安装步骤

1. 克隆仓库到本地：

   ```bash
   git clone https://github.com/yourusername/chrome-plugin-video-manager.git
   cd chrome-plugin-video-manager
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 构建扩展：

   ```bash
   npm run build
   ```

4. 在 Chrome 中加载扩展：
   - 打开 Chrome 浏览器，访问 `chrome://extensions/`
   - 启用右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目根目录

## 🛠️ 开发指南

### 项目结构

```
chrome-plugin-video-manager/
├── src/                      # 源代码目录
│   ├── modules/             # 功能模块
│   │   ├── mediaDetector.js    # 媒体检测
│   │   ├── indicator.js        # 速度指示器
│   │   ├── lightbox.js         # 网页全屏
│   │   ├── playbackController.js # 播放控制
│   │   └── keyboardHandler.js  # 键盘事件处理
│   ├── utils/               # 工具函数
│   │   ├── debounce.js         # 防抖函数
│   │   ├── dom.js              # DOM 操作
│   │   └── storage.js          # 存储管理
│   └── main.js              # 入口文件
├── tests/                   # 测试目录
│   ├── unit/               # 单元测试
│   └── integration/        # 集成测试
├── scripts/                # 构建脚本
│   ├── build.js           # 构建脚本
│   └── clean.js           # 清理脚本
├── _locales/              # 国际化文件
│   ├── en/                # 英文
│   └── zh_CN/             # 简体中文
├── icons/                 # 图标资源
├── manifest.json          # 扩展配置文件
├── content.js             # 内容脚本（原版，保留兼容性）
├── options.html           # 设置页面
├── style.css              # 样式表
├── package.json           # 项目配置
├── .eslintrc.json         # ESLint 配置
└── README.md              # 项目文档
```

### 开发命令

```bash
# 安装依赖
npm install

# 开发模式（自动构建+监听）
npm run dev

# 仅构建
npm run build

# 监听文件变化
npm run watch

# 运行测试
npm test

# 测试监听模式
npm test:watch

# 代码规范检查
npm run lint

# 自动修复代码规范问题
npm run lint:fix

# 清理构建文件
npm run clean
```

### 技术栈

- **语言**：JavaScript (ES6+)
- **模块系统**：ES Modules
- **构建工具**：esbuild
- **测试框架**：Jest
- **代码规范**：ESLint
- **版本控制**：Git
- **包管理**：npm

### 架构设计

#### 模块化架构

项目采用模块化设计，每个功能模块负责特定的职责：

- **MediaDetector**：负责检测和管理页面上的媒体元素
- **SpeedIndicator**：管理速度指示器的显示和隐藏
- **LightboxManager**：处理网页全屏模式
- **PlaybackController**：控制媒体播放（速度、音量、进度）
- **KeyboardHandler**：处理键盘事件和快捷键

#### 工具函数

通用的工具函数被提取到 `utils/` 目录：

- **debounce.js**：防抖函数，优化性能
- **dom.js**：DOM 操作相关函数
- **storage.js**：Chrome Storage API 封装

### 贡献指南

我们欢迎所有形式的贡献！

#### 如何贡献

1. Fork 这个仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request

#### 代码规范

- 遵循 ESLint 配置
- 添加必要的注释和 JSDoc
- 编写单元测试
- 更新相关文档

#### 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat`: 新功能
- `fix`: 问题修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具相关

示例：

```
feat: 添加自定义步进值设置
fix: 修复 YouTube 网站快捷键冲突
docs: 更新 README 安装说明
```

## 🧪 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test debounce.test.js

# 生成测试覆盖率报告
npm test -- --coverage
```

### 测试覆盖率

我们致力于保持高测试覆盖率，目前核心模块的测试覆盖率：

- ✅ 工具函数：>90%
- ✅ 存储管理：>85%
- ✅ 指示器模块：>80%

## 📝 使用说明

### 基本使用

1. 安装扩展后，访问任何包含视频或音频的网页
2. 使用默认快捷键（或您自定义的快捷键）控制媒体播放
3. 调整速度时，屏幕上会短暂显示当前速度

### 视频选择逻辑

当页面上有多个媒体元素时，扩展会按以下优先级选择目标媒体：

1. 网页全屏模式中的视频
2. 最近鼠标悬停或点击的媒体
3. 当前在视口中且尺寸最大的播放中媒体
4. 页面上第一个找到的媒体元素

### 自定义快捷键

1. 点击扩展图标打开设置页面
2. 在表单中设置您喜欢的快捷键
3. 点击"保存"按钮应用更改

### 常见问题解答

**Q: 快捷键在某些网站上不工作？**
A: 一些网站可能会覆盖全局键盘快捷键。尝试使用网页全屏模式（按`f`）后再使用快捷键，或者在设置中更改为不常用的快捷键组合。

**Q: 在网页全屏模式下，点击视频控制条后快捷键无效？**
A: 这是已知问题，我们在最新版本中已修复。如果仍然遇到此问题，请尝试点击视频内容区域而非控制条。

**Q: 为什么不能设置全局快捷键？**
A: 出于安全考虑，Chrome 扩展不允许在未激活的标签页中运行内容脚本。我们只能控制当前活跃标签页中的媒体。

## 🔒 隐私说明

- ✅ 此扩展不收集任何用户数据
- ✅ 不需要网络访问权限
- ✅ 所有设置都存储在本地浏览器中
- ✅ 开源代码，可审计

## 🗺️ 未来计划

- [ ] 添加自定义步进值（控制每次加减速的幅度）
- [ ] 支持更多视频操作（如跳过、循环特定片段）
- [ ] 为常用网站添加特定优化
- [ ] 添加快捷键冲突检测与提示增强
- [ ] 支持更多浏览器（Firefox、Edge 等）
- [ ] 添加播放历史记录功能
- [ ] 支持播放列表管理

## 📋 已知问题

- 在某些使用严格 CSP(内容安全策略)的网站上，样式可能无法正常加载
- 极少数使用非标准视频播放器的网站可能无法被检测到
- 某些 SPA(单页应用)在页面切换时可能需要刷新才能检测到新视频

## 📜 许可证

此项目采用 MIT 许可证 - 详情请查看 [LICENSE](LICENSE) 文件

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者和用户！

## 📧 支持与反馈

如有任何问题或建议，请：

- 在 GitHub 仓库中提交 [Issue](https://github.com/yourusername/chrome-plugin-video-manager/issues)
- 发送邮件至：your-email@example.com

---

**开发者:** [Your Name](https://github.com/yourusername)
**版本:** 2.0.0
**最后更新:** 2024-01-XX

## ⭐ Star History

如果这个项目对您有帮助，请给我们一个 Star ⭐️

---

Made with ❤️ by the community
