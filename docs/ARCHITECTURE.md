# 架构文档

本文档描述当前代码库的真实结构。

## 目标

当前实现只聚焦四条主路径：

- 目标视频选择
- 播放速度控制
- 网页全屏
- 设置持久化

## 模块总览

```text
Content Script
  └── ContentRuntime
      ├── VideoRegistry
      ├── KeyboardController
      ├── FullscreenController
      └── SpeedHud

Options Page
  └── shortcut form + validation

Shared
  ├── shortcuts
  ├── settings
  └── types
```

## 内容脚本

### `ContentRuntime`

文件：`src/content/runtime.ts`

职责：

- 安装运行时样式
- 加载设置，失败时回退默认快捷键
- 启动视频注册表和键盘控制器
- 订阅设置变化并热更新快捷键

### `VideoRegistry`

文件：`src/content/videoRegistry.ts`

职责：

- 扫描普通 DOM、开放 Shadow DOM、同源 iframe 中的 `video`
- 记录最近交互的视频
- 根据“最近交互 / 正在播放 / 可见性 / 尺寸”打分选主

### `KeyboardController`

文件：`src/content/keyboardController.ts`

职责：

- 拦截扩展快捷键
- 忽略输入框、文本域、可编辑区域
- 在网页全屏模式下接管 `Escape`、`ArrowLeft`、`ArrowRight`、`Space`
- 处理速度长按重复

### `FullscreenController`

文件：`src/content/fullscreenController.ts`

职责：

- 管理网页全屏 overlay 生命周期
- 优先尝试 reparent 原始 `video`
- 检测 reparent 失败后退回 CSS cover
- 恢复原父节点、内联样式、controls 和 body overflow

### `SpeedHud`

文件：`src/content/speedHud.ts`

职责：

- 展示速度变化反馈
- 跟随当前视频定位

## 设置与共享逻辑

### `shortcuts`

文件：`src/shared/shortcuts.ts`

职责：

- 规范化快捷键字符串
- 将 `KeyboardEvent` 转成快捷键定义
- 做匹配和浏览器保留快捷键检测

### `settings`

文件：`src/shared/settings.ts`

职责：

- 从 `chrome.storage.sync` 读取 / 写入设置
- 兼容旧版快捷键字段
- 在 storage API 失败时抛出明确错误
- 订阅设置变化

## 站点适配

文件：`src/content/siteAdapters.ts`

当前只保留三类适配：

- `generic`
- `youtube`
- `bilibili`

适配器只负责：

- 指定优先选择器
- 声明是否适合尝试 reparent

## 非目标

这些能力当前不在实现范围内：

- `audio` 控制
- 音量 / 静音 / 书签 / 历史 / 云同步
- React UI、Zustand 状态层
- 多站点深度 UI 定制
