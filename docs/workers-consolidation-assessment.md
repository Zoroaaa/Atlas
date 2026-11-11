# 前后端合并为单一 Worker（Workers Builds）改造评估 · v2

> v2 修订（2026-11-11）：以《前后端分离 → 单 Worker + Workers Builds 实施手册》（下称"手册"）为参照系，逐条做取舍。
> **实施状态（2026-11-11）**：路线 A 已合入 `main`（`88190aa`），由 Workers Builds 直连 GitHub 部署。
> 首次部署因 `_redirects` 死循环校验失败（code 100324），修复提交 `4f27def` 后部署成功。
> 仓库侧已不再依赖 Pages；`atlas.wort.uk` 的域名归属按第 10.4 节清单由用户切换。
> 判定标记：**[采用]** 直接采用手册做法 / **[改写]** 原则可用但落点必须按本项目改 / **[不适用]** 本项目无对应前提或与既定规则冲突。
> v1 中的现状核实、收益与代价分析保留；工作量按修订结果**上调**（见第 7 节）。

## 0. 结论先行

- **做**，但只做"合并部署单元 + Workers Builds"；路线 B（同源 `/api`）仍作为第二阶段可选项。
- 手册有两处**不能照抄**：
  1. **Deploy Hook 闸门**与本项目"推送即部署、SQL 用户手动执行、CI 不做迁移"的事实冲突 → 明确**不采用**，改为 schema 兼容纪律（第 3 节给判断与理由）。
  2. **"Workers assets 不支持 `_headers` / `_redirects`"是旧认知，但"支持"不等于"接受任意规则"** → `_headers` 在 Workers 静态资源上实测生效并保留；`_redirects` 的 `/* /index.html 200` 被部署校验判定为死循环（code 100324），必须删除，SPA 回退只由 `not_found_handling` 提供（第 2.2、11 节）。
- 工作量校正：**路线 A 4.5–5.5 人日**（原估 2.5–3.5，上调原因是 wrangler 4 升级、`_headers` 实测、构建闸门迁移、SW 切换检查）；**路线 B 追加 2.5–3.5 人日**；合计 **7–9 人日**。
- 本项目**没有**的复杂度：WebDAV、Durable Object、Vectorize/Queue、Pages Functions、`_routes.json`、库内加密数据、`VITE_*` 构建变量。手册里围绕这些的坑全部跳过。

---

## 1. 现状核实（Step 0 的本项目答案）

| 项 | 事实 | 与手册假设的差异 |
|---|---|---|
| 前端产物 | `frontend/dist`，纯静态（Vite + React SPA），`build` 脚本自带 `tsc --noEmit` | 一致（纯静态） |
| 后端顶级路径前缀 | **只有 `/api`**（全部路由挂 `/api/*`，含裸 `/api` → `systemRoutes`）+ 一条 `GET /` 返回 JSON | 手册示例的 `/dav`、`/agents`、WebSocket、`/health` **本项目都不存在** |
| Pages 专用文件 | 只有 `_headers`、`_redirects`；**无** `_routes.json`、**无** `functions/`、无 `404.html` | 比手册假设简单 |
| 绑定 | D1，binding `DB`，`database_id` 已硬编码入库；无 KV/R2/DO/Queue/Vectorize | 手册的"多绑定迁移"不适用 |
| cron | 3 条（`5 * * * *`、`*/30 * * * *`、`* * * * *`），免费计划上限 5 | 不受 assets 影响 |
| secrets | 7 个：`JWT_SECRET`、`RESEND_API_KEY`、GitHub/Google 的 client id+secret、`RANKINGS_IMPORT_SECRET` | 与手册"三处凭据分层"对应 |
| `JWT_SECRET` 用途 | 仅签发/校验 JWT 与邮件退订 token（`middleware/auth.ts:81`、`email-unsubscribe.ts` 等）；**没有任何库内数据加密**（全仓无 AES 存储加解密） | 手册 Step 0.5 的"换密钥导致数据不可读"**不适用**；但轮换仍会使全部登录态与退订链接失效 |
| 前端 API 地址 | **当时**硬编码 `https://atlasapi.wort.uk/api`，两份：`frontend/src/constants.ts`、`frontend/src/services/api/client.ts` | 手册假设的 `VITE_API_URL` 本项目不存在；**已于路线 B 改为同源 `/api`，两处硬编码合并为一处常量** |
| Service Worker | 版本号由构建时间戳注入（`vite.config.ts:9-21`）；`/api/*` 已有缓存分支，但因跨域被 `sw.js:189` 直接 return，**当前是死代码** | 手册的"旧 SW 看到旧页面"风险等级不同（域名不变，见 2.4） |
| 部署现状 | 后端：Actions `push main + backend/**` → 根目录 `npm install` → typecheck → lint → `wrangler deploy`（wrangler 4）；前端：Pages 直连 Git | 改造后两条流水线必须收敛成一条 |
| wrangler 版本 | `backend/package.json` devDep `^3.78.0`；`run_worker_first` 数组需 **4.20+** | 必须先升级（手册未提，但本项目必做） |
| wrangler 配置 | 入库（`backend/wrangler.toml`），id 硬编码，`preview_urls = false`，无 `[assets]` | 手册 Step 1 已满足 |

---

## 2. 手册 Step 0–12 逐条映射

| 手册步骤 | 判定 | 本项目落点 |
|---|---|---|
| Step 0 盘点现状 | **[采用]** | 见第 1 节表格；补充一项手册没列但本项目致命：`compatibility_date = 2025-01-01` |
| Step 1 配置入库 vs 构建期生成 | **[采用]** | 已是入库（`backend/wrangler.toml`），`database_id` 硬编码，无需生成脚本 |
| Step 2 加 `[assets]` + SPA 回退 | **[采用]** + 本项目参数 | `directory = "../frontend/dist"`；`run_worker_first = ["/api", "/api/*"]`（裸路径必列）；**同时升 `compatibility_date` 到 ≥ 2025-04-01** |
| Step 3 根路径冲突 | **[采用]** | `index.ts:82` 的 `GET /` JSON 迁到 `/api`（或 `/api/version`）。本项目无 `/health`，不要照抄示例 |
| Step 4 清理 Pages 专用文件 | **[改写]**（手册结论已过时） | 见 2.2：保留 `_headers`、删除 `_redirects` 的全量回退；无 `_routes.json`/`functions/` 可删 |
| Step 5 同源改造 + 保留 CORS | **[改写]** | 本项目无 `VITE_API_URL`；硬编码在 2 个文件（`constants.ts`、`client.ts`）。CORS 保留（`index.ts:45-71` 已含 atlas/localhost 白名单，本地 dev 依赖） |
| Step 6 Builds 根目录/命令 | **[改写]** | root=`backend`；`cd ..` 只有一层到仓库根。见 2.3 |
| Step 7 用监视路径挡 push | **[不适用]** | 与"推送即部署"规则冲突，明确不采用，见第 3 节；watch paths 正常配置即可 |
| Step 8 Deploy Hook 闸门 | **[不适用]** | CI 无迁移步骤，Hook 保护不了任何东西，见第 3 节 |
| Step 9 secrets 三处分层 | **[采用]** | Worker 名 2026-11-11 由 `codeseek-backend` 改为 `atlas`（配置与面板同步），7 个 secret 原样保留；Builds 面板**不配** API 地址类变量；Actions secrets 保留作应急手动部署 |
| Step 10 域名切换 | **[采用]** + **[改写]** | 先 workers.dev 验证 → 解绑 Pages → 绑 Worker；原计划 `atlasapi` 保留双绑，**实际改为同源 `/api` 并删除 `atlasapi`**；SW 处理见 2.4 |
| Step 11 回滚 | **[采用]** + 本项目约束 | `wrangler rollback` 是前后端成对回退；架构回滚=域名切回 Pages（保留 1–2 周）；数据库靠兼容纪律 |
| Step 12 收尾 | **[采用]** | 断开 Pages Git、收窄 `backend-deploy.yml`、更新 `docs/deploy.md`（并修正其"Pages 反代 /api"的错误描述） |

### 2.1 Step 2：本项目的 `[assets]` 配置（可直接用）

```toml
name = "atlas"                     # Worker 名（2026-11-11 由 codeseek-backend 改名）
main = "src/index.ts"
compatibility_date = "2025-04-01"  # 从 2025-01-01 升上来：低于此版本导航请求会进 Worker
compatibility_flags = ["nodejs_compat"]

# ... [vars] / [[d1_databases]] / [observability] / [triggers] 原样保留 ...

[assets]
directory = "../frontend/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api", "/api/*"]
```

要点：

- `directory` 相对 **wrangler.toml 所在目录**（即 `backend/`），不是仓库根。
- 裸 `/api` 必须单列：本项目 `app.route('/api', systemRoutes)` 存在裸路径，只写 `/api/*` 会让 `GET /api` 落进 SPA 回退返回 HTML。
- 不要把前端导航路径放进 `run_worker_first`：免费计划 10 万请求/日，命中路径超限直接 429 且不回退静态资源。
- `compatibility_date` 是**手册没提、本项目必踩**的坑：当前 2025-01-01 下，直接访问 `/search?q=x` 这类深链会进 Worker 拿到 JSON 404。

### 2.2 Step 4：Pages 文件的去留（手册结论过时，但本项目也踩了一次）

手册写"Workers assets 不支持声明式响应头，`_headers`/`_redirects` 会静默失效"。**官方文档已明确支持** Workers Static Assets 的 `_headers` 与 `_redirects`，本项目实测 `_headers` 生效。但 `_redirects` 的全量 SPA 回退规则会被部署校验拒绝，最终处理如下：

| 文件 | 处理 | 理由 |
|---|---|---|
| `_headers` | **保留**（实测生效）；已删除随 `/api` 迁移而失效的 `/api/*` 规则 | `/sw.js` 的 `no-store` 是 SW 更新机制的前提；`/assets/*` immutable 是首屏性能前提。`/api/*` 由 Worker 处理，不经静态资源层，规则已无作用 |
| `_redirects` | **已删除** `/* /index.html 200`，保留 `/brand.html` 规则 | 该规则在真实部署时被判定为死循环（`/index.html` 归一化回 `/` 后再次命中，code 100324），`wrangler dev` 不会报这个错。SPA 回退改由 `not_found_handling` 独家提供 |
| `_routes.json` / `functions/` | 不存在，无需处理 | 手册对应项不适用 |

### 2.3 Step 6：本项目的 monorepo 落点

仓库结构：根 `package.json`（workspaces: `packages/*`、`backend`、`frontend`）、`frontend/`、`backend/`（wrangler.toml 在此）、`packages/shared/`（被前端以 URL 别名直接指源码）。

| 项 | 本项目取值 |
|---|---|
| Builds 根目录 | `backend`（= wrangler 配置所在目录，满足手册"root=配置目录"与面板 name 校验） |
| 构建命令 | `cd .. && npm install && npm run typecheck --workspace=backend && npm run lint --workspace=backend && npm run build --workspace=frontend` |
| 部署命令 | `npm run deploy`（`backend` 的 script，用 devDep 里升级后的 wrangler 4） |
| watch paths | Include：`backend/**`、`frontend/**`、`packages/**`、`package-lock.json` |

关键点：

- `cd ..` 从 `backend` 上一层就是**仓库根**（只有一层），手册里 `apps/api` 需要 `cd ../..` 的层级换算不适用。
- `npm install` 必须在**仓库根**跑：`@codeseek/shared` 靠 workspace 软链，只在 `frontend/` 下装会解析不到（这也是现有 CI 的做法）。
- 前端构建命令自带 `tsc --noEmit`，后端 typecheck/lint 显式加进构建命令，**保住手册 Step 8 里那道质量闸门的等价物**（部署前必须绿）。
- 不建议 `root=/` + `npx wrangler deploy -c backend/wrangler.toml`：虽能跑通，但违背"root=配置目录"，且面板 Worker 名校验读的就是根目录配置，容易出 3.6 的"部署到另一个 Worker"。

### 2.4 Step 10 + SW：本项目的切换时机

本项目的 SW 事实：

- 缓存版本 `CACHE_VERSION` 由 `vite.config.ts` 的 `injectSwVersion` 用**构建时间戳**写入，每次构建必然变化 → 天然 cache-bust，无需手工改版本号。
- `install` 里**不** `skipWaiting`，新版保持 waiting，由页面提示用户更新（`useServiceWorkerUpdate.ts`）。
- `sw.js:189` 对跨域请求直接 return，所以当前 `/api/*` 的缓存分支是死代码；`/api/config/`、`/api/admin/` 在 bypass 列表里。
- 域名不变（`atlas.wort.uk` 仍由本 Worker 服务）→ **SW 作用域不变，不需要 kill switch**。这是与手册 3.10 的关键差异，别照抄"注销 SW"那一步。

切换时必须做的 SW 相关动作：

1. 切换**前**在预览域验证 `/sw.js` 响应的 `Cache-Control` 含 `no-store`（`_headers` 是否在新栈生效）。不生效则浏览器会按默认策略缓存 SW，用户最长 24 小时看不到更新。
2. 切换**后**用无痕窗口 + Application → Service Workers 确认新 SW 装的是新版本号（`atlas-static-v<时间戳>`），并确认旧缓存（`atlas-*`/`codeseek-*`）在 activate 时被清掉。
3. 若走路线 B（同源 `/api`）：`sw.js:193-207` 从死代码变活，必须复核 `API_BYPASS_PREFIXES`（目前只有 `/api/config/`、`/api/admin/`），把用户态 GET 接口（`/api/user/`、`/api/notifications`、`/api/follows`、`/api/community/`）加入 bypass，否则会缓存登录态数据并跨账号复用。

### 2.5 本地实测结论（2026-11-11，wrangler 4.160 + wrangler dev）

以下结论已用 `wrangler dev` 实际打请求验证，不再是推断：

| 请求 | 结果 | 说明 |
|---|---|---|
| `GET /api/health` | 200 `application/json` | `run_worker_first` 生效，API 未被静态资源拦截 |
| `GET /api` | 200 `application/json`（`{"name":"CodeSeek API",...}`） | 裸路径已迁移生效；只写 `/api/*` 会漏掉它 |
| `GET /search?q=test` | 200 `text/html` | SPA 回退生效（日志：`Sec-Fetch-Mode: navigate` → `not_found_handling`） |
| `GET /` | 200 `text/html` | 根路径已让位给前端 |
| `GET /brand.html` | 307 → `/brand` → 200 | `_redirects` 规则被解析（日志：`Parsed 1 valid redirect rule`） |
| `GET /sw.js` | 200，`Cache-Control: no-store, must-revalidate, no-cache` | **`_headers` 在 Workers 静态资源上确实生效**（手册"不支持"的结论已过时） |
| `GET /assets/index-*.js` | 200，`public, max-age=31536000, immutable` | 同上（17 条 header 规则全部解析） |
| `wrangler deploy --dry-run` | 成功 | `Read 39 files from the assets directory`；绑定含 `env.DB (D1)` + `env.ASSETS` |

结论修正（2026-11-11 真实部署后）：`wrangler dev` 只证明"规则能被解析"，不证明"部署能通过"。真实部署里 `_redirects` 的全量回退直接被校验拒绝，所以"可以共存、切域后再删"的判断**作废**——这条规则从一开始就不该存在于 Worker 的静态资源目录。`_headers` 的结论（生效）仍然成立。

Pages 侧的连带影响：该文件原本同时被 Pages 读取，删除规则后 Pages 重建产物不再有全量回退，`atlas.wort.uk` 的深链在域名切到 Worker 之前会返回 404。这是本次改动唯一的线上风险点，处理顺序见第 10.4 节。

---

## 3. 冲突裁决：不采用 Deploy Hook 闸门，保留"推送即部署"

**手册做法**：watch paths 设 `__none__` 挡掉 push 自动部署，只留 Deploy Hook；Actions 里"先迁移、后 Hook"。

**本项目事实**：

- CI 里**没有**迁移步骤，SQL 由用户手动在 D1 执行（既定规则：不代跑线上脚本）。
- 后端部署的既定规则是"改完就推、推送即部署"。
- SQL 脚本与代码通常同一批提交，用户可能晚于部署执行脚本。

**判断：不采用 Hook 闸门。** 理由：

1. Hook 的唯一价值是"迁移成功后才上线"的顺序保证。本项目 CI 不迁移，Hook 前面没有可保护的对象，它只会把"push → 部署"变成"push → 手动触发 → 部署"，新增一个失败点（Hook 失败 = 代码不更新，且与推送脱节）。
2. 一旦存在两条部署路径（push 自动 + Hook），谁先完成谁生效，反而制造手册 3.5 说的版本错位。
3. 与用户既定工作方式直接冲突，且没有换来任何正确性。

**替代纪律（必须写进团队约定，靠它替代闸门）**：

- **代码永远向后兼容当前线上 schema**：新增列用可空/带默认；读取时容忍列不存在（或该功能在脚本执行前保持关闭）。
- **破坏性变更拆成三步**：本次发布"加新结构 + 双读"，下一次发布"切读新结构"，再下一次（至少隔一个发布周期）"删旧结构"。删列/改类型绝不与使用方的代码同批上线。
- **脚本编号续 24**（现有最大为 23），一个主题一个脚本，与代码同 PR 提交，但**执行顺序**是：兼容代码上线 → 用户执行脚本 → 启用依赖新结构的功能。
- **回滚只回代码，不回 schema**：因此任何一次发布都必须保证"上一版代码能在当前 schema 上跑"。做不到就说明批量太大，拆小。
- 上线后若发现必须回滚，先 `wrangler rollback` 回上一版，**不要**补一个反向 SQL 脚本（会引入第三种状态）。

---

## 4. 本项目执行步骤（Step 0–12 改写版）

每步含"验证方式"，全部命令按本项目路径给出。

### Step 0 盘点（0.5d）
第 1 节表格即产出。额外确认两项：`workers.dev` 子域是否启用（`preview_urls = false` 只关版本预览，不关 workers.dev）；当前活跃部署版本 id。**验证**：`npx wrangler deployments list`、Dashboard → Worker → Settings → Domains 截图留档。

### Step 1 wrangler 升级与配置（0.5–1d）
`wrangler ^3.78` → `^4.20`，`npm install` 后跑 `npm run typecheck --workspace=backend`。加第 2.1 节的 `[assets]`、升 `compatibility_date`。**验证**：先 `npm run build --workspace=frontend`，再 `npx wrangler deploy --dry-run`（在 `backend/`），要求输出含 `Read N files from the assets directory` 且 D1 绑定存在。

### Step 2 根路径让位（0.25d）
`index.ts:82` 的 `GET /` 改为 `GET /api`（或 `/api/version`）。**验证**：`curl -s -o /dev/null -w "%{http_code} %{content_type}\n"` 分别打 `/`、`/api`、`/api/health`（若没有 health 就换实际存在的 `/api/search-sources`）。

### Step 3 `_redirects` / `_headers`（0.25d，实际拆成两次）
- 合并时：`_redirects` 的 `/* /index.html 200` **必须删除**——真实部署校验会判死循环（100324），`wrangler dev` 不报错，本地验证不能作为放行依据。
- 切域后：删除 `_headers` 里已失效的 `/api/*` 规则（已完成）。
- **验证**：以真实部署日志 + 线上 curl 为准：`/sw.js` 必须 `no-store`；`/assets/*` 必须 `immutable`；深链必须 200 `text/html`；`/api` 裸路径必须 JSON。

### Step 4 本地全链路验收（0.5d）
`wrangler dev` + 构建产物一起跑：深链、`/api` 裸路径、`/brand.html`、`/assets/*`、`/sw.js` 头。**验证**：本地无痕窗口装 SW，确认版本号与提示更新流程正常。

### Step 5 接 Workers Builds（0.5d）
`backend` 的 `wrangler deploy` 已在 Step 1 验证，这里只配面板：根目录、构建命令、部署命令、watch paths（见 2.3）。**验证**：推到非 main 分支触发预览构建；确认 build history 的 Commit 与目标一致，且构建日志里能看到 typecheck 通过（说明闸门在）。

### Step 6 收窄 Actions（0.25d）
`backend-deploy.yml` 去掉 `push` 触发，保留 `workflow_dispatch` 作应急手动部署。**验证**：push 一次 `backend/**` 改动，确认只有 Builds 一条流水线在跑。

### Step 7 预览域验收（0.5d）
在 workers.dev 上跑第 4 节的同一组 curl，加上 OAuth 登录、搜索、上传、榜单导入。**验证**：无痕窗口 Network 面板确认没有指向已删除 `atlasapi.wort.uk` 的请求（同源化后必须为零）。

### Step 8 域名切换（0.5d）
Pages 解绑 `atlas.wort.uk` → Worker 绑定；`atlasapi.wort.uk` 已删除（同源后不再需要）。**验证**：`curl -I https://atlas.wort.uk/` 为 `text/html`，`/api/...` 为 `application/json`；无痕窗口确认 SW 版本号更新；`wrangler tail` 观察首屏、登录、搜索无 5xx。

### Step 9 观察期（1d，散布在 1–2 天）
OAuth 登录（GitHub/Google 回调已随 `BACKEND_URL` 改为 `https://atlas.wort.uk/api/auth/*/callback`，**OAuth 应用侧必须同步改回调地址**）、注册验证码、搜索、收藏、上传、PWA 安装/更新、cron 的三个任务、榜单导入、D1 读写。**验证**：`wrangler deployments status` 的 Active 时间晚于切换时间。

### Step 10 回滚演练（0.25d）
在低峰期做一次：`wrangler rollback` 回上一版本 → 确认站点可用 → 再 rollback 回来。**验证**：演练记录写进 `docs/deploy.md`。

### Step 11 收尾（0.5d）
断开 Pages 的 Git 连接（项目保留 1–2 周后再删）；更新 `docs/deploy.md`（含修正"Pages 反代 /api"的错误描述、补新部署/回滚章节、注明 7 个 secret 首次注入步骤）；`grep -rn "atlasapi\|pages.dev"` 确认无残留构建引用。

### Step 12（可选）路线 B 同源化（2.5–3.5d）
改 `constants.ts`（合并为单一 `API_BASE_URL = '/api'`）→ `client.ts` 复用 `getApiBaseUrl()`；`client.test.ts` 断言同步；SW 改为"只缓存白名单公共接口、其余 `/api/*` 直连"；CORS 保留；验收（登录、图片代理、分享链接、PWA 离线页）。`BACKEND_URL` **已改**为 `https://atlas.wort.uk`，OAuth 应用需同步改回调地址。

---

## 5. 坑清单映射（手册 3.1–3.16 + 本项目新增）

| 手册条目 | 判定 | 本项目说明 |
|---|---|---|
| 3.1 `cd ..` 层级算错 | **[改写]** | root=`backend`，仓库根是其上一层（`cd ..` 一层），不是 `../..` |
| 3.2 生成脚本被删后仍被引用 | **[不适用]** | 无生成脚本，配置入库 |
| 3.3 `wrangler.toml` 在 gitignore | **[不适用]** | 已入库且在版本控制中 |
| 3.4 Actions secrets 当 Builds 变量 | **[采用]** | 本项目前端不需要任何构建期变量；Builds 面板不要配 API 地址 |
| 3.5 监视路径 `*` 导致双部署 | **[改写]** | 不挡 push；改为"只保留 Builds 一条部署路径"，Actions 去 push 触发 |
| 3.6 Dashboard Worker 名与配置不一致 | **[采用]** | 面板与 `wrangler.toml` 的 `name` 必须一致。改名本身安全（域名/cron/secrets/D1 绑定挂在服务上会跟随），风险在于两者不一致：wrangler 按配置的 `name` 定位脚本，可能"部署成功但流量没变"，或凭空多出一个 Worker |
| 3.7 改名撞 DO / 加密密钥 | **[不适用]** | 无 DO、无库内加密；但"不要改名/不要轮换 JWT_SECRET"仍成立（登录态与退订链接会失效） |
| 3.8 删 secret 注入导致新环境起不来 | **[采用]** | 7 个 secret 首次注入写进文档；日常部署不执行 `secret put` |
| 3.9 Pages 仍连 GitHub | **[采用]** | 切换后先断开 Git 自动部署，观察期结束再删项目 |
| 3.10 SW 缓存导致旧页面 | **[改写]** | 域名不变 → 无需 kill switch；改为"验证 `/sw.js` 的 `no-store` 生效 + 确认版本号变化" |
| 3.11 `/api` 裸路径被 SPA 吃掉 | **[采用]** | 本项目确有裸 `/api`（`systemRoutes`），必须与 `/api/*` 同时列 |
| 3.12 `VITE_API_URL` 残留 | **[改写]** | 无该变量；等价风险是 `constants.ts` 与 `client.ts` 两处硬编码，两处都要改，且构建后 `grep` 产物 |
| 3.13 同源后删掉 CORS | **[采用]** | 保留 `index.ts:45-71`，本地 dev 与脚本入口依赖 |
| 3.14 TOML 表归属写错 | **[采用]** | `[assets]` 放文件后部，顶层键前置；用 `--dry-run` 看绑定表 |
| 3.15 dry-run 因 dist 不存在先失败 | **[采用]** | 先构建前端再 dry-run，写成固定脚本 |
| 3.16 空提交不触发 workflow | **[采用]** | Builds 的 watch paths 同理，改真实文件验证 |
| **新增 3.17** `compatibility_date` 过低 | 必改 | 2025-01-01 下导航请求会进 Worker，深链返回 JSON 404 |
| **新增 3.18** 同源后 SW 开始缓存 `/api` | 路线 B 必查 | `sw.js:189` 的跨域短路失效，用户态接口需加入 bypass |
| **新增 3.19** 构建命令丢掉 typecheck | 必改 | 质量闸门原来在 Actions，迁到 Builds 构建命令里，否则等于取消门禁 |
| **新增 3.20** `_headers` 是否生效未验证 | 必查 | 若 `no-store`/`immutable` 不生效，PWA 更新与首屏缓存都会退化，需改中间件 |

---

## 6. 合并后会变差的地方（与 v1 一致）

| 项 | 变化 | 缓解 |
|---|---|---|
| 独立回滚 | 前后端同一版本，前端小 bug 也只能整版本回退 | 版本成对发布是既定前提；灰度用 gradual deployments |
| 构建 | 免费 3,000 分钟/月、**并发 1**、单次 20 分钟（Pages 免费 500 次/月） | 本项目构建 1–2 分钟；预览与生产构建会排队 |
| 预览部署 | Pages 按 commit 零配置；Workers 需显式开 previews | 面板开启 `previews` + `preview_urls` |
| 失败域 | 构建/部署失败 = 前端与 API 同时不发布 | 保留 Pages 项目 1–2 周、保留双域名作冷回滚 |
| 配额语义 | `run_worker_first` 命中路径超 10 万/日直接 429，不回退静态 | 只把 `/api`、`/api/*` 放进去 |
| 不受影响 | D1、3 条 cron、7 个 secret（Worker 名不变）、静态请求免费不限量、`_headers`/`_redirects` 能力 | 迁移时不要改 Worker 名 |

---

## 7. 工作量校正

| 任务 | 量级 | 属性 | v1 估算 |
|---|---|---|---|
| wrangler 3.78 → 4.20 升级 + 回归 | 0.5–1d | 必做 | 0.5d（低估） |
| `[assets]` + `run_worker_first` + compat date | 0.5d | 必做 | 0.5d |
| 根路径 `GET /` 让位 | 0.25d | 必做 | 0.25d |
| `_redirects` 清理（原估"切域后"，实际在合并时完成） | 0.25d | 必做 | 0.25d |
| `_headers` 实测与调整（含 sw.js / assets 缓存头） | 0.5d | 必做 | 未单列（低估） |
| Workers Builds 接入（root=backend、构建命令、watch paths） | 0.5d | 必做 | 0.5d |
| Actions 收窄 + 构建闸门迁移 | 0.25d | 必做 | 0.25d |
| 本地 + 预览域验收 | 1d | 必做 | 1d |
| 域名切换 + SW 版本核对 | 0.5d | 必做 | 0.5d |
| 回滚演练 | 0.25d | 必做 | 未列（新增） |
| 文档收尾（deploy.md 修正） | 0.5d | 必做 | 0.5d |
| **路线 A 合计** | **4.5–5.5d** | | 原估 2.5–3.5d |
| 前端基址同源（2 文件 + 单测） | 0.5d | 路线 B | 0.5d |
| SW `/api` bypass 复核 | 0.5d | 路线 B | 0.5d |
| CORS/限流/WAF 复核 | 0.5d | 路线 B | 0.5d |
| OAuth 决策 | 0–0.5d | 路线 B | 0–0.5d |
| 路线 B 验收 | 1d | 路线 B | 1d |
| **路线 B 合计** | **2.5–3.5d** | | 原估 2–3d |
| Vite 插件本地开发（可选） | 1.5–2d | 可选 | 1.5–2d |
| Workers 预览环境（previews + preview_urls） | 0.5d | 可选（建议做） | 0.5d |
| **总计** | **A：4.5–5.5d；A+B：7–9d；含可选 8.5–11d** | | 原估 5–7d（偏低） |

上调归因：wrangler 大版本升级、`_headers` 实测、构建闸门迁移、SW 切换核对、回滚演练——这五项 v1 都漏了。

---

## 8. 建议

**值得做。** 收益是部署链路收敛（一条流水线、一次回滚、不再需要 Actions 的 CF 凭据）和平台归位（Pages 处于维护态）；性能收益要等路线 B 才兑现。

**顺序**：Step 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11，路线 B 单独排期。每步都有独立验收，任一步失败都不影响线上（域名切换是唯一有窗口的步骤）。

**回滚三级**：

1. 切换前失败：线上仍在 Pages，直接放弃本次部署。
2. 切换后：`atlas.wort.uk` 从 Worker 解绑 → 绑回 Pages（分钟级）。`atlasapi` 已删除，API 只有 `atlas.wort.uk/api` 一条路径，回滚窗口内 API 也随之回落（这是同源化的代价，换取的是不再有双域名漂移）。
3. 代码级：`wrangler rollback` 回上一版本（前后端成对回退）；schema 不在回滚范围内，靠第 3 节纪律保证兼容。

**不要做**：切换当天删 Pages 项目；先删 `backend-deploy.yml`（先收窄触发，保留手动入口）；把 SPA 导航放进 `run_worker_first`；改 Worker 名。

---

## 9. 需要触碰的文件清单

必做：

- `backend/wrangler.toml`（`[assets]`、compat date、`run_worker_first`）
- `backend/package.json`（wrangler `^4.20`）
- `backend/src/index.ts`（根路由 JSON 让位）
- `frontend/public/_redirects`（**已删**全量回退，仅留 `/brand.html`）、`frontend/public/_headers`（**已删** `/api/*`）
- `.github/workflows/backend-deploy.yml`（去 push 触发）
- Cloudflare 面板：Builds 配置、域名迁移、Pages 项目保留
- `docs/deploy.md`（架构、部署、回滚、secret 首次注入；修正"Pages 反代 /api"）

路线 B 追加：

- `frontend/src/constants.ts`、`frontend/src/services/api/client.ts`（两处硬编码）
- `frontend/src/services/api/__tests__/client.test.ts`
- `frontend/src/utils/imageProxy.ts`、`frontend/src/components/search/FavoritesPanel.tsx`、`frontend/src/components/search/FavoriteShareButton.tsx`、`frontend/src/pages/dashboard/FavoritesHistoryManager.tsx`
- `frontend/public/sw.js`（用户态接口 bypass）

不涉及：D1 结构与脚本执行、cron、7 个 secret 值、OAuth 应用回调、`javdb-ranking-*.yml`。

---

## 10. 路线 A 实施记录与人工操作清单（2026-11-11）

### 10.1 仓库侧改动（已合入 `main`）

| 文件 | 改动 | 验证结果 |
|---|---|---|
| `backend/wrangler.toml` | `compatibility_date` 2025-01-01 → 2025-04-01；新增 `[assets]`（`directory="../frontend/dist"`、`binding="ASSETS"`、`not_found_handling="single-page-application"`、`run_worker_first=["/api","/api/*"]`） | `deploy --dry-run` 通过：`Read 39 files`，绑定含 `env.DB` + `env.ASSETS`；线上 `/` 已返回 HTML |
| `backend/src/index.ts` | `GET /` 的 API 信息 JSON 迁到 `GET /api` | 线上 `/api` 200 JSON |
| `frontend/public/_redirects` | 删除 `/* /index.html 200`（真实部署校验判死循环），保留 `/brand.html` | 部署通过；深链由 `not_found_handling` 返回 HTML |
| `frontend/public/_headers` | 删除失效的 `/api/*` 规则，其余 16 条保留 | `/sw.js` no-store、`/assets/*` immutable 线上生效 |
| `backend/package.json`、`package-lock.json` | wrangler `^3.78` → `^4.160.0` | `wrangler --version` = 4.160.0 |
| `.github/workflows/backend-deploy.yml` | 移除 `push` 触发（只留 `workflow_dispatch` = 应急通道）；部署前新增前端构建步骤 | 与 Builds 不再双写 |
| `frontend/DEPLOY_TRIGGER.md` | **删除** | 该文件唯一作用是触发 Pages 重新部署，Pages 退役后无意义 |
| `README.md`、`README.zh-CN.md`、`docs/deploy.md`、`frontend/public/BRAND_ASSETS.md` | 架构、部署入口、回滚统一为单 Worker | — |

刻意**未**做（当时）：前端 API 地址同源化（路线 B）、`atlasapi.wort.uk` 退役、域名切换（用户执行）。**后续已完成**：`atlas.wort.uk` 已绑到 Worker、`atlasapi.wort.uk` 已删除、路线 B 同源化已实施。

### 10.2 合并与部署时间线

| 时间 | 事件 | 结果 |
|---|---|---|
| 14:56 | `feat/workers-single-deploy`（`88190aa`）fast-forward 合入 `main` 并推送 | Builds 触发构建，**部署失败**：`_redirects` 第 5 行死循环（100324） |
| 14:56–15:04 | 线上仍为旧版本（`/` 返回 JSON、`/sw.js` 404） | 失败的部署不改变线上版本，无用户可见故障 |
| 15:0x | `4f27def` 删除全量回退规则并推送 | Builds 重新构建，**部署成功** |
| 部署后 | `/` 返回 HTML、`/api` 返回 JSON、深链 200、`/sw.js` no-store | `atlasapi.wort.uk` 已是新栈 |
| 稍后 | 用户删除 `atlasapi.wort.uk`，前端仍硬编码该域名 → 页面能开、接口全失败 | 属于预期内的取舍失误，不是故障；正确修法是路线 B 同源化 |
| 同轮 | 路线 B：`API_BASE_URL = '/api'`、SW 改为白名单缓存、`BACKEND_URL` 改 `https://atlas.wort.uk` | 构建产物中已无 `atlasapi` 残留 |
| 稍后 | 用户在面板把 Worker 名 `codeseek-backend` → `atlas`，`atlas.wort.uk` 绑到该 Worker | 配置 `name` 已同步为 `atlas`；`atlas.wort.uk` 返回新栈 |
| 待确认 | 改名后的构建是否真正落到 `atlas` | 见 10.4 阶段 B 的验证项；若流量未变，说明部署到了旧名脚本 |

关键事实：**失败的部署不会污染线上**，所以"先推再验证"在这个项目里是安全的；但"本地 `wrangler dev` 通过"不能作为放行依据（见第 11 节）。

### 10.3 为什么当初放在分支而不是 main

1. `[assets]` 生效后 Worker 的请求处理方式改变（`GET /` 从 JSON 变 HTML、非 `/api` 路径返回 SPA），属于会导致线上行为变化的改动。
2. Pages 与 Worker 同盯 `main`，合并会触发 Pages 重建；控制台未就绪时没必要制造一次发布。
3. 分支推送不触发部署，改动可版本化、可随时丢弃。

分支已合并且本地与远端均已删除（`git branch -d` 前确认 `main..分支` 为空）。

### 10.4 剩余人工操作清单（你执行，必须按此顺序）

**阶段 A：把 `atlas.wort.uk` 绑到 Worker（已完成，2026-11-11）**

1. Pages 项目 → Custom domains → 删除 `atlas.wort.uk` 绑定（**只删绑定，不删项目**）。
   - 做错：删掉整个项目 → 失去"域名切回 Pages"这条回滚路径。
2. Worker → Settings → Domains & Routes → Add → Custom domain → `atlas.wort.uk`。
   - 验证：证书状态 Active（1–5 分钟）；提示 hostname 占用说明第 1 步没生效。
3. `atlasapi.wort.uk` 已删除；前端改同源 `/api`，不再需要第二个域名。

**阶段 B：改名后的验证（`codeseek-backend` → `atlas`，必做）**

改名只改变服务标识，自定义域、cron、D1 绑定、secrets 都挂在服务上，正常应全部跟随。真正会出问题的是"面板名与配置名不一致"：wrangler 按 `wrangler.toml` 的 `name` 定位脚本，配置若没改会部署到旧名脚本，表现为**部署成功但线上没变**，或凭空多出一个 Worker。

4. Workers & Pages 列表：只有 `atlas`，没有并列的 `codeseek-backend`（有则说明部署到了另一个脚本）。
5. `atlas` → Settings → Domains & Routes：只有 `atlas.wort.uk`（`atlasapi.wort.uk` 应已不存在）。
6. `atlas` → Settings → Triggers：3 条 cron 仍在（`5 * * * *`、`*/30 * * * *`、`* * * * *`）。
7. `atlas` → Settings → Variables and Secrets：7 个 secret 仍在（缺失会让登录/邮件失败，`/api/health` 仍 200 正常，容易漏检）。
8. `atlas` → Deployments：最新版本的创建时间晚于本次推送；`wrangler deployments list` 能列出同一版本。
9. curl 四条（`/` HTML、`/api` JSON、深链 200、`/sw.js` no-store）+ 一次真实登录（验证 `JWT_SECRET` 仍在）。

**阶段 C：观察与收尾**

10. 观察 24–48 小时：`wrangler tail` + Analytics 无新增 5xx。
11. 删除 Pages 项目（可执行）。
   - 验证与收尾检查项见 `docs/deploy.md` 第三节第 8 步的"删除 Pages 项目后的收尾检查"。
   - 做错（删太早且新栈有问题）：唯一回滚路径消失，只能靠 `wrangler rollback` 回代码版本。

### 10.5 回滚（按阶段，Pages 未删之前）

| 时点 | 回滚动作 | 影响 |
|---|---|---|
| 域名已切、Pages 未删 | 解绑 Worker 的 `atlas.wort.uk` → 绑回 Pages | 分钟级；同源化后 API 也随域名回落，回滚窗口内接口不可用 |
| 改名后出现异常 | 面板改回原名 + `wrangler.toml` 同步 | 域名/cron/secrets 跟随服务；但若已出现同名双 Worker，需先删多余的那个以免 cron 双触发 |
| 代码级（任何时候） | Dashboard → Deployments → Rollback 或 `wrangler rollback` | 前端与 API 成对回退 |
| Pages 删除后 | 只剩代码级回滚 | 架构回滚不可用 |

### 10.6 本地复现验证（可选）

```bash
npm install                                  # 仓库根
npm run typecheck --workspace=backend
npm run lint --workspace=backend
npm run build --workspace=frontend
cd backend && npx wrangler deploy --dry-run  # 应输出 Read N files + env.ASSETS
npx wrangler dev --port 8788                 # 再依次 curl /api/health、/api、/search?q=x、/sw.js
```

> 注：`wrangler dev` 与 `deploy --dry-run` **都不会执行 `_redirects` 的死循环校验**，两者通过不代表能部署。本机曾因 `%APPDATA%\xdg.config\.wrangler` 权限问题导致 `wrangler dev` 报 EPERM，可用 `XDG_CONFIG_HOME` 指向可写目录规避；Builds 环境不存在该问题。

---

## 11. 迁移过程中踩到的坑与最终结论

保留本节是为了不让历史判断消失：原文档里"`_redirects` 与 SPA 回退可以共存、切域后再删"的结论是**错的**，原因和正确做法如下。

| # | 坑 | 表现 | 最终结论 |
|---|---|---|---|
| 1 | `_redirects` 全量回退与静态资源 SPA 回退叠加 | 真实部署报 `Invalid _redirects configuration: Infinite loop detected... [code: 100324]` | Worker 静态资源目录里**不能**出现 `/* /index.html 200`。SPA 回退唯一来源是 `not_found_handling = "single-page-application"` |
| 2 | `wrangler dev` 比真实部署宽松 | 本地 `Parsed 1 valid redirect rule`、深链 200，误判为"可共存" | 涉及静态资源配置的改动，只有真实部署日志 + 线上 curl 能作为验收依据 |
| 3 | `deploy --dry-run` 也不校验 `_redirects` | dry-run 全绿，部署照样失败 | dry-run 只能验证"能读到多少文件、绑定是否齐全" |
| 4 | `_redirects` 同时被 Pages 读取 | 删规则后 Pages 重建产物失去全量回退，深链会 404 | 这是本次唯一的线上风险点；因此"切域"必须紧跟"删规则"，且切域前不要删 Pages |
| 5 | `compatibility_date` 低于 2025-04-01 | 导航请求进 Worker，深链返回 JSON 404 | 已升到 `2025-04-01`，不要回退 |
| 6 | `compatibility_date` 升级还会移动 Hono/Workers 运行时行为基线 | 无已知回归 | 升日期属于一次性动作，后续按需常规更新 |
| 7 | 双域名策略与"先删旧域" | 删掉 `atlasapi.wort.uk` 后前端接口全挂（页面能开） | 域名是代码里的隐式依赖：删域名前必须先把前端改为同源 `/api`。顺序是"改代码 → 发布 → 验证无跨域请求 → 才删域名" |
| 8 | 部署单元合并后前端 bug 也要整体回滚 | 无法只回退前端 | 既定取舍；用 `wrangler rollback` 成对回退，schema 变更靠兼容纪律 |
| 9 | 面板改名后配置没同步 | `wrangler deploy` 按配置里的旧名部署，出现"部署成功但流量没变"或并列多出一个 Worker（同名 cron 会双触发） | 面板与 `wrangler.toml` 的 `name` 必须成对修改；改完按 10.4 阶段 B 逐项核对域名/cron/secrets |

**最终形态**：一个 Worker（`atlas`）= Hono API + `frontend/dist` 静态资源；一条部署路径（Workers Builds，push 即部署）；一个应急入口（Actions 手动）；唯一自定义域 `atlas.wort.uk`，API 走同源 `/api`；Pages 项目删除后不再有任何 Pages 依赖，也不再有任何绝对 API 域名。
