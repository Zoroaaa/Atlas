/**
 * JavDB TOP250 抓取 + 导入（App API，需登录）
 *
 * 通道：
 *   - 总榜：全部 / 有码 / 无码 / FC2，每月各跑一次（按日期错开）
 *   - 年度榜：2008–2026，每两个月各跑一次（奇数月按日期错开）
 *   - 欧美榜暂不考虑：相关代码已注释，恢复时一并取消注释
 *
 * 默认由 GitHub Actions 每天 19:30 UTC 触发，脚本自行判断「今天该跑哪个通道」；
 * 也可以在 workflow_dispatch 指定 TOP250_LIST / TOP250_YEAR 手动补跑。
 *
 * 分批与限速：
 *   - 每个通道固定 250 条，App API 单页 20 条，共 13 页；
 *   - 每页请求间隔 10–15 秒随机（所有通道一致）；
 *   - 每 BATCH_SIZE 页（默认 4 页）为一批，批间额外等待 BATCH_DELAY_MS（默认 20 秒）；
 *   - 多个通道串行执行，通道间等待 15 秒。
 *
 * 环境变量：
 *   JAVDB_USERNAME / JAVDB_PASSWORD
 *   ATLAS_RANKING_IMPORT_URL   完整导入地址（与周/月榜共用）
 *   RANKINGS_IMPORT_SECRET
 *   可选 TOP250_LIST=all|censored|uncensored|fc2|year
 *   可选 TOP250_YEAR=2008..2026
 *   可选 TOP250_PAGES=1..13（本地调试限制页数）
 */
import crypto from 'node:crypto';

const SIGN_PREFIX = '71cf27bb3c0bcdf207b64abecddc970098c7421ee7203b9cdae54478478a199e7d5a6e1a57691123c1a931c057842fb73ba3b3c83bcd69c17ccf174081e3d8aa';
const SIGN_SUFFIX = 'lpw6vgqzsp';
const APP_VERSION = '1.9.35';
const APP_VERSION_NUMBER = '10935';
const DEFAULT_HOSTS = ['https://jdforrepam.com', 'https://apidd.czssdgz.com', 'https://apidd.spthgb.com'];

const PAGE_SIZE = 20;
const MAX_PAGES = 13;
const MAX_ITEMS = 250;
const PAGE_DELAY_MIN_MS = 10_000;
const PAGE_DELAY_MAX_MS = 15_000;
const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 20_000;
const CHANNEL_DELAY_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const AUTH_RETRY_DELAY_MS = 60_000;
const AUTH_MAX_RETRIES = 2;

const YEAR_START = 2008;
const YEAR_END = 2026;
// 欧美榜暂不考虑：western 通道暂停
const ZONES = { censored: '0', uncensored: '1' /* , western: '2' */, fc2: '3' };

const USERNAME = process.env.JAVDB_USERNAME || '';
const PASSWORD = process.env.JAVDB_PASSWORD || '';
const IMPORT_URL = process.env.ATLAS_RANKING_IMPORT_URL || '';
const IMPORT_SECRET = process.env.RANKINGS_IMPORT_SECRET || '';
const HOSTS = (process.env.JAVDB_API_HOSTS || DEFAULT_HOSTS.join(','))
  .split(',')
  .map((host) => host.trim().replace(/\/$/, ''))
  .filter(Boolean);
const PAGES = Math.min(
  MAX_PAGES,
  Math.max(1, parseInt(process.env.TOP250_PAGES || String(MAX_PAGES), 10) || MAX_PAGES)
);

const DEVICE_UUID = crypto.randomUUID();
let hostIndex = 0;
let token = '';
let lastRequestAt = 0;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sign(ts = Math.floor(Date.now() / 1000)) {
  const digest = crypto.createHash('md5').update(`${ts}${SIGN_PREFIX}`).digest('hex');
  return `${ts}.${SIGN_SUFFIX}.${digest}`;
}

function baseHeaders() {
  return {
    accept: 'application/json',
    'accept-language': 'zh',
    'user-agent': 'Dart/3.4 (dart:io)',
    jdsignature: sign(),
  };
}

/** 全局限速：所有 JavDB 请求共享同一间隔，每页 10–15 秒随机 */
async function pace() {
  const interval = PAGE_DELAY_MIN_MS + Math.random() * (PAGE_DELAY_MAX_MS - PAGE_DELAY_MIN_MS);
  const wait = lastRequestAt + interval - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: invalid JSON response`);
  }
}

async function javdbRequest(path, { method = 'GET', params, form, auth = true } = {}, attempt = 0) {
  const host = HOSTS[hostIndex % HOSTS.length];
  const url = new URL(`${host}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, String(value));
  }

  await pace();
  const headers = baseHeaders();
  if (auth && token) headers.authorization = `Bearer ${token}`;
  if (form) headers['content-type'] = 'application/x-www-form-urlencoded';

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: form ? new URLSearchParams(form) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await readJson(response);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const backoff = 15_000 * (attempt + 1) + Math.random() * 3_000;
      console.warn(`${path} failed (${err.message}), retry in ${Math.round(backoff / 1000)}s`);
      await sleep(backoff);
      hostIndex += 1;
      return javdbRequest(path, { method, params, form, auth }, attempt + 1);
    }
    throw err;
  }
}

async function login() {
  const payload = await javdbRequest('/api/v1/sessions', {
    method: 'POST',
    auth: false,
    form: { ...publicParams, username: USERNAME, password: PASSWORD },
  });
  if (!payload.success) {
    throw new Error(`${payload.action || 'LOGIN_FAILED'}: ${payload.message || 'login failed'}`);
  }
  const value = payload.data?.token || payload.data?.access_token || '';
  if (!value) throw new Error('LOGIN_FAILED: response had no token');
  token = value;
}

function isAuthError(payload) {
  return payload && payload.success === 0 && /JWTVerificationError|Auth|登錄|登录/i.test(String(payload.action || ''));
}

async function authorized(path, options) {
  if (!token) await login();
  let payload = await javdbRequest(path, options);
  let authRetries = 0;
  while (isAuthError(payload) && authRetries < AUTH_MAX_RETRIES) {
    authRetries += 1;
    console.warn(
      `${path} auth error (${payload.action || 'AUTH'}), cooling ${AUTH_RETRY_DELAY_MS / 1000}s before re-login (${authRetries}/${AUTH_MAX_RETRIES})`
    );
    await sleep(AUTH_RETRY_DELAY_MS);
    await login();
    payload = await javdbRequest(path, options);
  }
  if (!payload?.success) {
    throw new Error(`${payload?.action || 'API_ERROR'}: ${payload?.message || 'request failed'}`);
  }
  return payload.data || {};
}

/** 东八区日期（与用户看到的自然日一致） */
function shanghaiDate(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * 今天该跑哪个通道。
 * 每月 1–4 日：全部 / 有码 / 无码 / FC2（一天一个，错开跑；欧美榜暂不考虑）。
 * 奇数月 5–23 日：年度榜 2008–2026（一天一个，两个月一轮）。
 */
function dueChannels() {
  const overrideList = (process.env.TOP250_LIST || '').trim();
  const overrideYear = (process.env.TOP250_YEAR || '').trim();

  if (overrideList) {
    if (overrideList === 'year') {
      const year = parseInt(overrideYear, 10);
      if (!Number.isInteger(year) || year < YEAR_START || year > YEAR_END) {
        throw new Error(`TOP250_YEAR must be ${YEAR_START}-${YEAR_END}`);
      }
      return [{ list: 'year', year }];
    }
    if (!(overrideList in ZONES) && overrideList !== 'all') {
      throw new Error(`TOP250_LIST must be all|censored|uncensored|fc2|year`);
    }
    return [{ list: overrideList }];
  }

  const { month, day } = shanghaiDate();
  const monthly = ['all', 'censored', 'uncensored' /* 'western'（暂不考虑） */, 'fc2'];
  if (day >= 1 && day <= monthly.length) {
    return [{ list: monthly[day - 1] }];
  }

  const yearIndex = day - (monthly.length + 1);
  if (month % 2 === 1 && yearIndex >= 0 && YEAR_START + yearIndex <= YEAR_END) {
    return [{ list: 'year', year: YEAR_START + yearIndex }];
  }

  return [];
}

function channelLabel(channel) {
  return channel.list === 'year' ? `年度 ${channel.year}` : channel.list;
}

function buildParams(channel, page) {
  // 只传 page：App API 会把 page 和 start_rank 的偏移叠加，
  // 两个都传相当于每页跳过一整页，13 页只能拿到 130 条。
  const params = {
    page: String(page),
    limit: String(PAGE_SIZE),
    ignore_watched: 'false',
  };

  if (channel.list === 'year') {
    params.type = 'year';
    params.type_value = String(channel.year);
  } else if (channel.list === 'all') {
    params.type = 'all';
    params.type_value = 'all';
  } else {
    params.type = 'video_type';
    params.type_value = ZONES[channel.list];
  }
  return params;
}

function toItem(movie, fallbackRank) {
  const code = String(movie.number || '').trim();
  if (!code) return null;
  const rank = Number(movie.ranking ?? fallbackRank);
  return {
    code,
    title: String(movie.title || movie.origin_title || code).trim().slice(0, 300),
    cover: String(movie.cover_url || movie.thumb_url || '').trim() || undefined,
    rank: Number.isFinite(rank) && rank > 0 ? Math.floor(rank) : fallbackRank,
    score: typeof movie.score === 'string' || typeof movie.score === 'number'
      ? movie.score
      : (typeof movie.rating === 'string' || typeof movie.rating === 'number' ? movie.rating : undefined),
    url: movie.id ? `https://javdb.com/v/${movie.id}` : undefined,
  };
}

async function fetchChannel(channel) {
  const items = [];
  const seen = new Set();
  let pagesFetched = 0;
  let page = 1;

  while (page <= PAGES && items.length < MAX_ITEMS) {
    const data = await authorized('/api/v1/movies/top', { params: buildParams(channel, page) });
    const movies = Array.isArray(data.movies) ? data.movies : [];
    pagesFetched += 1;

    for (let i = 0; i < movies.length && items.length < MAX_ITEMS; i++) {
      const item = toItem(movies[i], (page - 1) * PAGE_SIZE + i + 1);
      if (!item || seen.has(item.code)) continue;
      seen.add(item.code);
      items.push(item);
    }

    console.log(
      `${channelLabel(channel)} page ${page}/${PAGES}: ${movies.length} movies, total ${items.length}`
    );

    if (movies.length < PAGE_SIZE) break;
    if (page % BATCH_SIZE === 0 && page < PAGES) {
      console.log(`  batch finished, waiting ${BATCH_DELAY_MS / 1000}s...`);
      await sleep(BATCH_DELAY_MS);
    }
    page += 1;
  }

  if (pagesFetched === 0) throw new Error('no page fetched');
  if (process.env.TOP250_DEBUG === '1' && items[0]) {
    console.log('sample item:', JSON.stringify(items[0]));
  }
  return items;
}

async function importChannel(channel, items) {
  const payload = {
    source: 'javdb',
    period: channel.list === 'year' ? 'yearly' : 'top250',
    section: channel.list === 'year' ? 'all' : channel.list,
    ...(channel.list === 'year' ? { year: channel.year } : {}),
    fetchedAt: Date.now(),
    items,
  };

  const response = await fetch(IMPORT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-rankings-secret': IMPORT_SECRET,
      'user-agent': 'Atlas-Top250-Sync/1.0',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`import failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  return text;
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    console.error('Missing JAVDB_USERNAME or JAVDB_PASSWORD');
    process.exit(1);
  }
  if (!IMPORT_URL || !IMPORT_SECRET) {
    console.error('Missing ATLAS_RANKING_IMPORT_URL or RANKINGS_IMPORT_SECRET');
    process.exit(1);
  }

  const channels = dueChannels();
  if (channels.length === 0) {
    console.log('No TOP250 channel due today.');
    return;
  }

  console.log(`TOP250 channels due: ${channels.map(channelLabel).join(', ')}`);
  await login();
  console.log(`JavDB login ok (${HOSTS[hostIndex % HOSTS.length]}).`);

  let failed = 0;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    try {
      const items = await fetchChannel(channel);
      if (items.length === 0) throw new Error('empty result');
      const result = await importChannel(channel, items);
      console.log(`${channelLabel(channel)} imported: ${result.slice(0, 300)}`);
    } catch (err) {
      failed += 1;
      console.error(`${channelLabel(channel)} failed: ${err.message}`);
    }

    if (i + 1 < channels.length) {
      console.log(`Waiting ${CHANNEL_DELAY_MS / 1000}s before next channel...`);
      await sleep(CHANNEL_DELAY_MS);
    }
  }

  if (failed > 0) {
    console.error(`${failed} TOP250 channel(s) failed`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('TOP250 sync failed:', err);
  process.exit(1);
});
