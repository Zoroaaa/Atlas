/**
 * 热门女优榜
 *
 * 得分 = 四个榜单（周榜/月榜 × 有码/无码）最新一期的上榜作品数 × WORK_WEIGHT
 *      + 被关注人数 × FOLLOW_WEIGHT。
 * 不做随机；没有任何信号时不返回空卡。
 *
 * 榜单演员名来自 JavDB，关注女优名来自 JavBus，按归一化后的名字合并。
 * 头像优先取站内已有数据（关注表 / 本地库 actress 记录），缺的再回源 JavBus 并写回关注表。
 */
import { JAV_RANKING } from '@/constants';
import { mapWithConcurrency } from '@/utils';
import { countRankingActors, getLatestRankingRecords } from './ranking-snapshot';
import { valueKey } from './recommendation-utils';
import { normalizeActressKeyword } from './actress-name-map';
import { resolveStar } from './follow-service';

export interface HotActressItem {
  name: string;
  /** 女优头像 URL；取不到时前端回退为首字母占位 */
  cover?: string;
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
      `SELECT t.name AS name, COUNT(*) AS followers
       FROM user_follows f
       JOIN follow_targets t ON t.watch_key = f.watch_key
       WHERE t.entity_type = 'actress'
       GROUP BY t.watch_key`
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

// ── 头像补全 ─────────────────────────────────────────────────────────

/** 头像回源并发、单次超时与整轮预算：JavBus 对突发请求敏感，且不能拖垮榜单接口 */
const COVER_FETCH_CONCURRENCY = 3;
const COVER_FETCH_TIMEOUT_MS = 5000;
const COVER_FETCH_BUDGET_MS = 8000;

interface CoverRow {
  name: string;
  cover: string | null;
}

/**
 * 站内已有头像：关注时 JavBus 解析出的头像，以及用户搜索过的女优记录封面。
 * 都按展示名归一化建索引；先取关注表，避免同一女优被本地库旧封面覆盖。
 */
async function getLocalActressCovers(db: D1Database): Promise<Map<string, string>> {
  const [watch, records] = await Promise.all([
    db
      .prepare(`SELECT name, avatar AS cover FROM actress_watch WHERE avatar IS NOT NULL AND avatar <> ''`)
      .all<CoverRow>(),
    db
      .prepare(
        `SELECT title AS name, cover FROM data_records
         WHERE record_type = 'actress' AND cover IS NOT NULL AND cover <> ''`
      )
      .all<CoverRow>(),
  ]);

  const covers = new Map<string, string>();
  for (const row of [...(watch.results ?? []), ...(records.results ?? [])]) {
    const key = valueKey(row.name || '');
    if (!key || !row.cover || covers.has(key)) continue;
    covers.set(key, row.cover);
  }
  return covers;
}

/** 展示名可能是中文俗称或日文名：先用原名查，再用 JavBus 归一化名兜底 */
function lookupCover(covers: Map<string, string>, name: string): string | undefined {
  const direct = covers.get(valueKey(name));
  if (direct) return direct;
  const normalized = normalizeActressKeyword(name);
  return normalized === name ? undefined : covers.get(valueKey(normalized));
}

/**
 * 回源补齐缺失头像，并把解析结果写回 actress_watch。
 * 该表已承载「女优实体」，没有关注者的行不会进入关注检测；
 * 之后关注同一女优会复用同一 star key，不会产生重复实体。
 */
async function fillMissingActressCovers(
  db: D1Database,
  names: string[],
  covers: Map<string, string>
): Promise<void> {
  const missing = Array.from(new Set(names.filter((name) => !lookupCover(covers, name))));
  if (missing.length === 0) return;

  const deadline = Date.now() + COVER_FETCH_BUDGET_MS;
  const resolved = await mapWithConcurrency(missing, COVER_FETCH_CONCURRENCY, async (name) => {
    // 外部站点整体不可用时直接跳过，交给下次缓存过期再补，不能让榜单接口超时
    if (Date.now() >= deadline) return null;
    try {
      const star = await resolveStar(name, COVER_FETCH_TIMEOUT_MS);
      return star?.avatar ? { name, star } : null;
    } catch (err) {
      console.error(`[actress-ranking] resolve cover failed for ${name}:`, err);
      return null;
    }
  });

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const entry of resolved) {
    if (!entry) continue;
    const avatar = entry.star.avatar;
    if (!avatar) continue;
    covers.set(valueKey(entry.name), avatar);
    covers.set(valueKey(entry.star.name), avatar);
    statements.push(
      db
        .prepare(
          `INSERT INTO actress_watch (key, name, avatar, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET avatar = COALESCE(actress_watch.avatar, excluded.avatar)`
        )
        .bind(entry.star.key, entry.star.name, avatar, now)
    );
  }
  if (statements.length > 0) await db.batch(statements);
}

// ── 榜单聚合 ─────────────────────────────────────────────────────────

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

  const covers = await getLocalActressCovers(db);
  await fillMissingActressCovers(db, ranked.map((item) => item.name), covers);

  return {
    items: ranked.map((item) => {
      const cover = lookupCover(covers, item.name);
      return cover ? { ...item, cover } : item;
    }),
    updatedAt,
  };
}
