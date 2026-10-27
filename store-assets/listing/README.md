# 商店文案粘贴件

**这四个文件是从 `CHROMEWEBSTORE.md` 生成出来的。其中只有两个真的能贴 ——
另外两个是「随包走」的字段，Dashboard 里根本没有输入框。**

| 文件 | 贴到哪 | 能不能贴 |
|---|---|---|
| `description-zh_CN.txt` | 商品详情 → 说明（**简体中文**那一栏） | ✅ 能贴 |
| `description-en.txt` | 商品详情 → 说明（**English** 那一栏） | ✅ 能贴 |
| `short-description-zh_CN.txt` | —— | ⛔ **贴不了**，见下 |
| `short-description-en.txt` | —— | ⛔ **贴不了**，见下 |

## ⚠️ 短描述不是 listing 字段（2026-10-27 在真实 Dashboard 里核实）

Dashboard 的商品详情页把短描述标成 **「软件包中的摘要」**，渲染成一个
**只读段落**（旁边没有输入框）。它的值来自 `manifest.json` 的 `description`
（即 `_locales/*/messages.json` 的 `extensionDescription`）。

⇒ **短描述跟着包走。** 要改它只能：改 `_locales` → 升版本号 → 出新包 → 重新提审。

⚠️ 这一条推翻了一个此前的错误判断：曾以为「线上短描述是 `_locales` 里的旧版、
要贴仓库里 2026-10-20 改写的那 115 字符版」。**线上那份与 `_locales` 一致本来就是对的**，
那不是漂移。而那版 115 字符是**中英拼成一行的单串**（`_locales` 要求每个 locale
各一个值），本身就不能直接进包；6.2.0 出的包用的是另外重写的一版。
（这两个 `.txt` 仍然留着：下次改 `_locales` 时该写什么，以它们为准。）

## 为什么要有这一层

详细描述**只能人工去 Dashboard 粘贴** —— CWS 的 v1.1 与 v2 都只有
upload / publish / fetchStatus / cancelSubmission，**没有 metadata 接口**
（详见 `CHROMEWEBSTORE.md` 的「两条硬约束」）。

而 Dashboard 里中英是**两个独立的输入框**。于是「先把中英拼在一份文档里、
粘贴时再靠手拆开」这一步天然会出错，而**贴错了没有任何东西会拦**：

- 2026-10-23 实读：线上中文那份还写着能控制**音频**（与事实相反），
  英文那份还写着「4 个快捷键」「跨域 iframe 不可控」；
- 2026-10-27：这两份都已换成仓库版本并**提交送审**。

漂的不是「文案写错了」，是「**贴的那一下**没有闸门」。
所以把「拆」变成脚本产出，粘贴件由 `CHROMEWEBSTORE.md` 生成，
`scripts/release-content.test.ts` 盯着两者一致。

## 怎么重新生成

改文案**永远改 `CHROMEWEBSTORE.md`**（唯一来源），然后：

```bash
node scripts/listing-files.mjs          # 重新生成这四个文件
node scripts/listing-files.mjs --check  # 只校验（CI 与提交前用）
```

## 贴的时候

1. 打开 <https://chrome.google.com/webstore/devconsole> → 本扩展 → **商品详情**
2. 先切到**简体中文**，贴 `description-zh_CN.txt`
3. 再切到 **English**，贴 `description-en.txt`
4. 顺带核：**类别**（应为「功能与界面」）、**首页网址**、**支持信息页面网址**
5. **保存草稿** → **提请审核**
6. 审核通过后**逐个 locale 重读商店页**核实，把结果记进
   `CHROMEWEBSTORE.md` 的「商店页当前线上简介实读」那一节

⚠️ 贴的时候**只贴文件里的内容**。源文档里每一栏后面那些 `<!-- … -->` 的说明
是给维护者看的，**不能贴出去**。本目录的 `.txt` 已经把它们剔干净了。

⚠️ 条目**一进审核就整体只读**：文案与素材要在**同一次提交前**补齐，
否则得等这轮审核结束才能再改。
