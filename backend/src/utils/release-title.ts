/**
 * 发布名结构化解析：把「[组] 作品名 / 别名 - 05 [1080p][简繁]」拆成可判定的字段。
 *
 * 与 normalizeTitle 的分工：normalizeTitle 只负责把字符串压成可比较的形态，是有损且不可逆的；
 * 本模块在归一化之前抽取字段，供归属判定、展示与排序使用。两者不可互相替代
 * （normalizeTitle 会删掉 "- 05" 这类集数写法，但保留 SxxExx，靠它反推集数必错）。
 *
 * 约束：只做确定性的字符串解析，不猜、不补。解析不出来的字段留空，由调用方决定如何降级。
 */

// ── 类型 ──────────────────────────────────────────────────────────────

export interface ParsedRelease {
  /**
   * 分段后的归一化文本。只按「强分隔符」（/ ｜ | ： :）切分，不按点号切 ——
   * 发布名里点号同时用作词分隔符，按点切会把 "Her.Private.Hell" 切成 "her" 单段，
   * 让任意单词标题都能"整段相等"。这不是近似，是错。
   */
  segments: string[];
  year?: number;
  season?: number;
  episode?: number;
  /** 合集区间，如 01-12 */
  episodeRange?: [number, number];
  isBatch: boolean;
  resolution?: '2160p' | '1080p' | '720p' | '480p';
  mediaSource?: string;
  codec?: string;
  /** 首个小括号/方括号里的发布组 */
  group?: string;
  /** 字幕语言标记（简/繁/CHS/CHT/BIG5 等） */
  subtitle: string[];
}

// ── 常量 ──────────────────────────────────────────────────────────────

const RESOLUTION_MAP: Array<{ re: RegExp; value: ParsedRelease['resolution'] }> = [
  { re: /\b2160p\b/i, value: '2160p' },
  { re: /\b4k\b/i, value: '2160p' },
  { re: /\b1080p\b/i, value: '1080p' },
  { re: /\b720p\b/i, value: '720p' },
  { re: /\b480p\b/i, value: '480p' },
];

const MEDIA_SOURCE_RE = /\b(blu-?ray|bdrip|brrip|bdremux|remux|web-?dl|web-?rip|webrip|web|hdtv|dvdrip|dvdscr|dvd|hdrip|tvrip|bd)\b/i;
const CODEC_RE = /\b(x264|x265|h\.?264|h\.?265|hevc|av1|avc|10bit|8bit)\b/i;

/** 短标题前缀匹配时，作品名后面必须紧跟这些词才算"片名结束"，避免 "It Follows" 命中 "It" */
const PREFIX_TAIL_NOISE = new Set([
  'bluray', 'bdrip', 'brrip', 'bdremux', 'remux', 'web', 'webdl', 'webrip', 'hdtv', 'dvdrip', 'dvdscr',
  'dvd', 'hdrip', 'tvrip', 'bd',
  'x264', 'x265', 'h264', 'h265', 'hevc', 'av1', 'avc', '10bit', '8bit', 'hdr', 'aac', 'ac3', 'dts',
  'ddp5', 'ddp', 'atmos', 'truehd', 'flac', 'multi', 'chs', 'cht', 'big5', 'jpsc', 'jptc',
  'proper', 'repack', 'internal', 'limited', 'complete',
]);

const SUBTITLE_TOKENS: Array<{ re: RegExp; label: string }> = [
  { re: /简繁|简日|繁日|简繁日|简繁内封|简日双语/, label: 'zh-Hans+zh-Hant' },
  { re: /\bchs\b|简体/i, label: 'zh-Hans' },
  { re: /\bcht\b|\bbig5\b|繁体/i, label: 'zh-Hant' },
  { re: /\bjpsc\b|\bjptc\b|日语/i, label: 'ja' },
];

const BATCH_RE = /(合集|全集|batch|complete|season\s*pack|全\s*\d+\s*[话話集])/i;

// ── 工具 ──────────────────────────────────────────────────────────────

const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

/** 是否含汉字 */
export function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

/**
 * 单段归一化：只保留字母数字与空格并转小写。
 *
 * 撇号必须直接删除而不是换成空格：发布名里 "Journeys End" 与元数据里的
 * "Journey's End" 指的是同一部作品，换成空格会得到 "journey s" 而对不上。
 *
 * 与 normalizeTitle 的差别是不删任何"疑似标记"—— 字段抽取已经在前面做完了，
 * 这里再删会把作品名本身的数字一起吃掉。
 */
export function normalizeSegment(text: string): string {
  return text
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 提取所有方括号内容，返回 [组名, 其余标签] */
function takeBrackets(input: string): { rest: string; tags: string[] } {
  const tags: string[] = [];
  const rest = input.replace(/[[【]([^\]】]*)[\]】]/g, (_m, inner: string) => {
    const value = String(inner).trim();
    if (value) tags.push(value);
    return ' ';
  });
  return { rest, tags };
}

// ── 主解析 ────────────────────────────────────────────────────────────

/** 解析发布名；任何字段解析失败都留空，不抛错 */
export function parseReleaseTitle(raw: string): ParsedRelease {
  const input = (raw || '').trim();
  const result: ParsedRelease = { segments: [], isBatch: false, subtitle: [] };
  if (!input) return result;

  const { rest: withoutBrackets, tags } = takeBrackets(input);
  // 规格常写在方括号里（[WebRip 1080p]、[简繁]），方括号已从 work 移除，
  // 所以字段捕获要用「去括号文本 + 标签内容」的合成串，否则分辨率/来源全部读不到。
  const probe = `${withoutBrackets} ${tags.join(' ')}`;
  let work = withoutBrackets;

  // 发布组：第一个方括号标签（[LoliHouse] / [SubsPlease]），要求不是纯规格
  if (tags.length > 0 && !/^\d{3,4}p$/i.test(tags[0])) {
    result.group = tags[0];
  }
  for (const tag of tags) {
    for (const token of SUBTITLE_TOKENS) {
      if (token.re.test(tag) && !result.subtitle.includes(token.label)) result.subtitle.push(token.label);
    }
  }
  // 方括号外的字幕标记（[简繁] 已被上面吃掉了，这里补 "简繁字幕" 这类写法）
  for (const token of SUBTITLE_TOKENS) {
    if (token.re.test(withoutBrackets) && !result.subtitle.includes(token.label)) result.subtitle.push(token.label);
  }

  // 分辨率
  for (const item of RESOLUTION_MAP) {
    if (item.re.test(probe)) {
      result.resolution = item.value;
      work = work.replace(item.re, ' ');
      break;
    }
  }

  // 来源与编码
  const sourceMatch = probe.match(MEDIA_SOURCE_RE);
  if (sourceMatch) {
    result.mediaSource = sourceMatch[1].replace(/\s/g, '').toUpperCase();
    work = work.replace(MEDIA_SOURCE_RE, ' ');
  }
  const codecMatch = probe.match(CODEC_RE);
  if (codecMatch) {
    result.codec = codecMatch[1].toLowerCase();
    work = work.replace(CODEC_RE, ' ');
  }

  // 季集：SxxExx 优先（最强信号），其次 Season N / 第N季，再 EP/第N话，最后 fansub 的 "- 05"
  const sxe = probe.match(/\bS(\d{1,2})E(\d{1,3})\b/i);
  if (sxe) {
    result.season = parseInt(sxe[1], 10);
    result.episode = parseInt(sxe[2], 10);
    work = work.replace(/\bS\d{1,2}E\d{1,3}\b/i, ' ');
  } else {
    const seasonMatch = probe.match(/\bSeason\s*(\d{1,2})\b|第\s*(\d{1,2})\s*季/i);
    if (seasonMatch) {
      result.season = parseInt(seasonMatch[1] ?? seasonMatch[2], 10);
      work = work.replace(/\bSeason\s*\d{1,2}\b|第\s*\d{1,2}\s*季/i, ' ');
    }
    const epMatch = probe.match(/\bEP?\s*(\d{1,4})\b|第\s*(\d{1,4})\s*[话話集]/i);
    if (epMatch) {
      result.episode = parseInt(epMatch[1] ?? epMatch[2], 10);
      work = work.replace(/\bEP?\s*\d{1,4}\b|第\s*\d{1,4}\s*[话話集]/i, ' ');
    } else {
      // fansub 常见的 " - 05"：连字符两侧有空格，且数字不超过 4 位
      const dashEp = work.match(/\s-\s(\d{1,4})(?=\s|$)/);
      if (dashEp) {
        result.episode = parseInt(dashEp[1], 10);
        work = work.replace(/\s-\s\d{1,4}(?=\s|$)/, ' ');
      }
    }
  }

  // 合集区间：01-12 / 01~12
  const range = probe.match(/\b(\d{1,3})\s*[-~]\s*(\d{1,3})\b/);
  if (range) {
    const from = parseInt(range[1], 10);
    const to = parseInt(range[2], 10);
    if (to > from) {
      result.episodeRange = [from, to];
      result.isBatch = true;
      work = work.replace(/\b\d{1,3}\s*[-~]\s*\d{1,3}\b/, ' ');
    }
  }
  if (BATCH_RE.test(raw)) result.isBatch = true;

  // 年份：1950..当前+2，取第一个命中的 4 位数
  const maxYear = new Date().getFullYear() + 2;
  const yearRe = /\b(19[5-9]\d|20\d{2})\b/g;
  let yearMatch: RegExpExecArray | null;
  while ((yearMatch = yearRe.exec(probe)) !== null) {
    const value = parseInt(yearMatch[1], 10);
    if (value <= maxYear) {
      result.year = value;
      break;
    }
  }
  work = work.replace(/\b(19[5-9]\d|20\d{2})\b/g, ' ');

  // 圆括号内的规格说明（(1080p)、(BD)、(简繁) 已在上面取值）
  work = work.replace(/[（(][^）)]*[）)]/g, ' ');

  // 结尾的发布组后缀：只吃「全大写/纯数字」的短 token（-GRP / .SPARKS / - YIFY），
  // 不吃 "-Man" 这类片名本身的一部分
  work = work.replace(/\s*[.-]\s*([A-Z0-9]{2,15})\s*$/, (match, token: string) => (
    /^[A-Z0-9]+$/.test(token) ? ' ' : match
  ));

  // 分段：只按强分隔符切，保留作品名的空格结构
  const rawSegments = work.split(/\s*[/｜|：:]\s*/);
  const segments: string[] = [];
  for (const segment of rawSegments) {
    const normalized = normalizeSegment(segment);
    if (normalized) segments.push(normalized);
  }
  result.segments = segments;

  return result;
}

// ── 单段比对 ──────────────────────────────────────────────────────────

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 拉丁词边界：候选作为完整单词序列出现（"her" 不匹配 "mother"） */
function hasLatinWord(segment: string, candidate: string): boolean {
  // candidate 含空格时按整串匹配，前后仍要求非字母数字边界
  return new RegExp(`(?<![a-z0-9])${escapeRe(candidate)}(?![a-z0-9])`, 'i').test(segment);
}

/** 短标题（≤3 字符）前缀匹配时，作品名后面必须紧跟规格词，否则 "It Follows" 会命中 "It" */
function prefixTailIsNoise(segment: string, candidate: string): boolean {
  const tail = segment.slice(candidate.length).trim();
  if (!tail) return true;
  const firstToken = tail.split(' ')[0];
  return PREFIX_TAIL_NOISE.has(firstToken);
}

/**
 * 单个候选标题对单个分段的匹配分。
 *
 * 100 段级完全相等 / 85 段级前缀（片名结束）/ 70 拉丁整词出现 / 55 CJK 连续子串（≥4 字）/ 0 不匹配。
 * 分级的意义不在分数本身，而在于「同名不同作品」时能靠分差判定归属。
 */
export function scoreTitleAgainstSegment(segment: string, candidate: string): number {
  if (!segment || !candidate) return 0;
  if (segment === candidate) return 100;

  const short = candidate.replace(/\s/g, '').length <= 3;
  if (segment.startsWith(`${candidate} `)) {
    if (short) return prefixTailIsNoise(segment, candidate) ? 85 : 0;
    return 85;
  }
  // CJK 没有空格，前缀判定退化为纯 startsWith
  if (hasCjk(candidate) && segment.startsWith(candidate)) {
    if (short) return prefixTailIsNoise(segment, candidate) ? 85 : 0;
    return 85;
  }
  if (hasLatinWord(segment, candidate)) return 70;
  // CJK 无词边界，只能靠长度换精度
  if (hasCjk(candidate) && candidate.length >= 4 && segment.includes(candidate)) return 55;
  return 0;
}

/** 一个作品的所有候选标题对资源取最高分 */
export function scoreTitleCandidates(segments: string[], candidates: string[]): number {
  let best = 0;
  for (const candidate of candidates) {
    // 别名来自元数据，带大小写与标点（"Frieren: Beyond Journey's End"），
    // 必须先归一化再比，否则和资源侧的分段永远对不上。
    const normalized = normalizeSegment(candidate);
    if (!normalized) continue;
    for (const segment of segments) {
      const score = scoreTitleAgainstSegment(segment, normalized);
      if (score > best) best = score;
    }
  }
  return best;
}
