/**
 * 构建脚本 - 将ES模块打包成浏览器兼容格式
 */

import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

const isWatch = process.argv.includes("--watch");

// 构建配置
const buildOptions = {
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/content.js",
  format: "iife",
  target: "chrome90",
  platform: "browser",
  sourcemap: isWatch ? "inline" : false,
  minify: !isWatch,
  logLevel: "info",
  banner: {
    js:
      "// Video & Audio Speed Controller - Bundled Content Script\n// Built: " +
      new Date().toISOString() +
      "\n",
  },
};

async function build() {
  try {
    console.log("🔨 开始构建...");

    if (isWatch) {
      console.log("👀 监听文件变化...");
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log("✅ 构建完成，正在监听文件变化...");
    } else {
      await esbuild.build(buildOptions);
      console.log("✅ 构建完成！");

      // 输出文件大小
      const stats = fs.statSync("dist/content.js");
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`📦 文件大小: ${sizeKB} KB`);
    }
  } catch (error) {
    console.error("❌ 构建失败:", error);
    process.exit(1);
  }
}

// 执行构建
build();
