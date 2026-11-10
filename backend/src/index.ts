/**
 * CodeSeek 后端API主入口
 * 功能：路由注册、中间件配置、全局错误处理
 * 作者：CodeSeek Team
 * 日期：2024
 */
 
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { Env } from '@/types';
import { authRoutes, githubOAuthRoutes, googleOAuthRoutes, userRoutes, sourceRoutes, communityRoutes, systemRoutes, searchRoutes, adminRoutes, configRoutes, javRoutes, dataStorageRoutes, recommendRoutes, rankingsRoutes, notificationRoutes, followRoutes, emailUnsubscribeRoutes } from '@/routes';
import { feedbackRoutes } from '@/routes/feedback';
import { announcementRoutes } from '@/routes/announcement';
import { CONFIG } from '@/constants';
// 注册搜索 Provider
import { providerRegistry } from '@/services/search-provider';
import { animeProvider } from '@/providers/anime-provider';
import { movieProvider } from '@/providers/movie-provider';
import { javProvider } from '@/providers/jav-provider';
import { mangaProvider } from '@/providers/manga-provider';
import { novelProvider } from '@/providers/novel-provider';
import { enrichPendingJavRecords } from '@/services/ranking-enrichment';
import { runWatchCheck } from '@/services/follow-service';
import { runEmailDigest } from '@/services/email-notification';
import { syncGenreDictionary } from '@/services/genre-dictionary';
import { runDataRetention } from '@/services/data-retention';

// ── 注册所有搜索 Provider（新增搜索类别只需在此添加一行）──
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

app.get('/', (c) => {
  return c.json({
    name: 'CodeSeek API',
    version: c.env.APP_VERSION || '1.6.0',
    status: 'running',
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/auth', githubOAuthRoutes);
app.route('/api/auth', googleOAuthRoutes);
app.route('/api/user', userRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/search-sources', sourceRoutes);
app.route('/api/community', communityRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/config', configRoutes);
app.route('/api/jav', javRoutes);
app.route('/api/recommend', recommendRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/follows', followRoutes);
app.route('/api/email', emailUnsubscribeRoutes);
app.route('/api/internal/rankings', rankingsRoutes);
app.route('/api/admin/data-storage', dataStorageRoutes);
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

    // 生成与前端一致的错误指纹
    const errorType = err instanceof Error ? err.name : 'ServerError';
    const stackLines = (stack || '').split('\n').slice(0, 5).join('|').replace(/\s+/g, ' ').trim();
    const raw = `${errorType}::${message.slice(0, 200)}::${stackLines}::${url || ''}`;
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
    }
    const fingerprint = `fp_${(hash >>> 0).toString(36)}`;

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
    if (event.cron === '*/30 * * * *') {
      // 每 30 分钟：关注女优新作检测（≤20 次子请求）+ 邮件通知合并发送（≤15 次子请求）。
      // 两项合计 ≤35，低于 Workers 每次调用 50 次子请求的上限，所以共用一个触发器
      ctx.waitUntil(
        runWatchCheck(env.DB)
          .then((r) => { if (r.checked > 0) console.log(`[follow] checked=${r.checked} failed=${r.failed}`); })
          .catch((err) => console.error('[follow] watch check failed:', err))
      );
      ctx.waitUntil(
        runEmailDigest(env)
          .then((r) => { if (r.users > 0) console.log(`[email] users=${r.users} sent=${r.sent} failed=${r.failed} skipped=${r.skipped}`); })
          .catch((err) => console.error('[email] digest failed:', err))
      );
    }
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM user_sessions WHERE expires_at < ?').bind(Date.now()).run()
      );
      // 清理 7 天前的验证码记录（含 used/expired，避免永久堆积）
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM email_verifications WHERE created_at < ?')
          .bind(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .run()
      );
      ctx.waitUntil(
        runDataRetention(env.DB)
          .then((r) => {
            if (r.rateLimits + r.postViews + r.dataRecords > 0) {
              console.log(`[retention] rate_limits=${r.rateLimits} post_views=${r.postViews} data_records=${r.dataRecords}`);
            }
          })
          .catch((err) => console.error('[retention] cleanup failed:', err))
      );
      ctx.waitUntil(
        enrichPendingJavRecords(env.DB).catch((err) =>
          console.error('[ranking-enrichment] cron failed:', err)
        )
      );
      // 推荐标签词典每周同步一次（未到期时只查 2 次 D1，无外部请求）
      ctx.waitUntil(
        syncGenreDictionary(env.DB)
          .then((r) => { if (r.updated > 0) console.log(`[genre-dict] updated=${r.updated}`); })
          .catch((err) => console.error('[genre-dict] cron failed:', err))
      );
    }
  },
};
