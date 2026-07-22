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
import { authRoutes, githubOAuthRoutes, userRoutes, sourceRoutes, communityRoutes, systemRoutes, searchRoutes, adminRoutes, configRoutes, javRoutes } from '@/routes';
import { feedbackRoutes } from '@/routes/feedback';
import { announcementRoutes } from '@/routes/announcement';
import { CONFIG } from '@/constants';
// 注册搜索 Provider
import { providerRegistry } from '@/services/search-provider';
import { animeProvider } from '@/providers/anime-provider';
import { movieProvider } from '@/providers/movie-provider';
import { javProvider } from '@/providers/jav-provider';
import { mangaProvider } from '@/providers/manga-provider';

// ── 注册所有搜索 Provider（新增搜索类别只需在此添加一行）──
providerRegistry.register(animeProvider);
providerRegistry.register(movieProvider);
providerRegistry.register(javProvider);
providerRegistry.register(mangaProvider);

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return CONFIG.CORS.ALLOWED_ORIGINS[0];

    if (CONFIG.CORS.ALLOWED_ORIGINS.includes(origin)) {
      return origin;
    }

    const allowedPatterns = [
      /^https:\/\/codeseek\.pp\.ua$/,
      /^https:\/\/www\.codeseek\.pp\.ua$/,
      /^https:\/\/.*\.codeseek\.pages\.dev$/,
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
    version: c.env.APP_VERSION || '2.0.0',
    status: 'running',
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/auth', githubOAuthRoutes);
app.route('/api/user', userRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/search-sources', sourceRoutes);
app.route('/api/community', communityRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/config', configRoutes);
app.route('/api/jav', javRoutes);
app.route('/api/feedback', feedbackRoutes);
app.route('/api/announcements', announcementRoutes);
app.route('/api', systemRoutes);

app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404);
});

app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ success: false, error: { code: 'SERVER_ERROR', message: '服务器内部错误' } }, 500);
});

export default {
  fetch: app.fetch,
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM user_sessions WHERE expires_at < ?').bind(Date.now()).run()
      );
    }
  },
};
