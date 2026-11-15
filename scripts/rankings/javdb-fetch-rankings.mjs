/**
 * JavDB 周榜/月榜抓取（App API，需登录）
 *
 * 用法：
 *   JAVDB_USERNAME=xxx JAVDB_PASSWORD=xxx node scripts/rankings/javdb-fetch-rankings.mjs
 *
 * JavDB 已不再允许匿名读取榜单，脚本先用账号登录换取 token，再带上
 * Authorization 拉取 censored/uncensored 的周榜与月榜。
 * 输出与 javdb-cli --json 一致：{ "movies": [...] }，供 javdb-to-atlas.mjs 转换。
 *
 * 可选环境变量：
 *   JAVDB_API_HOSTS  逗号分隔的 API 镜像，按顺序尝试
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

// 与 javdb-cli internal/javdb/protocol/signature 保持一致的 App 签名常量
const SIGN_PREFIX = '71cf27bb3c0bcdf207b64abecddc970098c7421ee7203b9cdae54478478a199e7d5a6e1a57691123c1a931c057842fb73ba3b3c83bcd69c17ccf174081e3d8aa';
const SIGN_SUFFIX = 'lpw6vgqzsp';
const APP_VERSION = '1.9.35';
const APP_VERSION_NUMBER = '10935';

const DEFAULT_HOSTS = ['https://jdforrepam.com', 'https://apidd.czssdgz.com', 'https://apidd.spthgb.com'];
const HOSTS = (process.env.JAVDB_API_HOSTS || DEFAULT_HOSTS.join(','))
  .split(',')
  .map((host) => host.trim().replace(/\/$/, ''))
  .filter(Boolean);

const USERNAME = process.env.JAVDB_USERNAME || '';
const PASSWORD = process.env.JAVDB_PASSWORD || '';
const DEVICE_UUID = crypto.randomUUID();
const REQUEST_TIMEOUT_MS = 30_000;

/** jdsignature = "{ts}.{suffix}.{md5(ts + prefix)}" */
function sign(ts = Math.floor(Date.now() / 1000)) {
  const digest = crypto.createHash('md5').update(`${ts}${SIGN_PREFIX}`).digest('hex');
  return `${ts}.${SIGN_SUFFIX}.${digest}`;
}

const publicParams = {
  app_channel: 'official',
  app_version: APP_VERSION,
  app_version_number: APP_VERSION_NUMBER,
  platform: 'android',
  system_version: '13',
  device_model: 'Pixel 6',
  device_name: 'Pixel',
  device_uuid: DEVICE_UUID,
};

function baseHeaders() {
  return {
    accept: 'application/json',
    'accept-language': 'zh',
    'user-agent': 'Dart/3.4 (dart:io)',
    jdsignature: sign(),
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: invalid JSON response`);
  }
}

async function login(host) {
  const body = new URLSearchParams({ ...publicParams, username: USERNAME, password: PASSWORD });
  const response = await fetch(`${host}/api/v1/sessions`, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await readJson(response);
  if (!payload.success) {
    const action = payload.action || 'LOGIN_FAILED';
    const message = payload.message || `HTTP ${response.status}`;
    throw new Error(`${action}: ${message}`);
  }
  const token = payload.data?.token || payload.data?.access_token || '';
  if (!token) throw new Error('LOGIN_FAILED: response had no token');
  return token;
}

async function fetchRanking(host, token, type, period) {
  const params = new URLSearchParams({
    ...publicParams,
    type,
    period: period === 'week' ? 'weekly' : 'monthly',
  });
  const response = await fetch(`${host}/api/v1/rankings?${params}`, {
    headers: {
      ...baseHeaders(),
      authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await readJson(response);
  if (!payload.success) {
    const action = payload.action || 'RANKINGS_FAILED';
    const message = payload.message || `HTTP ${response.status}`;
    const error = new Error(`${action}: ${message}`);
    error.action = action;
    throw error;
  }
  const movies = payload.data?.movies;
  return Array.isArray(movies) ? movies : [];
}

const channels = [
  { type: 'censored', apiType: '0', period: 'week' },
  { type: 'uncensored', apiType: '1', period: 'week' },
  { type: 'censored', apiType: '0', period: 'month' },
  { type: 'uncensored', apiType: '1', period: 'month' },
];

if (!USERNAME || !PASSWORD) {
  console.error('Missing JAVDB_USERNAME or JAVDB_PASSWORD');
  process.exit(1);
}

const tokens = new Map();
let failures = 0;

for (const channel of channels) {
  const file = `${channel.type}-${channel.period}.json`;
  let movies = null;
  let lastError = null;

  for (const host of HOSTS) {
    try {
      let token = tokens.get(host);
      if (!token) {
        token = await login(host);
        tokens.set(host, token);
        console.log(`login ok: ${host}`);
      }
      try {
        movies = await fetchRanking(host, token, channel.apiType, channel.period);
      } catch (error) {
        // token 失效：重新登录后重试一次
        if (error.action === 'JWTVerificationError') {
          token = await login(host);
          tokens.set(host, token);
          movies = await fetchRanking(host, token, channel.apiType, channel.period);
        } else {
          throw error;
        }
      }
      break;
    } catch (error) {
      lastError = error;
      console.error(`${channel.type}/${channel.period} via ${host} failed: ${error.message}`);
    }
  }

  if (movies === null) {
    console.error(`${channel.type}/${channel.period} ranking fetch failed: ${lastError?.message || 'unknown error'}`);
    fs.writeFileSync(file, '{"movies":[]}', 'utf8');
    failures += 1;
    continue;
  }

  fs.writeFileSync(file, JSON.stringify({ movies }), 'utf8');
  console.log(`${file} ${movies.length} movies`);
}

fs.writeFileSync('fetch-failures.txt', String(failures), 'utf8');
if (failures !== 0) {
  console.error(`${failures} ranking channel(s) failed to fetch`);
}
if (failures === channels.length) {
  process.exit(1);
}
