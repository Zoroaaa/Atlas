# 部署指南

> **适用版本**: v4.0.0+
>
> 目标平台：Cloudflare Workers + D1 + R2

---

## 目录

- [前置要求](#前置要求)
- [Step 1: Cloudflare 初始化](#step-1-cloudflare-初始化)
- [Step 2: D1 数据库](#step-2-d1-数据库)
- [Step 3: R2 对象存储](#step-3-r2-对象存储)
- [Step 4: 环境变量配置](#step-4-环境变量配置)
- [Step 5: 本地开发](#step-5-本地开发)
- [Step 6: 生产部署](#step-6-生产部署)
- [Step 7: 自定义域名](#step-7-自定义域名)
- [Step 8: CI/CD 自动化](#step-8-cicd-自动化)
- [运维操作](#运维操作)
- [故障排查](#故障排查)

---

## 前置要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 18 | 运行时 |
| pnpm | >= 8 | 包管理 |
| Wrangler CLI | >= 3.x | CF 部署工具 |
| Git | 任意 | 版本控制 |
| Cloudflare 账号 | - | Workers/D1/R2 |

```bash
# 安装 wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

---

## Step 1: Cloudflare 初始化

### 1.1 创建项目目录并克隆

```bash
git clone https://github.com/codeseek-team/codeseek.git
cd codeseek
pnpm install
```

### 1.2 项目结构确认

```
codeseek/
├── frontend/          # React 前端 (Vite)
├── backend/           # Hono 后端 (Workers)
├── packages/shared/   # 共享类型
├── database/          # SQL 迁移文件
└── docs/              # 文档
```

---

## Step 2: D1 数据库

### 2.1 创建数据库

```bash
npx wrangler d1 create codeseek-db
```

记下输出的 `database_id`，后续配置使用。

### 2.2 执行建表（按顺序）

**重要：必须按以下顺序执行，存在外键依赖关系。**

```bash
# 替换 <DATABASE_ID> 为上一步获取的 ID
D1_ID="<DATABASE_ID>"

# ① 基础 schema（用户、收藏、历史等基础表）
npx wrangler d1 execute $D1_ID --file=database/schema.sql

# ② 搜索源种子数据（含 v4.0 新增的 anime/movie 源）
npx wrangler d1 execute $D1_ID --file=database/06_data_search_sources.sql

# ③ 历史记录封面字段（v4.0 新增）
npx wrangler d1 execute $D1_ID --file=database/13_schema_history_cover.sql
```

### 2.3 验证数据库

```bash
# 查看表结构
npx wrangler d1 execute $D1_ID --command="SELECT name FROM sqlite_master WHERE type='table';"

# 预期输出应包含:
# users, favorites, history, comments, ratings, reports,
# feedback, search_sources, admin_logs (等)

# 验证搜索源数据（v4.0 应有 10+ 条，覆盖 3 个 category）
npx wrangler d1 execute $D1_ID --command="SELECT category, COUNT(*) as cnt FROM search_sources GROUP BY category;"
# 预期: anime=4, movie=4, jav=2+
```

---

## Step 3: R2 对象存储

### 3.1 创建存储桶

```bash
npx wrangler r2 bucket create codeseek-assets
```

### 3.2 设置 CORS 规则（可选）

如果前端直连 R2，需配置 CORS：

```json
[
  {
    "AllowedOrigins": ["https://codeseek.pp.ua"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

**注意：** v4.0 推荐使用后端图片代理 (`/api/jav/proxy-image`) 而非直连 R2，可跳过此步。

---

## Step 4: 环境变量配置

### 4.1 创建 `.env.local`（本地开发）

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入以下内容：

```env
# ── 认证 ──
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=abc123...
JWT_SECRET=rand0m-s3cr3t-k3y-32chars-min!!

# ── 数据库 ──
D1_DATABASE_ID=xxxxxxx_from_step_2

# ── 存储 (R2) ──
R2_ACCESS_KEY_ID=abc...
R2_SECRET_ACCESS_KEY=xyz...
R2_BUCKET_NAME=codeseek-assets
R2_PUBLIC_URL=https://pub-xxxx.r2.dev

# ── JAV 搜索源 ──
DMM_API_ID=your_dmm_api_id
DMM_API_KEY=your_dmm_api_key

# ── 影视搜索源 (v4.0 新增) ──
TMDB_API_KEY=your_tmdb_api_key

# ── 动漫搜索源 (v4.0 新增，可选) ──
BANGUMI_API_KEY=your_bangumi_api_key

# ── 系统 ──
APP_VERSION=4.0.0
NODE_ENV=development
ADMIN_GITHUB_IDS=your_github_numeric_id
```

### 4.2 生产环境 Secrets（Cloudflare Dashboard 或 Wrangler）

```bash
# 方式 A: 交互式设置（推荐首次使用）
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put D1_DATABASE_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put DMM_API_ID
wrangler secret put DMM_API_KEY
wrangler secret put TMDB_API_KEY          # v4.0 新增
# wrangler secret put BANGUMI_API_KEY     # 可选

# 方式 B: 通过 Cloudflare Dashboard
# Workers & Pages → codeseek-api → Settings → Variables and Secrets
```

---

## Step 5: 本地开发

### 5.1 启动开发服务器

```bash
# 启动全部服务（前端 :5173 + 后端 :8787 + D1 本地模拟）
pnpm dev
```

### 5.2 验证 v4.0 新功能

```bash
# 测试 1: 健康检查
curl http://localhost:8787/api/health

# 测试 2: 搜索源列表（应看到 3 个 category）
curl http://localhost:8787/api/config/search-sources

# 测试 3: 动漫分类列表
curl http://localhost:8787/api/search-sources/classifications/anime

# 测试 4: 影视分类列表
curl http://localhost:8787/api/search-sources/classifications/movie

# 测试 5: 动漫搜索（需先登录获取 token）
curl -X POST http://localhost:8787/api/search \
  -H "Content-Type: application/json" \
  -d '{"category":"anime","classification":"bangumi","keyword":"Frieren"}'

# 测试 6: 影视搜索
curl -X POST http://localhost:8787/api/search \
  -H "Content-Type: application/json" \
  -d '{"category":"movie","classification":"tmdb","keyword":"Inception"}'
```

### 5.3 本地数据库管理

```bash
# 查看 D1 本地数据
npx wrangler d1 execute codeseek-db --local --command="SELECT * FROM search_sources;"

# 重置本地数据库
rm -rf .wrangler/state/v3/d1/miniflare-D1DatabaseObject/
pnpm dev  # 会自动重建
```

---

## Step 6: 生产部署

### 6.1 构建

```bash
# 构建所有包
pnpm build
```

### 6.2 部署后端 API

```bash
cd backend
npx wrangler deploy
```

### 6.3 部署前端

前端部署到 Cloudflare Pages：

```bash
# 方式 A: 手动部署
cd frontend
npx wrangler pages deploy dist --project-name=codeseek-frontend

# 方式 B: 连接 GitHub 仓库自动部署（推荐）
# Cloudflare Dashboard → Pages → Create → Connect to Git
```

### 6.4 验证生产环境

```bash
# API 健康检查
curl https://api.codeseek.pp.ua/api/health

# 搜索源就绪检查
curl https://api.codeseek.pp.ua/api/config/search-sources

# 前端可访问性
curl -I https://codeseek.pp.ua
```

---

## Step 7: 自定义域名

### 7.1 API 域名

```bash
# 在 Cloudflare Dashboard 操作:
# Workers & Pages → codeseek-api → Settings → Domains & Certificates
# Add Custom Domain → api.codeseek.pp.ua
# （Cloudflare DNS 会自动添加 CNAME 记录）
```

### 7.2 前端域名

```bash
# Pages → codeseek-frontend → Settings → Domains & Certificates
# Add Custom Domain → codeseek.pp.ua
# 或 www.codeseek.pp.ua
```

### 7.3 SSL 证书

Cloudflare 自动提供免费 SSL 证书（Let's Encrypt），无需手动配置。

---

## Step 8: CI/CD 自动化

### GitHub Actions 工作流示例

```yaml
name: Deploy CodeSeek

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: ppm build
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          workingDirectory: backend
```

**需要的 GitHub Secrets：**

| Secret 名 | 说明 |
|-----------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需 Workers 编辑权限） |

---

## 运维操作

### 数据库备份

```bash
# 导出完整数据库
npx wrangler d1 export codeseek-db --remote > backup_$(date +%Y%m%d).sql

# 导入恢复（谨慎操作）
npx wrangler d1 execute codeseek-db --remote --file=backup_20260615.sql
```

### 搜索源管理

```bash
# 查看所有源状态
curl -H "Authorization: Bearer <admin_token>" \
  "https://api.codeseek.pp.ua/api/search-sources?includeStats=true"

# 健康检查
curl -H "Authorization: Bearer <admin_token>" \
  "https://api.codeseek.pp.ua/api/search-sources/health"

# 禁用某个源
curl -X PUT -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  "https://api.codeseek.pp.ua/api/search-sources/3" \
  -d '{"isActive": false}'
```

### 日志查看

```bash
# 实时日志（Tail）
npx wrangler tail  # 后端日志

# 或通过 Cloudflare Dashboard:
# Workers & Pages → codeseek-api → Logs → Begin log stream
```

### 版本回滚

```bash
# 回滚到上一个版本
# Cloudflare Dashboard → Workers → codeseek-api → Deployments
# 点击之前的 Deployment → Rollback
```

---

## 故障排查

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 搜索返回空结果 | TMDB_API_KEY 未配置或无效 | 检查环境变量，重新生成 Key |
| 动漫搜索超时 | Bangumi API 限流 | 配置 BANGUMI_API_KEY 或降低请求频率 |
| 图片不显示 | R2/CORS 问题 | 确认使用后端代理而非直连 |
| `PROVIDER_NOT_FOUND` 错误 | Provider 未注册 | 检查 `index.ts` 中是否有 `providerRegistry.register()` |
| `INVALID_CLASSIFICATION` 错误 | 分类名拼写错误 | 对照文档确认分类名（小写） |
| D1 迁移失败 | SQL 执行顺序错误 | 按 schema → data → migration 顺序执行 |

### v4.0 特有问题

| 问题 | 解决方案 |
|------|---------|
| 新类别 Tab 不显示 | 确认 Provider 已注册 + 前端 SearchPage 已更新 |
| 分类下拉为空 | 检查 `/api/search-sources/classifications/:category` 是否返回数据 |
| history 缺少 cover_image | 执行 `13_schema_history_cover.sql` 迁移 |
| `category` 参数报错 | 确认前端请求体包含 `category` 和 `classification` 字段 |

---

## 架构图

```
                    ┌─────────────┐
                    │   用户浏览器   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────┐
    │ Cloudflare   │ │ Cloudflare│ │ Cloudflare│
    │ Pages (前端)  │ │ Workers  │ │    D1     │
    │ codeseek.pp.ua│ │ (API)    │ │ (数据库)  │
    └──────────────┘ └────┬─────┘ └────┬─────┘
                          │            │
                ┌─────────┼────────────┤
                ▼         ▼            ▼
         ┌──────────┐ ┌──────┐ ┌──────────┐
         │    R2    │ │ 外部API│ │ 磁力站点  │
         │ (图片缓存)│ │TMDB等 │ │Nyaa/YTS等│
         └──────────┘ └──────┘ └──────────┘
```
