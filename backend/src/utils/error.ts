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
  { pattern: /TMDB error|tmdb_ext_http_/i, message: '元数据服务暂时不可用' },
  { pattern: /Douban AJAX error|Douban/i, message: '豆瓣数据获取失败' },
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
