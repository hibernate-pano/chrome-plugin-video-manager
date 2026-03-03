# Popup 架构说明

## 概述

本项目现在有两个独立的用户界面入口：

1. **Popup（弹窗）** - 点击扩展图标时显示的快速访问界面
2. **Options（设置页面）** - 完整的设置和配置界面

## 架构设计

### Popup（popup/）

**用途：** 快速访问核心功能的轻量级界面

**特点：**
- 固定尺寸：360px 宽 × 400px+ 高
- 快速加载，响应迅速
- 提供最常用的功能

**功能：**
- 速度预设快速切换（0.5x, 1x, 1.5x, 2x 等）
- 常用快捷键提示
- 打开完整设置页面的入口

**文件结构：**
```
popup/
├── PopupApp.tsx          # 主组件
├── main.tsx              # 入口文件
└── styles/
    └── index.css         # 样式文件
popup.html                # HTML 入口
```

### Options（options/）

**用途：** 完整的设置和配置界面

**特点：**
- 完整的标签页界面
- 包含所有高级配置选项
- 支持导入/导出设置

**功能：**
- 快捷键自定义
- 速度预设管理
- 动画设置
- HUD 配置
- 帮助文档

**文件结构：**
```
options/
├── OptionsApp.tsx        # 主应用组件
├── main.tsx              # 入口文件
├── components/           # 组件目录
│   ├── Header.tsx
│   ├── ShortcutsTab.tsx
│   ├── PresetsTab.tsx
│   ├── AnimationTab.tsx
│   └── HelpTab.tsx
└── styles/
    └── index.css         # 样式文件
options.html              # HTML 入口
```

## Manifest 配置

```json
{
  "action": {
    "default_popup": "popup.html"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  }
}
```

## 共享资源

两个界面共享以下资源：

- **stores/** - Zustand 状态管理（settingsStore, hudStore 等）
- **components/** - 可复用的 UI 组件
- **utils/** - 工具函数
- **types/** - TypeScript 类型定义
- **modules/** - 核心业务逻辑

## 用户访问方式

1. **Popup：** 点击浏览器工具栏的扩展图标
2. **Options：**
   - 右键扩展图标 → 选项
   - 在 Popup 中点击"打开完整设置"按钮
   - chrome://extensions 页面中点击"详细信息" → "扩展程序选项"

## 开发指南

### 添加新功能到 Popup

1. 在 `popup/PopupApp.tsx` 中添加 UI 组件
2. 使用 `useSettingsStore` 访问和修改设置
3. 保持界面简洁，避免复杂交互

### 添加新功能到 Options

1. 在 `options/components/` 中创建新的标签页组件
2. 在 `OptionsApp.tsx` 中注册新标签
3. 可以使用复杂的表单和交互

### 构建和测试

```bash
# 开发模式
pnpm dev

# 生产构建
pnpm build

# 加载扩展
1. 打开 chrome://extensions
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 dist 目录
```

## 最佳实践

1. **保持 Popup 轻量：** 只包含最常用的功能
2. **复杂配置放 Options：** 高级设置和详细配置放在 Options 页面
3. **共享状态：** 使用 Zustand store 在两个界面间共享状态
4. **一致的设计：** 使用相同的 Tailwind 样式和组件库
5. **响应式设计：** Options 页面应该适配不同屏幕尺寸

## 故障排查

### Popup 不显示
- 检查 `manifest.json` 中的 `action.default_popup` 配置
- 确认 `popup.html` 在 dist 目录中正确生成
- 查看浏览器控制台的错误信息

### Options 页面打不开
- 检查 `manifest.json` 中的 `options_ui` 配置
- 确认 `options.html` 在 dist 目录中正确生成
- 尝试右键扩展图标 → 选项

### 状态不同步
- 确认使用的是同一个 store 实例
- 检查 Chrome Storage 权限是否正确配置
- 查看 Zustand DevTools（开发模式）

## 更新日志

### 2024-02-17
- 重构 Popup 架构，将 Popup 和 Options 分离
- 创建独立的 popup/ 目录和组件
- 更新 manifest.json 配置
- 添加架构文档
