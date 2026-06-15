/**
 * 共享格式化工具函数
 * 统一 formatBytes 实现，避免 anime-search / movie-search 各自重复定义
 */

/** bytes → 可读字符串 */
export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
