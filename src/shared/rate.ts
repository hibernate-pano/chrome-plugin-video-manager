/**
 * 倍速的格式化。
 *
 * 单独成模块的原因：这个函数有**两个**消费方在不同的 world 里 ——
 * 内容脚本要拿它渲染胶囊与控制条，background 要拿它拼工具栏图标的
 * tooltip。放在 speedToast.ts 里会让 background 为了一个纯函数把
 * 整个内容脚本模块（连带 liveRegion、frameOffset）打进它的 bundle。
 */
export const formatRate = (value: number) =>
  value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
