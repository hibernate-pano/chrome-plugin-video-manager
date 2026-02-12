#!/bin/bash

# GitHub Actions 状态检查脚本
# 用于检查最近的 CI 运行状态

set -e

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

# 检查是否安装了 gh CLI
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) 未安装"
    print_info "请访问 https://cli.github.com/ 安装"
    exit 1
fi

# 检查是否已登录
if ! gh auth status &> /dev/null; then
    print_error "未登录 GitHub CLI"
    print_info "请运行: gh auth login"
    exit 1
fi

print_header "🔍 检查 GitHub Actions 状态"

# 获取仓库信息
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
if [ -z "$REPO" ]; then
    print_error "无法获取仓库信息"
    print_info "请确保在 Git 仓库目录中运行此脚本"
    exit 1
fi

print_info "仓库: $REPO"
echo ""

# 获取最近的工作流运行
print_header "📊 最近的工作流运行"

# CI 工作流
print_info "CI 工作流:"
gh run list --workflow=ci.yml --limit=5 --json conclusion,status,createdAt,headBranch,displayTitle | \
    jq -r '.[] | "  \(.displayTitle) (\(.headBranch)) - \(.status) - \(.conclusion // "running")"'

echo ""

# Coverage 工作流
print_info "Coverage 工作流:"
gh run list --workflow=coverage.yml --limit=5 --json conclusion,status,createdAt,headBranch,displayTitle | \
    jq -r '.[] | "  \(.displayTitle) (\(.headBranch)) - \(.status) - \(.conclusion // "running")"'

echo ""

# Release 工作流
print_info "Release 工作流:"
gh run list --workflow=release.yml --limit=5 --json conclusion,status,createdAt,headBranch,displayTitle | \
    jq -r '.[] | "  \(.displayTitle) (\(.headBranch)) - \(.status) - \(.conclusion // "running")"'

echo ""

# 检查最近的失败
print_header "❌ 最近的失败"
FAILED_RUNS=$(gh run list --status=failure --limit=5 --json conclusion,status,createdAt,headBranch,displayTitle,workflowName)

if [ "$(echo "$FAILED_RUNS" | jq '. | length')" -eq 0 ]; then
    print_success "没有最近的失败"
else
    echo "$FAILED_RUNS" | jq -r '.[] | "  \(.workflowName): \(.displayTitle) (\(.headBranch))"'
fi

echo ""

# 检查正在运行的工作流
print_header "🏃 正在运行的工作流"
RUNNING=$(gh run list --status=in_progress --limit=10 --json conclusion,status,createdAt,headBranch,displayTitle,workflowName)

if [ "$(echo "$RUNNING" | jq '. | length')" -eq 0 ]; then
    print_info "没有正在运行的工作流"
else
    echo "$RUNNING" | jq -r '.[] | "  \(.workflowName): \(.displayTitle) (\(.headBranch))"'
fi

echo ""

# 统计信息
print_header "📈 统计信息"

# 最近 30 天的成功率
TOTAL=$(gh run list --created="$(date -v-30d +%Y-%m-%d)" --json conclusion | jq '. | length')
SUCCESS=$(gh run list --created="$(date -v-30d +%Y-%m-%d)" --json conclusion | jq '[.[] | select(.conclusion == "success")] | length')

if [ "$TOTAL" -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=2; $SUCCESS * 100 / $TOTAL" | bc)
    print_info "最近 30 天成功率: ${SUCCESS_RATE}% ($SUCCESS/$TOTAL)"
else
    print_info "最近 30 天没有工作流运行"
fi

echo ""

# 快捷链接
print_header "🔗 快捷链接"
echo "  GitHub Actions: https://github.com/$REPO/actions"
echo "  CI 工作流: https://github.com/$REPO/actions/workflows/ci.yml"
echo "  Coverage 工作流: https://github.com/$REPO/actions/workflows/coverage.yml"
echo "  Release 工作流: https://github.com/$REPO/actions/workflows/release.yml"
echo ""

# 提示
print_info "提示:"
echo "  - 查看特定工作流: gh run list --workflow=ci.yml"
echo "  - 查看运行详情: gh run view <run-id>"
echo "  - 重新运行失败的工作流: gh run rerun <run-id>"
echo "  - 查看日志: gh run view <run-id> --log"
echo ""
