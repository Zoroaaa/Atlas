/**
 * Worker 入口：注册中间件与全部业务路由、统一错误落库、按 cron 调度后台任务。
 *
 * 约束：单 Worker 同时托管 API 与前端静态资源，`/api` 以外的路径不在本文件处理；
 * 所有 Cron 分支按 cron 表达式区分，改动触发器时需与 wrangler 配置同步。
 */
 
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { Env } from '@/types';
import { authRoutes, githubOAuthRoutes, googleOAuthRoutes, oauthExchangeRoutes, userRoutes, sourceRoutes, communityRoutes, systemRoutes, searchRoutes, adminRoutes, configRoutes, javRoutes, libraryRoutes, dataStorageRoutes, r2AdminRoutes, recommendRoutes, rankingsRoutes, notificationRoutes, followRoutes, followsInternalRoutes, emailUnsubscribeRoutes } from '@/routes';
import { feedbackRoutes } from '@/routes/feedback';
import { announcementRoutes } from '@/routes/announcement';
import { CONFIG } from '@/constants';
import { generateErrorFingerprint } from '@/utils/fingerprint';
// 注册搜索 Provider
import { providerRegistry } from '@/services/search-provider';
import { animeProvider } from '@/providers/anime-provider';
import { movieProvider } from '@/providers/movie-provider';
import { javProvider } from '@/providers/jav-provider';
import { mangaProvider } from '@/providers/manga-provider';
import { novelProvider } from '@/providers/novel-provider';
import { enrichPendingJavRecords } from '@/services/ranking-enrichment';
import { runJavDetailJobBatch } from '@/services/jav-detail-job';
import { gcOrphanCoverAssets, runCoverBackfillBatch } from '@/services/cover-backfill';
import { runR2ScanTickSafe } from '@/services/r2-scan';
import { runR2AutoReclaim } from '@/services/r2-reclaim';
import { runWatchCheck } from '@/services/follow-service';
import { runEmailDigest } from '@/services/email-notification';
import { syncGenreDictionary } from '@/services/genre-dictionary';
import { runDataRetention } from '@/services/data-retention';
import { runPeriodicAnalyze } from '@/services/db-maintenance';
import { withCronLock } from '@/services/cron-lock';
import { deleteExpiredOAuthLoginCodes } from '@/repositories/oauth-login-repository';
import { dispatchFollowUpcomingSync } from '@/services/follow-upcoming-dispatch';

/** 30 分钟一轮的任务：租约 25 分钟，超过即认为上一轮已异常终止 */
const HALF_HOUR_LOCK_TTL_MS = 25 * 60_000;
/** 1 小时一轮的任务：租约 50 分钟 */
const HOURLY_LOCK_TTL_MS = 50 * 60_000;

// 新增搜索类别只需实现 SearchProvider 并在此注册，不要在 routes/search.ts 里加分支
// ── 搜索 Provider 注册 ───────────────────────────────────
providerRegistry.register(animeProvider);
providerRegistry.register(movieProvider);
providerRegistry.register(javProvider);
providerRegistry.register(mangaProvider);
providerRegistry.register(novelProvider);

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return CONFIG.CORS.ALLOWED_ORIGINS[0];

    if (CONFIG.CORS.ALLOWED_ORIGINS.includes(origin)) {
      return origin;
    }

    // 额外放行线上官方域名与本地开发端口；其余来源返回 null（不下发 CORS 头）
    const allowedPatterns = [
      /^https:\/\/atlas\.wort\.uk$/,
      /^https:\/\/www\.atlas\.wort\.uk$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ];

    if (allowedPatterns.some(pattern => pattern.test(origin))) {
      return origin;
    }

    return null;
  },
  allowMethods: CONFIG.CORS.ALLOW_METHODS,
  allowHeaders: CONFIG.CORS.ALLOW_HEADERS,
  exposeHeaders: CONFIG.CORS.EXPOSE_HEADERS,
  credentials: true,
  maxAge: CONFIG.CORS.MAX_AGE,
}));

app.use('*', secureHeaders({
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

// 根路径 `/` 交给前端静态资源（SPA 首页），API 信息挂在 `/api`
app.get('/api', (c) => {
  return c.json({
    name: 'CodeSeek API',
    version: c.env.APP_VERSION || CONFIG.APP_VERSION,
    status: 'running',
  });
});

// ── 路由挂载 ─────────────────────────────────────────────
// 各业务子应用统一挂在 /api 下；systemRoutes 直接挂 /api 根，提供 /api/health 等入口
app.route('/api/auth', authRoutes);
app.route('/api/auth', githubOAuthRoutes);
app.route('/api/auth', googleOAuthRoutes);
app.route('/api/auth', oauthExchangeRoutes);
app.route('/api/user', userRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/search-sources', sourceRoutes);
app.route('/api/community', communityRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/config', configRoutes);
app.route('/api/jav', javRoutes);
app.route('/api/library', libraryRoutes);
app.route('/api/recommend', recommendRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/follows', followRoutes);
app.route('/api/email', emailUnsubscribeRoutes);
app.route('/api/internal/rankings', rankingsRoutes);
app.route('/api/internal/follows', followsInternalRoutes);
app.route('/api/admin/data-storage', dataStorageRoutes);
app.route('/api/admin/r2', r2AdminRoutes);
app.route('/api/feedback', feedbackRoutes);
app.route('/api/announcements', announcementRoutes);
app.route('/api', systemRoutes);

app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404);
});

app.onError((err, c) => {
  console.error('Server error:', err);

  // 将错误写入 D1 system_errors 表（best-effort，失败不影响响应）
  // 设计要点：
  //   - 用 waitUntil 异步写入，不阻塞响应
  //   - 自身失败只 console，不抛出二次错误
  //   - 不采集请求 body（可能很大且含敏感信息）
  try {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    const stack = err instanceof Error ? (err.stack || '').slice(0, 8000) : null;
    const url = c.req.path || null;
    const method = c.req.method;
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || null;
    const userAgent = c.req.header('User-Agent') || null;

    // 与前端上报共用同一指纹实现，保证前后端错误聚合口径一致
    const errorType = err instanceof Error ? err.name : 'ServerError';
    const fingerprint = generateErrorFingerprint(errorType, message, stack, url);

    const errorId = crypto.randomUUID();
    const now = Date.now();

    c.executionCtx.waitUntil(
      c.env.DB.prepare(`
        INSERT INTO system_errors
          (id, source, error_type, message, stack, url, ip_address, user_agent,
           request_method, request_path, status_code, fingerprint, created_at)
        VALUES (?, 'backend', ?, ?, ?, ?, ?, ?, ?, 500, ?, ?)
      `).bind(
        errorId, errorType, message, stack, url, ip, userAgent,
        method, url, fingerprint, now,
      ).run().catch((e) => console.error('Record backend error to D1 failed:', e))
    );
  } catch (recordErr) {
    console.error('Error recording hook failed:', recordErr);
  }

  return c.json({ success: false, error: { code: 'SERVER_ERROR', message: '服务器内部错误' } }, 500);
});

export default {
  fetch: app.fetch,
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 三类触发器错开分钟：*/30 落在 :00/:30，小时任务在 :05，
    // 每分钟任务只跑轻量的增量任务（详情补全、封面回填加速通道、R2 扫描分片），
    // 不参与关注/邮件链路。
    if (event.cron === '*/30 * * * *') {
      // 每 30 分钟：关注女优新作检测 + 邮件通知合并发送。
      // 两个任务串行执行：关注检测按 5 个一批、批间 10 秒限速；邮件排在后面发送，
      // 避免同一时刻对 JavBus 与邮件服务产生突发子请求。
      // 每个任务各自持租约锁：上一轮没跑完（抓外部站慢）时，本轮直接跳过，
      // 由下一轮补上，避免重复写库、重复通知。
      ctx.waitUntil(
        (async () => {
          try {
            const r = await withCronLock(env.DB, 'follow.check', HALF_HOUR_LOCK_TTL_MS, () => runWatchCheck(env.DB));
            if (r && r.checked > 0) console.log(`[follow] checked=${r.checked} failed=${r.failed}`);
          } catch (err) {
            console.error('[follow] watch check failed:', err);
          }

          try {
            const r = await withCronLock(env.DB, 'email.digest', HALF_HOUR_LOCK_TTL_MS, () => runEmailDigest(env));
            if (r && r.users > 0) console.log(`[email] users=${r.users} sent=${r.sent} failed=${r.failed} skipped=${r.skipped}`);
          } catch (err) {
            console.error('[email] digest failed:', err);
          }

          // GitHub 原生 schedule 会延迟/跳过：由 Worker 主动 dispatch 同一 workflow。
          // 未配置 GITHUB_DISPATCH_TOKEN 时静默跳过，不影响其他任务。
          try {
            const dispatched = await withCronLock(
              env.DB,
              'follow.upcoming.dispatch',
              HALF_HOUR_LOCK_TTL_MS,
              () => dispatchFollowUpcomingSync(env)
            );
            if (dispatched === 'dispatched') console.log('[follow-upcoming-dispatch] workflow dispatched');
          } catch (err) {
            console.error('[follow-upcoming-dispatch] cron failed:', err);
          }
        })()
      );
    }
    if (event.cron === '* * * * *') {
      // 每分钟：管理看板手动触发的 JAV 详情补全 + 封面回填「加速」通道 + R2 对象扫描。
      // 封面回填的分钟通道只在批量导入时手动打开（cover_backfill_enabled），
      // 日常由每小时 :05 的小时通道兜底：候选集查询要全表比对 cover 快照，
      // 数据收敛后每轮仍固定扫 1.5 万行，按分钟跑纯属空转。
      // R2 扫描是分片任务：受 r2_scan_pages_per_tick 与 next_scan_at 控制，
      // 一轮扫完后 24 小时内每个 tick 只读一次状态行就退出。
      // 三者串行执行，避免同一分钟同时对源站与 R2 发起多批请求。
      ctx.waitUntil(
        (async () => {
          try {
            const r = await runJavDetailJobBatch(env.DB);
            if (r.ran && r.processed > 0) console.log(`[jav-detail-job] processed=${r.processed}`);
          } catch (err) {
            console.error('[jav-detail-job] cron failed:', err);
          }

          try {
            const r = await runCoverBackfillBatch(env, 'minutely');
            if (r.ran && r.processed > 0) {
              console.log(
                `[cover-backfill] channel=minutely processed=${r.processed} stored=${r.stored} skipped=${r.skipped} missing=${r.missing} failed=${r.failed}`
              );
            }
          } catch (err) {
            console.error('[cover-backfill] cron failed:', err);
          }

          // R2 对象扫描：分片推进一轮，本 tick 只列 1-5 页（r2_scan_pages_per_tick）。
          // 放在最后：与回填共用 R2 配额，回填优先级更高。
          try {
            const r = await runR2ScanTickSafe(env);
            if (r.ran) {
              console.log(`[r2-scan] pages=${r.pages} objects=${r.objects} done=${r.done}`);
            }
          } catch (err) {
            console.error('[r2-scan] cron failed:', err);
          }
        })()
      );
    }
    // 每小时第 5 分钟：清理过期会话与验证码、数据保留、榜单补全、词典同步；
    // 03:05 UTC 额外回收孤儿封面。各任务独立持锁，单个任务慢不会阻塞其余任务。
    if (event.cron === '5 * * * *') {
      // 封面回填「小时通道」：跟榜单补全等小时任务一起，在每小时 :05 跑一批，日常兜底。
      // 独立开关 cover_backfill_hourly_enabled；与分钟通道共用 cron 锁，
      // 批量导入期间分钟通道占着锁，这一轮会直接跳过。
      ctx.waitUntil(
        runCoverBackfillBatch(env, 'hourly')
          .then((r) => {
            if (r.ran && r.processed > 0) {
              console.log(
                `[cover-backfill] channel=hourly processed=${r.processed} stored=${r.stored} skipped=${r.skipped} missing=${r.missing} failed=${r.failed}`
              );
            }
          })
          .catch((err) => console.error('[cover-backfill] cron failed:', err))
      );
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM user_sessions WHERE expires_at < ?').bind(Date.now()).run()
      );
      // 清理 7 天前的验证码记录（含 used/expired，避免永久堆积）
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM email_verifications WHERE created_at < ?')
          .bind(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .run()
      );
      // 源状态探测缓存只用于「最近 24h 历史」，保留 7 天足够，避免无界增长
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM source_status_cache WHERE created_at < ?')
          .bind(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .run()
      );
      // 过期未兑换的 OAuth 票据（正常 5 分钟过期，异常中断时靠这里兜底）
      ctx.waitUntil(deleteExpiredOAuthLoginCodes(env.DB, Date.now()));
      // 每 7 天刷新一次查询优化器统计：未到周期时只读一行 system_config 就返回，
      // 到期才逐表 ANALYZE（原因见 services/db-maintenance.ts 与 database/19_analyze.sql）
      ctx.waitUntil(
        runPeriodicAnalyze(env.DB)
          .then((r) => {
            if (r.ran) {
              console.log(
                `[db-maintenance] analyze tables=${r.tables}${r.fallback ? ` fallback=${r.fallback}` : ''}`
              );
            }
          })
          .catch((err) => console.error('[db-maintenance] analyze failed:', err))
      );
      ctx.waitUntil(
        withCronLock(env.DB, 'data.retention', HOURLY_LOCK_TTL_MS, () => runDataRetention(env.DB))
          .then((r) => {
            if (r && r.rateLimits + r.postViews + r.dataRecords > 0) {
              console.log(`[retention] rate_limits=${r.rateLimits} post_views=${r.postViews} data_records=${r.dataRecords}`);
            }
          })
          .catch((err) => console.error('[retention] cleanup failed:', err))
      );
      ctx.waitUntil(
        withCronLock(env.DB, 'ranking.enrich', HOURLY_LOCK_TTL_MS, () => enrichPendingJavRecords(env.DB))
          .catch((err) => console.error('[ranking-enrichment] cron failed:', err))
      );
      // 推荐标签词典每周同步一次（未到期时只查 2 次 D1，无外部请求）
      ctx.waitUntil(
        withCronLock(env.DB, 'genre.dict', HOURLY_LOCK_TTL_MS, () => syncGenreDictionary(env.DB))
          .then((r) => { if (r && r.updated > 0) console.log(`[genre-dict] updated=${r.updated}`); })
          .catch((err) => console.error('[genre-dict] cron failed:', err))
      );
      // 孤儿封面回收：每天 03:05 UTC 跑一次，单次限量 100，避免拖慢小时任务
      if (new Date(event.scheduledTime).getUTCHours() === 3) {
        ctx.waitUntil(
          withCronLock(env.DB, 'cover.gc', HOURLY_LOCK_TTL_MS, () => gcOrphanCoverAssets(env, 100))
            .then((r) => {
              if (r && (r.assets > 0 || r.tombstones > 0)) {
                console.log(`[cover-gc] assets=${r.assets} tombstones=${r.tombstones}`);
              }
            })
            .catch((err) => console.error('[cover-gc] cron failed:', err))
        );
      }
      // 懒加载封面回收：每天 04:05 UTC 跑一次，与 03:05 的 GC 差一个整小时，
      // 避免两次 R2 批量删除挤在同一分钟。只删「无账本 + 无引用 + 超期」的对象。
      if (new Date(event.scheduledTime).getUTCHours() === 4) {
        ctx.waitUntil(
          withCronLock(env.DB, 'r2.reclaim', HOURLY_LOCK_TTL_MS, () => runR2AutoReclaim(env))
            .then((r) => {
              if (r && (r.deleted > 0 || r.purged > 0)) {
                console.log(`[r2-reclaim] deleted=${r.deleted} bytes=${r.bytesFreed} purged=${r.purged}`);
              }
            })
            .catch((err) => console.error('[r2-reclaim] cron failed:', err))
        );
      }
    }
  },
};
