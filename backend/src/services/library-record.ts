/**
 * 本地库单条记录读取（只读）
 *
 * 供「搜索历史 / 收藏」点击后直接展示详情卡片使用。
 * data_records / data_record_sources 是全局共享的数据资产（不含用户字段），
 * 因此这里只做数据查询；路由层仍要求登录，避免匿名枚举数据。
 */
import { inspectJavCode } from '@codeseek/shared/utils';

export type LibraryRecordType = 'jav' | 'anime' | 'movie' | 'manga' | 'novel';

export const LIBRARY_RECORD_TYPES: LibraryRecordType[] = ['jav', 'anime', 'movie', 'manga', 'novel'];

export function isLibraryRecordType(value: string): value is LibraryRecordType {
  return (LIBRARY_RECORD_TYPES as string[]).includes(value);
}

export interface LibraryRecordSource {
  sourceName: string;
  sourceType: string | null;
  sourceUrl: string | null;
  sourceData: Record<string, unknown>;
}

export interface LibraryRecord {
  id: string;
  recordType: LibraryRecordType;
  title: string;
  cover?: string;
  code?: string;
  actors: string[];
  duration?: string;
  releaseDate?: string;
  publisher?: string;
  tags: string[];
  rating?: string;
  detailCompleted: boolean;
  /** 采集时保存的完整元数据（各类型结构不同，前端按类别解析） */
  contentData: Record<string, unknown>;
  sources: LibraryRecordSource[];
  firstSeenAt: number;
  lastUpdatedAt: number;
}

export interface LibraryRecordLookup {
  found: boolean;
  record?: LibraryRecord;
}

export interface LibraryRecordQuery {
  /** 类别提示（历史记录的 source / 收藏无法判定时为空） */
  type?: string;
  /** 历史记录的 code（jav 番号 / bgm:id / tmdb:id / manga:id / md5:id） */
  code?: string;
  /** 收藏的落地页 URL */
  url?: string;
  title?: string;
}

// ─── 内部辅助 ────────────────────────────────────────────────────────

interface RecordRow {
  id: string;
  record_type: string;
  title: string;
  cover: string | null;
  code: string | null;
  actors: string | null;
  duration: string | null;
  release_date: string | null;
  publisher: string | null;
  tags: string | null;
  rating: string | null;
  content_data: string;
  detail_completed: number;
  first_seen_at: number;
  last_updated_at: number;
}

const RECORD_COLUMNS = `id, record_type, title, cover, code, actors, duration, release_date,
  publisher, tags, rating, content_data, detail_completed, first_seen_at, last_updated_at`;

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    }
  } catch {
    // 兼容逗号分隔的旧数据
  }
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function pick(value: string | null): string | undefined {
  return value && value.trim() !== '' ? value : undefined;
}

/** 从 code / url 推断类别：历史与收藏都可能缺少可用的类别提示 */
function inferType(code: string, url: string): LibraryRecordType | undefined {
  if (/^bgm:/i.test(code) || /bgm\.tv\/subject\/\d+/i.test(url)) return 'anime';
  if (/^tmdb:/i.test(code) || /themoviedb\.org\/(?:movie|tv)\/\d+/i.test(url)) return 'movie';
  if (/^md5:/i.test(code)) return 'novel';
  if (/^manga:/i.test(code) || /mangadex\.org\/title\//i.test(url)) return 'manga';
  if (inspectJavCode(code).recognized) return 'jav';
  return undefined;
}

/** 可命中的 dedup_key 候选（按可靠性从高到低） */
function buildDedupKeys(type: LibraryRecordType, code: string, url: string): string[] {
  const keys: string[] = [];
  const push = (key: string) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  switch (type) {
    case 'jav': {
      const info = inspectJavCode(code);
      if (info.recognized) push(`jav:${info.code}`);
      break;
    }
    case 'anime': {
      if (/^bgm:/i.test(code)) push(`anime:${code.toLowerCase()}`);
      else if (/^\d+$/.test(code)) push(`anime:bgm:${code}`);
      const urlId = url.match(/bgm\.tv\/subject\/(\d+)/i)?.[1];
      if (urlId) push(`anime:bgm:${urlId}`);
      break;
    }
    case 'movie': {
      if (/^tmdb:/i.test(code)) push(`movie:${code.toLowerCase()}`);
      const urlId = url.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i)?.[1];
      if (urlId) push(`movie:tmdb:${urlId}`);
      break;
    }
    case 'manga': {
      const id = code.replace(/^manga:/i, '');
      if (id) push(`manga:${id}`);
      const urlId = url.match(/mangadex\.org\/title\/([^/?#]+)/i)?.[1];
      if (urlId) push(`manga:${urlId}`);
      break;
    }
    case 'novel': {
      const id = code.replace(/^md5:/i, '');
      if (id) {
        // 新 dedup_key 带站点前缀（zxcs/qishu），两站 id 空间重叠；xqs 为已下线旧站，仅用于匹配历史记录
        push(`novel:zxcs:${id}`);
        push(`novel:qishu:${id}`);
        push(`novel:xqs:${id}`);
        // 兼容旧数据：无前缀的 novel:{id}
        push(`novel:${id}`);
      }
      break;
    }
  }

  return keys;
}

/** data_records.code 列（原始 ID，不带类型前缀）候选 */
function buildCodeValues(code: string): string[] {
  const values: string[] = [];
  const push = (value: string) => {
    if (value && !values.includes(value)) values.push(value);
  };
  push(code);
  push(code.replace(/^md5:/i, ''));
  push(code.replace(/^bgm:/i, ''));
  push(code.replace(/^tmdb:/i, ''));
  push(code.replace(/^manga:/i, ''));
  return values;
}

async function loadSources(db: D1Database, recordId: string): Promise<LibraryRecordSource[]> {
  const rows = await db
    .prepare(
      `SELECT source_name, source_type, source_url, source_data
       FROM data_record_sources WHERE record_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .bind(recordId)
    .all<{ source_name: string; source_type: string | null; source_url: string | null; source_data: string | null }>();

  return (rows.results || []).map((row) => ({
    sourceName: row.source_name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourceData: parseObject(row.source_data || '{}'),
  }));
}

async function loadRecord(db: D1Database, recordId: string): Promise<LibraryRecord | null> {
  const row = await db
    .prepare(`SELECT ${RECORD_COLUMNS} FROM data_records WHERE id = ?`)
    .bind(recordId)
    .first<RecordRow>();
  if (!row || !isLibraryRecordType(row.record_type)) return null;

  const sources = await loadSources(db, row.id);

  return {
    id: row.id,
    recordType: row.record_type,
    title: row.title,
    cover: pick(row.cover),
    code: pick(row.code),
    actors: parseList(row.actors),
    duration: pick(row.duration),
    releaseDate: pick(row.release_date),
    publisher: pick(row.publisher),
    tags: parseList(row.tags),
    rating: pick(row.rating),
    detailCompleted: row.detail_completed === 1,
    contentData: parseObject(row.content_data),
    sources,
    firstSeenAt: Number(row.first_seen_at ?? 0),
    lastUpdatedAt: Number(row.last_updated_at ?? 0),
  };
}

async function findIdByQuery(
  db: D1Database,
  sql: string,
  binds: (string | number | null)[]
): Promise<string | null> {
  const row = await db.prepare(sql).bind(...binds).first<{ id: string }>();
  return row?.id ?? null;
}

// ─── 公开 API ────────────────────────────────────────────────────────

/**
 * 按「类别 + code/url/标题」读取单条本地库记录。
 *
 * 命中顺序（从可靠到宽松）：
 *   1. 类别 + dedup_key（来自历史 code / 收藏 URL 解析）
 *   2. 类别 + code 原始列
 *   3. 收藏落地页 URL 命中 data_record_sources.source_url
 *   4. content_data 内的 url / detailUrl 命中
 *   5. 标题精确匹配（最后兜底，避免标题改名后完全查不到）
 */
export async function getLibraryRecord(
  db: D1Database,
  query: LibraryRecordQuery
): Promise<LibraryRecordLookup> {
  const code = query.code?.trim() || '';
  const url = query.url?.trim() || '';
  const title = query.title?.trim() || '';
  const type = query.type && isLibraryRecordType(query.type)
    ? query.type
    : inferType(code, url);

  if (!type && !url && !title) return { found: false };

  let recordId: string | null = null;

  if (type) {
    for (const dedupKey of buildDedupKeys(type, code, url)) {
      recordId = await findIdByQuery(
        db,
        'SELECT id FROM data_records WHERE record_type = ? AND dedup_key = ? LIMIT 1',
        [type, dedupKey]
      );
      if (recordId) break;
    }

    if (!recordId && code) {
      for (const value of buildCodeValues(code)) {
        recordId = await findIdByQuery(
          db,
          'SELECT id FROM data_records WHERE record_type = ? AND code = ? LIMIT 1',
          [type, value]
        );
        if (recordId) break;
      }
    }
  }

  if (!recordId && url) {
    const typeClause = type ? 'AND r.record_type = ?' : '';
    recordId = await findIdByQuery(
      db,
      `SELECT r.id FROM data_records r
       JOIN data_record_sources s ON s.record_id = r.id
       WHERE s.source_url = ? ${typeClause}
       ORDER BY r.last_updated_at DESC LIMIT 1`,
      type ? [url, type] : [url]
    );
  }

  if (!recordId && url) {
    const typeClause = type ? 'AND record_type = ?' : '';
    recordId = await findIdByQuery(
      db,
      `SELECT id FROM data_records
       WHERE json_valid(content_data) = 1
         AND (json_extract(content_data, '$.url') = ? OR json_extract(content_data, '$.detailUrl') = ?)
         ${typeClause}
       ORDER BY last_updated_at DESC LIMIT 1`,
      type ? [url, url, type] : [url, url]
    );
  }

  if (!recordId && title) {
    const typeClause = type ? 'AND record_type = ?' : '';
    recordId = await findIdByQuery(
      db,
      `SELECT id FROM data_records
       WHERE title = ? ${typeClause}
       ORDER BY detail_completed DESC, last_updated_at DESC LIMIT 1`,
      type ? [title, type] : [title]
    );
  }

  if (!recordId) return { found: false };

  const record = await loadRecord(db, recordId);
  return record ? { found: true, record } : { found: false };
}
