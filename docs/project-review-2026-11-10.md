# Atlas 项目全景审查（2026-11-10）

> 基线：`main @ 1aed56f`
> 方法：静态代码审查 + 结构统计。未做运行时压测，也未读取生产库行数；涉及成本的结论均基于代码路径，不虚构绝对值。

---

## 一、现状盘点

### 1.1 模块与规模

| 模块 | 规模 | 说明 |
|---|---:|---|
| `backend/src` | 81 文件 / 24,733 行 | 单一 Cloudflare Worker，Hono 路由 + provider + repository + service |
| `frontend/src` | 227 文件 / 37,507 行 | React 19 SPA，页面 / hooks / 组件 / i18n |
| `packages/shared` | 12 文件 / 807 行 | 前后端共享的类型与番号解析工具 |
| `database` | 21 个 SQL 脚本 | 47 条 `CREATE TABLE`，执行完脚本 20 后实际存活 46 张表（`community_user_stats` 被删除） |

后端路由分组 17 个：auth、user、search、search-sources、community、admin、config、jav、recommend、notifications、follows、email、internal/rankings、admin/data-storage、feedback、announcements、system。搜索 provider 5 个：anime / movie / jav / manga / novel。

### 1.2 技术栈与部署

- 后端：Hono `^4.6.0`、zod `^4.4.3`、jose `^5.9.0`、opencc-js；Cloudflare Workers + D1（绑定 `DB`）+ Cron Triggers。
- 前端：React `19.2`、Vite `5.4`、@tanstack/react-query `5.101`、zustand `5.0`、i18next `26.3`、Tailwind `4.3`、lucide-react；PWA（`frontend/public/sw.js` + `manifest.json`）。
- 邮件：Resend（`email_queue` + `email_log`）。
- 部署：
  - 后端 `.github/workflows/backend-deploy.yml`：`push main` 且 `paths: backend/**` 触发；仓库根 `npm install` → `typecheck` → `lint` → `wrangler deploy`。
  - 前端 Cloudflare Pages（静态产物）。
  - 榜单导入是独立 GitHub Actions：每天 `0 18 * * *` 用 `javdb-cli` 抓 JavDB 周/月榜，带 `concurrency` 锁、mirror 回退、失败显式退出（`.github/workflows/*.yml`）。
  - 另有手动 probe workflow，只验证出口可达，不写库。
- Worker Cron（`backend/src/index.ts:155-191`）：
  - `*/30 * * * *`：关注女优新作检测 + 邮件摘要。
  - `0 * * * *`：清理 sessions / 验证码、补全 JAV 详情、每周同步推荐词典。

### 1.3 数据表与脚本编号现状

脚本编号连续 `01`–`21`，按用途分段：

| 段 | 脚本 | 内容 |
|---|---|---|
| 基础 | 01–05 | core、search、community、security、feedback/announcements |
| 种子 | 06–08 | 系统配置/角色、搜索源、标签 |
| 索引 | 09 | 全库索引与社区统计触发器 |
| 系统 | 10–11 | system_errors、数据存储（`data_records`） |
| 搜索分层 | 12–13 | search tier + 回填 |
| 通知/关注 | 14–16 | notifications/follows、女优收藏迁移、邮件 |
| 公告/社区 | 17–19 | 公告已读、社区通知回填、帖子浏览去重 |
| 终态修复 | 20 | 删社区物化统计表/触发器、删 `share_count`/`is_featured`、补复合索引 |
| 推荐 | 21 | JAV 推荐词典 |

**需要注意的结构性债务**：脚本 20 是“终态修正”，它会删掉 03/09 创建的表、列、触发器和索引。脚本 20 第 19–22 行明确写了“03/09 中相关定义属于历史迁移，执行本脚本后全部失效，不要在本脚本之后重跑 09”。这意味着：

- 全新库必须严格按 01→21 顺序执行；
- 任何“只补跑 09/03”的运维动作都会重建已删除对象或直接报错；
- 基线 schema 与终态 schema 不一致，阅读 03/09 会得到错误结论。

---

## 二、优化建议（只列高价值项）

### O1. 社区写接口没有任何限流，且 `contentData` 允许 500KB 原始 JSON

**问题（证据）**
- 社区所有写路由都没有限流：发帖 `community.ts:514`、改帖 `:565`、删帖 `:612`、点赞 `:666`、收藏 `:707`、评论 `:792`、举报 `:873`。整个文件只有 `authMiddleware`（`:62`）和一个上下文注入中间件（`:65`），全文检索 `rateLimit/checkRate/RATE_LIMIT` 无命中。
- 对比：登录/注册/验证码/搜索/错误上报都有限流（`auth.ts:183,627-628,679-680,843-844,984-985`；`search.ts:85-96`；`system.ts:105-111`）。社区是唯一没有写入防护的用户内容面。
- `createPost` 只做长度上限：`coverImage` ≤ 200,000（`validation/index.ts:288`），`contentData` ≤ 500,000（`validation/index.ts:289`），`contentData` 是**任意字符串**，没有按 `postType` 的结构校验。
- `contentData` 在帖子详情/列表里被原样返回，单帖 500KB 会把列表响应放大。

**影响**
- 一个登录用户即可在短时间内刷出大量 500KB 帖子，直接消耗 D1 存储、D1 读写配额和列表带宽；恶意内容只能靠人工处理。
- `contentData` 没有结构约束，前后端对字段的假设不一致时会在渲染层报错，且无法在入库时拦截。

**为什么值得做**
- 这是当前唯一“可被普通用户直接、低成本放大”的资源入口；生产已上线，风险不再是理论值。
- 修复点集中在中间件和 zod schema，不需要改数据模型。

**改动面与风险**
- 在 7 个写路由前挂 `checkRateLimitD1`（按 `userId + action` 维度），并给发帖/评论加短冷却。
- 把 `contentData` 从 `z.string()` 改为按 `postType` 的判别联合 schema（或至少降到几十 KB 的结构化对象）。
- 风险低；唯一需要注意的是限流阈值要覆盖“导入收藏/批量发帖”这类正常操作。建议先只对 `posts`/`comments` 限流，点赞/收藏用更宽阈值。

---

### O2. 数据生命周期缺失：`rate_limits`、`community_post_views`、`data_records` 只增不减

**问题（证据）**
- 每小时清理只做三件事：`user_sessions`、`email_verifications`、JAV 详情补全、词典同步（`index.ts:170-190`）。
- `rate_limits` 有清理函数 `cleanupExpiredRateLimits`（`rate-limit.ts:242`），但全仓库**零调用**。
- `community_post_views` 有 upsert（`community-repository.ts:290-305`），但没有任何 `DELETE`；`database/19_schema_community_post_views.sql` 只建表和索引。
- `data_records` 只在手动 `/cleanup` 时删除 `status='hidden'` 的记录（`data-storage.ts:349-357`），没有按时间的保留策略。
- 每次搜索（命中缓存也会）都会异步落库（`search.ts:198-200`），写入路径见 O3。

**影响**
- D1 免费额度单库 500MB、付费单库 10GB（Cloudflare D1 Limits）。三张表随使用量线性增长，且 `data_records.content_data` 存的是完整详情（含全部磁力），单行可达数 KB 到数十 KB。
- 增长到一定规模后，清理/备份/查询都会变慢；D1 单库单线程，大表删除还会触发长事务风险。

**为什么值得做**
- 这是“上线后最确定会发生”的成本问题：不需要攻击，正常用户搜索就会让它增长。
- 成本是复利的，越晚处理，单次清理越难做。

**改动面与风险**
- 在 `0 * * * *` 增加分批清理：`rate_limits` 按 `reset_at`、`community_post_views` 按 `last_viewed_at`、`data_records` 按 `first_seen_at/last_updated_at` + 保留天数。
- D1 官方要求大删除按批（例如每批 1000 行）执行，避免单条 SQL 修改几十万行。
- 风险中：`data_records` 是产品资产，保留策略需要产品确认（建议先只清理 `detail_completed=0` 且长期未更新的记录，以及 `content_data` 的磁力冗余）。

---

### O3. 搜索落库是写放大：磁力全量进 `content_data` + 逐条并发写来源

**问题（证据）**
- JAV 详情搜索会把全部磁力再写一遍进 `content_data`（`data-storage.ts:430-440`），同时把每条磁力转成一条来源记录（`:443`）。
- `insertSources` 对每条来源执行 `Promise.all` 并发 `INSERT OR IGNORE`（`data-storage.ts:155-183`）。
- `upsertRecord` 每次至少 3 次 D1 往返：`INSERT OR IGNORE` + `SELECT` + `UPDATE`（`data-storage.ts:208-263`）。
- 这些都在每次搜索的 `waitUntil` 里执行（`search.ts:198-200`）。

**影响**
- 一条含 30 个磁力的番号搜索，落库阶段会产生 30+ 次并发 D1 写。Cloudflare 文档明确：单次 Worker invocation 最多 6 个并发 D1 连接，D1 单库单线程，超出会排队甚至返回 overloaded。
- 磁力在 `content_data` 和 `data_record_sources` 双份存储，直接放大存储占用（与 O2 叠加）。
- 写放大发生在响应之后，用户不一定感知，但会推高延迟尾部与账单。

**为什么值得做**
- 这是“核心搜索路径上的隐性成本”，改法明确且不改变产品行为。
- 和 O2 一起做，收益叠加：少写一份磁力、少一批来源行，清理压力也同步下降。

**改动面与风险**
- `insertSources` 改为 `db.batch()`（一次往返，D1 的 batch 只算一次 query）。
- `content_data` 不再存磁力全量，只保留详情元数据；磁力以 `data_record_sources` 为唯一事实源。
- 合并 `upsertRecord` 的 `SELECT` 与 `INSERT`（用 `RETURNING` 或 `ON CONFLICT ... RETURNING`）。
- 风险低-中；需要确认现有 `/jav/library/:code` 与数据存储管理页是否依赖 `content_data.magnets`。

---

### O4. 搜索结果缓存键没有包含“启用源集合”，源开关最多 10 分钟不生效

**问题（证据）**
- 搜索前读取了用户禁用源：`disabledSources = listDisabledSourceIds(...)`（`search.ts:125-127`）。
- 但缓存键只拼了 `majorCategoryId / keyword / page / subMode / userId`（`search.ts:138-143`），**没有包含 `disabledSources`**。
- 缓存 TTL 10 分钟（`search.ts:134`），命中直接返回（`:152-172`）。

**影响**
- 用户在“源管理/源看板”里关掉一个源后立刻搜索，JAV/Novel 仍可能返回关闭前的源卡片（最多 10 分钟）。
- 这是用户可感知的“设置没生效”，会直接损害对源管理功能的信任。

**为什么值得做**
- 改动极小（缓存键加一个源集合哈希，或在源配置变更时递增版本号），但影响的是产品最核心的“源可控”卖点。
- 不需要改数据库结构。

**改动面与风险**
- 缓存键追加 `&s=<enabledSourceIds 排序后哈希>`；或在 `user_search_source_configs` 更新时写一个 `source_config_version` 进用户设置，键里带版本。
- 风险低；注意别把“匿名用户”和“已登录用户”混用同一个键（现有逻辑已用 `u=` 区分）。

---

### O5. JavBus 抓取失败被当作“未找到番号”，且无重试/负缓存

**问题（证据）**
- 底层 `get()` 能区分 `TIMEOUT / NETWORK_ERROR / HTTP_ERROR`（`jav-utils.ts:140-158`）。
- 但 `getHtml()` 把结构化错误压成空字符串（`jav-utils.ts:161-164`），`fetchJavbusDetailHtml` 失败统一返回 `null`（`:170-190`）。
- `searchByCode` 把 `null` 直接映射成 `errors.search = '未找到番号 X'`（`jav-provider.ts:145-153`）。
- `parseGrid` 在空 HTML 或解析失败时返回 `[]`（`jav-utils.ts:42-43`），女优/标题搜索失败会表现为“空结果”，没有错误标记。
- 没有重试，也没有负缓存：源站抖动时，每个用户请求都会重新打一轮（番号搜索最多 4 个变体，见 `jav-utils.ts:170-190`）。

**影响**
- JavBus 反爬/超时/网络故障时，用户看到的是“查无此资源”，而不是“源暂时不可用”。这会直接摧毁用户对搜索结果的信任。
- 反复失败没有短路，持续给源站施压，进一步加剧被封。

**为什么值得做**
- 搜索是产品唯一的核心价值；把“失败”说成“没有”是最伤信任的一类错误。
- 修复成本低：把错误种类透传到 `fallback/errors`，UI 区分“无结果/源异常”。

**改动面与风险**
- `fetchJavbusDetailHtml` 返回 `{ok:false,error}` 而不是 `null`；`searchByCode` 按 `HTTP_ERROR/TIMEOUT` 输出“源暂不可用”。
- 增加短负缓存（例如 60 秒），避免同一番号在故障期被反复抓取。
- 风险低；需要同步前端对 `errors.search` 的展示文案。

---

## 三、新功能建议

### F1. Web Push：把“关注新作”从 30 分钟轮询变成即时通知

**解决的真实问题**
- 关注女优的新作检测跑在 `*/30` cron（`follow-service.ts:166-189`、`index.ts:156-168`），通知进入站内收件箱 + 邮件摘要。用户不开邮件就最多延迟 30 分钟，且移动端关掉页面后没有任何提醒。
- 现有 PWA 的 Service Worker 只有 `install/activate/fetch/message`，没有 `push` / `notificationclick` 监听（`frontend/public/sw.js:136-265`）。

**为什么现在值得做**
- PWA 安装流程、关注、统一通知收件箱、邮件渠道都已存在，缺的只是“最后一公里”的推送通道；这是复用现有资产的增量功能，不是从零造轮子。

**代价**
- 需要 VAPID 密钥、`push_subscriptions` 表、`sw.js` 的 `push` 事件与点击跳转、订阅权限引导。
- iOS 要求“添加到主屏幕”后才支持 Web Push，需要在产品上明确提示。

---

### F2. 关键词 / 制作商 / 系列订阅（把“反复搜索”变成“被动获取”）

**解决的真实问题**
- 目前 `user_follows` 只支持女优维度的 `watch_key`（`database/14_schema_notifications_follows.sql`、`routes/follows.ts`），用户对“某个关键词/制作商/系列”的持续关注只能靠反复搜索。
- `data_records` 已经按 `dedup_key` 去重并持续累积（`database/11_schema_data_storage.sql`），具备做“新记录匹配订阅”的数据基础。

**为什么现在值得做**
- 通知、去重、邮件摘要、关注列表这套基础设施已经跑通，新增订阅维度主要是“匹配 + 去重键”的工作，边际成本低。
- 对资源聚合站来说，“订阅”比“再搜一次”更能形成留存。

**代价**
- 新增订阅表与匹配逻辑；cron 需要按新 `data_records` 匹配订阅并复用 `emitNotification` 的 `dedupKey`。
- 主要风险是通知噪音，需要提供频率上限和“仅站内/仅邮件”开关（现有 `notification_preferences` 已支持）。

---

### F3. 举报 → 作者处置闭环（让 `warn_author` 真正生效）

**解决的真实问题**
- 举报处理的 `action` 目前只有 `remove_source` 有实际效果：隐藏帖子（`admin.ts:716-718`）。
- `warn_author` 只会被写进举报记录并通过 `logUserAction` 留痕（`admin.ts:707-737`），**不会通知作者、不会计数、不会限制发帖**。
- 结果是：反复违规的作者没有成本，管理员只能删帖，无法升级处置。

**为什么现在值得做**
- 举报入口、举报列表、处理弹窗都已经存在；缺的是“处置动作”的后半段。补上它比重新设计一套审核系统便宜得多。
- 与 O1 的写限流互补：限流防刷，处置闭环防惯犯。

**代价**
- 需要：警告通知（复用 `emitNotification`）、作者违规计数、阈值触发发帖冷却/禁言、管理端展示。
- 风险是误判，需要保留管理员撤销与申诉入口。

---

## 四、已知欠账核实

| 欠账 | 结论 | 证据 |
|---|---|---|
| 社区写接口是否有任何限流 | **仍然没有** | `community.ts:62,65` 只有认证与上下文注入；514/565/612/666/707/792/873 七个写路由无 `checkRateLimit`；全文无 `RATE_LIMIT` |
| `content_data` 是否仍允许 500KB 原始 JSON | **仍然是** | `validation/index.ts:289` `max(500000)`；且未按 `postType` 做结构校验 |
| 举报处理的 `warn_author` 是否仍然无效 | **仍然无效** | `admin.ts:716` 只处理 `action === 'remove_source'`；`warn_author` 仅入库+日志，无通知/无计数/无状态变更 |
| 是否有其他死代码/死接口/死字段 | **有，见下** | 见 4.1 |

### 4.1 死代码 / 死接口 / 死字段清单

1. **RBAC 权限模型整体是死代码**
   - `checkPermission` 定义在 `middleware/auth.ts:74-100`，全仓库**零调用**。
   - `roles.permissions`、`users.permissions`、管理员 `/users/:id/permissions`（`admin.ts:626-655`）都可配置，但没有任何路由读取并校验。
   - `community:share` / `community:review` 在 `database/06_data_system.sql:17` 与 `middleware/auth.ts:21` 声明，但从未被检查。
   - 影响：管理员以为在配权限，实际只有 `checkIsAdmin` / `checkIsSuperAdmin` 的角色名判定生效。要么接入 `checkPermission`，要么删掉这套配置，避免误导。

2. **`cleanupExpiredRateLimits` 是死函数**
   - 定义在 `utils/rate-limit.ts:242`，全仓库无调用；`rate_limits` 因此只增不减（见 O2）。

3. **Service Worker 缓存配置有两条死配置**
   - `sw.js:15-20` 配了 `/api/search` 与 `/api/sources`。
   - 但 `sw.js:172-174` 明确跳过非 GET；`/api/search` 是 POST，永远不会走 SW 缓存。
   - `/api/sources` 不是真实路径，真实路由是 `/api/search-sources`（`backend/src/index.ts:87`），因此也永不命中。
   - 影响：看起来“搜索/源有离线缓存”，实际没有；源列表退化成默认 `networkFirst`。

4. **`pending` / `rejected` 是无效帖子状态**
   - `validation/index.ts:303-305` 允许 `active/pending/rejected/hidden`，`community.ts:636` 仅管理员可改。
   - 代码中只有 `active` 与 `hidden` 有实际语义；`pending`/`rejected` 没有进入任何流程（发布即 `active`，无审核队列）。
   - 建议：要么实现审核队列，要么从枚举和前端标签里删掉。

5. **基线 schema 里仍有已删除的字段/表**
   - `share_count`、`is_featured`、`community_user_stats` 及 4 个统计触发器仍出现在 `03_schema_community.sql` / `09_indexes_triggers.sql`；脚本 20 才删除它们（`20_fix_community_user_stats.sql:26-39`）。
   - 运行期已不存在（脚本 20 已执行），但基线脚本与终态不一致，是维护陷阱（见 1.3）。

6. **未发现死接口（抽查）**
   - `/community` 只有 8 个 GET 路由（`community.ts:78,145,293,341,391,453,750,921`），均有前端调用。
   - 抽查 `/search/quota`、`/jav/actresses`、`/config/export`、`/source-status-history/:id`、`/export-user-configs/:id`、`/community/tags/:id` 均有消费方。
   - `/community/stats` 已不存在，不是遗留死接口。

---

## 五、可靠性风险

### 5.1 外部资源抓取（JavBus / JavDB）

- **JavBus（核心搜索，风险较高）**
  - 无重试、无负缓存、无熔断；失败语义在 `getHtml` 被抹平（`jav-utils.ts:161-164`），最终表现为“未找到”（见 O5）。
  - 番号搜索最多尝试 4 个代码变体，首个 10 秒、后续 6 秒（`jav-utils.ts:170-190`），单次搜索最坏可拖到约 28 秒。
  - 解析全部依赖正则（`parseGrid`、`parseJavDetail`、`parseMagnets`），源站改版时静默返回空数组。
  - 磁力 Ajax 使用 `floor=Date.now()`（`jav-provider.ts:166`），无法缓存，必然每次回源。

- **JavDB（榜单导入，风险较低）**
  - 走 GitHub Actions 而非 Worker，带 mirror 回退、逐步失败上报、artifact 留存（`.github/workflows/*.yml`）；设计上比 JavBus 稳健。
  - 仍依赖 `javdb-cli` 与第三方镜像可用性，但失败会显式失败而不是静默。

### 5.2 D1 查询与索引

- 缺复合索引：
  - `community_posts` 列表是 `status = ? ORDER BY created_at DESC`（`community-repository.ts:197-242`），现有 `idx_posts_status`、`idx_posts_created` 只能二选一（`database/09_indexes_triggers.sql:99-106`）。建议 `(status, created_at DESC)`。
  - 评论是 `post_id = ? ORDER BY created_at DESC`（`community-repository.ts:472-474`），现有 `idx_comments_post(post_id)`（`09:114`）需要额外排序。建议 `(post_id, created_at DESC)`。
- 写并发：`insertSources` 用 `Promise.all` 逐条写（`data-storage.ts:163-183`），与 D1“单次 invocation 最多 6 个并发连接、单库单线程”的约束相冲。
- 单次 invocation 查询上限：D1 官方为 1000（Paid）/ 50（Free）；`db.batch()` 只算一次 query。当前搜索落库与关注通知都没有按此预算设计（见 5.5）。

### 5.3 缓存一致性

- 搜索缓存：用户态响应使用 `private`、非用户态使用 `public`，且 JAV/Novel 按用户隔离（`search.ts:138-149`）——这部分是正确的。
- 缓存命中仍补写历史（`search.ts:152-172`）——正确。
- 问题在“启用源集合未进缓存键”（见 O4）。
- 前端 react-query `staleTime` 5 分钟（`frontend/src/services/api/queryClient.ts`），与搜索服务端缓存叠加时会放大“设置不生效”的观感。

### 5.4 鉴权与越权

- 角色校验总体是到位的：`sources.ts` 对他人配置/系统源有 `checkIsAdmin`（`:361-390,650-651,733-734`），`config.ts` 几乎每个管理接口都有 `checkIsAdmin/checkIsSuperAdmin`（`:162,180,218,267,300,356,405,463,580,648,715,780`），`feedback.ts` 用 `getAdminUser`（`:162`），数据存储路由整体挂 `adminMiddleware`（`data-storage.ts:18-19`）。
- 未发现可直接越权的公开管理接口。
- 真正的问题是：**限流是“先读后写”**（`rate-limit.ts:42-70`、`:100-126`），并发请求可以同时读到旧计数并各自 +1，突发流量下会超过阈值。D1 写虽串行，但读与写之间没有原子性。
- RBAC 权限模型未接入（见 4.1），属于“能力缺失”而非“越权”。

### 5.5 定时任务的重叠与预算

- `*/30` 同时启动关注检测与邮件摘要（`index.ts:159-168`）。代码注释称“≤20 + ≤15 = ≤35 次子请求，低于 50 上限”（`index.ts:157-158`），但**只统计了外部 `fetch`，没有计入 D1 查询**；D1 自身有“单次 invocation 1000 查询（Paid）/50（Free）”的限制。
- `runWatchCheck` 每批 20 个女优、并发 4（`follow-service.ts:166-189`）。每个 `syncWatch` 至少 4–5 次 D1 往返（`follow-service.ts:58-108`），加上 `upsertWorksToLibrary` 的 batch（`library-writer.ts:103-105`）。
- `notifyFollowers` 对每个关注者逐条 `emitNotification`（`follow-service.ts:132-163`），而 `emitNotification` 每次至少 2 次 SELECT + 1 次 INSERT（`notification-service.ts:50-90`）。**关注者数量没有上限**：一个热门女优若有数百关注者，单次 cron 的 D1 查询数可以轻松越过 1000。
- 没有 run lock / lease / 幂等标记：如果某轮执行超过 30 分钟（外部抓取慢 + D1 排队），下一轮会重叠。
- 整点 `0 * * * *` 与 `*/30` 的 `:00` 轮次会并发触发（`index.ts:156,170`），两套任务同时写 D1。
- 邮件摘要的每日全局上限是读后判断再写，非原子（`email-notification.ts`），重叠轮次可能突破上限。

---

## 六、结论：最值得做的三件事

1. **给社区写入加限流，并给 `contentData` 加结构/体积约束（O1）**
   这是当前唯一可被普通用户低成本放大的资源入口；改动集中在中间件和 schema，风险最低、收益最直接。

2. **补上数据生命周期清理：`rate_limits`、`community_post_views`、`data_records`（O2）**
   生产已在跑，正常使用就会让三张表线性增长；D1 单库有硬上限。越晚做，单次清理越难，且会与 O3 的写放大叠加。

3. **修正 JavBus 失败语义：区分“源不可用”与“未找到”，并加短负缓存（O5）**
   搜索是产品唯一核心价值；把抓取失败说成“查无此资源”会直接摧毁信任，而修复只需把错误种类透传到 UI。

> 紧随其后的两项：O3（搜索落库写放大）与 O4（源开关缓存不一致）。如果要做 F1 Web Push，建议先把 O2 的数据清理做掉，否则推送带来的通知量会进一步放大 `notifications` / `email_queue` 的增长。

---

## 附：本次审查未覆盖的内容

- 未读取生产 D1 的实际行数/表大小，因此所有“增长”结论是代码路径推导，不是实测。
- 未做并发压测、未复现 JavBus 反爬、未验证 VAPID/Web Push 在 iOS 的实际表现。
- 未逐条审计 OAuth 回调的 state/CSRF 细节；仅确认主流程使用签名 token 与固定回调。
