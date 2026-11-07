/**
 * 热门女优榜
 *
 * 得分 = 四个榜单（周榜/月榜 × 有码/无码）最新一期的上榜作品数 × WORK_WEIGHT
 *      + 被关注人数 × FOLLOW_WEIGHT。
 * 不做随机；没有任何信号时不返回空卡。
 *
 * 榜单演员名来自 JavDB，关注女优名来自 JavBus，按归一化后的名字合并。
 */
import { JAV_RANKING } from '@/constants';
import { countRankingActors, getLatestRankingRecords } from './ranking-snapshot';
import { valueKey } from './recommendation-utils';

export interface HotActressItem {
  name: string;
  /** 关注这位女优的用户数 */
  followers: number;
  /** 四个榜单最新一期中上榜的作品数（同番号跨榜单去重） */
  works: number;
  score: number;
}

export interface HotActressRanking {
  items: HotActressItem[];
  updatedAt: number;
}

async function getFollowerCounts(db: D1Database): Promise<Map<string, { name: string; followers: number }>> {
  const rows = await db
    .prepare(
      `SELECT w.name AS name, COUNT(*) AS followers
       FROM user_follows f
       JOIN actress_watch w ON w.key = f.watch_key
       GROUP BY w.key`
    )
    .all<{ name: string; followers: number }>();

  const result = new Map<string, { name: string; followers: number }>();
  for (const row of rows.results || []) {
    const key = valueKey(row.name);
    if (!key) continue;
    const existing = result.get(key);
    if (existing) existing.followers += row.followers;
    else result.set(key, { name: row.name, followers: row.followers });
  }
  return result;
}

export async function getHotActressRanking(db: D1Database): Promise<HotActressRanking> {
  const [records, followerCounts] = await Promise.all([
    getLatestRankingRecords(db),
    getFollowerCounts(db),
  ]);

  const items = new Map<string, HotActressItem>();

  for (const [key, value] of countRankingActors(records)) {
    items.set(key, { name: value.name, followers: 0, works: value.works, score: 0 });
  }

  // 被关注的女优即使没上榜，也可以凭关注数进入榜单
  for (const [key, value] of followerCounts) {
    const existing = items.get(key);
    if (existing) existing.followers = value.followers;
    else items.set(key, { name: value.name, followers: value.followers, works: 0, score: 0 });
  }

  const ranked = Array.from(items.values())
    .map((item) => ({
      ...item,
      score:
        item.works * JAV_RANKING.ACTRESS_WORK_WEIGHT +
        item.followers * JAV_RANKING.ACTRESS_FOLLOW_WEIGHT,
    }))
    .sort((a, b) => b.score - a.score || b.works - a.works || b.followers - a.followers)
    .slice(0, JAV_RANKING.ACTRESS_LIMIT);

  const updatedAt = records.reduce((max, record) => Math.max(max, record.fetchedAt), 0);

  return { items: ranked, updatedAt };
}
