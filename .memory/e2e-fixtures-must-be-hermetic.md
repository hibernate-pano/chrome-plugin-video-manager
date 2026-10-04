---
name: e2e-fixtures-must-be-hermetic
description: E2E fixture 引用第三方 CDN 会造成「本地过、CI 挂」；假失败与假通过都会误导
type: gotcha
---

# E2E fixture 不能依赖第三方网络资源

`tests/e2e/test-page.html` 里的 `<video>` **故意没有 `<source>`**。不要加回去。

**Why**：`fullscreen-regression.spec.js` 把 `duration` 伪造成 120 秒，并断言
`currentTime` 精确往返（30→35→30）。这**只有在媒体未加载时才成立**——真实媒体一旦
加载成功，浏览器会把 `currentTime` 钳到真实可寻址范围（原 fixture 指向的
`mov_bbb.mp4` 只有 10 秒），断言必挂。

原 fixture 指向 `w3schools.com`，而该 CDN **对本机返回 403、对 CI runner 放行**，
于是这套用例长期是「本地过、CI 挂」：本地过不是因为逻辑对，而是因为媒体恰好
没加载成功。直到它被接进 CI 才暴露。

**How to apply**：
- fixture 里不要出现任何外部 URL。需要真实媒体就单独建 fixture，并把「媒体是否加载」
  作为该 fixture 的显式前提。
- 不要在 spec 里用「按 hostname 白名单 abort 外部请求」来兜底：那只是把网络策略
  换个地方表达，fixture 一旦指向本地媒体就会失效。去掉外部引用才是结构上的保证。
- 判断一个 E2E 是否可靠，不要只看本地绿：问「它依赖的环境前提是什么，CI 上还成立吗」。
- 本地复现 CI 失败时，可以用 ffmpeg 造一个等长视频把「媒体已加载」这个前提补上：
  `ffmpeg -f lavfi -i testsrc=duration=10:size=320x180:rate=15 -pix_fmt yuv420p out.mp4`。
  注意 `--host-resolver-rules` 在本机 Chromium 上不可靠（实测 `fetch` 仍失败），
  不要指望它来模拟网络状态。

**同类风险**：任何 fixture / 测试里出现 `https://` 都要停下来想一下。CI runner 有外网、
本机可能没有（或反过来），两侧行为不一致时，红与绿都不代表真实逻辑。

**Related** [[build-must-run-copy-assets]] [[ci-runtime-version-drift]]
