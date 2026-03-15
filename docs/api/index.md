# CodeSeek API 文档 (v2.0.0)

> 返回项目主页 | [架构设计文档](../backend-frontend-tree.md) | [配置说明文档](../config.md) | [部署指南文档](../deploy.md)

本文档详细说明CodeSeek项目的所有API接口，100%基于实际后端代码。

---

## 目录

- [基础信息](#基础信息)
- [模块文档](#模块文档)
- [路由注册汇总](#路由注册汇总)
- [API统计](#api统计)

---

## 基础信息

- **基础URL**: `/api`
- **认证方式**: JWT Bearer Token（在请求头中添加 `Authorization: Bearer <token>`）
- **响应格式**: JSON
- **API框架**: Hono 4.6.0
- **运行时**: Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)

## 统一响应格式

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}
```

## 错误码说明

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 参数验证失败 |
| `AUTH_ERROR` | 401 | 认证失败/未授权 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `DUPLICATE_ERROR` | 400 | 资源已存在 |
| `RATE_LIMIT` | 429 | 请求频率超限 |
| `SERVER_ERROR` | 500 | 服务器内部错误 |
| `LOCKED` | 423 | 账户被锁定 |

## 认证要求汇总

| 路由模块 | 认证方式 | 说明 |
|---------|---------|------|
| `/api/auth` | 无全局中间件 | 部分接口需要认证（单独验证） |
| `/api/user` | 全局 authMiddleware | 所有接口需要认证 |
| `/api/search` | 全局 authMiddleware | 所有接口需要认证 |
| `/api/search-sources` | 全局 authMiddleware | 所有接口需要认证，部分需要管理员权限 |
| `/api/community` | 全局 authMiddleware | 所有接口需要认证 |
| `/api/config` | 全局 authMiddleware | 所有接口需要认证，部分需要管理员权限 |
| `/api/admin` | 全局管理员中间件 | 所有接口需要管理员权限 |
| `/api/jav` | 全局 authMiddleware | 所有接口需要认证 |
| `/api/feedback` | 可选认证 | 用户接口可选认证，管理员接口需要管理员权限 |
| `/api` (system) | 全局 authMiddleware | 大部分接口需要认证，`/public-config` 和 `/health` 为公开接口 |

---

## 模块文档

| 模块 | 文档 | 功能描述 |
|------|------|---------|
| 认证接口 | [auth.md](./auth.md) | 用户认证、登录注册、邮箱验证、密码管理、GitHub OAuth |
| 用户数据接口 | [user.md](./user.md) | 用户设置、收藏、搜索历史、活动记录 |
| 搜索接口 | [search.md](./search.md) | 搜索执行、建议、热门 |
| 搜索源管理接口 | [sources.md](./sources.md) | 搜索源CRUD、分类管理、用户配置 |
| 社区接口 | [community.md](./community.md) | 社区分享、标签、评论、举报、通知 |
| 管理员接口 | [admin.md](./admin.md) | 用户管理、举报处理、统计、日志、会话管理 |
| 系统配置接口 | [config.md](./config.md) | 系统配置管理、分析事件、邮件日志 |
| 系统接口 | [system.md](./system.md) | 健康检查、状态检测、统计、行为记录 |
| JAV榜单接口 | [jav.md](./jav.md) | JAV榜单、番号建议、详情、磁力链接 |
| 用户反馈接口 | [feedback.md](./feedback.md) | 用户反馈提交、反馈管理、邮件通知 |

---

## 路由注册汇总

后端路由注册顺序（index.ts）：

```typescript
app.route('/api/auth', authRoutes);              // 认证路由
app.route('/api/auth', githubOAuthRoutes);       // GitHub OAuth 路由
app.route('/api/user', userRoutes);              // 用户路由
app.route('/api/search', searchRoutes);          // 搜索路由
app.route('/api/search-sources', sourceRoutes);  // 搜索源路由
app.route('/api/community', communityRoutes);    // 社区路由
app.route('/api/admin', adminRoutes);            // 管理员路由
app.route('/api/config', configRoutes);          // 配置路由
app.route('/api/jav', javRoutes);                // JAV榜单路由
app.route('/api/feedback', feedbackRoutes);      // 用户反馈路由
app.route('/api', systemRoutes);                 // 系统路由
```

### 路由模块说明

| 模块 | 路由前缀 | 文件 | 认证方式 | 功能 |
|------|---------|------|---------|------|
| authRoutes | /api/auth | routes/auth.ts | 无全局中间件 | 用户认证、登录注册、邮箱验证、密码管理 |
| githubOAuthRoutes | /api/auth | routes/github-oauth.ts | 无全局中间件 | GitHub OAuth 第三方登录 |
| userRoutes | /api/user | routes/user.ts | 全局authMiddleware | 用户设置、收藏、搜索历史、活动记录 |
| searchRoutes | /api/search | routes/search.ts | 全局authMiddleware | 搜索执行、建议、热门 |
| sourceRoutes | /api/search-sources | routes/sources.ts | 全局authMiddleware | 搜索源CRUD、分类管理、用户配置 |
| communityRoutes | /api/community | routes/community.ts | 全局authMiddleware | 社区分享、标签、评论、举报、通知 |
| adminRoutes | /api/admin | routes/admin.ts | 全局管理员中间件 | 用户管理、举报处理、统计、日志、会话管理 |
| configRoutes | /api/config | routes/config.ts | 全局authMiddleware | 系统配置管理、分析事件、邮件日志 |
| javRoutes | /api/jav | routes/jav.ts | 全局authMiddleware | JAV榜单、番号建议、详情、磁力链接 |
| feedbackRoutes | /api/feedback | routes/feedback.ts | 可选认证 | 用户反馈提交、反馈管理、邮件通知 |
| systemRoutes | /api | routes/system.ts | 全局authMiddleware（/public-config、/health公开） | 健康检查、状态检测、统计、行为记录 |

---

## API统计

| 路由模块 | API数量 | 认证要求 |
|---------|--------|---------|
| authRoutes | 19 | 部分需要认证 |
| githubOAuthRoutes | 2 | 公开 |
| userRoutes | 13 | 全部需要认证 |
| searchRoutes | 3 | 全部需要认证 |
| sourceRoutes | 25 | 全部需要认证，部分需要管理员权限 |
| communityRoutes | 25 | 全部需要认证，部分需要管理员权限 |
| adminRoutes | 21 | 全部需要管理员权限 |
| configRoutes | 14 | 全部需要认证，部分需要管理员权限 |
| systemRoutes | 10 | 大部分需要认证 |
| javRoutes | 4 | 全部需要认证 |
| feedbackRoutes | 6 | 用户接口可选认证，管理员接口需要管理员权限 |
| **总计** | **142** | - |
