#!/bin/bash

# 手动功能验证启动脚本
# 此脚本帮助你快速开始手动功能验证流程

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    print_error "请在项目根目录运行此脚本"
    exit 1
fi

print_header "Video Speed Manager - 手动功能验证"

print_info "本脚本将帮助你完成以下步骤："
echo "  1. 验证构建产物"
echo "  2. 提供加载扩展的指导"
echo "  3. 打开测试指南文档"
echo ""

# 步骤 1: 检查构建产物
print_header "步骤 1: 检查构建产物"

if [ ! -d "src-react/dist" ]; then
    print_warning "dist 目录不存在，需要先构建"
    print_info "正在构建..."

    cd src-react
    pnpm run build
    cd ..

    print_success "构建完成"
else
    print_success "dist 目录已存在"
fi

# 运行验证脚本
print_info "正在验证构建产物..."
node scripts/verify-build-artifacts.mjs

if [ $? -eq 0 ]; then
    print_success "构建产物验证通过"
else
    print_error "构建产物验证失败，请检查错误信息"
    exit 1
fi

# 步骤 2: 提供加载扩展的指导
print_header "步骤 2: 在 Chrome 中加载扩展"

print_info "请按照以下步骤在 Chrome 中加载扩展："
echo ""
echo "  1. 打开 Chrome 浏览器"
echo "  2. 访问: chrome://extensions/"
echo "  3. 启用右上角的"开发者模式"开关"
echo "  4. 点击"加载已解压的扩展程序""
echo "  5. 选择目录: $(pwd)/src-react/dist"
echo ""

print_info "详细步骤请参考: scripts/load-extension-guide.md"
echo ""

read -p "按 Enter 键继续，当你已经在 Chrome 中加载了扩展..."

# 步骤 3: 打开测试指南
print_header "步骤 3: 开始手动测试"

print_info "测试指南文档："
echo ""
echo "  📋 主测试清单:"
echo "     scripts/manual-test-checklist.md"
echo ""
echo "  🎬 视频检测和控制测试:"
echo "     scripts/video-detection-test-guide.md"
echo ""
echo "  ⌨️  快捷键功能测试:"
echo "     scripts/keyboard-shortcuts-test-guide.md"
echo ""
echo "  ⚙️  设置页面功能测试:"
echo "     scripts/settings-page-test-guide.md"
echo ""

print_info "推荐测试顺序："
echo "  1. 视频检测和控制测试 (核心功能)"
echo "  2. 快捷键功能测试"
echo "  3. 设置页面功能测试"
echo ""

# 询问是否打开测试指南
read -p "是否在默认编辑器中打开主测试清单？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v code &> /dev/null; then
        print_info "使用 VS Code 打开测试清单..."
        code scripts/manual-test-checklist.md
    elif command -v open &> /dev/null; then
        print_info "使用默认应用打开测试清单..."
        open scripts/manual-test-checklist.md
    else
        print_warning "无法自动打开文件，请手动打开: scripts/manual-test-checklist.md"
    fi
fi

# 快速测试选项
echo ""
read -p "是否需要快速测试指南？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_header "快速测试指南"

    print_info "如果时间有限，请执行以下快速测试："
    echo ""
    echo "  1. ✅ 访问 YouTube: https://www.youtube.com"
    echo "  2. ✅ 播放任意视频"
    echo "  3. ✅ 按 = 键加速（应该看到 HUD 显示 1.25x）"
    echo "  4. ✅ 按 - 键减速（应该看到 HUD 显示 1.0x）"
    echo "  5. ✅ 按 0 键重置（应该看到 HUD 显示 1.0x）"
    echo "  6. ✅ 打开设置页面（点击扩展图标）"
    echo "  7. ✅ 修改一个快捷键并保存"
    echo "  8. ✅ 返回视频页面，测试新快捷键"
    echo ""
    print_info "如果以上 8 项都通过，说明核心功能正常"
fi

# 测试网站推荐
print_header "推荐测试网站"

print_info "以下是推荐的测试网站："
echo ""
echo "  🎥 YouTube:"
echo "     https://www.youtube.com/watch?v=dQw4w9WgXcQ"
echo ""
echo "  🎥 Bilibili:"
echo "     https://www.bilibili.com/video/BV1xx411c7mD"
echo ""
echo "  🎥 Vimeo:"
echo "     https://vimeo.com"
echo ""

# 调试技巧
print_header "调试技巧"

print_info "如果遇到问题，可以尝试："
echo ""
echo "  1. 打开浏览器开发者工具 (F12)"
echo "  2. 查看 Console 标签的错误信息"
echo "  3. 在扩展管理页面点击"检查视图"查看 Service Worker 日志"
echo "  4. 刷新视频页面 (F5)"
echo "  5. 重新加载扩展（在扩展管理页面点击刷新图标）"
echo ""

# 完成
print_header "准备就绪"

print_success "所有准备工作已完成！"
echo ""
print_info "现在你可以开始手动测试了。祝测试顺利！"
echo ""
print_info "测试完成后，请填写测试报告并记录所有发现的问题。"
echo ""

# 提供有用的命令
print_info "有用的命令："
echo ""
echo "  # 重新构建扩展"
echo "  cd src-react && pnpm run build"
echo ""
echo "  # 验证构建产物"
echo "  node scripts/verify-build-artifacts.mjs"
echo ""
echo "  # 查看测试指南"
echo "  cat scripts/README.md"
echo ""

print_info "更多信息请参考: scripts/README.md"
echo ""
