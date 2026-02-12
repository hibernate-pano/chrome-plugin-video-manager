#!/bin/bash

set -e  # 遇到错误立即退出

echo "🚀 开始打包发布..."

# 创建发布目录
mkdir -p releases
rm -rf releases/*  # 清理旧的发布包

# ============================================
# 打包旧版本 v1.3.4
# ============================================
echo ""
echo "📦 [1/2] 打包旧版本 v1.3.4..."

# 构建旧版本
npm run build

# 创建临时目录
mkdir -p releases/temp-v1
cp manifest.json releases/temp-v1/
cp background.js releases/temp-v1/
cp style.css releases/temp-v1/
cp -r dist releases/temp-v1/
cp -r icons releases/temp-v1/
cp -r _locales releases/temp-v1/

# 打包
cd releases/temp-v1
zip -r ../vsc-v1.3.4-stable.zip .
cd ../..
rm -rf releases/temp-v1

echo "✅ 旧版本打包完成：releases/vsc-v1.3.4-stable.zip"

# ============================================
# 打包新版本 v2.0.0-rc1
# ============================================
echo ""
echo "📦 [2/2] 打包新版本 v2.0.0-rc1..."

# 构建新版本
cd src-react
pnpm build

# 打包
cd dist
zip -r ../../releases/vsc-v2.0.0-rc1.zip .
cd ../..

echo "✅ 新版本打包完成：releases/vsc-v2.0.0-rc1.zip"

# ============================================
# 显示结果
# ============================================
echo ""
echo "🎉 打包完成！"
echo ""
echo "📁 发布包："
ls -lh releases/*.zip
echo ""
echo "📊 包大小对比："
du -h releases/vsc-v1.3.4-stable.zip
du -h releases/vsc-v2.0.0-rc1.zip
