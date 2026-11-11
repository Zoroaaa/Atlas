# 前后端合并为单一 Worker（Workers Builds）改造评估 · v2

> v2 修订（2026-11-11）：以《前后端分离 → 单 Worker + Workers Builds 实施手册》（下称"手册"）为参照系，逐条做取舍。
> **实施状态（2026-11-11）**：路线 A 的仓库侧改动已完成于分支 `feat/workers-single-deploy`（本地验证通过），**尚未合入 main**；等待控制台操作，按第 10 节清单执行。
> 判定标记：**[采用]** 直接采用手册做法 / **[改写]** 原则可用但落点必须按本项目改 / **[不适用]** 本项目无对应前提或与既定规则冲突。
> v1 中的现状核实、收益与代价分析保留；工作量按修订结果**上调**（见第 7 节）。

## 0. 结论先行

- **做**，但只做"合并部署单元 + Workers Builds"；路线 B（同源 `/api`）仍作为第二阶段可选项。
- 手册有两处**不能照抄**：
  1. **Deploy Hook 闸门**与本项目"推送即部署、SQL 用户手动执行、CI 不做迁移"的事实冲突 → 明确**不采用**，改为 schema 兼容纪律（第 3 节给判断与理由）。
  2. **"Workers assets 不支持 `_headers` / `_redirects`"是旧认知** → 2026 版官方文档明确支持，本项目保留 `_headers`、只删 `_redirects` 的全量回退（第 2.2 节）。
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
| 前端 API 地址 | 硬编码 `https://atlasapi.wort.uk/api`，**两份**：`frontend/src/constants.ts:19`、`frontend/src/services/api/client.ts:5-16` | 手册假设的 `VITE_API_URL` 本项目不存在（`import.meta.env` 全仓只有 1 处 `PROD`） |
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
| Step 9 secrets 三处分层 | **[采用]** | Worker 名必须保持 `codeseek-backend`，7 个 secret 原样保留；Builds 面板**不配** API 地址类变量；Actions secrets 保留作应急手动部署 |
| Step 10 域名切换 | **[采用]** + **[改写]** | 先 workers.dev 验证 → 解绑 Pages → 绑 Worker；`atlasapi` 保留双绑；SW 处理见 2.4 |
| Step 11 回滚 | **[采用]** + 本项目约束 | `wrangler rollback` 是前后端成对回退；架构回滚=域名切回 Pages（保留 1–2 周）；数据库靠兼容纪律 |
| Step 12 收尾 | **[采用]** | 断开 Pages Git、收窄 `backend-deploy.yml`、更新 `docs/deploy.md`（并修正其"Pages 反代 /api"的错误描述） |

### 2.1 Step 2：本项目的 `[assets]` 配置（可直接用）

```toml
name = "codeseek-backend"          # 顶层键放在文件前部，避免 TOML 归属错误
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

### 2.2 Step 4：Pages 文件的去留（手册此处已过时）

手册写"Workers assets 不支持声明式响应头，`_headers`/`_redirects` 会静默失效"。**当前官方文档（2026-04 更新）已明确支持** Workers Static Assets 的 `_headers` 与 `_redirects`，因此本项目：

| 文件 | 处理 | 理由 |
|---|---|---|
| `_headers` | **保留**（已实测生效）；`/api/*` 规则由 Worker 接管后失效，随切域后的清理一并删除 | `/sw.js` 的 `no-store` 是 SW 更新机制的前提；`/assets/*` immutable 是首屏性能前提。实测结果见 2.5 |
| `_redirects` | **切域之后再删** `/* /index.html 200`，保留 `/brand.html` 规则 | 全量回退与 `not_found_handling: single-page-application` 重复；但 **Pages 同样读取本文件**，在合并到切域之间删除会让 `atlas.wort.uk` 深链立刻 404。已实测两者共存不冲突（见 2.5） |
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

结论：`_redirects` 全量回退与 `run_worker_first` **可以共存**，不会吞掉 `/api`。因此按"切域后再删"的顺序执行是安全的，不需要为了 Pages 兼容而保留永久例外。

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
- 合并前：**只加注释，不删规则**——Pages 仍读同一文件，提前删会让 `atlas.wort.uk` 深链 404。
- 切域后：单独提交删除 `/* /index.html 200`，顺带删 `_headers` 里已失效的 `/api/*` 规则。
- **验证**（标准见 2.5，本地已通过）：`/sw.js` 必须 `no-store`；`/assets/*` 必须 `immutable`；深链必须 200 `text/html`；`/api` 裸路径必须 JSON。

### Step 4 本地全链路验收（0.5d）
`wrangler dev` + 构建产物一起跑：深链、`/api` 裸路径、`/brand.html`、`/assets/*`、`/sw.js` 头。**验证**：本地无痕窗口装 SW，确认版本号与提示更新流程正常。

### Step 5 接 Workers Builds（0.5d）
`backend` 的 `wrangler deploy` 已在 Step 1 验证，这里只配面板：根目录、构建命令、部署命令、watch paths（见 2.3）。**验证**：推到非 main 分支触发预览构建；确认 build history 的 Commit 与目标一致，且构建日志里能看到 typecheck 通过（说明闸门在）。

### Step 6 收窄 Actions（0.25d）
`backend-deploy.yml` 去掉 `push` 触发，保留 `workflow_dispatch` 作应急手动部署。**验证**：push 一次 `backend/**` 改动，确认只有 Builds 一条流水线在跑。

### Step 7 预览域验收（0.5d）
在 workers.dev 上跑第 4 节的同一组 curl，加上 OAuth 登录、搜索、上传、榜单导入。**验证**：无痕窗口 Network 面板确认没有指向 `atlasapi.wort.uk` 的跨域请求（路线 A 阶段仍会有，属预期；路线 B 才要求清零）。

### Step 8 域名切换（0.5d）
Pages 解绑 `atlas.wort.uk` → Worker 绑定；`atlasapi.wort.uk` 继续绑同一 Worker。**验证**：`curl -I https://atlas.wort.uk/` 为 `text/html`，`/api/...` 为 `application/json`；无痕窗口确认 SW 版本号更新；`wrangler tail` 观察首屏、登录、搜索无 5xx。

### Step 9 观察期（1d，散布在 1–2 天）
OAuth 登录（GitHub/Google 回调仍落 `atlasapi`，state cookie 自洽，无需改 OAuth 应用）、注册验证码、搜索、收藏、上传、PWA 安装/更新、cron 的三个任务、榜单导入、D1 读写。**验证**：`wrangler deployments status` 的 Active 时间晚于切换时间。

### Step 10 回滚演练（0.25d）
在低峰期做一次：`wrangler rollback` 回上一版本 → 确认站点可用 → 再 rollback 回来。**验证**：演练记录写进 `docs/deploy.md`。

### Step 11 收尾（0.5d）
断开 Pages 的 Git 连接（项目保留 1–2 周后再删）；更新 `docs/deploy.md`（含修正"Pages 反代 /api"的错误描述、补新部署/回滚章节、注明 7 个 secret 首次注入步骤）；`grep -rn "atlasapi\|pages.dev"` 确认无残留构建引用。

### Step 12（可选）路线 B 同源化（2.5–3.5d）
改 `constants.ts` / `client.ts` → `/api`；清 `client.test.ts` 断言；SW 加用户态 bypass；CORS 复核；验收（登录、图片代理、分享链接、PWA 离线页）。`BACKEND_URL` 建议**保持** `atlasapi.wort.uk`，OAuth 应用零改动。

---

## 5. 坑清单映射（手册 3.1–3.16 + 本项目新增）

| 手册条目 | 判定 | 本项目说明 |
|---|---|---|
| 3.1 `cd ..` 层级算错 | **[改写]** | root=`backend`，仓库根是其上一层（`cd ..` 一层），不是 `../..` |
| 3.2 生成脚本被删后仍被引用 | **[不适用]** | 无生成脚本，配置入库 |
| 3.3 `wrangler.toml` 在 gitignore | **[不适用]** | 已入库且在版本控制中 |
| 3.4 Actions secrets 当 Builds 变量 | **[采用]** | 本项目前端不需要任何构建期变量；Builds 面板不要配 API 地址 |
| 3.5 监视路径 `*` 导致双部署 | **[改写]** | 不挡 push；改为"只保留 Builds 一条部署路径"，Actions 去 push 触发 |
| 3.6 Dashboard Worker 名与配置不一致 | **[采用]** | 必须保持 `codeseek-backend`；改名会导致 secrets/域名/cron 全挂 |
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
| `_redirects` 清理（拆到切域后） | 0.25d | 必做 | 0.25d |
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
2. 切换后：`atlas.wort.uk` 从 Worker 解绑 → 绑回 Pages（分钟级）；`atlasapi` 始终在 Worker，API 不断。
3. 代码级：`wrangler rollback` 回上一版本（前后端成对回退）；schema 不在回滚范围内，靠第 3 节纪律保证兼容。

**不要做**：切换当天删 Pages 项目；先删 `backend-deploy.yml`（先收窄触发，保留手动入口）；把 SPA 导航放进 `run_worker_first`；改 Worker 名。

---

## 9. 需要触碰的文件清单

必做：

- `backend/wrangler.toml`（`[assets]`、compat date、`run_worker_first`）
- `backend/package.json`（wrangler `^4.20`）
- `backend/src/index.ts`（根路由 JSON 让位）
- `frontend/public/_redirects`（删全量回退）、`frontend/public/_headers`（删 `/api/*`）
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

### 10.1 仓库侧已完成（分支 `feat/workers-single-deploy`，**未合入 main**）

| 文件 | 改动 | 验证结果 |
|---|---|---|
| `backend/wrangler.toml` | `compatibility_date` 2025-01-01 → 2025-04-01；新增 `[assets]`（`directory="../frontend/dist"`、`binding="ASSETS"`、`not_found_handling="single-page-application"`、`run_worker_first=["/api","/api/*"]`） | `deploy --dry-run` 通过：`Read 39 files`，绑定含 `env.DB` + `env.ASSETS` |
| `backend/src/index.ts` | `GET /` 的 API 信息 JSON 迁到 `GET /api` | 本地 200 JSON |
| `frontend/public/_redirects` | **只加顺序注释，规则未动**（删全量回退留到切域后） | 本地解析 1 条规则，深链 200 HTML |
| `frontend/public/_headers` | 未改 | 本地实测 `/sw.js` no-store、`/assets/*` immutable |
| `backend/package.json`、`package-lock.json` | wrangler `^3.78` → `^4.160.0` | `wrangler --version` = 4.160.0 |
| `.github/workflows/backend-deploy.yml` | 移除 `push` 触发，保留 `workflow_dispatch`；部署前新增 `Build Frontend (Static Assets)` 步骤 | 结构与逻辑本地复核（未在 GitHub 实跑） |
| `docs/workers-consolidation-assessment.md` | 本文档 | — |

刻意**未**做：前端 API 地址改造（路线 B）、域名切换、删除 Pages 项目、删除 workflow 文件。

### 10.2 为什么放在分支而不是 main

1. `[assets]` 生效后 Worker 的请求处理方式改变（`GET /` 从 JSON 变 HTML、非 `/api` 路径返回 SPA），这属于"会导致线上行为变化的改动"，直接推 main 会立刻改变 `atlasapi.wort.uk` 的现有行为。
2. Pages 与 Worker 同盯 `main`：合并会触发 Pages 重建。虽然 `_redirects` 已保留回退、重建也安全，但没必要在控制台未就绪时制造一次无意义发布。
3. 分支推送不触发任何部署（`backend-deploy.yml` 已无 push 触发，Workers Builds 尚未连接），改动可版本化、可备份、可随时丢弃。

### 10.3 需要你在控制台完成的步骤（按顺序执行）

**阶段 0：只读确认（2 分钟）**

1. Workers & Pages → `codeseek-backend` → Settings → Domains & Routes：记录当前自定义域（应为 `atlasapi.wort.uk`），确认 workers.dev 是否启用。
2. Deployments：记录当前 Active 版本时间/ID（回滚基线）。
3. Pages 项目：记录项目名与 `atlas.wort.uk` 绑定状态。

**阶段 1：连接 Workers Builds（不改变任何线上行为）**

4. `codeseek-backend` → Settings → Builds → Connect → GitHub → 仓库 `Zoroaaa/Atlas` → 生产分支 `main`。
5. 按原文填写：

| 字段 | 值 |
|---|---|
| Root directory | `backend` |
| Build command | `cd .. && npm install && npm run typecheck --workspace=backend && npm run lint --workspace=backend && npm run build --workspace=frontend` |
| Deploy command | `npm run deploy` |
| Preview command | 留空（本次不启用预览） |
| Watch paths（Include） | `backend/**`、`frontend/**`、`packages/**`、`package-lock.json` |
| Environment variables | **不填任何值**（7 个 secret 已在 Worker 上；前端无构建期变量） |

6. 保存后手动触发一次构建（Deployments → View build history → 重试/部署）。
7. **验收**：日志出现 `Read 39 files from the assets directory` 与 `env.ASSETS`；版本时间更新；`curl -s https://atlasapi.wort.uk/api/health` 仍 200 JSON；`curl -s https://atlasapi.wort.uk/` **此时仍返回 JSON**（main 还没有 assets，符合预期）。
8. **停点 1**：此阶段完成后告诉我，我再合并分支。若构建失败，把日志发我，线上不受影响。

**阶段 2：合并分支（我执行，你确认后）**

9. `feat/workers-single-deploy` → `main`，Builds 自动构建部署。
10. **验收**（`atlas.wort.uk` 不受影响）：

```bash
curl -s  https://atlasapi.wort.uk/api/health          # application/json
curl -s  https://atlasapi.wort.uk/api                 # {"name":"CodeSeek API",...}
curl -sI https://atlasapi.wort.uk/                    # 200 text/html
curl -sI https://atlasapi.wort.uk/sw.js               # Cache-Control: no-store
curl -sI https://atlasapi.wort.uk/assets/<任一hash>.js # immutable
```

11. 若异常：Dashboard → Deployments → Rollback（或 `wrangler rollback`）回上一版本。
12. **注意**：从这一刻起后端不再由 Actions 自动部署；应急入口为 Actions → Backend Deploy → Run workflow。

**阶段 3：切域名（你操作，窗口 5–10 分钟）**

13. Workers → `codeseek-backend` → Settings → Domains & Routes → Add → Custom domain → `atlas.wort.uk`。
14. 若提示 hostname 已被占用：Pages 项目 → Custom domains → 删除 `atlas.wort.uk`（**只删绑定，不删项目**），再回到第 13 步。
15. 等证书 Active（通常 1–5 分钟）。
16. **验收**（全部用无痕窗口）：首页；深链刷新 `/search?q=test`、`/dashboard/overview`；GitHub/Google 登录（回调仍落 atlasapi）；搜索；收藏；PWA 安装与"有新版本"提示；DevTools → Application → Service Workers 版本号为新的 `v<时间戳>`；`curl -I https://atlas.wort.uk/sw.js` 含 `no-store`。
17. 观察 24–48 小时：`wrangler tail` + Analytics 看 5xx。

**阶段 4：切域后的代码清理（我执行）**

18. 删除 `_redirects` 的 `/* /index.html 200`、删除 `_headers` 的 `/api/*` 规则，Builds 自动部署。
19. **验收**：深链仍 200 HTML（改由 `not_found_handling` 兜底）；`/api/health` 仍 JSON。

**阶段 5：收尾（观察期满，你操作）**

20. Pages 项目 → 断开 GitHub 连接，或直接删除项目。
21. `atlasapi.wort.uk` 的退役属路线 B，本次不做。

### 10.4 我无法验证、需要你确认的未知项

| 未知项 | 影响 | 兜底 |
|---|---|---|
| Builds 面板字段的实际名称/层级（Root directory、Build command） | 填错会构建失败 | 失败不发版，改配置重试 |
| Builds 环境能否用 `npm run deploy` 解析到 hoisted wrangler | 部署步骤报 command not found | 改用 `npx wrangler@4.160.0 deploy` |
| workers.dev 是否启用 | 阶段 2 的验证域名选择 | 直接用 `atlasapi.wort.uk` 验证，不依赖 workers.dev |
| Pages 是否配置了"仅生产分支部署"等策略 | 合并后 Pages 是否重建 | `_redirects` 已保留回退，重建也安全 |
| Builds 免费额度（3000 分钟/月、并发 1）是否够用 | 预览与生产构建排队 | 本项目构建约 1–2 分钟，够用 |

### 10.5 回滚（按阶段）

| 阶段 | 回滚动作 | 影响 |
|---|---|---|
| 阶段 1 后 | 不做任何事，删除 Builds 连接即可 | 线上无变化 |
| 阶段 2 后 | Dashboard → Deployments → Rollback，或 `wrangler rollback` | `atlasapi` 回到旧版本；`atlas.wort.uk` 仍由 Pages 服务 |
| 阶段 3 后 | 解绑 Worker 的 `atlas.wort.uk` → Pages 重新绑定该域（项目未删） | 分钟级；`atlasapi` 始终在 Worker，API 不断 |

### 10.6 本地复现验证（可选）

```bash
npm install                                  # 仓库根
npm run typecheck --workspace=backend
npm run lint --workspace=backend
npm run build --workspace=frontend
cd backend && npx wrangler deploy --dry-run  # 应输出 Read N files + env.ASSETS
npx wrangler dev --port 8788                 # 再依次 curl /api/health、/api、/search?q=x、/sw.js
```

> 注：本机曾因 `%APPDATA%\xdg.config\.wrangler` 权限问题导致 `wrangler dev` 报 EPERM，可用 `XDG_CONFIG_HOME` 指向可写目录规避；Builds 环境不存在该问题。
