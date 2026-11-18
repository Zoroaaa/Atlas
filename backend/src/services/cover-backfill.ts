/**
 * 本地库封面回填（D1 账本 + R2 对象）
 *
 * - 由每分钟 cron 推进，默认 20 条/批，可在「封面管理」页暂停/调批次；
 * - 只处理 data_records.cover，不回写该字段；
 * - 幂等：先 head R2，对象已存在就直接记账本，不重复下载；
 * - 与 jav-detail-job 串行执行，避免同时对 JavBus 发起两拨请求。
 */
import type { Env } from '@/types';
import { DB_CONFIG_KEYS } from '@/constants';
import { ConfigService } from './config';
import { withCronLock } from './cron-lock';
import {
  coverObjectRef,
  invalidCoverObjectRef,
  type CoverObjectRef,
  type CoverNamespace,
} from './media-key';
import {
  MAX_COVER_BYTES,
  buildCoverFetchHeaders,
  clearCoverTombstone,
  detectImageMime,
  putCoverObject,
  putCoverTombstone,
  readBodyWithLimit,
} from './media-store';

const LOCK_KEY = 'cover-backfill';
/** 单条最坏耗时（10s 超时 + 限速/写入）；锁租约按批次推算，避免跑一半就过期 */
const PER_RECORD_LOCK_MS = 12_000;
const MIN_LOCK_TTL_MS = 55_000;
const MAX_LOCK_TTL_MS = 20 * 60_000;
const MAX_ATTEMPTS = 5;
const MISSING_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
/** 第 1/2/3/4 次失败后的等待时间；第 5 次直接耗尽 */
const RETRY_BACKOFF_MS = [60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000, 3 * 24 * 60 * 60_000];

export interface CoverBackfillSettings {
  enabled: boolean;
  batchSize: number;
}

export interface CoverBackfillBatchResult {
  ran: boolean;
  processed: number;
  stored: number;
  skipped: number;
  failed: number;
  missing: number;
}

export interface CoverTypeStats {
  type: string;
  total: number;
  ready: number;
  missing: number;
  failed: number;
  pending: number;
}

export interface CoverFailureItem {
  url: string;
  namespace: CoverNamespace;
  status: 'missing' | 'failed';
  lastError: string | null;
  attempts: number;
  retryExhausted: boolean;
  nextRetryAt: number;
}

export interface CoverStats {
  totalWithCover: number;
  ready: number;
  missing: number;
  failed: number;
  pending: number;
  readyBytes: number;
  /** 已耗尽重试的失败封面数（asset 维度，不是记录数） */
  retryExhausted: number;
  byType: CoverTypeStats[];
  recentFailures: CoverFailureItem[];
  enabled: boolean;
  batchSize: number;
  r2Ready: boolean;
  publicBase: string | null;
}

interface PendingRecord {
  id: string;
  record_type: string;
  cover: string;
}

interface RetryAsset {
  url_hash: string;
  url: string;
  attempts: number;
}

interface ExistingAsset {
  status: 'ready' | 'missing' | 'failed';
  attempts: number;
  retry_exhausted: number;
  next_retry_at: number;
}

/** 同一 isolate 内跨批次保留，避免每分钟重新起算限速间隔 */
const hostLastFetchAt = new Map<string, number>();

function hostGapMs(host: string): number {
  if (host.endsWith('javbus.com')) return 500;
  if (host.endsWith('javdb.com') || host.endsWith('jdbstatic.com') || host === 'tp.spfcas.com') return 500;
  if (host === 'lain.bgm.tv') return 200;
  if (host === 'image.tmdb.org') return 100;
  if (host === 'uploads.mangadex.org') return 200;
  if (host.includes('annas-archive.') || host.includes('z-lib.')) return 500;
  if (host === 'www.minnano-av.com') return 500;
  return 300;
}

async function paceHost(host: string): Promise<void> {
  const wait = (hostLastFetchAt.get(host) ?? 0) + hostGapMs(host) - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  hostLastFetchAt.set(host, Date.now());
}

function readBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export async function getCoverBackfillSettings(db: D1Database): Promise<CoverBackfillSettings> {
  try {
    const { results } = await db
      .prepare('SELECT key, value FROM system_config WHERE key IN (?, ?)')
      .bind(DB_CONFIG_KEYS.COVER_BACKFILL_ENABLED, DB_CONFIG_KEYS.COVER_BACKFILL_BATCH_SIZE)
      .all<{ key: string; value: string | null }>();
    const map = new Map((results || []).map((row) => [row.key, row.value]));
    const rawSize = Number(map.get(DB_CONFIG_KEYS.COVER_BACKFILL_BATCH_SIZE) ?? 20);
    return {
      enabled: readBoolean(map.get(DB_CONFIG_KEYS.COVER_BACKFILL_ENABLED), false),
      batchSize: Number.isFinite(rawSize) ? Math.min(100, Math.max(1, Math.round(rawSize))) : 20,
    };
  } catch {
    return { enabled: false, batchSize: 20 };
  }
}

export async function setCoverBackfillSettings(
  db: D1Database,
  patch: { enabled?: boolean; batchSize?: number },
): Promise<CoverBackfillSettings> {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  if (patch.enabled !== undefined) {
    statements.push(
      db.prepare(
        `INSERT INTO system_config
           (key, value, description, config_type, config_group, is_public, is_sensitive, created_at, updated_at)
         VALUES (?, ?, ?, 'boolean', 'features', 0, 0, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(
        DB_CONFIG_KEYS.COVER_BACKFILL_ENABLED,
        patch.enabled ? '1' : '0',
        '是否推进本地库封面回填到 R2',
        now,
        now,
      )
    );
  }

  if (patch.batchSize !== undefined) {
    const size = Math.min(100, Math.max(1, Math.round(patch.batchSize)));
    statements.push(
      db.prepare(
        `INSERT INTO system_config
           (key, value, description, config_type, config_group, is_public, is_sensitive, created_at, updated_at)
         VALUES (?, ?, ?, 'integer', 'features', 0, 0, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(
        DB_CONFIG_KEYS.COVER_BACKFILL_BATCH_SIZE,
        String(size),
        '封面回填每分钟处理条数（1-100）',
        now,
        now,
      )
    );
  }

  if (statements.length > 0) await db.batch(statements);
  // 配置服务有 60 秒缓存：直接写库后清掉，避免系统配置页显示旧值
  ConfigService.clearCache();
  return getCoverBackfillSettings(db);
}

async function selectPendingRecords(db: D1Database, limit: number): Promise<PendingRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.record_type, d.cover
       FROM data_records d
       LEFT JOIN data_record_covers c ON c.record_id = d.id
       WHERE d.cover IS NOT NULL AND trim(d.cover) <> ''
         AND (c.record_id IS NULL OR c.cover_url <> d.cover)
       ORDER BY d.last_updated_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<PendingRecord>();
  return results || [];
}

async function selectRetryAssets(
  db: D1Database,
  limit: number,
  now: number,
): Promise<RetryAsset[]> {
  if (limit <= 0) return [];
  const { results } = await db
    .prepare(
      `SELECT url_hash, url, attempts
       FROM cover_assets
       WHERE status IN ('failed', 'missing')
         AND retry_exhausted = 0
         AND next_retry_at <= ?
       ORDER BY next_retry_at ASC
       LIMIT ?`
    )
    .bind(now, limit)
    .all<RetryAsset>();
  return results || [];
}

/** 待迁移 / 重试的批次配额拆分：给重试固定预留 20%，避免迁移期间失败项永远排不上 */
export function resolveBatchQuota(batchSize: number): { pendingLimit: number; retryReserve: number } {
  const size = Math.max(1, Math.round(batchSize));
  const retryReserve = size <= 1 ? 0 : Math.max(1, Math.ceil(size * 0.2));
  return { pendingLimit: Math.max(1, size - retryReserve), retryReserve };
}

/** 锁租约按批次最坏耗时推算，限制在 [55s, 20min] */
export function resolveLockTtl(batchSize: number): number {
  const size = Math.max(1, Math.round(batchSize));
  return Math.min(MAX_LOCK_TTL_MS, Math.max(MIN_LOCK_TTL_MS, size * PER_RECORD_LOCK_MS));
}

async function getExistingAsset(db: D1Database, urlHash: string): Promise<ExistingAsset | null> {
  return await db
    .prepare(
      `SELECT status, attempts, retry_exhausted, next_retry_at
       FROM cover_assets
       WHERE url_hash = ?`
    )
    .bind(urlHash)
    .first<ExistingAsset>();
}

async function upsertRecordCover(
  db: D1Database,
  recordId: string,
  coverUrl: string,
  urlHash: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO data_record_covers (record_id, cover_url, url_hash, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(record_id) DO UPDATE SET
         cover_url = excluded.cover_url,
         url_hash = excluded.url_hash,
         updated_at = excluded.updated_at`
    )
    .bind(recordId, coverUrl, urlHash, now)
    .run();
}

async function saveReady(
  db: D1Database,
  ref: CoverObjectRef,
  contentType: string,
  byteSize: number,
  now: number,
): Promise<void> {
  const sourceHost = new URL(ref.normalizedUrl).hostname;
  await db
    .prepare(
      `INSERT INTO cover_assets
         (url_hash, url, namespace, object_key, status, mime_type, byte_size, source_host,
          attempts, retry_exhausted, last_error, next_retry_at, first_seen_at, stored_at, updated_at)
       VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, 0, 0, NULL, 0, ?, ?, ?)
       ON CONFLICT(url_hash) DO UPDATE SET
         url = excluded.url,
         namespace = excluded.namespace,
         object_key = excluded.object_key,
         status = 'ready',
         mime_type = excluded.mime_type,
         byte_size = excluded.byte_size,
         source_host = excluded.source_host,
         retry_exhausted = 0,
         last_error = NULL,
         next_retry_at = 0,
         stored_at = excluded.stored_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      ref.hash,
      ref.normalizedUrl,
      ref.namespace,
      ref.objectKey,
      contentType,
      byteSize,
      sourceHost,
      now,
      now,
      now,
    )
    .run();
}

async function saveFailure(
  db: D1Database,
  ref: CoverObjectRef,
  status: 'missing' | 'failed',
  error: string,
  attempts: number,
  exhausted: boolean,
  nextRetryAt: number,
  now: number,
): Promise<void> {
  let sourceHost = '';
  try {
    sourceHost = new URL(ref.normalizedUrl).hostname;
  } catch {
    // 非法 URL：保留空 host，仅用于账本审计
  }
  await db
    .prepare(
      `INSERT INTO cover_assets
         (url_hash, url, namespace, object_key, status, mime_type, byte_size, source_host,
          attempts, retry_exhausted, last_error, next_retry_at, first_seen_at, stored_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(url_hash) DO UPDATE SET
         url = excluded.url,
         namespace = excluded.namespace,
         object_key = excluded.object_key,
         status = excluded.status,
         source_host = excluded.source_host,
         attempts = excluded.attempts,
         retry_exhausted = excluded.retry_exhausted,
         last_error = excluded.last_error,
         next_retry_at = excluded.next_retry_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      ref.hash,
      ref.normalizedUrl,
      ref.namespace,
      ref.objectKey,
      status,
      sourceHost,
      attempts,
      exhausted ? 1 : 0,
      error.slice(0, 500),
      nextRetryAt,
      now,
      now,
    )
    .run();
}

type FetchOutcome =
  | { status: 'ready'; contentType: string; byteSize: number }
  | { status: 'missing'; error: string }
  | { status: 'failed'; error: string; exhausted: boolean };

async function fetchAndStore(env: Env, ref: CoverObjectRef): Promise<FetchOutcome> {
  if (!env.MEDIA) return { status: 'failed', error: 'R2_NOT_BOUND', exhausted: true };

  const target = new URL(ref.normalizedUrl);
  await paceHost(target.hostname);

  let resp: Response;
  try {
    resp = await fetch(ref.normalizedUrl, {
      headers: buildCoverFetchHeaders(target),
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
  } catch (err) {
    return { status: 'failed', error: `NETWORK: ${(err as Error).message || 'fetch failed'}`, exhausted: false };
  }

  if (resp.status === 404 || resp.status === 410) {
    return { status: 'missing', error: `HTTP_${resp.status}` };
  }
  if (!resp.ok) {
    return { status: 'failed', error: `HTTP_${resp.status}`, exhausted: false };
  }

  const data = await readBodyWithLimit(resp, MAX_COVER_BYTES);
  if (!data) {
    return { status: 'failed', error: 'TOO_LARGE', exhausted: true };
  }
  if (data.byteLength === 0) {
    return { status: 'failed', error: 'EMPTY_BODY', exhausted: true };
  }

  const upstreamType = resp.headers.get('content-type')?.split(';')[0].trim() || '';
  const contentType = upstreamType.startsWith('image/') ? upstreamType : detectImageMime(data);
  if (!contentType) {
    return { status: 'failed', error: `NOT_IMAGE: ${upstreamType || 'unknown'}`, exhausted: true };
  }

  await putCoverObject(env, ref.objectKey, data, contentType, target.hostname);
  await clearCoverTombstone(env, ref.hash);
  return { status: 'ready', contentType, byteSize: data.byteLength };
}

async function markReadyFromR2(
  env: Env,
  db: D1Database,
  ref: CoverObjectRef,
  now: number,
): Promise<boolean> {
  if (!env.MEDIA) return false;
  const head = await env.MEDIA.head(ref.objectKey);
  if (!head) return false;
  await saveReady(
    db,
    ref,
    head.httpMetadata?.contentType || 'application/octet-stream',
    head.size,
    now,
  );
  await clearCoverTombstone(env, ref.hash);
  return true;
}

async function processPendingRecord(
  env: Env,
  record: PendingRecord,
  now: number,
): Promise<'stored' | 'skipped' | 'failed' | 'missing'> {
  let ref = await coverObjectRef(record.cover);
  if (!ref) {
    // 不可归一化 / 不在白名单：记账本并耗尽重试，避免每批反复选中同一条坏数据
    ref = await invalidCoverObjectRef(record.cover);
    await saveFailure(env.DB, ref, 'failed', 'INVALID_URL', 1, true, 0, now);
    await upsertRecordCover(env.DB, record.id, record.cover, ref.hash, now);
    return 'failed';
  }

  if (await markReadyFromR2(env, env.DB, ref, now)) {
    await upsertRecordCover(env.DB, record.id, record.cover, ref.hash, now);
    return 'skipped';
  }

  // URL 已在失败/缺失账本中：只补记录映射，抓取与 attempts 交给重试队列推进。
  // 否则新记录复用同一失败 URL 会立即重新抓取，并把 attempts 重置为 1、retry_exhausted 清零。
  const existing = await getExistingAsset(env.DB, ref.hash);
  if (existing && existing.status !== 'ready') {
    await upsertRecordCover(env.DB, record.id, record.cover, ref.hash, now);
    return 'skipped';
  }

  const outcome = await fetchAndStore(env, ref);
  await upsertRecordCover(env.DB, record.id, record.cover, ref.hash, now);

  if (outcome.status === 'ready') {
    await saveReady(env.DB, ref, outcome.contentType, outcome.byteSize, now);
    return 'stored';
  }
  if (outcome.status === 'missing') {
    await putCoverTombstone(env, ref.hash, outcome.error).catch(() => undefined);
    await saveFailure(env.DB, ref, 'missing', outcome.error, 1, false, now + MISSING_RETRY_MS, now);
    return 'missing';
  }
  await putCoverTombstone(env, ref.hash, outcome.error).catch(() => undefined);
  const next = outcome.exhausted ? 0 : now + (RETRY_BACKOFF_MS[0] ?? 0);
  await saveFailure(env.DB, ref, 'failed', outcome.error, 1, outcome.exhausted, next, now);
  return 'failed';
}

async function processRetryAsset(
  env: Env,
  asset: RetryAsset,
  now: number,
): Promise<'stored' | 'skipped' | 'failed' | 'missing'> {
  // 必须按当前规则重算 key：白名单/归一化变化后，账本里的旧 object_key 会写偏，
  // 导致代理按新 key 找不到对象，同时产生重复对象。
  const ref = await coverObjectRef(asset.url);
  if (!ref) {
    // URL 不可解析或 host 已不再放行：标记耗尽，避免每批重复选中
    await env.DB
      .prepare('UPDATE cover_assets SET retry_exhausted = 1, next_retry_at = 0, updated_at = ? WHERE url_hash = ?')
      .bind(now, asset.url_hash)
      .run();
    return 'failed';
  }

  // 归一化规则变化导致 hash 变了：把记录映射迁到新 hash，并清掉旧账本，
  // 否则旧行会一直被重试队列选中，形成重复抓取。
  if (ref.hash !== asset.url_hash) {
    await env.DB.batch([
      env.DB.prepare('UPDATE data_record_covers SET url_hash = ? WHERE url_hash = ?')
        .bind(ref.hash, asset.url_hash),
      env.DB.prepare('DELETE FROM cover_assets WHERE url_hash = ?')
        .bind(asset.url_hash),
    ]);
  }

  if (await markReadyFromR2(env, env.DB, ref, now)) return 'skipped';

  const outcome = await fetchAndStore(env, ref);
  if (outcome.status === 'ready') {
    await saveReady(env.DB, ref, outcome.contentType, outcome.byteSize, now);
    return 'stored';
  }

  const attempts = (asset.attempts || 0) + 1;
  if (outcome.status === 'missing') {
    // 源站 404/410：30 天后再试一次，第二次仍缺失就耗尽
    const exhausted = attempts >= 2;
    await putCoverTombstone(env, ref.hash, outcome.error).catch(() => undefined);
    await saveFailure(env.DB, ref, 'missing', outcome.error, attempts, exhausted, exhausted ? 0 : now + MISSING_RETRY_MS, now);
    return 'missing';
  }

  const exhausted = outcome.exhausted || attempts >= MAX_ATTEMPTS;
  const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)] ?? 0;
  await putCoverTombstone(env, ref.hash, outcome.error).catch(() => undefined);
  await saveFailure(
    env.DB,
    ref,
    'failed',
    outcome.error,
    attempts,
    exhausted,
    exhausted ? 0 : now + backoff,
    now,
  );
  return 'failed';
}

export async function runCoverBackfillBatch(env: Env): Promise<CoverBackfillBatchResult> {
  const empty: CoverBackfillBatchResult = {
    ran: false, processed: 0, stored: 0, skipped: 0, failed: 0, missing: 0,
  };
  if (!env.MEDIA) return empty;

  const settings = await getCoverBackfillSettings(env.DB);
  if (!settings.enabled) return empty;

  const { pendingLimit } = resolveBatchQuota(settings.batchSize);
  const lockTtl = resolveLockTtl(settings.batchSize);

  const result = await withCronLock(env.DB, LOCK_KEY, lockTtl, async () => {
    const now = Date.now();
    const pending = await selectPendingRecords(env.DB, pendingLimit);
    const retries = await selectRetryAssets(env.DB, settings.batchSize - pending.length, now);

    const counts: CoverBackfillBatchResult = {
      ran: true, processed: 0, stored: 0, skipped: 0, failed: 0, missing: 0,
    };

    for (const record of pending) {
      try {
        const outcome = await processPendingRecord(env, record, Date.now());
        counts[outcome] += 1;
      } catch (err) {
        console.error('[cover-backfill] pending record failed:', record.id, err);
        counts.failed += 1;
      }
      counts.processed += 1;
    }

    for (const asset of retries) {
      try {
        const outcome = await processRetryAsset(env, asset, Date.now());
        counts[outcome] += 1;
      } catch (err) {
        console.error('[cover-backfill] retry asset failed:', asset.url_hash, err);
        counts.failed += 1;
      }
      counts.processed += 1;
    }

    return counts;
  });

  return result ?? empty;
}

/** 孤儿封面回收：账本行超过 30 天没有任何记录引用，才删除对象与账本 */
const GC_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 失败墓碑只是短期负缓存，超过 1 天即可清理 */
const TOMBSTONE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TOMBSTONE_PREFIX = 'covers/v1/miss/';

export async function gcOrphanCoverAssets(
  env: Env,
  limit = 100,
): Promise<{ assets: number; tombstones: number }> {
  if (!env.MEDIA) return { assets: 0, tombstones: 0 };
  const now = Date.now();

  const { results } = await env.DB
    .prepare(
      `SELECT a.url_hash, a.object_key
       FROM cover_assets a
       LEFT JOIN data_record_covers c ON c.url_hash = a.url_hash
       WHERE c.url_hash IS NULL AND a.updated_at < ?
       LIMIT ?`
    )
    .bind(now - GC_MIN_AGE_MS, limit)
    .all<{ url_hash: string; object_key: string }>();

  let assets = 0;
  for (const row of results || []) {
    try {
      await env.MEDIA.delete(row.object_key);
    } catch (err) {
      // 对象删除失败就保留账本，交给下一轮 GC，避免账本丢了对象还在
      console.error('[cover-gc] object delete failed:', row.object_key, err);
      continue;
    }
    await env.DB.prepare('DELETE FROM cover_assets WHERE url_hash = ?').bind(row.url_hash).run();
    assets += 1;
  }

  let tombstones = 0;
  try {
    const listed = await env.MEDIA.list({ prefix: TOMBSTONE_PREFIX, limit });
    for (const object of listed.objects) {
      if (now - object.uploaded.getTime() < TOMBSTONE_MAX_AGE_MS) continue;
      await env.MEDIA.delete(object.key);
      tombstones += 1;
    }
  } catch (err) {
    console.error('[cover-gc] tombstone cleanup failed:', err);
  }

  return { assets, tombstones };
}

/** 管理端「重新入队」：清空失败计数与退避，让失败项重新走一轮完整重试 */
export async function requeueCoverFailures(
  db: D1Database,
  now = Date.now(),
): Promise<{ requeued: number }> {
  const result = await db
    .prepare(
      `UPDATE cover_assets
       SET attempts = 0, retry_exhausted = 0, next_retry_at = 0, updated_at = ?
       WHERE status IN ('failed', 'missing')`
    )
    .bind(now)
    .run();
  return { requeued: result.meta.changes ?? 0 };
}

export async function getCoverStats(env: Env): Promise<CoverStats> {
  const settings = await getCoverBackfillSettings(env.DB);

  const [byTypeResult, failuresResult, assetResult, problemsResult] = (await env.DB.batch([
    // 一次分组扫描同时得到总量与分类分布，避免再对 data_records 全表聚合一次
    env.DB.prepare(
      `SELECT
         d.record_type AS type,
         COUNT(*) AS total,
         SUM(CASE WHEN a.status = 'ready' THEN 1 ELSE 0 END) AS ready,
         SUM(CASE WHEN a.status = 'missing' THEN 1 ELSE 0 END) AS missing,
         SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM data_records d
       LEFT JOIN data_record_covers c ON c.record_id = d.id
       LEFT JOIN cover_assets a ON a.url_hash = c.url_hash
       WHERE d.cover IS NOT NULL AND trim(d.cover) <> ''
       GROUP BY d.record_type
       ORDER BY total DESC`
    ),
    env.DB.prepare(
      `SELECT url, namespace, status, last_error, attempts, retry_exhausted, next_retry_at
       FROM cover_assets
       WHERE status IN ('failed', 'missing')
       ORDER BY updated_at DESC
       LIMIT 10`
    ),
    // 存储占用按 url_hash 去重：同一封面被多条记录引用时不能重复累加
    env.DB.prepare(
      `SELECT COUNT(*) AS assets, COALESCE(SUM(byte_size), 0) AS bytes
       FROM cover_assets
       WHERE status = 'ready'`
    ),
    env.DB.prepare(
      `SELECT
         COUNT(*) AS problems,
         SUM(CASE WHEN retry_exhausted = 1 THEN 1 ELSE 0 END) AS exhausted
       FROM cover_assets
       WHERE status IN ('failed', 'missing')`
    ),
  ])) as unknown as [
    { results: Array<Record<string, unknown>> },
    { results: Array<Record<string, unknown>> },
    { results: Array<Record<string, unknown>> },
    { results: Array<Record<string, unknown>> },
  ];

  const num = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  let totalWithCover = 0;
  let ready = 0;
  let missing = 0;
  let failed = 0;

  const byType: CoverTypeStats[] = (byTypeResult.results || []).map((item) => {
    const total = num(item.total);
    const typeReady = num(item.ready);
    const typeMissing = num(item.missing);
    const typeFailed = num(item.failed);
    totalWithCover += total;
    ready += typeReady;
    missing += typeMissing;
    failed += typeFailed;
    return {
      type: String(item.type ?? ''),
      total,
      ready: typeReady,
      missing: typeMissing,
      failed: typeFailed,
      pending: Math.max(0, total - typeReady - typeMissing - typeFailed),
    };
  });

  const assetRow = (assetResult.results || [])[0] ?? {};
  const problemRow = (problemsResult.results || [])[0] ?? {};

  return {
    totalWithCover,
    ready,
    missing,
    failed,
    pending: Math.max(0, totalWithCover - ready - missing - failed),
    readyBytes: num(assetRow.bytes),
    retryExhausted: num(problemRow.exhausted),
    byType,
    recentFailures: (failuresResult.results || []).map((item) => ({
      url: String(item.url ?? ''),
      namespace: String(item.namespace ?? 'misc') as CoverNamespace,
      status: item.status === 'missing' ? 'missing' : 'failed',
      lastError: item.last_error == null ? null : String(item.last_error),
      attempts: num(item.attempts),
      retryExhausted: num(item.retry_exhausted) === 1,
      nextRetryAt: num(item.next_retry_at),
    })),
    enabled: settings.enabled,
    batchSize: settings.batchSize,
    r2Ready: Boolean(env.MEDIA),
    publicBase: env.MEDIA_PUBLIC_BASE?.trim() || null,
  };
}
