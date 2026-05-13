# CodeSeek 版本 3.1.0 变更日志

> 📖 [返回项目主页](../readme.md) | [v3.0 变更日志](changelogv3.0.md) | [架构设计文档](backend-frontend-tree.md)

本文档详细记录 CodeSeek 从版本 3.0.0 升级到版本 3.1.0 的所有变更内容（commit `9fa3bf7` → `HEAD`）。

---

## 目录

- [概述](#概述)
- [📊 变更统计](#-变更统计)
- [📦 Monorepo 共享包改造](#-monorepo-共享包改造)
- [🔒 安全性加固](#-安全性加固)
- [⚙️ CI/CD 改进](#-cicd-改进)
- [⚡ 性能优化](#-性能优化)
- [🧹 代码质量提升](#-代码质量提升)
- [📄 文件变更清单](#-文件变更清单)
- [🔄 迁移指南](#-迁移指南)

---

## 概述

版本 3.1.0 是 CodeSeek 的**工程质量与架构优化版本**，核心变化包括：

- **📦 Monorepo 共享包**: 创建 `packages/shared`，统一类型定义和工具函数，消除前后端重复代码
- **🚦 CI 门禁**: 部署前强制执行 typecheck + lint，拦截不合格代码
- **⚡ 数据库索引**: 25 个高频查询索引，提升 D1 查询性能
- **🧹 代码去重**: camelizeKeys 工具函数、共享验证规则、构建脚本优化

**版本信息**
- 起始 commit: `9fa3bf7`
- 结束 commit: `d653990`
- 变更统计: **40+ 个文件修改**, **~800 行新增 / ~400 行删除**
- 发布日期: 2026-05-13

---

## 📊 变更统计

| 类别 | 文件数 | 新增行数 | 删除行数 |
|------|--------|---------|---------|
| 共享包 (packages/shared) | 14 (新增) | ~600 | 0 |
| 前端类型/工具重构 | 8 | ~80 | ~250 |
| 后端类型重构 | 3 | ~20 | ~150 |
| 安全加固 | 5 | ~100 | ~30 |
| CI/CD | 1 | ~10 | ~10 |
| 数据库索引 | 1 (新增) | ~60 | 0 |
| 构建配置 | 2 | 5 | 5 |

---

## 📦 Monorepo 共享包改造

### 改造动机

**问题**: 前后端各自独立维护以下重复内容：
- API 类型定义（User, SearchResponse, AuthResponse 等 40+ 接口）
- 验证规则常量（VALIDATION_RULES 50+ 字段）
- 工具函数（camelizeKeys）

**后果**: 改一个漏一个，类型不一致导致运行时 bug。

### 解决方案

```
codeseek/
├── package.json                      ← npm workspaces 根配置
├── packages/shared/                  ← 新增共享包
│   ├── package.json                  ← @codeseek/shared
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  ← 总入口：类型 + 工具 + 验证规则
│       ├── validations.ts            ← 验证规则单源
│       ├── types/
│       │   ├── auth.ts               ← User, LoginRequest, AuthResponse...
│       │   ├── search.ts             ← SearchHistoryItem, FavoriteItem...
│       │   ├── source.ts             ← SearchSource, Category, SourceStatus...
│       │   ├── community.ts          ← CommunitySharedSource, Tag...
│       │   └── common.ts             ← ApiResponse, PaginatedResponse
│       └── utils/
│           ├── camelize.ts           ← snake_case → camelCase 转换
│           └── index.ts
├── frontend/                         ← 从 @codeseek/shared 导入
└── backend/                          ← 从 @codeseek/shared 导入
```

### 入口文件

```typescript
// packages/shared/src/index.ts
export * from './types';          // 所有 API 契约类型
export * from './utils';          // camelizeKeys 等工具函数
export { VALIDATION_RULES } from './validations';  // 验证规则
```

### 前端接入

前端类型文件改为**重新导出**共享包的类型，前端专属类型（AdminUser、Toast、JavItem 等）原地保留：

```typescript
// frontend/src/types/auth.ts
export type {
  User, LoginRequest, RegisterRequest, AuthResponse
  // ... 15 个 API 类型
} from '@codeseek/shared';

// 前端专属类型保留
export interface AdminUser { /* ... */ }
export interface AdminUserDetail { /* ... */ }
```

**布局原则**:
| 共享 (packages/shared) | 前端专属 (frontend/src/types) |
|---|---|
| API 契约类型 (camelCase) | AdminUser, AdminUserDetail |
| 验证规则 VALIDATION_RULES | Toast, ToastType, ToastConfig |
| camelizeKeys 工具函数 | JavItem, JavDetail, MagnetItem |
| ApiResponse, PaginatedResponse | AdminSystemStats, AuditLog, Report |
| SearchSource, Category, MajorCategory | CreateSourceRequest 等表单请求类型 |

### 后端接入

后端同样从共享包导入验证规则，DB 层的 snake_case 类型原地保留：

```typescript
// backend/src/constants.ts
export { VALIDATION_RULES } from '@codeseek/shared';  // ← 不再自行定义
```

### 部署不受影响

- 根目录 `npm install` 建立 workspace 符号链接
- `cd frontend && npm run build` 和 `cd backend && npm run deploy` 各自独立执行
- Vite 和 Wrangler 均通过 esbuild 自动解析 workspace 依赖

---

## 🔒 安全性加固

### 关闭生产 Source Map

**变更文件**: [`frontend/vite.config.ts`](../frontend/vite.config.ts)

```diff
- sourcemap: true,   // ❌ 生产环境暴露完整源代码
+ sourcemap: false,  // ✅ 仅开发环境生成
```

---

## ⚙️ CI/CD 改进

### 部署前强制检查

**变更文件**: [`.github/workflows/backend-deploy.yml`](../.github/workflows/backend-deploy.yml)

```yaml
# 新增步骤（在 Deploy 之前）
- name: Type Check
  run: npm run typecheck       # tsc --noEmit

- name: Lint
  run: npm run lint            # eslint src
```

**效果**: 类型错误或代码规范问题在部署前被拦截，不再推送到生产环境。

---

## ⚡ 性能优化

### 1. 数据库查询索引

**变更文件**: [`database/12_index_performance.sql`](../database/12_index_performance.sql) (新增)

25 个高频查询字段索引，覆盖：

| 表 | 索引字段 | 影响查询 |
|---|---|---|
| `users` | `email`, `username`, `role_id` | 登录、注册、用户列表 |
| `user_sessions` | `user_id`, `token_hash`, `expires_at` | 会话验证、定时清理 |
| `user_favorites` | `user_id` | 收藏列表查询 |
| `user_search_history` | `user_id`, `created_at` | 搜索历史查询 |
| `email_verifications` | `email`, `user_id`, `(verification_type, email)` | 验证码查询 |
| `security_lockouts` | `(lockout_type, identifier)` | 锁定检查 |
| `community_shared_sources` | `user_id`, `status` | 社区列表查询 |
| `community_source_reviews` | `shared_source_id` | 评论查询 |
| 其他 7 张表 | 高频查询字段 | 安全事件、操作日志等 |

### 2. 构建脚本优化

**变更文件**: [`frontend/package.json`](../frontend/package.json)

```diff
- "build": "tsc -b && vite build",      // tsc -b 重复 emit 文件
+ "build": "tsc --noEmit && vite build", // 仅类型检查，Vite 负责构建
```

`tsc -b` 会生成 `.js` 文件后再被 Vite (esbuild) 覆盖，完全冗余。

---

## 🧹 代码质量提升

### 1. camelizeKeys 工具函数

**位置**: [`packages/shared/src/utils/camelize.ts`](../packages/shared/src/utils/camelize.ts)

递归转换 `snake_case` → `camelCase`，消除 API 响应处理中的样板代码：

```typescript
// 之前：每个接口手写 15 行字段映射
history: response.data.history.map(h => ({
  userId: h.user_id as string,
  resultsCount: h.results_count as number,
  createdAt: h.created_at as number,
  // ... 10+ 个字段
}))

// 现在：一行搞定
history: camelizeKeys<SearchHistoryItem[]>(response.data.history)
```

已在 `search.ts` 的 `getSearchHistory` 方法中应用。

### 2. 共享验证规则

验证规则从前后端各自定义改为单文件管理：

```typescript
// frontend/src/constants.ts + backend/src/constants.ts
export { VALIDATION_RULES } from '@codeseek/shared';
// ← 改一处，两头生效
```

消除原有 50+ 行重复的验证规则定义。

### 3. 类型修复

| 文件 | 修复内容 |
|------|----------|
| `frontend/src/types/auth.ts` | `AdminUser.permissions` `string` → `string[]`（与 User 基类一致） |
| `frontend/src/types/auth.ts` | `AdminUserDetail.permissions` `string` → `string[]` |
| `frontend/src/types/auth.ts` | 补充 `Role` 接口导出 |
| `frontend/src/types/search.ts` | 51行手动映射 → 1行 re-export |
| `frontend/src/types/source.ts` | 87行手动映射 → 1行 re-export |
| `frontend/src/types/common.ts` | 33行手动映射 → 1行 re-export |

### 4. 删除冗余文件

| 文件 | 原因 |
|------|------|
| `frontend/src/utils/camelize.ts` | 已迁移至 `packages/shared` |
| `shared/validations.ts` | 已迁移至 `packages/shared` |

---

## 📄 文件变更清单

### 新增文件 (14个)
| 文件路径 | 说明 |
|----------|------|
| `package.json` | npm workspaces 根配置 |
| `packages/shared/package.json` | `@codeseek/shared` 包定义 |
| `packages/shared/tsconfig.json` | 共享包 TypeScript 配置 |
| `packages/shared/src/index.ts` | 共享包总入口 |
| `packages/shared/src/validations.ts` | 共享验证规则 |
| `packages/shared/src/types/auth.ts` | 认证 API 类型 |
| `packages/shared/src/types/search.ts` | 搜索 API 类型 |
| `packages/shared/src/types/source.ts` | 搜索源 API 类型 |
| `packages/shared/src/types/community.ts` | 社区 API 类型 |
| `packages/shared/src/types/common.ts` | 通用 API 类型 |
| `packages/shared/src/types/index.ts` | 类型总入口 |
| `packages/shared/src/utils/camelize.ts` | camelizeKeys 工具 |
| `packages/shared/src/utils/index.ts` | 工具总入口 |
| `database/12_index_performance.sql` | 数据库索引迁移 |

### 修改文件 (12个)
| 文件文件 | 变更类型 | 主要改动 |
|----------|----------|----------|
| `.github/workflows/backend-deploy.yml` | CI/CD | 新增 typecheck + lint 步骤 |
| `backend/package.json` | 依赖 | 新增 `@codeseek/shared` |
| `backend/src/constants.ts` | 重构 | VALIDATION_RULES 从 shared 导入 |
| `frontend/package.json` | 依赖+脚本 | 新增 shared 依赖；build 优化 |
| `frontend/vite.config.ts` | 安全 | sourcemap: false |
| `frontend/src/constants.ts` | 重构 | VALIDATION_RULES 从 shared 导入 |
| `frontend/src/services/api/search.ts` | 重构 | 使用 camelizeKeys |
| `frontend/src/types/auth.ts` | 重构 | 从 shared 导入 + 类型修复 |
| `frontend/src/types/search.ts` | 重构 | 从 shared 导入 |
| `frontend/src/types/source.ts` | 重构 | 从 shared 导入 |
| `frontend/src/types/common.ts` | 重构 | 从 shared 导入 |
| `frontend/src/utils/index.ts` | 重构 | camelize 从 shared 导入 |

### 删除文件 (0个)
（无文件删除）

---

## 🔄 迁移指南

### 1. Monorepo 初始化

```bash
# 在项目根目录执行（只需一次）
npm install
# 自动建立 workspace 符号链接：
# node_modules/@codeseek/shared → packages/shared
```

### 2. 数据库迁移

```bash
# 执行索引迁移（必须）
cd backend
wrangler d1 execute <DATABASE_NAME> --file=../database/12_index_performance.sql
```

### 3. 前端部署

```bash
cd frontend
npm install
npm run build
# 如使用 Cloudflare Pages：
wrangler pages deploy dist
```

### 4. 后端部署

```bash
cd backend
npm run deploy
# 注意：wrangler 自动通过 esbuild 解析 @codeseek/shared workspace 依赖
```

### 5. 验证清单

- [ ] `npm install` 在根目录执行成功，`node_modules/@codeseek/shared` 存在
- [ ] 前端 `npm run typecheck` 无错误
- [ ] 前端 `npm run build` 构建成功
- [ ] 后端 `npm run typecheck` 无错误
- [ ] 后端 `npm run deploy` 部署成功
- [ ] 登录/注册后关闭浏览器重新打开，自动保持登录状态（Token 加密解密正常）
- [ ] GitHub OAuth 登录正常
- [ ] 数据库索引已创建（检查 D1 控制台）
- [ ] CI 门禁生效（typecheck + lint 在 Deploy 之前执行）

### 6. 向后兼容

- ✅ 前端 API 接口无变更，用户无感知
- ✅ 后端数据库仅新增索引，无破坏性变更
- ✅ 前后端构建脚本保持相同命令（`npm run build` / `npm run deploy`）
- ⚠️ Token 存储格式从明文变为 AES-GCM 加密，旧用户需重新登录

---

**让搜索更简单，让体验更美好！**

Made with ❤️ by [Zoro](https://github.com/Zoroaaa) | Version 3.1.0 | 2026-05-13