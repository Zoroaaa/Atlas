/**
 * minnano-av.com 女优搜索抓取
 *
 * 搜索 URL: https://www.minnano-av.com/search_result.php?search_scope=actress&search_word={keyword}
 * - 唯一匹配时 302 重定向到 actress{id}.html 详情页
 * - 多匹配时返回搜索列表页，每项含 actress{id}.html 链接
 *
 * 字段来源：详情页 tbllist 表格 + h2 标题 + 封面图
 */

import { getHtml, parseGrid, type JavItem } from '@/services/jav-utils';
import { normalizeActressKeyword } from '@/services/actress-name-map';

// ─── 类型 ──────────────────────────────────────────────────────────────

export interface ActressProfile {
  /** minnano 女优 ID（如 923562） */
  id: string;
  /** 显示名（汉字名） */
  name: string;
  /** 假名 */
  ruby?: string;
  /** 罗马音 */
  romaji?: string;
  /** 别名 */
  alias?: string;
  /** 生日（如 1998年03月18日） */
  birthday?: string;
  /** 星座 */
  zodiac?: string;
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
  /** 鞋码 */
  shoeSize?: string;
  /** 出身地 */
  prefecture?: string;
  /** 事务所 */
  agency?: string;
  /** 出道期间（如 2017年〜） */
  activePeriod?: string;
  /** 出道作品 */
  debutWork?: string;
  /** 博客 URL */
  blogUrl?: string;
  /** 官方网站 */
  officialUrl?: string;
  /** 标签 */
  tags?: string[];
  /** 封面图 URL（125x125） */
  cover?: string;
  /** 详情页 URL */
  detailUrl: string;
}

// ─── 解析 ──────────────────────────────────────────────────────────────

const BASE = 'https://www.minnano-av.com';

/**
 * 从搜索结果页 HTML 提取女优列表项（id + name + detailUrl）
 * 列表页每个女优有多个 actress{id}.html 链接，去重取第一个
 */
function parseSearchList(html: string, keyword: string): Array<{ id: string; name: string; detailUrl: string }> {
  const seen = new Set<string>();
  const results: Array<{ id: string; name: string; detailUrl: string }> = [];

  // 匹配 href="actress123456.html?名字" 或 href="actress123456.html"
  // 唯一匹配时 302 到详情页，此时 HTML 是详情页，用 parseDetailPage 解析
  const re = /href="(actress(\d+)\.html)(?:\?[^"]*)?"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    // 名字：取同一 a 标签的 innerText，或从 ?参数 提取
    const linkContext = html.slice(Math.max(0, m.index - 20), m.index + m[0].length + 80);
    let name = '';
    // 尝试从 ?name 参数提取
    const nameParam = m[0].match(/\?([^"]+)/);
    if (nameParam) name = decodeURIComponent(nameParam[1]);
    // 如果名字为空或太长，尝试从 >text< 提取
    if (!name || name.length > 30) {
      const textMatch = linkContext.match(/>([^<]{1,30})</);
      if (textMatch && textMatch[1].trim()) name = textMatch[1].trim();
    }
    if (!name || name === '女優情報' || name === 'AV作品を見る') continue;
    results.push({
      id,
      name,
      detailUrl: `${BASE}/actress${id}.html`,
    });
  }

  // 过滤掉明显不相关的（名字不含关键词且无其他信息时，保留全部让用户判断）
  void keyword;
  return results;
}

/**
 * 从详情页 HTML 解析完整女优资料
 *
 * 详情页字段结构（经浏览器实地验证）：
 *   <tr><td><span>标签</span><p>值</p></td></tr>
 * 标签在 <span>，值在紧邻的 <p>。
 * タグ字段特殊：<span>タグ</span> 后跟 <div class="tagarea"><a>标签1</a>...</div>
 */
function parseDetailPage(html: string, detailUrl: string): ActressProfile | null {
  if (!html || html.length < 500) return null;

  // ID 从 URL 提取
  const idMatch = detailUrl.match(/actress(\d+)\.html/);
  const id = idMatch ? idMatch[1] : '';

  // h2: "深田えいみ （ふかだえいみ / Fukada Eimi）"
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  let name = '';
  let ruby = '';
  let romaji = '';
  if (h2Match) {
    const h2Text = h2Match[1].replace(/<[^>]+>/g, '').trim();
    // 名字（假名 / 罗马音）
    const parts = h2Text.split(/[（()／/]/).map(s => s.trim()).filter(Boolean);
    name = parts[0] || '';
    if (parts[1]) ruby = parts[1];
    if (parts[2]) romaji = parts[2];
    ruby = ruby.replace(/[)）]/g, '').trim();
    romaji = romaji.replace(/[)）]/g, '').trim();
  }

  if (!name) return null;

  // 封面图：p_actress_125_125/xxx/{id}.jpg
  const coverMatch = html.match(/src="(https?:\/\/www\.minnano-av\.com\/p_actress_\d+_\d+\/[^"]+\/(?:\d+\/)?(?:\d+)\.jpg[^"]*)"/i)
    || html.match(/src="(\/p_actress_\d+_\d+\/[^"]+\.jpg[^"]*)"/i);
  let cover = '';
  if (coverMatch) {
    cover = coverMatch[1].startsWith('http') ? coverMatch[1] : `${BASE}${coverMatch[1]}`;
  }

  // 核心解析：按 <span>label</span> 定位，取紧邻的 <p>value</p> 内容
  // 结构：<span>生年月日</span><p>1998年03月18日\n（現在 28歳）うお座</p>
  const stripTags = (s: string): string => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  const extractField = (label: string): string => {
    // 匹配 <span>label</span> 后的 <p>...</p>（中间允许有空白/换行）
    const re = new RegExp('<span[^>]*>' + label + '</span>\\s*<p[^>]*>([\\s\\S]*?)</p>', 'i');
    const m = html.match(re);
    return m ? stripTags(m[1]) : '';
  };

  // 別名
  const aliasRaw = extractField('別名');
  const alias = aliasRaw && aliasRaw.length < 80 ? aliasRaw : undefined;

  // 生年月日: "1998年03月18日 （現在 28歳）うお座"
  const birthdayRaw = extractField('生年月日');
  let birthday: string | undefined;
  let zodiac: string | undefined;
  if (birthdayRaw) {
    const bdMatch = birthdayRaw.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
    if (bdMatch) birthday = bdMatch[1];
    const zMatch = birthdayRaw.match(/(うお座|おひつじ座|おうし座|ふたご座|かに座|しし座|おとめ座|てんびん座|さそり座|いて座|やぎ座|みずがめ座)/);
    if (zMatch) zodiac = zMatch[1];
  }

  // サイズ: "T158 / B88(Iカップ) / W59 / H91 / S"
  const sizeRaw = extractField('サイズ');
  let height: number | undefined;
  let bust: number | undefined;
  let cup: string | undefined;
  let waist: number | undefined;
  let hip: number | undefined;
  if (sizeRaw) {
    const hMatch = sizeRaw.match(/T(\d+)/);
    if (hMatch) height = Number(hMatch[1]);
    const bMatch = sizeRaw.match(/B(\d+)\(([A-Z])カップ\)/i);
    if (bMatch) { bust = Number(bMatch[1]); cup = bMatch[2]; }
    else {
      const b2 = sizeRaw.match(/B(\d+)/);
      if (b2) bust = Number(b2[1]);
      const c2 = sizeRaw.match(/([A-Z])カップ/i);
      if (c2) cup = c2[1];
    }
    const wMatch = sizeRaw.match(/W(\d+)/);
    if (wMatch) waist = Number(wMatch[1]);
    const hpMatch = sizeRaw.match(/H(\d+)/);
    if (hpMatch) hip = Number(hpMatch[1]);
  }

  const prefecture = extractField('出身地') || undefined;
  const agency = extractField('所属事務所') || undefined;
  const activePeriod = extractField('AV出演期間') || undefined;
  const debutWork = extractField('デビュー作品') || undefined;
  const blogUrl = extractField('ブログ') || undefined;
  const officialUrl = extractField('公式サイト') || undefined;

  // タグ：特殊结构，<span>タグ</span> 后跟 <div class="tagarea"><a>标签</a>...</div>
  const tags: string[] | undefined = (() => {
    const tagBlockMatch = html.match(/<span[^>]*>タグ<\/span>[\s\S]*?<div[^>]*class="[^"]*tagarea[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!tagBlockMatch) return undefined;
    const tagLinks = tagBlockMatch[1].match(/<a[^>]*>([^<]+)<\/a>/gi) || [];
    const ts = tagLinks.map(t => stripTags(t)).filter(Boolean);
    return ts.length > 0 ? ts.slice(0, 15) : undefined;
  })();

  return {
    id,
    name,
    ruby: ruby || undefined,
    romaji: romaji || undefined,
    alias,
    birthday,
    zodiac,
    height,
    bust,
    cup,
    waist,
    hip,
    prefecture,
    agency,
    activePeriod,
    debutWork,
    blogUrl,
    officialUrl,
    tags,
    cover: cover || undefined,
    detailUrl,
  };
}

// ─── 主入口 ────────────────────────────────────────────────────────────

const MAX_DETAIL_FETCH = 10; // 最多并发抓取详情页数量

/**
 * 搜索女优：抓搜索页 → 提取列表 → 并发抓前 N 个详情页
 * 唯一匹配时搜索页直接 302 到详情页，此时直接解析
 */
export async function fetchActresses(keyword: string): Promise<ActressProfile[]> {
  if (!keyword.trim()) return [];

  // 归一化：简体中文俗称/繁体 → minnano 可搜的日文名（映射表 + opencc 简→日新字体转换）
  const normalized = normalizeActressKeyword(keyword);
  const searchUrl = `${BASE}/search_result.php?search_scope=actress&search_word=${encodeURIComponent(normalized)}`;
  const html = await getHtml(searchUrl, 15000);
  if (!html || html.length < 500) return [];

  // 检查是否被 302 到详情页（URL 含 actress\d+.html 且 h2 存在）
  const isDetailPage = /<h2[^>]*>[^<]+<\/h2>/i.test(html) && /actress\d+\.html|女優プロフィール/.test(html);

  if (isDetailPage) {
    // 唯一匹配，直接解析详情页
    // 从页面内容提取 detailUrl（canonical 或 og:url）
    const urlMatch = html.match(/(?:canonical|og:url)[^>]*(?:actress\d+\.html)/i);
    const detailUrl = urlMatch
      ? `${BASE}/${urlMatch[0].match(/actress\d+\.html/)?.[0]}`
      : searchUrl;
    const profile = parseDetailPage(html, detailUrl);
    return profile ? [profile] : [];
  }

  // 多结果：解析列表
  const list = parseSearchList(html, keyword);
  if (list.length === 0) return [];

  // 并发抓取前 N 个详情页
  const targets = list.slice(0, MAX_DETAIL_FETCH);
  const results = await Promise.allSettled(
    targets.map(item => getHtml(item.detailUrl, 10000).then(h => {
      if (!h) return null;
      return parseDetailPage(h, item.detailUrl);
    }))
  );

  const profiles: ActressProfile[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      profiles.push(r.value);
    } else {
      // 详情页抓取失败，退化为列表项（只有 name + detailUrl）
      profiles.push({
        id: targets[i].id,
        name: targets[i].name,
        detailUrl: targets[i].detailUrl,
      });
    }
  }

  return profiles;
}

// ─── JavBus 女优作品搜索 ────────────────────────────────────────────────

/**
 * 抓取 JavBus 女优搜索页（/search/{keyword}）前 20 条作品。
 *
 * 仅当 minnano-av 女优搜索成功返回数据后调用 —— 作为女优资料的补充，
 * 让用户可以直接看到该女优在 JavBus 上的作品列表并点击跳转番号搜索。
 *
 * 关键词归一化：调用方应传入 normalizeActressKeyword 后的日文名，
 * 因为 JavBus 同样是日文站，中文俗称/简繁体无法直接命中。
 *
 * JavBus 搜索页与首页/genre/star 页共享同一 movie-box 网格结构，
 * 复用 jav-utils.ts 的 parseGrid 解析器。
 */
const JAVBUS_ACTRESS_WORKS_LIMIT = 20;

export async function fetchActressWorks(keyword: string): Promise<JavItem[]> {
  const normalized = normalizeActressKeyword(keyword);
  if (!normalized.trim()) return [];

  const searchUrl = `https://www.javbus.com/search/${encodeURIComponent(normalized)}`;
  const html = await getHtml(searchUrl, 15000);
  if (!html || html.length < 500) return [];

  return parseGrid(html, 'javbus-actress-works').slice(0, JAVBUS_ACTRESS_WORKS_LIMIT);
}

