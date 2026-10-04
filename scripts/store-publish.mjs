/**
 * store-publish.mjs — 上传 zip 到 Chrome Web Store 并发布到 default 渠道。
 *
 * ⚠️ API 版本：本脚本使用 Chrome Web Store API **v2**。
 *    旧的 v1.1（www.googleapis.com/chromewebstore/v1.1）官方支持到 2026-10-15，之后失效。
 *
 * ⚠️ 能力边界：v2 只有 upload / fetchStatus / publish / cancelSubmission /
 *    setPublishedDeployPercentage，**没有 listing metadata（名称/描述/截图）接口**。
 *    想改商店文案、截图、分类等，只能到 Chrome Developer Dashboard 手动改，
 *    不要指望用本脚本（或任何 CWS API 调用）来改 listing。
 *
 * 环境变量来源（真实环境变量优先，其次 ENV_PATH 指向的 .env 文件）：
 *   - CLIENT_ID      必填，Google OAuth 客户端 ID
 *   - CLIENT_SECRET  必填，Google OAuth 客户端密钥
 *   - REFRESH_TOKEN  必填，由 store-auth.mjs 授权后写入
 *   - ITEM_ID        可选，扩展在商店的 item id；缺省用代码内 DEFAULT_ITEM_ID
 *   - PUBLISHER_ID   可选，发布者 id；缺省用 'me'
 *                    v2 路径模板 publishers/{publisherId}/items/{itemId} 接受 'me'
 *                    （实测对 .../publishers/me/... 返回 401 而非 400/404）。
 *                    若 'me' 哪天不被接受，请到 Developer Dashboard 查真实 publisher id 填入。
 * ENV_PATH 可用环境变量覆盖，默认为 /Users/panbo/Code/.env。
 *
 * 用法:
 *   node scripts/store-publish.mjs [zip 路径]      # 缺省自动选 release/ 下版本号最大的 zip
 *   node scripts/store-publish.mjs --dry-run       # 不联网、不需要凭据，只打印将调用的完整 URL 与请求体
 *   node scripts/store-publish.mjs --cancel        # 取消当前待审提交（cancelSubmission）
 *   node scripts/store-publish.mjs --cancel --dry-run
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const RELEASE_DIR = resolve(root, 'release');
const ENV_PATH = process.env.ENV_PATH || '/Users/panbo/Code/.env';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// v2 普通方法基址；媒体上传走 /upload 前缀，故单独一个基址。
const API_BASE = 'https://chromewebstore.googleapis.com/v2';
const UPLOAD_BASE = 'https://chromewebstore.googleapis.com/upload/v2';

const loadEnv = (path) => {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const idx = line.indexOf('=');
    if (idx < 0 || line.trim().startsWith('#')) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
};

/** 读取 macOS 系统代理（scutil），浏览器与脚本走同一出口。 */
const getSystemProxy = () => {
  try {
    const out = execFileSync('scutil', ['--proxy']).toString();
    const host = (out.match(/HTTPSProxy : (\S+)/) || out.match(/HTTPProxy : (\S+)/) || [])[1];
    const port = (out.match(/HTTPSPort : (\d+)/) || out.match(/HTTPPort : (\d+)/) || [])[1];
    if (host && port) return `http://${host}:${port}`;
  } catch { /* ignore */ }
  return null;
};

/** 通过 curl 发请求（走系统代理），返回 { status, body }。 */
const request = (url, { method = 'GET', headers = {}, body = null, form = null } = {}) => {
  const proxy = getSystemProxy();
  const args = ['-sS', '-m', '60', '-X', method, '-w', '\n%{http_code}'];
  if (proxy) args.push('-x', proxy);
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (form) {
    args.push('-H', 'Content-Type: application/x-www-form-urlencoded');
    args.push('--data-binary', new URLSearchParams(form).toString());
  } else if (body) {
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      args.push('-H', 'Content-Type', 'application/octet-stream');
    }
    args.push('--data-binary', '@-');
  }
  args.push(url);
  const out = execFileSync('curl', args, { input: body ?? undefined, maxBuffer: 10 * 1024 * 1024 }).toString();
  const idx = out.lastIndexOf('\n');
  const status = Number(out.slice(idx + 1).trim());
  const text = out.slice(0, idx);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status, body: parsed };
};

const getAccessToken = async () => {
  const res = await request(TOKEN_ENDPOINT, {
    method: 'POST',
    form: {
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      refresh_token: env.REFRESH_TOKEN,
      grant_type: 'refresh_token',
    },
  });
  if (!res.body?.access_token) {
    throw new Error('获取 access token 失败: ' + JSON.stringify(res.body).slice(0, 300));
  }
  return res.body.access_token;
};

/** 带 Bearer token 调 v2 API（GET/POST，Content-Type 由调用方显式指定）。 */
const api = async (token, url, options = {}) =>
  request(url, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) },
  });

/** 在 release/ 下按文件名里的版本号挑最大的 zip；找不到返回 null。 */
const findLatestZip = () => {
  if (!existsSync(RELEASE_DIR)) return null;
  const candidates = readdirSync(RELEASE_DIR)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .map((f) => {
      const m = f.match(/(\d+)\.(\d+)\.(\d+)/);
      return m ? { file: resolve(RELEASE_DIR, f), ver: [Number(m[1]), Number(m[2]), Number(m[3])] } : null;
    })
    .filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.ver[0] - a.ver[0] || b.ver[1] - a.ver[1] || b.ver[2] - a.ver[2]);
  return candidates[0].file;
};

/** 打印一个 ItemRevisionStatus（fetchStatus 返回值里的真实状态字段）。 */
const describeRevision = (label, rev) => {
  if (!rev) { console.log(`  ${label}: 无`); return; }
  const channels = Array.isArray(rev.distributionChannels) ? rev.distributionChannels : [];
  const pct = channels.filter((c) => typeof c?.deployPercentage === 'number');
  const pctText = pct.length ? '，deployPercentage=' + pct.map((c) => c.deployPercentage).join('/') : '';
  console.log(`  ${label}: ${rev.state ?? '未知'}${pctText}`);
  if (channels.length) console.log('    distributionChannels:', JSON.stringify(channels));
};

// ---- 参数解析 -------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const dryRun = flags.has('--dry-run');
const cancelOnly = flags.has('--cancel');
const zipArg = positional[0];

// 与 store-auth.mjs 一致：真实环境变量优先，其次才是 ENV_PATH 指向的 .env 文件。
const env = { ...loadEnv(ENV_PATH), ...process.env };

// 本扩展在 Chrome 商店的 item id（devconsole 地址栏可查）
const DEFAULT_ITEM_ID = 'mennabljgjphikgaiahngapedibccmei';
const itemId = env.ITEM_ID || DEFAULT_ITEM_ID;
const publisherId = env.PUBLISHER_ID || 'me'; // 'me' 实测语法可接受；否则填真实 publisher id
const basePath = `${API_BASE}/publishers/${publisherId}/items/${itemId}`;
const uploadUrl = `${UPLOAD_BASE}/publishers/${publisherId}/items/${itemId}:upload?uploadType=media`;
const statusUrl = `${basePath}:fetchStatus`;
const publishUrl = `${basePath}:publish`;
const cancelUrl = `${basePath}:cancelSubmission`;

// v2 PublishItemRequest：publishType / skipReview / deployInfos[].deployPercentage / blockOnWarnings。
// 这里保持与旧 v1.1 `{target:'default'}` 等价语义：立即发布 default 渠道。
// deployInfos 不传 = 沿用 devconsole 里保存的 rollout 百分比，避免脚本擅自改灰度。
const publishBody = { publishType: 'DEFAULT_PUBLISH', skipReview: false };

// ---- 选择 zip（dry-run 也做，用于打印上传体积；找不到时 dry-run 不致命）----
let zipPath = zipArg || findLatestZip();
if (zipPath && !existsSync(zipPath)) {
  console.error('找不到发布包: ' + zipPath);
  process.exit(1);
}
if (!zipPath) {
  if (dryRun) {
    console.log('⚠️ 未找到 zip（release/ 下没有带 x.y.z 版本号的 .zip），dry-run 以占位路径继续');
    zipPath = resolve(RELEASE_DIR, '<未找到 zip>');
  } else {
    console.error('找不到发布包：release/ 下没有带版本号的 .zip。可显式传入：node scripts/store-publish.mjs <zip 路径>');
    process.exit(1);
  }
}
const zipBuffer = existsSync(zipPath) ? readFileSync(zipPath) : null;

// ---- dry-run：不联网、不需要凭据，只打印请求 ---------------------------------
if (dryRun) {
  console.log('== dry-run：不联网、不需要凭据 ==');
  console.log('publisherId:', publisherId, '（PUBLISHER_ID 或默认 me）');
  console.log('itemId:', itemId);
  console.log('zip:', zipPath, zipBuffer ? `(${zipBuffer.length} 字节)` : '');
  if (cancelOnly) {
    console.log('\n[POST] ' + cancelUrl);
    console.log('  Content-Type: application/json');
    console.log('  body: {}');
    process.exit(0);
  }
  console.log('\n1) 上传  [POST] ' + uploadUrl);
  console.log('   Content-Type: application/zip');
  console.log('   body: <zip 二进制，' + (zipBuffer ? zipBuffer.length : '?') + ' 字节>');
  console.log('\n2) 状态  [GET]  ' + statusUrl);
  console.log('\n3) 发布  [POST] ' + publishUrl);
  console.log('   Content-Type: application/json');
  console.log('   body: ' + JSON.stringify(publishBody));
  process.exit(0);
}

// ---- 真实执行：凭据校验 ------------------------------------------------
if (!env.CLIENT_ID || !env.CLIENT_SECRET || !env.REFRESH_TOKEN) {
  console.error('缺少凭据：请先运行 node scripts/store-auth.mjs 完成授权（需要 CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN）');
  process.exit(1);
}

if (cancelOnly) {
  console.log('1/1 取消待审提交…');
  const token = await getAccessToken();
  const cancel = await api(token, cancelUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (cancel.status !== 200) {
    console.error('取消提交失败 (' + cancel.status + '):', JSON.stringify(cancel.body).slice(0, 600));
    process.exit(1);
  }
  console.log('  已取消:', JSON.stringify(cancel.body).slice(0, 200));
  console.log('\n✅ 已取消待审提交。');
  process.exit(0);
}

console.log('1/5 获取 access token…');
const token = await getAccessToken();

console.log('2/5 使用 item:', itemId, '（publisher:', publisherId + '）');

console.log('3/5 上传新版本 zip…');
const upload = await api(token, uploadUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/zip' },
  body: zipBuffer,
});
if (upload.status !== 200 || upload.body?.uploadState !== 'SUCCEEDED') {
  console.error('上传失败 (' + upload.status + '):', JSON.stringify(upload.body).slice(0, 600));
  if (upload.body?.error?.details) console.error('details:', JSON.stringify(upload.body.error.details, null, 2));
  process.exit(1);
}
console.log('  上传成功: itemId=' + (upload.body?.itemId ?? itemId) + ' crxVersion=' + (upload.body?.crxVersion ?? '?') + ' uploadState=' + upload.body.uploadState);

console.log('4/5 查询审核/发布状态…');
const status = await api(token, statusUrl);
if (status.status !== 200 || status.body?.error) {
  console.error('查询状态失败 (' + status.status + '):', JSON.stringify(status.body).slice(0, 600));
  process.exit(1);
}
const s = status.body || {};
if (s.takenDown) console.error('  ⚠️ takenDown=true：项目因政策违规被下架，请到 devconsole 处理');
if (s.warned) console.error('  ⚠️ warned=true：项目收到政策警告');
if (s.lastAsyncUploadState) console.log('  lastAsyncUploadState:', s.lastAsyncUploadState);
describeRevision('submittedItemRevisionStatus（待审）', s.submittedItemRevisionStatus);
describeRevision('publishedItemRevisionStatus（线上）', s.publishedItemRevisionStatus);

console.log('5/5 发布（default 渠道）…');
const publish = await api(token, publishUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(publishBody),
});
console.log('  发布响应 (' + publish.status + '):', JSON.stringify(publish.body).slice(0, 300));
if (publish.status !== 200) {
  console.error('发布失败，请人工检查 devconsole 后台');
  process.exit(1);
}

console.log('\n✅ 完成：' + zipPath.split('/').pop() + ' 已上传并发布。新版本会进入商店审核流程。');
