# 源站现状与替换建议（实测）

> 日期：2026-11-12
> 范围：动漫 / 影视 / 漫画 / 小说四类当前在用的源 + 候选替代源。
> 方法：本地 `wrangler dev`（workerd）与 Node/PowerShell 直连双重探测；能记录请求头、状态码、Content-Type、响应长度、字段结构。
> 结论只保留实测有数据或明确失败（4xx/验证码/结构为空）的源；无法测通的单列，不做“应该可用”的推断。

---

## 0. 先说明测试环境的硬限制（影响结论可信度）

本机所有域名都被本地网络设备解析到 `198.18.0.x`（对比 1.1.1.1 结果相同），并做 TLS 拦截。表现为：

- 部分域名的证书返回 `*.cybereason.net`（本地安全设备），或直接 `socket disconnected / handshake failure`；
- 同一 URL 在 Node、PowerShell、workerd 下结果不一致（例如 TPB 在 Node 可用、在本地 workerd 报 `internal error`）。

因此：

- **可下结论**：拿到了真实数据（200 + 可解析字段），或源站明确返回 4xx/验证码/空集合。
- **不能下结论**：只在本机 TLS 层失败的源。本文一律标「未能实测（本地网络拦截）」，不据此建议下线。

生产环境是 Cloudflare Workers 出站，与本地网络不同；下表「生产可用性」需以线上为准。

---

## 1. 当前在用的源：逐个实测

### 1.1 动漫

| 源 | 实际端点 | 实测结果 | 判定 |
|---|---|---|---|
| Bangumi | `api.bgm.tv/search/subject/{kw}?type=2&responseGroup=large&max_results=6` | 200，11KB JSON，返回封面/简介/评分/排名/集数/制作/标签/收藏数 | **能抓，保留** |
| Mikan | `mikanani.me/RSS/Search?searchstr={kw}` | 200，85KB RSS，条目含标题/页面链接；磁力需再抓 `.torrent` 解析 | **能抓，保留**（抓取成本高，见 3.1） |
| AnimeTosho | `feed.animetosho.org/json?q={kw}` | 本地 workerd `internal error`；Node 因本地证书拦截失败 | **未能实测**（不据此下线） |
| showRSS | `showrss.info/show/{249,252,256}.rss` | 200，但频道实际是：249=The Curse of Oak Island、252=MasterChef: The Professionals、256=Into The Badlands；均为欧美真人秀/剧集，**不是动漫** | **已失效**（频道 ID 被站点重新分配，关键词过滤后必然为空） |
| Nyaa | `nyaa.si/?page=rss&q={kw}&c=1_0&f=0` | 本地 200，77KB RSS 含 seeders；但代码注释记录生产 Workers 出站被 Nyaa 拦截（CF 验证） | **生产不可用**（本地可访问不足以推翻既有线上结论） |

### 1.2 影视

| 源 | 实际端点 | 实测结果 | 判定 |
|---|---|---|---|
| TMDB | `api.themoviedb.org/3/search/multi` | 无 key 返回 401（端点正常）；线上有 key | **能抓，保留（唯一主元数据）** |
| 豆瓣 | `movie.douban.com/j/search_subjects?...&search_text={kw}` | 200，但 `{"subjects":[]}`；**去掉 `search_text` 仍为空**；换关键词（星际穿越）同样为空 | **已失效**（接口还在，但不再返回搜索结果） |
| TPB | `apibay.org/q.php?q={kw}&cat=0` | Node 直连 200，29KB，返回 name/info_hash/seeders/leechers/size/added；本地 workerd 通道报 internal error | **能抓，保留**（workerd 失败是本地环境问题） |
| EZTV | `eztv.re/api/get-torrents?imdb_id=...` | 200，2.5KB，返回 filename/magnet_url/title/season/episode/**seeds/peers/size_bytes**/date | **能抓，保留**（当前代码丢了 seeds/peers，见 3.2） |

### 1.3 漫画

| 源 | 实际端点 | 实测结果 | 判定 |
|---|---|---|---|
| MangaDex | `api.mangadex.org/manga?title=...&includes[]=cover_art` | 用代码里的 `Atlas/1.0` UA：200，11KB JSON；用普通 Chrome UA：403 `Bot challenge not passed` | **能抓，保留；必须保留自定义 UA** |

MangaDex 实际返回字段远多于当前映射：`title/altTitles/description/year/status/tags/lastChapter/links/availableTranslatedLanguages/latestUploadedChapter`；当前只用了 `title/cover/status/tags`。

### 1.4 小说

| 源 | 实际端点 | 实测结果 | 判定 |
|---|---|---|---|
| 知轩藏书 | `zxcs.zip/search?q={kw}&page=N` | 200，554KB HTML，每页 10 条；`page=1/2/3` 返回不同书籍（已用真实关键词「修仙」验证）；详情页可解析 txt 直链 | **能抓，保留** |
| 奇书网 | `http://www.xqishuta.org/search.html?searchkey={kw}` | 400：`The plain HTTP request was sent to HTTPS port`（Cloudflare） | **当前实现已失效**：站点只收 HTTPS。HTTPS 版本因本地 TLS 拦截未能实测 |

---

## 2. 候选源：实测结果与字段

### 2.1 动漫

| 候选 | 类型 | 实测 | 字段 | 结论 |
|---|---|---|---|---|
| Bangumi v0 | 元数据 | 200，3 条/9.8KB；`POST api.bgm.tv/v0/search/subjects` | date/platform/images/summary/name_cn/tags/infobox/rating/collection/eps/total_episodes/type | 可用，但 legacy 已覆盖当前所需字段；仅在做详情层（P1 A3）时值得切 |
| AniList | 元数据 | 200 GraphQL，1 条/1.3KB | id/title(romaji,native)/coverImage/startDate/description/episodes/averageScore/genres/studios | 可用；无中文标题，适合做 Bangumi 失败时的 fallback，不替换主源 |
| DMHY RSS | 资源 | 200，1.96MB，72 条 | title/link/pubDate/enclosure/description 内嵌 magnet；**无 seeders** | **可用，推荐替代 showRSS**；代价是单次响应约 2MB |
| SubsPlease | 资源 | 本地 workerd `internal error`；Node 证书被本地拦截 | — | 未能实测，不纳入建议 |
| Jikan | 元数据 | 同上（本地 TLS 拦截） | — | 未能实测，不纳入建议 |

### 2.2 影视

| 候选 | 类型 | 实测 | 字段 | 结论 |
|---|---|---|---|---|
| Torrentio | 资源聚合 | 首次 200，237KB；随后多次 `internal error` | streams[].name/title(含 seeders/大小/来源)/infoHash/fileIdx | **可用但不稳定**：需线上复测后再接入；单条 payload 明显大于 TPB/EZTV |
| TVMaze | 元数据 | 200，1.5KB | name/premiered/image/summary/genres/rating/externals | 仅剧集，且返回的是 1980 年 BBC 剧而非同名电影；**不能替代 TMDB**，最多做剧集补充 |
| 1337x | 资源 | 403 Cloudflare `Just a moment...` | — | **实测不可用** |
| YTS | 资源 | 本地 TLS 握手失败 | — | 未能实测，不纳入建议 |
| OMDB | 元数据 | 401 `No API key provided` | — | 需付费 key，不替换 TMDB |

### 2.3 漫画

| 候选 | 类型 | 实测 | 字段 | 结论 |
|---|---|---|---|---|
| MangaUpdates | 元数据 | 200，25 条/30KB；`POST api.mangaupdates.com/v1/series/search` | title/url/description/image/type/year/bayesian_rating/rating_votes/genres/last_updated | **可用，推荐作为第二元数据源/降级源** |
| Kitsu | 元数据 | 200，3 条/19KB | canonicalTitle/synopsis/startDate/averageRating/posterImage/coverImage/chapterCount/volumeCount/status/subtype/serialization | 可用；字段最全，但英文为主，作为备选 |
| AniList | 元数据 | 200，3 条/2.6KB | title/coverImage/startDate/description/chapters/averageScore/genres | 可用；字段少而干净，可做轻量兜底 |
| ComicK | 元数据 | 本地 workerd `internal error` | — | 未能实测，不纳入建议 |
| Jikan | 元数据 | 本地 TLS 拦截 | — | 未能实测，不纳入建议 |

### 2.4 小说

| 候选 | 类型 | 实测 | 字段 | 结论 |
|---|---|---|---|---|
| 豆瓣图书 suggest | 元数据 | 200，0.6KB/3 条 | title/url/pic/author_name/year | **可用**；适合补封面/作者/年份，不提供下载 |
| OpenLibrary | 元数据 | 200，2.4KB/3 条 | title/author_name/cover_i/first_publish_year/ebook_access(borrowable)/has_fulltext | 可用；以公版/外文为主，不能作为中文网文下载源 |
| Anna's Archive | 下载/搜索 | 本地 workerd internal error | — | 未能实测，不纳入建议 |
| Gutendex | 元数据 | 本地超时/拦截 | — | 未能实测，不纳入建议 |
| SoBooks | 下载 | 200 但是「搜索验证」人机校验页 | — | **实测不可用** |

---

## 3. 换 / 不换：逐类结论

### 3.1 动漫

**元数据：不换。**
Bangumi 已经是四类里字段最完整的元数据源（封面、简介、评分、排名、集数、制作、标签、收藏数），AniList 不提供中文名，替换会降低中文体验。

**资源：换掉 showRSS，补 DMHY。**
- showRSS 三个频道 ID 已指向欧美剧，实测 0 条动漫，属于纯无效源；继续保留只会增加 3 个请求和超时风险。
- DMHY RSS 实测 72 条真实动漫资源，标题/发布时间/详情页/magnet 齐全，中文组覆盖明显优于 showRSS。
- 代价：DMHY 单次约 2MB，是 showRSS 的 6~7 倍；必须保留 10 分钟缓存并限制解析条数（只解析前 20 条 magnet）。
- AnimeTosho 无法实测，不动；Nyaa 维持禁用。

字段对比（showRSS → DMHY）：`title + magnet + 频道时间` → `title + magnet + 详情页 + 发布时间`；两者都无 seeders，做种数仍需依赖 Nyaa/AnimeTosho。
抓取成本：3 请求/约 320KB → 1 请求/约 2MB。**用带宽换有效覆盖，值得，但必须缓存。**

### 3.2 影视

**元数据：移除豆瓣，不新增替代。**
豆瓣接口实测稳定返回空集合，留着只会让 `doubanError`、去重和归组多一条永远无结果的链路。TMDB 中文已覆盖标题/简介/海报/年份/评分。TVMaze 只覆盖剧集且匹配的是同名老剧，不适合补位；OMDB 需要 key。

**资源：保留 TPB + EZTV，补字段；Torrentio 待线上复测后决定。**
- TPB、EZTV 均实测有真实数据；当前代码把 TPB 的 `seeders/leechers`、EZTV 的 `seeds/peers/size_bytes` 丢弃了，属于“源给了但没接”，应优先补 `ResourceItem.seeders/leechers`，而不是急着换源。
- Torrentio 聚合了 TPB/Rutracker/1337x 等多源，字段含做种数/大小/来源，但实测不稳定且单条 237KB；建议先在线上 Worker 用真实 TMDB ID 跑一周，通过后再作为第三资源源接入。
- 1337x 被 CF 验证码拦截，不接。

字段对比（TPB/EZTV → Torrentio）：当前模型缺 `seeders/leechers/quality`；Torrentio 直接给做种数/大小/来源，但 `infoHash` 需要自行拼 magnet，且没有稳定的 `size` 数值（在 title 文本里）。
抓取成本：TPB 1 请求/29KB + EZTV 1 请求/2.5KB → Torrentio 1 请求/237KB。**不建议替换，建议补充。**

### 3.3 漫画

**不换主源，增加 MangaUpdates 作为第二源。**
MangaDex 实测可用（必须保留自定义 UA），且是唯一提供章节/翻译语言/封面的源；MangaUpdates 补的是 MangaDex 搜索接口没有的年份、评分、简介、封面，且一次请求 30KB、25 条，成本低。

字段对比（MangaDex 当前映射 → + MangaUpdates）：
- 现有：title/cover/status/tags
- 补充：year/description/rating/rating_votes/image/genres
抓取成本：+1 请求 / +30KB。

Kitsu 字段更全但英文为主；AniList 轻量。两者可作为 MangaUpdates 失败时的第二降级，但第一批只建议加 MangaUpdates，避免一次引入三套去重。

### 3.4 小说

**保留知轩；奇书网先修 HTTPS，修不好就下线；封面/作者用豆瓣图书补。**
- 知轩实测：分页、详情、txt 直链全部可用，是当前小说下载的唯一可靠源。
- 奇书网：HTTP 端点已明确 400（站点只收 HTTPS），当前实现等于失效。改为 `https://` 后若线上仍不可用，应从 `NovelSourceResult` 中移除，避免每次搜索多 15s 超时。
- 豆瓣图书 suggest 实测返回 title/author/year/cover，0.6KB；只用于补卡片元数据，不参与下载。
- OpenLibrary 只适合公版/外文，不解决中文网文；Anna's Archive/Gutendex/SoBooks 未通过实测，不纳入。

字段对比（知轩 → 知轩 + 豆瓣图书）：`title/author/description/format/size/txt直链` → 增加 `cover/year`。
抓取成本：+1 请求 / +0.6KB。**低成本，建议做。**

---

## 4. 建议的落地顺序（与修复批次对应）

| 顺序 | 动作 | 优先级 | 理由 |
|---|---|---|---|
| 1 | 小说奇书网 `http://` → `https://`，并补一次线上实测；失败则移除该源 | P0（源已失效） | 当前每次搜索都在等一个必然 400 的请求 |
| 2 | 动漫移除 showRSS，接入 DMHY RSS（限制解析条数 + 沿用 10 分钟缓存） | P1 | 无效源换有效源，直接提升资源覆盖率 |
| 3 | 影视移除豆瓣元数据分支；TPB/EZTV 补 seeders/leechers/size | P1 | 去掉死链路，补上源站已经返回的质量字段 |
| 4 | 漫画增加 MangaUpdates 作为第二元数据源（失败降级 MangaDex） | P1 | 字段补齐成本最低的一类 |
| 5 | 小说增加豆瓣图书 suggest 补封面/年份 | P1 | 0.6KB/次，解决小说卡片无封面 |
| 6 | Torrentio 线上灰度验证后再决定是否作为第三影视资源源 | P2 | 本地实测不稳定，不能直接上线 |
| 7 | Nyaa 恢复需代理方案；1337x/YTS/Anna's/Gutendex/SoBooks 不接入 | — | 实测被 CF/验证码/本地网络阻断 |

---

## 5. 未测成清单（明确原因）

以下项目没有拿到可用数据，也没有据此做“换/不换”判断：

| 项目 | 原因 |
|---|---|
| AnimeTosho（当前源） | 本地 workerd `internal error`；Node 被本地证书拦截（`*.cybereason.net`） |
| 奇书网 HTTPS | 本地 TLS 握手失败（同上的网络拦截）；HTTP 已确认 400 |
| Jikan（动漫/漫画） | 本地 TLS 拦截 |
| SubsPlease | 本地 TLS 拦截 |
| ComicK | 本地 workerd `internal error` |
| YTS | 本地 TLS 握手失败（SSL alert 40） |
| Anna's Archive | 本地 workerd `internal error` |
| Gutendex | 25s 超时 |
| Torrentio 稳定性 | 首次 200/237KB，后续连续 `internal error`，未完成 10 次以上稳定性验证 |

> 这些项若要在生产判断，需要在 Cloudflare Workers 线上环境用真实请求再跑一轮；本地网络结果不代表线上。
