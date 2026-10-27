# 商店文案粘贴件

**这四个文件是从 `CHROMEWEBSTORE.md` 生成出来的粘贴件 —— 贴进 Chrome Web Store
Developer Dashboard 时，每个文件整体复制到一栏里，一个字都不要改。**

| 文件 | 贴到 Dashboard 的哪一栏 |
|---|---|
| `short-description-zh_CN.txt` | Store listing → 短描述，**简体中文**那一栏 |
| `short-description-en.txt` | Store listing → 短描述，**English** 那一栏 |
| `description-zh_CN.txt` | Store listing → 详细描述，**简体中文**那一栏 |
| `description-en.txt` | Store listing → 详细描述，**English** 那一栏 |

## 为什么要有这一层

商店文案**只能人工去 Dashboard 粘贴** —— CWS 的 v1.1 与 v2 都只有
upload / publish / fetchStatus / cancelSubmission，**没有 metadata 接口**
（详见 `CHROMEWEBSTORE.md` 的「两条硬约束」）。

而 Dashboard 里中英是**两个独立的输入框**。于是「先把中英拼在一份文档里、
粘贴时再靠手拆开」这一步天然会出错，而**贴错了没有任何东西会拦**：

- 2026-10-23 实读：线上中文那份还写着能控制**音频**（与事实相反），
  英文那份还写着「4 个快捷键」「跨域 iframe 不可控」；
- 2026-10-27 实读：连**短描述**都还是 `_locales` 里的旧版 ——
  仓库里 2026-10-20 改写过的 115 字符新版**从未贴过**。

漂的不是「文案写错了」，是「**贴的那一下**没有闸门」。
所以把「拆」变成脚本产出，粘贴件由 `CHROMEWEBSTORE.md` 生成，
`scripts/release-content.test.ts` 盯着两者一致。

## 怎么重新生成

改文案**永远改 `CHROMEWEBSTORE.md`**（唯一来源），然后：

```bash
node scripts/listing-files.mjs          # 重新生成这四个文件
node scripts/listing-files.mjs --check  # 只校验（CI 与提交前用）
```

`scripts/release-content.test.ts` 里那一组「商店文案：粘贴件不许跑偏」
会在粘贴件与来源不一致时变红 —— 提示你重新生成。

## 贴的时候

1. 打开 <https://chrome.google.com/webstore/devconsole> → 本扩展 → **Store listing**
2. 先切到**简体中文**，贴 `short-description-zh_CN.txt` 与 `description-zh_CN.txt`
3. 再切到 **English**，贴 `short-description-en.txt` 与 `description-en.txt`
4. **Save**
5. 点 **Publish** 提交审核（**只改文案不需要出新包**，版本号仍是 6.2.0）
6. 审核通过后**回商店页逐段核一遍**（逐个 locale 读），把结果记进
   `CHROMEWEBSTORE.md` 的「商店页当前线上简介实读」那一节

⚠️ 贴的时候**只贴文件里的内容**。源文档里每一栏后面那些 `<!-- … -->` 的说明
（「为什么这么写」「历史上踩过什么坑」）是给维护者看的，**不能贴出去**。
本目录这四个文件已经把它们剔干净了。

⚠️ 详情页里「分类」那一栏当前是 `Tools`，要改成 `Functionality & UI`
（竞品榜首在那个分类；商店排序吃分类与评分）。
「Single Purpose」「Support URL」「Homepage URL」也一并核一遍 ——
那几个在 `CHROMEWEBSTORE.md` 的 Store Listing 一节里。
