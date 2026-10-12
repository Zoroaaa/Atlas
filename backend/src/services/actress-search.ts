/**
 * JavBus 女优资料搜索抓取
 *
 * 原数据源 minnano-av.com 已上线反爬（Worker 侧请求一律返回安全验证页），
 * 故改用 JavBus 自身作为女优资料来源：
 *   /searchstar/{keyword} → 女优列表（star slug / 姓名 / 头像）
 *   /star/{key}           → 资料块（生日/年龄/身高/罩杯/胸围/腰围/臀围/出生地/爱好）
 *
 * 关键词归一化：JavBus 是日文站，中文俗称/简繁体需先经 normalizeActressKeyword 转日文名。
 */

import { getHtml, normalizeJavbusUrl, parseActressList, parseGrid, type JavItem } from '@/services/jav-utils';
import { normalizeActressKeyword } from '@/services/actress-name-map';

const JAVBUS_BASE = 'https://www.javbus.com';

// ─── 类型 ──────────────────────────────────────────────────────────────

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

// ─── 解析 ──────────────────────────────────────────────────────────────

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

// ─── 主入口 ────────────────────────────────────────────────────────────

const MAX_DETAIL_FETCH = 10; // 最多并发抓取资料页数量

/**
 * 搜索女优：/searchstar/ 取列表 → 并发抓前 N 个 star 页资料块
 *
 * 抛出异常仅在「资料源不可用」时（无响应 / 返回非 JavBus 结果页），
 * 以便上层把失败透出给用户；真正「未匹配到女优」返回空数组。
 */
export async function fetchActresses(keyword: string): Promise<ActressProfile[]> {
  if (!keyword.trim()) return [];

  const normalized = normalizeActressKeyword(keyword);
  const searchUrl = `${JAVBUS_BASE}/searchstar/${encodeURIComponent(normalized)}`;
  const html = await getHtml(searchUrl, 15000);

  if (!html) throw new Error('女优资料源无响应（JavBus 连接失败）');
  if (html.length < 500 || !/id="waterfall"/.test(html)) {
    throw new Error('女优资料源返回异常内容');
  }

  const list = parseActressList(html, MAX_DETAIL_FETCH);
  if (list.length === 0) return []; // 真实未匹配

  const results = await Promise.allSettled(
    list.map(entry => {
      const detailUrl = `${JAVBUS_BASE}/star/${entry.key}`;
      return getHtml(detailUrl, 10000).then(h => parseStarProfile(h, entry, detailUrl));
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled' && r.value) return r.value;
    // 资料页抓取失败，退化为列表项（只有 name + 头像 + 链接）
    const entry = list[i];
    const detailUrl = `${JAVBUS_BASE}/star/${entry.key}`;
    return { id: entry.key, name: entry.name, cover: entry.cover, detailUrl };
  });
}

// ─── JavBus 女优作品搜索 ────────────────────────────────────────────────

/**
 * 抓取 JavBus 女优搜索页（/search/{keyword}）前 20 条作品。
 *
 * 与女优资料抓取解耦：资料源失败时仍会尝试抓取作品列表。
 * 关键词归一化：JavBus 同样是日文站，中文俗称/简繁体无法直接命中。
 *
 * JavBus 搜索页与首页/genre/star 页共享同一 movie-box 网格结构，
 * 复用 jav-utils.ts 的 parseGrid 解析器。
 */
const JAVBUS_ACTRESS_WORKS_LIMIT = 20;

export async function fetchActressWorks(keyword: string): Promise<JavItem[]> {
  const normalized = normalizeActressKeyword(keyword);
  if (!normalized.trim()) return [];

  const searchUrl = `${JAVBUS_BASE}/search/${encodeURIComponent(normalized)}`;
  const html = await getHtml(searchUrl, 15000);
  if (!html || html.length < 500) return [];

  return parseGrid(html, 'javbus-actress-works').slice(0, JAVBUS_ACTRESS_WORKS_LIMIT);
}