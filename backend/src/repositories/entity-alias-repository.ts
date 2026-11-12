/**
 * 跨语言实体别名数据访问层
 *
 * 表结构见 database/32_schema_entity_aliases.sql。
 * 查询统一走 alias_key（NFKC + 小写 + 去空白/标点），写入做 upsert 幂等。
 */
import { aliasKey } from '@/services/query-normalizer';

export type EntityType = 'work' | 'person' | 'tag';

export interface EntityAliasRow {
  id: string;
  entity_type: EntityType;
  canonical_id: string;
  lang: string;
  alias: string;
  alias_key: string;
  source: string;
  confidence: number;
  created_at: number;
  updated_at: number;
}

export interface EntityAliasInput {
  entityType: EntityType;
  canonicalId: string;
  lang: string;
  alias: string;
  source: string;
  confidence?: number;
}

const MAX_LOOKUP_KEYS = 12;
const MAX_CANONICAL_IDS = 40;
const UPSERT_CHUNK = 40;

function nowMs(): number {
  return Date.now();
}

/** 按查询键批量查别名（用于把用户输入映射到 canonical_id） */
export async function findAliasRows(
  db: D1Database,
  keys: string[],
  entityType?: EntityType
): Promise<EntityAliasRow[]> {
  const clean = Array.from(new Set(keys.map(k => k.trim()).filter(Boolean))).slice(0, MAX_LOOKUP_KEYS);
  if (clean.length === 0) return [];

  const placeholders = clean.map(() => '?').join(',');
  const typeClause = entityType ? ' AND entity_type = ?' : '';
  const stmt = db.prepare(
    `SELECT * FROM entity_aliases
     WHERE alias_key IN (${placeholders})${typeClause}
     ORDER BY confidence DESC
     LIMIT 60`
  );
  const rows = entityType
    ? await stmt.bind(...clean, entityType).all<EntityAliasRow>()
    : await stmt.bind(...clean).all<EntityAliasRow>();
  return rows.results || [];
}

/** 按 canonical_id 取该实体的全部语言变体（一次拿全，供源站挑词） */
export async function listAliasRowsByCanonical(
  db: D1Database,
  entityType: EntityType,
  canonicalIds: string[]
): Promise<EntityAliasRow[]> {
  const ids = Array.from(new Set(canonicalIds.filter(Boolean))).slice(0, MAX_CANONICAL_IDS);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT * FROM entity_aliases
       WHERE entity_type = ? AND canonical_id IN (${placeholders})
       ORDER BY confidence DESC
       LIMIT 200`
    )
    .bind(entityType, ...ids)
    .all<EntityAliasRow>();
  return rows.results || [];
}

/** 幂等写入别名；返回实际提交的条数 */
export async function upsertAliasRows(db: D1Database, inputs: EntityAliasInput[]): Promise<number> {
  const rows = inputs
    .map(input => {
      const alias = input.alias.normalize('NFKC').replace(/\s+/g, ' ').trim();
      const key = aliasKey(alias);
      if (!alias || !key || alias.length > 120) return null;
      return {
        id: crypto.randomUUID(),
        entityType: input.entityType,
        canonicalId: input.canonicalId,
        lang: input.lang,
        alias,
        aliasKey: key,
        source: input.source,
        confidence: Math.min(1, Math.max(0, input.confidence ?? 0.9)),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // 同一批内去重，避免同一条语句重复 upsert
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    unique.set(`${row.entityType}|${row.canonicalId}|${row.lang}|${row.aliasKey}`, row);
  }
  const list = Array.from(unique.values());
  if (list.length === 0) return 0;

  const ts = nowMs();
  let written = 0;
  for (let i = 0; i < list.length; i += UPSERT_CHUNK) {
    const chunk = list.slice(i, i + UPSERT_CHUNK);
    const statements = chunk.map(row =>
      db
        .prepare(
          `INSERT INTO entity_aliases
             (id, entity_type, canonical_id, lang, alias, alias_key, source, confidence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(entity_type, canonical_id, lang, alias_key) DO UPDATE SET
             alias = excluded.alias,
             source = excluded.source,
             confidence = MAX(entity_aliases.confidence, excluded.confidence),
             updated_at = excluded.updated_at`
        )
        .bind(
          row.id,
          row.entityType,
          row.canonicalId,
          row.lang,
          row.alias,
          row.aliasKey,
          row.source,
          row.confidence,
          ts,
          ts
        )
    );
    await db.batch(statements);
    written += chunk.length;
  }
  return written;
}
