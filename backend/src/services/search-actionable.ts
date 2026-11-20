/**
 * 可操作结果判定：一个结果只有在用户能对它做点什么时才算结果（下载 / 阅读 / 跳转）。
 *
 * 为什么单独抽出来：同一个判定同时驱动三件事 —— 前端不给死链接（可用性）、
 * 指标里「有结果但点不动」不再算成功（成功率）、按类统计真正可用的条目数（完整性）。
 * 判定散落在四个组件里必然漂移，所以集中在这里，只允许改这一处。
 */

/** 动漫资源：有磁力才算可操作；只有详情页的条目算「可跳转」，不计入 actionable */
export function isAnimeResourceActionable(r: { magnet?: string }): boolean {
  return Boolean(r.magnet && r.magnet.startsWith('magnet:'));
}

/** 影视资源：磁力或网盘链接任一 */
export function isMovieResourceActionable(r: { magnet?: string; driveUrl?: string }): boolean {
  if (r.driveUrl) return true;
  return Boolean(r.magnet && r.magnet.startsWith('magnet:'));
}

/**
 * 漫画：有可读章节才算可操作。
 *
 * `chapterCount` 尚未接入时退回「有 MangaDex 页面」——那只保证能跳转，
 * 不保证能读。接入可读性字段后（PR-4）这个函数自动收紧，指标口径随之变严格，
 * 跨版本比较 actionable_rate 时要记得这一点。
 */
export function isMangaActionable(item: { id?: string; chapterCount?: number }): boolean {
  if (typeof item.chapterCount === 'number') return item.chapterCount > 0;
  return Boolean(item.id);
}

/** 小说：有下载直链才算可操作；只有书籍详情页的条目不能下载 */
export function isNovelActionable(item: { detailUrl?: string; format?: string }): boolean {
  // 详情页解析失败时 detailUrl 退回书籍页（非 txt），那种条目不算可下载
  return Boolean(item.detailUrl && item.detailUrl.trim());
}

/** 通用入口：按类别分派，给日志汇总用 */
export function countActionable<T>(
  items: T[],
  predicate: (item: T) => boolean,
): number {
  let n = 0;
  for (const item of items) if (predicate(item)) n++;
  return n;
}
