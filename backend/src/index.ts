/**
 * CodeSeek 后端API主入口
 * 功能：路由注册、中间件配置、全局错误处理
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from '@/types';
import { authRoutes, githubOAuthRoutes, userRoutes, sourceRoutes, communityRoutes, systemRoutes, searchRoutes, adminRoutes, configRoutes, javRoutes } from '@/routes';
import { feedbackRoutes } from '@/routes/feedback';
import { CONFIG } from '@/constants';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin) => {
    if (CONFIG.CORS.ALLOWED_ORIGINS.includes(origin)) {
      return origin;
    }
    if (origin.endsWith('.pages.dev') || origin.includes('cloudflare')) {
      return origin;
    }
    return CONFIG.CORS.ALLOWED_ORIGINS[0];
  },
  allowMethods: CONFIG.CORS.ALLOW_METHODS,
  allowHeaders: CONFIG.CORS.ALLOW_HEADERS,
  exposeHeaders: CONFIG.CORS.EXPOSE_HEADERS,
  credentials: true,
  maxAge: CONFIG.CORS.MAX_AGE,
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
app.route('/api', systemRoutes);

app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404);
});

app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ success: false, error: { code: 'SERVER_ERROR', message: '服务器内部错误' } }, 500);
});

export default app;
