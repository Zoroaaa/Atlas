# 搜索 API

> **基础路径**: `https://api.codeseek.pp.ua/api/search`
>
> 所有搜索接口均需认证（Bearer Token），通过 GitHub OAuth 登录获取。

---

## 目录

- [搜索架构概览](#搜索架构概览)
- [统一搜索接口](#统一搜索接口-post-apisearch)
- [动漫搜索](#动漫搜索-categoryanime)
- [影视搜索](#影视搜索-categorymovie)
- [JAV 搜索](#jav-搜索-categoryjav)
- [搜索历史](#搜索历史)
- [错误码参考](#错误码参考)

---

## 搜索架构概览

CodeSeek v4.0 采用**三层搜索架构**，所有搜索请求通过统一的 `/api/search` 入口，根据 `category` + `classification` 路由到对应 Provider。

```
请求: POST /api/search { category, classification, keyword }
                    │
                    ▼
           ┌─────────────────┐
           │  ProviderRegistry │  ← 根据 category 选择 Provider
           └────────┬────────┘
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 animeProvider  movieProvider   javProvider
     │              │              │
     ▼              ▼              ▀────────▶
 bangumi        tmdb          metadata
 mikan           yts           magnet
 nyaa            eztv
 showrss         tpb
```

### 支持的 Category × Classification 矩阵

| Category | Classification | 说明 |
|----------|---------------|------|
| `anime` | `bangumi` | Bangumi 番剧信息搜索 |
| `anime` | `mikan` | Mikan Project 字幕组搜索 |
| `anime` | `nyaa` | Nyaa.si 动漫磁力搜索 |
| `anime` | `showrss` | ShowRSS 订阅源搜索 |
| `movie` | `tmdb` | TMDB 电影/剧集元数据搜索 |
| `movie` | `yts` | YTS 电影种子搜索 |
| `movie` | `eztv` | EZTV 剧集种子搜索 |
| `movie` | `tpb` | TPB 兜底磁力搜索 |
| `jav` | `metadata` | JAV 元数据聚合搜索 |
| `jav` | `magnet` | JAV 磁力链接搜索 |

---

## 统一搜索接口 `POST /api/search`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `category` | string | 是 | 搜索大类：`anime` / `movie` / `jav` |
| `classification` | string | 是 | 搜索分类，见上方矩阵表 |
| `keyword` | string | 是 | 搜索关键词 |
| `page` | number | 否 | 页码，默认 1 |
| `pageSize` | number | 否 | 每页条数，默认 20，最大 100 |
| `sources` | string[] | 否 | 指定搜索源 ID 列表（默认使用该分类下所有启用的源） |

### 请求示例

```json
{
  "category": "anime",
  "classification": "bangumi",
  "keyword": "葬送的芙莉莲",
  "page": 1,
  "pageSize": 10
}
```

### 响应结构

```json
{
  "success": true,
  "data": {
    "category": "anime",
    "classification": "bangumi",
    "keyword": "葬送的芙莉莲",
    "results": [...],
    "total": 42,
    "page": 1,
    "pageSize": 10,
    "sourcesUsed": ["bangumi_api"],
    "queryTimeMs": 123
  }
}
```

---

## 动漫搜索 (`category=anime`)

### classification=bangumi — Bangumi 番剧信息

搜索 Bangumi 数据库中的动画番剧信息。

**数据源：** Bangumi API (v0)

**响应结果类型：** `BangumiSubject[]`

```typescript
interface BangumiSubject {
  id: number;                  // Bangumi 条目 ID
  name: string;                // 中文/日文名称
  nameCn?: string;             // 中文名称
  summary: string;             // 简介
  image?: string;              // 封面 URL
  rating?: number;             // 评分 (0-10)
  rank?: number;               // 排名
  eps?: number;                // 集数
  date?: string;               // 放送日期 "2024-04-07"
  tags?: string[];             // 标签
  collection?: {               // 收藏统计
    doing: number;
    wish: number;
    collect: number;
  };
}
```

**前端面板：** `AnimeSearchResultPanel` → Bangumi 信息卡 + 标签云 + 收藏按钮

---

### classification=mikan — Mikan 字幕组

搜索 Mikan Project 的字幕组资源。

**数据源：** Mikan API (`mikanani.me`)

**响应结果类型：** `MikanItem[]`

```typescript
interface MikanItem {
  id: string;
  title: string;               // 番剧/字幕组名称
  subtitleGroup: string;       // 字幕组名
  episode?: number;            // 集数
  updateTime?: string;         // 更新时间
  subscribeCount?: number;     // 订阅数
  magnet?: string;             // 磁力链接
}
```

**前端展示：** 字幕组名称、订阅数、更新状态、磁力链接（一键复制）

---

### classification=nyaa — Nyaa 动漫磁力

搜索 Nyaa.si 上的动漫种子。

**数据源：** Nyaa.si API (`nyaa.si`)

**响应结果类型：** `NyaaTorrent[]`

```typescript
interface NyaaTorrent {
  id: string;
  title: string;               // 种子标题
  size?: string;               // 文件大小
  seeders?: number;            // 做种数
  leechers?: number;           // 下载数
  downloads?: number;          // 完成下载数
  magnet?: string;             // 磁力链接
  trusted?: boolean;           // 可信上传者标记
  category?: string;           // 分类 (Anime/AMV/etc.)
  date?: string;               // 发布日期
}
```

**特色字段：**
- `trusted`: 绿色圆点标记可信上传者
- 标题含 `1080` 时显示 HD 标记
- 做种数颜色编码：≥10 绿色 / ≥1 黄色 / <1 红色

---

### classification=showrss — ShowRSS 订阅

从 ShowRSS 获取动漫订阅资源。

**数据源：** ShowRSS (`show.info`)

**响应结构：** RSS Feed 解析为统一列表格式

---

## 影视搜索 (`category=movie`)

### classification=tmdb — TMDB 影视元数据

搜索 The Movie Database 的电影和电视剧信息。

**数据源：** TMDB API v3（需配置 `TMDB_API_KEY`）

**响应结果类型：** `TMDBResult[]`

```typescript
interface TMDBResult {
  id: number;                  // TMDB ID
  title: string;               // 标题
  originalTitle?: string;      // 原始标题
  overview: string;            // 简介
  posterPath?: string;         // 海报路径 (相对 URL)
  backdropPath?: string;       // 背景图路径
  releaseDate?: string;        // 上映/首播日期
  voteAverage?: number;        // 评分 (0-10)
  voteCount?: number;          // 评分人数
  popularity?: number;         // 热度值
  genreIds?: number[];         // 类型 ID 列表
  mediaType: 'movie' | 'tv';   // 媒体类型
  adult: boolean;              // 是否成人内容
  originalLanguage: string;    // 原始语言
}
```

**海报图片完整 URL：** `https://image.tmdb.org/t/p/w500{posterPath}`

**前端面板：** `MovieSearchResultPanel` → TMDB 海报卡片 + 评分 + 简介 + 资源列表

---

### classification=yts — YTS 电影种子

搜索 YTS (YIFY) 的电影种子资源。

**数据源：** YTS API (`yts.mx`)

**响应结果类型：** `ResourceItem[]` (source=`yts`)

**支持画质筛选：** 720p / 1080p / 4K（通过 `quality` 参数或标题识别）

---

### classification=eztv — EZTV 剧集种子

搜索 EZTV 的电视剧种子资源。

**数据源：** EZTV API (`eztv.re`)

**响应结果类型：** `ResourceItem[]` (source=`eztv`)

**特色：** 包含季(S)/集(E) 信息，支持按剧集定位

---

### classification=tpb — TPB 兜底磁力

The Pirate Bay 作为影视搜索的兜底数据源。

**数据源：** TPB (`thepiratebay.org`)

**响应结果类型：** `ResourceItem[]` (source=`tpb`)

**用途：** 当 YTS/EZTV 无结果时自动补充

---

### 影视通用资源格式

```typescript
interface ResourceItem {
  title: string;               // 资源标题
  source: 'yts' | 'eztv' | 'tpb';  // 来源标识
  resourceType: 'torrent' | 'drive' | 'direct';  // 资源类型
  magnet?: string;             // 磁力链接
  driveUrl?: string;           // 网盘链接
  directUrl?: string;          // 直链
  size?: string;               // 文件大小
  seeders?: number;            // 做种数
  quality?: string;            // 画质 (720p/1080p/4K)
  season?: number;             // 季数 (仅剧集)
  episode?: number;            // 集数 (仅剧集)
}
```

---

## JAV 搜索 (`category=jav`)

> 详细文档见原 [JAV 搜索文档](./jav.md)，以下为简要说明。

### classification=metadata — 元数据聚合

聚合 DMM/FANZA、JavBus、JavDB 三方元数据。

**响应结果类型：** `JAVSearchResultItem[]`

关键字段：`id`, `title`, `actress`, `studio`, `releaseDate`, `coverUrl`, `rating`

### classification=magnet — 磁力链接搜索

多源磁力聚合 + 智能排序（热度优先）。

**响应结果类型：** `MagnetLink[]`

---

## 搜索历史

### `GET /api/search/history`

获取当前用户的搜索历史记录（支持全类别）。

#### Query 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `category` | string | 否 | 过滤类别：`anime` / `movie` / `jav`，不传则返回全部 |
| `limit` | number | 否 | 返回条数，默认 20，最大 50 |

#### 响应

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": "gh_abc123",
      "category": "anime",           // 新增：搜索类别
      "keyword": "葬送的芙莉莲",
      "classification": "bangumi",
      "resultCount": 5,
      "coverImage": "https://...",   // 新增：封面图
      "createdAt": "2026-06-15T10:30:00Z"
    }
  ]
}
```

#### 特性
- **封面图展示**：历史列表直接显示封面缩略图（v4.0 新增）
- **分类过滤**：可按 anime/movie/jav 分别查看
- **点击回搜**：点击历史条目自动填充搜索参数并执行搜索
- **自动清理**：保留最近 30 天记录

---

## 错误码参考

| HTTP Code | Error Code | 说明 |
|-----------|------------|------|
| 400 | `INVALID_CATEGORY` | 不支持的搜索类别 |
| 400 | `INVALID_CLASSIFICATION` | 该类别下不支持的分类 |
| 400 | `KEYWORD_REQUIRED` | 关键词不能为空 |
| 401 | `UNAUTHORIZED` | 未登录或 Token 过期 |
| 429 | `RATE_LIMITED` | 请求过于频繁（每分钟限制） |
| 500 | `SOURCE_ERROR` | 搜索源请求失败 |
| 500 | `PROVIDER_NOT_FOUND` | 对应类别的 Provider 未注册 |
| 503 | `SOURCE_TIMEOUT` | 搜索源超时 |

---

## 使用流程（前端）

```typescript
// 1. 用户选择类别 → 加载对应分类列表
const classifications = getClassifications('anime');
// => ['bangumi', 'mikan', 'nyaa', 'showrss']

// 2. 用户输入关键词 → 发起搜索
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    category: 'anime',
    classification: 'bangumi',
    keyword: '葬送的芙莉莲'
  })
});

// 3. 根据渲染对应 ResultPanel
const panel = category === 'anime' ? <AnimeSearchResultPanel />
  : category === 'movie' ? <MovieSearchResultPanel />
  : <JAVSearchResultPanel />;
```
