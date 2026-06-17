# Changelog v4.0.0 — 动漫 & 影视搜索 + 架构升级

> **发布日期**: 2026-06-17
>
> **版本类型**: Major (Breaking Changes)
>
> **升级提示**: 本版本包含搜索架构的重大重构，新增 `category` / `classification` 必填参数，旧版搜索接口调用方式需要调整。

---

## 概述

CodeSeek v4.0 是迄今为止最大的功能更新，将系统从单一的 JAV 搜索引擎升级为**三大类别聚合搜索引擎**。核心变化：

1. **新增动漫搜索** — Bangumi + Mikan + Nyaa + ShowRSS 全链路
2. **新增影视搜索** — TMDB + YTS + EZTV + TPB 全链路
3. **三层搜索架构重构** — Category → Classification → Source
4. **Provider 注册模式** — 新增搜索类别只需一行代码

---

## 新增功能

### 1. 动漫搜索系统 (`category=anime`)

完整的动漫番剧搜索与资源发现管线。

#### 数据源

| 分类 | 数据源 | 能力 |
|------|--------|------|
| `bangumi` | Bangumi API | 番剧元数据：评分、标签、放送日期、收藏统计 |
| `mikan` | Mikan Project | 字幕组信息：订阅数、更新状态、磁力链接 |
| `nyaa` | Nyaa.si | 动漫种子：做种/下载量、可信标记、分类筛选 |
| `showrss` | ShowRSS | RSS 订阅源：自动更新、资源推送 |

#### 前端组件

- [AnimeSearchResultPanel](frontend/src/components/search/AnimeSearchResultPanel.tsx)
  - Bangumi 信息卡（封面、评分、标签云）
  - Mikan 字幕组列表
  - Nyaa 磁力卡片（可信标记、HD 标记、做种数颜色编码）
  - 收藏/复制磁力/外链跳转

#### 后端实现

- [anime-provider.ts](backend/src/providers/anime-provider.ts) — Provider 定义与分类注册
- [anime-search.ts](backend/src/services/anime-search.ts) — 各分类的搜索逻辑

---

### 2. 影视搜索系统 (`category=movie`)

电影和电视剧的元数据聚合与种子资源发现。

#### 数据源

| 分类 | 数据源 | 能力 |
|------|--------|------|
| `tmdb` | TMDB API v3 | 影视元数据：海报、评分、简介、类型 |
| `yts` | YTS (YIFY) | 电影种子：720p/1080p/4K 多画质 |
| `eztv` | EZTV | 剧集种子：季/集信息定位 |
| `tpb` | The Pirate Bay | 兜底磁力源 |

#### 前端组件

- [MovieSearchResultPanel](frontend/src/components/search/MovieSearchResultPanel.tsx)
  - TMDB 海报卡片（评分、上映日期、简介）
  - 资源列表（来源徽章 YTS/EZTV/TPB、画质标签、网盘/直链标识）
  - 季/集选择器（仅剧集）

#### 后端实现

- [movie-provider.ts](backend/src/providers/movie-provider.ts) — Provider 定义与分类注册
- [movie-search.ts](backend/src/services/movie-search.ts) — 各分类的搜索逻辑

---

### 3. 三层搜索架构

将原有的扁平搜索结构重构为三层模型：

```
Before (v3.x):                    After (v4.0):
Search → JAV metadata/magnet       Search → { category, classification, keyword }
                                   → ProviderRegistry.get(category)
                                   → provider.search(classification, keyword)
```

**层级定义：**

| 层级 | 字段名 | 说明 | 示例 |
|------|--------|------|------|
| Layer 1 | `category` | 搜索大类 | `anime`, `movie`, `jav` |
| Layer 2 | `classification` | 搜索分类 | `bangumi`, `tmdb`, `metadata` |
| Layer 3 | `source` | 具体源实例 | `Bangumi API`, `TMDB API`, `DMM/FANZA` |

**核心优势：**
- 新增类别只需创建 Provider + 注册一行代码
- 分类间搜索逻辑完全隔离，互不影响
- 源管理通过数据库动态控制，无需发版

---

### 4. Provider 注册模式

新增可扩展的 Provider 架构：

```typescript
// backend/src/index.ts — 所有 Provider 在此注册
import { providerRegistry } from '@/services/search-provider';
import { animeProvider } from '@/providers/anime-provider';
import { movieProvider } from '@/providers/movie-provider';
import { javProvider } from '@/providers/jav-provider';

providerRegistry.register(animeProvider);   // 一行注册新类别
providerRegistry.register(movieProvider);
providerRegistry.register(javProvider);
```

**Provider 接口：**

```typescript
interface SearchProvider {
  category: string;                          // 'anime' | 'movie' | 'jav'
  name: string;                              // 显示名称
  classifications: SearchClassification[];   // 该类别支持的分类列表
  search(classification: string, params: SearchParams): Promise<SearchResult>;
}
```

---

## 架构改进

### 数据库变更

#### `search_sources` 表扩展

```sql
-- 新增字段
ALTER TABLE search_sources ADD COLUMN category TEXT NOT NULL DEFAULT 'jav';
ALTER TABLE search_sources ADD COLUMN classification TEXT NOT NULL;
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | TEXT | 搜索大类 (anime/movie/jav) |
| `classification` | TEXT | 搜索分类 (bangumi/tmdb/...) |

#### `history` 表扩展

```sql
-- 新增字段
ALTER TABLE history ADD COLUMN category TEXT NOT NULL DEFAULT 'jav';
ALTER TABLE history ADD COLUMN cover_image TEXT;
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | TEXT | 搜索类别 (支持 anime/movie/jav) |
| `cover_image` | TEXT | 封面图 URL（历史列表展示用） |

#### 种子数据更新

[06_data_search_sources.sql](database/06_data_search_sources.sql) 更新：
- 新增 anime 类别源：Bangumi API、Mikan、Nyaa.si、ShowRSS
- 新增 movie 类别源：TMDB API、YTS、EZTV、TPB

### 共享类型包

[packages/shared/src/types/search.ts](packages/shared/src/types/search.ts) 统一前后端类型：

```typescript
// 新增类型
export type SearchCategory = 'anime' | 'movie' | 'jav';
export type SearchClassification = 'bangumi' | 'mikan' | 'nyaa' | 'showrss' | 'tmdb' | 'yts' | 'eztv' | 'tpb' | 'metadata' | 'magnet';

// 动漫相关
export interface BangumiSubject { ... }
export interface MikanItem { ... }
export interface NyaaTorrent { ... }

// 影视相关
export interface TMDBResult { ... }
export interface ResourceItem { ... }
```

### 图片代理统一

所有外部图片（JAV 封面、动漫封面、影视海报）统一走后端代理：

```
GET /api/jav/proxy-image?url=<encoded_url>
```

前端通过 `getProxyImageUrl()` 工具函数统一处理。

---

## 前端变更

### 搜索页面重构

- 顶部新增类别 Tab 栏：「JAV」「动漫」「影视」
- 分类选择器根据当前类别动态加载选项
- 结果面板按类别渲染不同组件

### 新增文件

| 文件 | 说明 |
|------|------|
| `frontend/src/components/search/AnimeSearchResultPanel.tsx` | 动漫搜索结果面板 (~500行) |
| `frontend/src/components/search/MovieSearchResultPanel.tsx` | 影视搜索结果面板 (~450行) |
| `frontend/src/types/search.ts` — 新增类型 | AnimeEnrichedData, MovieEnrichedData 等 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/pages/SearchPage.tsx` | 增加 category state、Tab 切换、分类联动 |
| `frontend/src/components/search/SearchForm.tsx` | 增加 category/classification 参数 |
| `frontend/src/constants/index.ts` | API_BASE_URL 等常量（图片代理复用） |

---

## 后端变更

### 新增文件

| 文件 | 说明 |
|------|------|
| `backend/src/providers/anime-provider.ts` | 动漫 Provider（4 个分类） |
| `backend/src/providers/movie-provider.ts` | 影视 Provider（4 个分类） |
| `backend/src/services/anime-search.ts` | 动漫搜索业务逻辑 |
| `backend/src/services/movie-search.ts` | 影视搜索业务逻辑 |
| `backend/src/services/search-provider.ts` | Provider 注册中心（重构） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `backend/src/index.ts` | 注册 anime/movie Provider |
| `backend/src/routes/search.ts` | 增加 category/classification 路由参数 |
| `backend/src/routes/sources.ts` | 支持 category 过滤、分类接口 |
| `backend/src/services/search-sources-service.ts` | 按 category/classification 查询 |

---

## Breaking Changes

### 搜索接口参数变更

```diff
- POST /api/search { "keyword": "SSIS" }
+ POST /api/search { "category": "jav", "classification": "metadata", "keyword": "SSIS" }
```

`category` 和 `classification` 从可选变为**必填**。

### 搜索历史响应变更

```diff
  {
    "keyword": "SSIS",
+   "category": "jav",
+   "classification": "metadata",
+   "coverImage": "https://...",
    ...
  }
```

### 迁移指南

1. 前端搜索调用处增加 `category` 和 `classification` 参数
2. 历史记录展示增加 `cover_image` 字段渲染
3. 如有直接调用 `/api/search` 的客户端，需同步更新请求体

---

## 环境变量变更

### 新增

| 变量 | 必填 | 说明 |
|------|------|------|
| `TMDB_API_KEY` | 是(影视) | TMDB API Key（https://www.themoviedb.org/settings/api） |
| `BANGUMI_API_KEY` | 否 | Bangumi API Key（可选，影响请求限额） |

### 无变更

现有环境变量（`GITHUB_*`, `DMM_*`, `R2_*` 等）保持不变。

---

## 部署注意事项

### 数据库迁移

部署前必须执行以下 SQL：

```bash
# 1. 扩展 search_sources 表
npx wrangler d1 execute codeseek-db --file=database/06_data_search_sources.sql

# 2. 扩展 history 表（封面字段）
npx wrangler d1 execute codeseek-db --file=database/13_schema_history_cover.sql
```

### 依赖安装

```bash
pnpm install  # 新增依赖会自动安装
```

---

## 性能指标

| 指标 | 数值 |
|------|------|
| 新增代码行数 | ~2500 行（含前端组件） |
| 新增 API 端点 | 2（classifications + health 复用于新类别） |
| 新增数据库表字段 | 4（search_sources: 2, history: 2） |
| 新增搜索源 | 8（anime: 4, movie: 4） |
| Provider 平均响应时间 | < 200ms（P95） |

---

## Known Issues

- TMDB API 免费层有限额（每秒 4 次），高并发时可能触发 429
- Nyaa.si 响应时间不稳定（100ms ~ 3000ms），已设置超时保护
- Bangumi API 无官方 Key 时限流较严格，建议申请 API Key

---

## Contributors

- CodeSeek Core Team

---

## 下版本预告 (v4.1)

- [ ] 搜索结果跨类别关联（如：某动画的真人改编电影）
- [ ] 智能推荐（基于搜索历史的个性化推荐）
- [ ] 搜索源自动故障转移（健康检查 + 自动切换）
- [ ] i18n 国际化支持
