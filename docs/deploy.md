# 部署指南

> 适用版本：v1.6.0+
> 本文覆盖全新数据库的一次性初始化、已有数据库的增量升级、本地开发、生产部署与故障排查。

---

## 一、部署架构

```
用户浏览器
   │
   ├─ Cloudflare Pages（frontend 构建产物）
   │     └─ /api/* 反向代理到 Workers
   │
   └─ Cloudflare Workers（backend，Hono）
         ├─ D1（绑定名 DB，database_name = codeseek）
         ├─ Cron Triggers（每小时清理 / 每 30 分钟关注检测 + 邮件摘要）
         └─ 外部服务（GitHub OAuth / Google OAuth / Resend / 搜索源）
```

- 不使用 R2 或 KV；所有持久化数据都在 D1
- 前端为静态站点，后端为单一 Worker
- 通知、关注、邮件队列都复用同一个 D1

---

## 二、前置要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 18 | CI 使用 Node 20 |
| npm | >= 9 | 仓库使用 npm workspaces，根目录提交 `package-lock.json` |
| Wrangler | >= 3 | 本地可用 `npx wrangler` |
| Cloudflare 账号 | — | 需要 Workers、D1、Pages 权限 |

本地开发还需要一个 GitHub OAuth App（必需）和 Resend 账号（邮件功能需要）。

---

## 三、首次部署（全新数据库）

### 1. 获取代码并安装依赖

```bash
git clone https://github.com/Zoroaaa/Atlas.git
cd Atlas
npm install
```

### 2. 创建 D1 数据库

```bash
npx wrangler d1 create codeseek
```

将返回的 `database_id` 写入 `backend/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "codeseek"
database_id = "<返回的 database_id>"
```

### 3. 配置非敏感变量

`backend/wrangler.toml` 的 `[vars]` 至少确认以下值：

```toml
[vars]
APP_VERSION = "1.6.0"
APP_ENV = "production"
SITE_URL = "https://atlas.example.com"
FRONTEND_URL = "https://atlas.example.com"
BACKEND_URL = "https://api-atlas.example.com"
DEFAULT_FROM_EMAIL = "noreply@atlas.example.com"
DEFAULT_FROM_NAME = "Atlas"
JWT_EXPIRY_DAYS = "30"
ENABLE_ACTION_LOGGING = "true"
```

### 4. 配置 Secrets

本地开发写入 `backend/.dev.vars`（不要提交）：

```dotenv
JWT_SECRET=replace-with-a-32-byte-random-string
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
RESEND_API_KEY=re_your_resend_key
RANKINGS_IMPORT_SECRET=optional-shared-secret
```

生产环境：

```bash
cd backend
npx wrangler secret put JWT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RANKINGS_IMPORT_SECRET
```

### 5. 初始化数据库（必须按 01 → 19 顺序）

全新库一次性执行全部脚本，顺序不能调整：

```bash
cd backend

for f in 01_schema_core 02_schema_search 03_schema_community 04_schema_security \
         05_schema_feedback_announcements 06_data_system 07_data_search_sources \
         08_data_tags 09_indexes_triggers 10_schema_system_errors \
         11_schema_data_storage 12_schema_search_tier 13_backfill_search_tier \
         14_schema_notifications_follows 15_migrate_actress_favorites_to_follows \
         16_email_notifications 17_schema_announcement_reads \
         18_backfill_community_notifications 19_schema_community_post_views; do
  npx wrangler d1 execute codeseek --remote --file=../database/$f.sql
done
```

Windows PowerShell：

```powershell
cd backend
$scripts = @(
  '01_schema_core','02_schema_search','03_schema_community','04_schema_security',
  '05_schema_feedback_announcements','06_data_system','07_data_search_sources',
  '08_data_tags','09_indexes_triggers','10_schema_system_errors',
  '11_schema_data_storage','12_schema_search_tier','13_backfill_search_tier',
  '14_schema_notifications_follows','15_migrate_actress_favorites_to_follows',
  '16_email_notifications','17_schema_announcement_reads',
  '18_backfill_community_notifications','19_schema_community_post_views',
  '20_fix_community_user_stats','21_schema_jav_genres'
)
foreach ($s in $scripts) {
  npx wrangler d1 execute codeseek --remote --file="../database/$s.sql"
}
```

说明：

| 脚本 | 作用 | 全新库是否需要 |
|------|------|----------------|
| `01`–`12` | 基础表、搜索、社区、安全、公告、标签、索引、数据存储、搜索档位 | 必需 |
| `13_backfill_search_tier` | 回填已有用户的搜索档位 | 必需（空表时无操作） |
| `14_schema_notifications_follows` | 通知、关注、邮件偏好、用户公告已读相关表 | 必需 |
| `15_migrate_actress_favorites_to_follows` | 女优收藏迁移为关注 | 必需（新库无数据，安全） |
| `16_email_notifications` | 邮件发送日志、队列、退订令牌 | 必需 |
| `17_schema_announcement_reads` | 公告已读表 | 必需 |
| `18_backfill_community_notifications` | 历史社区互动补写通知 | 可选（新库无数据） |
| `19_schema_community_post_views` | 帖子浏览 24 小时去重表 | 必需 |
| `20_fix_community_user_stats` | 社区统计改为实时聚合，删除冗余列/表/触发器 | 必需（一次性，勿重复执行） |
| `21_schema_jav_genres` | 推荐标签词典与标签分页状态表 | 必需 |

除 `20` 外，表结构脚本均可重复执行；`20` 是有损修复脚本（`DROP COLUMN`/`DROP TABLE`），重复执行会因对象不存在报错，只需执行一次。`08` 与 `12` 已修复跨版本重复加列问题，`13`/`18` 为空表时无副作用。

### 6. 本地开发

分别启动两个终端：

```bash
npm run dev --workspace=backend    # http://localhost:8787
npm run dev --workspace=frontend   # http://localhost:3000
```

前端 Vite 已把 `/api` 代理到 `http://localhost:8787`。本地 D1 初始化把 `--remote` 换成 `--local`，或在 `backend` 目录执行：

```bash
npx wrangler d1 execute codeseek --local --file=../database/01_schema_core.sql
```

### 7. 部署后端

```bash
npm run typecheck --workspace=backend
npm run lint --workspace=backend
npm run deploy --workspace=backend
```

部署后检查：

```bash
curl https://api-atlas.example.com/api/health
# { "success": true, "data": { "status": "ok", "version": "1.6.0" } }
```

### 8. 部署前端

```bash
npm run build --workspace=frontend
npx wrangler pages deploy frontend/dist --project-name atlas-frontend
```

Cloudflare Pages 项目需要把 `FRONTEND_URL` 对应的自定义域名绑定好，并在 Pages 中配置 `/api/*` 反代到 Worker 域名（或使用同一域名下的 Routes）。

### 9. 配置 OAuth 回调

| 平台 | 回调地址 |
|------|----------|
| GitHub | `${BACKEND_URL}/api/auth/github/callback` |
| Google | `${BACKEND_URL}/api/auth/google/callback` |

回调地址必须与 `BACKEND_URL` 完全一致。

### 10. 验收清单

- [ ] `/api/health` 返回 `version: 1.6.0`
- [ ] `/api/system/public-config` 返回站点名与注册开关
- [ ] 注册 → 邮箱验证码 → 登录成功
- [ ] `/help` 可访问且三语文案正常
- [ ] `/dashboard/notifications` 能收到关注/社区/公告通知
- [ ] 通知偏好页能发送测试邮件（收到即表示 Resend 配置正确）
- [ ] 后台「邮件日志 / 邮件队列」有数据
- [ ] 社区帖子 24 小时内重复浏览不增加 `view_count`

---

## 四、已有数据库升级（v1.5.x → v1.6.0）

先执行新增迁移，再部署代码：

```bash
cd backend
npx wrangler d1 execute codeseek --remote --file=../database/17_schema_announcement_reads.sql
npx wrangler d1 execute codeseek --remote --file=../database/18_backfill_community_notifications.sql
npx wrangler d1 execute codeseek --remote --file=../database/19_schema_community_post_views.sql
```

已经部署过 v1.6.0 的库，再按顺序补执行 `20_fix_community_user_stats.sql`（一次性，勿重复）与 `21_schema_jav_genres.sql`（幂等）：

```bash
npx wrangler d1 execute codeseek --remote --file=../database/20_fix_community_user_stats.sql
npx wrangler d1 execute codeseek --remote --file=../database/21_schema_jav_genres.sql
```

升级注意事项：

- `18` 会把历史社区互动补写为通知，数据量大时建议在低峰执行
- 帖子浏览去重表只记录 24 小时内的 `(post_id, viewer_key)`，过期行由每小时清理任务删除
- 公告不再写入通知表，改为读取时合并，因此升级后社区通知 Tab 与旧接口会消失，统一入口为 `/dashboard/notifications`
- 版本号升级不涉及 D1 结构变更

---

## 五、Cron Triggers

`backend/wrangler.toml` 已配置两个触发器，`backend/src/index.ts` 的 `scheduled` 按 `event.cron` 精确匹配分发；传入其他 cron 字符串不会执行任何任务。

| Cron | 频率 | 任务 |
|------|------|------|
| `5 * * * *` | 每小时 | 清理过期会话、7 天前验证码、分批数据清理（rate_limits / post_views / data_records）、补全待处理 JAV 记录、推荐标签词典同步（7 天到期判断） |
| `*/30 * * * *` | 每 30 分钟 | 关注女优新作检测（≤20 次子请求）+ 邮件摘要合并发送（≤15 封），合计低于 50 次子请求上限 |

小时任务固定在 `:05`，与 `*/30` 的 `:00/:30` 轮次错开，避免两套任务同一分钟写 D1。

各任务相互独立，避免共用同一次调用的子请求额度；关注检测、邮件摘要、数据清理、记录补全、词典同步各自持有 `cron_locks` 租约（`database/25_cron_locks.sql`），上一轮未跑完时本轮直接跳过。

### 手动触发

**方式一：本地 `/__scheduled`（只影响本地模拟 D1）**

```bash
cd backend
npx wrangler dev --test-scheduled
```

另开终端，按 cron 字符串触发：

```bash
curl "http://127.0.0.1:8787/__scheduled?cron=0+*+*+*+*"    # 每小时任务组（含词典同步）
curl "http://127.0.0.1:8787/__scheduled?cron=*/30+*+*+*+*" # 30 分钟任务组（关注检测 + 邮件）
```

`+` 会被解码为空格，cron 必须与配置完全一致。一次触发会执行该 cron 下的**全部**任务，不只是词典同步；本地触发只写本地模拟 D1。

**方式二：管理员接口（生产可用）**

```bash
curl -X POST "https://<api-domain>/api/admin/data-storage/genre-dict/sync" \
  -H "Authorization: Bearer <管理员 JWT>"
```

- 仅 `admin` / `super_admin` 可调用：未登录 401，非管理员 403
- 同一用户 60 秒 1 次，超限 429 并返回 `Retry-After`
- 沿用 7 天到期判断：未到期时返回 `updated: 0`、各 section 为 `skipped`，不发起外部请求
- 返回 `{ updated, sections }`，不包含外部页面内容

**风险提示**

- 不要用 `wrangler dev --remote --test-scheduled` 做日常验证：它会连接**生产 D1** 并执行该 cron 下的全部任务。确需使用时先确认本地代码与线上一致，避免误清理会话或误写生产数据。
- 手动触发 `5 * * * *` 组无法只跑词典同步，会同时执行会话/验证码清理、数据清理与记录补全。
- 词典同步没有 force 参数，同一 section 未到期不会重复抓取，重复触发只会得到 `skipped`。

---

## 六、CI/CD

仓库内置 `.github/workflows/backend-deploy.yml`：

- 触发：推送到 `main` 且改动 `backend/**`，或手动 `workflow_dispatch`
- 流程：`npm install` → `typecheck` → `lint` → `wrangler deploy`
- 需要的仓库 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`

`javdb-ranking-daily.yml` / `javdb-ranking-probe.yml` 用于榜单抓取与探活，需要配置 `ATLAS_RANKING_IMPORT_URL`（完整导入地址）与 `RANKINGS_IMPORT_SECRET`。

前端目前未接入 CI 自动部署，按第三节第 8 步手动发布；如需自动化，在 Pages 项目中连接 GitHub 仓库并设置构建命令：

```bash
npm install && npm run build --workspace=frontend
```

输出目录：`frontend/dist`。

---

## 七、常见问题

### Q1: `wrangler dev` 报 EPERM / 无法写日志

Windows 下 Wrangler 需要写 `%APPDATA%\xdg.config\.wrangler\logs`。以普通用户权限运行，或设置可写的 `XDG_CONFIG_HOME` 后重试。

### Q2: 数据库脚本执行到一半失败

所有脚本都是幂等的，修复报错后从失败的那个脚本继续执行即可，不需要回滚重建。常见原因：

- 数据库 ID 配置错误（`database_name` 必须是 `codeseek`）
- 跳过了前置脚本（例如先执行 `14` 再执行 `03`）
- 使用了旧版脚本（`08`/`12` 的旧版本可能重复加列）

### Q3: 邮件发送失败

1. 检查 `RESEND_API_KEY` 与 `DEFAULT_FROM_EMAIL` 域名是否已验证
2. 查看 `email_send_logs` 的 `status` 与 `error_message`
3. 查看 `email_queue` 是否堆积在 `failed`
4. 确认用户邮箱已验证，且通知偏好中已开启对应邮件开关
5. 确认未触发 `email_rate_limit_per_hour` / `email_rate_limit_per_day`

### Q4: 通知收件箱没有公告

公告为读取时合并，只有同时满足以下条件才可见：

- `site_announcements` 中公告处于发布状态且在有效期内
- 用户未在 `user_announcement_reads` 中删除该公告
- 通知偏好中「站点公告」站内开关未关闭

### Q5: 前端提示找不到 `@codeseek/shared`

确认 `frontend/tsconfig.json` 的 `paths` 与 `vite.config.ts` 的 `alias` 同时存在；修改后重启 TS Server 与 Vite。

### Q6: 需要回滚版本

```bash
git checkout <上一个发布提交>
npm install
npm run deploy --workspace=backend
npm run build --workspace=frontend && npx wrangler pages deploy frontend/dist --project-name atlas-frontend
```

v1.6.0 的迁移均为新增表，回滚代码不会破坏数据；如需彻底回退数据库，可手动删除 `user_announcement_reads`、`community_post_views`、`email_send_logs`、`email_queue` 等新表。
