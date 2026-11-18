# Atlas 代码问题清单（2026-11-18）

> 来源：本轮前后端核心代码注释治理过程中的静态审查，未做运行时复现。
> 用途：交付他人验证并修复。
> 说明：
> - 定位以「文件 + 函数 / 路由 / 组件」为准，行号会随代码改动漂移。
> - 优先级：**P0** 安全或数据损坏；**P1** 功能错误、明显资源泄漏；**P2** 一致性、可维护性、体验问题。
> - 标「疑似 / 待确认」的条目需要先复现，再决定是否修。
> - 修复时请遵守仓库根目录 `AGENTS.md` 的架构与注释规范。

## 概览

| 分类 | 条目数 | 最高优先级 |
| --- | --- | --- |
| A. 安全与认证 | 10 | P0 |
| B. 数据正确性与一致性 | 13 | P1 |
| C. 缓存、限流与并发 | 6 | P1 |
| D. 抓取与外部源 | 5 | P1 |
| E. 前端行为与状态 | 17 | P1 |
| F. 架构、类型与代码清理 | 10 | P2 |
| 合计 | 61 | — |

建议修复顺序：**A → B → C → D → E → F**。同一文件的问题可合并为一个修复任务，避免重复改同一段代码。

---

## A. 安全与认证

### A-01 · P0 · OAuth 回调通过 URL query 传递 token
- 位置：`backend/src/routes/github-oauth.ts`、`backend/src/routes/google-oauth.ts` 的回调重定向。
- 现象：回调地址直接拼接 `?token=...&user=...` 跳回前端。
- 影响：token 会进入浏览器历史、Referer、反向代理与访问日志，存在泄漏风险。
- 验证：完成一次 OAuth 登录，检查 302 的 `Location` 头。
- 建议：改为一次性 code 换取 token（后端短期存储 + 前端 POST 兑换），或至少改用 URL fragment + 立即清除；更稳妥的是 HttpOnly Cookie。

### A-02 · P0 · 邮箱验证码明文与 hash 同时落库
- 位置：`backend/src/services/email-verification.ts` 验证码生成与入库逻辑。
- 现象：`code` 与 `code_hash` 同时写入数据库。
- 影响：数据库泄漏即可直接读取验证码，hash 失去意义。
- 验证：检查 `email_verifications` 表写入字段。
- 建议：只存 hash；校验时对用户输入做同样哈希后比较。历史明文列需迁移清理。

### A-03 · P0 · 验证码查询未过滤 `pending` 状态
- 位置：`backend/src/repositories/email-verification-repository.ts` 的 `findVerificationByCode`。
- 现象：查询未限制 `status = 'pending'`，已使用但未过期的验证码仍可能通过校验；同文件其他查询有此过滤，口径不一致。
- 影响：验证码可被重复使用。
- 验证：先用一个验证码完成注册/改密，再用同一码请求一次。
- 建议：查询补充 `status = 'pending'` 与 `used_at IS NULL`，并补一条回归测试。

### A-04 · P0 · 搜索源 CSV 导出未防公式注入
- 位置：`backend/src/routes/sources.ts` 的 CSV 导出。
- 现象：单元格未处理以 `=`、`+`、`-`、`@`、Tab、CR 开头的值。
- 影响：用 Excel 打开导出文件时可能执行公式（CSV Injection）。
- 验证：构造名称以 `=1+1` 开头的源并导出。
- 建议：对上述前缀统一加 `'` 转义，并补单测。

### A-05 · P1 · 前端 JWT 解析不支持 base64url
- 位置：`frontend/src/services/api/source.ts` 的 `getSourcesWithUserConfig`、`exportUserConfigs`。
- 现象：用 `atob(token.split('.')[1])` 解析 payload，未处理 base64url 的 `-`/`_` 与缺失补位。
- 影响：解析抛错后被吞掉，已登录用户也可能拿到空源配置。
- 验证：构造含 `-` 或 `_` 的 payload，或长度不满足 4 的倍数。
- 建议：先替换 `-`→`+`、`_`→`/` 并补齐 `=`，再解码；解析失败要显式上报。

### A-06 · P1 · 评论接口未校验帖子可见状态
- 位置：`backend/src/routes/community.ts` 的 `GET/POST /posts/:id/comments`。
- 现象：只校验帖子存在，未校验 `status = 'active'`。
- 影响：隐藏/审核中的帖子可通过已知 ID 继续读取或新增评论。
- 验证：把帖子置为非 active 后直接请求评论接口。
- 建议：查询帖子时带状态条件；错误文案区分「不存在」与「不可见」。

### A-07 · P1 · 删除账号依赖外键级联，D1 行为未确认
- 位置：`backend/src/repositories/user-repository.ts` 的删号逻辑。
- 现象：代码依赖外键级联清理社区、关注等关联表。
- 影响：若 D1 未启用 `PRAGMA foreign_keys = ON` 或表未声明级联，会残留孤儿数据。
- 验证：在测试库执行删号，检查关联表计数。
- 建议：确认 D1 外键行为；不确定时改为显式事务删除。

### A-08 · P2 · 反馈管理接口缺 token 时返回 403
- 位置：`backend/src/routes/feedback.ts` 的 `getAdminUser` 失败分支。
- 现象：未登录与无权限统一返回 `AUTH_ERROR` + 403。
- 影响：前端无法区分「需要登录」与「权限不足」。
- 建议：缺 token 返回 401，已登录但无权限返回 403。

### A-09 · P2 · 多个查询参数无边界
- 位置与现象：
  - `backend/src/routes/sources.ts` 的 `/popular`：`limit` 直接进 SQL，无上限。
  - `backend/src/routes/config.ts` 的 `/logs`、`/email/logs`、`/email/queue`：`page` 无下限，可能生成负 OFFSET。
  - `backend/src/routes/system.ts` 的 GET `/source-status-batch`：无 50 条上限，POST 版本有。
- 影响：可被用于放大查询或触发异常。
- 建议：统一在 zod schema 或路由入口做 `min/max` 收敛。

### A-10 · P2 · 种子下载接口挂在登录中间件之后
- 位置：`backend/src/routes/jav.ts` 的 `/torrent/:hash`。
- 现象：`javRoutes.use('*', authMiddleware)` 使之必须登录。
- 影响：若产品预期匿名可下载种子，当前行为不符；若预期登录，需确认前端调用都带 token。
- 验证：不带 token 请求该接口。
- 建议：先确认产品策略，再决定是否把该路由前移到认证中间件之前。

---

## B. 数据正确性与一致性

### B-01 · P1 · 更新搜索源后回查未 JOIN 用户配置
- 位置：`backend/src/services/search-sources-service.ts` 的 `updateSearchSource`。
- 现象：更新后重新查询未 JOIN `user_source_configs`。
- 影响：返回的 `userEnabled` / `userNotes` 退化为默认值，前端可能把用户已禁用的源显示为启用。
- 验证：禁用某源 → 调用更新接口 → 检查返回的 `userEnabled`。
- 建议：复用列表查询的 JOIN 逻辑，或在更新后单独补用户配置字段。

### B-02 · P1 · 批量更新源配置的边界问题
- 位置：`backend/src/services/search-sources-service.ts` 的批量更新。
- 现象：入参 `sourceId` 重复时 `IN` 去重，可能误报「部分搜索源不存在」；`configs` 为空时生成 `IN ()` 非法 SQL。
- 影响：接口报错或误报。
- 验证：传重复 sourceId、传空 configs 各请求一次。
- 建议：入参先去重；空集合直接短路返回。

### B-03 · P1 · 删除源时用户配置被物理删除
- 位置：`backend/src/services/search-sources-service.ts` 的删除逻辑。
- 现象：源记录软删除，但所有用户的个性化配置被物理删除。
- 影响：误删或后续恢复源时，用户配置不可恢复。
- 建议：用户配置同步软删除，或至少保留审计记录。

### B-04 · P1 · 系统/非系统分类权限判断等价
- 位置：`backend/src/services/search-sources-service.ts` 的分类与源更新权限判断。
- 现象：两条分支判断结果相同。
- 影响：若种子数据的 `created_by` 不是真实用户，系统分类可能无人可改。
- 验证：用管理员修改系统分类，检查是否被拒。
- 建议：系统分类改为仅超管可改，或按 `created_by` 为空单独判断。

### B-05 · P1 · `enabledSources` 与 `enabledOnly` 口径不一致
- 位置：`backend/src/services/search-sources-service.ts` 的 `enabledSources` 统计。
- 现象：只统计用户配置表，未计入「未配置但按默认启用」的系统源。
- 影响：统计数与实际可搜索源数不一致。
- 建议：统一走同一套「默认启用 + 用户覆盖」计算。

### B-06 · P1 · 验证码失败会累加同邮箱所有 pending 记录
- 位置：`backend/src/services/email-verification.ts` 的 `verifyCodeWithAttempts`。
- 现象：一次失败会把该邮箱/类型下所有 pending 记录的尝试次数一起 +1。
- 影响：多次失败后用户可能被提前锁定。
- 建议：只更新当前匹配的那条验证码记录。

### B-07 · P1 · 关注邮件入队条件复用了站内开关
- 位置：`backend/src/services/follow-service.ts`。
- 现象：邮件入队条件使用 `notify_in_app = 1`。
- 影响：用户关闭站内通知但开启邮件时，仍收不到任何邮件。
- 验证：关闭站内、开启邮件后触发关注更新。
- 建议：站内与邮件分别判断各自偏好字段。

### B-08 · P2 · 榜单导入新增数使用预估值
- 位置：`backend/src/services/ranking-import.ts`。
- 现象：`createdCount = items.length - existingCount`。
- 影响：并发导入或 `ON CONFLICT DO NOTHING` 冲突时高报新增数。
- 建议：使用 SQLite 返回值或导入后重新计数。

### B-09 · P1 · 动画资源兜底会把全部磁力挂到首条作品
- 位置：`backend/src/services/data-storage.ts` 的 `animeResourcesToSources`。
- 现象：无法归属时 fallback 到首条作品；影视侧是严格归属策略。
- 影响：数据污染，详情页出现不相关磁力。
- 建议：与影视策略对齐，无法归属时丢弃并记录日志。

### B-10 · P2 · 后台登录次数只统计最近 20 条行为
- 位置：`backend/src/routes/admin.ts` 的用户详情。
- 现象：`totalLoginCount` 从最近 20 条行为中统计。
- 影响：后台展示的累计登录次数偏小。
- 建议：直接读取 `users.login_count` 或做聚合查询。

### B-11 · P1 · 邮件队列/日志表名疑似不一致
- 位置：`backend/src/routes/config.ts` 的 `/email/queue` 与 `/email/logs`。
- 现象：队列接口读 `email_log`（`status` / `sent_at`），其余接口用 `email_send_logs`（`send_status` / `created_at`）。
- 影响：若 `email_log` 不存在会直接 500；若存在则统计口径不一致。
- 验证：调用 `/email/queue`，并核对 D1 实际表名与字段。
- 建议：统一到实际表结构，删除旧表名引用。

### B-12 · P2 · LIKE 查询未转义通配符
- 位置与现象：
  - `backend/src/routes/data-storage.ts` 的 `/records` 搜索。
  - `backend/src/routes/feedback.ts` 的管理端搜索。
  - `backend/src/repositories/community-repository.ts` 的标签筛选 `LIKE '%"tag"%'`。
- 影响：用户输入的 `%` / `_` 会改变匹配范围，造成误匹配或放大扫描。
- 建议：转义 `%`、`_`、`\`，并配合 `ESCAPE`。

### B-13 · P2 · `updateTagUsageCount` 名不副实
- 位置：`backend/src/services/source-status.ts` 的 `updateTagUsageCount`。
- 现象：名称表示更新使用次数，实现只 `SET tag_active = 1`，从不累加计数。
- 影响：若后续依赖该计数做排序/推荐，数据恒为 0 或旧值。
- 建议：确认是否仍需要计数；不需要则改名，需要则补累加逻辑。

---

## C. 缓存、限流与并发

### C-01 · P1 · 限流先读后写，非原子
- 位置：`backend/src/utils/rate-limit.ts`。
- 现象：单窗口与多级限流均为「先查询计数，再写入」。
- 影响：并发请求可能同时通过，边界超发。
- 验证：并发压测同一用户/同一接口的限额边界。
- 建议：使用带条件的 UPSERT（`INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit`）或 D1 事务。

### C-02 · P1 · 邮件日限额先查后发
- 位置：`backend/src/services/email-sender.ts`。
- 现象：发送前查询当日用量，再发送并累加。
- 影响：并发下可能短暂超出日限额。
- 建议：先原子占用配额（自增并判断），失败则拒绝发送。

### C-03 · P2 · 热门趋势缓存键不含参数
- 位置：`backend/src/routes/search.ts` 的 Provider trending 缓存。
- 现象：缓存键未包含 `limit` / `hours`。
- 影响：命中缓存后调整参数 30 分钟内不生效。
- 建议：把参数拼入缓存键，或在参数变化时清 key。

### C-04 · P1 · `source_status_cache` 无界增长
- 位置：`backend/src/services/source-status.ts`。
- 现象：每次探测 INSERT 新行，无唯一约束、无清理；写入的 `expires_at` 从未被读取（实际用 `created_at + maxAge`）。
- 影响：D1 存储持续膨胀。
- 建议：按 `source_id + probe` 做 UPSERT；补定时清理或 TTL；删除无用列或改为读取。

### C-05 · P2 · R2 失败墓碑无过期清理
- 位置：`backend/src/services/media-store.ts`。
- 现象：失败墓碑只在抓取成功后删除。
- 影响：长期失败的封面会持续累积墓碑记录。
- 建议：增加按时间清理任务，或设置墓碑 TTL。

### C-06 · P2 · 封面代理 302 缓存 1 天
- 位置：`backend/src/routes/jav.ts` 封面代理。
- 现象：302 响应缓存 24 小时。
- 影响：R2 对象替换或删除后，边缘节点仍跳旧地址。
- 建议：缩短重定向缓存，或在对象更新时主动 purge。

---

## D. 抓取与外部源

### D-01 · P1 · 女优资料页一次性并发 10 个请求
- 位置：`backend/src/services/actress-search.ts`。
- 现象：最多 10 个 JavBus 资料页同时请求，无 host 级限速；封面回填已有类似限速。
- 影响：容易触发风控或超时。
- 验证：连续搜索多个女优，观察失败率。
- 建议：复用封面回填的 host 级并发/间隔控制。

### D-02 · P1 · 奇书网仍在搜索，旧说明称已下线
- 位置：`backend/src/services/novel-search.ts` 的 `searchQishuNovel`。
- 现象：代码每次搜索仍执行奇书网请求；旧文件头曾声明已下线。
- 影响：若源实际不可用，会空耗请求并拉长响应时间。
- 验证：实际请求奇书网搜索，确认可用性与返回结构。
- 建议：按实测结果决定保留、降级或删除，并同步文档。

### D-03 · P2 · `hasMore` 用「本页是否满额」猜测
- 位置：`backend/src/services/novel-search.ts`、`backend/src/services/manga-search.ts`。
- 现象：末页恰好满额时会多显示一次「加载更多」。
- 影响：用户点击后得到空页。
- 建议：优先使用源返回的总数/游标；无法获取时按「满额 + 多取一条」判断。

### D-04 · P2 · TPB 去重未复用统一 hash 提取
- 位置：`backend/src/services/movie-search.ts`。
- 现象：直接用 `magnet.slice(20, 60)` 作为去重键。
- 影响：短 magnet 或格式异常时被误丢/误判重复。
- 建议：复用统一的 `extractHash`。

### D-05 · P2 · 标题归一化正则可能误匹配普通词
- 位置：`backend/src/utils/title-grouping.ts` 的 `/\\bav1?\\b/gi`。
- 现象：正则实际匹配 `av` 与 `av1`。
- 影响：标题中普通词 `av` 会被剔除，影响分组。
- 建议：确认目标是否仅为 `av1`，是则改为 `/\bav1\b/gi`，并补测试。

---

## E. 前端行为与状态

### E-01 · P1 · 源面板写操作缺少失败处理
- 位置：`frontend/src/components/search/SourceBoard.tsx` 的 `openDetail`、`handleInlineCheck`、`handleToggle`、`handleBatchToggle`、`handleSaveCustom`、`handleDetailCheck`。
- 现象：只有 `finally`，调用处用 `void fn()`，没有 `catch`。
- 影响：接口失败会变成未处理的 Promise rejection，用户收不到失败提示。
- 验证：断网或让接口返回 500 后操作。
- 建议：统一 catch 并 toast；或封装一个带错误处理的异步动作。

### E-02 · P1 · 搜索历史更新标记提前写入
- 位置：`frontend/src/hooks/useSearchFlow.ts` 的 `updatedHistoryCodesRef`。
- 现象：在写历史接口成功前就写入 code；集合不随新搜索重置。
- 影响：一次失败后，本次会话内同番号不再重试。
- 建议：成功后再写入；新搜索开始时清空集合。

### E-03 · P1 · 收藏删除使用子串匹配
- 位置：`frontend/src/hooks/useFavoritesManager.ts` 的漫画/小说收藏。
- 现象：用 `f.url?.includes(item.id)` 判断归属。
- 影响：短 ID（如 `123`）可能命中其他条目（如 `1234`），误删其他收藏。
- 建议：按结构化 ID 比较，或解析 URL 后精确匹配。

### E-04 · P1 · 社区收藏乐观回滚无守卫
- 位置：`frontend/src/stores/communityStore.ts` 的 `toggleFavorite`。
- 现象：请求失败直接按 `postId` 覆盖状态；`toggleLike` 有状态守卫。
- 影响：连续点击时，旧请求失败可能覆盖新状态。
- 建议：按请求序号或期望值判断后再回滚。

### E-05 · P2 · 评论写操作吞异常
- 位置：`frontend/src/stores/communityStore.ts` 的 `addComment`、`deleteComment`。
- 现象：异常被吞掉，而 `createPost` / `updatePost` 会 rethrow。
- 影响：调用方无法统一提示失败。
- 建议：统一错误策略，至少返回成功/失败结果。

### E-06 · P2 · `ProxyService.shouldProxy` 名不副实
- 位置：`frontend/src/services/proxy/ProxyService.ts`。
- 现象：只校验 URL 合法性，不检查代理开关或域名命中。
- 影响：调用方容易误判「已判断是否需要代理」。
- 建议：改名（如 `isValidUrl`）或补全判断逻辑。

### E-07 · P2 · 获取单个源失败时默认启用
- 位置：`frontend/src/services/api/source.ts` 的 `getSourceById`。
- 现象：请求失败返回 `enabled: true`。
- 影响：UI 可能把未知状态显示为已启用。
- 建议：失败返回 `undefined`/抛错，由调用方决定兜底。

### E-08 · P2 · 推荐面板失败完全静默
- 位置：`frontend/src/components/jav/JavRecommendationsPanel.tsx`。
- 现象：`isError` 时直接返回 `null`。
- 影响：推荐失败对用户不可见，也无法重试。
- 建议：展示轻量错误态与重试按钮，与其它面板一致。

### E-09 · P2 · 首页 Logo 丢失查询参数
- 位置：`frontend/src/components/layout/MainLayout.tsx`。
- 现象：Logo 使用 `<a href={window.location.pathname}>`，整页刷新。
- 影响：`/main?tab=jav` 会被刷成 `/main`，丢失当前分类。
- 建议：使用路由 `Link` 并保留必要参数。

### E-10 · P2 · 收藏/历史页的交互与导出问题
- 位置：`frontend/src/pages/dashboard/FavoritesHistoryManager.tsx`。
- 现象：关键词云只 `navigate('/main')` 不带 keyword；导出请求异常未捕获；日期硬编码 `zh-CN`。
- 影响：点击关键词无搜索效果；导出失败无提示；非中文环境显示不一致。
- 建议：跳转携带 keyword 并触发搜索；catch 导出异常；日期使用当前语言。

### E-11 · P2 · 登录页「记住我」无实际作用
- 位置：`frontend/src/pages/auth/LoginPage.tsx`。
- 现象：复选框无 state，也未参与登录请求。
- 影响：用户以为会话会延长，实际无效果。
- 建议：实现对应行为，或移除该控件。

### E-12 · P2 · 帖子详情页的无效样式与硬编码
- 位置：`frontend/src/pages/community/PostDetail.tsx`。
- 现象：存在 `style={{ backgroundColor: ... ? undefined : undefined }}` 恒空表达式；举报弹窗按钮文案硬编码中文；多处 `any`。
- 影响：无效代码与国际化缺口。
- 建议：删除恒空样式；文案走 i18n；逐步收敛 `any`。

### E-13 · P2 · 分类管理搜索范围与渲染结构
- 位置：`frontend/src/pages/dashboard/CategoryManager.tsx`。
- 现象：页面搜索只匹配大类名/描述，不含子分类与源站；Modal 内有一层无意义 IIFE。
- 影响：搜索漏结果；代码可读性差。
- 建议：搜索覆盖子分类与源站；移除 IIFE。

### E-14 · P2 · 关闭源站使用了启用通知文案
- 位置：`frontend/src/pages/dashboard/SourceManager.tsx`。
- 现象：关闭源站/批量关闭仍调用 `notification.source.enabled` / `batchEnabled`，失败统一 `createFailed`。
- 影响：提示文案与操作语义不符。
- 建议：补充关闭/批量关闭的专用文案。

### E-15 · P2 · 种子下载凭证策略与全局不一致
- 位置：`frontend/src/utils/magnet.ts`。
- 现象：下载种子使用 `credentials: 'include'`，全局 `apiClient` 使用 `omit`。
- 影响：跨域场景行为不一致，可能触发 CORS 或凭证泄漏面扩大。
- 建议：确认下载接口是否需要凭证，统一策略。

### E-16 · P2 · 配置缓存键从未写入
- 位置：`frontend/src/services/config.ts` 的 `CONFIG_CACHE_KEY`。
- 现象：只被 `removeItem`，没有 `setItem`。
- 影响：名为持久缓存，实际只存在内存。
- 建议：补齐写入与读取，或删除死键。

### E-17 · P2 · 请求校验与重复实现
- 位置与现象：
  - `frontend/src/services/api/community.ts` 的 `updateTag` 未走 zod，而 `createTag` / `updatePost` 有。
  - `searchApi.updateSourceConfig` 与 `sourceApi.updateUserSourceConfig` 是两个实现，前者无校验。
- 影响：契约容易漂移，错误提示不一致。
- 建议：统一走 zod schema，合并重复实现。

---

## F. 架构、类型与代码清理

### F-01 · P2 · 路由层仍有大量内联 SQL
- 位置：`backend/src/routes/sources.ts`、`user.ts`、`config.ts`、`system.ts`、`feedback.ts`、`notifications.ts`、`follows.ts`，以及 `community.ts` 的标签重命名逻辑。
- 现象：路由内直接 `DB.prepare(...)`。
- 影响：违反 `AGENTS.md` 的分层约定，SQL 难以复用与测试。
- 建议：按主题迁移到 `repositories/*`，路由只保留校验与响应。

### F-02 · P2 · 错误指纹算法重复实现
- 位置：`backend/src/index.ts` 的 `onError` 与 `backend/src/routes/system.ts` 的 `generateErrorFingerprint`。
- 现象：各自维护一份 djb2 逻辑。
- 影响：改一处会导致前后端错误聚合口径不一致。
- 建议：抽到 `utils` 共享。

### F-03 · P2 · 导航数据重复维护
- 位置：`frontend/src/components/layout/AppShell.tsx` 与 `workspaceNav.tsx`。
- 现象：各维护一份同语义导航数据。
- 影响：新增/调整入口容易只改一处。
- 建议：收敛为单一配置源。

### F-04 · P2 · 共享 schema 桶文件双导出
- 位置：`packages/shared/src/schemas/index.ts`。
- 现象：同时存在 `export *` 与分组对象 `schemas`。
- 影响：新增 schema 容易只改一处，导致引用方式不一致。
- 建议：确定唯一出口，另一处改为派生。

### F-05 · P2 · 版本号默认值不一致
- 位置：`backend/src/routes/system.ts`。
- 现象：`/health` 默认 `'1.6.0'`，`/api` 与 `/public-config` 默认 `'1.9.0'`。
- 影响：依赖 health 判断版本的客户端可能误判。
- 建议：统一读取 `APP_VERSION` 或同一常量。

### F-06 · P2 · 类型声明与数据库/实现不符
- 位置与现象：
  - `backend/src/types/index.ts` 的 `SystemErrorRow`：`id: number` 但表为 TEXT；`created_at: string` 但库中为 INTEGER 毫秒。
  - `backend/src/repositories/user-repository.ts` 的 `findUserBasicById` 返回 `Promise<User | null>`，实际只 SELECT 三列。
  - `backend/src/repositories/admin-repository.ts` 多处 `SUM(CASE ...)` 空表返回 NULL，但返回类型声明为 `number`。
- 影响：运行时出现 `null`/`undefined` 透传，类型保护失效。
- 建议：修正类型定义或在 SQL 中用 `COALESCE` 兜底。

### F-07 · P2 · 收藏项 `duration` 类型与使用方式不一致
- 位置：`packages/shared/src/types/search.ts` 的 `FavoriteItem.duration`；使用方 `frontend/src/pages/dashboard/FavoritesHistoryManager.tsx`。
- 现象：类型为 `string`，但页面按数值 `count` 方式插值。
- 影响：展示可能出现 `NaN` 或错误文案。
- 建议：统一字段语义与类型。

### F-08 · P2 · TOP250 保留注释掉的分类
- 位置：`frontend/src/components/jav/JavTop250Panel.tsx` 的 `SECTION_KEYS`。
- 现象：保留 `/* , 'western' */`。
- 影响：恢复入口需同时改同步脚本与 workflow，容易漏改。
- 建议：若确定不再上线则删除；若保留，补充恢复步骤说明。

### F-09 · P2 · 详情面板重复导入同一图标
- 位置：`frontend/src/components/jav/JavDetailPanel.tsx`。
- 现象：同一图标同时以 `ExternalLink` 与 `ExternalLinkIcon` 导入。
- 影响：冗余，易混淆。
- 建议：统一为一个名字。

### F-10 · P2 · 管理看板颜色命名与视觉不符
- 位置：`frontend/src/pages/admin/AdminPanelOverview.tsx`。
- 现象：`colorClasses.blue` 实际是品牌金色渐变。
- 影响：后续按名字选色会误用。
- 建议：改为语义化命名（如 `brand`）。

---

## 通用验证建议

1. 先按分类建立复现用例：安全类用接口请求与数据库检查；数据类用「改配置 → 回查」；并发类用小并发脚本。
2. 每个修复补一条最小回归测试，优先覆盖：OAuth 回调、验证码校验、源配置回查、限流边界、收藏删除匹配。
3. 修复完成后统一跑：
   - `npm run typecheck --workspace=backend` / `--workspace=frontend`
   - `npm run lint --workspace=backend` / `--workspace=frontend`
   - `npm run test --workspace=backend` / `npm run test:run --workspace=frontend`
   - `npm run build --workspace=frontend`
4. 涉及数据库字段/表名变更的修复，必须先确认线上表结构，再按 `database/` 续编号写脚本，由用户手动执行。
