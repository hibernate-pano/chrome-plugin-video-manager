import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ENV_PATH = process.env.ENV_PATH || '/Users/panbo/Code/.env';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/chromewebstore/v1.1';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/chromewebstore/v1.1';

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

const env = loadEnv(ENV_PATH);
const clientId = env.CLIENT_ID;
const clientSecret = env.CLIENT_SECRET;
const refreshToken = env.REFRESH_TOKEN;

if (!clientId || !clientSecret || !refreshToken) {
  console.error('缺少凭据：请先运行 node scripts/store-auth.mjs 完成授权（需要 CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN）');
  process.exit(1);
}

import { execFileSync } from 'child_process';

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
      args.push('-H', 'Content-Type: application/octet-stream');
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
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
  });
  if (!res.body?.access_token) {
    throw new Error('获取 access token 失败: ' + JSON.stringify(res.body).slice(0, 300));
  }
  return res.body.access_token;
};

const api = async (token, url, options = {}) => {
  const headers = { Authorization: 'Bearer ' + token, ...(options.headers || {}) };
  if (options.body) {
    headers['Content-Type'] = 'application/zip';
  }
  return request(url, { ...options, headers });
};

const zipPath = process.argv[2] || resolve(root, 'release/video-speed-controller-v5.2.0.zip');
if (!existsSync(zipPath)) {
  console.error('找不到发布包: ' + zipPath);
  process.exit(1);
}
const zipBuffer = readFileSync(zipPath);

console.log('1/5 获取 access token…');
const token = await getAccessToken();

// 本扩展在 Chrome 商店的 item id（devconsole 地址栏可查）
const DEFAULT_ITEM_ID = 'mennabljgjphikgaiahngapedibccmei';
const itemId = env.ITEM_ID || DEFAULT_ITEM_ID;
if (!itemId) {
  console.error('缺少 ITEM_ID：请把 ITEM_ID=<你的扩展 item id> 追加到 ' + ENV_PATH);
  process.exit(1);
}
console.log('2/5 使用 item:', itemId);

console.log('3/5 上传新版本 zip…');
const upload = await api(token, UPLOAD_BASE + '/items/' + itemId + '?uploadType=media', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/zip' },
  body: zipBuffer,
});
if (upload.status !== 200 || upload.body?.uploadState !== 'SUCCESS') {
  console.error('上传失败 (' + upload.status + '):', JSON.stringify(upload.body).slice(0, 600));
  if (upload.body?.itemError) console.error('itemError:', JSON.stringify(upload.body.itemError, null, 2));
  process.exit(1);
}
console.log('  上传成功:', JSON.stringify(upload.body).slice(0, 200));

console.log('4/5 查询草稿状态…');
const draft = await api(token, API_BASE + '/items/' + itemId + '?projection=draft');
console.log('  draftStatus:', draft.body?.draftStatus ?? '未知');

console.log('5/5 发布（default 渠道）…');
const publish = await api(token, API_BASE + '/items/' + itemId + '/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ target: 'default' }),
});
console.log('  发布响应 (' + publish.status + '):', JSON.stringify(publish.body).slice(0, 300));
if (publish.status !== 200) {
  console.error('发布失败，请人工检查 devconsole 后台');
  process.exit(1);
}

console.log('\n✅ 完成：' + zipPath.split('/').pop() + ' 已上传并发布。新版本会进入商店审核流程。');
