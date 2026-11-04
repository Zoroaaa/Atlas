/**
 * 热门女优榜
 *
 * 站内信号（近 30 天收藏/搜索去重用户数）+ 最新周榜/月榜上榜作品数。
 * 不做随机；没有信号时不返回空卡。
 */
import { JAV_RANKING } from '@/constants';
import { getHotSignals } from './hot-signals';
import { countRankingActors, getLatestRankingRecords } from './ranking-snapshot';
import { valueKey } from './recommendation-utils';

export interface HotActressItem {
  name: string;
  /** 近 30 天收藏/搜索过的去重用户数 */
  users: number;
  /** 最新周榜 + 月榜中上榜的作品数（同番号跨周期去重） */
  works: number;
  score: number;
}

export interface HotActressRanking {
  items: HotActressItem[];
  updatedAt: number;
}

export async function getHotActressRanking(db: D1Database): Promise<HotActressRanking> {
  const [signals, records] = await Promise.all([
    getHotSignals(db),
    getLatestRankingRecords(db),
  ]);

  const rankingActors = countRankingActors(records);
  const items = new Map<string, HotActressItem>();

  // 站内热度先入榜：topActors 已按去重用户数排序，且只包含 >=2 人的值
  for (const name of signals.topActors) {
    const key = valueKey(name);
    if (!key) continue;
    items.set(key, {
      name,
      users: signals.actorUsers[key] || 0,
      works: 0,
      score: 0,
    });
  }

  // 榜单演员补充：站内热度为 0 的女优也能凭月榜/周榜上榜
  for (const [key, value] of rankingActors) {
    const existing = items.get(key);
    if (existing) {
      existing.works = value.works;
    } else {
      items.set(key, {
        name: value.name,
        users: 0,
        works: value.works,
        score: 0,
      });
    }
  }

  const ranked = Array.from(items.values())
    .map((item) => ({
      ...item,
      score:
        item.users * JAV_RANKING.ACTRESS_USER_WEIGHT +
        item.works * JAV_RANKING.ACTRESS_WORK_WEIGHT,
    }))
    .sort((a, b) => b.score - a.score || b.users - a.users || b.works - a.works)
    .slice(0, JAV_RANKING.ACTRESS_LIMIT);

  const updatedAt = records.reduce((max, record) => Math.max(max, record.fetchedAt), 0);

  return { items: ranked, updatedAt };
}
