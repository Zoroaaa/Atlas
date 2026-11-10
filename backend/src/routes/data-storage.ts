/**
 * 数据存储管理路由（管理员专属）
 *
 * 提供数据资产的查阅、统计报表与管理操作。
 * 挂载于 /api/admin/data-storage，复用 adminMiddleware 鉴权。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error, checkRateLimitD1 } from '@/utils';
import { authMiddleware, adminMiddleware, checkIsSuperAdmin } from '@/middleware/auth';
import { CONFIG } from '@/constants';
import { validateBody, schemas } from '@/validation';
import { syncGenreDictionary } from '@/services/genre-dictionary';
import {
  DETAIL_FIELD_BITS,
  missingFieldsFromMask,
  type JavDetailField,
} from '@/services/jav-detail-meta';
import {
  getJavDetailJobView,
  getJavDetailStats,
  startJavDetailJob,
} from '@/services/jav-detail-job';

export const dataStorageRoutes = new Hono<{ Bindings: Env }>();

dataStorageRoutes.use('*', authMiddleware);
dataStorageRoutes.use('*', adminMiddleware);

const VALID_TYPES = ['jav', 'anime', 'movie', 'manga', 'novel', 'actress'];
const VALID_STATUSES = ['active', 'hidden'];

// ============================================================
// 1. 统计概览
// ============================================================

dataStorageRoutes.get('/stats', async (c) => {
  try {
    const now = Date.now();
    const dayMs = CONFIG.Stats.DAY_IN_MS;
    const weekMs = CONFIG.Stats.WEEK_IN_MS;
    const monthMs = 30 * dayMs;
    const thirtyDaysAgo = now - 30 * dayMs;

    const [
      totalResult,
      byTypeResult,
      detailCompletedResult,
      addedTodayResult,
      addedWeekResult,
      addedMonthResult,
      hiddenResult,
      overTimeResult,
      topSourcesResult,
    ] = (await c.env.DB.batch([
      c.env.DB.prepare('SELECT COUNT(*) as cnt FROM data_records'),
      c.env.DB.prepare(
        `SELECT record_type as type, COUNT(*) as cnt
         FROM data_records GROUP BY record_type ORDER BY cnt DESC`
      ),
      c.env.DB.prepare(
        `SELECT
           SUM(CASE WHEN detail_completed = 1 THEN 1 ELSE 0 END) as completed,
           COUNT(*) as total
         FROM data_records`
      ),
      c.env.DB.prepare('SELECT COUNT(*) as cnt FROM data_records WHERE first_seen_at > ?').bind(now - dayMs),
      c.env.DB.prepare('SELECT COUNT(*) as cnt FROM data_records WHERE first_seen_at > ?').bind(now - weekMs),
      c.env.DB.prepare('SELECT COUNT(*) as cnt FROM data_records WHERE first_seen_at > ?').bind(now - monthMs),
      c.env.DB.prepare("SELECT COUNT(*) as cnt FROM data_records WHERE status = 'hidden'"),
      c.env.DB.prepare(
        `SELECT date(first_seen_at / 1000, 'unixepoch', '+8 hours') as d, COUNT(*) as cnt
         FROM data_records
         WHERE first_seen_at > ?
         GROUP BY d ORDER BY d ASC`
      ).bind(thirtyDaysAgo),
      c.env.DB.prepare(
        `SELECT source_name, COUNT(*) as cnt
         FROM data_record_sources GROUP BY source_name ORDER BY cnt DESC LIMIT 10`
      ),
    ])) as unknown as [
      { results: Array<{ cnt: number }> },
      { results: Array<{ type: string; cnt: number }> },
      { results: Array<{ completed: number; total: number }> },
      { results: Array<{ cnt: number }> },
      { results: Array<{ cnt: number }> },
      { results: Array<{ cnt: number }> },
      { results: Array<{ cnt: number }> },
      { results: Array<{ d: string; cnt: number }> },
      { results: Array<{ source_name: string; cnt: number }> },
    ];

    const total = totalResult.results?.[0]?.cnt || 0;
    const completed = detailCompletedResult.results?.[0]?.completed || 0;
    const detailTotal = detailCompletedResult.results?.[0]?.total || 0;

    // JAV 字段级完整度（导演/制作商/发行商/磁力），与上面的全局 detail_completed 分开
    const javDetail = await getJavDetailStats(c.env.DB);

    // 标签统计：JSON 数组交给 SQLite JSON1 聚合，避免全表拉到应用层解析
    const [jsonTagRows, legacyTagRows] = await Promise.all([
      c.env.DB.prepare(
        `SELECT j.value AS tag, COUNT(*) AS cnt
         FROM data_records d,
              json_each(CASE WHEN json_valid(d.tags) AND json_type(d.tags) = 'array' THEN d.tags ELSE '[]' END) j
         WHERE d.tags IS NOT NULL AND d.tags != '[]' AND j.value != ''
         GROUP BY j.value ORDER BY cnt DESC LIMIT 30`
      ).all<{ tag: string; cnt: number }>(),
      // 兼容逗号分隔的旧数据（数量有限，仍需应用层拆分）
      c.env.DB.prepare(
        `SELECT tags FROM data_records
         WHERE tags IS NOT NULL AND tags != '[]' AND NOT json_valid(tags)`
      ).all<{ tags: string }>(),
    ]);
    const tagCountMap = new Map<string, number>();
    for (const r of jsonTagRows.results || []) {
      tagCountMap.set(r.tag, r.cnt);
    }
    for (const r of legacyTagRows.results || []) {
      String(r.tags)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((t) => tagCountMap.set(t, (tagCountMap.get(t) || 0) + 1));
    }
    const topTags = Array.from(tagCountMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return c.json(
      success({
        totalRecords: total,
        byType: (byTypeResult.results || []).map((r) => ({ type: r.type, count: r.cnt })),
        detailCompletionRate: detailTotal > 0 ? Math.round((completed / detailTotal) * 1000) / 10 : 0,
        addedToday: addedTodayResult.results?.[0]?.cnt || 0,
        addedThisWeek: addedWeekResult.results?.[0]?.cnt || 0,
        addedThisMonth: addedMonthResult.results?.[0]?.cnt || 0,
        recordsOverTime: (overTimeResult.results || []).map((r) => ({ date: r.d, count: r.cnt })),
        topTags,
        topSources: (topSourcesResult.results || []).map((r) => ({
          source_name: r.source_name,
          count: r.cnt,
        })),
        hiddenCount: hiddenResult.results?.[0]?.cnt || 0,
        javDetail,
      })
    );
  } catch (err) {
    console.error('[data-storage] stats error:', err);
    return c.json(error('SERVER_ERROR', '获取统计失败'), 500);
  }
});

// ============================================================
// 2. 趋势数据
// ============================================================

dataStorageRoutes.get('/trends', async (c) => {
  const days = Math.min(90, Math.max(7, parseInt(c.req.query('days') || '30')));

  try {
    const now = Date.now();
    const startTime = now - days * CONFIG.Stats.DAY_IN_MS;

    const [overTimeResult, byTypeOverTimeResult] = (await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT date(first_seen_at / 1000, 'unixepoch', '+8 hours') as d, COUNT(*) as cnt
         FROM data_records
         WHERE first_seen_at > ?
         GROUP BY d ORDER BY d ASC`
      ).bind(startTime),
      c.env.DB.prepare(
        `SELECT record_type as type, COUNT(*) as cnt
         FROM data_records
         WHERE first_seen_at > ?
         GROUP BY record_type ORDER BY cnt DESC`
      ).bind(startTime),
    ])) as unknown as [
      { results: Array<{ d: string; cnt: number }> },
      { results: Array<{ type: string; cnt: number }> },
    ];

    return c.json(
      success({
        days,
        recordsOverTime: (overTimeResult.results || []).map((r) => ({ date: r.d, count: r.cnt })),
        byType: (byTypeOverTimeResult.results || []).map((r) => ({ type: r.type, count: r.cnt })),
      })
    );
  } catch (err) {
    console.error('[data-storage] trends error:', err);
    return c.json(error('SERVER_ERROR', '获取趋势失败'), 500);
  }
});

// ============================================================
// 3. 记录列表（分页 + 筛选）
// ============================================================

dataStorageRoutes.get('/records', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20')));
  const type = c.req.query('type') || '';
  const status = c.req.query('status') || '';
  const search = c.req.query('search') || '';
  const detail = c.req.query('detail') || '';
  const missing = c.req.query('missing') || '';

  try {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (type && VALID_TYPES.includes(type)) {
      where.push('d.record_type = ?');
      params.push(type);
    }
    if (status && VALID_STATUSES.includes(status)) {
      where.push('d.status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(d.title LIKE ? OR d.code LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }
    if (detail === 'complete') {
      where.push("d.detail_completed = 1 AND (d.record_type <> 'jav' OR COALESCE(m.missing_mask, 0) = 0)");
    } else if (detail === 'incomplete') {
      where.push("(d.detail_completed = 0 OR (d.record_type = 'jav' AND COALESCE(m.missing_mask, 0) <> 0))");
    }

    // 缺字段筛选：director,maker,publisher,magnets 的并集
    let missingMask = 0;
    const missingFields: JavDetailField[] = [];
    for (const raw of missing.split(',')) {
      const field = raw.trim() as JavDetailField;
      if (field && field in DETAIL_FIELD_BITS) {
        missingMask |= DETAIL_FIELD_BITS[field];
        missingFields.push(field);
      }
    }
    if (missingMask !== 0) {
      where.push('(COALESCE(m.missing_mask, 0) & ?) <> 0');
      params.push(missingMask);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const fromClause = `FROM data_records d LEFT JOIN jav_detail_meta m ON m.record_id = d.id`;

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total ${fromClause} ${whereClause}`
    )
      .bind(...params)
      .first<{ total: number }>();
    const total = countResult?.total || 0;

    const rows = await c.env.DB.prepare(
      `SELECT d.*,
              m.status AS detail_status,
              m.missing_mask AS detail_missing_mask,
              m.attempts AS detail_attempts,
              m.transient_failures AS detail_transient_failures,
              m.next_retry_at AS detail_next_retry_at,
              m.retry_exhausted AS detail_retry_exhausted,
              m.last_error AS detail_last_error,
              m.fetched_at AS detail_fetched_at
       ${fromClause} ${whereClause}
       ORDER BY d.first_seen_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...params, pageSize, (page - 1) * pageSize)
      .all<Record<string, unknown>>();

    return c.json(
      success({
        items: (rows.results || []).map(mapRecordRow),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        missingFields,
      })
    );
  } catch (err) {
    console.error('[data-storage] list records error:', err);
    return c.json(error('SERVER_ERROR', '获取记录列表失败'), 500);
  }
});

// ============================================================
// 4. 记录详情（含来源子表）
// ============================================================

dataStorageRoutes.get('/records/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const record = await c.env.DB.prepare(
      `SELECT d.*,
              m.status AS detail_status,
              m.missing_mask AS detail_missing_mask,
              m.attempts AS detail_attempts,
              m.transient_failures AS detail_transient_failures,
              m.next_retry_at AS detail_next_retry_at,
              m.retry_exhausted AS detail_retry_exhausted,
              m.last_error AS detail_last_error,
              m.fetched_at AS detail_fetched_at
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.id = ?`
    )
      .bind(id)
      .first<Record<string, unknown>>();

    if (!record) {
      return c.json(error('NOT_FOUND', '记录不存在'), 404);
    }

    const sources = await c.env.DB.prepare(
      `SELECT * FROM data_record_sources WHERE record_id = ? ORDER BY created_at ASC`
    )
      .bind(id)
      .all<Record<string, unknown>>();

    return c.json(
      success({
        ...mapRecordRow(record),
        sources: (sources.results || []).map((s) => ({
          id: s.id,
          recordId: s.record_id,
          sourceName: s.source_name,
          sourceType: s.source_type,
          sourceUrl: s.source_url,
          sourceData: s.source_data,
          createdAt: s.created_at,
        })),
      })
    );
  } catch (err) {
    console.error('[data-storage] get record error:', err);
    return c.json(error('SERVER_ERROR', '获取记录详情失败'), 500);
  }
});

// ============================================================
// 5. 更新状态（显示/隐藏）
// ============================================================

dataStorageRoutes.put('/records/:id/status', validateBody(schemas.admin.updateDataRecordStatus), async (c) => {
  const id = c.req.param('id');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.admin.updateDataRecordStatus>;
    const { status } = body;
    const existing = await c.env.DB.prepare('SELECT id FROM data_records WHERE id = ?')
      .bind(id)
      .first();
    if (!existing) {
      return c.json(error('NOT_FOUND', '记录不存在'), 404);
    }

    await c.env.DB.prepare(
      `UPDATE data_records SET status = ?, last_updated_at = ? WHERE id = ?`
    )
      .bind(status, Date.now(), id)
      .run();

    return c.json(success({ id, status }, status === 'hidden' ? '已隐藏' : '已显示'));
  } catch (err) {
    console.error('[data-storage] update status error:', err);
    return c.json(error('SERVER_ERROR', '更新状态失败'), 500);
  }
});

// ============================================================
// 6. 删除记录（仅超级管理员，级联删除来源）
// ============================================================

dataStorageRoutes.delete('/records/:id', async (c) => {
  const id = c.req.param('id');

  if (!(await checkIsSuperAdmin(c))) {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }

  try {
    const existing = await c.env.DB.prepare('SELECT id FROM data_records WHERE id = ?')
      .bind(id)
      .first();
    if (!existing) {
      return c.json(error('NOT_FOUND', '记录不存在'), 404);
    }

    // 外键 ON DELETE CASCADE 自动清理 data_record_sources
    await c.env.DB.prepare('DELETE FROM data_records WHERE id = ?').bind(id).run();

    return c.json(success({ deletedId: id }, '删除成功'));
  } catch (err) {
    console.error('[data-storage] delete record error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});

// ============================================================
// 7. 清理隐藏/无效数据（仅超级管理员）
// ============================================================

dataStorageRoutes.post('/cleanup', async (c) => {
  if (!(await checkIsSuperAdmin(c))) {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }

  try {
    // 删除所有隐藏记录（级联删除来源）
    const result = await c.env.DB.prepare(
      `DELETE FROM data_records WHERE status = 'hidden'`
    ).run();
    const deleted = result.meta?.changes || 0;

    return c.json(success({ deleted }, `已清理 ${deleted} 条隐藏记录`));
  } catch (err) {
    console.error('[data-storage] cleanup error:', err);
    return c.json(error('SERVER_ERROR', '清理失败'), 500);
  }
});

// ============================================================
// 8. 手动同步 JAV 推荐标签词典
// ============================================================

dataStorageRoutes.post('/genre-dict/sync', async (c) => {
  const userId = c.get('user')?.userId ?? 'unknown';

  // 同一管理员 60 秒内只允许触发一次，避免误点造成重复抓取
  const limit = await checkRateLimitD1(
    c.env.DB,
    `genre-dict-sync:${userId}`,
    60 * 1000,
    1
  );
  if (!limit.allowed) {
    if (limit.retryAfter) c.header('Retry-After', String(limit.retryAfter));
    return c.json(error('RATE_LIMITED', '同步操作过于频繁，请稍后再试'), 429);
  }

  try {
    // 内部按 7 天到期判断：未到期时不发起外部请求，直接返回 skipped
    const result = await syncGenreDictionary(c.env.DB);
    return c.json(success(
      result,
      result.updated > 0 ? '词典已同步' : '词典未到期，已跳过'
    ));
  } catch (err) {
    console.error('[data-storage] genre dict sync error:', err);
    return c.json(error('SERVER_ERROR', '同步失败'), 500);
  }
});

// ============================================================
// 9. JAV 详情批量补全任务
// ============================================================

dataStorageRoutes.get('/detail-jobs/current', async (c) => {
  try {
    const view = await getJavDetailJobView(c.env.DB);
    const stats = await getJavDetailStats(c.env.DB);

    const failures = await c.env.DB.prepare(
      `SELECT d.id, d.code, d.title, m.status, m.last_error, m.next_retry_at,
              m.attempts, m.transient_failures, m.retry_exhausted, m.missing_mask
       FROM jav_detail_meta m
       JOIN data_records d ON d.id = m.record_id
       WHERE d.record_type = 'jav'
         AND (m.last_error IS NOT NULL OR m.status IN ('partial', 'absent', 'error'))
       ORDER BY m.updated_at DESC
       LIMIT 20`
    ).all<Record<string, unknown>>();

    return c.json(
      success({
        ...view,
        stats,
        recentFailures: (failures.results || []).map((row) => ({
          id: row.id,
          code: row.code,
          title: row.title,
          status: row.status,
          missing: missingFieldsFromMask(Number(row.missing_mask ?? 0)),
          lastError: row.last_error ?? null,
          nextRetryAt: Number(row.next_retry_at ?? 0),
          attempts: Number(row.attempts ?? 0),
          transientFailures: Number(row.transient_failures ?? 0),
          retryExhausted: !!row.retry_exhausted,
        })),
      })
    );
  } catch (err) {
    console.error('[data-storage] detail job view error:', err);
    return c.json(error('SERVER_ERROR', '获取批量任务状态失败'), 500);
  }
});

dataStorageRoutes.post('/detail-jobs', async (c) => {
  const userId = c.get('user')?.userId ?? 'unknown';

  // 防误点：同一管理员 10 秒内只允许触发一次
  const limit = await checkRateLimitD1(c.env.DB, `jav-detail-job:${userId}`, 10 * 1000, 1);
  if (!limit.allowed) {
    if (limit.retryAfter) c.header('Retry-After', String(limit.retryAfter));
    return c.json(error('RATE_LIMITED', '任务启动过于频繁，请稍后再试'), 429);
  }

  let body: { batchSize?: unknown; intervalSeconds?: unknown } = {};
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    // 允许空 body，使用默认参数
  }

  const batchSize = Math.min(50, Math.max(1, Number(body.batchSize) || 10));
  const intervalSeconds = Math.min(3600, Math.max(30, Number(body.intervalSeconds) || 60));

  try {
    const view = await startJavDetailJob(c.env.DB, {
      batchSize,
      intervalSeconds,
      createdBy: userId,
    });
    return c.json(
      success(view, view.job?.status === 'running' ? '批量任务已启动' : '没有待补全的记录')
    );
  } catch (err) {
    console.error('[data-storage] start detail job error:', err);
    return c.json(error('SERVER_ERROR', '启动批量任务失败'), 500);
  }
});

// ─── 行映射辅助 ──────────────────────────────────────────────────────

function mapRecordRow(r: Record<string, unknown>) {
  const missingMask = Number(r.detail_missing_mask ?? 0);
  return {
    id: r.id,
    recordType: r.record_type,
    dedupKey: r.dedup_key,
    title: r.title,
    cover: r.cover,
    code: r.code,
    actors: r.actors,
    duration: r.duration,
    releaseDate: r.release_date,
    publisher: r.publisher,
    tags: typeof r.tags === 'string' ? safeParseTags(r.tags) : [],
    rating: r.rating,
    contentData: r.content_data,
    detailCompleted: !!r.detail_completed,
    /** JAV 字段级完整度（非 JAV 记录为 null） */
    detailStatus: (r.detail_status as string | null) ?? null,
    detailMissing: missingFieldsFromMask(missingMask),
    detailAttempts: Number(r.detail_attempts ?? 0),
    detailTransientFailures: Number(r.detail_transient_failures ?? 0),
    detailNextRetryAt: Number(r.detail_next_retry_at ?? 0),
    detailRetryExhausted: !!r.detail_retry_exhausted,
    detailLastError: (r.detail_last_error as string | null) ?? null,
    detailFetchedAt: r.detail_fetched_at ? Number(r.detail_fetched_at) : null,
    status: r.status,
    sourceCount: r.source_count,
    firstSeenAt: r.first_seen_at,
    lastUpdatedAt: r.last_updated_at,
  };
}

function safeParseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    // 兼容逗号分隔的旧数据
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
}
