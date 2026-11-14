# Changelog

All notable changes to this project will be documented in this file.

## [v1.8.0] - 2026-11-14

本次版本覆盖 v1.7.0 以来的全部变更，核心变化：搜索接入跨语言别名解析，中文 / 日文 / 英文 / 罗马音标题可指向同一作品；关注对象从女优扩展到导演、制作商、发行商、系列与标签，并支持筛选与关键词搜索；JAV 详情卡与历史 / 收藏条目接入本地库详情卡与实体作品浏览；管理端补齐数据存储的重试、单条补全与失败筛选；同时治理生产 D1 读放大。

### 新增

- **跨语言查询解析**：新增 `entity_aliases` 别名表（`database/32_schema_entity_aliases.sql`），按 `alias_key` 查询同一实体的中/日/英/罗马音写法；新增 `query-normalizer`（NFKC、大小写、OpenCC、假名罗马音、拼音）与 `source-language` 源站语言能力注册表
- **搜索源按语言挑词**：`toSourceCards` 按源站索引语言生成查询词（如 JavBus 用日文艺名、TPB 用英文小写），未收录的源保持原文透传
- **别名灌入**：TMDB 各地区片名、Bangumi、MangaDex、Wikipedia langlinks、Wikidata labels/aliases 可写入别名表；新增管理端 `POST /api/admin/aliases/ingest`、`POST /api/admin/aliases/suggest`
- **AI 候选旁路**：Workers AI（`@cf/meta/m2m100-1.2b`）生成候选，经 Wikidata 校验后才以 `source=ai`、`confidence=0.5` 入库；默认关闭（`ENABLE_ALIAS_AI=0`）
- **关注对象扩展**：导演、制作商、发行商、系列与标签均可关注，关注 key 统一为「类型:JavBus 路径」；`database/33_follow_entity_targets.sql` 通过视图与索引复用既有女优关注表；实体卡片、个人中心关注管理与热门女优榜口径同步更新
- **关注动态筛选与搜索**：主页与个人中心共用 `FollowFeedToolbar`，按关注对象类型分组筛选；新增 `/api/follows/search` 跨全部关注对象匹配番号、标题、标签与对象名称
- **JAV 实体作品浏览**：详情解析保留导演 / 制作商 / 发行商 / 系列 / 标签链接，新增 `/api/jav/entity` 与 `/api/jav/entity/resolve`（路径校验、限流、边缘缓存）；点击实体查看作品列表，结果统一回写本地库
- **本地库详情卡片**：新增只读接口 `/api/library/record`，搜索历史与收藏条目点击后按本地库数据渲染详情卡，查不到时提供去搜索入口
- **全站封面放大**：`ProxyImage` 支持点击与键盘放大、Esc / 关闭按钮关闭，媒体卡片、榜单、实体作品、数据存储、社区帖子与分享预览统一接入
- **PWA 连续更新**：点击「立即更新」后，若刷新后仍有待更新版本会自动继续，单轮最多 5 次、2 分钟窗口、版本不变即停止；未点击更新不会自动刷新
- **管理端数据存储操作**：新增「暂时失败」筛选与「重试暂时失败」、单条补详情、重置源站缺失次数、是否还会重试筛选；批次大小统一为每分钟 5 条（`database/35_jav_detail_job_batch_size_5.sql`）
- **磁力误判恢复**：`database/34_recover_misjudged_magnet_missing.sql` 重置带缺磁力标记记录的重试计数，存量重新进入自动补全，同时保留缺失掩码便于筛选
- **数据库迁移**：新增 `32`–`36`，覆盖别名表、关注实体扩展、磁力误判恢复、补全批次归一与第二轮查询性能索引
- **客户端壳**：新增 `desktop/`（Electron）与 `mobile/`（Capacitor）两个壳，远程加载站点；应用内跳过门户首页，未登录直达登录页；`sw.js` 增加图片代理缓存与离线登录态快照，断网仍可查看已缓存的收藏与搜索历史
- **客户端签名与版本自动化**：Android 版本号由根 `package.json` 注入（`versionCode` 按主次修订推导），提供本地密钥生成脚本与 CI 签名配置；Windows 打包前校验版本一致性并支持 `CSC_LINK` 签名，详见 [app-packaging.md](./app-packaging.md)
- **首屏启动占位**：`index.html` 内置指南针动画与进度条，React 挂载前不再黑屏或白闪；跟随明暗主题并尊重 `prefers-reduced-motion`
- **发版出包手动化**：`Build Android APK` 改为仅在 Actions 手动触发，可指定 `release_tag` 与是否上传；标签与根版本不符或产物未签名时拒绝上传

### 变更

- 影视搜索：TMDB 不可用或别名命中时，TPB 关键词可由本地别名表补充；TMDB 命中后异步灌入 alternative titles
- 动漫 / 漫画：命中结果后异步灌入 Bangumi / MangaDex 多语言标题（仅在别名覆盖不足时触发）
- JAV 女优：搜索前先查 person 别名表，未命中再回退人工映射表 + OpenCC
- `SearchContext` 新增 `waitUntil`，Provider 可提交不阻塞响应的后台任务
- 影视 / 动漫 / 漫画 / 小说四类搜索统一 `errorKinds`（超时 / 限流 / 源不可用），源卡片映射到真实抓取器，关源后对应抓取器真正跳过
- 动漫订阅源由 ShowRSS 改为 DMHY RSS；AnimeTosho 改为解析搜索页；奇书网接入新域名 `qishuxia.com`；漫画新增 MangaUpdates 作为第二元数据源；小说源站详情与 TXT 下载拆分为独立操作
- 影视聚合视图：主作品无匹配资源但总资源大于 0 时默认切到分源视图
- 磁力失败错误码改为 `MAGNET_FETCH_FAILED`，前端兼容历史中文文案
- 详情卡片抽取 `JavDetailShared`，标签改为与导演 / 制作商 / 发行商 / 系列一致的样式，演员保留红底红字并新增下划线
- 30 天重试增加单日上限 60 条，超出自动顺延一天；自动重试由每小时 `:05` 的榜单补全任务执行
- 前端不再硬编码补全批次大小，统一由后端默认值控制
- 版本号统一升级到 `1.8.0`（根与各 workspace 包、`APP_VERSION`、前端版本常量、README 徽章与相关文档）

### 修复

- TPB 查询词清洗：剥离 TMDB 片名中的厂牌营销前缀（`Marvel Studios' Iron Man` → `Iron Man`）、维基消歧后缀（`Up (2009 film)` → `Up`）与书名号包裹，避免按词匹配的源站返回 0 条；TMDB 别名灌入时同步清洗
- TPB / EZTV 部分请求失败不再误报整源错误：只要有一个关键词或剧集查询成功，就保留已返回资源，不显示「请求失败」
- 影视 / 动漫聚合视图：主作品没有匹配资源、但其他作品有资源时，默认切到「分源视图」展示全部资源，避免用户误以为资源被丢弃（「未匹配资源」只包含没有归到任何作品的资源）
- **榜单导入**：改为纯新增，不再覆盖已有记录，避免 JavBus 补全过的封面被改回 JavDB 旧链接；按番号预查分批（50 个 key）执行，修复 D1 绑定变量超限导致的导入 500
- **磁力判定**：区分真实磁力链接、明确「暂无磁力」提示与旧版脚本，源站合法空结果不再被写成磁力接口不可用；被拦截 / 验证页 / 未解压响应只计入临时失败
- **账号与契约**：删号不再要求密码并移除硬编码中文确认文案，英语 / 繁中环境可正常删号；社区封面允许空串；配置导入将数字 / 布尔值归一化为字符串；`RegisterRequest.verificationCode` 改为必填
- **收藏与搜索**：搜索结果无 URL 时在入口拦截并提示，不再用空串请求收藏接口
- **界面**：手机端想看按钮不再撑高收藏行；平板宽度下关注动态筛选条不再溢出
- **文案**：修正别名管理页面的 i18n 命名空间；历史 / 收藏详情卡的磁力数量改为带计数的三语文案

### 优化

- **D1 读放大治理**：管理面板轮询改用 `scope=progress` 轻量接口（15s），仅在打开页面 / 任务结束时取完整视图；`getJavDetailStats` 合并为单趟 `SUM(CASE)`；`/stats` 与榜单快照按全局 key 缓存 300s；失败列表改为子查询先取 20 条再回表；榜单取数改为 `IN` 子查询驱动；新增 `database/36_query_perf_indexes_phase2.sql`
- **查询索引**：`jav_detail_meta(updated_at/next_retry_at)`、`data_record_sources(source_type/source_url)`、`user_search_history(user_id,source)`、`data_records(first_seen_at)`、`data_records(record_type,title)`
- **CI**：`javdb-cli` 改用 fork 版本并钉死 v0.8.2 commit SHA
- **构建**：后端补充 `@codeseek/shared` 的 tsconfig paths，链接失效时仍可完成类型检查
- **文档**：README、CHANGELOG、`docs/config.md`、`docs/deploy.md`、`docs/github_push.md` 校准到 v1.8.0；部署文档的数据库初始化改为按文件名顺序执行全部脚本，并补齐 `21`–`36` 的说明

## [v1.7.0] - 2026-11-11

本次版本覆盖 v1.6.0 以来的全部变更，核心变化：JAV 搜索接入本地库优先与 JavBus 外部源回源；新增 JAV 推荐标签与标签作品；数据存储与 JAV 详情补全形成闭环；新增 PWA 与移动端底部导航；部署收敛为单一 Worker（前端静态资源同源托管）；帮助中心与文档补齐用量限速说明。

### 新增

- **JAV 本地库优先**：番号搜索先查 `data_records`，命中且磁力非空时直接返回本地库数据（`detail.fromLibrary=true`），未命中再回源 JavBus；本地库结果不重复落库、不写搜索缓存，避免回源后仍命中旧快照
- **JavBus 外部源回源**：详情卡新增「外部源」按钮（`GET /api/jav/detail?code=...&refresh=1`），跳过 1 小时详情缓存强制回源，同步写回本地库（记录、磁力、完成度）并覆盖详情缓存
- **JAV 推荐标签**：`/api/jav/genre-recommendations` 按收藏 / 搜索画像推荐标签（收藏权重 0.7、历史权重 0.3，最多 10 个）；`/api/jav/genre-works` 按标签浏览作品（每页 12 条、最多 30 页、1 小时缓存）；JavBus 标签词典每周同步；新增 `database/21_schema_jav_genres.sql`
- **JAV 详情补全任务**：后台可手动启动批量补全（默认每批 10 条、批内间隔 4 秒，由每分钟 cron 推进），支持按缺少导演 / 制作商 / 发行商 / 磁力筛选；任务状态持久化在 `detail_fetch_jobs`，支持暂停、恢复、停止；源站缺失累计 3 次后不再重试；新增 `database/26_jav_detail_meta.sql`、`29` / `30` / `31` 迁移
- **数据存储管理增强**：搜索结果异步去重落库；后台按类型查看统计、明细、来源与隐藏 / 删除记录；JAV 详情补齐导演、制作商、系列等元数据
- **收藏栏分享到社区**：主页收藏栏竖排操作列新增「分享到社区」（打开 / 分享 / 删除），目前仅 JAV 作品可分享
- **收藏分享从本地库补全信息**：收藏表不存磁力等详情，点击分享时先读本地库（只读接口 `GET /api/jav/library/:code`，不访问外部站点）取回磁力（最多 20 条）、导演、制作商、系列等，再与收藏字段合并；本地库没有时按收藏信息分享并提示
- **关注动态分享**：主页与控制台「关注动态」每条作品增加分享按钮（分享精简信息：番号、标题、封面、发售日、女优）
- **PWA**：新增 `manifest.json`、Service Worker、安装横幅与版本更新提示，支持添加到主屏幕与更新确认
- **移动端导航**：新增底部 Tab（首页 / 社区 / 控制台 / 我的）与「我的」聚合页
- **源站收录面板**：搜索源访问改为卡片式 SourceBoard，支持全部 / 我的 / 已启用 / 可搜索范围筛选、健康检测、启停与来源详情
- **JAV 在线播放**：详情页聚合 MissAV / Jable 播放入口
- **定时任务锁与数据保留**：新增 `cron_locks` 租约锁，上一轮未结束时本轮跳过；每小时分批清理 `rate_limits`、30 天前 `post_views`、半年未补全且无来源的 `data_records`；新增 `database/22` / `25` 迁移
- **数据库迁移**：新增 `20` 至 `31` 共 12 个迁移（社区统计修复、JAV 标签、数据保留索引、遗留权限清理、复合索引、cron 锁、详情元数据、查询性能、详情任务开关 / 间隔 / 缺失筛选）

### 变更

- **部署架构**：前端静态资源并入 Worker `atlas`（`[assets]` + SPA 回退 + `/api` 优先走 Worker），前后端同源，不再单独托管前端；部署迁移到 Cloudflare Workers Builds，GitHub Actions 仅保留手动应急入口
- **搜索**：缓存键纳入子模式、用户与禁用源；搜索历史增强字段由 Provider 提取；本地库命中跳过缓存写入
- **通知与邮件**：邮件摘要合并发送由每 15 分钟改为每 30 分钟，与关注检测共用 `*/30` 触发器；新增每分钟 cron 推进 JAV 详情补全，最终为 3 个触发器（每小时 :05、每 30 分钟、每分钟）
- **关注**：女优收藏并入关注（`database/15` 迁移），热门女优改为「榜单上榜作品数 × 5 + 被关注人数 × 2」排序
- **权限**：删除遗留权限表与细粒度权限（`database/23` 迁移），仅保留 admin / super_admin 判定
- **全站命名**：UI、文案、导航与三语文案中的「JAV番号搜索」统一为「JAV搜索」
- **按钮可读性**：全站图标按钮统一为「图标 + 文字」或补齐 `aria-label` / `title`；JAV 详情卡的收藏与「外部源」在手机、平板、桌面均显示文字
- **帮助中心**：新增「用量、限速与配额」章节（搜索四档配额、社区写入、注册 IP 限制、数据上限），补充本地库优先 / 外部源回源、验证码有效期与重发间隔
- **版本号**：统一升级到 `1.7.0`（根与各 workspace 包、`APP_VERSION`、前端版本常量、README 徽章与相关文档）

### 修复

- **社区统计**：修复用户统计字段漂移（`database/20`）
- **详情任务**：修正任务开关、执行间隔与缺失字段筛选语义（`database/29` / `30` / `31`）
- **限流一致性**：档位配额与页面提示保持一致，超限统一返回 429 并按需带 `Retry-After`
- **数据一致性**：磁力只写 `data_record_sources`，`content_data` 不再重复存储；详情与来源去重

### 优化

- **D1 读放大**：新增复合索引（`database/24` / `28`），定时任务减少无效读（`database/27`），详情任务按字段筛选
- **缓存**：榜单、推荐标签、详情分别设置 TTL；详情回源后覆盖缓存
- **前端**：移动端底部导航、面板懒加载、PWA 更新提示、按钮文字与响应式断点统一
- **文档**：README、CHANGELOG、`docs/config.md`、`docs/deploy.md` 全面校准到 v1.7.0，限流表补齐社区写操作与管理端豁免

## [v1.6.0] - 2026-11-08

本次版本覆盖 v1.5.0 以来的全部功能与审计修复，核心变化：新增帮助中心与统一通知收件箱；邮箱验证/邮件通知/后台邮件运维形成完整闭环；社区帖子浏览量按 24 小时去重；前端与共享包改为 TS paths + Vite alias 解析；数据库迁移扩展到 `17` / `18` / `19`。

### 新增

- **帮助中心 `/help`**：覆盖快速上手、为你推荐、JAV榜单、热门女优、搜索基础与各 Tab 差异、五类搜索、详情页、社区、关注女优、通知与邮件、账号安全、通用注意事项与 FAQ；每类统一为「功能介绍 + 使用步骤 + 注意事项」，并新增独立的通用注意事项章节
- **统一通知收件箱**：`notifications` 表（`(user_id, dedup_key)` 唯一，重复触发幂等）+ 按类型偏好表；`/api/notifications` 提供收件箱分页、未读数、标记已读、删除、偏好读写；顶栏通知铃铛的未读数随 `sync-state` 返回，不增加首屏请求
- **站点公告并入收件箱**：公告不复制进 `notifications`，读取时与站内公告合并，仅用 `user_announcement_reads` 记录每个用户的已读/删除状态；新增 `database/17_schema_announcement_reads.sql`
- **关注女优**：`/api/follows`（关注上限 100，名字精确匹配才允许关注）；`actress_watch` 全局一份，多人关注同一位只检查一次；关注时立即建立基线，首次检查不产生通知
- **新作检测**：新增 `*/30 * * * *` 触发器，每轮最多检查 20 位，按番号集合对比，失败指数退避；新作通知按每人每轮每位女优合并为一条
- **关注动态与关注管理**：主页「关注动态」面板（新作 / 即将发售、服务端分页、未读标记）；控制台新增我的关注、关注动态、通知三个页面；热门女优与搜索结果、影片详情演员旁均可直接关注
- **邮件通知渠道**：新作与社区互动通知可选邮件；通知进入 `email_queue`，每 30 分钟的任务（与关注检测共用 `*/30` 触发器，合计 ≤35 次子请求）按用户合并发送（最早一条攒够 10 分钟、每人每天最多 3 封、全站每天最多 90 封）；失败按 30 分钟 × 2ⁿ 退避，连续 5 次放弃该批；发送前复核邮箱验证与偏好
- **邮箱验证补入口**：通知偏好页可直接发送并校验邮箱验证码，无需跳转到账号设置
- **邮件隐私与退订**：邮件主题保持中性、不含封面；支持「隐藏邮件详情」；每封通知邮件带 HMAC 签名的一键退订链接与 `List-Unsubscribe` 头，GET 仅展示确认页，POST 才执行
- **后台邮件日志与队列**：`email_send_logs` 记录类型、状态、用户、IP、限流键与错误信息；`email_queue` 可按 pending / sent / skipped / failed 查看摘要任务；后台新增对应管理页与接口 `GET /api/config/email/logs`、`GET /api/config/email/queue`
- **公告邮件**：发布公告时入队邮件，删除公告时清理待发送任务；用户之后开启公告邮件时，将最近 7 天内最多 20 条有效公告补发入队（按用户去重）
- **社区帖子浏览去重**：同一用户对同一帖子 24 小时内只计一次 `view_count`，作者本人访问不计数；新增 `database/19_schema_community_post_views.sql`
- **邮件相关迁移**：新增 `database/16_email_notifications.sql`（`email_send_logs` / `email_queue` / 退订令牌 / 通知偏好）
- **历史通知补写**：新增 `database/18_backfill_community_notifications.sql`，把历史社区互动补写为通知

### 修改

- **社区通知 Tab 下线**：社区页不再有独立通知 Tab，原 `/api/community/notifications` 等旧接口删除；点赞、评论、收藏、举报处理结果统一进入 `/dashboard/notifications`
- **女优收藏并入关注**：搜索结果与详情页不再提供女优收藏爱心，只保留「+ 关注」；后端拒绝新的 `actress:` 收藏并返回 `USE_FOLLOW`；`database/15_migrate_actress_favorites_to_follows.sql` 负责迁移存量数据
- **热门女优与推荐口径调整**：热门女优得分改为「四个榜单上榜作品数 × 5 + 被关注人数 × 2」；为你推荐只使用标签 + 发行商（4:1），女优收藏不再计入画像
- **统一邮件发送器**：事务邮件（验证码 / 找回密码 / 改邮箱 / 反馈回复）与通知邮件走同一发送器；事务邮件不受通知偏好和退订控制
- **共享包解析方式**：前端不再依赖 `node_modules` 软链接，改为 `frontend/tsconfig.json` 的 `paths` + `frontend/vite.config.ts` 的 `alias` 直接指向 `packages/shared/src`；后端仍由 npm workspaces 链接 + 包 `exports` 解析
- **全站命名统一**：所有 UI、文案、导航、帮助中心与三语文案中的「JAV番号搜索」统一改为「JAV搜索」
- **榜单与缓存**：榜单增加名次变化（↑ / ↓ / NEW），后端榜单与女优缓存调整为 6 小时
- **收藏与历史**：改为服务端分页并返回总数，控制台统计改为服务端聚合；新增 `sync-state` 跨设备缓存校验
- **公告读取方式**：公告由「复制进通知表」改为「读取时合并」，避免公告更新后收件箱内容不一致
- **数据库迁移顺序**：全新库需按 `01 → 19` 执行；`08` / `12` 修复幂等性，`17` / `18` / `19` 为 v1.6.0 新增
- **版本号**：统一升级到 `1.6.0`（根与各 workspace 包、`APP_VERSION`、前后端版本常量、README 徽章、文档）

### 修复

- **登录失败锁定**：`security_lockouts` 写入补全 `identifier_hash`，统一使用 `hashToken` 生成，所有查询/清理路径按该字段匹配，避免 NOT NULL 约束异常被吞导致锁定失效
- **迁移脚本幂等性**：`08` 不再引用不存在的表/列，`12` 不再重复加列，`10` 修复依赖顺序；全新库与已升级库均可安全重复执行
- **用户配置越权**：`/user-configs/:userId`、`/export-user-configs/:userId` 校验请求者是资源所有者或管理员，复用 `/with-user-config` 的权限判断
- **社区异常吞没**：发帖 / 更新 / 删除不再吞异常，失败时向上抛出真实错误，避免前端假成功导致数据丢失
- **搜索竞态**：搜索请求增加 requestId/序号，仅接受最后一次请求的响应
- **401 刷新**：收到 401 时先尝试一次单飞 token 刷新，失败后再登出，避免并发请求重复刷新
- **导出鉴权**：CSV / OPML 导出改用带鉴权请求，后端错误 JSON 不再被写入导出文件
- **邮件验证码**：统一按 `email_hash + code_hash` 匹配、写入 `max_attempts`、先校验状态再比对、超限提示与实际逻辑一致；失败计数统一由 `verifyCodeWithAttempts` 处理
- **公开接口敏感配置**：所有公开接口过滤 `is_sensitive=1` 或未标记为公开的配置项
- **公告删除**：同步清理关联的待发送邮件队列，避免无效任务堆积
- **局部更新与 NOT NULL 字段**：局部更新使用动态 SET，INSERT/REPLACE 补全全部 NOT NULL 字段，避免意外清空或静默写入失败
- **权限一致性**：标签、源、帖子、配置等资源的写操作统一在执行前校验权限
- **计数与清理任务**：补齐计数、统计与定时清理的调用方，避免死代码和永久堆积数据
- **前端审计项**：i18n 首次访问语言检测、管理端分页边界、重复请求与缓存失效等问题一并修复
- **数据库迁移**：`INSERT OR IGNORE` / 条件冲突更新替代无条件覆盖，避免级联操作清空用户自定义数据

### 优化

- **首屏与请求**：收藏 / 历史服务端分页、屏幕外面板懒加载、跨设备缓存校验，减少无效请求
- **缓存**：推荐画像 5 分钟、热度信号 1 小时、榜单与女优 6 小时，降低上游抓取压力
- **搜索**：档位配额与提示保持一致，搜索缓存键按用户隔离
- **邮件**：摘要合并、每日上限、退避重试与补发去重，降低 Resend 额度消耗与重复打扰
- **通知**：`(user_id, dedup_key)` 保证重复触发幂等；公告读时合并减少冗余写入
- **社区浏览**：24 小时去重表 + `(user_id, post_id)` 主键 upsert，避免高频刷浏览量
- **文档与部署**：README 与 `docs/` 全面校准到 v1.6.0，部署文档支持全新库一次跑通；新增本 CHANGELOG 章节
- **CI**：后端部署工作流固定 Node 20 + npm 缓存，类型检查与 lint 通过后才发布

## [v1.5.0] - 2026-11-04

### Added - 一体化工作台 + 三语国际化 + 榜单与推荐体系 🚀

本次版本跨度 50 次提交，核心变化：主页面重构为一体化工作台；前端完成 zh-CN / zh-TW / en 三语国际化；JAV 榜单升级为 JavDB 周榜 / 月榜并接入热点推荐；搜索限流改为账号活跃度阶梯配额；后端完成 repository 分层与统一 zod 校验；小说搜索切换为多源跳转；管理后台新增用户活跃度排行。

---

#### 核心新功能（一）：一体化搜索工作台

- **主页面重构**：搜索、快捷入口、公告与结果区域整合为单一工作台（`Workbench` + `SearchDock` + `SearchWorkspace`），统一五类搜索结果的页面骨架
- **统一结果组件**：新增 `MediaCard` / `ResourceRow` / `GroupedSection` / `Pagination` / `Toolbar` 等工作台组件，类别结果共享同一套布局与交互
- **常驻配额展示**：搜索页常驻展示当前档位与剩余配额，并说明晋升规则
- **认证跳转**：登录 / 注册成功后统一进入主搜索页，不再跳转看板

#### 核心新功能（二）：三语国际化（i18n）

- **全量文案提取**：前端硬编码中文迁移到 i18n，覆盖 auth / home / layout / search / jav / feedback / community / dashboard / admin / ui 等 18 个命名空间、约 800+ key
- **三语支持**：zh-CN、zh-TW、en 完整词条；首次访问按浏览器语言自动选择，用户手动选择持久化
- **组件与接口**：新增 `LanguageSwitcher` 与 `languageStore`；非组件环境统一走 `i18next.t()`
- **补齐遗漏**：搜索命名空间 65 个缺失 key、设置 / 公告 / 趋势 / 帖子详情等残余硬编码文案全部补齐

#### 核心新功能（三）：JAV 榜单升级（JavDB 周榜 / 月榜）

- **四通道导入**：JavDB 有码 / 无码 × 周榜 / 月榜；GitHub Actions 每日抓取并导入
- **历史保留**：榜单作品与来源不删除，当前榜单只展示每个周期最新 `fetchedAt` 快照
- **每小时补全**：最多 20 条 / 小时通过 JavBus 抓取演员、标签、发行商；失败 3 次后停止重试但保留活跃
- **导入接口**：新增内部密钥保护的 `/api/internal/rankings/import`，榜单写入 `data_records` 占位与 `data_record_sources` 名次
- **探测与容错**：新增 JavDB 榜单探测 workflow；CI 导入补充浏览器请求头并识别 Cloudflare 403
- **封面**：榜单封面 CDN `tp.spfcas.com` 加入图片代理白名单

#### 核心新功能（四）：热门女优榜与智能推荐

- **热门女优榜**：站内近 30 天收藏 / 搜索热度 + 周榜 / 月榜上榜作品聚合，移除 JavBus 随机女优列表
- **为你推荐**：12 个推荐位，top 5 标签各 2 位、top 2 演员各 3 位，名额不足从高分候选随机补位
- **相关推荐**：8 个推荐位（演员 4 + 标签 4），标签桶随机轮转，每个标签最多 1 位；展示在多源聚合结果之前
- **随机与缓存**：推荐接口 `Cache-Control: no-store`，前端请求加时间戳，每次刷新重新随机
- **标签过滤**：高画质 / 蓝光 / 字幕 / 单体 / 有码无码 / DMM·FANZA 独家等技术与发行标签不参与匹配
- **降级修复**：修复推荐结果固定不变、演员配比错误、标签数量不足等问题

#### 核心新功能（五）：搜索限流档位化

- **数据库**：`12_schema_search_tier.sql` 新增搜索限流档位字段，`13_backfill_search_tier.sql` 回填存量用户
- **阶梯配额**：按账号活跃度动态分配搜索配额，替代固定限流
- **晋升规则**：近 30 天内活跃 5 天即可晋升，前端展示当前档位与配额
- **注册防护**：注册接口按出口 IP 多级限流（5 / 分、10 / 时、20 / 天），超限 429 并写入安全事件；GitHub / Google OAuth 仅自动注册分支共用配额；IPv6 按 /64 聚合，`CF-Connecting-IP` 优先

#### 核心新功能（六）：小说搜索多源化

- **知轩藏书接入**：新增 `zxcs.zip` 明文 HTML 直链源，置顶顺序调整为 zxcs → 奇书网 → Anna's Archive
- **Anna 改为跳转**：Anna's Archive 人机验证无法稳定抓取，移除 `NovelItem` 抓取，保留为跳转卡片
- **多源跳转卡片**：新增 Z-Library / Anna / 知轩藏书 / 奇书网 / SoBooks / Lunarora / PDFs.top / 读书派 8 个跳转源
- **结果面板**：小说搜索复用数据库驱动多源卡片，独立展示

#### 核心新功能（七）：管理后台

- **用户活跃度排行**：新增 `/admin-panel/activity-ranking`，支持今日 / 7 天 / 30 天 / 全部；加权分数（搜索 ×2、收藏 ×3、登录 ×1、其他 ×1），今日按北京时间自然日
- **社区统计修复**：修正统计字段别名与用户详情重复计数

### Improved - 架构与性能 ⚡

- **SearchProvider 契约扩展**：`SearchOptions` → `SearchContext`（db / user / categoryId / subMode / enabledSources），新增 `injectsUserSources` 与 `buildHistoryEnrichment`；JAV 三子模式与 Novel 多源注入下沉 Provider，`search.ts` 由 761 行降至约 400 行，路由零内联 SQL
- **Repository 分层**：新增 `search-source` / `search-history` / `user` / `email-verification` / `community` / `admin` / `recommendation` repository，统一 SQL 查询
- **鉴权性能**：`authMiddleware` 单次 LEFT JOIN 加载 session + role + permissions，每请求 D1 查库由 2~3 次降为 1 次；`admin` / `superAdmin` / `permission` 中间件改读上下文
- **统一校验**：请求体统一为 zod `validateBody`，注册强制邮箱验证码；邮箱变更与注册使用同一套长度 / 规范化 / 可信域规则
- **用户态缓存**：JAV / Novel 搜索缓存键按用户隔离，缓存命中仍补写搜索历史
- **React Query 收敛**：收藏、搜索历史、搜索源、分类、分析页数据域统一到 react-query，删除双轨 hooks
- **番号识别**：新增前后端共享 `jav-code` 宽识别解析器，非标准番号自动回退标题 / 多源搜索；搜索建议兼容带 / 不带横杠写法

### Fixed - 问题修复 🔧

- **女优数据源**：minnano-av 上线反爬导致资料恒空，切换 JavBus `/searchstar` + `/star`；资料源失败与未匹配分开展示，不再静默留白
- **女优跳转代理**：女优面板、作品区、详情链接统一遵守用户网址跳转代理配置
- **JAV 详情重试**：详情获取失败支持卡片内重试，无需重新搜索
- **收藏标题**：收藏标题长度上限由 100 提升至 300
- **榜单补全**：补全改为全量使用 JavBus 字段，仅缺失时回退原值
- **榜单导入**：补充浏览器 UA / Accept 头并识别 Cloudflare 403
- **注册校验**：验证码校验收口为无条件执行，移除路由内可选死分支

### Changed - 行为变更 ⚠️

- **Anna's Archive**：从抓取源改为跳转源，小说结果结构改为多源卡片
- **推荐缓存**：推荐结果不再缓存，每次请求实时随机
- **榜单展示**：周榜 / 月榜仅展示最新快照，历史作品保留但不在当前榜单出现
- **版本号**：全项目版本号统一为 `1.5.0`（前端常量、后端 `APP_VERSION`、workspace 包、品牌页）

### Technical Details

- **新增文件**：
  - `backend/src/repositories/` — admin / community / email-verification / recommendation / search-history / search-source / user repository
  - `backend/src/routes/rankings.ts` / `recommend.ts` — 榜单导入与推荐接口
  - `backend/src/services/ranking-*.ts` / `recommendation*.ts` / `hot-*.ts` / `actress-ranking.ts` / `tag-filter.ts` / `tag-frequency.ts` / `search-tier.ts`
  - `database/12_schema_search_tier.sql` / `database/13_backfill_search_tier.sql`
  - `.github/workflows/javdb-ranking-daily.yml` / `javdb-ranking-probe.yml`
  - `scripts/rankings/javdb-to-atlas.mjs`
  - `frontend/src/components/workbench/*` — 工作台组件
  - `frontend/src/components/search/SearchDock.tsx` / `SearchWorkspace.tsx` / `SearchQuotaBadge.tsx`
  - `frontend/src/components/jav/JavRecommendationsPanel.tsx`
  - `frontend/src/i18n/*` — 三语词条与初始化
  - `frontend/src/pages/admin/ActivityRankingTab.tsx`
  - `packages/shared/src/utils/jav-code.ts`
- **修改文件**：
  - `backend/src/routes/search.ts` — 路由收缩至编排层
  - `backend/src/middleware/auth.ts` — 单 JOIN 权限加载
  - `backend/src/validation/index.ts` — zod schema 统一
  - `backend/src/routes/jav.ts` / `user.ts` / `community.ts` / `admin.ts` — 接入 repository
  - `frontend/src/pages/MainSearchPage.tsx` — 一体化工作台
  - `frontend/src/hooks/useSearch.ts` / `useJavSearchFlow.ts` — 搜索结果与子模式
  - `frontend/src/i18n/locales/*.json` — 三语词条
  - `README.md` / `README.zh-CN.md` / `docs/*` — 版本与文档同步
  - `backend/wrangler.toml` — `APP_VERSION` 升级至 `1.5.0`

---

## [v1.4.0] - 2026-08-14

### Added - JAV 女优搜索系统 + 数据存储管理 + 社区完善 🌟

本次版本核心亮点：JAV 搜索新增独立的女优子模式（数据源 minnano-av.com），并打通女优卡片与社区分享链路；管理后台新增数据存储管理功能，搜索结果异步落库去重、多源合并；社区分享扩展至 6 大类别并完善帖子内容展示；多项稳定性与图片代理修复。

---

#### 核心新功能（一）：JAV 女优搜索子模式

- **minnano-av 数据源接入**：JAV tab 新增女优子模式（`sub=actress`），后端抓取 minnano-av.com 搜索页（唯一匹配 302 到详情页，多匹配并发抓前 10 个详情页），解析女优资料（名字 / 假名 / 罗马音 / 别名 / 生日 / 星座 / 三围 / 出身地 / 事务所 / 出道期间 / 标签 / 封面 / 详情链接）。无需任何账号配置，minnano 无反爬
- **关键词智能转换日文**：minnano 索引为日文新字体 + 假名，中文俗称无法直接搜到。映射表覆盖含假名 / 々 符号 / opencc 转错的女优，opencc 简→日新字体转换兜底纯汉字名，原文透传已输日文 / 罗马音的情况。后端返回 `normalizedKeyword` 供前端站内搜索链接使用
- **女优名映射表扩充**：新增约 30 条含假名女优（天海翼 / 星奈爱 / 河合亚衣奈 / 神宫寺奈绪 / 松本一花 / 麻美由真 / 辰巳唯等），修复筱田优（筱→篠异体字 opencc 不转）。总数约 70 条，覆盖 2000s-2020s 热门女优
- **排行榜女优映射补充**：抓取 minnano 三个排行榜验证，修正 5 个纯汉字名被 opencc 误转（藤森里穂 / 小早川怜子 / 音田絵凛 / 桐條紗綾 / 本澤朋美），补充 10 个含假名女优
- **JavBus 作品列表补充**：女优子模式搜索成功返回数据后，自动用归一化日文名到 JavBus `/search/{keyword}` 抓取前 20 条作品，在女优资料卡下方网格展示（封面 / 番号 / 标题 / 日期），点击作品卡自动切换到番号子模式搜索
- **女优卡片收藏与社区分享**：女优卡片新增收藏（Heart）与分享到社区按钮，社区分享类型扩展 `actress` 类型
- **搜索历史信息补全**：JAV 搜索历史的 `saveEnrichedHistory` 加 actress fallback，补全 `title` / `cover` / `code` / `actors` / `tags` 字段

#### 核心新功能（二）：JAV 子模式 URL 参数持久化

- **sub 参数写入 URL**：搜索 / 切 tab / 切子模式均同步 URL（`sub=code/actress/title`），刷新 / 前进后退 / 分享链接可还原正确子模式
- **闭包陷阱修复**：`handleSearch` 新增 `overrideSubMode` 参数，规避 URL 回读时 `setJavSubMode` 异步导致 code 模式番号校验误报；修复刷新后 URL `sub` 参数被错误改写为 `code` 的问题

#### 核心新功能（三）：数据存储管理系统

- **数据库**：新增 `data_records` + `data_record_sources` 两张表，`UNIQUE(record_type, dedup_key)` 去重，触发器自动维护 `source_count`，支持 JAV / 动漫 / 影视 / 漫画 / 小说 / 女优 全类型
- **后端**：`persistDataRecord` 异步落库（`waitUntil` 不阻塞搜索响应延迟），多源合并；`/admin/data-storage` 路由提供 stats / records CRUD / status / cleanup，管理员鉴权
- **集成**：`search.ts` 异步采集首条 + 有详情结果，`jav.ts` 详情页补充 `detail_completed` 标记
- **前端**：`DataStorageTab` 提供统计概览 + 数据浏览 + 详情 Modal，已注册到 AdminPanelLayout 与 App.tsx
- **共享类型**：`packages/shared` 与 frontend types 统一类型定义
- **匿名设计**：仅保留数据本身，不保存用户个人信息

#### 核心新功能（四）：社区分享完善

- **分享类别扩展至 6 类**：统一 `PostType` 在 6 处定义（jav / anime / movie / manga / novel / actress），打通共享类型、后端校验、DB schema、前端 UI 全链路，为小说搜索面板补全分享按钮
- **帖子内容展示完善**：重写 `PostDetail` 的 6 个 `contentData` renderer 按真实数据结构渲染（anime / movie / manga / novel / actress 原缺失或不匹配）；`PostCard` 按类型展示关键信息徽章；统一 `ResourceItem` 组件合并 `MagnetLinkItem`
- **标签显示改进**：标签显示 id 改为显示名称，`ShareToCommunityModal` 存 `tagName`，后端 tag 统计和删除检查改用 `tag_name`

### Improved - 性能与稳定性 ⚡

- **安娜搜索上限提升**：搜索上限 10 → 50，取第一页全部结果；描述抓取并发 5 → 10 适配
- **客户端分页**：前端按 10 条 / 页客户端分页，移除加载更多避免触发第二页抓取
- **图片代理白名单补齐**：Anna Archive 6 域名 + 奇书网 + z-lib 封面 CDN（`covers.z-lib.sk`）+ `www.minnano-av.com`，修复 `ERR_BLOCKED_BY_ORB`

### Fixed - 问题修复 🔧

- **认证**：修复忘记密码验证码校验必失败（`verifyCode` 用带随机 salt 的 `hashPassword` 重新计算 hash 去匹配数据库，PBKDF2 每次结果不同导致 WHERE 永远查不到；改用确定性 SHA-256 的 `hashToken`，与 `user_sessions.token_hash` 一致）。顺带修复 `getPendingVerification` 重发冷却失效、`recordFailedAttempt` `max_attempts` 锁定失效两个隐性 bug
- **JAV 女优资料解析**：原解析用全文 `getText` 后正则匹配，页面噪音导致大量字段丢失；改用 `<span>label</span><p>value</p>` 相邻标签结构精确定位字段，`タグ` 字段匹配 `tagarea` div 内的 a 标签列表
- **图片代理 ORB**：女优封面改走后端 `/api/jav/proxy-image`（`getProxyImageUrl`），避免浏览器对前缀式 `convertToProxyUrl` 的图片资源触发 `net::ERR_BLOCKED_BY_ORB`
- **女优搜索并行展示**：actress 子模式不再短路返回，改为同时抓取女优数据 + 查用户启用的 jav 源生成多源跳转 URL，前端女优面板与多源卡片上下并行渲染，保留原有搜索体验
- **数据存储容错**：磁力链接改为复制按钮（`magnet:` 协议浏览器无法直接打开）；JAV 封面落库时补全 javbus 域名（原存相对路径 `/pics/cover/xxx.jpg` 导致 404）；影视 / 动漫明细 `contentData` 存完整首条对象（含 overview / backdrop 等），磁力资源写入 sources 表（原完全丢弃）；Anna 403 时 fallback 到奇书网结果
- **小说源 typecheck**：移除未使用的 `onPageChange` prop 修复 typecheck

### Changed - 行为变更 ⚠️

- **禁用 nyaa 源**：因部署环境（Cloudflare Workers 出站 IP）无法解决 nyaa.si 的 bot 验证，RSS / HTML 均被拦截，先取消爬这个源。`fetchNyaa` 保留导出便于后续恢复；nyaa 禁用后前端不显示任何提示（`errors.nyaa` 改为 `null`，`nyaaList` 为空时所有 nyaa UI 自动隐藏）

### Technical Details

- **新增文件**：
  - `backend/src/services/actress-search.ts` — 女优搜索业务逻辑（minnano-av 抓取与解析）
  - `backend/src/services/actress-name-map.ts` — 女优名映射表（约 70 条 + opencc 转换兜底）
  - `backend/src/services/data-storage.ts` — 数据存储异步落库服务
  - `backend/src/routes/data-storage.ts` — 数据存储管理路由（管理员专属）
  - `backend/src/utils/title-grouping.ts` — 作品归组工具（从 jav-utils 提取复用）
  - `frontend/src/components/jav/ActressesPanel.tsx` — 女优面板组件
  - `frontend/src/components/jav/JavActressResultsPanel.tsx` — 女优搜索结果面板
  - `frontend/src/pages/admin/DataStorageTab.tsx` — 数据存储管理后台 Tab
  - `frontend/src/hooks/useActresses.ts` — 女优搜索 Hook
  - `database/11_schema_data_storage.sql` — 数据存储表结构 + 索引 + 触发器
  - `packages/shared/src/types/data-storage.ts` — 共享类型定义
  - `frontend/src/types/data-storage.ts` — 前端类型定义
- **修改文件**：
  - `backend/src/routes/search.ts` — 集成异步数据采集、JAV 女优子模式分支
  - `backend/src/routes/jav.ts` — 详情页 `detail_completed` 标记、女优 fallback
  - `backend/src/services/jav-utils.ts` — 提取 `parseGrid` / `JavItem` / `isValidCode` 供复用
  - `frontend/src/pages/MainSearchPage.tsx` — JAV 子模式 URL 同步、女优面板渲染
  - `frontend/src/hooks/useJavSearchFlow.ts` — `handleSearchUrlSync` 闭包修复
  - `frontend/src/components/community/ShareToCommunityButton.tsx` — 标签名存储、actress 类型
  - `frontend/src/components/community/PostDetail.tsx` — 6 类 contentData renderer 重写
  - `frontend/src/components/jav/JavDetailPanel.tsx` — 详情页数据采集集成
  - `backend/src/utils/email-verification.ts` — 验证码哈希改用 `hashToken`，修复重发冷却与锁定
  - `backend/wrangler.toml` — `APP_VERSION` 升级至 `1.4.0`

---

## [v1.3.0] - 2026-08-12

### Added - 小说搜索 + 聚合视图 + 观测体系 + 多项增强 📚

本次版本核心亮点：新增小说搜索类别（第五大类），作品级资源归组聚合视图，Google OAuth 登录，前端错误监控自建观测系统，JAV 子搜索模式与女优推荐，播放器重构，安全限流升级。

---

#### 核心新功能（一）：小说搜索系统

- **Anna's Archive 集成**：接入 Anna's Archive 作为小说主数据源，支持图书元数据搜索
- **奇书网数据源**：新增奇书网搜索源，TXT 直链资源置顶展示
- **多域名故障转移**：搜索源支持多域名自动切换，提升可用性
- **图书描述**：搜索结果展示图书简介/描述信息
- **前端 NovelSearchResultPanel 组件**：独立的小说搜索结果面板

#### 核心新功能（二）：作品级资源归组聚合视图

- **作品维度归组**：搜索结果按作品（标题）维度归组聚合，同一作品的多源资源合并展示
- **聚合视图卡片**：简介整合到聚合视图卡片中，统一展示
- **Title Grouping 优化**：标题归组正则优化，移除不必要的转义字符

#### 核心新功能（三）：Google OAuth 登录

- **Google OAuth 登录**：支持 Google 账号一键登录，自动创建/关联账号
- **State Cookie 修复**：修复 Set-Cookie 合并导致 state cookie 未设置的问题

#### 核心新功能（四）：前端错误监控观测系统

- **自建观测系统**：前端错误监控自建观测体系，无需第三方依赖
- **系统错误列表**：管理后台新增系统错误列表（修复 prefer-const 与 any 类型）

#### 核心新功能（五）：JAV 搜索增强

- **子搜索模式**：JAV 搜索增加子搜索模式，支持更精准的搜索
- **番号格式校验**：输入番号格式校验，错误提示仅在输入框未聚焦时显示避免与搜索建议冲突
- **推荐女优栏目**：新增推荐女优栏目，支持爬取女优列表及详情番号
- **女优详情弹窗**：优化女优详情弹窗和搜索体验

#### 核心新功能（六）：播放器重构

- **WebTor 在线播放**：移除内嵌播放和 BTorrent，仅保留 WebTor 在线播放
- **PikPak 推荐提示**：弹窗增加 PikPak 推荐提示
- **复制磁力链接**：点击播放时弹窗提示并支持复制磁力链接

#### 核心新功能（七）：安全与限流升级

- **D1 持久化限流**：改用 D1 持久化限流，支持多级限制
- **邮箱注册白名单**：增强邮箱注册白名单校验
- **搜索限流提示**：修复搜索限流错误提示，直接显示后端异常信息

#### 核心新功能（八）：品牌与 SEO 统一

- **品牌统一**：统一品牌名称为 Atlas 并优化 SEO 配置
- **PNG Favicon**：添加 PNG 格式 favicon 提升搜索引擎兼容性
- **Bing 站长工具**：添加 Bing 站长工具验证标签
- **域名统一**：清除 pages.dev 域名和旧域名 codeseek.pp.ua，统一替换为 atlas.wort.uk

#### 核心新功能（九）：搜索体验优化

- **搜索缓存层**：添加缓存层，修复 manga 建议接口超时
- **搜索建议简化**：简化搜索建议逻辑，删除子类选择功能
- **历史 Fallback**：Provider 返回空数组时 fallback 到数据库历史
- **建议下拉框修复**：提升搜索建议下拉框层级并恢复不透明背景，修复下层内容穿透
- **JavProvider 建议**：恢复 JavProvider suggestions/trending，为 MangaProvider 补充 suggestions

#### 核心新功能（十）：UI 布局优化

- **公告横幅独立置顶**：公告通知独立为全局顶栏，跨所有标签页可见
- **快捷入口面板**：右栏接入快捷入口（搜索源管理、系统设置、社区、管理后台）
- **导航栏精简**：去掉"更多"菜单，sources 入口移至快捷入口

### Improved - 性能与稳定性 ⚡

- **搜索缓存**：减少重复请求，提升响应速度
- **多域名故障转移**：搜索源可用性提升
- **限流持久化**：D1 持久化限流，多级精细控制

### Fixed - 问题修复 🔧

- 修复 JAV 搜索崩溃问题 - 移除错误的面板兜底逻辑
- 修复漫画搜索崩溃 - 移除错误的历史记录字段写入并隔离错误影响
- 修复会话设备始终显示 Mozilla/5.0 的问题
- 修复 Google OAuth Set-Cookie 合并导致 state cookie 未设置
- 修复 /public 端点未登录访问首页 401 的问题
- 修复管理后台系统错误列表的 prefer-const 与 any 类型
- 修复搜索建议下拉框背景穿透问题

### Technical Details

- **新增文件**：
  - `frontend/src/components/search/NovelSearchResultPanel.tsx` — 小说搜索结果面板
  - `frontend/src/components/search/AnnouncementBar.tsx` — 公告横幅组件
  - `frontend/src/components/search/QuickActionsPanel.tsx` — 快捷入口面板
  - `backend/src/providers/novel-provider.ts` — 小说 Provider
  - `backend/src/services/novel-search.ts` — 小说搜索业务逻辑
  - `backend/src/routes/github-oauth.ts` — GitHub OAuth 路由
  - `backend/src/routes/google-oauth.ts` — Google OAuth 路由
- **修改文件**：
  - `frontend/src/pages/MainSearchPage.tsx` — 公告横幅置顶、快捷入口面板
  - `frontend/src/components/layout/UnifiedNavBar.tsx` — 导航栏精简
  - `frontend/src/config/tabs.ts` — 新增小说类别
  - `frontend/src/config/resultPanels.tsx` — 小说结果面板配置
  - `backend/src/index.ts` — 注册 novel Provider
  - `backend/src/routes/search.ts` — 支持 novel category
  - `backend/src/utils/rate-limit.ts` — D1 持久化限流
  - `backend/src/utils/security.ts` — 邮箱白名单校验
  - `backend/src/middleware/auth.ts` — /public 端点修复

---

## [v1.2.0] - 2026-07-17

### Added - 漫画搜索 + 架构优化 🎨

本次版本核心亮点：新增漫画搜索类别，架构全面优化为可扩展模式。

---

#### 核心新功能（一）：漫画搜索系统

- **漫画元数据搜索**：
  - MangaDex API 集成：标题、封面、评分、标签、作者、状态
  - 13个搜索源聚合：MangaDex、MangaFire、MangaReader、MangaHere 等
  - 前端 MangaSearchResultPanel 组件（~400行）
  - 收藏/复制链接/外链跳转

#### 核心新功能（二）：架构可扩展性改造

- **单一数据源模式**：
  - 多数据源并行查询改为单一主数据源 + 多搜索源辅助
  - 数据一致性保证、性能提升、缓存策略简化

- **Pinned 机制**：
  - 用户可标记常用搜索源
  - 搜索源列表顶部显示固定源（带📌标记）
  - 一键固定/取消固定（仅登录用户）
  - 固定状态持久化

- **查表式渲染**：
  - 搜索结果渲染从硬编码改为配置驱动
  - 新增类别只需添加配置项，无需修改渲染逻辑

#### 核心新功能（三）：图片代理统一

- 所有外部图片统一通过后端代理
- 漫画封面新增 `category=manga` 参数
- 缓存策略优化（按类别区分）
- 防盗链绕过统一处理

#### 核心新功能（四）：导航栏自适应布局

- **桌面端**：顶部固定导航栏（Logo + 四大类别 + 搜索 + 用户）
- **移动端**：底部固定导航栏（首页 + 四大类别 + 更多）
- **自适应**：根据屏幕宽度自动切换布局
- **新增入口**：漫画搜索入口（桌面端顶部、移动端底部）

#### 核心新功能（五）：数据库整理

- 新增高频查询索引（15个）
- 所有时间字段统一为 `INTEGER` (Unix 时间戳)
- 所有状态字段统一为 `TEXT` (枚举值)
- 所有 JSON 字段增加 `DEFAULT '{}'`

### Improved - 性能与稳定性 ⚡

- **MangaDex API 优化**：限额控制（每分钟 5 次）
- **搜索源超时保护**：100ms ~ 5000ms 响应时间控制
- **索引性能提升**：25 个高频查询索引

### Technical Details

- **新增文件**：
  - `frontend/src/components/search/MangaSearchResultPanel.tsx` — 漫画搜索结果面板
  - `frontend/src/types/manga.ts` — 漫画相关类型定义
  - `backend/src/providers/manga-provider.ts` — 漫画 Provider（2 个分类）
  - `backend/src/services/manga-search.ts` — 漫画搜索业务逻辑
  - `backend/src/routes/manga.ts` — 漫画相关路由
- **修改文件**：
  - `frontend/src/pages/SearchPage.tsx` — 增加 manga category、导航栏优化
  - `frontend/src/components/search/SearchForm.tsx` — 支持漫画搜索
  - `frontend/src/components/layout/MainLayout.tsx` — 导航栏自适应布局
  - `frontend/src/components/layout/MobileBottomNav.tsx` — 移动端底部导航栏新增漫画入口
  - `frontend/src/services/api/search.ts` — 漫画搜索 API
  - `frontend/src/utils/image-proxy.ts` — 图片代理统一
  - `backend/src/index.ts` — 注册 manga Provider
  - `backend/src/routes/search.ts` — 支持 manga category
  - `backend/src/routes/sources.ts` — 支持 pinned 过滤、固定/取消固定接口
  - `backend/src/services/search-sources-service.ts` — pinned 机制实现
  - `backend/src/services/image-proxy.ts` — 漫画封面代理支持

---

## [v1.1.0] - 2026-06-17

### Added - 动漫 & 影视搜索 + 架构升级 🎬

本次版本核心亮点：从单一的 JAV 搜索引擎升级为三大类别聚合搜索引擎，架构全面重构。

---

#### 核心新功能（一）：动漫搜索系统

- **数据源**：Bangumi API（番剧元数据）+ Mikan Project（字幕组）+ Nyaa.si（种子）+ ShowRSS（订阅）
- **前端组件**：AnimeSearchResultPanel（~500行）
  - Bangumi 信息卡（封面、评分、标签云）
  - Mikan 字幕组列表
  - Nyaa 磁力卡片（可信标记、HD 标记、做种数颜色编码）
  - 收藏/复制磁力/外链跳转

#### 核心新功能（二）：影视搜索系统

- **数据源**：TMDB API（影视元数据）+ YTS（电影种子）+ EZTV（剧集种子）+ TPB（兜底磁力）
- **前端组件**：MovieSearchResultPanel（~450行）
  - TMDB 海报卡片（评分、上映日期、简介）
  - 资源列表（来源徽章、画质标签）
  - 季/集选择器（仅剧集）

#### 核心新功能（三）：三层搜索架构

- **层级定义**：
  - Layer 1: `category`（搜索大类：anime/movie/jav）
  - Layer 2: `classification`（搜索分类：bangumi/tmdb/...）
  - Layer 3: `source`（具体源实例：Bangumi API/TMDB API/...）

#### 核心新功能（四）：Provider 注册模式

- 新增可扩展的 Provider 架构
- 新增类别只需创建 Provider + 注册一行代码
- 分类间搜索逻辑完全隔离

### Changed - 架构改进 ⚙️

- **数据库变更**：
  - `search_sources` 表新增 `category` / `classification` 字段
  - `history` 表新增 `category` / `cover_image` 字段
  - 新增 anime/movie 类别搜索源数据
- **共享类型包**：`packages/shared` 统一前后端类型
- **图片代理统一**：所有外部图片统一走后端代理

### Breaking Changes

- 搜索接口参数变更：`category` 和 `classification` 从可选变为必填
- 搜索历史响应新增 `category` / `classification` / `coverImage` 字段

---

## [v1.0.0] - 2026-03-15

### Added - 首个公开发布：架构重构 + 技术栈升级 🚀

首个公开发布版本，从原生 ES6 架构重构为 React + TypeScript 现代化技术栈，并保留 JAV 搜索、用户系统、管理后台与 Cloudflare 全栈部署能力。

---

#### 核心新功能（一）：前端技术栈升级

- **React 18.3.1 + TypeScript 5.5.3**：组件化架构
- **Vite 5.4.1**：现代化构建工具
- **Tailwind CSS 3.4.11**：原子化样式
- **Zustand 4.5.5**：状态管理
- **React Router 6.26.2**：路由管理

#### 核心新功能（二）：后端技术栈升级

- **Hono 4.6.0 + TypeScript 5.5.3**：框架升级
- **JWT (jose 5.9.0)**：标准化认证
- **Resend**：邮件服务

#### 核心新功能（三）：安全增强

- **邮箱验证机制**：6 位验证码
- **登录失败锁定**：连续失败 5 次自动锁定 15 分钟
- **GitHub OAuth**：第三方登录
- **用户反馈系统**：问题反馈、优化建议

#### 基础能力

- **JAV 搜索**：DMM/FANZA 元数据聚合 + JavBus/JavDB 磁力搜索
- **用户系统**：注册、登录、收藏、历史记录
- **管理后台**：用户管理、搜索源管理、系统配置
- **Cloudflare 全栈部署**：Workers + D1 + Pages

### Technical Details

- **变更统计**：35 个文件修改，+1666 行 / -596 行
- **数据库优化**：8 个文件整合为 7 个
- **预置搜索源**：从 ~20 个增加到 50+

---

## 早期未发布迭代

> 以下版本在仓库内曾以 v1.0.0 / v2.0.0 / v3.0.0 / v3.1.0 命名记录，但未单独创建 GitHub Release。为避免与正式版本号冲突，统一归档为早期迭代。

### 2026-05-13 — 安全加固 + Monorepo 共享包（未单独发布）

#### 密码与数据模型

- **PBKDF2-SHA256 哈希**：100,000 次迭代 + 随机盐值，自动识别新旧格式
- **Token 哈希分离**：密码与 Token 使用不同哈希策略
- **数据模型扩展**：收藏项 8 个元数据字段、搜索历史 9 个字段、want ↔ watched 状态切换
- **前端体验**：收藏面板卡片化、历史面板元数据展示、ProxyImage 统一图片代理

#### Monorepo 与工程化

- **packages/shared 创建**：统一类型定义与工具函数
- **单源验证规则**：`VALIDATION_RULES` 从 shared 导入
- **camelizeKeys 工具**：snake_case → camelCase 自动转换
- **生产 Source Map 关闭**：防止源代码暴露
- **CI 门禁**：部署前强制 typecheck + lint
- **数据库索引**：25 个高频查询索引
- **构建脚本优化**：`tsc --noEmit && vite build`

#### 架构改进

- **Zod 数据验证**：全面引入 Zod 4.4.3
- **CORS 策略强化**：正则匹配域名
- **认证中间件统一**：消除重复代码

### 2024-10 — 初版原型（未发布）

基于原生 ES6 架构的 JAV 搜索引擎原型，包含 JAV 搜索、用户系统、管理后台与 Cloudflare 全栈部署雏形。

---

**让搜索更简单，让体验更美好！**

Made with ❤️ by [Zoro](https://github.com/Zoroaaa) | Version 1.8.0 | 2026-11-14