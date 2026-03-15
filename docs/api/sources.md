# 搜索源管理接口 `/api/search-sources`

> [返回API目录](./index.md)

**认证方式**: 全局 authMiddleware，所有接口需要认证，部分接口需要管理员权限

---

## 目录

### 主分类管理
- [获取主分类列表](#获取主分类列表)
- [获取主分类详情](#获取主分类详情)
- [创建主分类](#创建主分类)
- [更新主分类](#更新主分类)
- [删除主分类](#删除主分类)

### 分类管理
- [获取分类列表](#获取分类列表)
- [获取分类详情](#获取分类详情)
- [创建分类](#创建分类)
- [更新分类](#更新分类)
- [删除分类](#删除分类)

### 搜索源管理
- [获取搜索源列表](#获取搜索源列表)
- [获取搜索源详情](#获取搜索源详情)
- [获取热门搜索源](#获取热门搜索源)
- [搜索搜索源](#搜索搜索源)
- [创建搜索源](#创建搜索源)
- [更新搜索源](#更新搜索源)
- [删除搜索源](#删除搜索源)
- [增加使用次数](#增加使用次数)
- [导出搜索源](#导出搜索源)
- [获取搜索源统计](#获取搜索源统计)

### 用户配置管理
- [获取用户搜索源配置](#获取用户搜索源配置)
- [获取带用户配置的搜索源](#获取带用户配置的搜索源)
- [更新用户搜索源配置](#更新用户搜索源配置)
- [批量更新用户搜索源配置](#批量更新用户搜索源配置)
- [删除用户搜索源配置](#删除用户搜索源配置)
- [导出用户配置](#导出用户配置)

---

## 主分类管理

### 获取主分类列表

### `GET /api/search-sources/major-categories`

获取所有激活的主分类列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 主分类列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "mc_abc123",
        "name": "常用工具",
        "description": "日常使用的搜索工具",
        "icon": "🔧",
        "color": "#3b82f6",
        "requires_keyword": 1,
        "is_system": 1,
        "is_active": 1,
        "display_order": 1,
        "created_at": 1704067200000,
        "updated_at": 1704067200000
      }
    ]
  }
}
```

---

### 获取主分类详情

### `GET /api/search-sources/major-categories/:id`

获取指定主分类的详细信息。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 主分类ID |

**返回**: 主分类详情

**响应示例**:
```json
{
  "success": true,
  "data": {
    "category": {
      "id": "mc_abc123",
      "name": "常用工具",
      "description": "日常使用的搜索工具",
      "icon": "🔧",
      "color": "#3b82f6",
      "requires_keyword": 1,
      "is_system": 1,
      "is_active": 1,
      "display_order": 1,
      "created_at": 1704067200000,
      "updated_at": 1704067200000
    }
  }
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 大类不存在 |

---

### 创建主分类

### `POST /api/search-sources/major-categories`

创建新的主分类。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "name": "string",
  "description": "string?",
  "icon": "string?",
  "color": "string?",
  "requiresKeyword": "boolean?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 主分类名称（最多30字符） |
| description | string | 否 | 描述 |
| icon | string | 否 | 图标（默认🌟） |
| color | string | 否 | 颜色（默认#6b7280） |
| requiresKeyword | boolean | 否 | 是否需要关键词（默认true） |

**返回**: 新创建的主分类

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "mc_abc123",
    "name": "新分类",
    "description": "",
    "icon": "🌟",
    "color": "#6b7280",
    "requiresKeyword": true,
    "isSystem": false
  },
  "message": "大类创建成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 大类名称不能为空/超过30字符 |
| `DUPLICATE_ERROR` | 400 | 大类名称已存在 |
| `FORBIDDEN` | 403 | 需要管理员权限 |

---

### 更新主分类

### `PUT /api/search-sources/major-categories/:id`

更新指定主分类的信息。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 主分类ID |

**请求体**:
```json
{
  "name": "string?",
  "description": "string?",
  "icon": "string?",
  "color": "string?",
  "requiresKeyword": "boolean?",
  "displayOrder": "number?",
  "isActive": "boolean?"
}
```

**返回**: 更新结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "categoryId": "mc_abc123",
    "updatedFields": ["name", "description"]
  },
  "message": "大类更新成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 大类不存在 |
| `FORBIDDEN` | 403 | 系统大类仅管理员可修改 |
| `DUPLICATE_ERROR` | 400 | 大类名称已存在 |

---

### 删除主分类

### `DELETE /api/search-sources/major-categories/:id`

删除指定的主分类。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 主分类ID |

**返回**: 删除结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "deletedId": "mc_abc123"
  },
  "message": "大类已删除"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 大类不存在 |
| `FORBIDDEN` | 403 | 系统大类仅管理员可删除 |
| `VALIDATION_ERROR` | 400 | 该大类下还有分类，无法删除 |

---

## 分类管理

### 获取分类列表

### `GET /api/search-sources/categories`

获取所有激活的分类列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| majorCategoryId | string | 否 | 主分类ID筛选 |

**返回**: 分类列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "cat_abc123",
        "major_category_id": "mc_123",
        "major_category_name": "常用工具",
        "name": "搜索引擎",
        "description": "各类搜索引擎",
        "icon": "🔍",
        "color": "#3b82f6",
        "default_searchable": 1,
        "default_site_type": "search",
        "search_priority": 5,
        "is_system": 1,
        "is_active": 1,
        "display_order": 1,
        "created_at": 1704067200000,
        "updated_at": 1704067200000
      }
    ]
  }
}
```

---

### 获取分类详情

### `GET /api/search-sources/categories/:id`

获取指定分类的详细信息。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分类ID |

**返回**: 分类详情

**响应示例**:
```json
{
  "success": true,
  "data": {
    "category": {
      "id": "cat_abc123",
      "major_category_id": "mc_123",
      "name": "搜索引擎",
      "description": "各类搜索引擎",
      "icon": "🔍",
      "color": "#3b82f6",
      "default_searchable": 1,
      "default_site_type": "search",
      "search_priority": 5,
      "is_system": 1,
      "is_active": 1,
      "display_order": 1,
      "created_at": 1704067200000,
      "updated_at": 1704067200000
    }
  }
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 分类不存在 |

---

### 创建分类

### `POST /api/search-sources/categories`

创建新的分类。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "majorCategoryId": "string",
  "name": "string",
  "description": "string?",
  "icon": "string?",
  "color": "string?",
  "defaultSearchable": "boolean?",
  "defaultSiteType": "string?",
  "searchPriority": "number?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| majorCategoryId | string | 是 | 所属主分类ID |
| name | string | 是 | 分类名称 |
| description | string | 否 | 描述 |
| icon | string | 否 | 图标（默认📁） |
| color | string | 否 | 颜色（默认#3b82f6） |
| defaultSearchable | boolean | 否 | 默认是否可搜索（默认true） |
| defaultSiteType | string | 否 | 默认站点类型（默认search） |
| searchPriority | number | 否 | 搜索优先级（1-10，默认5） |

**返回**: 新创建的分类

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "cat_abc123",
    "majorCategoryId": "mc_123",
    "name": "新分类",
    "description": "",
    "icon": "📁",
    "color": "#3b82f6",
    "defaultSearchable": true,
    "defaultSiteType": "search",
    "searchPriority": 5,
    "isSystem": false
  },
  "message": "分类创建成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 大类ID不能为空/分类名称不能为空 |
| `NOT_FOUND` | 404 | 大类不存在 |
| `FORBIDDEN` | 403 | 需要管理员权限 |

---

### 更新分类

### `PUT /api/search-sources/categories/:id`

更新指定分类的信息。

**认证**: 需要（系统分类需要管理员权限）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分类ID |

**请求体**:
```json
{
  "name": "string?",
  "description": "string?",
  "icon": "string?",
  "color": "string?",
  "defaultSearchable": "boolean?",
  "defaultSiteType": "string?",
  "searchPriority": "number?"
}
```

**返回**: 更新结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "分类更新成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 分类不存在 |
| `FORBIDDEN` | 403 | 系统分类仅管理员可修改 |
| `VALIDATION_ERROR` | 400 | 没有提供要更新的数据 |

---

### 删除分类

### `DELETE /api/search-sources/categories/:id`

删除指定的分类。

**认证**: 需要（系统分类需要管理员权限）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分类ID |

**返回**: 删除结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "分类已删除"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 分类不存在 |
| `FORBIDDEN` | 403 | 系统分类仅管理员可删除 |
| `VALIDATION_ERROR` | 400 | 该分类下还有搜索源，无法删除 |

---

## 搜索源管理

### 获取搜索源列表

### `GET /api/search-sources`

获取搜索源列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| categoryId | string | 否 | 分类ID筛选 |
| searchable | boolean | 否 | 是否可搜索筛选 |
| siteType | string | 否 | 站点类型筛选 |

**返回**: 搜索源列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sources": [
      {
        "id": "src_abc123",
        "category_id": "cat_456",
        "name": "Google",
        "subtitle": "全球最大搜索引擎",
        "description": "Google搜索引擎",
        "icon": "🔍",
        "url_template": "https://www.google.com/search?q={keyword}",
        "homepage_url": "https://www.google.com",
        "site_type": "search",
        "searchable": 1,
        "requires_keyword": 1,
        "search_priority": 5,
        "is_system": 1,
        "is_active": 1,
        "display_order": 1,
        "usage_count": 100,
        "last_used_at": 1704067200000,
        "created_by": "system",
        "created_at": 1704067200000,
        "updated_at": 1704067200000
      }
    ]
  }
}
```

---

### 获取搜索源详情

### `GET /api/search-sources/:id`

获取指定搜索源的详细信息。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 搜索源ID |

**返回**: 搜索源详情

**响应示例**:
```json
{
  "success": true,
  "data": {
    "source": {
      "id": "src_abc123",
      "category_id": "cat_456",
      "name": "Google",
      "subtitle": "全球最大搜索引擎",
      "url_template": "https://www.google.com/search?q={keyword}",
      "site_type": "search",
      "searchable": 1,
      "is_active": 1
    }
  }
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 搜索源不存在 |

---

### 获取热门搜索源

### `GET /api/search-sources/popular`

获取使用次数最多的搜索源列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认20） |

**返回**: 热门搜索源列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sources": []
  }
}
```

---

### 搜索搜索源

### `GET /api/search-sources/search`

根据关键词搜索搜索源。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词 |

**返回**: 匹配的搜索源列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sources": []
  }
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 请提供搜索关键词 |

---

### 创建搜索源

### `POST /api/search-sources`

创建新的搜索源。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "categoryId": "string",
  "name": "string",
  "subtitle": "string?",
  "description": "string?",
  "icon": "string?",
  "urlTemplate": "string",
  "homepageUrl": "string?",
  "siteType": "string?",
  "searchable": "boolean?",
  "requiresKeyword": "boolean?",
  "searchPriority": "number?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| categoryId | string | 是 | 所属分类ID |
| name | string | 是 | 搜索源名称 |
| subtitle | string | 否 | 副标题 |
| description | string | 否 | 描述 |
| icon | string | 否 | 图标（默认🔍） |
| urlTemplate | string | 是 | URL模板（必须以http(s)://开头） |
| homepageUrl | string | 否 | 主页URL |
| siteType | string | 否 | 站点类型（默认search） |
| searchable | boolean | 否 | 是否可搜索（默认true） |
| requiresKeyword | boolean | 否 | 是否需要关键词（默认true） |
| searchPriority | number | 否 | 搜索优先级（1-10，默认5） |

**返回**: 新创建的搜索源

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "src_abc123",
    "categoryId": "cat_456",
    "name": "新搜索源",
    "subtitle": null,
    "description": null,
    "icon": "🔍",
    "urlTemplate": "https://example.com/search?q={keyword}",
    "homepageUrl": null,
    "siteType": "search",
    "searchable": true,
    "requiresKeyword": true,
    "searchPriority": 5
  },
  "message": "搜索源创建成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 分类ID不能为空/名称不能为空/URL模板不能为空/URL模板格式不正确 |
| `NOT_FOUND` | 404 | 分类不存在 |

---

### 更新搜索源

### `PUT /api/search-sources/:id`

更新指定搜索源的信息。

**认证**: 需要（系统搜索源需要管理员权限）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 搜索源ID |

**请求体**:
```json
{
  "categoryId": "string?",
  "name": "string?",
  "subtitle": "string?",
  "description": "string?",
  "icon": "string?",
  "urlTemplate": "string?",
  "homepageUrl": "string?",
  "siteType": "string?",
  "searchable": "boolean?",
  "requiresKeyword": "boolean?",
  "searchPriority": "number?"
}
```

**返回**: 更新结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "搜索源更新成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 搜索源不存在 |
| `FORBIDDEN` | 403 | 系统搜索源仅管理员可修改 |
| `VALIDATION_ERROR` | 400 | 没有提供要更新的数据 |

---

### 删除搜索源

### `DELETE /api/search-sources/:id`

删除指定的搜索源。

**认证**: 需要（系统搜索源需要管理员权限）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 搜索源ID |

**返回**: 删除结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "搜索源已删除"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 搜索源不存在 |
| `FORBIDDEN` | 403 | 系统搜索源仅管理员可删除 |

---

### 增加使用次数

### `POST /api/search-sources/:id/increment-usage`

增加搜索源的使用次数。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 搜索源ID |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "使用次数已更新"
}
```

---

### 导出搜索源

### `GET /api/search-sources/export`

导出搜索源数据。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| format | string | 否 | 导出格式（json/csv/opml，默认json） |
| categoryId | string | 否 | 分类ID筛选 |

**返回**: 
- JSON格式：搜索源列表
- CSV格式：CSV文件下载
- OPML格式：OPML文件下载

**响应示例（JSON）**:
```json
{
  "success": true,
  "data": {
    "sources": [],
    "exportedAt": 1704067200000,
    "count": 0
  }
}
```

---

### 获取搜索源统计

### `GET /api/search-sources/stats`

获取搜索源统计数据。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalSources": 100,
    "searchableSources": 80,
    "totalCategories": 10,
    "totalMajorCategories": 5,
    "topUsedSources": [
      { "id": "src_abc", "name": "Google", "usage_count": 1000 }
    ],
    "sourcesByCategory": [
      { "category_name": "搜索引擎", "source_count": 30 }
    ],
    "sourcesBySiteType": [
      { "site_type": "search", "count": 50 }
    ]
  }
}
```

---

## 用户配置管理

### 获取用户搜索源配置

### `GET /api/search-sources/user-configs/:userId`

获取指定用户的搜索源配置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |

**返回**: 用户配置列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "configs": [
      {
        "id": "cfg_abc123",
        "user_id": "user_123",
        "source_id": "src_456",
        "is_enabled": 1,
        "custom_priority": 5,
        "custom_name": "我的Google",
        "custom_subtitle": "自定义副标题",
        "custom_icon": "🔍",
        "notes": "这是备注",
        "created_at": 1704067200000,
        "updated_at": 1704067200000
      }
    ]
  }
}
```

---

### 获取带用户配置的搜索源

### `GET /api/search-sources/with-user-config/:userId`

获取指定用户的搜索源列表及其个性化配置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |

**返回**: 带用户配置的搜索源列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sources": [
      {
        "id": "src_abc123",
        "name": "Google",
        "url_template": "https://www.google.com/search?q={keyword}",
        "userConfig": {
          "id": "cfg_abc",
          "is_enabled": 1,
          "custom_priority": 5,
          "custom_name": "我的Google"
        }
      }
    ]
  }
}
```

---

### 更新用户搜索源配置

### `PUT /api/user/source-configs/:sourceId`

更新当前用户对特定搜索源的个性化配置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| sourceId | string | 搜索源ID |

**请求体**:
```json
{
  "isEnabled": "boolean?",
  "customPriority": "number?",
  "customName": "string?",
  "customSubtitle": "string?",
  "customIcon": "string?",
  "notes": "string?"
}
```

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "配置已保存"
}
```

---

### 批量更新用户搜索源配置

### `POST /api/search-sources/user-configs/batch`

批量更新用户对多个搜索源的个性化配置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "configs": [
    {
      "sourceId": "string",
      "isEnabled": "boolean?",
      "customPriority": "number?",
      "customName": "string?",
      "customSubtitle": "string?",
      "customIcon": "string?",
      "notes": "string?"
    }
  ]
}
```

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "updatedCount": 5,
    "totalRequested": 5
  },
  "message": "批量更新成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 配置列表不能为空/批量更新不能超过N个配置 |

---

### 删除用户搜索源配置

### `DELETE /api/search-sources/user-configs/:sourceId`

删除当前用户对特定搜索源的配置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| sourceId | string | 搜索源ID |

**返回**: 删除结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "配置已删除"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 配置不存在 |

---

### 导出用户配置

### `GET /api/search-sources/export-user-configs/:userId`

导出指定用户的搜索源配置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |

**返回**: 用户配置列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "configs": [],
    "exportedAt": 1704067200000,
    "count": 0
  }
}
```
