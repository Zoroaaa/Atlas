/**
 * 女优资料与作品搜索：抓取 JavBus 的 /searchstar、/star、/search 页面。
 *
 * 原 minnano-av.com 对 Worker 请求一律返回验证页，故改用 JavBus 自身数据。
 * JavBus 是日文站，中文俗称/简繁体必须先经 normalizeActressKeyword 转成日文名。
 */

import { getHtml, normalizeJavbusUrl, parseActressList, parseGrid, type JavItem } from '@/services/jav-utils';
import { normalizeActressKeyword } from '@/services/actress-name-map';
import { mapWithConcurrency } from '@/utils';

const JAVBUS_BASE = 'https://www.javbus.com';

// ── 类型 ─────────────────────────────────────────────────

export interface ActressProfile {
  /** JavBus star slug（如 2xi） */
  id: string;
  /** 显示名（日文名） */
  name: string;
  /** 生日（如 1990-08-14） */
  birthday?: string;
  /** 年龄 */
  age?: number;
  /** 身高 cm */
  height?: number;
  /** 胸围 cm */
  bust?: number;
  /** 罩杯 */
  cup?: string;
  /** 腰围 cm */
  waist?: number;
  /** 臀围 cm */
  hip?: number;
  /** 出身地 */
  prefecture?: string;
  /** 爱好 */
  hobby?: string;
  /** 头像图 URL */
  cover?: string;
  /** 详情页 URL（JavBus star 页） */
  detailUrl: string;
}

// ── 解析 ─────────────────────────────────────────────────

/** 提取数值（"163cm" → 163） */
function toInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : undefined;
}

/**
 * 解析 JavBus star 页资料块
 *
 *   <div class="avatar-box">
 *     <div class="photo-frame"><img src="/pics/actress/2xi_a.jpg" title="葵つかさ"></div>
 *     <div class="photo-info">
 *       <span class="pb10">葵つかさ</span>
 *       <p>生日: 1990-08-14</p><p>年齡: 36</p><p>身高: 163cm</p><p>罩杯: E</p>
 *       <p>胸圍: 88cm</p><p>腰圍: 58cm</p><p>臀圍: 86cm</p><p>出生地: 大阪府</p><p>愛好: ...</p>
 *     </div>
 *   </div>
 */
function parseStarProfile(
  html: string,
  entry: { key: string; name: string; cover?: string },
  detailUrl: string
): ActressProfile | null {
  if (!html || html.length < 500) return null;

  const blockM = html.match(/class="avatar-box"[\s\S]*?<\/div>\s*<\/div>/i);
  const block = blockM ? blockM[0] : html;

  const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
  const cover = imgM ? normalizeJavbusUrl(imgM[1]) : entry.cover;

  const nameM = block.match(/<span[^>]*class="[^"]*pb10[^"]*"[^>]*>([^<]+)<\/span>/i);
  const name = (nameM ? nameM[1] : entry.name).trim();
  if (!name) return null;

  // 字段：<p>标签: 值</p>（繁体/简体标签都兼容）
  const fields = new Map<string, string>();
  const pRe = /<p[^>]*>\s*([^<:：]+?)\s*[:：]\s*([^<]*?)\s*<\/p>/gi;
  let pM: RegExpExecArray | null;
  while ((pM = pRe.exec(block)) !== null) {
    fields.set(pM[1].trim(), pM[2].trim());
  }
  const field = (...labels: string[]): string | undefined => {
    for (const label of labels) {
      const v = fields.get(label);
      if (v) return v;
    }
    return undefined;
  };

  return {
    id: entry.key,
    name,
    birthday: field('生日'),
    age: toInt(field('年齡', '年龄')),
    height: toInt(field('身高')),
    bust: toInt(field('胸圍', '胸围')),
    cup: field('罩杯'),
    waist: toInt(field('腰圍', '腰围')),
    hip: toInt(field('臀圍', '臀围')),
    prefecture: field('出生地'),
    hobby: field('愛好', '爱好'),
    cover,
    detailUrl,
  };
}

// ── 主入口 ───────────────────────────────────────────────

/** 最多抓取的女优资料页数量：列表页可能命中大量同名条目，只取前 N 个。 */
const MAX_DETAIL_FETCH = 10;

/** 资料页并发与基础间隔：JavBus 对突发请求敏感，10 个页面不能一次性并发打出去 */
const DETAIL_FETCH_CONCURRENCY = 3;
const DETAIL_FETCH_GAP_MS = 120;

/**
 * 搜索女优：/searchstar/ 取列表 → 并发抓前 N 个 star 页资料块
 *
 * 抛出异常仅在「资料源不可用」时（无响应 / 返回非 JavBus 结果页），
 * 以便上层把失败透出给用户；真正「未匹配到女优」返回空数组。
 */
export async function fetchActresses(
  keyword: string,
  normalizedKeyword?: string
): Promise<ActressProfile[]> {
  if (!keyword.trim()) return [];

  const normalized = normalizedKeyword ?? normalizeActressKeyword(keyword);
  const searchUrl = `${JAVBUS_BASE}/searchstar/${encodeURIComponent(normalized)}`;
  const html = await getHtml(searchUrl, 15000);

  if (!html) throw new Error('女优资料源无响应（JavBus 连接失败）');
  if (html.length < 500 || !/id="waterfall"/.test(html)) {
    throw new Error('女优资料源返回异常内容');
  }

  const list = parseActressList(html, MAX_DETAIL_FETCH);
  if (list.length === 0) return []; // 真实未匹配

  const fetched = await mapWithConcurrency(list, DETAIL_FETCH_CONCURRENCY, async (entry, index) => {
    const detailUrl = `${JAVBUS_BASE}/star/${entry.key}`;
    // 按序错开首次请求；并发度已由 mapWithConcurrency 限制
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, DETAIL_FETCH_GAP_MS));
    try {
      const html = await getHtml(detailUrl, 10000);
      return parseStarProfile(html, entry, detailUrl);
    } catch {
      return null;
    }
  });

  // 资料页抓取失败，退化为列表项（只有 name + 头像 + 链接），不影响整次搜索
  return fetched.map((profile, i) => {
    if (profile) return profile;
    const entry = list[i];
    const detailUrl = `${JAVBUS_BASE}/star/${entry.key}`;
    return { id: entry.key, name: entry.name, cover: entry.cover, detailUrl };
  });
}

// ── JavBus 女优作品搜索 ──────────────────────────────────

/** 女优作品列表最多返回条数（JavBus 搜索页首屏）。 */
const JAVBUS_ACTRESS_WORKS_LIMIT = 20;

/** 抓取 JavBus 女优搜索页前 20 条作品；与资料抓取解耦，关键词同样需转日文名。 */
export async function fetchActressWorks(
  keyword: string,
  normalizedKeyword?: string
): Promise<JavItem[]> {
  const normalized = normalizedKeyword ?? normalizeActressKeyword(keyword);
  if (!normalized.trim()) return [];

  const searchUrl = `${JAVBUS_BASE}/search/${encodeURIComponent(normalized)}`;
  const html = await getHtml(searchUrl, 15000);
  // 失败必须抛出：返回空数组会被上层当成「该女优没有作品」
  if (!html) throw new Error('作品源无响应（JavBus 连接失败）');
  if (html.length < 500) throw new Error('作品源返回异常内容');

  return parseGrid(html, 'javbus-actress-works').slice(0, JAVBUS_ACTRESS_WORKS_LIMIT);
}