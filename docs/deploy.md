# 部署指南

> 适用版本：v1.9.0+
> 本文面向**从零部署一套全新实例**：一个 Cloudflare Worker 同时托管前端静态资源与 API，数据库为 D1，
> 部署入口为 Workers Builds（直连 GitHub，push 即部署）。文中 `<your-domain>` 请替换为你的自定义域。

---

## 一、架构

```
用户浏览器
   │
   └─ Cloudflare Worker: atlas（Hono + Workers Static Assets）
         ├─ /api、/api/*   → Hono 路由（run_worker_first）
         ├─ 其余路径        → frontend/dist（not_found_handling = single-page-application）
         ├─ D1（绑定名 DB，database_name = codeseek）
         ├─ Cron Triggers（每小时清理 / 每 30 分钟关注检测 + 邮件摘要 / 每分钟补全批次）
         ├─ 外部服务（GitHub OAuth / Google OAuth / Resend / TMDB / 搜索源）
         └─ 自定义域：<your-domain>（前端与 API 同源）
```

- 不使用 R2、KV、Durable Objects、Queues、Vectorize；所有持久化数据都在 D1
- 前端是纯静态产物，与 API **同一个 Worker、同一个版本、同一次回滚**
- 前端 API 地址是同源相对路径 `/api`（`frontend/src/constants.ts` 的 `API_BASE_URL`），不依赖任何绝对域名
- 通知、关注、邮件队列复用同一个 D1

---

## 二、前置条件

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | >= 18 | 本地构建与 CI 均适用 |
| npm | >= 9 | 仓库是 npm workspaces，根目录提交 `package-lock.json` |
| Wrangler | 4.x | 仓库 devDependency 已是 `^4.160.0`，用 `npx wrangler` |
| Cloudflare 账号 | Workers + D1 权限 | 免费计划即可（注意 cron 上限 5 个） |
| 自定义域名 | 托管在 Cloudflare 的 Zone | 用于 Workers Custom Domain |
| GitHub OAuth App | 必需 | 登录功能依赖 |
| Google OAuth Client | 可选 | 不配则仅支持 GitHub 登录 |
| Cloudflare Email Sending（Workers Paid）/ Mailtrap / Resend / Brevo | 邮件功能需要 | 至少配置一家，否则验证码/通知邮件全部发不出 |
| TMDB API Key | 可选 | 影视元数据搜索来源，缺失时该来源静默跳过 |

---

## 三、创建 Cloudflare 资源

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create codeseek
```

把返回的 `database_id` 写入 `backend/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "codeseek"
database_id = "<返回的 database_id>"
```

`binding` 必须是 `DB`：代码里所有查询都通过 `env.DB` 访问。

### 2. 创建 Worker

不需要手动在面板新建，第一次 `wrangler deploy` 会按 `backend/wrangler.toml` 的 `name = "atlas"` 创建。
若要改名：**面板名与配置 `name` 必须同时改**，否则会出现"部署成功但流量没变"或并列多出一个 Worker。

---

## 四、变量与密钥清单

### 1. 普通变量（`backend/wrangler.toml` → `[vars]`）

| 变量 | 必填 | 用途 | 缺失/错误后果 |
|---|---|---|---|
| `APP_VERSION` | 建议 | `/api`、`/api/system/version`、前端版本展示 | 兜底 `1.9.0`（代码内写死，发版不更新会显示旧版本） |
| `SITE_URL` | **必需** | 邮件模板中的「访问站点」链接、反馈通知页脚 | 兜底 `https://example.com`，邮件里的按钮会指向无效页面 |
| `FRONTEND_URL` | **必需** | OAuth 完成后跳转的前端地址 | 兜底 `https://atlas.wort.uk`，换域名后必须显式配置 |
| `BACKEND_URL` | **必需** | OAuth callback 构造、邮件退订链接 `${BACKEND_URL}/api/email/unsubscribe` | 兜底 `https://atlas.wort.uk`；错了会导致登录回调 404、退订失效 |
| `DEFAULT_FROM_EMAIL` | **必需** | Cloudflare 发件人地址，必须属于 Cloudflare Email Sending 已 onboard 域名 | 缺失时兜底 `noreply@mail.wort.uk`，域名不匹配会导致发信失败 |
| `DEFAULT_FROM_NAME` | 建议 | 发件人显示名、反馈邮件站点名 | 兜底 `Atlas` |
| `JWT_EXPIRY_DAYS` | 建议 | 登录令牌有效期（天） | 兜底 `30` |
| `ENABLE_ACTION_LOGGING` | 建议 | 行为日志开关，判定条件是 `=== 'true'` | 删除/设为其他值 **等于关闭** 行为日志（不是报错，而是静默停记） |

> `[vars]` 是部署级配置：改完必须重新部署才生效。

### 2. 敏感凭据（`wrangler secret put`，不要写进 toml）

| Secret | 必填 | 用途 | 缺失后果 |
|---|---|---|---|
| `JWT_SECRET` | **必需** | 签发/校验 JWT、邮件退订 token | 登录态与退订链接全部失效 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | **必需** | GitHub OAuth 登录 | `/api/auth/github/*` 不可用 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 可选 | Google OAuth 登录 | 该登录入口不可用 |
| `RESEND_API_KEY` | 可选 | Resend API Key | 未配置时 Resend 不参与发送队列 |
| `MAILTRAP_API_TOKEN` | 可选 | Mailtrap Email Sending API Token | 未配置时 Mailtrap 不参与发送队列 |
| `MAILTRAP_API_URL` | 可选 | Mailtrap 发送端点 | 默认 `https://send.api.mailtrap.io/api/send`；Sandbox 测试时覆盖 |
| `BREVO_API_KEY` | 可选 | Brevo Transactional Email API Key | 未配置时 Brevo 不参与发送队列 |
| `RANKINGS_IMPORT_SECRET` | 榜单导入必需 | GitHub Actions 调 `/api/internal/rankings/import` 时的共享密钥 | 导入接口 401 |
| `GITHUB_DISPATCH_TOKEN` | 可选 | Worker 每 30 分钟 dispatch 关注即将发售 workflow（`actions:write`） | 退回 GitHub 原生 schedule，可能延迟/跳过 |
| `TMDB_API_KEY` | 可选 | 影视元数据搜索 | 该来源静默跳过 |

```bash
cd backend
npx wrangler secret put JWT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RANKINGS_IMPORT_SECRET
npx wrangler secret put GITHUB_DISPATCH_TOKEN
npx wrangler secret put TMDB_API_KEY
```

本地开发写入 `backend/.dev.vars`（已 gitignore，格式同上 `KEY=value`）。

#### 邮件服务商优先级与限额

Cloudflare、Resend、Mailtrap、Brevo 可以同时配置，发送时按管理端「系统配置 → 邮件」依次尝试：

1. 每家使用独立发件子域名（隔离域名信誉，代码内固定绑定）：Cloudflare `noreply@mail.wort.uk`、Resend `noreply@resend.wort.uk`、Mailtrap `noreply@mailtrap.wort.uk`、Brevo `noreply@brevo.wort.uk`；
2. `email_priority_cloudflare` / `email_priority_resend` / `email_priority_mailtrap` / `email_priority_brevo`：默认 `0 / -1 / -1 / -1`，数值越小越优先，`-1` 停用；调整阶段仅保留 Cloudflare，某家子域名验证完成后在管理端改回 `0`~`3` 启用；
3. `email_daily_limit_*`：默认每家 `100` 封/天，`0` 不限额；达到上限自动跳到下一优先级；
4. 未配置凭据或发送失败也会继续尝试下一家。

Cloudflare 启用前确认：

1. 账号为 Workers Paid，并在 **Compute → Email Service → Email Sending** 为发件域完成 onboard；
2. `DEFAULT_FROM_EMAIL` 属于该已 onboard 域名；
3. `database/02_config.sql` 与 `database/05_security_email.sql` 已执行，管理端能看到优先级与限额配置。

Mailtrap 启用前确认：API Token 具备发送权限、发件域名已在 Mailtrap 验证，并在 Sending Setup 中切换到 Transactional Stream 的 API 模式。

Brevo 启用前确认：API Key 具备发送权限，发件域名/发件人已在 Brevo 完成验证。


### 3. 代码内的域名白名单（不属于环境变量）

`backend/src/constants.ts` 的 `ALLOWED_ORIGINS` 是 CORS 白名单。换域名时必须同步修改并重新部署，否则浏览器端跨域请求会被拒。同源部署下前端不再产生跨域请求，但该白名单仍影响外部调用方。

---

## 五、初始化数据库

脚本按业务类别拆在 `database/`，按文件名顺序执行。所有文件都可重复执行：
表/视图/索引/触发器使用 `IF NOT EXISTS`，种子数据使用 `INSERT OR IGNORE`。

```bash
cd backend
# Bash / WSL / Git Bash
for f in ../database/*.sql; do
  npx wrangler d1 execute codeseek --remote --file="$f"
done
```

```powershell
# PowerShell
cd backend
Get-ChildItem ../database/*.sql | Sort-Object Name | ForEach-Object {
  npx wrangler d1 execute codeseek --remote --file=$_.FullName
}
```

| 文件 | 内容 |
|---|---|
| `01_core.sql` | 角色、用户、会话、收藏、搜索历史、行为日志、分析事件 |
| `02_config.sql` | 系统配置、配置分组、配置变更日志 |
| `03_search_sources.sql` | 搜索大类、分类、搜索源、用户源配置、状态缓存 |
| `04_community.sql` | 社区标签、帖子、评论、点赞、举报、浏览去重 |
| `05_security_email.sql` | 验证码、改邮箱、密码重置、登录锁定、安全事件、邮件模板与发送日志 |
| `06_system.sql` | 反馈、站点公告、系统错误、Cron 锁 |
| `07_notifications_follows.sql` | 站内通知、关注对象、关注作品、即将发售、邮件队列 |
| `08_jav_library.sql` | JAV 作品库、来源、标签词典、详情补全、实体别名 |
| `09_seed_sources_jav.sql` | JAV 搜索源种子 |
| `10_seed_sources_anime.sql` | 动漫搜索源种子 |
| `11_seed_sources_movie.sql` | 影视搜索源种子 |
| `12_seed_sources_manga.sql` | 漫画搜索源种子 |
| `13_seed_sources_novel.sql` | 小说搜索源种子 |

- 全新库按 `01` → `13` 顺序执行；已有生产库可只执行本次改动的分类文件，重复执行不会清空数据。
- `CREATE TABLE IF NOT EXISTS` 不会给已有表补列；未来新增列时，在对应分类文件追加可重复执行的升级语句，或单独加一个一次性升级脚本。
- 本地库把 `--remote` 换成 `--local`。

---

## 六、本地开发

```bash
npm install                                  # 必须在仓库根：workspaces 软链 @codeseek/shared
npm run dev --workspace=backend              # http://localhost:8787
npm run dev --workspace=frontend             # http://localhost:3000
```

前端 Vite 已把 `/api` 代理到 `http://localhost:8787`。本地 D1 用 `--local` 执行第五节的脚本。

Windows 下 `wrangler dev` 报 EPERM（无法写 `%APPDATA%\xdg.config\.wrangler`）时，指定可写目录：

```powershell
$env:XDG_CONFIG_HOME="D:\tmp\xdg"
npx wrangler dev --persist-to .\tmp\wrangler-state
```

---

## 七、构建与部署（Workers Builds）

### 1. 面板配置

Cloudflare → Workers & Pages → `atlas` → Settings → Builds → Connect GitHub，填：

| 字段 | 值 |
|---|---|
| Repository / Branch | `<owner>/Atlas` / `main` |
| Root directory | `backend` |
| Build command | `cd .. && npm install && npm run typecheck --workspace=backend && npm run lint --workspace=backend && npm run build --workspace=frontend` |
| Deploy command | `npm run deploy` |
| Watch paths | `backend/**`、`frontend/**`、`packages/**`、`package-lock.json` |
| Environment variables | 不填（所有配置在 `[vars]` 与 secrets 里） |

要点：

- `npm install` 必须在仓库根执行，只在 `frontend/` 下安装会解析不到 `@codeseek/shared`
- 构建命令包含 typecheck 与 lint，这是部署前的质量闸门
- Worker 部署时把 `../frontend/dist` 一起上传（`[assets]`），**必须先构建前端**，否则上传的是旧产物

### 2. 手动部署（等价，用于排查）

```bash
npm install
npm run typecheck --workspace=backend
npm run lint --workspace=backend
npm run build --workspace=frontend
npm run deploy --workspace=backend
```

### 3. 关键配置（`backend/wrangler.toml`）

```toml
name = "atlas"
main = "src/index.ts"
compatibility_date = "2025-04-01"     # 不能低于此值：导航请求需由静态资源层处理
compatibility_flags = ["nodejs_compat"]
preview_urls = false

[assets]
directory = "../frontend/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api", "/api/*"]   # 必须同时写裸路径与通配符
```

---

## 八、域名

1. Worker → Settings → Domains & Routes → Add → Custom domain → `<your-domain>`（如 `atlas.wort.uk`）
2. 等证书状态变 Active（通常 1–5 分钟）
3. 前端与 API 都走该域名：页面 `https://<your-domain>/`，接口 `https://<your-domain>/api/*`
4. 同步更新：
   - `[vars]` 的 `SITE_URL`、`FRONTEND_URL`、`BACKEND_URL`
   - GitHub OAuth App → Authorization callback URL：`https://<your-domain>/api/auth/github/callback`
   - Google OAuth Client → 重定向 URI：`https://<your-domain>/api/auth/google/callback`
   - `backend/src/constants.ts` 的 `ALLOWED_ORIGINS`
   - 仓库 Secrets（见第十一节）

> 不要给 API 单独开子域：前端是同源相对路径，多一个域名只会增加证书、Cookie、CORS 的维护面。

---

## 九、Cron Triggers

`backend/wrangler.toml` 已配置 3 条触发器，`backend/src/index.ts` 的 `scheduled` 按 `event.cron` 精确匹配分发；传入其他字符串不执行任何任务。

| Cron | 频率 | 任务 |
|---|---|---|
| `5 * * * *` | 每小时 | 清理过期会话、7 天前验证码、分批数据清理（rate_limits / post_views / data_records）、补全待处理 JAV 记录、推荐标签词典同步（7 天到期判断） |
| `*/30 * * * *` | 每 30 分钟 | 关注对象新作检测（≤20 个，5 个一批、批间 10 秒）+ 邮件摘要合并发送（≤15 封）；两者串行执行 |
| `* * * * *` | 每分钟 | 管理看板手动触发的 JAV 详情补全批次 |

小时任务固定在 `:05`，避开 `*/30` 的整半点。各任务各自持有 `cron_locks` 租约（`database/06_system.sql`），上一轮未跑完时本轮跳过。

**手动触发**

```bash
cd backend
npx wrangler dev --test-scheduled
curl "http://127.0.0.1:8787/__scheduled?cron=5+*+*+*+*"
```

生产环境用管理员接口（只跑词典同步）：

```bash
curl -X POST "https://<your-domain>/api/admin/data-storage/genre-dict/sync" \
  -H "Authorization: Bearer <管理员 JWT>"
```

> 不要用 `wrangler dev --remote --test-scheduled`：它会连**生产 D1** 并执行该 cron 下的全部任务。
> 手动触发 `5 * * * *` 组无法只跑词典同步，会连带执行会话/验证码/数据清理。

---

## 十、验收清单

部署后逐项确认：

- [ ] `curl -s https://<your-domain>/api/health` → 200，`application/json`，`version` 为 `APP_VERSION`
- [ ] `curl -s https://<your-domain>/api` → 200 JSON（API 信息，不是 HTML）
- [ ] `curl -sI https://<your-domain>/` → 200 `text/html`
- [ ] `curl -sI https://<your-domain>/search?q=test` → 200 `text/html`（SPA 深链）
- [ ] `curl -sI https://<your-domain>/sw.js` → `Cache-Control: no-cache, no-store, must-revalidate`
- [ ] `/assets/*` 响应头含 `public, max-age=31536000, immutable`
- [ ] `/api/system/public-config` 返回站点名与注册开关
- [ ] 注册 → 邮箱验证码 → 登录成功（验证 `RESEND_API_KEY`、`DEFAULT_FROM_EMAIL`、`JWT_SECRET`）
- [ ] GitHub / Google 登录成功（验证 OAuth 回调地址与 client secret）
- [ ] `/help` 三语文案正常
- [ ] 通知中心能收到关注 / 社区 / 公告通知
- [ ] 通知偏好页能发送测试邮件
- [ ] 社区帖子 24 小时内重复浏览不增加 `view_count`
- [ ] 浏览器 Network 面板无跨域 API 请求（全部为同源 `/api/...`）
- [ ] 面板 Triggers 显示 3 条 cron；`wrangler tail` 能看到定时任务执行日志

---

## 十一、仓库侧配套

### 1. GitHub Actions 应急部署（保留，仅手动）

`.github/workflows/backend-deploy.yml` 只有 `workflow_dispatch`，流程与 Workers Builds 等价：安装依赖 → typecheck → lint → 构建前端 → `wrangler deploy`。
保留原因：Builds 额度耗尽或 GitHub 集成异常时，这是唯一还能发版的路径；它不随 push 触发，不存在与 Builds 双写。

| 仓库 Secret | 值 | 缺了会怎样 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | API Token，权限 `Workers Scripts:Edit` + `Account Settings:Read` | 该 workflow 无法部署 |
| `CLOUDFLARE_ACCOUNT_ID` | 账户 ID（Workers 面板右侧，或 `npx wrangler whoami`） | 同上 |

两个必须成对保留，只留一个等于通道废掉。

### 2. 榜单抓取 workflow

`.github/workflows/javdb-ranking-daily.yml`（每天 18:00 UTC）需要四个仓库 Secret：

| 仓库 Secret | 值 | 缺了会怎样 |
|---|---|---|
| `ATLAS_RANKING_IMPORT_URL` | `https://atlas.wort.uk/api/internal/rankings/import` | 判空后 `exit 1`，导入步骤直接失败 |
| `RANKINGS_IMPORT_SECRET` | 与 Worker 上同名 secret 完全一致 | 接口返回 401 `榜单导入密钥不匹配` |
| `JAVDB_USERNAME` | JavDB 账号用户名 | 抓取步骤报 `Missing JAVDB_USERNAME or JAVDB_PASSWORD` |
| `JAVDB_PASSWORD` | JavDB 账号密码 | 同上；登录失败时会输出 JavDB 返回的错误码（如账号不存在、密码错误） |

- 不要填已退役的 `atlasapi.wort.uk`；也不要填 `*.workers.dev`，除非自定义域名前面被 WAF 拦。
- 若导入返回 403，说明 WAF / Bot Fight 拦了 Actions 出口 IP，需要给 `/api/internal/rankings/import` 加 WAF 跳过规则。
- `javdb-ranking-probe.yml` 不读这两个 secret。

TOP250 使用 `.github/workflows/javdb-top250-sync.yml`（每天 19:30 UTC，东八区次日 03:30）：
- 每月 1–4 日分别同步「全部 / 有码 / 无码 / FC2」总榜（欧美暂不考虑）；
- 奇数月 5–23 日分别同步 2008–2026 年度榜（两个月一轮）；
- 每个榜单 13 页，按 4 页一批、批间 20 秒执行；手动运行可指定 `list` / `year` / `pages`；
- 需要先执行 `database/14_jav_ranking_archive.sql`，榜单归档与 TOP250 读取依赖新表；
- 需要补历史快照时重新执行 `database/14_jav_ranking_archive.sql`：按作品最后出现日期回填今天以前的周榜/月榜历史，可重复执行。

### 3. 即将发售同步 workflow

`.github/workflows/follow-upcoming-sync.yml` 由 Worker 每 30 分钟通过 GitHub API 主动触发（原生 `schedule` 仅兜底，GitHub 会延迟或跳过）。

- Worker `[vars]` 已配置 `GITHUB_REPOSITORY` / `GITHUB_DISPATCH_REF`；
- 需要在 Worker 上执行 `npx wrangler secret put GITHUB_DISPATCH_TOKEN`，PAT 权限为 `actions:write`；
- 未配置该 secret 时 Worker 静默跳过，仅依赖 GitHub 原生 schedule。

workflow 复用上面的四个 Secret：

- `ATLAS_RANKING_IMPORT_URL` 只用于推导站点 origin，脚本会请求 `/api/internal/follows/upcoming/targets` 与 `/api/internal/follows/upcoming/import`。
- 两处内部接口与榜单导入共用 `RANKINGS_IMPORT_SECRET` 和 `x-rankings-secret` 请求头。
- 单轮默认最多 20 个关注对象，按 5 个一批执行，批间等待 10 秒；批内请求间隔至少 3 秒并带随机抖动。
- 单个对象最快 30 分钟刷新一次，失败按指数退避；目标按最后同步时间轮转，关注较多时自动分散到后续轮次。
- 手动运行时可传 `limit` 输入（1-20）验证链路，不会修改任何本地文件。
- 若这两个接口返回 403，说明 WAF / Bot Fight 拦了 Actions 出口 IP，需要给 `/api/internal/follows/*` 也加与榜单导入相同的 WAF 跳过规则。

---

## 十二、回滚

```bash
# 面板：Workers & Projects → atlas → Deployments → 选中上一版本 → Rollback
# 或本地
git checkout <上一个发布提交>
npm install
npm run build --workspace=frontend
npm run deploy --workspace=backend
```

前端与 API 是同一个版本，回滚是成对的：不能只回滚前端。数据库不在回滚范围内——迁移脚本按"先加后用后删"执行（expand-contract），保证旧代码仍能跑在新 schema 上。

---

## 十三、常见故障

### Q1: 部署报 `Invalid _redirects configuration: Infinite loop detected`（code 100324）

`frontend/public/_redirects` 里不能有 `/* /index.html 200`：Worker 静态资源上传时会把 `/index.html` 归一化回 `/`，与规则自身形成死循环。
SPA 回退**只能**由 `wrangler.toml` 的 `not_found_handling = "single-page-application"` 提供。
注意 `wrangler dev` 与 `deploy --dry-run` 都**不会**做这项校验，本地通过不代表能部署。

### Q2: 部署成功但 `/` 还是旧内容

`frontend/dist` 在构建阶段生成且已 gitignore。若部署步骤早于前端构建，上传的是旧产物。确认 Builds 日志里前端构建（`tsc --noEmit` + `vite build`）出现在 `Read N files from the assets directory` 之前。

### Q3: 深链刷新 404 或返回 JSON

- `compatibility_date` 低于 `2025-04-01` → 导航请求进 Worker，深链拿不到静态资源
- `run_worker_first` 只写了 `/api/*` 没写 `/api` → 裸 `/api` 会返回 `index.html`

### Q4: `/api` 返回 401 或 JSON 结构不对

`/api` 集群路由由 `backend/src/index.ts` 注册；确认没有把 `/api` 误放进静态资源白名单，也没有被中间件提前拦截。用 `wrangler tail` 看实际命中的路由。

### Q5: 登录成功但立刻掉线 / 退订链接 404

`JWT_SECRET` 缺失或不一致（回滚、换环境后常见）。`/api/health` 不会因此报错，必须实际登录一次才能发现。

### Q6: 邮件全部发不出

按顺序查：`email_priority_*` 与 `email_daily_limit_*` 配置 → 对应服务商凭据（Cloudflare 绑定 / `RESEND_API_KEY` / `MAILTRAP_API_TOKEN` / `BREVO_API_KEY`）→ 各服务商是否已按独立子域名完成验证（Cloudflare 用 `DEFAULT_FROM_EMAIL`，其它见第 4 节发件地址表）→ `email_send_logs.status` / `error_message` / `provider` → `email_queue` 是否堆在 `failed` → 用户邮箱是否已验证、通知偏好是否开启。

### Q7: 页面能打开但所有接口失败

检查 Network 面板：同源部署下接口应为相对路径 `/api/...`。若仍看到绝对域名，说明构建产物是旧版本（前端 `API_BASE_URL` 已固定为 `/api`）。

### Q8: 数据库脚本执行到一半失败

所有脚本幂等（`20` 除外），修复报错后从失败的那个继续即可。常见原因：`database_name` 不是 `codeseek`、跳过前置脚本（如先 `14` 后 `03`）、使用了旧版 `08`/`12`。

### Q9: cron 不执行

面板 Triggers 是否为空（未部署成功时不会注册）；`25_cron_locks` 是否缺失（任务会因取不到租约而跳过）；`* * * * *` 与免费计划上限（5 个）是否冲突。
