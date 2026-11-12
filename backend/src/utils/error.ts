/**
 * 错误信息脱敏工具
 * 将内部实现细节（API 地址、HTTP 状态码、bot detection 等）
 * 转换为用户友好的中文提示，避免泄露内部架构信息。
 */

/** 已知的错误模式 → 用户友好提示映射 */
const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /nyaa_rss_blocked|response is HTML/i, message: '数据源暂时不可用' },
  { pattern: /nyaa_rss_http_(\d+)/, message: '数据源请求失败' },
  { pattern: /mikan_blocked|mikan_http_/i, message: 'Mikan 数据源暂时不可用' },
  { pattern: /animetosho_http_/i, message: 'AnimeTosho 数据源暂时不可用' },
  { pattern: /dmhy_blocked|dmhy_http_/i, message: 'DMHY 数据源暂时不可用' },
  { pattern: /zxcs_http_/i, message: '知轩藏书请求失败' },
  { pattern: /qishu_blocked|qishu_http_|qishu_empty_page/i, message: '奇书网数据源暂时不可用' },
  { pattern: /TMDB error|tmdb_ext_http_/i, message: '元数据服务暂时不可用' },
  { pattern: /TPB:/i, message: 'TPB 资源搜索失败' },
  { pattern: /eztv_http_/i, message: 'EZTV 剧集资源暂不可用' },
  { pattern: /SEARCH_TIMEOUT/i, message: '搜索超时，请稍后重试' },
  { pattern: /429/i, message: '请求过于频繁，请稍后再试' },
  { pattern: /503/i, message: '服务暂时不可用' },
  { pattern: /timeout|Timeout/i, message: '请求超时' },
];

/**
 * 将原始错误字符串脱敏为用户友好提示
 * 未匹配的模式返回通用提示
 */
export function sanitizeError(raw: string | null | undefined): string {
  if (!raw) return '';
  const str = String(raw);
  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(str)) return message;
  }
  // 兜底：不暴露原始错误细节
  return '请求失败，请稍后重试';
}

// ─── 失败语义 ──────────────────────────────────────────────────────────

/**
 * 搜索失败类型：让前端区分「源暂时不可用」与「限流」等，
 * 而不是只能展示一句脱敏后的文案。
 *
 * NOT_FOUND / PARSE_FAILED 由调用方在明确判定时使用；
 * HTTP/网络类失败统一走 classifySearchError 分类。
 */
export type SearchErrorKind = 'NOT_FOUND' | 'SOURCE_UNAVAILABLE' | 'RATE_LIMITED' | 'PARSE_FAILED';

/** 由原始错误文本推断失败类型（仅能可靠区分限流，其余视为源不可用） */
export function classifySearchError(raw: string | null | undefined): SearchErrorKind | null {
  if (!raw) return null;
  return /429|rate.?limit/i.test(String(raw)) ? 'RATE_LIMITED' : 'SOURCE_UNAVAILABLE';
}
