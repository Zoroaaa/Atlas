# CodeSeek API 文档

> **Base URL**: `https://api.codeseek.pp.ua/api`
>
> **版本**: v4.0.0
>
> **认证方式**: Bearer Token（GitHub OAuth 登录获取）

---

## 概述

CodeSeek API 基于 Cloudflare Workers + Hono 框架构建，提供 JAV / 动漫 / 影视三大类别的聚合搜索服务。

### 核心能力

| 能力 | 说明 |
|------|------|
| **聚合搜索** | 统一入口，支持 3 大类别 × 10+ 搜索分类 |
| **元数据聚合** | 多源数据合并、去重、评分 |
| **资源发现** | 磁力链接 / 种子 / 网盘 / 直链 |
| **用户体系** | OAuth 登录、收藏、历史 |
| **社区互动** | 评论、评分、举报 |
| **后台管理** | 源管理、用户管理、内容审核 |

### 三层搜索架构

```
Category (大类)  →  Classification (分类)  →  Source (源实例)
anime/movie/jav     bangumi/mikan/tmdb/...    数据库驱动的动态源
```

详见 [搜索 API](./search.md) 和 [搜索源管理](./sources.md)。

---

## 目录

### 核心 API
| 模块 | 文档 | 说明 |
|------|------|------|
| **[搜索](./search.md)** | [search.md](./search.md) | 统一搜索入口、动漫/影视/JAV 搜索详情、搜索历史 |
| **[搜索源](./sources.md)** | [sources.md] | 三层架构说明、源 CRUD、健康检查、批量操作 |
| **[认证](./auth.md)** | [auth.md] | GitHub OAuth 登录、Token 刷新、用户信息 |

### 业务 API
| 模块 | 路径前缀 | 说明 |
|------|---------|------|
| 用户 | `/api/user` | 个人信息、收藏管理、设置 |
| 社区 | `/api/community` | 评论、评分、举报、排行榜 |
| 反馈 | `/api/feedback` | 提交反馈、反馈列表（管理） |
| JAV | `/api/jav` | JAV 详情、图片代理、演员作品 |
| 管理 | `/api/admin` | 后台管理仪表盘、用户/评论/源管理 |
| 系统 | `/api` (root) | 健康检查、版本信息、统计数据 |
| 配置 | `/api/config` | 公开配置（搜索源列表、版本号等） |

---

## 通用约定

### 请求格式

- **Content-Type**: `application/json`
- **字符编码**: UTF-8
- **认证头**: `Authorization: Bearer <token>`

### 响应格式

所有接口统一响应格式：

```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

错误响应：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

### 分页

所有列表接口支持统一分页参数：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | number | 1 | 页码（从 1 开始） |
| `pageSize` | number | 20 | 每页条数（最大 100） |

分页响应：

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证（缺少/无效 Token） |
| 403 | 无权限（非管理员等） |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |
| 502 | 上游服务不可用 |
| 503 | 服务暂时不可用 |

### 速率限制

| 接口类别 | 限制 |
|---------|------|
| 搜索接口 | 30 次/分钟 |
| 认证接口 | 10 次/分钟 |
| 写入接口（收藏/评论） | 20 次/分钟 |
| 其他接口 | 60 次/分钟 |

超出限制返回 `429` + `Retry-After` 头。

---

## 快速开始

### 1. 获取 Token

```bash
# 发起 GitHub OAuth 登录
curl https://api.codeseek.pp.ua/api/auth/github

# 回调获取 code →换取 token
curl -X POST https://api.codeseek.pp.ua/api/auth/github/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "github_callback_code"}'

# 响应: { "token": "eyJ...", "user": { ... } }
```

### 2. 搜索

```bash
# 动漫搜索
curl -X POST https://api.codeseek.pp.ua/api/search \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"category":"anime","classification":"bangumi","keyword":"葬送的芙莉莲"}'

# 影视搜索
curl -X POST https://api.codeseek.pp.ua/api/search \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Version: application/json" \
  -d '{"category":"movie","classification":"tmdb","keyword":"inception"}'
```

### 3. 查看搜索源

```bash
# 获取所有源
curl -H "Authorization: Bearer eyJ..." \
  https://api.codeseek.pp.ua/api/search-sources

# 获取动漫类别下的分类
curl -H "Authorization: Bearer eyJ..." \
  https://api.codeseek.pp.ua/api/search-sources/classifications/anime
```

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| **v4.0.0** | 2026-06 | 新增动漫/影视搜索；三层搜索架构重构；Provider 注册模式 |
| v3.1.0 | 2026-05 | 社区评论系统；用户反馈机制；后台管理增强 |
| v3.0.0 | 2026-04 | GitHub OAuth；用户体系；D1 数据库迁移 |
| v2.0.0 | 2026-03 | MVP 上线；JAV 元数据 + 磁力搜索 |

---

## 相关文档

- [项目 README](../../readme.md) — 项目介绍与快速开始
- [部署指南](../deploy.md) — Cloudflare Workers 部署详解
- [配置说明](../config.md) — 环境变量与功能开关
- [更新日志](../changelogv4.0.0.md) — v4.0.0 详细变更记录
