# Atlas 四类搜索改造终稿（动漫 / 影视 / 漫画 / 小说）

> **本文已降级为核对证据存档，不再是实施依据。** 设计以 `search-architecture-2026-11-20.md` 为准；本文的事实核对（第 1 节）与实测数据（附录 B）仍然有效，可继续引用。

> 核对基线：`main` @ `5cd4694`（2026-11-20），工作区无未提交改动。
> 核对方法：① 逐行读实现；② 在本地用真实命名格式跑 `groupResourcesBySubject`；③ 2026-11-20 对 apibay / EZTV / MangaDex / Bangumi / 豆瓣 / 知轩 / 奇书网 发真实请求。
> 本文替代初稿《Atlas-四类改造方案.md》。**只保留能改变决策的结论**，初稿中已被推翻的部分在第 1 节说明后就地废弃，不进入路线图。
> 范围：四类搜索的准确性、成功率、完整性、可用性。不含 JAV。

---

## 0. 结论

**准确性的根因不是"源不够多"，而是三个确定性缺陷：作品没有身份（靠标题子串事后拼接）、外部源的降级响应当成空结果、本地库只写首条因此没有复用价值。** 修掉这三处，绝大多数"搜不到 / 搜错 / 点不动"消失；扩源与结构化字段是第二梯队。

据此重排优先级，与初稿的差异集中在四点：

| 初稿判断 | 终稿判断 | 依据 |
|---|---|---|
| 先修归组（U1–U4），再做结构化 | **同意，但 U3 的前提被低估**：Bangumi 旧版搜索接口的 `infobox` 是空的，拿不到别名，必须先切 v0 | 实测 legacy `infobox` 为空、v0 有 `别名` |
| Bangumi v0 放 P2 | **v0 是 U3 的前置条件，必须 P0** | 同上 |
| TPB `cat=200` 待验证 | **已验证可用，且 `cat=0` 是确认缺陷**：短词查询 85% 命中成人分类 | 实测 `q=her` |
| 失败语义已区分（`tmdbError`） | **不成立，`tmdbError` 是死代码** | `.catch(() => [])` 吞掉了异常 |

### 0.1 按本方案改完，四个维度各自能到哪

区分"确定性修复"（有实测证据、改完必然生效）与"概率性改善"（依赖别名覆盖率与源站状态）。

| 维度 | 确定性提升 | 概率性提升 | 不会提升 |
|---|---|---|---|
| 准确性 | 影视同名不同年、短词误命中（G1'/G3）接近归零；动漫续作吞并（G1）与两字标题漏匹配（G2）修掉 | 动漫罗马音资源归位（取决于别名覆盖率，v0 同请求别名可覆盖主要作品）；漫画中文标题 0/20 → 中文名存在即命中 | 无 ID 关联时，长尾作品仍会 ungrouped；同一作品多语种译名不在候选集内时依然匹配不上 |
| 成功率 | 小说重复搜索从 22 请求降到 2；影视 TPB 不再被静默降级 | 影视资源命中率（取决于 apibay 降级频率，需上线观测） | 华语片/国产剧的资源覆盖（TPB 以英文种名为主）；Nyaa 不可用导致的动漫源缺口 |
| 完整性 | 影视 EZTV 从"每剧 30 条"到全量（《权游》146 条） | TPB 关键词多样化带来的作品覆盖 | 动漫/影视的本地库库存（磁力会死，只入元数据）；小说若奇书网下线则源数减少 |
| 可用性 | 空磁力行不再出现死链接；体积排序修正；漫画"暂无中文译本"提示；动漫/影视按集分组 | 质量分排序的可信度（受限于只有 AnimeTosho 提供做种数） | 无做种数源的排序质量；Mikan 磁力解析条数（方案不提高上限，只改呈现） |

**结论**：可用性与准确性是"改完就见效"；成功率的提升集中在小说与影视两处；完整性提升最小，因为四类里有两类的资源本身易失。

### 0.2 方案改不动的三个天花板

1. **资源源的可达性**：Nyaa 在 Workers 出站被拦、1337x 403、YTS 未测通。动漫只有 AnimeTosho 提供做种数，影视只有 TPB + EZTV。不解决可达性（代理/镜像），"资源丰富度"这条线封顶。
2. **作品没有稳定 ID**：归组只能靠标题。真正的解法是 ID 关联（Mikan 按番剧 ID 的订阅 RSS、种名里的 TMDB/IMDB 号），方案把它列为待验证，未纳入 P0。不做它，长尾永远有 ungrouped。
3. **别名冷启动**：别名在"搜过之后"才入库。已在 P0 用 v0 同请求别名 + 华语片同步取 `alternative_titles` 补掉主要场景，但**冷门作品的首搜仍可能匹配不上**，需要一次离线批量灌别名才能根治。

---

## 1. 初稿逐条核对

判定口径：**成立**＝代码或实测与初稿一致；**修正**＝方向对但事实/顺序/成本有偏差；**推翻**＝结论不成立；**未覆盖**＝初稿漏掉但影响决策。

### 1.1 通用归组引擎

| # | 初稿断言 | 核对结果 | 判定 |
|---|---|---|---|
| 1 | G1 续作吞噬：游郭篇资源全归基础作品 | 复现：`groups=[["base",1],["yukaku",0]]`。根因是先到先得 + 包含匹配 | 成立 |
| 2 | G1' 同名不同年都归 2021 | 复现：`2021→[a,b]`、`1984→[]`。补充：资源侧年份**没有**被 `normalizeTitle` 丢掉（`dune 1984 bluray grp`），作品侧却完全没把 `year` 纳入候选——这是可低代价修掉的 | 成立，根因需补充 |
| 3 | G2 两字标题（银魂）0 命中 | 复现：`0 命中`。同一 3 字符下限对拉丁标题同样生效：`It` / `Up` / `Us` 全部 0 命中 | 成立，范围需扩大 |
| 4 | G3 Her 子串误命中 | 复现，且更严重：`The.Mother` 与 `Where.the.Crawdads.Sing` 都被归入 Her（"where" 里也含 "her"） | 成立，影响被低估 |
| 5 | G4 罗马音资源进 ungrouped | 复现：`ungrouped=2`。补别名后 `2/2` 命中 | 成立 |
| 6 | G5 动漫资源不按 infoHash 去重 | 成立：`resourceId: (r) => r.magnet`，各源 `dn`/tracker 不同即不同字符串 | 成立 |
| 7 | U1 最佳匹配（最长命中优先） | 方向正确，且比初稿设想更强：**打分制可同时解决 G1/G1'/G3**，不需要新增强制性的"年份 ±1 硬约束"（该约束会误杀未标年份的资源） | 成立，方案可简化 |
| 8 | U2 词边界 + 取消 3 字符下限 | 成立，但实现前提被忽略：`isTitleMatch` 只拿到归一化后的整串，`/` 已被压成空格，**分段信息在这一步就丢了**，必须在归一化前切段 | 修正 |
| 9 | U3 别名来自 Bangumi `infobox` 的「别名」 | **不成立**：legacy `/search/subject` 与 `/subject/{id}` 的 `infobox` 均为空（实测 keys 为空串）；别名只在 v0 返回 | 推翻（改法见 2.2） |
| 10 | "别名系统已有，只是归组没用上" | 部分成立：`entity_aliases` 表与 `listAliasRowsByCanonical` 都有，但 `ingestBangumiSubjects` 只写 `name`/`name_cn`，别名表里没有 "Sousou no Frieren" | 修正 |
| 11 | U4 infoHash 去重（兼容 hex 与 base32） | 成立：影视侧 `extractHash` 只认 40 位 hex，动漫侧 `btihBase32ToHex` 已有可复用 | 成立 |
| 12 | U5 抽"normalizeTitle 现在丢弃的信息" | 表述有误：`normalizeTitle` **保留**年份、`bluray`、`webrip`、`s04e09`，**丢弃**的是 `- 05` 这种集数写法和 `01-12` 区间。因此不能从它反推集数，必须独立解析 | 修正 |
| 13 | U7 回归用例可直接写入 `title-grouping.test.ts` | 归组层可以；但四类抓取服务的解析函数（`parseDmhyRss` / `parseAnimeToshoHtml` / `parseZxcsSearchResults` / `parseQsxDetailPage` 等）**一个都没导出**，抓取层无法测 | 修正 |

### 1.2 动漫

| # | 初稿断言 | 核对结果 | 判定 |
|---|---|---|---|
| 14 | Bangumi 旧版每页 10 条、Mikan 需抓 `.torrent`、DMHY 约 2MB、Nyaa 恒空 | 全部与代码一致 | 成立 |
| 15 | Mikan / DMHY 无做种数，排序时恒为 0 | 成立。补充：四个源里**只有 AnimeTosho 有做种数**，所以"按做种数排序"实际效果是"把 AnimeTosho 顶到前面，其余保持源顺序" | 成立，影响需说明 |
| 16 | 磁力源只抓第 1 页 | 成立（`wantTorrents = safePage === 1`） | 成立 |
| 17 | "只在本源内排序，不跨源合并去重" | 成立（代码注释原话） | 成立 |
| 18 | 整次搜索 4 源并行、10 分钟缓存 | 成立 | 成立 |
| 19 | 落库只存首条 Bangumi 作品，且只存归到该作品的资源 | 成立。补充：若首条作品 0 资源，则**一条磁力都不落库**，`source_count=0` 会在 180 天后被保留策略删除 | 成立，需补保留策略 |

### 1.3 影视

| # | 初稿断言 | 核对结果 | 判定 |
|---|---|---|---|
| 20 | TMDB `search/multi` 中英各一次 | 成立，但**英文结果没有合并进 `results`**，只用于取英文标题。中文查询无命中而英文有时，结果直接为空 | 修正（初稿漏） |
| 21 | 元数据去重键 `mediaType\|年份\|标题前40字符` | 成立 | 成立 |
| 22 | TPB `cat=0`、每词前 20；EZTV 前 5 剧集、`limit=30` | 成立 | 成立 |
| 23 | 失败语义已区分（`tmdbError`/`tpbError`/`eztvError`） | **不成立**：`searchTMDB(...).catch(() => [])` 让 `zhMetaRes` 永不 rejected，`tmdbError` 恒为 `null`，`errorKinds.tmdb` 永不写入 | 推翻 |
| 24 | TPB 并发限制名存实亡 | 成立：`limitedKeywords.map(async …)` 在创建 Promise 时就发请求，批循环只是等待 | 成立 |
| 25 | `cat=0` 名额被非视频占用（待验证） | **已验证**：`q=her&cat=0` 返回 100 条，其中 85 条属 5xx 成人分类，Top20 中 16 条非视频；`cat=200` 返回 100 条，分类仅 201/207/208/212 | 成立且升级为 P0 |
| 26 | EZTV 只取最新 30 条；分页与季集参数待验证 | **分页可用**（`page=2` 返回不同条目，`torrents_count` 给真实总数，GoT=146）；**季集参数无效**（`season`/`episode` 被忽略，返回与不带参数相同） | 修正（改法变了） |
| 27 | TPB 关键词最多 6 个 | 成立，但 `slice(0,6)` 会被同一作品的"标题 + 标题+年份"占满，排在末尾的本地别名通常直接被截断 | 修正（初稿漏） |
| 28 | 资源源只有 TPB + EZTV，中文覆盖弱 | 成立 | 成立 |

### 1.4 漫画

| # | 初稿断言 | 核对结果 | 判定 |
|---|---|---|---|
| 29 | MangaDex 只用主标题，中文在 `altTitles` 里没请求 | 成立，且比初稿更严重（见下） | 成立 |
| 30 | `description` 类型声明了但没映射 | 成立 | 成立 |
| 31 | 可读性字段（`availableTranslatedLanguages` / `lastChapter` / `links`）一个没用 | 成立 | 成立 |
| 32 | 无章节作品比例待实测 | 实测 Top20（按 follow 数）中 **15/20 无中文译本**（`availableTranslatedLanguages` 不含 zh/zh-hk） | 已验证 |
| 33 | 展示标题应为中文 | 实测更差：Top20 中 **0/20 的 `title` 含中文，19/20 只有 `ja-ro` 罗马音**。以「葬送的芙莉莲」为例，`title` 只有 `{"ja-ro":"Sousou no Frieren"}`，中文只存在于 `altTitles["zh-hk"]`（繁体） | 成立，且需简繁转换 |
| 34 | 13 个跳转源 | 成立（`12_seed_sources_manga.sql` 13 条） | 成立 |

### 1.5 小说

| # | 初稿断言 | 核对结果 | 判定 |
|---|---|---|---|
| 35 | 两源、GBK、Cookie 反爬门 | 成立。实测：`GET /` 返回 403 + 2 条 Set-Cookie，重放第一条即 200 / 40KB | 成立 |
| 36 | 每页 10 本 + 详情页并发 3，最多 22 个请求 | 成立（2 个搜索页 + 20 个详情页） | 成立 |
| 37 | 知轩无封面、两站不做跨站去重 | 成立 | 成立 |
| 38 | 豆瓣图书 suggest 可补封面（待验证） | 实测可用：613 字节返回 title/url/pic/author | 已验证 |
| 39 | 落库只存第一本 | 成立 | 成立 |

### 1.6 跨类别

| # | 初稿断言 | 核对结果 | 判定 |
|---|---|---|---|
| 40 | 抓取器运行结果没有持久化，只有关注表有 `fail_count` | 成立（`source-status.ts` 是按关键词探 URL、缓存 5 分钟，不记录抓取器自身） | 成立 |
| 41 | 熔断可注入 `live-sources.ts` 的 skip 集合 | 成立，但 skip 目前只有"用户关源"一种语义，注入失败态需区分来源，否则管理端会误显示"用户关闭" | 修正 |
| 42 | 入库写入器泛化 `upsertWorksToLibrary` | **不准确**：该函数是 JAV 专用（内部 `inspectJavCode`、硬编码 `record_type='jav'`、`jav:` 前缀），且承担番号归一化，泛化它等于把 JAV 规则带进四类。正确做法是复用 `data-storage.ts` 的 `upsertRecord` + `insertSources` | 推翻（改法变了） |

**小结：42 条中成立 26 条、需修正 12 条、推翻 4 条。** 推翻的 4 条都不影响"先修归属、再补字段、最后入库"的大顺序，但改变了三个具体做法（Bangumi 必须切 v0、EZTV 不能按季集拉、入库不复用 JAV 写入器）。

---

## 2. 缺陷清单（按影响排序）

### 2.1 归组引擎：三个可单测的确定性缺陷

`backend/src/utils/title-grouping.ts`，四类共用，改动面最小、收益最大。

现行匹配是"精确 → 互相包含 → 前两词包含"，且按作品顺序先到先得。三个缺陷互相放大：

| 编号 | 现象 | 实测量化 | 根因 |
|---|---|---|---|
| A1 | 续作吞资源 / 同名不同年混在一起 / 顺序决定归属 | `鬼灭之刃` 抢走游郭篇；`Dune 1984` 归到 2021；把作品顺序对调，归属跟着对调 | 无打分，先到先得；作品侧无年份候选 |
| A2 | 短标题漏匹配 | `银魂`、`It`、`Up` 全部 0 命中 | 3 字符下限对 CJK 与拉丁一视同仁 |
| A3 | 短词子串误命中 | `Her` 抢走 `The Mother`、`Where the Crawdads Sing` | 包含匹配无词边界/无分段 |

**为什么必须打分而不是打补丁**：三个缺陷的修法互相冲突——加长匹配（修 A2）会放大 A3；加年份约束（修 A1）会误杀无年份资源；只做词边界（修 A3）修不了 A2 的 `银魂 / Gintama`（分隔符在归一化时已被压成空格）。只有"先切段、再打分、最后全局分配"能同时满足。

### 2.2 别名供给链断裂

初稿认为别名"已有只是没用上"。实际是**供给端就没供上**：

1. legacy 搜索接口 `infobox` 为空 → 前端拿不到「别名」；
2. `ingestBangumiSubjects` 只写 `name`（日文）与 `name_cn`（中文），不写罗马音/英文；
3. 归组只读 `[nameCN, name]`，连已入库的别名都没读。

实测 v0 接口 `POST /v0/search/subjects`（`limit=10`，20KB）**在同一次请求里带 `infobox.别名`**：

```
别名 = ["Frieren: Beyond Journey's End", "Sousou no Frieren", "葬送的芙莉蓮"]
```

所以 G4 的正确修法是"切 v0 + 灌别名 + 归组读别名"三件事一起做，任何一件单独做都无效。

> 注意：**不要指望 kana→romaji 兜底**。`buildQueryVariants` 对「葬送のフリーレン」产出的是 `sousou no furiiren`，与社区通用的 `Frieren` 对不上。

### 2.3 外部源的"降级响应"被当成"空结果"

这是初稿完全没覆盖、但对"成功率"影响最大的一类问题。

**apibay 实测**：同一关键词 `inception` 首次请求返回 200 条结果，几分钟后再请求返回 `[{"id":"0","name":"No results returned",…}]`（HTTP 200，长度 239）；`joker` / `avatar` / `oppenheimer` / `the dark knight` 稳定返回该形态，而 `matrix` / `dune` / `star wars` 正常。**降级响应的结构与"真的没有资源"完全相同**，代码里 `if (items[0]?.name === 'No results returned') return []` 直接当空处理。

后果：用户看到"没有资源"，日志里没有任何错误，`tpbError` 也不会置位——这类失败**不可观测**。再叠加 6 个关键词同时发请求（1.4 第 24 条），触发概率被放大。

同类问题另外两处：

| 位置 | 表现 | 后果 |
|---|---|---|
| `movie-search.ts` | `searchTMDB().catch(() => [])` | TMDB 全挂时 `tmdbError` 恒 null，前端走空态（`results/resources/errorNotices` 三者皆空） |
| `anime-search.ts` | Mikan 磁力解析超过 7s 预算即放弃 | 第 11–30 条资源 `magnet=''`，前端渲染成 `href=""` 的链接 + 复制空串 |

### 2.4 动漫：空磁力行与假排序

- Mikan 每次最多返回 30 条，只为前 10 条解析 `.torrent`（`MIKAN_TORRENT_LIMIT=10`），其余 20 条 `magnet:''`。前端 `AnimeGroupedView` 把 `item.magnet` 直接当 `href`，不判断空值 → 点击等于刷新页面，复制按钮复制空串，而 `detailUrl` 在资源行里没有渲染入口。
- 排序：`sortBy='seeders'` 对 Mikan/DMHY 恒为 0，实际效果是"AnimeTosho 有值排前，其余保持源顺序"，不是质量排序。
- 另一个廉价 bug：`sortBy='size'` 用 `parseFloat("1.4 GB")` 得 1.4，跨单位比较错序（900 MB 会排在 1.4 GB 前面）。

### 2.5 漫画：中文用户看到的不是中文

实测数据（MangaDex 按 follow 数 Top20）：

| 指标 | 结果 |
|---|---|
| `title` 含中文 | 0 / 20 |
| 只有 `ja-ro`（罗马音）而无 `en` | 19 / 20 |
| `availableTranslatedLanguages` 含 zh / zh-hk | 5 / 20 |
| `lastChapter` 为空 | 14 / 20 |

即：**用户用中文搜到了，列表里显示罗马音，点进去大概率没有中文可读**。三处都要改，缺一不可。

补充两条实现事实：

- 中文名常落在 `zh-hk`（繁体），需要 OpenCC 转简（`opencc-js` 已是依赖）。
- `latestUploadedChapter` 是章节 **UUID**，不是话数；要显示"最新第 N 话"必须再查 `/chapter/{id}`。列表页只显示"最近更新"或批量取（`ids[]=` 单次最多 100）更划算。

### 2.6 本地库只写不读，且会被静默清理

- `persistDataRecord` 对四类都只写首条（`bgm[0]` / `results[0]` / `manga[0]` / `novels[0]`），四类搜索路径一次都不读 `data_records`。
- `data-retention.ts`：`detail_completed=0 AND source_count=0` 且 180 天未更新 → 删除。四类写入时 `detail_completed` 恒 0，因此**没有资源的记录会被静默清掉**（动漫首条作品 0 资源时正是这种）。
- 初稿的 15 073 / 357 / 266 / 228 / 214 / 41 条统计**无法核实**（无生产库访问权限），但机制足以解释量级：库存 ≈ 历史搜过的不同关键词数，不是作品数。

---

## 3. 改造路线

排序原则：**先修"归属错误 + 静默失败"（用户立刻可见、可单测），再补展示字段，最后做入库**。入库建立在归属正确之上，否则把错误放大 100 倍。

### Phase 0｜可测性（0.5 天，所有人的前置）

现在四类抓取服务零单测，解析函数全部内联未导出。不先做这一步，后面所有"回归集"只能覆盖归组，覆盖不了抓取。

| 项 | 做法 | 为什么 |
|---|---|---|
| 0-1 | 把 `parseDmhyRss`、`parseAnimeToshoHtml`、`parseMikanRss`、`parseZxcsSearchResults`、`parseZxcsDetailPage`、`parseQsxSearchResults`、`parseQsxDetailPage` 改为 `export`（不搬文件，避免无关 diff） | 出问题最多的是解析层，而它现在完全不可测 |
| 0-2 | 为每个解析器留 1 份真实响应夹具（`.txt` 放 `__tests__/fixtures/`，截断到 5 条即可） | 源站改版时，测试先红而不是线上先崩 |
| 0-3 | `title-grouping.test.ts` 补附录 A 的 8 个用例 | 归组是四类共用，回归成本最低 |
| 0-4 | 先落一条最小度量日志：`{category, keyword, resources, grouped, ungrouped, degraded_empty, elapsed}` | Phase 1 的验收要求"改前/改后"对比；没有基线就只能人工抽检。这条日志 10 行代码，**必须在动归组之前上线** |

### Phase 1｜P0：归属、静默失败、可用性（约 3 天）

#### P0-1 归组引擎打分化（`utils/title-grouping.ts`）

| 决策 | 内容 | 为什么 |
|---|---|---|
| 切段先于归一化 | 新增 `titleSegments(raw)`：按 `/`、`｜`、`-`、`：` 切分后再逐段 `normalizeTitle` | 现在 `/` 在归一化时被压成空格，`银魂 / Gintama` 的分段信息永久丢失，无法做"整段相等" |
| 打分替代布尔 | `scoreSubject(segments, candidates, ctx)` 返回分值：段级完全相等 1000；段级前缀（后接季/集/年份标记）880；拉丁全词边界包含 800；否则 0 | 一次性覆盖 A1/A2/A3；`Her` 对 `the mother` 得 0 分（词边界） |
| 候选带年份 | `GroupConfig` 增加 `subjectYear?: (s) => string`；资源侧从标题解析 4 位年份 | G1' 的唯一低代价修法：`Dune 1984` 候选与资源年份一致得分更高，无需"±1 年硬约束"（会误杀无年份资源） |
| 全局分配 | 先算 (资源 × 作品) 分数矩阵，再按分数降序贪心分配，一条资源只归最高分作品；同分比标题长度、再比年份接近度 | 先到先得是 A1 的直接成因；`资源 ≤ 300 × 作品 ≤ 10` 的矩阵成本可忽略 |
| 移除"前两词包含" | 删除 `firstTwoSubject` 分支 | 它是 G1 的放大器，打分制下无存在必要 |
| 2 字符标题 | 只允许"段级完全相等"或"段级前缀 + 集数/年份标记"，不做包含 | 修 `银魂` / `It` / `Up`，同时不放开误命中 |

**验收**：附录 A 全绿；30 关键词集上 `ungrouped` 占比下降 ≥30%（同一批关键词跑改前/改后对比）；`Her` 用例中 `The Mother`、`Where the Crawdads Sing` 均进 `ungrouped`。

#### P0-2 Bangumi 切 v0 + 别名灌入（`anime-search.ts` + `alias-ingest.ts`）

| 决策 | 内容 | 为什么 |
|---|---|---|
| 搜索接口换 v0 | `POST https://api.bgm.tv/v0/search/subjects?limit=10&offset=N`，body `{keyword, filter:{type:[2]}}` | 唯一能一次拿到 `infobox.别名` 的接口；legacy 该字段为空 |
| 字段映射 | `air_date→date`、`eps_count→eps`、`rank→rating.rank`、`studio` 从 `infobox['动画制作']` 取（v0 有值） | 实测 v0 无 `air_weekday`（前端未使用，可直接丢）；`platform`/`total_episodes` 为新增可用字段 |
| 分页 | `offset = (page-1)*10`，`total` 取响应 `total` | 实测 offset 生效、`total` 可靠 |
| 回退 | v0 失败时回落 legacy，且**只在 v0 失败时**置 `errors.bangumi` | 双通道会掩盖 v0 的长期故障，必须先看到它坏 |
| 别名灌入 | `ingestBangumiSubjects` 增加 `别名` 写入（`lang` 按含汉字/含拉丁分别记为 `zh`/`en`/`romaji`），`source='bangumi'` | 现在别名表里没有罗马音，U3 无处可读 |
| 归组读别名 | **优先用 v0 响应里的 `infobox.别名`**（同一次请求已返回，首次搜索即生效）；再用 `listAliasRowsByCanonical(db,'work',['bangumi:1',…])` 批量取库内别名做跨源补充 | 只读库会踩冷启动：别名是在搜索**之后**由 `waitUntil` 灌入的，而首次搜索的归组结果已被 10 分钟缓存固定——第二次命中缓存也不会重算，等于第一次搜错、之后十分钟一直错 |

**成本**：v0 10 条 20KB，与 legacy 11KB 同量级；多一次 D1 查询（批量，单次往返）。

**风险**：v0 的 `total` 与 legacy 不同（同一关键词 5 vs 9），`hasMore` 会变化，前端"加载更多"需复测。

#### P0-3 影视源三处硬缺陷（`movie-search.ts`）

| 项 | 做法 | 为什么 |
|---|---|---|
| 分类过滤 | `cat=0` → `cat=200`，并用响应里的 `category` 字段二次校验（只保留 200–299） | 实测 `q=her`：`cat=0` 的 100 条里 85 条是 5xx 成人分类，Top20 有 16 条非视频；`cat=200` 干净。这既是准确性问题也是内容安全问题 |
| 真并发 | `limitedKeywords.map(async…)` 改为 `mapWithConcurrency(limitedKeywords, 3, async (t) => { try { return await searchTPB(t) } catch (e) { return { __error: e } } })` | `mapWithConcurrency` 在 `fn` 抛错时整体 reject，必须内部 try/catch 才能保留"部分成功"语义 |
| 降级识别 | `No results returned` 不再直接 `return []`：标记为 `degraded`，间隔 ≥800ms 重试 1 次；仍空则不计 `tpbError`，但写入健康指标 | 实测该响应与真空结果同形，直接当空会让"源挂了"永远不可见 |
| 关键词多样性 | `slice(0,6)` 前按作品轮转：先每个作品取主标题，再补年份变体，最后补本地别名 | 现在同一作品的两个变体会挤掉其他作品的标题和别名 |
| TMDB 错误可见 | 去掉 `.catch(() => [])`；中英两路 `allSettled` 后合并去重（保留英文独有结果） | 修死代码 `tmdbError`；同时补回"中文无命中但英文有"的覆盖 |
| 华语片首搜 | 若 TPB 关键词全部为非拉丁（中文原名），**同步**取 top-1 的 `/movie/{id}/alternative_titles`（1 次请求）再补关键词 | 别名是搜索后 `waitUntil` 灌的：首次搜中文片名，TPB 必然 0 条，且该结果被缓存 10 分钟。不补这一步，"华语片第一次搜永远没资源"，只能等缓存过期 |

**验收**：日志里 TPB 实际并发峰值 ≤3；`q=her` 类短词返回 5xx 占比 0；人为让 TMDB 返回 500 时前端出现"元数据服务暂时不可用"。

#### P0-4 漫画标题与可读性（`manga-search.ts`）

| 项 | 做法 | 为什么 |
|---|---|---|
| 标题取值 | `title.zh → title['zh-hk'](转简) → title.en → altTitles 中 zh/zh-hk/en → ja-ro` | 实测 Top20 中 0 条 `title` 含中文、19 条只有罗马音 |
| 简介 | `description.zh → zh-hk(转简) → en` | 现在完全没映射，简介只来自 MangaUpdates 补全 |
| 可读性 | `availableTranslatedLanguages` 无 zh/zh-hk 时在卡片上显式标注"暂无中文译本" | 实测 15/20 无中文译本，不提示等于让用户白点 |
| 外链 | `links.raw` / `links.engtl` 作为"官方生肉/官方英文"入口 | 实测两字段稳定存在 |
| 更新信息 | 只展示 `updatedAt`（或批量 `/chapter?ids[]=` 取话数），**不逐条查 `latestUploadedChapter`** | 它是 UUID 不是话数；逐条查会变成新的 N+1 |

#### P0-5 小说抓取降本（`novel-search.ts`）

| 项 | 做法 | 为什么 |
|---|---|---|
| 详情解析缓存 | 以 `(site, bookId)` 为 key 写 Cache API，TTL 7 天；命中则跳过详情页抓取 | TXT 书籍内容几乎不变，是四类里最适合缓存的；把热词从 22 请求降到 2 |
| 跨站合并 | 合并键 `normalizeTitle(书名)+normalizeTitle(作者)`，一本书展示为多下载源 | 现在同一本书在两站各出现一次 |
| 奇书网熔断 | 连续 3 次失败后 15 分钟内跳过（状态落 D1，不落内存） | 每 isolate 内存态不共享，内存熔断在 Workers 上无效 |
| 封面 | 豆瓣图书 `subject_suggest` 补封面/作者/年份（实测 613B 可用） | 知轩 `cover:''`，卡片无图 |

### Phase 2｜P1：结构化与展示（约 1 周）

| 项 | 做法 | 为什么 |
|---|---|---|
| 发布标题解析 | 新增 `utils/release-title.ts`：`parseReleaseTitle(raw)` → `{season, episode, isBatch, resolution, source, codec, group, year, subtitle}`。**不改 `normalizeTitle`** | `normalizeTitle` 被 4 处调用，改它会连带影响匹配；且它保留 `s04e09`、删掉 `- 05`，本来就不能反推集数 |
| 动漫按集展示 | 作品 → 季/集 → 资源（组/分辨率/字幕）三层；`isBatch` 单独一组 | 番剧资源天然按集组织，现在平铺 100+ 条要用户自己找 |
| 影视按季集 | 用 EZTV 已有的 `season`/`episode` 字段本地分组 + `page` 翻页补老剧 | **实测季集参数无效**，只能翻页后本地分组；当前代码把 `season`/`episode` 丢掉了 |
| 质量分排序 | `score = f(分辨率, 来源, 编码, 做种数, 体积合理性)`，权重配置化 | 现在"按做种数"实际是"按源排序"，Mikan/DMHY 恒 0 永远沉底 |
| 空磁力行 | 动漫资源行：`magnet` 为空时渲染"去详情页"，不给可点击的空链接 | 现状是 `href=""` + 复制空串 |
| 体积排序 | 解析成字节再比 | `parseFloat("1.4 GB")` 跨单位错序 |
| TPB 关键词扩展 | 复用 `lookupQueryVariants` 的拼音/繁体变体，补华语片覆盖 | 现有关键词只有英文名（TPB 索引以英文为主，但港台片常有中文名种子） |

### Phase 3｜P2：入库与本地优先（约 1–2 周）

**先纠正一个前提**：初稿把四类统称"目录入库"，但四类的资源生命周期完全不同。

| 类 | 资源形态 | 入库价值 | 结论 |
|---|---|---|---|
| 小说 | TXT 直链，几乎不变 | 高：元数据+直链都可长期复用 | 先做 |
| 漫画 | 元数据（章节在源站） | 高：元数据稳定，且能补"有无中文译本" | 次做 |
| 动漫 | 磁力，做种数天级衰减 | 低：磁力会死，只有元数据值钱 | 只入元数据，不入资源 |
| 影视 | 磁力，同上 | 低 | 只入元数据 |

| 项 | 做法 | 为什么 |
|---|---|---|
| 批量写入器 | 复用 `data-storage.ts` 的 `upsertRecord` + `insertSources`，导出 `persistBatch(records)` | `upsertWorksToLibrary` 是 JAV 专用（`inspectJavCode`、硬编码 `record_type='jav'`），泛化会把 JAV 规则带进四类 |
| 保留策略兼容 | 入库时至少写 1 条 `detail` 来源（如"来源：MangaDex 详情"） | 否则 `source_count=0` 会在 180 天后被 `data-retention` 删掉 |
| 本地优先 | 先 `WHERE record_type=? AND title LIKE ?`（前缀）走 `idx_data_records_type_title`；未命中再回源并入库 | 前缀 LIKE 能走索引，`%kw%` 不能；1.5 万行全扫虽可接受，但入库增长后必须换策略 |
| 上限 | 每类设入库条数上限，按热度截断，沿用 `cron_locks` | D1 写放大是硬约束 |

> FTS5 trigram 是否可用仍未验证；**不要用它阻塞 Phase 3**——现有数据量下 LIKE 足够，等单类超 10 万行再说。

### Phase 4｜P2：源健康（可与 Phase 2 并行）

| 项 | 做法 | 为什么 |
|---|---|---|
| 健康表 | `scraper_health(source_key, hour_bucket, ok, empty, error, timeout, last_ok_at)`，**只在非 ok 时写** | 每次搜索都写会把 D1 写放大一倍；只在失败时写，正常路径零成本 |
| 金丝雀 | 复用现有 `5 * * * *` 小时 cron + `getUTCHours()` 判断（与 `cover.gc` 同法），用固定已知关键词打每个抓取器 | 不新增 cron 表达式，避免改 `wrangler.toml`；专抓"200 但恒空"（apibay 降级、豆瓣空集合这类） |
| 熔断 | 读健康表最近 30 分钟连续失败 ≥N → 加入 skip，15 分钟后半开 | skip 目前只有"用户关源"语义，需加 `reason` 区分，否则管理端会误显示"已关闭" |
| 指标 | 每次搜索落一条结构化日志：`ungrouped_ratio`、`degraded_empty`、`magnet_missing_ratio`、各源耗时/错误率 | 修完要能证明改善，而不是凭感觉 |

---

## 4. 度量与验收

### 4.1 指标定义（必须能归因）

| 指标 | 定义 | 目标 |
|---|---|---|
| `ungrouped_ratio` | `ungrouped / (grouped + ungrouped)`，按类别统计 | 相对基线下降 ≥30% |
| `misattribution_rate` | 人工抽检 30 条资源中归属错误的比例 | 影视 <10%、动漫 <15% |
| `degraded_empty` | 源返回"可疑空"（apibay `No results returned`）的次数 / 总请求 | 可见且有重试，不追求 0 |
| `magnet_missing_ratio` | 动漫 `magnet===''` 的资源占比 | <15%（当前 Mikan 每页结构性放弃约 2/3 的磁力解析） |
| `zh_title_ratio` | 漫画展示标题含中文的比例（20 个中文书名） | ≥80% |
| `external_requests_per_search` | 单次搜索的外部请求数 | 小说：缓存全中 ≤4，全新 ≤22 |

### 4.2 验收标准

- 附录 A 的 8 个归组用例全绿，且**先红后绿**（当前 A1–A3 应失败）。
- 30 关键词集（热门 10 / 续作 10 / 冷门别名 10）跑改前改后，`ungrouped_ratio` 与人工错配率都有数字。
- 影视：`q=her`、`q=it` 类短词在 TPB 返回结果中 5xx 分类占比为 0。
- 漫画：20 个中文书名，展示中文标题 ≥16 个；无中文译本的作品 100% 有提示。
- 小说：同一本书跨站只出现一次（抽检 20 本两站都有的书）。

### 4.3 测试策略

| 层 | 现状 | 目标 |
|---|---|---|
| 归组 | 仅 2 个 `normalizeTitle` 用例 | 补 A1–A3 共 8 例，含"顺序对调归属不变" |
| 解析器 | 零覆盖、函数未导出 | 导出 + 夹具驱动（DMHY RSS / AnimeTosho HTML / zxcs 搜索页与详情页 / 奇书网搜索页与详情页） |
| 服务 | 零覆盖 | 不引入 MSW；用"解析器 + 纯函数"覆盖 80% 风险面即可，网络层靠金丝雀 |
| 前端 | `AppShell.test.tsx` 等 | 归组视图增加"空 magnet 不渲染链接"的用例 |

---

## 5. 风险与不做的事

**必须同步的动作**

1. 用户可见变化（漫画中文标题、无中文译本提示、动漫按集、空磁力行改为"去详情页"）必须在**同一次改动内**同步帮助中心：`helpContent.ts` 章节 + 三语文案 + 跑 `helpContent` 守卫测试。这是 `AGENTS.md` 第 7 节的硬约束。
2. 归组与排序变了但缓存键没变 → 10 分钟内仍是旧结构。**所有 Phase 1 改动都要升缓存 key 版本**（`&v=2`）。
3. `errors.bangumi` 的语义会随 v0 切换变化，前端"部分源失败"提示要复测。

**明确不做**

| 不做 | 理由 |
|---|---|
| 新增影视/动漫资源源（1337x、YTS、Torrentio） | 1337x 实测 403；YTS 本地未测通；Torrentio 首次 200 后连续 internal error。现有源的问题在"用错"，不在"不够" |
| AI 翻译标题做别名 | 成本高且不可审计；Bangumi v0 + TMDB alternative_titles 已够覆盖 |
| 全站爬取入库 | 两站总书量未知，D1 容量与写放大都不可控；先做"搜索过的词入库 + 分类页增量" |
| 用 `normalizeTitle` 反推季集 | 它保留 `s04e09`、删掉 `- 05`，信息已不可逆 |
| 内存态熔断 | Workers 每 isolate 独立，熔断状态必须落 D1 |

---

## 6. 剩余待验证（3 项，均不阻塞 Phase 1）

| # | 项 | 验证方法 | 影响 |
|---|---|---|---|
| 1 | 知轩、奇书两站总书量 | 抓分类页翻到底计数 | 决定 Phase 3 入库上限；不影响 Phase 1 |
| 2 | D1 是否支持 FTS5 trigram | 在测试库执行 `CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram')` | 不可用则退回 LIKE；不阻塞 |
| 3 | 奇书网搜索 POST 的 GBK 编码在当前反爬门下是否仍可用 | 用 GBK 编码的 `searchkey` 发 POST，检查返回是否含 `<li><span class="s1">` | 决定是否下线该源；下线只影响小说完整性 |

> 已在本次核对中解决的初稿待验证项：apibay `cat=200`（可用）、EZTV 分页与季集（分页可用/季集无效）、MangaDex 字段完整度与无章节比例（已量化）、豆瓣图书 suggest（可用）。

---

## 附录 A：归组回归用例（实测输出已标注）

| 用例 | 作品（顺序即入参顺序） | 资源 | 期望 | 当前实测 |
|---|---|---|---|---|
| 续作归属 | `鬼灭之刃`(id1)、`鬼灭之刃 游郭篇`(id2) | `[LoliHouse] 鬼灭之刃 游郭篇 / Kimetsu no Yaiba - Yuukaku-hen - 05 [WebRip 1080p]` | 归 id2 | ❌ 归 id1 |
| 基础作品 | 同上 | `[LoliHouse] 鬼灭之刃 / Kimetsu no Yaiba - 12 [WebRip 1080p]` | 归 id1 | ✅ |
| 顺序无关 | 同上（id2 在前） | 同"续作归属" | 归 id2 | ⚠️ 恰好通过，说明结果是顺序决定的 |
| 同名不同年 | `Dune`(2021)、`Dune`(1984) | `Dune.1984.1080p.BluRay.x264-GRP` | 归 1984 | ❌ 归 2021 |
| 短词误命中 | `Her`(2013) | `The.Mother.2023.1080p.WEBRip.x264-GRP`、`Where.the.Crawdads.Sing.2022.1080p` | 均 ungrouped | ❌ 两条都归 Her |
| 罗马音 | `葬送的芙莉莲 / 葬送のフリーレン` | `[SubsPlease] Sousou no Frieren - 05 (1080p)` | 归该作品 | ❌ ungrouped（补 `Sousou no Frieren`、`Frieren` 别名后 ✅） |
| 两字标题 | `银魂` | `[Group] 银魂 / Gintama - 300 [BDRip 1080p]` | 归该作品 | ❌ ungrouped |
| 剧集命名（防回退） | `怪奇物语 / Stranger Things` | `Stranger.Things.S04E09.1080p.WEB.H264-GRP` | 归该作品 | ✅ |

### 归一化实测（写新匹配器时的输入形态）

```
"Dune.1984.1080p.BluRay.x264-GRP"      => "dune 1984 bluray grp"     // 年份保留
"Dune (2021)"                           => "dune"                     // 括号内年份被删
"[LoliHouse] 鬼灭之刃 游郭篇 / … - 05"   => "鬼灭之刃 游郭篇 kimetsu no yaiba yuukaku hen"
"[Group] 银魂 / Gintama - 300 …"        => "银魂 gintama"             // 分段符已丢
"The.Mother.2023.1080p.WEBRip.x264-GRP" => "the mother 2023 webrip grp"
"Stranger.Things.S04E09…"               => "stranger things s04e09 web grp"  // SxxExx 未删
"[SubsPlease] Sousou no Frieren - 05"   => "sousou no frieren"
```

结论：**年份与 `SxxExx` 在归一化后仍可解析，`- 05` 已不可恢复**。所以年份可以在 P0 直接用，集数必须走独立解析器（Phase 2）。

---

## 附录 B：本次实测原始数据

| 对象 | 请求 | 结果 |
|---|---|---|
| apibay | `q=her&cat=0` | 100 条，85 条属 5xx，Top20 中 16 条非视频 |
| apibay | `q=her&cat=200` | 100 条，分类仅 201/207/208/212 |
| apibay | `q=inception`（首次） | 100 条，`category:"207"` |
| apibay | `q=inception/joker/avatar/oppenheimer`（随后） | 200 + `[{"id":"0","name":"No results returned"}]`（239B） |
| EZTV | `imdb_id=0944947&limit=3` | `torrents_count:146`，返回 3 条 |
| EZTV | 同上 `&page=2` | 返回不同条目（分页生效） |
| EZTV | 同上 `&season=4&episode=9` | 与不带参数完全相同（季集被忽略） |
| Bangumi | legacy `/search/subject/…?responseGroup=large` | `infobox` 为空数组 |
| Bangumi | legacy `/subject/400602?responseGroup=large` | 88KB，`infobox` 仍为空 |
| Bangumi | `POST /v0/search/subjects` | 3 条 14.8KB / 10 条 20KB，含 `别名`、`rating.rank`、`platform`、无 `air_weekday` |
| Bangumi | v0 `offset=0/2` | 返回不同条目，`total=5` 稳定 |
| MangaDex | `title=葬送的芙莉莲` | `title={"ja-ro":"Sousou no Frieren"}`；`altTitles` 含 `en`/`zh-hk`/`ja`/`ko`/`ru`；`description` 含 `zh-hk`/`en`；`availableTranslatedLanguages` 无 zh；`lastChapter=""`；`latestUploadedChapter` 为 UUID；`links` 含 `raw`/`engtl`/`mal`/`mu` |
| MangaDex | Top20 `order[followedCount]=desc` | `title` 含中文 0/20；仅罗马音 19/20；有中文译本 5/20；`lastChapter` 空 14/20 |
| 豆瓣图书 | `book.douban.com/j/subject_suggest?q=三体` | 200，613B，含 title/url/pic/author |
| 知轩 | `zxcs.zip/search?q=修仙&page=1` | 200，553KB |
| 奇书网 | `GET /` | 403 + 2 条 Set-Cookie；重放首条 cookie → 200 / 40KB |

> 生产环境是 Cloudflare Workers 出站，与本次本地直连的网络路径不同（尤其 EZTV 会 302 到 `eztvx.to`、apibay 可能按 IP 分片）。上表结论用于判断"接口是否支持某参数/字段是否存在"，**具体的失败率与限流阈值必须上线后用 `scraper_health` 观测**，不能直接当作生产数值。
