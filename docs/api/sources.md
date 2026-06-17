# 搜索源管理 API

> **基础路径**: `https://api.codeseek.pp.ua/api/search-sources`
>
> 部分接口需要管理员权限。所有接口需认证。

---

## 目录

- [三层架构说明](#三层架构说明)
- [搜索源列表](#搜索源列表-get-apisearch-sources)
- [按类别获取分类](#按类别获取分类-get-apisearch-sourcesclassificationscategory)
- [创建搜索源（管理）](#创建搜索源管理-post-apisearch-sources)
- [更新搜索源（管理）](#更新搜索源管理-put-apisearch-sourcesid)
- [删除搜索源（管理）](#删除搜索源管理-delete-apisearch-sourcesid)
- [批量操作（管理）](#批量操作管理-post-apisearch-sourcesbatch)
- [健康检查（管理）](#健康检查管理-get-apisearch-sourceshealth)
- [数据模型](#数据模型)

---

## 三层架构说明

CodeSeek v4.0 将搜索源组织为三层结构：

```
Layer 1: Category（搜索大类）
├── anime    — 动漫搜索
├── movie    — 影视搜索
└── jav      — JAV 搜索

Layer 2: Classification（搜索分类）
├── anime/
│   ├── bangumi    — 番剧元数据
│   ├── mikan      — 字幕组资源
│   ├── nyaa       — 动漫磁力
│   └── showrss    — RSS 订阅
├── movie/
│   ├── tmdb       — 影视元数据
│   ├── yts        — 电影种子
│   ├── eztv       — 剧集种子
│   └── tpb        — 兜底磁力
└── jav/
    ├── metadata   — 元数据聚合
    └── magnet     — 磁力聚合

Layer 3: Source（具体搜索源实例）
├── anime/bangumi → Bangumi API (官方)
├── anime/mikan   → Mikan Project (官方)
├── anime/nyaa    → Nyaa.si (官方)
├── movie/tmdb    → TMDB API (官方)
├── movie/yts     → YTS (官方)
├── jav/metadata  → DMM/FANZA, JavBus, JavDB
└── ...
```

**设计原则：**
- **Category** 决定前端 Tab 和后端 Provider 路由
- **Classification** 决定搜索逻辑和数据格式
- **Source** 是数据库中的具体实例，支持动态启停/调权重

---

## 搜索源列表 `GET /api/search-sources`

返回所有搜索源的完整列表（含状态信息）。

### Query 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `category` | string | 全部 | 按类别过滤：`anime` / `movie` / `jav` |
| `activeOnly` | boolean | false | 仅返回启用状态的源 |
| `includeStats` | boolean | false | 包含统计信息（调用次数、成功率等） |

### 响应示例

```json
{
  "success": true,
  "data": {
    "sources": [
      {
        "id": 1,
        "name": "Bangumi API",
        "category": "anime",
        "classification": "bangumi",
        "baseUrl": "https://api.bgm.tv",
        "type": "api",
        "isActive": true,
        "priority": 10,
        "config": { "apiKey": "***" },
        "lastCheckAt": "2026-06-15T12:00:00Z",
        "status": "active",
        "responseTimeMs": 120,
        "stats": {
          "totalCalls": 15234,
          "successRate": 99.2,
          "avgResponseTimeMs": 115
        },
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2026-06-15T12:00:00Z"
      },
      {
        "id": 2,
        "name": "Mikan Project",
        "category": "anime",
        "classification": "mikan",
        "baseUrl": "https://mikanani.me",
        "type": "scrape",
        "isActive": true,
        "priority": 8,
        "status": "active",
        ...
      },
      {
        "id": 5,
        "name": "TMDB API",
        "category": "movie",
        "classification": "tmdb",
        "baseUrl": "https://api.themoviedb.org/3",
        "type": "api",
        "isActive": true,
        "priority": 10,
        ...
      },
      {
        "id": 9,
        "name": "DMM/FANZA",
        "category": "jav",
        "classification": "metadata",
        "baseUrl": "https://api.dmm.com",
        "type": "api",
        "isActive": true,
        "priority": 10,
        ...
      }
    ],
    "total": 12,
    "categories": {
      "anime": { "total": 4, "active": 4 },
      "movie": { "total": 4, "active": 4 },
      "jav": { "total": 2, "active": 2 }
    }
  }
}
```

---

## 按类别获取分类 `GET /api/search-sources/classifications/:category`

获取指定搜索大类下的所有可用分类及其包含的源。

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `category` | string | 搜索大类：`anime` / `movie` / `jav` |

### 响应示例

```json
{
  "success": true,
  "data": {
    "category": "anime",
    "classifications": [
      {
        "name": "bangumi",
        "label": "Bangumi 界剧",
        "description": "Bangumi 界剧信息数据库",
        "icon": "tv",
        "sources": [
          { "id": 1, "name": "Bangumi API", "isActive": true, "priority": 10 }
        ],
        "sourceCount": 1,
        "activeSourceCount": 1
      },
      {
        "name": "mikan",
        "label": "Mikan 字幕组",
        "description": "Mikan Project 字幕组资源",
        "icon": "users",
        "sources": [
          { "id": 2, "name": "Mikan Project", "isActive": true, "priority": 8 }
        ],
        "sourceCount": 1,
        "activeSourceCount": 1
      },
      {
        "name": "nyaa",
        "label": "Nyaa 磁力",
        "description": "Nyaa.si 动漫种子搜索",
        "icon": "magnet",
        "sources": [
          { "id": 3, "name": "Nyaa.si", "isActive": true, "priority": 9 }
        ],
        "sourceCount": 1,
        "activeSourceCount": 1
      },
      {
        "name": "showrss",
        "label": "ShowRSS",
        "description": "ShowRSS 订阅源",
        "icon": "rss",
        "sources": [
          { "id": 4, "name": "ShowRSS", "isActive": true, "priority": 7 }
        ],
        "sourceCount": 1,
        "activeSourceCount": 1
      }
    ]
  }
}
```

**前端用途：** 此接口用于动态生成搜索页面的分类选择器下拉菜单。

---

## 创建搜索源（管理）`POST /api/search-sources`

添加新的搜索源实例。

> 需要管理员权限 (`role=admin`)。

### 请求体

```json
{
  "name": "自定义 Bangumi 镜像",
  "category": "anime",
  "classification": "bangumi",
  "baseUrl": "https://bgm-api.example.com",
  "type": "api",
  "priority": 5,
  "isActive": true,
  "config": {
    "apiKey": "your-api-key",
    "timeout": 10000,
    "rateLimit": 60
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 源名称（显示用） |
| `category` | string | 是 | 所属大类：`anime` / `movie` / `jav` |
| `classification` | string | 是 | 所属分类（必须存在于该类别下） |
| `baseUrl` | string | 是 | API 基础地址或站点 URL |
| `type` | string | 是 | 源类型：`api` / `scrape` / `rss` / `torrent` |
| `priority` | number | 否 | 优先级（0-100），越高越优先，默认 5 |
| `isActive` | boolean | 否 | 是否启用，默认 `true` |
| `config` | object | 否 | JSON 配置（API Key、超时等） |

### 响应

```json
{
  "success": true,
  "data": {
    "id": 15,
    "name": "自定义 Bangumi 镜像",
    "category": "anime",
    "classification": "bangumi",
    ...
  }
}
```

---

## 更新搜索源（管理）`PUT /api/search-sources/:id`

更新指定搜索源的配置。

> 需要管理员权限。

### 请求体（支持部分更新）

```json
{
  "priority": 8,
  "isActive": false,
  "config": {
    "timeout": 15000
  }
}
```

### 响应

```json
{
  "success": true,
  "message": "搜索源已更新"
}
```

---

## 删除搜索源（管理）`DELETE /api/search-sources/:id`

删除指定搜索源（软删除，保留关联数据）。

> 需要管理员权限。

### 响应

```json
{
  "success": true,
  "message": "搜索源已删除"
}
```

---

## 批量操作（管理）`POST /api/search-sources/batch`

批量更新搜索源状态。

> 需要管理员权限。

### 请求体

```json
{
  "action": "toggleActive",
  "ids": [1, 2, 3],
  "value": false
}
```

### 支持 action

| action | 说明 | 额外字段 |
|--------|------|---------|
| `toggleActive` | 批量启停 | `value: boolean` |
| `updatePriority` | 批量修改优先级 | `value: number` |
| `delete` | 批量删除 | - |

---

## 健康检查（管理）`GET /api/search-sources/health`

对所有活跃搜索源进行可达性检测。

> 需要管理员权限。

### 响应

```json
{
  "success": true,
  "data": {
    "checkedAt": "2026-06-15T12:05:00Z",
    "results": [
      {
        "sourceId": 1,
        "sourceName": "Bangumi API",
        "status": "healthy",
        "responseTimeMs": 95,
        "lastError": null
      },
      {
        "sourceId": 5,
        "sourceName": "TMDB API",
        "status": "healthy",
        "responseTimeMs": 80,
        "lastError": null
      },
      {
        "sourceId": 3,
        "sourceName": "Nyaa.si",
        "status": "degraded",
        "responseTimeMs": 2500,
        "lastError": "Response time exceeded threshold"
      }
    ],
    "summary": {
      "total": 10,
      "healthy": 8,
      "degraded": 1,
      "down": 1
    }
  }
}
```

---

## 数据模型

### search_sources 表

```sql
CREATE TABLE search_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- 源名称
  category TEXT NOT NULL DEFAULT 'jav',  -- 搜索大类 (anime/movie/jav)
  classification TEXT NOT NULL,          -- 搜索分类 (bangumi/mikan/...)
  base_url TEXT NOT NULL,                -- 基础 URL
  type TEXT NOT NULL DEFAULT 'api',      -- 源类型 (api/scrape/rss/torrent)
  priority INTEGER NOT NULL DEFAULT 5,   -- 优先级 (0-100)
  is_active BOOLEAN NOT NULL DEFAULT 1,  -- 是否启用
  config TEXT DEFAULT '{}',              -- JSON 配置
  last_check_at TEXT,                    -- 最后健康检查时间
  status TEXT DEFAULT 'pending',         -- 当前状态 (active/inactive/error)
  error_message TEXT,                    -- 最后错误信息
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### category 枚举值

| 值 | 说明 | 内置分类 |
|----|------|---------|
| `anime` | 动漫搜索 | bangumi, mikan, nyaa, showrss |
| `movie` | 影视搜索 | tmdb, yts, eztv, tpb |
| `jav` | JAV 搜索 | metadata, magnet |

### type 枚举值

| 值 | 说明 | 示例 |
|----|------|------|
| `api` | RESTful API | Bangumi API, TMDB API, DMM API |
| `scrape` | 爬虫抓取 | Mikan Project |
| `rss` | RSS 订阅解析 | ShowRSS |
| `torrent` | 磁力/种子站 | Nyaa.si, YTS, EZTV, TPB |

### status 状态机

```
pending → active → inactive
              ↘ error → active (恢复检测)
```

| 状态 | 说明 |
|------|------|
| `pending` | 初始/待检测 |
| `active` | 正常运行中 |
| `inactive` | 已禁用 |
| `error` | 连续失败，自动标记 |

---

## 前端集成示例

### React Hook: useSearchSources

```tsx
function SearchPage() {
  const { category } = useParams<{ category: string }();

  // 1. 加载该类别下的分类列表
  const { data: classData } = useQuery({
    queryKey: ['classifications', category],
    queryFn: () => fetch(`/api/search-sources/classifications/${category}`).then(r => r.json())
  });

  // 2. 用户选择分类后发起搜索
  const handleSearch = (classification: string, keyword: string) => {
    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, classification, keyword })
    });
  };

  return (
    <div>
      {/* 分类选择器 */}
      <select onChange={(e) => setSelectedClassification(e.target.value)}>
        {classData?.data.classifications.map((c) => (
          <option key={c.name} value={c.name}>{c.label}</option>
        ))}
      </select>

      {/* 结果面板按 category 渲染 */}
      {category === 'anime' && <AnimeSearchResultPanel />}
      {category === 'movie' && <MovieSearchResultPanel />}
      {category === 'jav' && <JAVSearchResultPanel />}
    </div>
  );
}
```
