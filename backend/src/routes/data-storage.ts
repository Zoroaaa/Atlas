/**
 * 数据存储管理路由（管理员专属）
 *
 * 提供数据资产的查阅、统计报表与管理操作。
 * 挂载于 /api/admin/data-storage，复用 adminMiddleware 鉴权。
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { authMiddleware, adminMiddleware, checkIsSuperAdmin } from '@/middleware/auth';
import { CONFIG } from '@/constants';

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
        `SELECT date(first_seen_at / 1000, 'unixepoch') as d, COUNT(*) as cnt
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

    // 标签统计：tags 字段是 JSON 数组字符串，D1/SQLite 无原生 JSON 展开，这里拉取后在应用层聚合
    const tagsRows = await c.env.DB.prepare(
      `SELECT tags FROM data_records WHERE tags IS NOT NULL AND tags != '[]'`
    ).all<{ tags: string }>();
    const tagCountMap = new Map<string, number>();
    for (const r of tagsRows.results || []) {
      try {
        const arr = JSON.parse(r.tags) as string[];
        if (Array.isArray(arr)) {
          for (const t of arr) {
            if (t) tagCountMap.set(t, (tagCountMap.get(t) || 0) + 1);
          }
        }
      } catch {
        // 忽略非 JSON（逗号分隔的旧数据）
        String(r.tags)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((t) => tagCountMap.set(t, (tagCountMap.get(t) || 0) + 1));
      }
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
        `SELECT date(first_seen_at / 1000, 'unixepoch') as d, COUNT(*) as cnt
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

  try {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (type && VALID_TYPES.includes(type)) {
      where.push('record_type = ?');
      params.push(type);
    }
    if (status && VALID_STATUSES.includes(status)) {
      where.push('status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(title LIKE ? OR code LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM data_records ${whereClause}`
    )
      .bind(...params)
      .first<{ total: number }>();
    const total = countResult?.total || 0;

    const rows = await c.env.DB.prepare(
      `SELECT * FROM data_records ${whereClause}
       ORDER BY first_seen_at DESC LIMIT ? OFFSET ?`
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
    const record = await c.env.DB.prepare('SELECT * FROM data_records WHERE id = ?')
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

dataStorageRoutes.put('/records/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status } = body;

  if (!VALID_STATUSES.includes(status)) {
    return c.json(error('VALIDATION_ERROR', '无效的状态值'), 400);
  }

  try {
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
  const user = c.get('user');
  const id = c.req.param('id');

  if (!(await checkIsSuperAdmin(c.env.DB, user.userId))) {
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
  const user = c.get('user');

  if (!(await checkIsSuperAdmin(c.env.DB, user.userId))) {
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

// ─── 行映射辅助 ──────────────────────────────────────────────────────

function mapRecordRow(r: Record<string, unknown>) {
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
