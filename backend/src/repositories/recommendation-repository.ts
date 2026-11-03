/**
 * 推荐数据访问层
 *
 * 收口推荐相关的 SQL：用户收藏/历史读取、候选作品查询、热门列表底稿。
 * 推荐打分、画像构建、热门排序等业务逻辑放在 services/recommendation.ts 与 services/hot-list.ts。
 */

export interface FavoriteRow {
  code: string | null;
  actors: string | null;
  tags: string | null;
  publisher: string | null;
}

export interface HistoryRow {
  query: string | null;
  code: string | null;
  actors: string | null;
  tags: string | null;
  publisher: string | null;
}

export interface JavRecordRow {
  id: string;
  code: string;
  title: string;
  cover: string | null;
  actors: string | null;
  tags: string | null;
  publisher: string | null;
  rating: string | null;
  detail_completed: number;
}

export interface RankingRow {
  record_id: string;
  source_name: string;
  source_data: string;
  created_at: number;
  code: string;
  title: string;
  cover: string | null;
  actors: string | null;
  tags: string | null;
  publisher: string | null;
  rating: string | null;
  detail_completed: number;
}

export interface SignalRow {
  user_id: string;
  query?: string | null;
  code: string | null;
  actors: string | null;
  tags: string | null;
  publisher: string | null;
}

const JAV_RECORD_COLUMNS = `
  id, code, title, cover, actors, tags, publisher, rating, detail_completed
`;

/** 读取用户收藏（上限 1000，与收藏表上限一致） */
export async function getUserFavoriteRows(
  db: D1Database,
  userId: string
): Promise<FavoriteRow[]> {
  const rows = await db
    .prepare(
      `SELECT code, actors, tags, publisher
       FROM user_favorites
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1000`
    )
    .bind(userId)
    .all<FavoriteRow>();
  return rows.results || [];
}

/** 读取用户 JAV 搜索历史（只看最近 200 条，足够构建画像） */
export async function getUserJavHistoryRows(
  db: D1Database,
  userId: string,
  limit = 200
): Promise<HistoryRow[]> {
  const rows = await db
    .prepare(
      `SELECT query, code, actors, tags, publisher
       FROM user_search_history
       WHERE user_id = ? AND source = 'jav_sources'
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(userId, limit)
    .all<HistoryRow>();
  return rows.results || [];
}

/** 用户 JAV 搜索历史总数（新用户判定用，不受 200 条读取上限影响） */
export async function countUserJavHistory(
  db: D1Database,
  userId: string
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count FROM user_search_history
       WHERE user_id = ? AND source = 'jav_sources'`
    )
    .bind(userId)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 用户已收藏的番号（用于推荐排除） */
export async function getUserFavoriteCodes(
  db: D1Database,
  userId: string
): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT code FROM user_favorites
       WHERE user_id = ? AND code IS NOT NULL`
    )
    .bind(userId)
    .all<{ code: string }>();
  return (rows.results || []).map((r) => r.code);
}

/** 按番号读取库内 JAV 记录（相关推荐种子回查） */
export async function getJavRecordByCode(
  db: D1Database,
  code: string
): Promise<JavRecordRow | null> {
  return db
    .prepare(
      `SELECT ${JAV_RECORD_COLUMNS}
       FROM data_records
       WHERE record_type = 'jav' AND code = ?
       LIMIT 1`
    )
    .bind(code)
    .first<JavRecordRow>();
}

/**
 * 按演员/标签/发行商召回候选作品。
 * LIKE 只用于召回，精确匹配与打分在 service 层按解析后的值做，避免子串误命中。
 */
export async function findJavCandidatesBySeeds(
  db: D1Database,
  seeds: { actors: string[]; tags: string[]; publisher?: string },
  limit: number
): Promise<JavRecordRow[]> {
  const clauses: string[] = [];
  const values: string[] = [];

  for (const actor of seeds.actors) {
    clauses.push('actors LIKE ?');
    values.push(`%${actor}%`);
  }
  for (const tag of seeds.tags) {
    clauses.push('tags LIKE ?');
    values.push(`%${tag}%`);
  }
  if (seeds.publisher) {
    clauses.push('publisher = ?');
    values.push(seeds.publisher);
  }

  if (clauses.length === 0) return [];

  const rows = await db
    .prepare(
      `SELECT ${JAV_RECORD_COLUMNS}
       FROM data_records
       WHERE record_type = 'jav'
         AND status = 'active'
         AND detail_completed = 1
         AND code IS NOT NULL
         AND (${clauses.join(' OR ')})
       ORDER BY last_updated_at DESC
       LIMIT ?`
    )
    .bind(...values, limit)
    .all<JavRecordRow>();
  return rows.results || [];
}

/** 按番号批量读取库内 JAV 记录（热门列表用） */
export async function getJavRecordsByCodes(
  db: D1Database,
  codes: string[]
): Promise<JavRecordRow[]> {
  if (codes.length === 0) return [];
  const unique = Array.from(new Set(codes)).slice(0, 100);
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT ${JAV_RECORD_COLUMNS}
       FROM data_records
       WHERE record_type = 'jav'
         AND status = 'active'
         AND code IN (${placeholders})`
    )
    .bind(...unique)
    .all<JavRecordRow>();
  return rows.results || [];
}

/** 最近入库的 active JAV 记录（热门列表兜底） */
export async function getRecentJavRecords(
  db: D1Database,
  limit: number
): Promise<JavRecordRow[]> {
  const rows = await db
    .prepare(
      `SELECT ${JAV_RECORD_COLUMNS}
       FROM data_records
       WHERE record_type = 'jav'
         AND status = 'active'
         AND detail_completed = 1
         AND code IS NOT NULL
       ORDER BY first_seen_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<JavRecordRow>();
  return rows.results || [];
}

/** 近 7 天导入的榜单行（热门列表第一优先级） */
export async function getRankingRows(db: D1Database): Promise<RankingRow[]> {
  const rows = await db
    .prepare(
      `SELECT rs.record_id, rs.source_name, rs.source_data, rs.created_at,
              dr.code, dr.title, dr.cover, dr.actors, dr.tags, dr.publisher,
              dr.rating, dr.detail_completed
       FROM data_record_sources rs
       INNER JOIN data_records dr ON dr.id = rs.record_id
       WHERE rs.source_type = 'ranking'
         AND dr.record_type = 'jav'
         AND dr.status = 'active'`
    )
    .all<RankingRow>();
  return rows.results || [];
}

/**
 * 读取站内热度底稿：近 N 天收藏与 JAV 搜索历史。
 * 行数有上限，避免一次拉取过多；去重统计在 service 层做。
 */
export async function getInternalSignalRows(
  db: D1Database,
  since: number,
  favoriteLimit = 5000,
  historyLimit = 20000
): Promise<{ favorites: SignalRow[]; history: SignalRow[] }> {
  const [favorites, history] = await Promise.all([
    db
      .prepare(
        `SELECT user_id, code, actors, tags, publisher
         FROM user_favorites
         WHERE created_at >= ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(since, favoriteLimit)
      .all<SignalRow>(),
    db
      .prepare(
        `SELECT user_id, query, code, actors, tags, publisher
         FROM user_search_history
         WHERE created_at >= ? AND source = 'jav_sources'
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(since, historyLimit)
      .all<SignalRow>(),
  ]);

  return {
    favorites: favorites.results || [],
    history: history.results || [],
  };
}
