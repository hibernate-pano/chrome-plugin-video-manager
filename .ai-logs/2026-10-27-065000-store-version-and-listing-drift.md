# 2026-10-27 商店版本一致性核对 + 商店文案漂移的补齐（Video Speed Controller 6.2.0）

## 一、对话出发点

Jasper 的一句话（同一个问题，三件事）：

> 「现在云端的 Chrome 商店版本和当前版本是一致的吗？有没有需要更新的内容？如需，请进行提审。」

拆开是三个动作：**核对** → **找出待更新的** → **提审**。

⚠️ 这条问法里藏着两个可能的前提假设，值得先验：
① 「云端版本」与「当前版本」可能不一致；
② 「有需要更新的内容」⇒ 那就该**提审**。

第 ② 个假设**不成立** —— 本轮的核心结论就是它。
「需要更新」与「需要提审」是**两件事**：这次要更新的是商店**文案**，
而文案**没有 API 接口**（v1.1 与 v2 都只有 upload / publish / fetchStatus /
cancelSubmission），**提审解决不了它**。

## 二、核对版本：一致，而且是**逐字节**一致

判据不能只看一处 —— 「版本号对得上」不等于「产物是新的」
（skill 里专门写了这个坑：忘了重新 build，版本号照样对得上）。

| 判据 | 实读结果 | 能不能单独定案 |
|---|---|---|
| 商店公开页 | `Version 6.2.0` · `Updated October 23, 2026` · `87.83KiB` | 能定「线上是几」，定不了「待审有没有东西」 |
| v2 API `fetchStatus` | `publishedItemRevisionStatus = { state: PUBLISHED, deployPercentage: 100, crxVersion: 6.2.0 }`；**没有** `submittedItemRevisionStatus` | 能定「发布窗口干净」（无待审版本） |
| 仓库 | `manifest.json` / `package.json` 都是 `6.2.0` | 只能定「我要发什么」 |
| **产物比对** | 重新 `pnpm build` 出来的 14 个文件，与 `release/video-speed-controller-v6.2.0.zip` **逐字节一致** | **决定性的** |

⚠️ 第四行是本轮唯一能回答「有没有待发内容」的判据。
其余三行都只能说明「版本号一致」。

产物一致 ⇒ **6.2.0 之后仓库里没有任何产品代码变更**。
（`git diff 308d2a8..HEAD -- src/` 里那几处改动，是 `c474c6d` 给常量加
`export` 供测试引用，外加注释订正 —— 打包后字节相同。）

## 三、结论一：**不需要提审**，而且**提不了**

- **不需要**：没有新的包可发。
- **提不了**：`scripts/store-publish.mjs` 的版本号闸门要求包版本
  **严格高于**线上版本，同为 6.2.0 会被直接拒掉。
  要硬发只能造一个 6.2.1 的**空版本** —— 白白消耗一次审核周期，
  版本号还会失真（而版本号是要在商店页上给用户看的）。

发布闸门本身是好的：`npx vitest run scripts/` **5 文件 / 83 条全绿**，
全量单测 **45 文件 / 1100 条全绿**。

## 四、结论二：真正要更新的是**商店文案**，而且**有三个字段 API 改不了**

逐个 locale 实读（`?hl=zh_CN` 与 `?hl=en` 两个页面都抓了 ——
上一轮的教训是「只读英文那一份」会漏掉漂得更远的中文那份）：

| 字段 | 线上实读 | 仓库里该是多少 | API 能改吗 |
|---|---|---|---|
| Detailed Description（中） | 「Video & Audio Speed Controller 是一款…任何视频和**音频**的播放速度」「适用于所有HTML5视频和音频元素」「自定义播放速度范围」，全文没提网页全屏 | `store-assets/listing/description-zh_CN.txt` | ❌ |
| Detailed Description（英） | `Customize four shortcuts`（实为 7 个动作）、`Hot-reload updated shortcuts`、`Cross-origin iframe videos may not be directly controllable`（6.1.0 起完全支持） | `store-assets/listing/description-en.txt` | ❌ |
| **Short Description（中/英）** | `_locales` 里的那一版（zh 32 / en 107 字符） | 2026-10-20 改写的 115 字符版，**从未贴过** | ❌ |
| **Category** | `Tools` | `Functionality & UI` | ❌ |

⚠️ **顺带查出仓库里一条错的结论**：`CHROMEWEBSTORE.md` 的
「商店页要改的完整清单」里原本写着「Short Description 中英都已是当前版本，
**不需要改**」。那句把两件不同的东西当成了一件 ——
线上那份**确实**与 `messages.json` 一致，但仓库那一栏是另一份（115 字符版），
而**那一版从未贴过**。已订正。

## 五、做了什么（把「贴的那一下」变成有闸门的一步）

漂的不是「文案写错了」，是「**贴的那一下**没有闸门」：
Dashboard 里中英是**两个独立输入框**，而仓库里那一份是中英拼在一起的
—— 靠手拆，拆错没人拦。

- 新增 `scripts/listing-files.mjs` —— 把 `CHROMEWEBSTORE.md` 拆成
  **四个按 locale 分好的粘贴件**（`store-assets/listing/*.txt`）。
  唯一来源仍是 `CHROMEWEBSTORE.md`；粘贴件由它生成。
- 新增守卫（`scripts/release-content.test.ts` 的「商店文案：粘贴件不许跑偏」）：
  ① 粘贴件与来源逐字一致；② 短描述中英**各自** ≤132
  （只核拼接后的长度会漏掉「英文那半超了」）；③ 详细描述中英**逐段对齐**
  （段落数 + 标题位置 —— `INCONSISTENT_LOCALE_METADATA` 的直接成因）；
  ④ 粘贴件里没有 markdown 星号。
  **变异验证过**：改粘贴件一个字 → 红；中英段落数对不上 → 红；复原 → 绿。
- `CHROMEWEBSTORE.md` 补了「2026-10-27 复核」一节（版本四判据 + 文案对照表 +
  两条错误的订正）；`PRODUCT.md` 的商店页实读换成带日期的快照
  （⚠️ 用户数在动：10-23 是 23，10-27 是 21）。

## 六、留给 Jasper 的（API 改不了，只能人工）

见 `store-assets/listing/README.md`：四个粘贴件各自贴进对应的一栏，
Save → **Publish** 提交审核（**只改文案不需要出新包**，版本号仍是 6.2.0），
过审后回商店页**逐个 locale 读一遍**核实，再把结果记回
`CHROMEWEBSTORE.md`。

⚠️ 商店条目**一进审核就整体只读** —— 素材（截图/宣传图）与文案要在
**同一次提交前**补齐，否则就得等这一轮审核结束才能再改。
截图是 2026-10-22 那一轮重拍的，与当前 UI 一致（`src/options` 在那之后没动过），
所以这一次不需要重拍。

## 七、这次没做的事（以及为什么）

- **没有上传任何东西到商店** —— 没有新的包；而且版本号闸门也会挡。
- **没有替 Jasper 点 Dashboard 的 Publish** —— 那是他账号上的对外发布动作，
  本轮只把「贴什么、贴到哪、怎么贴」准备到位。
- **没有重发/补发 6.0.9 / 6.1.0** —— 它们从未单独发布过，
  内容已随 6.2.0 一起上线（见 CHANGELOG 头部）。
