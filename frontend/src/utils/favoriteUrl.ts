/**
 * 收藏 URL 规则：收藏以 URL 作为唯一标识（见 useFavoritesQuery），
 * 生成与「是否同一资源」的判定都必须只有一份，否则同一资源会重复收藏或状态不一致。
 */

/**
 * 判断收藏 URL 与目标 URL 是否指向同一资源。
 *
 * 不能用 includes(id)：短 id 会命中更长 id（123 命中 1234），导致误删他人的收藏。
 * 只比较 origin + pathname，忽略 query/hash 与末尾斜杠差异：
 * 源站会给同一详情页挂不同的跟踪参数，但收藏不该因此变成两条。
 */
export function isSameFavoriteUrl(favoriteUrl: string | undefined, targetUrl: string): boolean {
  if (!favoriteUrl) return false;
  if (favoriteUrl === targetUrl) return true;
  try {
    const a = new URL(favoriteUrl);
    const b = new URL(targetUrl, window.location.origin);
    const normalize = (path: string) => path.replace(/\/+$/, '');
    return a.origin === b.origin && normalize(a.pathname) === normalize(b.pathname);
  } catch {
    return false;
  }
}

/** 不同来源的同一 JAV 可能没有详情页，回退到 JavDB 搜索页作为稳定标识。 */
export const javFavoriteUrl = (detailUrl?: string | null, code?: string | null): string | undefined =>
  detailUrl || (code ? `https://javdb.com/search?q=${encodeURIComponent(code)}&f=all` : undefined);

export const mangaFavoriteUrl = (id: string): string => `https://mangadex.org/title/${id}`;

export const movieFavoriteUrl = (mediaType: string, id: number | string): string =>
  `https://www.themoviedb.org/${mediaType}/${id}`;
