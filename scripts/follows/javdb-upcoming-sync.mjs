/**
 * 关注动态「即将发售」同步（GitHub Actions）
 *
 * 流程：
 *   1. 从 Atlas 内部接口取本轮需要刷新的关注对象（按最后尝试时间轮转）；
 *   2. 登录 JavDB App API，按名称解析实体 ID（结果会回传缓存）；
 *   3. 拉取该实体的作品列表，只保留发售日为今天及以后的条目；
 *   4. 回传快照，由 Worker 写入 follow_upcoming。
 *
 * 限流：单轮最多 20 个对象，按 5 个一批执行，批间等待 10 秒；
 * 批内串行请求，每次至少间隔 3 秒并带随机抖动；失败指数退避，避免触发封禁。
 *
 * 环境变量：
 *   ATLAS_RANKING_IMPORT_URL  已有榜单导入地址，用于推导站点 origin
 *   RANKINGS_IMPORT_SECRET    已有内部同步密钥
 *   JAVDB_USERNAME / JAVDB_PASSWORD
 *   可选：JAVDB_API_HOSTS（逗号分隔）、UPCOMING_TARGET_LIMIT
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const SIGN_PREFIX = '71cf27bb3c0bcdf207b64abecddc970098c7421ee7203b9cdae54478478a199e7d5a6e1a57691123c1a931c057842fb73ba3b3c83bcd69c17ccf174081e3d8aa';
const SIGN_SUFFIX = 'lpw6vgqzsp';
const APP_VERSION = '1.9.35';
const APP_VERSION_NUMBER = '10935';
const DEFAULT_HOSTS = ['https://jdforrepam.com', 'https://apidd.czssdgz.com', 'https://apidd.spthgb.com'];

const REQUEST_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const GROUP_SIZE = 5;
const GROUP_DELAY_MS = 10_000;

const API_ORIGIN = (() => {
  const raw = process.env.ATLAS_RANKING_IMPORT_URL || '';
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();
const INTERNAL_SECRET = process.env.RANKINGS_IMPORT_SECRET || '';
const USERNAME = process.env.JAVDB_USERNAME || '';
const PASSWORD = process.env.JAVDB_PASSWORD || '';
const HOSTS = (process.env.JAVDB_API_HOSTS || DEFAULT_HOSTS.join(','))
  .split(',')
  .map((host) => host.trim().replace(/\/$/, ''))
  .filter(Boolean);
const TARGET_LIMIT = Math.min(20, Math.max(1, parseInt(process.env.UPCOMING_TARGET_LIMIT || '20', 10) || 20));

const DEVICE_UUID = crypto.randomUUID();
let hostIndex = 0;
let token = '';
let lastRequestAt = 0;

const TYPE_MAP = {
  actress: { searchType: 'actor', listKey: 'actors', letter: 'a', detail: 'actors' },
  director: { searchType: 'director', listKey: 'directors', letter: 'd', detail: 'directors' },
  studio: { searchType: 'maker', listKey: 'makers', letter: 'm', detail: 'makers' },
  series: { searchType: 'series', listKey: 'series', letter: 's', detail: 'series' },
};

/** 实体详情缓存：同一次运行内同一候选不重复请求 */
const detailCache = new Map();
/** 单轮详情请求上限：防止一次运行对 JavDB 产生突发请求 */
const DETAIL_REQUEST_LIMIT = 40;
let detailRequestsLeft = DETAIL_REQUEST_LIMIT;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shanghaiDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·・.\-_/（）()【】\[\]]+/g, '');
}

/** 去括号注释、去“系列/シリーズ”后缀等常见差异，供搜索和比对使用 */
function nameVariants(value) {
  const text = String(value || '').normalize('NFKC').trim();
  if (!text) return [];
  const variants = new Set();
  const add = (raw) => {
    const normalized = normalizeName(raw);
    if (normalized) variants.add(normalized);
  };
  const noBrackets = text.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ' ').trim();
  const noSuffix = (raw) => raw.replace(/(系列|シリーズ|series)$/i, '').trim();
  add(text);
  add(noBrackets);
  add(noSuffix(text));
  add(noSuffix(noBrackets));
  // 别名写法：A / B、A, B、A、B
  for (const part of text.split(/[\/,、;；|]+/)) add(part);
  return [...variants];
}

function bigrams(value) {
  const set = new Set();
  for (let i = 0; i < value.length - 1; i++) set.add(value.slice(i, i + 2));
  return set;
}

/** 名称相似度：完全一致 1；包含关系给高分；其余用二元组 Dice 系数 */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) {
    return 0.5 + 0.45 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
  }
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (!ga.size || !gb.size) return 0;
  let shared = 0;
  for (const gram of ga) if (gb.has(gram)) shared++;
  return (2 * shared) / (ga.size + gb.size);
}

/** 收集搜索结果的候选名称（JavDB 不同接口/语言返回 name、name_zht、aliases） */
function candidateNames(item) {
  const names = [];
  for (const key of ['name', 'name_zht', 'alias', 'aliases', 'other_name']) {
    const value = item?.[key];
    if (typeof value === 'string') names.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === 'string') names.push(entry);
    }
  }
  return names.filter(Boolean);
}

function candidateLabel(item) {
  return `${candidateNames(item)[0] || '?'}#${item?.id ?? '?'}`;
}

function describeCandidates(items, max = 3) {
  return items.slice(0, max).map(candidateLabel).join(' | ');
}

/**
 * 只用搜索结果里的主名称做匹配：精确优先，其次近似且明显领先。
 * 无法判断时返回 null，交给详情接口的别名比对，绝不按相关度猜人。
 */
function itemNameSets(item) {
  const primary = new Set();
  const aliases = new Set();
  for (const raw of [item?.name, item?.name_zht]) {
    for (const variant of nameVariants(raw)) primary.add(variant);
  }
  for (const raw of [item?.other_name, item?.alias, item?.aliases]) {
    for (const part of splitNameList(raw)) {
      for (const variant of nameVariants(part)) aliases.add(variant);
    }
  }
  return { primary, aliases };
}

function pickEntity(items, targetName) {
  const valid = items.filter((item) => item?.id);
  if (valid.length === 0) return null;
  const wanted = nameVariants(targetName);
  const scored = valid
    .map((item) => {
      const { primary, aliases } = itemNameSets(item);
      let score = 0;
      let kind = '';
      for (const want of wanted) {
        for (const candidate of primary) {
          const value = nameSimilarity(want, candidate);
          if (value > score) { score = value; kind = 'primary'; }
        }
        for (const candidate of aliases) {
          // 别名命中略低于同名主条目，避免「同名演员 vs 被合并条目」选错
          const value = nameSimilarity(want, candidate) * 0.97;
          if (value > score) { score = value; kind = 'alias'; }
        }
      }
      return { item, score, kind };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const runnerUp = scored[1];
  if (top.score >= 0.999) return { item: top.item, method: 'exact' };
  if (top.kind === 'alias' && top.score >= 0.96) return { item: top.item, method: 'alias' };
  if (top.score >= 0.7 && (!runnerUp || top.score - runnerUp.score >= 0.08)) {
    return { item: top.item, method: top.kind === 'alias' ? 'alias' : 'fuzzy' };
  }
  return null;
}

function splitNameList(value) {
  if (typeof value === 'string') {
    return value.split(/[,，、;；|]+/).map((part) => part.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value.filter((part) => typeof part === 'string');
  return [];
}

/** 详情里的主名称与别名（other_name 是逗号分隔串） */
function detailNameSets(detail) {
  const primary = new Set();
  const aliases = new Set();
  for (const raw of [detail?.name, detail?.name_zht]) {
    for (const variant of nameVariants(raw)) primary.add(variant);
  }
  for (const raw of [detail?.other_name, detail?.alias, detail?.aliases]) {
    for (const part of splitNameList(raw)) {
      for (const variant of nameVariants(part)) aliases.add(variant);
    }
  }
  return { primary, aliases };
}

/** 只保留汉字，用于候选预筛，避免假名/拉丁字母造成大量无关候选 */
function cjkChars(value) {
  return new Set(String(value || '').match(/[\u3400-\u9FFF]/g) || []);
}

async function fetchEntityDetail(mapping, id) {
  const cacheKey = `${mapping.detail}:${id}`;
  if (detailCache.has(cacheKey)) return detailCache.get(cacheKey);
  const payload = await authorized(`/api/v1/${mapping.detail}/${id}`);
  const detail = payload?.actor || payload?.director || payload?.maker || payload?.series || payload;
  const value = detail && typeof detail === 'object' ? detail : {};
  detailCache.set(cacheKey, value);
  return value;
}

/**
 * 用实体详情里的 name / name_zht / other_name 做别名比对。
 * 主名称精确命中优先于别名精确命中（JavDB 存在「同名演员 + 被合并的别名」两条记录）；
 * 别名精确命中可解决「日文名 → 中文名」「旧艺名 → 新艺名」这类搜索主名称对不上的情况。
 */
async function matchEntityDetails(mapping, items, targetName, maxCandidates = 8) {
  const wanted = nameVariants(targetName);
  const targetCjk = cjkChars(targetName);
  const pool = items.length > 6
    ? items.filter((item) => {
        const itemCjk = cjkChars(candidateNames(item).join(''));
        for (const char of itemCjk) if (targetCjk.has(char)) return true;
        return false;
      })
    : items;
  const limit = Math.min(pool.length, maxCandidates);
  let best = null;

  for (let i = 0; i < limit; i++) {
    const item = pool[i];
    if (!item?.id) continue;
    if (!detailCache.has(`${mapping.detail}:${item.id}`)) {
      if (detailRequestsLeft <= 0) {
        console.warn('detail request budget exhausted, stop resolving by alias');
        break;
      }
      detailRequestsLeft--;
    }
    let detail;
    try {
      detail = await fetchEntityDetail(mapping, item.id);
    } catch (err) {
      console.warn(`detail ${item.id} failed: ${err?.message || err}`);
      continue;
    }
    const { primary, aliases } = detailNameSets(detail);
    let score = 0;
    let kind = '';
    for (const want of wanted) {
      for (const candidate of primary) {
        const value = nameSimilarity(want, candidate);
        if (value > score) { score = value; kind = 'primary'; }
      }
      for (const candidate of aliases) {
        const value = nameSimilarity(want, candidate) * 0.97;
        if (value > score) { score = value; kind = 'alias'; }
      }
    }

    if (kind === 'primary' && score >= 0.999) {
      return { item, detail, method: 'detail-exact' };
    }
    if (score >= 0.9 && (!best || score > best.score)) {
      best = {
        item,
        detail,
        score,
        method: kind === 'alias' ? 'detail-alias' : 'detail-fuzzy',
      };
    }
  }

  if (!best) return null;
  const { score, ...rest } = best;
  return rest;
}

/**
 * 搜索词候选：原始名 → 去括号名 → 截断名。
 * JavDB 对超长系列名经常搜不到（如 40+ 字的日文标题），
 * 截断到 18/12 字可命中，再用完整名比对结果，避免误选。
 */
function queryVariants(value) {
  const text = String(value || '').normalize('NFKC').trim();
  if (!text) return [];
  const stripped = text.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ' ').trim();
  const chars = [...(stripped || text)];
  const variants = [{ keyword: text, truncated: false }];
  if (stripped && stripped !== text) variants.push({ keyword: stripped, truncated: false });
  for (const size of [18, 12]) {
    if (chars.length > size) variants.push({ keyword: chars.slice(0, size).join(''), truncated: true });
  }
  const seen = new Set();
  return variants.filter((item) => {
    if (!item.keyword || seen.has(item.keyword)) return false;
    seen.add(item.keyword);
    return true;
  });
}

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

/** 串行限速：所有 JavDB 请求共享同一间隔，避免瞬时并发 */
async function pace() {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS + Math.random() * 500 - Date.now();
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

/** 带一次重新登录的 API 调用 */
async function authorized(path, options) {
  if (!token) await login();
  let payload = await javdbRequest(path, options);
  if (isAuthError(payload)) {
    await login();
    payload = await javdbRequest(path, options);
  }
  if (!payload?.success) {
    throw new Error(`${payload?.action || 'API_ERROR'}: ${payload?.message || 'request failed'}`);
  }
  return payload.data || {};
}

async function searchEntities(target, mapping, keyword) {
  const data = await authorized('/api/v2/search', {
    params: { q: keyword, type: mapping.searchType, page: 1 },
  });
  return Array.isArray(data[mapping.listKey]) ? data[mapping.listKey] : [];
}

/** 解析关注对象在 JavDB 的实体 ID；返回命中的名称与匹配方式用于日志核对 */
async function resolveEntity(target) {
  const mapping = TYPE_MAP[target.entityType];
  if (!mapping) throw new Error(`UNSUPPORTED_TYPE: ${target.entityType}`);

  if (target.javdbEntityId) {
    return { id: String(target.javdbEntityId), name: target.name, method: 'cached' };
  }

  let items = [];
  let query = '';
  let lastCandidates = '';
  for (const candidate of queryVariants(target.name)) {
    query = candidate.keyword;
    items = await searchEntities(target, mapping, query);
    if (items.length === 0) continue;
    lastCandidates = describeCandidates(items);

    const picked = pickEntity(items, target.name);
    if (picked) {
      return {
        id: String(picked.item.id),
        name: candidateNames(picked.item)[0] || target.name,
        method: candidate.truncated ? `${picked.method}-truncated` : picked.method,
        query,
        candidateCount: items.length,
      };
    }

    const detailed = await matchEntityDetails(mapping, items, target.name, 8);
    if (detailed) {
      return {
        id: String(detailed.item.id),
        name: detailed.detail?.name || candidateNames(detailed.item)[0] || target.name,
        method: detailed.method,
        query,
        candidateCount: items.length,
      };
    }
  }

  // 系列名在 JavDB 的实体搜索里偶尔搜不到，退回全类型搜索再取 series 维度
  if (target.entityType === 'series') {
    const data = await authorized('/api/v2/search', { params: { q: query || target.name, page: 1 } });
    items = Array.isArray(data.series) ? data.series : [];
    lastCandidates = describeCandidates(items);
    const picked = pickEntity(items, target.name);
    if (picked) {
      return {
        id: String(picked.item.id),
        name: candidateNames(picked.item)[0] || target.name,
        method: picked.method,
        query: `${target.name} (all)`,
        candidateCount: items.length,
      };
    }
  }

  const reason = [...String(target.name || '').trim()].length < 2 ? '; reason=NAME_TOO_SHORT' : '';
  throw new Error(
    `ENTITY_NOT_FOUND (q=${query}${reason}; candidates=${lastCandidates || 'none'})`
  );
}

async function fetchUpcoming(target, entityId) {
  const mapping = TYPE_MAP[target.entityType];
  if (!mapping) return [];
  const zone = String(target.entityKey || '').startsWith('uncensored/') ? 1 : 0;
  const data = await authorized('/api/v1/movies/tags', {
    params: {
      filter_by: `${zone}:${mapping.letter}:${entityId}`,
      sort_by: 'release',
      order_by: 'desc',
      page: 1,
      limit: 30,
    },
  });
  const movies = Array.isArray(data.movies) ? data.movies : [];
  const today = shanghaiDate();

  return movies
    .map((movie) => {
      const code = String(movie.number || '').trim();
      const releaseDate = String(movie.release_date || '').trim();
      const cover = String(movie.cover_url || movie.thumb_url || '').trim();
      return {
        code,
        title: String(movie.title || movie.origin_title || code).trim(),
        cover: cover || undefined,
        releaseDate,
      };
    })
    .filter((movie) => (
      movie.code
      && /^\d{4}-\d{2}-\d{2}$/.test(movie.releaseDate)
      && movie.releaseDate >= today
    ));
}

async function atlasRequest(path, init = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-rankings-secret': INTERNAL_SECRET,
      'user-agent': 'Atlas-Follow-Sync/1.0',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Atlas API HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const payload = await readJson(response);
  if (!payload.success) {
    throw new Error(`Atlas API: ${payload.error?.code || 'ERROR'} ${payload.error?.message || ''}`);
  }
  return payload.data;
}

async function postImport(targets) {
  const body = JSON.stringify({ fetchedAt: Date.now(), targets });
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await atlasRequest('/api/internal/follows/upcoming/import', { method: 'POST', body });
    } catch (err) {
      lastError = err;
      if (attempt === 0) await sleep(5_000);
    }
  }
  throw lastError;
}

async function main() {
  if (!API_ORIGIN || !INTERNAL_SECRET) {
    console.error('Missing ATLAS_RANKING_IMPORT_URL or RANKINGS_IMPORT_SECRET');
    process.exit(1);
  }
  if (!USERNAME || !PASSWORD) {
    console.error('Missing JAVDB_USERNAME or JAVDB_PASSWORD');
    process.exit(1);
  }

  const data = await atlasRequest(`/api/internal/follows/upcoming/targets?limit=${TARGET_LIMIT}`);
  const targets = Array.isArray(data.targets) ? data.targets : [];
  if (targets.length === 0) {
    console.log('No followed targets due for upcoming sync.');
    return;
  }

  console.log(`Syncing ${targets.length} followed target(s).`);
  await login();
  console.log(`JavDB login ok (${HOSTS[hostIndex % HOSTS.length]}).`);

  const results = [];
  let fetchedWorks = 0;

  // 20 个对象拆成 4 批，每批 5 个；批内串行限速，批间固定等待 10 秒
  for (let groupStart = 0; groupStart < targets.length; groupStart += GROUP_SIZE) {
    const group = targets.slice(groupStart, groupStart + GROUP_SIZE);
    for (const target of group) {
      try {
        let entity;
        let works;
        try {
          entity = await resolveEntity(target);
          works = await fetchUpcoming(target, entity.id);
        } catch (err) {
          // 缓存的实体 ID 可能已失效：清掉缓存重新解析一次
          if (!target.javdbEntityId) throw err;
          entity = await resolveEntity({ ...target, javdbEntityId: undefined });
          works = await fetchUpcoming(target, entity.id);
        }
        fetchedWorks += works.length;
        results.push({
          watchKey: target.watchKey,
          entityType: target.entityType,
          ok: true,
          name: target.name,
          resolvedName: entity.name,
          javdbEntityId: entity.id,
          works,
        });
        console.log(
          `${target.watchKey} (${target.name}): matched "${entity.name}" [${entity.method}] ` +
          `via "${entity.query || '-'}" -> ${works.length} upcoming work(s)`
        );
      } catch (err) {
        const error = String(err?.message || err).slice(0, 300);
        results.push({
          watchKey: target.watchKey,
          entityType: target.entityType,
          ok: false,
          name: target.name,
          error,
        });
        console.warn(`${target.watchKey} (${target.name}): failed (${error})`);
      }
    }

    if (groupStart + GROUP_SIZE < targets.length) {
      console.log(`Waiting ${GROUP_DELAY_MS / 1000}s before next group...`);
      await sleep(GROUP_DELAY_MS);
    }
  }

  const imported = await postImport(results);
  const failed = results.filter((item) => !item.ok).length;
  console.log(`Import done: works=${imported.works ?? fetchedWorks} failed=${failed}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const failures = results.filter((item) => !item.ok);
    const lines = [
      '## Follow upcoming sync',
      '',
      `- Targets: ${results.length}`,
      `- Upcoming works: ${imported.works ?? fetchedWorks}`,
      `- Failed: ${failed}`,
    ];
    if (failures.length > 0) {
      lines.push('', '### Failed targets', '');
      for (const item of failures) {
        lines.push(`- \`${item.watchKey}\` ${item.name || ''}: ${item.error || 'unknown error'}`);
      }
    }
    lines.push('');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }

  // 单个对象失败交给退避重试；只有全部失败才让 workflow 变红，避免偶发抖动刷失败记录
  if (failed === results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Upcoming sync failed:', err);
  process.exit(1);
});
