/**
 * 清理构建输出文件
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filesToClean = ["content-bundled.js", "content-bundled.js.map"];

console.log("🧹 清理构建文件...");

filesToClean.forEach((file) => {
  const filePath = path.join(path.dirname(__dirname), file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`   删除: ${file}`);
  }
});

console.log("✅ 清理完成！");
