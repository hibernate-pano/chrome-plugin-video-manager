#!/bin/bash

# CI/CD 本地验证脚本
# 在推送到 GitHub 之前运行此脚本以确保所有检查通过

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    print_error "请在 src-react 目录中运行此脚本"
    exit 1
fi

print_header "🚀 开始 CI/CD 本地验证"

# 1. 检查依赖
print_header "1️⃣  检查依赖"
if [ ! -d "node_modules" ]; then
    print_warning "node_modules 不存在，正在安装依赖..."
    pnpm install --frozen-lockfile
    print_success "依赖安装完成"
else
    print_success "依赖已安装"
fi

# 2. ESLint 检查
print_header "2️⃣  运行 ESLint"
if pnpm lint; then
    print_success "ESLint 检查通过"
else
    print_error "ESLint 检查失败"
    print_info "运行 'pnpm lint:fix' 尝试自动修复"
    exit 1
fi

# 3. TypeScript 类型检查
print_header "3️⃣  运行 TypeScript 类型检查"
if pnpm type-check; then
    print_success "TypeScript 类型检查通过"
else
    print_error "TypeScript 类型检查失败"
    exit 1
fi

# 4. Vitest 测试
print_header "4️⃣  运行 Vitest 测试"
if pnpm test; then
    print_success "Vitest 测试通过"
else
    print_error "Vitest 测试失败"
    exit 1
fi

# 5. Jest 测试
print_header "5️⃣  运行 Jest 测试"
if pnpm test:jest; then
    print_success "Jest 测试通过"
else
    print_error "Jest 测试失败"
    exit 1
fi

# 6. 构建
print_header "6️⃣  运行构建"
if pnpm build; then
    print_success "构建成功"
else
    print_error "构建失败"
    exit 1
fi

# 7. 检查构建产物大小
print_header "7️⃣  检查构建产物大小"
if [ -d "dist" ]; then
    # 计算 dist 目录大小
    DIST_SIZE=$(du -sh dist | cut -f1)
    print_info "构建产物大小: $DIST_SIZE"

    # 检查内容脚本大小
    if [ -f "dist/content/main.js" ]; then
        CONTENT_SIZE=$(du -h dist/content/main.js | cut -f1)
        print_info "内容脚本大小: $CONTENT_SIZE"

        # 警告如果超过 200KB
        CONTENT_SIZE_KB=$(du -k dist/content/main.js | cut -f1)
        if [ $CONTENT_SIZE_KB -gt 200 ]; then
            print_warning "内容脚本大小超过 200KB，建议优化"
        else
            print_success "内容脚本大小符合目标 (≤200KB)"
        fi
    fi
else
    print_warning "dist 目录不存在"
fi

# 8. 生成覆盖率报告（可选）
print_header "8️⃣  生成覆盖率报告（可选）"
read -p "是否生成覆盖率报告？(y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "生成 Vitest 覆盖率..."
    pnpm test:coverage

    print_info "生成 Jest 覆盖率..."
    pnpm test:jest:coverage

    print_success "覆盖率报告已生成"
    print_info "Vitest 覆盖率: coverage/index.html"
    print_info "Jest 覆盖率: coverage-jest/index.html"
else
    print_info "跳过覆盖率报告生成"
fi

# 9. 检查 Git 状态
print_header "9️⃣  检查 Git 状态"
if git diff --quiet && git diff --cached --quiet; then
    print_info "没有未提交的更改"
else
    print_warning "有未提交的更改"
    git status --short
fi

# 10. 总结
print_header "✨ 验证完成"
echo ""
print_success "所有检查都通过了！"
echo ""
print_info "下一步："
echo "  1. 提交更改: git add . && git commit -m 'your message'"
echo "  2. 推送到 GitHub: git push origin main"
echo "  3. 查看 GitHub Actions: https://github.com/YOUR_USERNAME/YOUR_REPO/actions"
echo ""
print_info "可选步骤："
echo "  - 运行 E2E 测试: pnpm test:e2e"
echo "  - 分析包大小: pnpm build:analyze"
echo "  - 性能基准测试: pnpm build:perf"
echo ""
print_success "准备好推送到 GitHub 了！🚀"
echo ""
