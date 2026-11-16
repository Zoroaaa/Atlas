/**
 * 榜单边缘缓存键与失效
 *
 * 榜单缓存直接跟随同步周期：周榜/月榜 24 小时，TOP250 总榜 30 天、年度榜 60 天。
 * 同步任务写库成功后主动删掉对应缓存，避免「刚好在同步前取了旧缓存」导致整周期看到旧榜。
 *
 * Cache API 只接受本 zone 的 URL；这里统一用请求 origin + 固定内部路径，
 * 不允许再使用 https://internal/...（写入会被拒绝）。
 */
import type { RankingImportPayload } from '@/types';

export const RANKING_CACHE_PATH = '/__edge-cache/jav-rankings-v6';
export const TOP250_CACHE_PATH = '/__edge-cache/jav-top250-v1';

export function rankingCacheKeyUrl(origin: string): string {
  return new URL(RANKING_CACHE_PATH, origin).toString();
}

export function top250CacheKeyUrl(
  origin: string,
  section: string,
  year: number | null
): string {
  const url = new URL(TOP250_CACHE_PATH, origin);
  url.searchParams.set('section', section);
  url.searchParams.set('year', year == null ? 'all' : String(year));
  return url.toString();
}

/** 导入成功后删除受影响的缓存；失败只记日志，不影响导入结果 */
export async function purgeRankingCaches(
  origin: string,
  payload: RankingImportPayload
): Promise<void> {
  if (typeof caches === 'undefined') return;

  const targets: string[] = [];
  if (payload.period === 'weekly' || payload.period === 'monthly') {
    targets.push(rankingCacheKeyUrl(origin));
  }
  if (payload.period === 'top250') {
    targets.push(top250CacheKeyUrl(origin, payload.section, null));
  }
  if (payload.period === 'yearly' && Number.isInteger(payload.year)) {
    targets.push(top250CacheKeyUrl(origin, 'all', payload.year!));
  }

  await Promise.all(
    targets.map((url) =>
      caches.default.delete(new Request(url)).catch((err) => {
        console.error('[ranking-cache] delete failed:', url, err);
      })
    )
  );
}
