export default {
  plugins: {
    // Tailwind CSS 处理
    tailwindcss: {},
    // Autoprefixer 自动添加浏览器前缀
    autoprefixer: {},
    // 生产环境下使用 cssnano 压缩 CSS
    ...(process.env.NODE_ENV === 'production'
      ? {
          cssnano: {
            preset: [
              'default',
              {
                // 优化配置
                discardComments: {
                  removeAll: true, // 移除所有注释
                },
                normalizeWhitespace: true, // 规范化空白
                colormin: true, // 压缩颜色值
                minifyFontValues: true, // 压缩字体值
                minifySelectors: true, // 压缩选择器
                reduceIdents: false, // 不压缩标识符（避免破坏动画名称）
              },
            ],
          },
        }
      : {}),
  },
};
