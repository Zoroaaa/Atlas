# 动漫 / 漫画 / 影视 / 小说 —— 优化增强方案

> 范围：`anime_sources` / `manga_sources` / `movie_sources` / `novel_sources` 四个大类。
> 不在范围：JAV（主线，仅作为成熟机制参照，不改动）。
> 依据：仓库 `main` 分支 commit `2ebfbb1` 的实际代码，所有结论均附文件与行号。
> 本文只做方案，不含代码改动。

---

## 0. 一页结论

### 0.1 能力矩阵（对照 JAV）

| 能力 | JAV | 动漫 | 影视 | 漫画 | 小说 |
|---|---|---|---|---|---|
| 元数据来源 | JavBus 详情 | Bangumi（仅 6 条） | TMDB + 豆瓣 | MangaDex（唯一） | 知轩藏书 + 奇书网 |
| 资源来源数量 | 详情页磁力 | Mikan / AnimeTosho / showRSS（Nyaa 已禁用） | TPB / EZTV | 无 | 直链下载 |
| 详情完整度 | 详情页 + 字段缺位判定 + 补全任务 | 无详情层 | 无详情层 | 无详情层 | 搜索页→详情页两次抓取 |
| 本地库优先搜索 | 有 | 无 | 无 | 无 | 无 |
| 多源跳转卡片 | 有 | 无（源配置失效） | 无（源配置失效） | 无（源配置失效） | 有 |
| 失败语义区分 | `NOT_FOUND` / `SOURCE_UNAVAILABLE` | 无 | 无 | 无 | 无 |
| 失败重试 / 退避 | 详情级重试元数据 + 定时任务 | 仅 HTTP 层 429/503 | 仅 HTTP 层 429/503 | 仅 HTTP 层 429/503 | 仅 HTTP 层 429/503 |
| 榜单 / 推荐 | JavDB 周月榜 + 标签推荐 + 女优榜 | 伪热门（语义错误） | TMDB trending | 无 | 无 |
| 落库完整度 | `detail_completed` 可达成 1 | 恒为 0 | 恒为 0 | 恒为 0 且无来源 | 恒为 0 |
| 服务端分页 | 不适用（单条） | 契约失效 | 仅元数据分页 | 有 | 契约失效 |

### 0.2 P0 清单（用户可见错误 / 数据错配 / 数据丢失）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| P0-1 | 影视落库把**全部资源挂到首条作品**，归组结果被丢弃 | `backend/src/services/data-storage.ts:519-549`、`365-404` | 本地库作品与磁力错配，收藏/历史回看错误 |
| P0-2 | TPB 失败被完全吞掉，`tpbError` 恒为 null | `backend/src/services/movie-search.ts:194-197`、`305-325` | 资源为空但前端无任何错误提示 |
| P0-3 | 漫画错误未脱敏直接透传前端（含英文栈信息/状态码） | `backend/src/services/manga-search.ts:105` | 信息泄露 + 文案不可读，且与其余类不一致 |
| P0-4 | 小说每个源只取第一本，`page>1` 直接返回空 | `backend/src/services/novel-search.ts:131-144`、`256-266`、`366-369` | 用户可见结果最多 2 条，翻页失效 |
| P0-5 | 漫画落库无任何 `data_record_sources`，`source_count=0`，180 天后被清理 | `backend/src/services/data-storage.ts:552-574`、`data-retention.ts:66-72` | 漫画本地库无法积累，采集数据会被删除 |
| P0-6 | 小说 dedup_key 仅用数字 id，知轩与奇书网 id 空间重叠 | `backend/src/services/data-storage.ts:604`、`library-record.ts:152-156` | 不同书可能被合并成同一条记录 |

> P0 判定标准：产生**错误数据**、**数据丢失**或**用户可见的静默失败**。纯文案、布局、分页手感问题一律不进 P0。

---

## 1. 现状基线：四类共用的链路

四类均已接入统一 Provider 抽象（`backend/src/services/search-provider.ts:82-110`），搜索路由只做「认证 → 限流 → 取 Provider → 缓存 → 落库」（`backend/src/routes/search.ts:81-280`）。

共同行为：

1. **搜索历史**：进入 Provider 前先写 `user_search_history`；Provider 返回后由各类 `buildHistoryEnrichment` 回填 title/cover/code 等（`search.ts:111-123`、`192-200`）。
2. **缓存**：所有 Provider 统一 10 分钟 `Cache-Control`，键为 `类别 + 关键词 + page + subMode (+ 用户态隔离)`（`search.ts:134-154`）。仅 JAV / 小说按用户隔离（`injectsUserSources`，`novel-provider.ts:27`、`jav-provider.ts:90`）。
3. **落库**：缓存未命中时 `persistDataRecord` 异步写入 `data_records` / `data_record_sources`（`search.ts:202-209`）。
4. **错误脱敏**：`sanitizeError` 有统一映射表（`backend/src/utils/error.ts:8-34`），但只在动漫/影视使用，漫画/小说未使用。
5. **HTTP 重试**：仅对 429 / 503 / 网络异常重试（`backend/src/utils/fetch.ts:17-47`）；4xx 语义错误、5xx（502/504）、解析失败均不重试。

由此产生第一个结构性结论：

> **四类的差异全部压在各自的 `*-search.ts` 里，共用的「详情补全、失败语义、多源卡片、分页契约」四件事没有任何一层承载。** JAV 之所以完整，是因为它把这几件事分别放在了 `jav-detail-job.ts`、`jav-detail-meta.ts`、`jav-provider.ts`、独立 detail 路由里（见第 6 节）。

---

## 2. 动漫（anime_sources）

### 2.1 现状

- 元数据：Bangumi `api.bgm.tv/search/subject/{kw}?type=2&max_results=6`，只取前 6 条（`backend/src/services/anime-search.ts:651-702`）。
- 资源：Mikan RSS、AnimeTosho JSON、showRSS 三源并行（`anime-search.ts:709-720`）。
- **Nyaa 整源禁用**：因 Cloudflare Workers 出站 IP 无法通过 nyaa.si 验证，代码保留但注释掉（`anime-search.ts:711-716`、`229-231`）。
- 归组：Bangumi 前 6 部作品 × 归一化标题匹配磁力，产出 `grouped/unGrouped`（`anime-search.ts:766-818`、`utils/title-grouping.ts:148-191`）。
- 前端：分组视图 + 每源独立列表 + 每源本地分页（`frontend/src/components/search/AnimeSearchResultPanel.tsx:290-320`、`486-600`）。

### 2.2 主要问题

#### 真实缺陷

| 问题 | 证据 | 说明 |
|---|---|---|
| 分页契约失效 | `anime-search.ts:709-720`；`AnimeSearchResultPanel.tsx:587-600` | `page` 只回填到响应体，所有抓取函数都不接收页码；前端「加载更多」要求 `nyaaList.length >= 60`，而 nyaa 永远为空 → 入口不可达 |
| Mikan 抓取代价极高 | `anime-search.ts:546-570`、`433-479` | 每条结果都要下载 `.torrent` 解 bencode 取 infoHash，最多 30 条、5 并发分批；叠加 20s 总超时（`707`），高峰期极易整源降级 |
| 超时降级语义粗糙 | `anime-search.ts:729-746` | 一旦总超时，五个源全部标「搜索超时」并返回空，用户无法区分「源慢」与「确实没有」 |
| 元数据只有 6 条且无详情层 | `anime-search.ts:652`、`784-787` | 超过 6 部作品的作品名无法承接磁力，直接落入 `ungrouped`；没有单作品详情（简介截断 300 字 `682`、无制作/声优/播出表） |
| 源配置对结果无效 | `SearchWorkspace.tsx:141`、`anime-provider.ts:25-28` | DB 中 22 个 `anime_sources` 源（`database/07_data_search_sources.sql:148-204`）从不渲染成卡片；用户关闭源对搜索无影响 |

#### 体验粗糙

- 错误提示最多展示 3 条，其余折叠为 `+N`（`AnimeSearchResultPanel.tsx:396-401`）。
- showRSS 实际是「固定 3 个频道 RSS 全量拉取 + 本地标题过滤」（`anime-search.ts:583-647`），覆盖取决于频道是否仍在更新，效果不稳定。
- 热门榜语义错误：`trending()` 拿关键词「マンガ」以 `type=2`（动画）去搜（`anime-provider.ts:82-106`），返回的是「与漫画相关的动画」，不是热门动画。

### 2.3 建议改动

| 建议 | 优先级 | 工作量 | 说明 |
|---|---|---|---|
| A1 打通真实分页：`fetchBangumi` 支持 offset，磁力源按 `page` 拉取并返回 `hasMore` | P1 | M | 同时把前端「加载更多」判断从 `nyaa>=60` 改为后端 `hasMore` |
| A2 修热门榜：改用 Bangumi 排行/收藏数接口，或直接复用 `data_records` 统计 | P1 | S | 当前数据是错的，属于「看起来有功能但结果不对」 |
| A3 补动漫详情层（简介全文、制作、声优、集数表），走「按需 + 落库」 | P1 | L | 参照 JAV detail 的 on-demand 模式（`routes/jav.ts:346`） |
| A4 Mikan 改为「只对前 N 条（如 10）解析 torrent」，其余给页面链接 | P1 | S | 降低单次搜索的出站请求数，避免整源超时 |
| A5 引入失败语义 `errorKind`（`NOT_FOUND` / `SOURCE_UNAVAILABLE` / `RATE_LIMITED`） | P1 | M | 与 JAV 的 `searchErrorKind` 对齐（`jav-provider.ts:76-78`） |
| A6 多源卡片生效或删除死配置（与第 7 节 R2 合并处理） | P1 | M | 二选一，不能维持「DB 有配置、前端不渲染、开关无效果」 |
| A7 归组冲突策略：一资源命中多作品时按年份/相似度择优，而非「先到先得」 | P2 | S | `title-grouping.ts:168-182` 目前按作品顺序先占 |
| A8 showRSS 源做可用性探测，长期无效则下线 | P2 | S | 需先验证（见第 9 节） |

### 2.4 工作量与风险

- 主体工作量在 A3（详情层）与 A1（分页），A2/A4 是小改动但收益直接。
- 风险：Bangumi 无官方 SLA，`api.bgm.tv` legacy 接口的限流策略未验证（见第 9 节）；详情层会新增出站请求，需按 JAV 的「仅按需 + 冷却窗口」实现，避免放大抓取。

---

## 3. 影视（movie_sources）

### 3.1 现状

- 元数据：TMDB 中文 + TMDB 英文 + 豆瓣 三路并行（`backend/src/services/movie-search.ts:254-275`）。
- 资源：TPB（按英文名/英文名+年份，最多 6 个关键词、3 并发分批）+ EZTV（仅剧集，依赖 TMDB external_ids 取 IMDb ID）（`movie-search.ts:163-250`、`296-353`）。
- 去重：元数据按标题前 30 字符；资源按 infoHash（`movie-search.ts:269-275`、`356-363`）。
- 归组：TMDB/豆瓣作品 × 资源标题归一化匹配（`movie-search.ts:370-376`）。
- 前端：元数据卡片 + 资源列表，服务端 page 仅作用于 TMDB（`MovieSearchResultPanel.tsx:331-345`）。

### 3.2 主要问题

#### 真实缺陷

| 问题 | 证据 | 说明 |
|---|---|---|
| TPB 失败静默 | `movie-search.ts:194-197`、`305-325` | `searchTPB` 内部 catch 后返回 `[]`，外层依赖的 `_error` 标记永远不会产生 → `tpbError` 恒为 null，前端错误区（`MovieSearchResultPanel.tsx:184`）永不显示 |
| 豆瓣错误静默 | `movie-search.ts:150-159`、`266-267` | `searchDouban` 全链路 catch 返回 `[]`，`doubanError` 恒为 null |
| 资源归属错乱（落库） | `data-storage.ts:519-549`、`365-404` | 落库时把「全部资源」写入首条 TMDB 作品，完全没用 `grouped`；对比动漫已正确使用归组（`data-storage.ts:307-339`） |
| 资源无做种数据 | `movie-search.ts:28-43`、`184-193`、`238-246` | TPB 返回的 `seeders/leechers` 被丢弃，EZTV 的 `seeds/peers` 也被丢弃；`ResourceItem` 没有该字段，前端无法按质量排序 |
| 元数据去重过粗 | `movie-search.ts:269-275` | 仅标题前 30 字符，`mediaType`/年份/外部 ID 未参与；同名不同作品会被合并（数据丢失） |
| 豆瓣结果无法命中本地库 | `movie-search.ts:144`、`library-record.ts:139-144` | 豆瓣 id 用负数伪造，落库/查询只认 `tmdb:` 前缀，豆瓣来源的作品在「历史/收藏点击回看」时查不到 |
| EZTV 单点失败拖垮整批 | `movie-search.ts:340-353` | `Promise.all`，任一作品取 external_ids 失败即整批 EZTV 丢失 |

#### 体验粗糙

- 第 2 页只有 TMDB 分页，TPB 关键词不变（`movie-search.ts:296-333`）→ 翻页后资源区与第 1 页高度重复。
- 历史增强里读取 `firstResult.vote_average`，而实际字段是 `rating`（`movie-provider.ts:57-60` vs `movie-search.ts:113`）→ 评分永远写不进搜索历史。
- 剧集只有「剧」级结果，没有季/集结构，EZTV 资源无法按季归组。
- 豆瓣接口用的是 `/j/search_subjects`（`movie-search.ts:131`），该接口按 tag 浏览，`search_text` 是否生效需验证（见第 9 节）。

### 3.3 建议改动

| 建议 | 优先级 | 工作量 | 说明 |
|---|---|---|---|
| M1 修落库归属：改用 `grouped.groups` 取首条作品资源，与动漫一致 | P0 | S | 直接修数据错配，同时修正历史脏数据（一次性脚本，需用户执行） |
| M2 让 TPB/EZTV/豆瓣失败可见：失败返回结构化错误，不用 `_error` hack | P0 | S | 前端错误区已就绪，缺的是后端真值 |
| M3 资源模型补 `seeders/leechers/quality` 并用于排序 | P1 | M | 需同步 `ResourceItem`（前后端类型契约）与落库 `source_data` |
| M4 元数据去重改为 `mediaType + 年份 + 标题归一化`，保留 TMDB ID 优先 | P1 | S | 避免同名合并 |
| M5 豆瓣条目单独前缀（`douban:`）并纳入 `buildDedupKeys` | P1 | S | 让豆瓣结果可被本地库命中 |
| M6 EZTV 改 `Promise.allSettled`，按剧集独立降级 | P1 | S | 消除整批丢失 |
| M7 资源页与元数据页解耦：第 2 页起只翻 TMDB，资源区折叠为「全量资源」 | P2 | S | 消除翻页重复，降低无效请求 |
| M8 增加季/集维度（TMDB season 接口） | P2 | L | 剧集体验的根，成本高，建议排在 P1 之后 |

### 3.4 工作量与风险

- M1/M2 属于「小改动、高收益」，建议第一批上线。
- 风险：M3 改 `ResourceItem` 属于前后端类型契约变更（`frontend/src/types/search.ts:186-198`），需同版本发布；M8 依赖 TMDB 额外接口，需评估请求放大与缓存策略。

---

## 4. 漫画（manga_sources）

### 4.1 现状

- 唯一源：MangaDex `GET /manga?title=`，20 条/页，带 cover_art（`backend/src/services/manga-search.ts:51-95`）。
- 返回字段仅 `id/title/cover/status/tags`（`manga-search.ts:32-38`）。
- 无资源链接、无详情接口、无缓存以外的补充。
- 落库只写主记录，不写 `data_record_sources`（`data-storage.ts:552-574`）。

### 4.2 主要问题

#### 真实缺陷

| 问题 | 证据 | 说明 |
|---|---|---|
| 错误未脱敏透传 | `manga-search.ts:105` | `errors: { mangadex: errorMessage }` 直接给前端（如 `MangaDex 429`、`The operation was aborted`），绕过了 `sanitizeError` |
| 落库无来源 → 会被清理 | `data-storage.ts:552-574`、`data-retention.ts:66-72` | `source_count=0` 且 `detail_completed=0` 的记录 180 天后被删除，漫画等于「采集即丢弃」 |
| 总数字段误导 | `manga-search.ts:93` vs `MangaSearchResultPanel.tsx:88` | `total` 是 MangaDex 全局命中数（可能上万），界面显示「总计 N 条」但只有 20 条 |
| 单源无降级 | `manga-search.ts:56-108` | MangaDex 限流/故障时结果直接为空，没有备用元数据源 |
| 源配置对结果无效 | `SearchWorkspace.tsx:141` | `manga_sources` 下 13 个源（`database/07_data_search_sources.sql:258-285`）全部不渲染 |

#### 体验粗糙

- 数据太薄：没有作者、简介、年份、评分、连载话数（`manga-search.ts:32-38`），卡片信息量明显低于动漫/影视。
- 前端「本地 10 条分页 + 后端 20 条翻页」两套分页叠加（`MangaSearchResultPanel.tsx:71-81`、`176-187`），跨页顺序与去重容易出问题。

### 4.3 建议改动

| 建议 | 优先级 | 工作量 | 说明 |
|---|---|---|---|
| G1 错误走 `sanitizeError`，并补 `errorKind` | P0 | S | 与其他类对齐 |
| G2 落库补来源（MangaDex 详情页 URL 作为 `detail` 源），避免被清理 | P0 | S | 最小改动即可止血 |
| G3 扩充元数据：作者、简介、年份、`lastChapter`、`rating`（MangaDex statistics） | P1 | M | 一次请求可带 `includes[]=author,artist`；statistics 需额外请求，建议只对首条拉取 |
| G4 增加第二元数据源（AniList / MangaUpdates）做降级 | P1 | M | 仅元数据，不涉及资源，风险低 |
| G5 `total` 改为「本次可翻页总量」或前端改文案 | P1 | S | 消除误导 |
| G6 统一分页：去掉前端本地切片，交给服务端 | P2 | M | 与第 7 节 R5 一起做 |
| G7 多源卡片生效或删除死配置 | P1 | M | 同 R2 |

### 4.4 工作量与风险

- 漫画是四类里**绝对值最薄**的一类，G2/G5 是止损，G3/G4 才是「补齐」。
- 风险：MangaDex 对匿名请求有速率限制，G3 增加请求后需加缓存（建议复用搜索缓存键，TTL 30 分钟以上）。

---

## 5. 小说（novel_sources）

### 5.1 现状

- 抓取源：知轩藏书（zxcs.zip）+ 奇书网（xqishuta.org），各「搜索页 → 详情页」两次串行请求（`backend/src/services/novel-search.ts:209-242`、`325-358`）。
- 每个源**只解析第一本**（`novel-search.ts:131-144`、`256-266`）。
- 仅 `page=1` 抓取，`page>1` 直接返回空（`novel-search.ts:366-369`）。
- 多源跳转卡片：由 `search_sources` 表注入（`novel-provider.ts:29-45`），是四类里唯一真正生效的源配置。
- `detailUrl` 实际是 txt 直链/下载链接，不是资料页。

### 5.2 主要问题

#### 真实缺陷

| 问题 | 证据 | 说明 |
|---|---|---|
| 单源单结果 | `novel-search.ts:131-144`、`256-266` | 每源只取第一条，用户搜索的常见书大概率搜不到 |
| 分页契约失效 | `novel-search.ts:366-369` | API 接受 `page`，但 `page>1` 恒空 |
| 错误未脱敏 + 解析失败与无结果不分 | `novel-search.ts:235-236`、`351-352` | 「未找到 txt 下载链接」与「页面结构变化导致解析失败」被混为同一种错误 |
| dedup_key 可能冲突 | `data-storage.ts:604`、`library-record.ts:152-156` | 两站 id 都是纯数字，`novel:{id}` 会跨站碰撞 |
| 可用性完全依赖 HTML 结构 | `novel-search.ts:132-144`、`256-266` | 正则写死 Angular SSR 结构/表格结构，站点改版即静默失效 |

#### 体验粗糙

- 无封面（知轩 `cover` 恒为空，`novel-search.ts:198`），卡片只能显示图标。
- 文件描述与实际不符：文件头注释仍写 Anna's Archive（`novel-search.ts:1-13`），实现已是 zxcs/奇书网。
- 翻页控件缺失（前端只对 ≤2 条做本地分页，`NovelSearchResultPanel.tsx:145-199`）。

### 5.3 建议改动

| 建议 | 优先级 | 工作量 | 说明 |
|---|---|---|---|
| N1 每源解析前 N 条（如 10 条）并并发拉详情（限并发 3） | P0 | M | 直接解决「搜不到」 |
| N2 dedup_key 加站点前缀（`novel:zxcs:{id}` / `novel:xqs:{id}`） | P0 | S | 需一次性迁移或兼容读取旧的 `novel:{id}` |
| N3 错误分类：`PARSE_FAILED` / `NOT_FOUND` / `SOURCE_UNAVAILABLE`，并脱敏 | P1 | S | 让「站点改版」可被发现而不是当成无结果 |
| N4 支持真实分页或明确「仅首屏」语义 | P1 | M | 若维持单页，应删除 `page` 参数而非假装支持 |
| N5 补封面/作者/字数等字段并落库 | P2 | S | zxcs 无封面时可用站内占位，避免空封面 |
| N6 增加结构化解析兜底（多套选择器） | P2 | M | 降低改版脆性 |

### 5.4 工作量与风险

- N1 是小说体验的根，N2 涉及历史数据兼容，需明确「新旧 key 并存读取」策略。
- 风险：两个站点均为无 SLA 的镜像站，N1 提高请求量后需加最小间隔；N6 只能缓解，不能根治。

---

## 6. 与 JAV 的差距：四类缺的是「机制」，不是「功能点」

| JAV 机制 | 实现位置 | 作用 | 四类状态 |
|---|---|---|---|
| 详情抓取 + 字段缺位判定 | `services/jav-detail-meta.ts:13-70` | 用字段位掩码判断「是否完整」，而不是「是否抓过」 | 无 |
| 详情补全任务（可暂停/继续/停止） | `services/jav-detail-job.ts:300-531` | 批量补齐历史缺字段记录 | 无 |
| 暂时失败 vs 源站缺失 | `jav-detail-meta.ts:286-341` | 暂时失败不消耗重试次数，指数退避 | 无 |
| 搜索时本地库优先 | `providers/jav-provider.ts:151-186` | 命中库即秒回，减少回源 | 无（`library-record.ts` 只做回看，不参与搜索） |
| 失败语义给前端 | `jav-provider.ts:74-78` | 前端区分「查无此号」与「源不可用」 | 无 |
| 榜单快照 + 名次变化 | `services/ranking-snapshot.ts`、`routes/jav.ts:288` | 榜单是独立数据资产，实时性由快照控制 | 无 |
| 推荐（for-you / related） | `routes/recommend.ts:1-50` | 基于用户画像 + 标签名额分配 | 无 |
| 多源跳转卡片（按用户过滤） | `jav-provider.ts:269-278` | 源配置真正生效 | 仅小说 |

结论：

> JAV 的完整不是因为它的数据源更好，而是它把**「详情」「失败」「重试」「本地库」**四件事做成了独立机制。四类要补齐，正确路径是**抽公共机制**，而不是在四个 `*-search.ts` 里各写一遍。

---

## 7. 跨类别共用项（避免四套重复实现）

| # | 共用能力 | 现状缺口 | 建议 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| R1 | 统一失败语义 | `SearchResultBase` 只有 `errors: Record<string,string>`（`search-provider.ts:48-59`），无类型 | 增加 `errorKind` 与「哪个源失败」的结构化列表；路由层统一 `sanitizeError` 兜底 | P1 | M |
| R2 | 多源卡片一致性 | 仅 JAV/小说注入（`novel-provider.ts:27`、`jav-provider.ts:90`），动漫/影视/漫画不注入但 DB 有源配置 | 二选一：① 三类也注入卡片并打开前端 `showRail`（`SearchWorkspace.tsx:141`）；② 删除三类死源配置。推荐 ①，因为源管理 UI 已存在且用户已在配置 | P1 | M |
| R3 | 统一资源模型 | 动漫 4 套结构、影视 2 套、小说 1 套，字段互不相同 | 定义 `MediaResource { source, sourceLabel, title, url, type, size, date, seeders?, leechers?, quality? }`，各类映射到它 | P1 | L |
| R4 | 通用详情补全任务 | 仅 JAV 有（`jav-detail-job.ts`） | 抽象为「按 record_type 注册补全器 + 统一重试元数据」的 `media-detail-job`；JAV 作为首个实现平移 | P1 | XL |
| R5 | 统一分页契约 | 动漫/小说契约失效，漫画双套分页，影视半套 | Provider 返回 `hasMore/cursor`；前端只做服务端分页，删除本地切片 | P2 | M |
| R6 | 缓存策略参数化 | TTL 硬编码 10 分钟（`search.ts:134`） | 按 Provider 配置 TTL；失败/部分失败结果短 TTL 或不缓存 | P2 | S |
| R7 | 归组与去重策略 | `title-grouping.ts` 先到先得；影视按前 30 字符 | 统一「归一化 + 年份 + 类型」去重键；归组冲突按相似度择优 | P2 | M |
| R8 | 榜单/推荐数据基础 | 仅 JAV 有 | `data_records` 本身是类型通用的，可先做「按类型统计的站内热搜/热采」低成本榜单，再评估外部榜单 | P2 | L |
| R9 | 落库归属统一 | 影视用全部资源、动漫优 fallback 用全部资源 | 统一「只用 grouped 首组资源写 sources」，无归组时写 `ungrouped` 且不挂到具体作品 | P0 | S |
| R10 | 源健康度 | 无 | 复用 `source_status_cache` 表（`database/02_schema_search.sql:102-119`，当前未使用）记录源成功率，给管理端与降级策略用 | P2 | M |

### 建议实施顺序

**第 1 批（P0，先止血，互不依赖，可并行）**

1. R9 落库归属（同时覆盖 P0-1）
2. M2 TPB/豆瓣失败可见（P0-2）
3. G1 漫画错误脱敏 + G2 补来源（P0-3/P0-5）
4. N1/N2 小说多结果 + dedup 前缀（P0-4/P0-6）

**第 2 批（P1，共用机制打底）**

5. R1 失败语义 → 四类逐个接入（A5/G1/N3/M2 收敛到同一实现）
6. R2 多源卡片一致性（含前端 `showRail` 与源配置生效）
7. R3 统一资源模型（先影视补 `seeders`，再动漫收敛）
8. 各类能力补齐：A1/A2/A4（动漫）、M3/M4/M5/M6（影视）、G3/G4/G5（漫画）、N3/N4（小说）

**第 3 批（P1 大件，独立排期）**

9. R4 通用详情补全任务（先动漫，再影视/漫画）
10. A3 动漫详情层、M8 剧集季/集

**第 4 批（P2）**

11. R5/R6/R7/R10 + 各自的体验项（A7/A8、M7、G6、N5/N6）

### 排期建议（按「上线可验证」切）

| 批次 | 交付物 | 验收方式 |
|---|---|---|
| 第 1 批 | 4 个 P0 修复 | 分别用「同名多资源电影」「TPB 不可达」「漫画搜索后查库」「小说多结果」四组用例回归 |
| 第 2 批 | 失败语义 + 多源卡片 + 资源模型 | 断源演练：逐个关掉单源，确认前端提示正确且不误报「无结果」 |
| 第 3 批 | 通用补全任务 + 详情层 | 管理端可见补全进度；抽样作品字段完整率 |
| 第 4 批 | 分页/缓存/归组 | 翻页无重复、缓存命中率与超时率对比 |

---

## 8. 优先级与工作量定义

- **P0 用户可见缺陷**：错误数据、数据丢失、静默失败、明显性能瓶颈。
- **P1 能力补齐**：功能缺失导致可用性明显低于 JAV（详情、分页、失败语义、多源生效）。
- **P2 体验优化**：文案、布局、排序手感、缓存细节。

工作量（按改动面与风险，不用工期数字）：

- **S**：单文件局部改动，无数据迁移，可独立回滚。
- **M**：2-5 文件 + 前端联动，可能涉及一次可逆数据修正。
- **L**：跨前后端或引入新接口/新任务，需要灰度与回归。
- **XL**：架构级抽象或批量任务，需独立排期与迁移方案。

---

## 9. 待验证清单（不得凭空假设源站能力）

| 编号 | 待验证项 | 验证方式 |
|---|---|---|
| V1 | 豆瓣 `/j/search_subjects` 是否真的使用 `search_text`（`movie-search.ts:131`） | 用两个差异明显的关键词请求，比对返回是否随词变化 |
| V2 | Bangumi legacy 搜索接口的限流阈值与 `max_results` 上限（`anime-search.ts:652`） | 连续请求观察 429/降级 |
| V3 | showRSS 三个频道 ID（249/252/256）是否仍在更新（`anime-search.ts:583-587`） | 拉取 RSS 看 `pubDate` 新鲜度 |
| V4 | Mikan RSS 单次返回条数上限与 `.torrent` 下载成功率 | 抽样统计 |
| V5 | MangaDex 匿名调用 statistics 的限流策略 | 小流量压测 |
| V6 | 知轩藏书/奇书网当前 HTML 结构是否与正则一致 | 手工抓取比对 |
| V7 | `data_records` 中四类现有记录量与 `detail_completed` 分布 | 只读 SQL 统计（需用户执行） |
| V8 | 四类搜索的实际超时率与各源失败占比 | 观察现有 Workers 日志 |
| V9 | TMDB API Key 配额是否足够支撑影视详情层（M8） | 查 TMDB 账户用量 |

---

## 附录：关键证据索引

- 统一 Provider 契约：`backend/src/services/search-provider.ts:82-110`
- 搜索路由（缓存/历史/落库）：`backend/src/routes/search.ts:81-280`
- 动漫：`backend/src/services/anime-search.ts:651-818`、`backend/src/providers/anime-provider.ts:20-107`
- 影视：`backend/src/services/movie-search.ts:89-398`、`backend/src/providers/movie-provider.ts:30-123`
- 漫画：`backend/src/services/manga-search.ts:32-108`、`backend/src/providers/manga-provider.ts:10-71`
- 小说：`backend/src/services/novel-search.ts:120-398`、`backend/src/providers/novel-provider.ts:22-100`
- 落库：`backend/src/services/data-storage.ts:417-635`、`backend/src/services/data-retention.ts:59-75`
- 回看：`backend/src/services/library-record.ts:109-321`
- JAV 参照：`backend/src/providers/jav-provider.ts:133-278`、`backend/src/services/jav-detail-meta.ts`、`backend/src/services/jav-detail-job.ts`、`backend/src/services/ranking-snapshot.ts`
- 前端结果渲染：`frontend/src/components/search/SearchWorkspace.tsx:117-141`、`frontend/src/config/resultPanels.tsx:12-27`
- 源表数据：`database/07_data_search_sources.sql:148-305`
