/**
 * store-publish.mjs — 上传 zip 到 Chrome Web Store 并发布到 default 渠道。
 *
 * ⚠️ API 版本：默认走 v1.1（已知对本机凭证可用），可选 --api=v2。
 *    2026-09-26 实测：v2 端点（chromewebstore.googleapis.com/v2/...）对本凭证一律 404，
 *    而 v1.1（www.googleapis.com/chromewebstore/v1.1）确定可用，因此 v1.1 不能被删。
 *    v2 需要 CWS_PUBLISHER_ID（UUID，如 19d9e44e-...，**不是** 32 位 item id）。
 *
 * ⚠️ 能力边界：API 只有 upload / fetchStatus / publish / cancelSubmission，
 *    **没有 listing metadata（名称/描述/截图）接口**。想改商店文案、截图、分类等，
 *    只能到 Chrome Developer Dashboard 手动改。
 *
 * 上传二进制：用 curl -T <file> 文件直传（见 httpUpload）。
 *   这是同机另一个项目已验证可用的写法，且结构上绕开了「二进制走 stdin」这个坑：
 *   execFileSync 一旦带 `encoding`，stdin 的 Buffer 会经字符串转换而损坏（实测：
 *   带 encoding:'utf8' 时 4KB 随机数据的 sha256 不一致；不带 encoding 则完好）。
 *   JSON/form 请求仍走 --data-binary（非二进制，安全）。
 *
 * 凭证读取优先级（键名同时支持带 CWS_ 前缀与不带前缀）：
 *   1. 进程环境变量（CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN /
 *      CWS_ITEM_ID / CWS_PUBLISHER_ID）—— one-tab 与 cws-mcp 的约定
 *   2. ~/.config/mcp/mcp.json 的 mcpServers["cws-mcp"].env（本机真正有效的那对）
 *   3. ENV_PATH 指向的 .env（兼容旧用法；里面那对已失效，不作首选）
 *   日志只打印来源与键名，绝不打印任何密钥值。
 *
 * 用法:
 *   node scripts/store-publish.mjs [zip 路径]        # 缺省自动选 release/ 下版本号最大的 zip
 *   node scripts/store-publish.mjs --dry-run         # 离线、不需凭据，打印将调用的完整 URL
 *   node scripts/store-publish.mjs --api=v2 --dry-run
 *   node scripts/store-publish.mjs --cancel          # 取消当前待审提交（仅 v2，需 --api=v2）
 *   node scripts/store-publish.mjs --api=v2 --cancel --dry-run
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const RELEASE_DIR = resolve(root, 'release');
const ENV_PATH = process.env.ENV_PATH || '/Users/panbo/Code/.env';
const MCP_CONFIG_PATH = join(homedir(), '.config', 'mcp', 'mcp.json');
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// v1.1（www.googleapis.com）：已知可用。
const V1_BASE = 'https://www.googleapis.com/chromewebstore/v1.1';
const V1_UPLOAD_BASE = 'https://www.googleapis.com/upload/chromewebstore/v1.1';
// v2（chromewebstore.googleapis.com）：需 publisherId；对本凭证存疑。
const V2_BASE = 'https://chromewebstore.googleapis.com/v2';
const V2_UPLOAD_BASE = 'https://chromewebstore.googleapis.com/upload/v2';

// 本扩展在 Chrome 商店的 item id（devconsole 地址栏可查）。
const DEFAULT_ITEM_ID = 'mennabljgjphikgaiahngapedibccmei';

// ---- 凭证解析：多来源 + CWS_ 前缀兼容 ------------------------------------
const parseDotEnv = (path) => {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
};

const readMcpCwsEnv = () => {
  if (!existsSync(MCP_CONFIG_PATH)) return {};
  try {
    const json = JSON.parse(readFileSync(MCP_CONFIG_PATH, 'utf8'));
    return json?.mcpServers?.['cws-mcp']?.env ?? {};
  } catch {
    return {};
  }
};

// 每个逻辑键的候选键名：优先 CWS_ 前缀，再退到旧的无前缀写法。
const CRED_KEYS = {
  CLIENT_ID: ['CWS_CLIENT_ID', 'CLIENT_ID'],
  CLIENT_SECRET: ['CWS_CLIENT_SECRET', 'CLIENT_SECRET'],
  REFRESH_TOKEN: ['CWS_REFRESH_TOKEN', 'REFRESH_TOKEN'],
  ITEM_ID: ['CWS_ITEM_ID', 'ITEM_ID'],
  PUBLISHER_ID: ['CWS_PUBLISHER_ID', 'PUBLISHER_ID'],
};

// 来源按优先级排列。
const SOURCES = [
  { label: 'process.env', values: process.env },
  { label: '~/.config/mcp/mcp.json (mcpServers["cws-mcp"].env)', values: readMcpCwsEnv() },
  { label: `ENV_PATH=${ENV_PATH}`, values: parseDotEnv(ENV_PATH) },
];

const resolveCred = (keys) => {
  for (const src of SOURCES) {
    for (const key of keys) {
      const value = src.values[key];
      if (value !== undefined && value !== null && value !== '') {
        return { value, source: src.label, key };
      }
    }
  }
  return { value: undefined, source: null, key: null };
};

const creds = {};
const credReport = [];
for (const [logical, keys] of Object.entries(CRED_KEYS)) {
  const hit = resolveCred(keys);
  creds[logical] = hit.value;
  credReport.push({ logical, ...hit });
}

// 只打印来源与键名，绝不打印值。
console.log('== 凭证解析（只显示来源与键名，不显示值）==');
for (const r of credReport) {
  const where = r.value === undefined ? '未找到' : `${r.source} → ${r.key}`;
  console.log(`  ${r.logical.padEnd(14)} ${where}`);
}

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

/**
 * 通过 curl 发 JSON/form 请求（走系统代理），返回 { status, body }。
 * ⚠️ 只用于非二进制载荷（form / JSON 字符串）。zip 上传请用 httpUpload。
 */
const request = (url, { method = 'GET', headers = {}, form = null, body = null } = {}) => {
  const proxy = getSystemProxy();
  const args = ['-sS', '-m', '60', '-X', method, '-w', '\n%{http_code}'];
  if (proxy) args.push('-x', proxy);
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (form) {
    args.push('-H', 'Content-Type: application/x-www-form-urlencoded');
    args.push('--data-binary', new URLSearchParams(form).toString());
  } else if (body) {
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      args.push('-H', 'Content-Type: application/json');
    }
    args.push('--data-binary', body);
  }
  args.push(url);
  const out = execFileSync('curl', args, { maxBuffer: 10 * 1024 * 1024 }).toString();
  const idx = out.lastIndexOf('\n');
  const status = Number(out.slice(idx + 1).trim());
  const text = out.slice(0, idx);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status, body: parsed, raw: text };
};

/**
 * 文件直传（curl -T，zip 走这里）。
 *
 * ⚠️ 为什么不走 `--data-binary @-` + execFileSync({ input })：
 *   execFileSync 只要带 `encoding`，stdin 的 Buffer 就会被转成字符串而损坏
 *   （实测 4KB 随机数据 sha256 不一致；不带 encoding 时完好）。文件直传不经过
 *   stdin，从结构上避免这类问题。
 *
 * ⚠️ -T 放在 URL 之前：curl 按 URL 分组命令行，URL 之后的选项作用于「下一个 URL」。
 *   （注：单 URL 时两种顺序实测都能发出请求，但按 URL 分组规则写更稳。）
 */
const httpUpload = (method, url, filePath, { headers = {} } = {}) => {
  const proxy = getSystemProxy();
  const args = ['-sS', '-m', '300', '-X', method, '-T', filePath]; // -T 在 URL 之前
  if (proxy) args.push('-x', proxy);
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push(url, '-w', '\n%{http_code}');
  const out = execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024, timeout: 300_000 }).toString();
  const idx = out.lastIndexOf('\n');
  const status = Number(out.slice(idx + 1).trim());
  const text = out.slice(0, idx);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status, body: parsed, raw: text };
};

const getAccessToken = async () => {
  const res = await request(TOKEN_ENDPOINT, {
    method: 'POST',
    form: {
      client_id: creds.CLIENT_ID,
      client_secret: creds.CLIENT_SECRET,
      refresh_token: creds.REFRESH_TOKEN,
      grant_type: 'refresh_token',
    },
  });
  if (!res.body?.access_token) {
    throw new Error('获取 access token 失败: ' + JSON.stringify(res.body).slice(0, 300));
  }
  return res.body.access_token;
};

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

/** v2 fetchStatus 返回值里 ItemRevisionStatus 的状态描述。 */
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

const apiFlag = argv.find((a) => a.startsWith('--api='));
const apiVersion = apiFlag ? apiFlag.slice('--api='.length) : 'v1';
if (apiVersion !== 'v1' && apiVersion !== 'v2') {
  console.error(`未知 API 版本: ${apiVersion}（可用：--api=v1 或 --api=v2）`);
  process.exit(1);
}
const isV1 = apiVersion === 'v1';

const itemId = creds.ITEM_ID || DEFAULT_ITEM_ID;

// v2 必须显式提供 publisherId（UUID），不能拿 item id 或 'me' 糊弄过去。
if (!isV1 && !creds.PUBLISHER_ID) {
  console.error(
    'v2 API 需要 publisherId（UUID，如 19d9e44e-...，不是 32 位 item id）。\n' +
    '请设置 CWS_PUBLISHER_ID 环境变量，或写入 ~/.config/mcp/mcp.json 的 mcpServers["cws-mcp"].env。',
  );
  process.exit(1);
}

// ---- 构造两种版本各自的端点 ----------------------------------------------
const endpoints = isV1
  ? {
      label: 'v1.1（www.googleapis.com，已知可用）',
      upload: { method: 'PUT', url: `${V1_UPLOAD_BASE}/items/${itemId}` },
      status: { method: 'GET', url: `${V1_BASE}/items/${itemId}?projection=DRAFT` },
      publish: { method: 'POST', url: `${V1_BASE}/items/${itemId}/publish` },
      cancel: null, // v1.1 无 cancelSubmission
    }
  : {
      label: 'v2（chromewebstore.googleapis.com）',
      upload: {
        method: 'POST',
        url: `${V2_UPLOAD_BASE}/publishers/${creds.PUBLISHER_ID}/items/${itemId}:upload?uploadType=media`,
      },
      status: { method: 'GET', url: `${V2_BASE}/publishers/${creds.PUBLISHER_ID}/items/${itemId}:fetchStatus` },
      publish: { method: 'POST', url: `${V2_BASE}/publishers/${creds.PUBLISHER_ID}/items/${itemId}:publish` },
      cancel: { method: 'POST', url: `${V2_BASE}/publishers/${creds.PUBLISHER_ID}/items/${itemId}:cancelSubmission` },
    };

// v2 PublishItemRequest：保持与旧 v1.1 `{target:'default'}` 等价语义（立即发布 default 渠道）。
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

// ---- dry-run：不联网、不需要凭据，只打印请求 ---------------------------------
if (dryRun) {
  console.log('\n== dry-run：不联网、不需要凭据 ==');
  console.log('API:', endpoints.label);
  console.log('itemId:', itemId);
  if (!isV1) console.log('publisherId:', creds.PUBLISHER_ID);
  console.log('zip:', zipPath);
  if (cancelOnly) {
    if (!endpoints.cancel) {
      console.error('v1.1 不支持 cancelSubmission，请用 --api=v2 --cancel');
      process.exit(1);
    }
    console.log('\n[POST] ' + endpoints.cancel.url);
    console.log('  Content-Type: application/json');
    console.log('  body: {}');
    process.exit(0);
  }
  console.log('\n1) 上传  [' + endpoints.upload.method + '] ' + endpoints.upload.url);
  console.log('   Content-Type: application/zip');
  console.log('   body: <zip 文件直传，curl -T>');
  console.log('\n2) 状态  [' + endpoints.status.method + ']  ' + endpoints.status.url);
  console.log('\n3) 发布  [' + endpoints.publish.method + '] ' + endpoints.publish.url);
  if (!isV1) {
    console.log('   Content-Type: application/json');
    console.log('   body: ' + JSON.stringify(publishBody));
  }
  process.exit(0);
}

// ---- 真实执行：凭据与能力校验 ------------------------------------------
if (!creds.CLIENT_ID || !creds.CLIENT_SECRET || !creds.REFRESH_TOKEN) {
  console.error('缺少凭据：需要 CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN（支持 CWS_ 前缀）。');
  process.exit(1);
}
if (cancelOnly && !endpoints.cancel) {
  console.error('v1.1 不支持 cancelSubmission，请用 --api=v2 --cancel');
  process.exit(1);
}

if (cancelOnly) {
  console.log('\n1/1 取消待审提交（v2 cancelSubmission）…');
  const token = await getAccessToken();
  const cancel = await request(endpoints.cancel.url, {
    method: endpoints.cancel.method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
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

console.log('\n1/5 获取 access token…');
const token = await getAccessToken();

console.log('2/5 使用 item:', itemId, isV1 ? '' : `（publisher: ${creds.PUBLISHER_ID}）`);

console.log('3/5 上传新版本 zip（curl -T 文件直传）…');
const upload = await httpUpload(endpoints.upload.method, endpoints.upload.url, zipPath, {
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/zip' },
});
const uploadOk = isV1
  ? upload.status === 200
  : upload.status === 200 && upload.body?.uploadState === 'SUCCEEDED';
if (!uploadOk) {
  console.error('上传失败 (' + upload.status + '):', JSON.stringify(upload.body).slice(0, 600));
  if (upload.body?.error?.details) console.error('details:', JSON.stringify(upload.body.error.details, null, 2));
  process.exit(1);
}
console.log(
  '  上传成功: itemId=' + (upload.body?.itemId ?? itemId) +
  (upload.body?.crxVersion ? ' crxVersion=' + upload.body.crxVersion : '') +
  (upload.body?.uploadState ? ' uploadState=' + upload.body.uploadState : ''),
);

console.log('4/5 查询审核/发布状态…');
const status = await request(endpoints.status.url, {
  method: endpoints.status.method,
  headers: { Authorization: 'Bearer ' + token },
});
if (status.status !== 200 || status.body?.error) {
  console.error('查询状态失败 (' + status.status + '):', JSON.stringify(status.body).slice(0, 600));
  process.exit(1);
}
if (isV1) {
  console.log('  status:', JSON.stringify(status.body).slice(0, 400));
} else {
  const s = status.body || {};
  if (s.takenDown) console.error('  ⚠️ takenDown=true：项目因政策违规被下架，请到 devconsole 处理');
  if (s.warned) console.error('  ⚠️ warned=true：项目收到政策警告');
  if (s.lastAsyncUploadState) console.log('  lastAsyncUploadState:', s.lastAsyncUploadState);
  describeRevision('submittedItemRevisionStatus（待审）', s.submittedItemRevisionStatus);
  describeRevision('publishedItemRevisionStatus（线上）', s.publishedItemRevisionStatus);
}

console.log('5/5 发布（default 渠道）…');
const publish = await request(endpoints.publish.url, {
  method: endpoints.publish.method,
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: isV1 ? null : JSON.stringify(publishBody),
});
console.log('  发布响应 (' + publish.status + '):', JSON.stringify(publish.body).slice(0, 300));
if (publish.status !== 200) {
  console.error('发布失败，请人工检查 devconsole 后台');
  process.exit(1);
}

console.log('\n✅ 完成：' + zipPath.split('/').pop() + ' 已上传并发布。新版本会进入商店审核流程。');
