/**
 * 推荐标签数据访问层
 *
 * 收口 jav_genres / jav_genre_pages 及推荐标签所需的用户信号查询。
 * 所有 SQL 只出现在本文件；算法与页面抓取在 services 层。
 */

import { cached, invalidateCache } from '@/utils/cache';

export type GenreSection = 'censored' | 'uncensored';

export interface GenreRow {
  id: string;
  name_key: string;
  name: string;
  genre_key: string;
  section: GenreSection;
  url: string;
  is_technical: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface GenreInsertRow {
  id: string;
  name_key: string;
  name: string;
  genre_key: string;
  section: GenreSection;
  url: string;
  is_technical: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface GenreSectionStat {
  section: GenreSection;
  count: number;
  last_updated_at: number;
}

export interface GenrePageState {
  name_key: string;
  max_page_seen: number;
  last_page: number;
  last_page_p: number;
  probed_at: number;
  updated_at: number;
}

export interface GenreSignalRow {
  code: string | null;
  tags: string | null;
  created_at: number;
}

/** 词典中可用于推荐的标签（已排除技术/发行属性标签） */
export async function getUsableGenres(db: D1Database): Promise<GenreRow[]> {
  // 标签词典每周才同步一次，读路径做 10 分钟进程内缓存；同步写库后主动失效。
  return cached('jav:dict:genres', 10 * 60_000, async () => {
    const rows = await db
      .prepare(
        `SELECT id, name_key, name, genre_key, section, url, is_technical, sort_order, created_at, updated_at
         FROM jav_genres
         WHERE is_technical = 0
         ORDER BY section ASC, sort_order ASC, name ASC`
      )
      .all<GenreRow>();
    return rows.results || [];
  });
}

/** 按 name_key 精确读取词典行（作品接口校验入参） */
export async function getGenreByKey(
  db: D1Database,
  nameKey: string
): Promise<GenreRow | null> {
  return db
    .prepare(
      `SELECT id, name_key, name, genre_key, section, url, is_technical, sort_order, created_at, updated_at
       FROM jav_genres
       WHERE name_key = ?
       LIMIT 1`
    )
    .bind(nameKey)
    .first<GenreRow>();
}

/** 各 section 的标签数与最后更新时间（同步到期判定） */
export async function getGenreSectionStats(db: D1Database): Promise<GenreSectionStat[]> {
  const rows = await db
    .prepare(
      `SELECT section, COUNT(*) AS count, MAX(updated_at) AS last_updated_at
       FROM jav_genres
       GROUP BY section`
    )
    .all<GenreSectionStat>();
  return rows.results || [];
}

/**
 * 原子替换单个 section 的词典：
 * D1 的 batch 是事务，避免"删了没插进去"的空窗。
 * INSERT OR IGNORE 保证同名标签只保留一条（有码优先，先同步 censored）。
 */
export async function replaceSectionGenres(
  db: D1Database,
  section: GenreSection,
  rows: GenreInsertRow[]
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM jav_genres WHERE section = ?').bind(section),
  ];

  for (const row of rows) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO jav_genres
             (id, name_key, name, genre_key, section, url, is_technical, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id, row.name_key, row.name, row.genre_key, row.section,
          row.url, row.is_technical, row.sort_order, row.created_at, row.updated_at
        )
    );
  }

  // 标签数通常 < 100：单批执行保证 section 替换的原子性；
  // 极端情况下超过单批上限时退化为分批，仍先删后插。
  if (statements.length <= 100) {
    await db.batch(statements);
    invalidateCache('jav:dict');
    return;
  }
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }
  invalidateCache('jav:dict');
}

/** 读取标签分页状态（无记录时返回 null，由调用方按初始值处理） */
export async function getGenrePageState(
  db: D1Database,
  nameKey: string
): Promise<GenrePageState | null> {
  return db
    .prepare(
      `SELECT name_key, max_page_seen, last_page, last_page_p, probed_at, updated_at
       FROM jav_genre_pages
       WHERE name_key = ?
       LIMIT 1`
    )
    .bind(nameKey)
    .first<GenrePageState>();
}

/** 写入/更新标签分页状态 */
export async function saveGenrePageState(
  db: D1Database,
  state: GenrePageState
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO jav_genre_pages
         (name_key, max_page_seen, last_page, last_page_p, probed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name_key) DO UPDATE SET
         max_page_seen = excluded.max_page_seen,
         last_page = excluded.last_page,
         last_page_p = excluded.last_page_p,
         probed_at = excluded.probed_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      state.name_key, state.max_page_seen, state.last_page,
      state.last_page_p, state.probed_at, state.updated_at
    )
    .run();
}

/** 推荐标签的收藏信号（上限 1000，与收藏表上限一致） */
export async function getGenreFavoriteSignals(
  db: D1Database,
  userId: string,
  limit: number
): Promise<GenreSignalRow[]> {
  const rows = await db
    .prepare(
      `SELECT code, tags, created_at
       FROM user_favorites
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(userId, limit)
    .all<GenreSignalRow>();
  return rows.results || [];
}

/** 推荐标签的历史信号（只看最近 200 条 JAV 搜索记录） */
export async function getGenreHistorySignals(
  db: D1Database,
  userId: string,
  limit: number
): Promise<GenreSignalRow[]> {
  const rows = await db
    .prepare(
      `SELECT code, tags, created_at
       FROM user_search_history
       WHERE user_id = ? AND source = 'jav_sources'
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(userId, limit)
    .all<GenreSignalRow>();
  return rows.results || [];
}

/** 批量判定当前用户已收藏的作品番号 */
export async function getFavoriteCodesAmong(
  db: D1Database,
  userId: string,
  codes: string[]
): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const unique = Array.from(new Set(codes)).slice(0, 100);
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT code FROM user_favorites
       WHERE user_id = ? AND code IN (${placeholders})`
    )
    .bind(userId, ...unique)
    .all<{ code: string }>();
  return new Set((rows.results || []).map((row) => row.code));
}
