/**
 * JAV 榜单路由 — 仅 JavBus
 * 4 个维度：有码精选 / 无码精选 / 随机类别(10) / 随机女优(10)
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { authMiddleware } from '@/middleware';

export const javRoutes = new Hono<{ Bindings: Env }>();

javRoutes.use('*', authMiddleware);

// ─────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────

interface JavItem {
  code: string;
  title: string;
  cover?: string;
  date?: string;
  actress?: string;
  source: string;
}

interface GroupRanking {
  name: string;   // 类别名 或 女优名
  key: string;    // slug（genre/xx 或 star/xx 的末段）
  items: JavItem[];
}

interface RankingsResponse {
  censored: JavItem[];          // 有码精选（前3页随机20）
  uncensored: JavItem[];        // 无码精选（前3页随机20）
  hd: JavItem[];                // 高清（/genre/hd 前3页随机20）
  subtitle: JavItem[];          // 字幕（/genre/sub 前3页随机20）
  genres: GroupRanking[];       // 随机10类别
  actresses: GroupRanking[];    // 随机10女优
  suggestions: string[];
  fetchedAt: number;
  sources: string[];
}

// ─────────────────────────────────────────────
// 请求工具
// ─────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.javbus.com/',
};

async function get(url: string, timeoutMs = 10000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function normalizeCode(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s/g, '');
  if (/^[A-Z]+-\d+$/.test(s)) return s;
  const m = s.match(/^([A-Z]+)(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : s;
}

function isValidCode(code: string): boolean {
  return /^[A-Z]{2,8}-\d{2,6}$/.test(code);
}

function dedup(items: JavItem[]): JavItem[] {
  const seen = new Set<string>();
  return items.filter(i => { if (seen.has(i.code)) return false; seen.add(i.code); return true; });
}

/** Fisher-Yates 随机洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从数组随机取 n 个 */
function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

// ─────────────────────────────────────────────
// JavBus 网格解析（通用）
// ─────────────────────────────────────────────

function parseGrid(html: string, source: string): JavItem[] {
  if (!html) return [];
  const items: JavItem[] = [];
  // 截取 waterfall 区域
  const wi = html.indexOf('id="waterfall"');
  const section = wi !== -1 ? html.slice(wi, wi + 60000) : html;

  const re = /<a[^>]+class="movie-box"[^>]*href="[^"]+"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null && items.length < 30) {
    const block = m[1];
    const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
    const cover = imgM ? imgM[1] : undefined;

    const codeM =
      block.match(/<span[^>]*class="[^"]*id[^"]*"[^>]*>([^<]+)<\/span>/i) ||
      block.match(/<date[^>]*>([A-Za-z0-9]+-\d+)<\/date>/i) ||
      block.match(/>([A-Z]{2,8}-\d{2,6})</);
    if (!codeM) continue;
    const code = normalizeCode(codeM[1].trim());
    if (!isValidCode(code)) continue;

    const titleM = block.match(/title="([^"]+)"/i);
    const title = titleM ? titleM[1].trim() : code;

    const dateM = block.match(/<date[^>]*>(\d{4}-\d{2}-\d{2})<\/date>/i);
    const date = dateM ? dateM[1] : undefined;

    items.push({ code, title, cover, date, source });
  }
  return items;
}

// ─────────────────────────────────────────────
// 有码精选：前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchCensored(): Promise<JavItem[]> {
  const pages = ['https://www.javbus.com/', 'https://www.javbus.com/page/2', 'https://www.javbus.com/page/3'];
  const results = await Promise.allSettled(pages.map(u => get(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-p${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 无码精选：前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchUncensored(): Promise<JavItem[]> {
  const pages = [
    'https://www.javbus.com/uncensored/',
    'https://www.javbus.com/uncensored/page/2',
    'https://www.javbus.com/uncensored/page/3',
  ];
  const results = await Promise.allSettled(pages.map(u => get(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-u${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 高清：/genre/hd 前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchHD(): Promise<JavItem[]> {
  const pages = [
    'https://www.javbus.com/genre/hd',
    'https://www.javbus.com/genre/hd/2',
    'https://www.javbus.com/genre/hd/3',
  ];
  const results = await Promise.allSettled(pages.map(u => get(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-hd${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 字幕：/genre/sub 前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchSubtitle(): Promise<JavItem[]> {
  const pages = [
    'https://www.javbus.com/genre/sub',
    'https://www.javbus.com/genre/sub/2',
    'https://www.javbus.com/genre/sub/3',
  ];
  const results = await Promise.allSettled(pages.map(u => get(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-sub${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 随机类别：抓 /genre 页 → 解析所有类别 → 随机取10 → 各抓首页
// ─────────────────────────────────────────────

interface Entry { key: string; name: string; }

async function fetchGenreList(): Promise<Entry[]> {
  const html = await get('https://www.javbus.com/genre');
  if (!html) return [];
  const entries: Entry[] = [];
  const re = /href="https?:\/\/www\.javbus\.com\/genre\/([a-z0-9]+)"[^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].trim();
    const name = m[2].trim();
    if (/^\d+$/.test(key) || name.length < 1) continue;
    entries.push({ key, name });
  }
  return entries;
}

// 兜底类别列表（/genre 页无法访问时使用）
const FALLBACK_GENRES: Entry[] = [
  { key: 'rq', name: '巨乳' }, { key: 'we', name: '护士' }, { key: 'dp', name: '女学生' },
  { key: '2e', name: '角色扮演' }, { key: 'do', name: 'OL' }, { key: 'sm', name: '近亲' },
  { key: 'e',  name: '中出' },   { key: 'q',  name: '美少女' }, { key: '28', name: '高清' },
  { key: '2f', name: '4K' },     { key: 'zs', name: '女同' },   { key: 'zr', name: '素人' },
];

async function fetchRandomGenres(): Promise<GroupRanking[]> {
  const list = await fetchGenreList();
  const pool = list.length >= 10 ? list : FALLBACK_GENRES;
  const picked = sample(pool, 10);

  const results = await Promise.allSettled(
    picked.map(g => get(`https://www.javbus.com/genre/${g.key}`))
  );

  return picked
    .map((g, i) => ({
      name: g.name,
      key: g.key,
      items: results[i].status === 'fulfilled'
        ? sample(parseGrid(results[i].value, `javbus-g-${g.key}`), 12)
        : [],
    }))
    .filter(g => g.items.length > 0);
}

// ─────────────────────────────────────────────
// 随机女优：抓 /actresses → 解析女优列表 → 随机取10 → 各抓 /star/xx 首页
// ─────────────────────────────────────────────

async function fetchActressList(): Promise<Entry[]> {
  const html = await get('https://www.javbus.com/actresses');
  if (!html) return [];
  const entries: Entry[] = [];
  // <a href="https://www.javbus.com/star/okq">苍井空</a> 或带 avatar 的结构
  const re = /href="https?:\/\/www\.javbus\.com\/star\/([a-z0-9]+)"[^>]*>\s*(?:<img[^>]*>)?\s*<span[^>]*>([^<]+)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].trim();
    const name = m[2].trim();
    if (!key || name.length < 1) continue;
    entries.push({ key, name });
  }

  // fallback: 更宽松的匹配（纯文本链接）
  if (entries.length < 5) {
    const re2 = /href="https?:\/\/www\.javbus\.com\/star\/([a-z0-9]+)"[^>]*>([^<]{1,20})<\/a>/gi;
    while ((m = re2.exec(html)) !== null) {
      const key = m[1].trim();
      const name = m[2].trim();
      if (!key || name.length < 1 || entries.find(e => e.key === key)) continue;
      entries.push({ key, name });
    }
  }

  return entries;
}

// 兜底女优列表
const FALLBACK_ACTRESSES: Entry[] = [
  { key: '2xi', name: '三上悠亜' }, { key: 'okq', name: '苍井空' },
  { key: '2pv', name: '深田咏美' }, { key: 'jmd', name: '明日花绮罗' },
  { key: 'pix', name: '波多野结衣' }, { key: 'lhm', name: '天使もえ' },
  { key: 'qhd', name: '桃乃木香奈' }, { key: 'zld', name: '椎名空' },
  { key: 'nns', name: '上原亚衣' }, { key: 'rki', name: '水野朝阳' },
  { key: 'sqt', name: '小仓由菜' }, { key: 'hgp', name: '铃村あいり' },
];

async function fetchRandomActresses(): Promise<GroupRanking[]> {
  const list = await fetchActressList();
  const pool = list.length >= 10 ? list : FALLBACK_ACTRESSES;
  const picked = sample(pool, 10);

  const results = await Promise.allSettled(
    picked.map(a => get(`https://www.javbus.com/star/${a.key}`))
  );

  return picked
    .map((a, i) => ({
      name: a.name,
      key: a.key,
      items: results[i].status === 'fulfilled'
        ? sample(parseGrid(results[i].value, `javbus-star-${a.key}`), 12)
        : [],
    }))
    .filter(a => a.items.length > 0);
}

// ─────────────────────────────────────────────
// 主路由
// ─────────────────────────────────────────────

javRoutes.get('/rankings', async (c) => {
  try {
    // 六路并发：有码、无码、高清、字幕、类别列表+抓取、女优列表+抓取
    const [r_censored, r_uncensored, r_hd, r_subtitle, r_genres, r_actresses] = await Promise.allSettled([
      fetchCensored(),
      fetchUncensored(),
      fetchHD(),
      fetchSubtitle(),
      fetchRandomGenres(),
      fetchRandomActresses(),
    ]);

    const g = <T>(r: PromiseSettledResult<T>, fb: T): T =>
      r.status === 'fulfilled' ? r.value : fb;

    const censored   = g(r_censored, []);
    const uncensored = g(r_uncensored, []);
    const hd         = g(r_hd, []);
    const subtitle   = g(r_subtitle, []);
    const genres     = g(r_genres, []);
    const actresses  = g(r_actresses, []);

    const suggestions = dedup([...censored, ...uncensored, ...hd])
      .map(i => i.code).filter(isValidCode).slice(0, 30);

    const sources: string[] = [];
    if (censored.length > 0)   sources.push('JavBus');
    if (uncensored.length > 0) sources.push('JavBus(无码)');
    if (hd.length > 0)         sources.push('JavBus(高清)');

    const response: RankingsResponse = {
      censored, uncensored, hd, subtitle, genres, actresses, suggestions,
      fetchedAt: Date.now(), sources,
    };

    return c.json({ success: true, data: response });
  } catch (err) {
    console.error('JAV rankings error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取榜单失败' } }, 500);
  }
});

// suggestions 接口（轻量）
javRoutes.get('/suggestions', async (c) => {
  const keyword = (c.req.query('keyword') || '').toUpperCase().trim();
  if (!keyword) return c.json({ success: true, data: [] });
  try {
    const html = await get('https://www.javbus.com/');
    const matched = parseGrid(html, 'javbus')
      .map(i => i.code)
      .filter(code => code.startsWith(keyword) || code.includes(keyword))
      .slice(0, 10);
    return c.json({ success: true, data: matched });
  } catch {
    return c.json({ success: true, data: [] });
  }
});

// =====================================================================
// 详情页 + 磁力链接提取
// =====================================================================

interface MagnetItem {
  name: string;
  size: string;
  date: string;
  magnet: string;      // magnet:?xt= 完整链接
  isHD: boolean;
}

interface JavDetail {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  duration?: string;
  director?: string;
  maker?: string;
  publisher?: string;
  series?: string;
  tags: string[];
  actresses: string[];
  magnets: MagnetItem[];
  detailUrl: string;
}

/** 从详情页 HTML 提取 gid / uc（磁力 Ajax 必需参数） */
function extractGidUc(html: string): { gid: string; uc: string } | null {
  // JavBus 页面内嵌：var gid = 12345; var uc = 0;
  const gidM = html.match(/var\s+gid\s*=\s*(\d+)/);
  const ucM  = html.match(/var\s+uc\s*=\s*(\d+)/);
  if (gidM && ucM) return { gid: gidM[1], uc: ucM[1] };
  return null;
}

/** 解析磁力 Ajax 响应 HTML */
function parseMagnets(html: string): MagnetItem[] {
  if (!html) return [];
  const items: MagnetItem[] = [];
  // 每条磁力是一个 <tr>
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const rowHtml = row[1];
    // 磁力链接
    const magnetM = rowHtml.match(/href="(magnet:\?xt=[^"]+)"/i);
    if (!magnetM) continue;
    const magnet = magnetM[1];
    // 名称（第一个 <td> 的文本）
    const nameM = rowHtml.match(/<td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const name = nameM ? nameM[1].trim() : '';
    // 文件大小
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(rowHtml)) !== null) {
      cells.push(cell[1].replace(/<[^>]+>/g, '').trim());
    }
    const size = cells[1] ?? '';
    const date = cells[2] ?? '';
    const isHD = /hd|1080|720/i.test(name) || rowHtml.includes('btn-primary');
    items.push({ name: name || '未知', size, date, magnet, isHD });
  }
  return items;
}

/** 解析详情页主体信息 */
function parseDetail(html: string, code: string, detailUrl: string): Omit<JavDetail, 'magnets'> {
  // 标题
  const titleM = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) ||
                 html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : code;
  const title = rawTitle.replace(/\s*-\s*JavBus\s*$/i, '').trim();

  // 封面
  const coverM = html.match(/bigImage[^>]*href="([^"]+)"/i) ||
                 html.match(/<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/i);
  const cover = coverM ? coverM[1] : undefined;

  // 信息提取辅助
  const infoField = (label: string): string | undefined => {
    const re = new RegExp(label + '[^:：]*[:：]\\s*<[^>]+>([^<]+)<', 'i');
    const m = html.match(re);
    if (m) return m[1].trim();
    // 纯文本行
    const re2 = new RegExp(label + '[^:：]*[:：]\\s*([^<\\n]+)', 'i');
    const m2 = html.match(re2);
    return m2 ? m2[1].trim() : undefined;
  };

  const releaseDate = infoField('發行日期') ?? infoField('发行日期') ?? infoField('Release Date');
  const duration    = infoField('長度') ?? infoField('长度') ?? infoField('Length');
  const director    = infoField('導演') ?? infoField('导演') ?? infoField('Director');
  const maker       = infoField('製作商') ?? infoField('制作商') ?? infoField('Studio');
  const publisher   = infoField('發行商') ?? infoField('发行商') ?? infoField('Label');
  const series      = infoField('系列') ?? infoField('Series');

  // 类别标签
  const tags: string[] = [];
  const tagSection = html.match(/class="genre"[\s\S]{0,5000}/i)?.[0] ?? '';
  const tagRe = /<a[^>]+href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let tagM: RegExpExecArray | null;
  while ((tagM = tagRe.exec(tagSection)) !== null) {
    const t = tagM[1].trim();
    if (t) tags.push(t);
  }

  // 演员
  const actresses: string[] = [];
  const starRe = /<a[^>]+href="[^"]*\/star\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let starM: RegExpExecArray | null;
  while ((starM = starRe.exec(html)) !== null) {
    const name = starM[1].trim();
    if (name && name.length < 30) actresses.push(name);
  }

  return { code, title, cover, releaseDate, duration, director, maker, publisher, series, tags, actresses, detailUrl };
}

javRoutes.get('/detail', async (c) => {
  const code = (c.req.query('code') ?? '').trim().toUpperCase();
  if (!code || !/^[A-Z]+-\d+$/.test(code) && !/^[A-Z0-9]+-?\d+$/.test(code)) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: '无效的番号格式' } }, 400);
  }

  const detailUrl = `https://www.javbus.com/${code}`;

  try {
    // Step 1：抓详情页
    const html = await get(detailUrl, 15000);
    if (!html || html.length < 500) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '未找到该番号' } }, 404);
    }

    // Step 2：提取基本信息
    const detail = parseDetail(html, code, detailUrl);

    // Step 3：提取 gid/uc 并请求磁力 Ajax
    let magnets: MagnetItem[] = [];
    const gidUc = extractGidUc(html);
    if (gidUc) {
      const magnetUrl = `https://www.javbus.com/ajax/uncledatoolsbyajax.php?lang=zh&gid=${gidUc.gid}&uc=${gidUc.uc}&floor=${Date.now()}`;
      const magnetHtml = await get(magnetUrl, 12000);
      magnets = parseMagnets(magnetHtml);
    }

    return c.json({ success: true, data: { ...detail, magnets } });
  } catch (err) {
    console.error('JAV detail error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取详情失败' } }, 500);
  }
});

// =====================================================================
// 真实种子文件代理下载
// GET /api/jav/torrent/:hash
// 从 itorrents.org 获取真实 .torrent 文件并代理返回
// =====================================================================

javRoutes.get('/torrent/:hash', async (c) => {
  const raw = c.req.param('hash').trim();
  // 支持 40位hex 或 32位base32
  const isHex = /^[a-fA-F0-9]{40}$/.test(raw);
  const isBase32 = /^[a-zA-Z2-7]{32}$/.test(raw);
  if (!isHex && !isBase32) {
    return c.json({ success: false, error: { code: 'INVALID_HASH', message: '无效的 info hash' } }, 400);
  }

  // 统一转为大写hex
  const hash = isHex ? raw.toUpperCase() : base32ToHexPublic(raw).toUpperCase();

  // itorrents.org 是目前最稳定的公共种子缓存服务
  const sources = [
    `https://itorrents.org/torrent/${hash}.torrent`,
    `https://torrage.info/torrent.php?h=${hash}`,
  ];

  for (const url of sources) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': HEADERS['User-Agent'] },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const ct = resp.headers.get('content-type') ?? '';
      // 确认拿到的是种子，不是HTML错误页
      if (!ct.includes('bittorrent') && !ct.includes('octet-stream')) continue;

      const data = await resp.arrayBuffer();
      return new Response(data, {
        headers: {
          'Content-Type': 'application/x-bittorrent',
          'Content-Disposition': `attachment; filename="${hash}.torrent"`,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch {
      continue;
    }
  }

  return c.json({ success: false, error: { code: 'NOT_FOUND', message: '未找到该种子文件，请改用磁力链接' } }, 404);
});

// base32→hex（供路由内部使用）
function base32ToHexPublic(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    hex += parseInt(bits.slice(i, i + 8), 2).toString(16).padStart(2, '0');
  }
  return hex;
}
