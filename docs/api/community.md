# 社区接口 `/api/community`

> [返回API目录](./index.md)

**认证方式**: 全局 authMiddleware，所有接口需要认证

---

## 目录

### 标签管理
- [获取标签列表](#获取标签列表)
- [获取标签详情](#获取标签详情)
- [创建标签](#创建标签)
- [更新标签](#更新标签)
- [删除标签](#删除标签)

### 分享源管理
- [获取分享源列表](#获取分享源列表)
- [获取分享源详情](#获取分享源详情)
- [创建分享源](#创建分享源)
- [更新分享源](#更新分享源)
- [删除分享源](#删除分享源)
- [更新分享源状态](#更新分享源状态)
- [获取我的收藏](#获取我的收藏)
- [获取我的分享](#获取我的分享)
- [获取热门分享源](#获取热门分享源)
- [获取最新分享源](#获取最新分享源)
- [获取用户统计](#获取用户统计)
- [获取社区统计](#获取社区统计)

### 点赞管理
- [点赞/取消点赞](#点赞取消点赞)

### 评论管理
- [获取评论列表](#获取评论列表)
- [创建评论](#创建评论)
- [更新评论](#更新评论)
- [删除评论](#删除评论)

### 举报管理
- [举报分享源](#举报分享源)

### 下载管理
- [记录下载](#记录下载)

### 通知管理
- [获取通知列表](#获取通知列表)

---

## 标签管理

### 获取标签列表

### `GET /api/community/tags`

获取所有活跃标签列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 标签列表

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "tag_abc123",
      "tag_name": "推荐",
      "tag_description": "优质推荐资源",
      "tag_color": "#3b82f6",
      "usage_count": 50,
      "is_official": 0,
      "tag_active": 1,
      "created_by": "user_123",
      "created_at": 1704067200000,
      "updated_at": 1704067200000
    }
  ]
}
```

---

### 获取标签详情

### `GET /api/community/tags/:id`

获取指定标签的详细信息。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 标签ID |

**返回**: 标签详情

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "tag_abc123",
    "name": "推荐",
    "description": "优质推荐资源",
    "color": "#3b82f6",
    "usageCount": 50,
    "isOfficial": false,
    "isActive": true,
    "createdAt": 1704067200000,
    "createdBy": "user_123"
  }
}
```

---

### 创建标签

### `POST /api/community/tags`

创建新标签。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "name": "string",
  "description": "string?",
  "color": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 标签名称 |
| description | string | 否 | 标签描述 |
| color | string | 否 | 标签颜色（默认#3b82f6） |

**返回**: 新创建的标签

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "tag_abc123",
    "tagName": "新标签",
    "tagDescription": null,
    "tagColor": "#3b82f6",
    "usageCount": 0,
    "createdAt": 1704067200000,
    "createdBy": "user_123"
  },
  "message": "创建成功"
}
```

---

### 更新标签

### `PUT /api/community/tags/:id`

更新指定标签的信息。

**认证**: 需要（仅创建者可更新）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 标签ID |

**请求体**:
```json
{
  "name": "string?",
  "description": "string?",
  "color": "string?",
  "isActive": "boolean?"
}
```

**返回**: 更新结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tagId": "tag_abc123",
    "updatedFields": ["name", "description"]
  },
  "message": "标签更新成功"
}
```

---

### 删除标签

### `DELETE /api/community/tags/:id`

删除指定标签。

**认证**: 需要（仅创建者可删除，且标签未被使用）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 标签ID |

**返回**: 删除结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "deletedId": "tag_abc123"
  },
  "message": "标签删除成功"
}
```

---

## 分享源管理

### 获取分享源列表

### `GET /api/community/sources`

获取社区分享源列表，支持分页、筛选和排序。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20） |
| status | string | 否 | 状态筛选（默认active） |
| search | string | 否 | 关键词搜索 |
| tags | string | 否 | 标签筛选（逗号分隔） |
| category | string | 否 | 分类筛选 |
| sort | string | 否 | 排序方式（popular/recent/rating/downloads） |

**返回**: 分享源列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "src_abc123",
        "user_id": "user_123",
        "source_name": "Google搜索",
        "source_subtitle": "全球最大搜索引擎",
        "source_icon": "🔍",
        "source_url_template": "https://www.google.com/search?q={query}",
        "source_category": "通用搜索",
        "description": "Google搜索引擎",
        "tags": "[\"搜索\",\"推荐\"]",
        "download_count": 100,
        "like_count": 50,
        "view_count": 500,
        "rating_score": 4.5,
        "rating_count": 20,
        "is_verified": 0,
        "is_featured": 0,
        "status": "active",
        "created_at": 1704067200000,
        "updated_at": 1704067200000,
        "author_name": "testuser",
        "is_liked": 0
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

---

### 获取分享源详情

### `GET /api/community/sources/:id`

获取指定分享源的详细信息。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**返回**: 分享源详情（访问时自动增加浏览量）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "src_abc123",
    "user_id": "user_123",
    "source_name": "Google搜索",
    "source_url_template": "https://www.google.com/search?q={query}",
    "source_category": "通用搜索",
    "description": "Google搜索引擎",
    "tags": "[\"搜索\",\"推荐\"]",
    "download_count": 100,
    "like_count": 50,
    "view_count": 501,
    "rating_score": 4.5,
    "rating_count": 20,
    "status": "active",
    "created_at": 1704067200000
  }
}
```

---

### 创建分享源

### `POST /api/community/sources`

创建新的分享源。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "sourceName": "string",
  "sourceSubtitle": "string?",
  "sourceIcon": "string?",
  "sourceUrlTemplate": "string",
  "sourceCategory": "string",
  "description": "string?",
  "tags": ["string"]?
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceName | string | 是 | 分享源名称 |
| sourceSubtitle | string | 否 | 副标题 |
| sourceIcon | string | 否 | 图标（默认🔍） |
| sourceUrlTemplate | string | 是 | URL模板 |
| sourceCategory | string | 是 | 分类 |
| description | string | 否 | 描述 |
| tags | array | 否 | 标签数组 |

**返回**: 新创建的分享源

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "src_abc123",
    "sourceName": "Google搜索",
    "sourceSubtitle": null,
    "sourceIcon": "🔍",
    "sourceUrlTemplate": "https://www.google.com/search?q={query}",
    "sourceCategory": "通用搜索",
    "description": "",
    "tags": [],
    "userId": "user_123",
    "status": "active",
    "viewCount": 0,
    "downloadCount": 0,
    "likeCount": 0,
    "ratingScore": 0,
    "ratingCount": 0,
    "createdAt": 1704067200000,
    "updatedAt": 1704067200000
  },
  "message": "提交成功"
}
```

---

### 更新分享源

### `PUT /api/community/sources/:id`

更新指定分享源的信息。

**认证**: 需要（仅作者可更新）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**请求体**:
```json
{
  "sourceName": "string?",
  "sourceSubtitle": "string?",
  "sourceIcon": "string?",
  "description": "string?",
  "tags": ["string"]?,
  "sourceCategory": "string?"
}
```

**返回**: 更新结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sourceId": "src_abc123",
    "updatedFields": ["sourceName", "description"]
  },
  "message": "搜索源更新成功"
}
```

---

### 删除分享源

### `DELETE /api/community/sources/:id`

删除指定的分享源。

**认证**: 需要（仅作者可删除）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**返回**: 删除结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "删除成功"
}
```

---

### 更新分享源状态

### `PUT /api/community/sources/:id/status`

更新分享源的审核状态。

**认证**: 需要（管理员权限）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**请求体**:
```json
{
  "status": "string",
  "reason": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 是 | 状态（active/rejected） |
| reason | string | 否 | 原因说明 |

**返回**: 更新结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sourceId": "src_abc123",
    "status": "active",
    "reason": null
  },
  "message": "已通过审核"
}
```

---

### 获取我的收藏

### `GET /api/community/sources/my-favorites`

获取当前用户收藏的分享源列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20） |

**返回**: 收藏列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 20,
    "totalPages": 0
  }
}
```

---

### 获取我的分享

### `GET /api/community/sources/my-sources`

获取当前用户分享的源列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20） |
| status | string | 否 | 状态筛选 |

**返回**: 分享列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 20,
    "totalPages": 0
  }
}
```

---

### 获取热门分享源

### `GET /api/community/sources/popular`

获取热门分享源列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认10） |
| tag | string | 否 | 标签筛选 |

**返回**: 热门分享源列表

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "src_abc123",
      "source_name": "热门搜索源",
      "view_count": 1000,
      "like_count": 100,
      "author_name": "testuser"
    }
  ]
}
```

---

### 获取最新分享源

### `GET /api/community/sources/recent`

获取最新分享源列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认10） |

**返回**: 最新分享源列表

**响应示例**:
```json
{
  "success": true,
  "data": []
}
```

---

### 获取用户统计

### `GET /api/community/sources/user-stats`

获取当前用户在社区的统计数据。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 用户统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "general": {
      "sharedSources": 10,
      "pendingSources": 2,
      "totalDownloads": 100,
      "totalLikes": 50,
      "totalViews": 500,
      "avgRating": 4.5,
      "reviewsGiven": 20,
      "tagsCreated": 5
    },
    "recentShares": []
  }
}
```

---

### 获取社区统计

### `GET /api/community/sources/stats`

获取社区整体统计数据。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 社区统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalSources": 100,
    "totalDownloads": 1000,
    "totalUsers": 50,
    "totalReviews": 200,
    "averageRating": 4.2,
    "categoriesCount": 10,
    "topCategories": [
      { "category": "通用搜索", "count": 30 }
    ],
    "recentActivity": []
  }
}
```

---

## 点赞管理

### 点赞/取消点赞

### `POST /api/community/sources/:id/like`

对分享源进行点赞或取消点赞（切换操作）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**返回**: 操作结果

**响应示例（点赞）**:
```json
{
  "success": true,
  "data": {
    "liked": true
  },
  "message": "点赞成功"
}
```

**响应示例（取消点赞）**:
```json
{
  "success": true,
  "data": {
    "liked": false
  },
  "message": "取消点赞"
}
```

---

## 评论管理

### 获取评论列表

### `GET /api/community/sources/:id/reviews`

获取指定分享源的评论列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**返回**: 评论列表

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "rev_abc123",
      "shared_source_id": "src_xyz",
      "user_id": "user_123",
      "username": "testuser",
      "rating": 5,
      "comment": "非常好用！",
      "is_anonymous": 0,
      "created_at": 1704067200000,
      "updated_at": 1704067200000
    }
  ]
}
```

---

### 创建评论

### `POST /api/community/reviews`

创建新评论。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "sharedSourceId": "string",
  "rating": "number",
  "comment": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sharedSourceId | string | 是 | 分享源ID |
| rating | number | 是 | 评分（1-5） |
| comment | string | 否 | 评论内容 |

**返回**: 新创建的评论

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "rev_abc123",
    "sharedSourceId": "src_xyz",
    "userId": "user_123",
    "rating": 5,
    "comment": "非常好用！",
    "createdAt": 1704067200000,
    "updatedAt": 1704067200000
  },
  "message": "评论成功"
}
```

---

### 更新评论

### `PUT /api/community/reviews/:id`

更新指定评论。

**认证**: 需要（仅作者可更新）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 评论ID |

**请求体**:
```json
{
  "rating": "number?",
  "comment": "string?"
}
```

**返回**: 更新结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "rev_abc123",
    "rating": 4,
    "comment": "更新后的评论",
    "updatedAt": 1704153600000
  },
  "message": "评论已更新"
}
```

---

### 删除评论

### `DELETE /api/community/reviews/:id`

删除指定评论。

**认证**: 需要（仅作者可删除）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 评论ID |

**返回**: 删除结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "删除成功"
}
```

---

## 举报管理

### 举报分享源

### `POST /api/community/sources/:id/report`

举报指定的分享源。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**请求体**:
```json
{
  "reason": "string",
  "details": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| reason | string | 是 | 举报原因 |
| details | string | 否 | 详细说明 |

**返回**: 举报结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "reportId": "rpt_abc123"
  },
  "message": "举报已提交"
}
```

---

## 下载管理

### 记录下载

### `POST /api/community/sources/:id/download`

记录分享源的下载行为。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 分享源ID |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "下载计数已更新"
}
```

---

## 通知管理

### 获取通知列表

### `GET /api/community/notifications`

获取当前用户的通知列表（基于用户分享源的活动）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20） |

**通知类型**:
| type | 说明 |
|------|------|
| like | 点赞通知 |
| review | 评论通知 |
| download | 下载通知 |
| report_resolved | 举报处理通知 |

**返回**: 通知列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "like_abc123",
        "type": "like",
        "sourceId": "src_xyz",
        "sourceName": "我的搜索源",
        "actorName": "testuser",
        "content": "点赞了你的搜索源",
        "createdAt": 1704067200000
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```
