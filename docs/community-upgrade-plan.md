# 社区模块审查与升级方案

> 审查基线：main @ 8266cb0（含 v1.6.0 社区改动）
> 状态：按本方案完成实施，数据库只使用一个终态脚本 `database/20_fix_community_user_stats.sql`。

---

## 0. 结论摘要

1. **统计漂移是确定性的，不是并发问题**：`community_user_stats` 的维护完全依赖 4 个 `AFTER INSERT` 触发器（发帖、收赞、收收藏、发评论），数据库里没有任何 DELETE / UPDATE 侧触发器，应用层也没有任何更新该表的代码。所有"减少"类操作都会永久残留。
2. **历史数据 100% 可重算**：四个计数都能从 `community_posts` / `community_likes` / `community_comments` 精确聚合；`reputation_score`、`contribution_level` 是它的派生值。
3. **修复选择：读时聚合，取消这张物化统计表**（不是"触发器"、不是"定时重算"、也不是"统一写入入口"）。统计是纯派生数据，增量维护天然要求覆盖全部当前和未来的写路径（含级联删除、管理员操作、删号），成本无上界；读时聚合把成本收口到一次按用户索引的 COUNT，问题类别直接消失。
4. **社区模块本身落后于当前架构的地方**集中在：`share_count` / `is_featured` / `reputation_score` / `contribution_level` / `pending` `rejected` 状态 / `community:share` 权限 / `/community/stats` 接口全部是死字段或死接口；举报处理的 `warn_author` 动作没有任何后端效果；社区写接口没有限流。
5. **上线两步**：先发布代码（读时聚合 + 前端刷新），再执行脚本 20。脚本执行后数据库即为终态：无统计触发器、无 `idx_posts_featured`、无 `share_count`/`is_featured`、无 `community_user_stats`。不设观测期，不保留备份表。

---

## 1. 现状盘点

### 1.1 表结构

| 表 | 关键字段 | 说明 |
|---|---|---|
| `community_posts` | `user_id`、`post_type`、`status`、`view_count`、`like_count`、`comment_count`、`favorite_count`、`share_count`、`is_featured`、`tags`(JSON 名称数组)、`content_data`(原始 JSON) | 帖子主表；`status` 无 CHECK 约束 |
| `community_comments` | `post_id`、`user_id` | `post_id` FK `ON DELETE CASCADE` |
| `community_likes` | `post_id`、`user_id`、`like_type`('like'/'favorite') | 点赞与收藏共用一张表 |
| `community_tags` | `tag_name` 唯一、`tag_active` | 帖子只存标签名，不存 tag_id |
| `community_reports` | `post_id`、`status`、`admin_action`(自由字符串) | 后台举报队列 |
| `community_user_stats` | `posts_count`、`likes_received`、`favorites_received`、`comments_count`、`reputation_score`、`contribution_level` | 本次问题表 |
| `community_post_views` | `(user_id, post_id)` 主键、`last_viewed_at` | 24h 浏览量去重 |

### 1.2 计数写入路径（全部证据）

**帖子级计数**（`database/09_indexes_triggers.sql:321-389`）

| 操作 | 触发器 | 结果 |
|---|---|---|
| 新增评论 | `update_post_comment_count_after_insert` | `comment_count + 1` |
| 删除评论 | `update_post_comment_count_after_delete` | `comment_count - 1` |
| 点赞 | `update_post_like_count_after_insert` | `like_count + 1` |
| 取消点赞 | `update_post_like_count_after_delete` | `like_count - 1` |
| 收藏 | `update_post_favorite_count_after_insert` | `favorite_count + 1` |
| 取消收藏 | `update_post_favorite_count_after_delete` | `favorite_count - 1` |

帖子级计数是完整的（增删都有），这部分不是本次问题。

**用户级统计**（`database/09_indexes_triggers.sql:391-476`）

| 操作 | 触发器 | 变更 |
|---|---|---|
| 发帖（`status='active'`） | `update_user_stats_after_post` | `posts_count + 1`、`reputation + 5`、重算等级 |
| 收到点赞 | `update_user_stats_after_like` | `likes_received + 1`、`reputation + 1` |
| 收到收藏 | `update_user_stats_after_favorite` | `favorites_received + 1` |
| 发表评论 | `update_user_stats_after_comment` | `comments_count + 1` |

**再没有别的写入路径。** 唯一看起来像"修正"的函数 `updateUserStatsAfterDelete`（`backend/src/services/source-status.ts:378`）只在 `services/index.ts` 被 re-export，全仓库无调用点，是"搜索源分享"时代的遗留死代码；且它只重算 `posts_count`，用 `INSERT OR REPLACE` 会重写整行。

**读路径**：仅 `GET /api/community/user-stats`（`backend/src/routes/community.ts:1005`）读这张表，前端仅 `MyPostsTab` 的四张统计卡使用（`frontend/src/pages/community/MyPostsTab.tsx:116-124`）。

### 1.3 其它相关写路径

| 场景 | 代码位置 | 对统计的影响 |
|---|---|---|
| 取消点赞 | `routes/community.ts:717-720` → 删 `community_likes` | 触发器只处理帖子计数，用户统计不减 |
| 取消收藏 | `routes/community.ts:758-760` | 同上 |
| 删除评论 | `routes/community.ts:898` | 帖子计数减，用户 `comments_count` 不减 |
| 删除帖子 | `routes/community.ts:639` → `repositories/community-repository.ts:404` 裸 `DELETE` | `posts_count` 不减；该帖收到的赞/收藏永久留在对方统计里 |
| 管理员隐藏帖子 | `routes/community.ts:664`、`admin.ts:716-718`（举报 `remove_source`） | 状态变成 `hidden`，`posts_count`/`reputation` 不变；恢复 `active` 也不会补 |
| 删除账号 | `repositories/user-repository.ts:213-224` | `community_user_stats` 随 users 级联删除；但该用户的点赞/评论消失后，其他作者的 `likes_received`/`comments_count` 不会回退 |

---

## 2. 根因分析

### 2.1 漂移矩阵

| 用户操作 | 受影响字段 | 是否漂移 | 原因 |
|---|---|---|---|
| 取消点赞 | `likes_received`、`reputation_score` | 是（只增） | 无 DELETE 触发器 |
| 取消收藏 | `favorites_received` | 是（只增） | 无 DELETE 触发器 |
| 删除评论 | `comments_count` | 是（只增） | 无 DELETE 触发器 |
| 删除帖子 | `posts_count`、`reputation_score`、等级；该帖所有赞/收藏 | 是（永久偏高） | 无 DELETE 触发器；帖子删后源数据也被级联删掉，无法事后对账 |
| 管理员隐藏/驳回帖子 | `posts_count`、`reputation_score`、等级 | 是（偏高且不会恢复） | 触发器只监听 INSERT，不监听 status 迁移 |
| 帖子被隐藏后再激活 | 同上 | 是（漏加） | 同上 |
| 删除账号 | 其他作者的收赞/评论统计 | 是（偏高） | 该用户的点赞/评论被级联删除，但没有回退逻辑 |

### 2.2 为什么不是并发/事务问题

这些触发器与业务写入在同一条语句的写事务内执行，`+1/-1` 本身是原子的；D1 对单条语句也是串行提交。观测到的漂移是"每次取消操作必错"的确定性偏差，而不是偶发。唯一存在双语句窗口的是浏览量（`recordPostViewIfNeeded` + `incrementPostViewCount`），但它不写 `community_user_stats`。

### 2.3 历史数据可重算性

四个计数都是源表的纯函数，没有任何信息丢失（帖子被硬删的情况除外，那部分只能按"当前存在的数据"重算）：

```sql
-- posts_count
SELECT COUNT(*) FROM community_posts WHERE user_id = ? AND status = 'active';

-- likes_received / favorites_received（口径：当前有效帖子收到的互动）
SELECT l.like_type, COUNT(*)
FROM community_likes l
JOIN community_posts p ON p.id = l.post_id
WHERE p.user_id = ? AND p.status = 'active'
GROUP BY l.like_type;

-- comments_count
SELECT COUNT(*) FROM community_comments WHERE user_id = ?;

-- reputation_score = posts_count * 5 + likes_received（沿用现有公式）
-- contribution_level = f(posts_count)（沿用现有阈值 5/20/50）
```

结论：**不需要"猜历史"，一次全量重算即可对齐；本次采用更彻底的做法——直接弃用该表，改读时聚合，不做重算。**

### 2.4 尚未验证的部分（需要预发验证，不影响根因结论）

1. `community_posts` 被删除时，D1 是否对级联删除的子行继续触发 `community_comments` / `community_likes` 上的 `AFTER DELETE` 触发器。SQLite 对此与 `recursive_triggers` 相关，D1 只承诺"外键约束按 `PRAGMA foreign_keys=on` 执行"（已核对 Cloudflare 文档），未承诺级联触发用户触发器。
   - 影响面：只影响帖子级 `comment_count`/`like_count`（帖子本身已删，通常无所谓），以及**删除账号**时其他帖子的 `comment_count`。
   - 处理：不依赖它。方案 A（读时聚合）让用户统计彻底不依赖级联行为；帖子级计数用第 3.5 节的用例验证，若确实不触发，则在删号/删帖批次里显式先删子表。
2. 线上漂移的具体行数与幅度：不再量化。社区分享数据已清空，直接删除物化表，不存在需要保留或对账的历史值。

---

## 3. 统计一致性修复方案

### 3.1 候选方案对比

| 方案 | 正确性保证 | 覆盖成本 | 性能 | 迁移风险 | 结论 |
|---|---|---|---|---|---|
| A. 补齐触发器（DELETE + UPDATE status） | 依赖 SQLite 级联/触发器细节 | 需要按"删帖后点赞已被级联删掉"的顺序设计 BEFORE/AFTER 组合，且发帖后改状态要成对处理 | 写放大 | 需要 DROP 旧触发器再建，D1 上易踩坑 | 不选 |
| B. 统一写入入口（应用层，每次变更同批更新统计） | 只要不漏调用就正确 | 需要覆盖 6 条现有路径 + 未来所有路径；漏一处就复发 | 写放大 | 中等 | 备选 |
| C. 定时重算（cron 全量刷新） | 最终一致 | 低 | 随用户数线性增长 | 低 | 只做一次性修正/审计，不做主机制 |
| D. **读时聚合（不存派生值）** | **结构上不可能漂移** | **一次改动** | 单用户 3 个 COUNT，走 `(user_id,status)` / `(user_id)` / `(post_id)` 索引 | 低，API 响应结构不变 | **选它** |

**为什么选 D：**

- 统计是派生数据，**唯一事实来源本来就在三张源表里**。存一份可变的副本，等价于把"一致性"变成需要长期维护的契约；而读时聚合把契约变成一条 SQL。
- 触发器方案（A）的死穴是"删帖"：帖子和它的点赞已被级联删除，触发器再想回退 `likes_received` 时源数据已经没了，必须在 `BEFORE DELETE` 里预先扣减，还要避免与子表触发器重复扣减——正确性依赖实现细节，无法用类型检查兜底。
- 统一写入入口（B）的死穴是"未来的人忘记调用"，这正是当前 bug 的成因（旧代码在"搜索源分享"时期有调用，重构后被删掉且没人发现）。把同样的约束换个地方重新依赖一遍，不是根治。
- 定时重算（C）只能做到"每天对一次"，用户当天看到的仍是错的，且会把"统计口径错误"掩盖成"延迟"。
- 当前唯一读取方是单用户自己的 `MyPostsTab`，数据量小、查询有索引，没有做物化的性能理由。

**什么时候该回到 B/C**：出现"社区用户排行榜/按声誉排序"这类需要全站排序展示的需求时。那时应做的是**整表快照重建**（定时全量重算写入一张 `community_user_stats_snapshot`），而不是回到增量维护。

### 3.2 具体改动

**后端**

1. `backend/src/repositories/community-repository.ts`
   - 用 `getUserCommunityStats(db, userId)` 替换 `findUserCommunityStats`：一条 SQL 聚合出四个计数（见 2.3）；不再输出 `reputationScore`/`contributionLevel`（已确认前端零引用）。
2. `backend/src/routes/community.ts:1005-1039`
   - `/user-stats` 改调新函数；响应保留 `postsCount`、`likesReceived`、`favoritesReceived`、`commentsCount`、`recentPosts`，移除 `reputationScore`、`contributionLevel`。
3. 删除 `backend/src/services/source-status.ts:378-428` 的 `updateUserStatsAfterDelete` 及 `services/index.ts` 的导出。
4. 删除 4 个用户统计触发器（脚本见 3.3），避免无人读取的写放大。
5. 帖子级计数保持现有触发器不动（它们增删成对），只做 3.5 的验证。

**前端**

1. `MyPostsTab.tsx:91-101`：删除帖子成功后同时 `fetchUserStats()`，否则即使后端正确，页面上的统计卡仍是旧值（这是用户"删完还不对"的第二个感知来源）。
2. `CommentsSection.tsx:77-86`：删除评论后刷新 `userStats`（若当前页面不展示统计可不做）。
3. 无接口契约变更，不需要改类型。

### 3.3 数据库脚本（接着现有编号）

**`database/20_fix_community_user_stats.sql`**（终态脚本，执行后即完成）

执行内容：

1. `DROP TRIGGER IF EXISTS` 四个统计触发器（post/like/favorite/comment）；
2. `DROP INDEX IF EXISTS idx_posts_featured`（否则 SQLite 不允许删除该列）；
3. `ALTER TABLE community_posts DROP COLUMN share_count` / `DROP COLUMN is_featured`；
4. `DROP TABLE IF EXISTS community_user_stats`；
5. `CREATE INDEX IF NOT EXISTS idx_likes_post_type ON community_likes(post_id, like_type)`，支撑读时聚合。

不做全量重算：统计在读取时从三张源表聚合，物化表没有保留价值；社区分享数据已清空，无需归档；脚本不含 `backup_*` 备份表或导出语句，不可回滚。

**脚本执行**（与现有 deploy 流程一致）：

```powershell
cd backend
npx wrangler d1 execute codeseek --remote --file=../database/20_fix_community_user_stats.sql
```

### 3.4 上线顺序与回滚

| 步骤 | 动作 | 说明 |
|---|---|---|
| 1 | 发布代码（后端读时聚合 + 前端删除后刷新统计） | 代码不再引用被删对象，且对旧/新表结构都兼容 |
| 2 | 执行脚本 20 | 数据库进入终态 |
| 3 | 按 3.5 验收 | 发布后立即验证，无观测期 |

顺序不能反：脚本先执行会让仍在运行旧代码的实例读取已删除的 `community_user_stats`，`/user-stats` 会报错。

回滚：脚本不可回滚。需要恢复旧结构只能依次重建 03/09 中的表、索引、触发器并重新引入统计写入逻辑，不建议。

### 3.5 验收用例

1. 新用户发帖 → 统计 `postsCount=1`；删帖 → `0`。
2. A 发帖，B 点赞后取消 → A 的 `likesReceived` 回到 0。
3. B 收藏后取消 → `favoritesReceived` 回到 0。
4. B 评论后删除评论 → `commentsCount` 回到 0。
5. 管理员隐藏 A 的帖子 → A 的 `postsCount` 按"有效帖子"口径减 1；恢复 `active` 后加回。
6. 删除账号 B（B 曾给 A 点赞/评论）→ A 的 `likesReceived`/`commentsCount` 回退，且 A 帖子上的 `likeCount`/`commentCount` 回退（若第 2.4 节验证发现级联不触发，则需在删号批次里显式删子表）。
7. 直接访问 `/api/community/user-stats` 与 `MyPostsTab` 展示一致。

---

## 4. 社区模块收敛

### 4.1 死字段 / 死接口（有证据）

| 项 | 证据 | 决策 |
|---|---|---|
| `community_posts.share_count` | 全仓库没有 `share_count = share_count + 1`，永远为 0；所有列表/详情接口仍在返回 | 删除字段与响应字段（同一发布内前后端一起改）；"复制链接分享"不需要计数 |
| `is_featured` + `PUT /posts/:id/feature` | 前端全仓库无 `isFeatured` 读取；无后台 UI 调用 | 删除接口与字段，或补后台"精选"入口——**二选一，不要留着** |
| `reputation_score` / `contribution_level` | 前端无任何引用（`reputation|contributionLevel` 零命中） | 若不做等级展示就删；要做则放进 `MyPostsTab` 统计卡，公式随读时聚合一起输出 |
| `status='pending'/'rejected'` | 发帖固定 `active`，全仓库无写入这两个状态；后台只有 `hidden` | 删除状态枚举与 `MyPostsTab` 的筛选/徽章，除非要上"先审后发" |
| `PUT /posts/:id/status` | 前端无调用，仅举报处理内部改 `hidden` | 若保留后台帖子管理则补 UI；否则改为内部函数，不暴露路由 |
| `GET /community/stats` | 前端 `fetchCommunityStats` 定义了但从未调用 | 删除接口 + store action + 类型 |
| `community:share` / `community:review` 权限 | `constants.ts:113`、`database/06_data_system.sql`、`middleware/auth.ts` 三处声明，后端与前端均未校验 | 二选一：在写接口真正校验（推荐，且前端无权限时隐藏/禁用按钮），或从角色权限中移除 |
| `updateUserStatsAfterDelete` | 无调用点 | 删除 |
| `community_reports.admin_action` | 自由字符串；前端只有 `warn_author` / `remove_source`，后端只有 `remove_source` 有副作用 | 改为枚举 `hide_post|warn_author|none`；`warn_author` 要么给作者发通知，要么删掉这个选项 |

### 4.2 行为缺陷

| 问题 | 证据 | 建议 |
|---|---|---|
| 社区写接口无限流 | `routes/community.ts` 无 `checkRateLimitD1` | 发帖/评论按用户限流（如发帖 10/时、评论 30/时），复用 `utils/rate-limit` |
| 举报 `warn_author` 无效果 | `admin.ts:716-718` 只处理 `remove_source` | 要么发 `community.report_warned` 通知，要么移除选项；不要保留"看起来处理了"的假动作 |
| 删帖后通知成为死链 | `notifications.payload.postId` 指向已删帖子，点击进 404 | 删帖批次内 `DELETE FROM notifications WHERE type LIKE 'community.%' AND json_extract(payload,'$.postId') = ?` |
| 评论接口分页但前端只取第一页 | `communityStore.ts:342-355` 不传 page/pageSize，无"加载更多" | 加加载更多，或明确只展示最近 20 条 |
| 详情页相关推荐来自客户端已加载列表 | `PostDetail.tsx:531-539` 直接过滤 `posts` | 直链/刷新时为空；改为独立请求 `/posts?postType=&pageSize=6` |
| 标签以名称存 JSON + 重命名用 REPLACE | `community.ts:237-246`、`community-repository.ts:28` 的 `LIKE` 子查询 | 短期可接受；中期改 `community_post_tags(post_id, tag_id)` 关联表，避免命名冲突与全表 LIKE |
| `content_data` 最大 500KB 且无结构校验 | `validation/index.ts:289` | 按 postType 校验并压缩到必要字段（标题/封面/番号/演员等），降低存储与滥用面 |
| 浏览量记录无清理 | `19_schema_community_post_views.sql`，无 cron 清理 | `0 * * * *` 任务删除 `last_viewed_at < now - 24h` 的行（窗口只有 24h），并加 `last_viewed_at` 索引 |
| 浏览社区必须登录 | `routes/community.ts:64` 全局 `authMiddleware` | 若产品希望游客可浏览，拆成 `optionalAuth`（读公开、写鉴权）；否则在文档中明确 |

### 4.3 与新架构的对齐

- **统一通知**：已对齐。社区 4 类通知走 `emitNotification`，偏好表生效（`notification-service.ts:50-91`），收件箱按类型分组（`NotificationsManager.tsx:21`），点击跳转由 `notificationView.ts` 解析 `postId`。无需再改。
- **关注体系**：目前是"用户关注女优"，社区没有"关注作者"。这不是缺陷，是能力缺口。若要做，应按同一套模型新增 `user_author_follows` + 关注流，并复用统一通知（新类型 `community.new_post`），**不要塞进本次一致性修复**。
- **搜索源/看板**：社区的 `postType` 枚举（jav/anime/movie/manga/novel/actress）与搜索大类是两套 taxonomy，靠人工同步。建议从 `packages/shared` 的搜索类别常量派生，避免新增类别时社区漏项。
- **管理后台**：社区举报已有后台 Tab，但社区帖子本身没有管理入口（隐藏只能通过举报触发），与"源看板"式的运维能力不匹配。建议补"帖子管理"（列表/搜索/隐藏/删除），或至少把 `/posts/:id/status` 接到后台。

### 4.4 结构性建议

- 路由 `routes/community.ts` 目前 1044 行，承担了标签、帖子、互动、评论、举报、统计；SQL 已收口到 repository，但业务分支仍厚。建议按 `community/posts`、`community/interactions`、`community/tags` 拆文件，路由只做鉴权、校验、限流、响应。
- 前端 `CommunityManager` 用 4 个并列 Tab + 路由别名 `my-shares`（旧"分享"语义），建议在收敛阶段把路径改为 `/community/my-posts` 并保留 301 式前端重定向。

---

## 5. 改动范围与影响面

| 层 | 文件 | 改动性质 | 影响 |
|---|---|---|---|
| DB | 新增 `database/20_fix_community_user_stats.sql` | 删 4 个触发器、`idx_posts_featured`、`share_count`/`is_featured`、`community_user_stats`，补 `idx_likes_post_type` | 不可回滚；须先发布代码再执行 |
| 后端 | `repositories/community-repository.ts`、`routes/community.ts`、`services/source-status.ts`、`services/index.ts` | 读路径替换 + 删死代码 | `/user-stats` 响应不变 |
| 后端（收敛阶段） | `routes/community.ts`、`validation/index.ts`、`repositories/community-repository.ts`、`routes/admin.ts` | 删死接口/字段、限流、举报动作语义化 | 会改 API 契约，必须与前端同发布 |
| 前端 | `MyPostsTab.tsx`、`communityStore.ts`、`services/api/community.ts`、`types/community.ts`、`ReportsTab.tsx` | 统计刷新、删死字段、举报动作选项 | 低 |
| 文档 | `docs/config.md` / `CHANGELOG.md` | 记录脚本 20 与接口变更 | 低 |

**不受影响**：收藏/关注分享到社区的入口（`ShareToCommunityButton`、`FavoriteShareButton`、`FollowWorkShareButton` → `ShareToCommunityModal`）只依赖 `createPost`，字段未变；统一通知链路不变。

---

## 6. 风险

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| D1 级联删除不触发子表触发器 | 删帖/删号 | 不依赖它做用户统计；帖子级计数用第 3.5 节用例验证，必要时显式删子表 |
| 读时聚合放大查询 | 单用户帖子/互动极多 | `(user_id,status)`、`(user_id)`、新增 `(post_id,like_type)` 索引；`/user-stats` 与 `recentPosts` 并行查询 |
| 删除 `share_count`/`is_featured` 造成前端类型/渲染报错 | 前后端未同发布 | 同一 PR 改后端 + `types/community.ts` + 所有 `post.shareCount` 引用；先 `tsc` 全量通过 |
| 统计口径变化（隐藏帖是否计入） | 产品预期不一致 | 明确口径："只算当前 active 帖子"；在 `user-stats` 注释与文档写死 |
| 脚本 20 不可回滚 | 执行即终态 | 已确认社区分享数据清空；先发代码再执行；执行前确认没有旧版本实例在读 `community_user_stats` |
| 权限校验上线后部分用户无法发帖 | 角色权限配置缺失 | 先补数据迁移（给默认 user 角色加 `community:share`，当前已有），再上线校验 |

---

## 7. 明确不做（本轮边界）

1. 不新增"关注作者/作者主页/关注流"——这是新产品能力，不是本次一致性修复。
2. 不把标签改成关联表（只在文档中标记为中期技术债）。
3. 不改 `post_type` 枚举与搜索大类的耦合（除非同时改共享常量）。
4. 不做社区内容全文检索或推荐算法。
5. 不动统一通知的存储与偏好模型。
