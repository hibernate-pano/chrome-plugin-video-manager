# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

- 构建项目: `npm run build`
- 运行开发服务器: `npm run dev`
- 运行测试: `npm test`
- 运行单个测试: `npm test -- <测试文件路径>`

## 代码架构

- 项目是一个 Chrome 插件，主要功能是视频管理。
- `content.js` 负责与页面交互，实现视频控制功能。
- `options.js` 和 `options.html` 提供用户设置界面。
- `manifest.json` 定义了插件的基本配置和权限。
- 快捷键功能通过 `content.js` 实现，用户可以在 `options.html` 中自定义快捷键。