/**
 * R2 管理看板路由（管理员专属）
 *
 * 提供 R2 真实对象与账本/业务引用的三口径对账、对象浏览、扫描触发与懒加载封面回收。
 * 挂载于 /api/admin/r2，复用 authMiddleware + adminMiddleware 鉴权。
 *
 * 数据边界：r2_objects 是 R2 的独立快照，这里不改写 cover_assets，
 * 唯一例外是扫描轮次结束时的定向修账（谎报 ready → missing，逻辑在服务层）。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error, checkRateLimitD1 } from '@/utils';
import { authMiddleware, adminMiddleware, checkIsSuperAdmin } from '@/middleware/auth';
import { validateBody, schemas } from '@/validation';
import { getStatsVersion, listR2Objects, getScanState, requestManualScan } from '@/repositories/r2-objects-repository';
import { getR2DashboardStats } from '@/services/r2-dashboard';
import { runR2ScanTickSafe } from '@/services/r2-scan';
import { previewReclaim, reclaimLazyCovers } from '@/services/r2-reclaim';

/** 统计缓存 TTL：与封面页一致 5 分钟；前端轮询间隔短于此值也不会打穿 */
const STATS_CACHE_TTL_SECONDS = 300;
/** 手动扫描/回收的人工限流窗口：扫描是分片任务，连点只会把日扫描打乱 */
const ACTION_RATE_WINDOW_MS = 60_000;
const ACTION_RATE_MAX = 1;
/** 单次回收上限（个）；再大就拆多次执行，避免一次请求占满 CPU */
const DEFAULT_RECLAIM_LIMIT = 500;
/** 深翻页上限：pageSize=50 时约 1 万行，再深就要求用筛选缩小范围 */
const MAX_PAGE = 200;

const VALID_NAMESPACES = ['jav', 'anime', 'movie', 'manga', 'novel', 'person', 'misc'];

export const r2AdminRoutes = new Hono<{ Bindings: Env }>();

r2AdminRoutes.use('*', authMiddleware);
r2AdminRoutes.use('*', adminMiddleware);

/**
 * 统计缓存 key：Cache API 只接受本 zone URL，必须由请求 origin 推导。
 * 把 stats_version 拼进 search —— cron 完成一轮扫描或执行回收后版本号 +1，
 * 旧缓存条目自然失效，不需要（也无法）从无请求上下文的 cron 里去 delete。
 */
function r2StatsCacheKey(url: string, version: number): Request | null {
  if (typeof caches === 'undefined') return null;
  const keyUrl = new URL(url);
  keyUrl.pathname = '/__edge-cache/admin-r2-stats-v1';
  keyUrl.search = `?v=${version}`;
  return new Request(keyUrl.toString());
}

// ── 三口径统计 ───────────────────────────────────────────

r2AdminRoutes.get('/stats', async (c) => {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let cacheKey: Request | null = null;
  if (cache) {
    // 版本号是一次主键查询，比「缓存命中却拿到上一轮数字」便宜得多
    const version = await getStatsVersion(c.env.DB);
    cacheKey = r2StatsCacheKey(c.req.url, version);
    if (cacheKey) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        return c.json((await hit.json()) as Record<string, unknown>, 200, {
          'X-R2-Stats-Cache': 'HIT',
        });
      }
    }
  }

  try {
    const payload = success(await getR2DashboardStats(c.env));
    if (cache && cacheKey) {
      const cacheable = new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${STATS_CACHE_TTL_SECONDS}`,
        },
      });
      const put = cache.put(cacheKey, cacheable).catch(() => undefined);
      try {
        c.executionCtx.waitUntil(put);
      } catch {
        // 非 Worker 运行时（测试）没有 waitUntil，直接丢弃本次写入
        void put;
      }
    }
    return c.json(payload, 200, { 'X-R2-Stats-Cache': 'MISS' });
  } catch (err) {
    console.error('[r2-admin] stats error:', err);
    return c.json(error('SERVER_ERROR', '获取 R2 统计失败'), 500);
  }
});

// ── 扫描状态与触发 ───────────────────────────────────────

r2AdminRoutes.get('/scan/state', async (c) => {
  try {
    const state = await getScanState(c.env.DB);
    if (!state) {
      return c.json(error('R2_TABLE_MISSING', 'R2 快照表尚未初始化，请先执行数据库脚本'), 503);
    }
    return c.json(success({
      status: state.status,
      pagesDone: Number(state.pages_done),
      objectsSeen: Number(state.objects_seen),
      skippedKeys: Number(state.skipped_keys),
      startedAt: state.started_at,
      completedAt: state.completed_at,
      nextScanAt: Number(state.next_scan_at),
      trigger: state.trigger,
      lastError: state.last_error,
    }), 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[r2-admin] scan state error:', err);
    return c.json(error('SERVER_ERROR', '获取扫描状态失败'), 500);
  }
});

r2AdminRoutes.post('/scan', async (c) => {
  const limit = await checkRateLimitD1(
    c.env.DB,
    `r2-scan:${c.get('user')?.userId ?? c.req.header('CF-Connecting-IP') ?? 'anon'}`,
    ACTION_RATE_WINDOW_MS,
    ACTION_RATE_MAX,
  );
  if (!limit.allowed) {
    return c.json(error('RATE_LIMITED', '1 分钟内只能触发一次扫描'), 429);
  }

  try {
    // 先把下一轮时间提前到当下：tick 自身会检查 next_scan_at，
    // 否则上一轮刚完成（下次扫描是 24 小时后）时点按钮会直接空转。
    // 已在跑的轮次不受影响：tick 从原游标续扫，不会重开一轮。
    await requestManualScan(c.env.DB, Date.now());
    const tick = await runR2ScanTickSafe(c.env);
    const state = await getScanState(c.env.DB);
    return c.json(success({ tick, state }), 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[r2-admin] trigger scan error:', err);
    return c.json(error('SERVER_ERROR', '触发扫描失败'), 500);
  }
});

// ── 对象浏览 ─────────────────────────────────────────────

r2AdminRoutes.get('/objects', async (c) => {
  const rawPage = parseInt(c.req.query('page') || '1', 10);
  const rawPageSize = parseInt(c.req.query('pageSize') || '50', 10);
  const page = Math.min(MAX_PAGE, Math.max(1, Number.isFinite(rawPage) ? rawPage : 1));
  const pageSize = Math.min(100, Math.max(10, Number.isFinite(rawPageSize) ? rawPageSize : 50));

  const namespaceRaw = (c.req.query('namespace') || '').trim();
  const namespace = VALID_NAMESPACES.includes(namespaceRaw) ? namespaceRaw : undefined;

  const registeredRaw = c.req.query('registered');
  const registered: 'all' | 'yes' | 'no' =
    registeredRaw === 'yes' || registeredRaw === 'no' ? registeredRaw : 'all';

  const statusRaw = c.req.query('status');
  const statusFilter: 'live' | 'reclaimed' | 'all' =
    statusRaw === 'reclaimed' || statusRaw === 'all' ? statusRaw : 'live';

  const rawAge = parseInt(c.req.query('minAgeDays') || '', 10);
  const minAgeDays = Number.isFinite(rawAge) && rawAge > 0 ? Math.min(3650, rawAge) : undefined;

  const sort: 'uploaded' | 'size' = c.req.query('sort') === 'size' ? 'size' : 'uploaded';

  try {
    // 只在第一页算总数：COUNT 要扫全部 live 行（十万级），翻页只需要 LIMIT。
    // 筛选变化时前端会把 page 重置为 1，所以第一页即可覆盖筛选后的总数。
    const result = await listR2Objects(
      c.env.DB,
      {
        page,
        pageSize,
        namespace,
        registered,
        status: statusFilter,
        minAgeDays,
        sort,
      },
      page === 1,
    );

    return c.json(success({
      items: result.rows.map((row) => ({
        objectKey: row.object_key,
        urlHash: row.url_hash,
        namespace: row.namespace,
        byteSize: Number(row.byte_size),
        uploadedAt: Number(row.uploaded_at),
        firstSeenAt: Number(row.first_seen_at),
        lastSeenAt: Number(row.last_seen_at),
        reclaimedAt: row.reclaimed_at == null ? null : Number(row.reclaimed_at),
        registered: Number(row.registered) === 1,
        ledgerStatus: row.ledger_status,
      })),
      // total 为 null = 本次没有计算总数，前端沿用上一次的数字
      total: result.total,
      page,
      pageSize,
      totalPages: result.total === null ? null : Math.max(1, Math.ceil(result.total / pageSize)),
      pageLimitHit: rawPage > MAX_PAGE,
    }), 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[r2-admin] objects error:', err);
    return c.json(error('SERVER_ERROR', '获取 R2 对象列表失败'), 500);
  }
});

// ── 回收 ─────────────────────────────────────────────────

r2AdminRoutes.post(
  '/reclaim/preview',
  validateBody(schemas.r2Admin.previewReclaim),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof schemas.r2Admin.previewReclaim>;
    try {
      return c.json(success(await previewReclaim(c.env, {
        days: body.days,
        namespace: body.namespace,
        limit: DEFAULT_RECLAIM_LIMIT,
      })), 200, { 'Cache-Control': 'no-store' });
    } catch (err) {
      console.error('[r2-admin] reclaim preview error:', err);
      return c.json(error('SERVER_ERROR', '回收预览失败'), 500);
    }
  },
);

r2AdminRoutes.post(
  '/reclaim',
  validateBody(schemas.r2Admin.reclaim),
  async (c) => {
    // 删除 R2 对象会触发用户侧一次回源，属于不可逆的资源变更，只给超级管理员
    if (!(await checkIsSuperAdmin(c))) {
      return c.json(error('FORBIDDEN', '回收操作需要超级管理员权限'), 403);
    }

    const limit = await checkRateLimitD1(
      c.env.DB,
      `r2-reclaim:${c.get('user')?.userId ?? 'unknown'}`,
      ACTION_RATE_WINDOW_MS,
      ACTION_RATE_MAX,
    );
    if (!limit.allowed) {
      return c.json(error('RATE_LIMITED', '1 分钟内只能执行一次回收'), 429);
    }

    const body = c.get('validatedBody') as z.infer<typeof schemas.r2Admin.reclaim>;
    try {
      const result = await reclaimLazyCovers(c.env, {
        days: body.days,
        namespace: body.namespace,
        limit: body.limit ?? DEFAULT_RECLAIM_LIMIT,
      });
      const message = result.deleted > 0
        ? `已回收 ${result.deleted} 个对象`
        : result.failed > 0
          ? '删除失败，已保留快照等待下次重试'
          : '没有符合条件的对象';
      return c.json(success(result, message), 200, { 'Cache-Control': 'no-store' });
    } catch (err) {
      console.error('[r2-admin] reclaim error:', err);
      return c.json(error('SERVER_ERROR', '回收失败'), 500);
    }
  },
);
