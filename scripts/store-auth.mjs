/**
 * store-auth.mjs — Google OAuth 一次性授权，为 Chrome Web Store 发布获取 refresh token。
 *
 * 环境变量来源（先读 process.env，再回退到 ENV_PATH 指向的 .env 文件）：
 *   - CLIENT_ID      必填，Google OAuth 客户端 ID
 *   - CLIENT_SECRET  必填，Google OAuth 客户端密钥
 * 运行成功后会把 REFRESH_TOKEN 追加写入 ENV_PATH 指向的 .env 文件。
 * ENV_PATH 可用环境变量覆盖，默认为 /Users/panbo/Code/.env。
 *
 * 用法: pnpm run store:auth
 */
import { createServer } from 'http';
import { readFileSync, appendFileSync } from 'fs';
import { spawn, execFileSync } from 'child_process';
import { randomBytes } from 'crypto';

const ENV_PATH = process.env.ENV_PATH || '/Users/panbo/Code/.env';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const loadEnv = (path) => {
  const env = {};
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

/** 通过 curl 发请求（走系统代理），返回 { status, json }。 */
const request = (url, { method = 'GET', headers = {}, body = null, form = null } = {}) => {
  const proxy = getSystemProxy();
  const args = ['-sS', '-m', '40', '-X', method, '-w', '\n%{http_code}'];
  if (proxy) args.push('-x', proxy);
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (form) {
    args.push('-H', 'Content-Type: application/x-www-form-urlencoded');
    args.push('--data-binary', new URLSearchParams(form).toString());
  } else if (body) {
    args.push('--data-binary', body);
  }
  args.push(url);
  const out = execFileSync('curl', args, { maxBuffer: 10 * 1024 * 1024 }).toString();
  const idx = out.lastIndexOf('\n');
  const status = Number(out.slice(idx + 1).trim());
  const text = out.slice(0, idx);
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status, json };
};

const clientId = process.env.CLIENT_ID || loadEnv(ENV_PATH).CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET || loadEnv(ENV_PATH).CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('缺少 CLIENT_ID / CLIENT_SECRET，请检查 ' + ENV_PATH);
  process.exit(1);
}

const state = randomBytes(16).toString('hex');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/') {
    res.writeHead(404).end('not found');
    return;
  }

  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(400).end('授权失败: ' + error);
    console.error('授权失败: ' + error + ' ' + (url.searchParams.get('error_description') || ''));
    process.exit(1);
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('缺少授权码');
    process.exit(1);
    return;
  }

  try {
    const token = await request(TOKEN_ENDPOINT, {
      method: 'POST',
      form: {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      },
    });

    if (token.status !== 200 || !token.json?.refresh_token) {
      res.writeHead(500).end('获取 refresh_token 失败: ' + JSON.stringify(token.json).slice(0, 300));
      console.error('token 交换失败 (' + token.status + '):', JSON.stringify(token.json).slice(0, 400));
      process.exit(1);
      return;
    }

    appendFileSync(ENV_PATH, '\nREFRESH_TOKEN=' + token.json.refresh_token + '\n');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h3>✅ 授权成功，refresh token 已保存，可以关闭此页面。</h3>');
    console.log('✅ 授权成功，REFRESH_TOKEN 已写入 ' + ENV_PATH);
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500).end('token 交换失败');
    console.error('token 交换失败:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('授权服务器已启动: ' + REDIRECT_URI);
  console.log('授权链接（若浏览器未自动打开，请手动复制到浏览器）:\n' + authUrl);
  console.log('正在打开浏览器，请在 Google 页面登录并点击"允许"…');
  spawn('open', [authUrl]);
  console.log('等待授权回调（5 分钟内有效）…');
});

setTimeout(() => {
  console.error('超时：未收到授权回调');
  process.exit(1);
}, 5 * 60 * 1000);
