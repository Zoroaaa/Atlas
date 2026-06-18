# 社区接口 `/api/community` v3.0

> [返回API目录](./index.md)

**认证方式**: 全局 authMiddleware，所有接口需要认证

---

## v3.0 变更日志

### 核心转变：从"搜索源分享"到"资源分享"

v3.0 版本对社区模块进行了重大重构，核心模型从**搜索源（Shared Source）**转变为**资源帖子（Post）**，以支持更丰富的内容分享场景。

#### ✅ 新增功能
- **帖子管理**：支持 JAV / 动漫 / 电影 三种资源类型的帖子发布与管理
- **收藏功能**：新增帖子收藏/取消收藏接口（`POST /posts/:id/favorite`）
- **推荐系统**：管理员可设置/取消帖子推荐（`PUT /posts/:id/feature`）
- **用户统计**：个人贡献数据统计，含声望积分与贡献等级（`GET /user-stats`）
- **社区统计**：社区整体数据统计，带缓存优化（`GET /stats`）
- **全文搜索**：基于 FTS5 的帖子标题/推荐语搜索

#### ❌ 移除功能
- ~~搜索源 CRUD~~ → 替换为**帖子 CRUD**
- ~~下载记录~~ (`POST /sources/:id/download`) → 已移除
- ~~评分系统~~ (rating 1-5) → 替换为纯文本评论
- ~~分类管理~~ (category) → 替换为**帖子类型** (postType: jav/anime/movie)
- ~~热门/最新分享源快捷接口~~ → 可通过帖子列表的 sort 参数实现

#### 🔄 改造功能
| 旧版 | 新版 | 变更说明 |
|------|------|----------|
| `GET /sources` | `GET /posts` | 返回帖子列表，支持 postType 筛选 |
| `POST /sources` | `POST /posts` | 创建帖子，字段完全重构 |
| `PUT /sources/:id` | `PUT /posts/:id` | 仅允许更新 caption 和 tags |
| `DELETE /sources/:id` | `DELETE /posts/:id` | 仅作者可删除 |
| `PUT /sources/:id/status` | `PUT /posts/:id/status` | 状态值扩展：active/pending/rejected/hidden |
| `POST /sources/:id/like` | `POST /posts/:id/like` | 路径变更，逻辑不变 |
| `GET /sources/:id/reviews` | `GET /posts/:id/comments` | 评论替代评分评论 |
| `POST /reviews` | `POST /comments` | 纯文本评论，无评分 |
| `PUT /reviews/:id` | — | 已移除（不再支持编辑评论） |
| `DELETE /reviews/:id` | `DELETE /comments/:id` | 路径变更，权限扩展至管理员 |
| `POST /sources/:id/report` | `POST /posts/:id/report` | 路径变更，增加重复举报检测 |
| `GET /sources/my-favorites` | `GET /posts/my-favorites` | 路径变更 |
| `GET /sources/my-sources` | `GET /posts/my-posts` | 路径变更 |
| `GET /sources/user-stats` | `GET /user-stats` | 数据结构重构 |
| `GET /sources/stats` | `GET /stats` | 数据结构重构，增加缓存 |

---

## 目录

### 标签管理
- [获取标签列表](#获取标签列表)
- [获取标签详情](#获取标签详情)
- [创建标签](#创建标签)
- [更新标签](#更新标签)
- [删除标签](#删除标签)

### 帖子管理
- [获取帖子列表](#获取帖子列表)
- [获取帖子详情](#获取帖子详情)
- [创建帖子](#创建帖子)
- [更新帖子](#更新帖子)
- [删除帖子](#删除帖子)
- [更新帖子状态（管理员）](#更新帖子状态管理员)
- [设置推荐（管理员）](#设置推荐管理员)

### 互动功能
- [点赞/取消点赞](#点赞取消点赞)
- [收藏/取消收藏](#收藏取消收藏)

### 评论功能
- [获取评论列表](#获取评论列表)
- [发表评论](#发表评论)
- [删除评论](#删除评论)

### 举报
- [举报帖子](#举报帖子)

### 个人中心
- [我的帖子](#我的帖子)
- [我的收藏](#我的收藏)

### 统计
- [社区统计](#社区统计)
- [用户统计](#用户统计)

### 通知
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

**响应示例 (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "tag_abc123",
      "tagName": "推荐",
      "tagDescription": "优质推荐资源",
      "tagColor": "#3b82f6",
      "isActive": true,
      "createdAt": 1704067200000,
      "createdBy": "user_123"
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

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "id": "tag_abc123",
    "tagName": "推荐",
    "tagDescription": "优质推荐资源",
    "tagColor": "#3b82f6",
    "isActive": true,
    "createdAt": 1704067200000,
    "createdBy": "user_123"
  }
}
```

**错误响应 (404)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "标签不存在"
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
| name | string | 是 | 标签名称（不可为空） |
| description | string | 否 | 标签描述 |
| color | string | 否 | 标签颜色（默认 #3b82f6，格式 #RRGGBB） |

**返回**: 新创建的标签

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "id": "tag_abc123",
    "tagName": "新标签",
    "tagDescription": null,
    "tagColor": "#3b82f6",
    "isActive": true,
    "createdAt": 1704067200000,
    "createdBy": "user_123"
  },
  "message": "创建成功"
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "标签名称不能为空"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ERROR",
    "message": "标签已存在"
  }
}
```

---

### 更新标签

### `PUT /api/community/tags/:id`

更新指定标签的信息。

**认证**: 需要

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

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 标签名称（2-20字符） |
| description | string | 否 | 标签描述 |
| color | string | 否 | 标签颜色（格式 #RRGGBB） |
| isActive | boolean | 否 | 是否激活 |

**返回**: 更新结果

**响应示例 (200)**:
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

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "标签名称长度必须在2-20个字符之间"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ERROR",
    "message": "标签名称已存在"
  }
}
```

---

### 删除标签

### `DELETE /api/community/tags/:id`

删除指定标签。

**认证**: 需要（仅创建者可删除）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 标签ID |

**返回**: 删除结果

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "deletedId": "tag_abc123"
  },
  "message": "标签删除成功"
}
```

**错误响应 (403)**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "无权删除此标签"
  }
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "不能删除正在使用的标签"
  }
}
```

---

## 帖子管理

### 获取帖子列表

### `GET /api/community/posts`

获取社区帖子列表，支持分页、筛选、搜索和排序。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| pageSize | number | 否 | 每页数量（默认 20，最大 50） |
| postType | string | 否 | 帖子类型筛选：`jav` / `anime` / `movie` |
| status | string | 否 | 状态筛选（默认 active） |
| search | string | 否 | 关键词全文搜索（标题/推荐语） |
| tags | string | 否 | 标签筛选（逗号分隔的标签 ID） |
| sort | string | 否 | 排序方式：`latest`（默认）/ `hot` |

**返回**: 帖子列表（含当前用户的点赞/收藏状态）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "post_abc123",
        "userId": "user_123",
        "userName": "testuser",
        "userAvatar": "https://example.com/avatar.jpg",
        "postType": "jav",
        "title": "精选资源推荐",
        "coverImage": "https://example.com/cover.jpg",
        "contentData": "{\"key\":\"value\"}",
        "caption": "强烈推荐！",
        "tags": ["tag_001", "tag_002"],
        "viewCount": 500,
        "likeCount": 50,
        "commentCount": 10,
        "favoriteCount": 20,
        "shareCount": 5,
        "status": "active",
        "isFeatured": false,
        "createdAt": 1704067200000,
        "updatedAt": 1704067200000,
        "isLiked": false,
        "isFavorited": true
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

### 获取帖子详情

### `GET /api/community/posts/:id`

获取指定帖子的详细信息（访问时自动增加浏览量）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**返回**: 帖子详情（含当前用户的点赞/收藏状态）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "id": "post_abc123",
    "userId": "user_123",
    "userName": "testuser",
    "userAvatar": "https://example.com/avatar.jpg",
    "postType": "jav",
    "title": "精选资源推荐",
    "coverImage": "https://example.com/cover.jpg",
    "contentData": "{\"key\":\"value\"}",
    "caption": "强烈推荐！",
    "tags": ["tag_001", "tag_002"],
    "viewCount": 501,
    "likeCount": 50,
    "commentCount": 10,
    "favoriteCount": 20,
    "shareCount": 5,
    "status": "active",
    "isFeatured": false,
    "createdAt": 1704067200000,
    "updatedAt": 1704067200000,
    "isLiked": false,
    "isFavorited": true
  }
}
```

**错误响应 (404)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "帖子不存在"
  }
}
```

---

### 创建帖子

### `POST /api/community/posts`

发布新的资源分享帖子。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "postType": "string",
  "title": "string",
  "coverImage": "string",
  "contentData": "string",
  "caption": "string?",
  "tags": ["string"]?
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| postType | string | 是 | 帖子类型：`jav` / `anime` / `movie` |
| title | string | 是 | 帖子标题（不可为空） |
| coverImage | string | 是 | 封面图片 URL（不可为空） |
| contentData | string | 是 | 内容数据（JSON 字符串，存储原始搜索结果详情） |
| caption | string | 否 | 用户推荐语 |
| tags | array | 否 | 标签 ID 数组 |

**返回**: 新创建的帖子

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "id": "post_abc123",
    "userId": "user_123",
    "postType": "jav",
    "title": "精选资源推荐",
    "coverImage": "https://example.com/cover.jpg",
    "contentData": "{\"key\":\"value\"}",
    "caption": "强烈推荐",
    "tags": ["tag_001"],
    "status": "active",
    "isFeatured": false,
    "viewCount": 0,
    "likeCount": 0,
    "commentCount": 0,
    "favoriteCount": 0,
    "shareCount": 0,
    "createdAt": 1704067200000,
    "updatedAt": 1704067200000
  },
  "message": "发布成功"
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "无效的帖子类型"
  }
}
```

---

### 更新帖子

### `PUT /api/community/posts/:id`

更新指定帖子的信息（仅限作者，仅允许修改 caption 和 tags）。

**认证**: 需要（仅作者可更新）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**请求体**:
```json
{
  "caption": "string?",
  "tags": ["string"]?
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| caption | string | 否 | 推荐语 |
| tags | array | 否 | 标签 ID 数组 |

**返回**: 更新结果

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "postId": "post_abc123",
    "updatedFields": ["caption", "tags"]
  },
  "message": "更新成功"
}
```

**错误响应 (403)**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "无权编辑此帖子"
  }
}
```

---

### 删除帖子

### `DELETE /api/community/posts/:id`

删除指定的帖子（仅作者可操作）。

**认证**: 需要（仅作者可删除）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**返回**: 删除结果

**响应示例 (200)**:
```json
{
  "success": true,
  "data": null,
  "message": "删除成功"
}
```

**错误响应 (403)**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "无权删除此帖子"
  }
}
```

---

### 更新帖子状态（管理员）

### `PUT /api/community/posts/:id/status`

更新帖子的审核状态（管理员权限）。

**认证**: 需要（admin / super_admin 角色）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**请求体**:
```json
{
  "status": "string"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 是 | 目标状态：`active` / `pending` / `rejected` / `hidden` |

**返回**: 更新结果

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "postId": "post_abc123",
    "status": "rejected"
  },
  "message": "状态更新成功"
}
```

**错误响应 (403)**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "需要管理员权限"
  }
}
```

---

### 设置推荐（管理员）

### `PUT /api/community/posts/:id/feature`

设置或取消帖子的精选推荐状态（管理员权限）。

**认证**: 需要（admin / super_admin 角色）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**请求体**:
```json
{
  "isFeatured": boolean
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| isFeatured | boolean | 是否设为推荐 |

**返回**: 操作结果

**响应示例 (200)** - 设为推荐：
```json
{
  "success": true,
  "data": {
    "postId": "post_abc123",
    "isFeatured": true
  },
  "message": "已设为推荐"
}
```

**响应示例 (200)** - 取消推荐：
```json
{
  "success": true,
  "data": {
    "postId": "post_abc123",
    "isFeatured": false
  },
  "message": "已取消推荐"
}
```

---

## 互动功能

### 点赞/取消点赞

### `POST /api/community/posts/:id/like`

对帖子进行点赞或取消点赞（切换操作）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**返回**: 操作结果（通过数据库触发器自动更新计数）

**响应示例 (200)** - 点赞：
```json
{
  "success": true,
  "data": {
    "liked": true
  },
  "message": "点赞成功"
}
```

**响应示例 (200)** - 取消点赞：
```json
{
  "success": true,
  "data": {
    "liked": false
  },
  "message": "取消点赞"
}
```

**错误响应 (404)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "帖子不存在"
  }
}
```

---

### 收藏/取消收藏

### `POST /api/community/posts/:id/favorite`

对帖子进行收藏或取消收藏（切换操作）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**返回**: 操作结果（通过数据库触发器自动更新计数）

**响应示例 (200)** - 收藏：
```json
{
  "success": true,
  "data": {
    "favorited": true
  },
  "message": "收藏成功"
}
```

**响应示例 (200)** - 取消收藏：
```json
{
  "success": true,
  "data": {
    "favorited": false
  },
  "message": "取消收藏"
}
```

**错误响应 (404)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "帖子不存在"
  }
}
```

---

## 评论功能

### 获取评论列表

### `GET /api/community/posts/:id/comments`

获取指定帖子的评论列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| pageSize | number | 否 | 每页数量（默认 20，最大 50） |

**返回**: 评论列表（按时间倒序）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cmt_abc123",
        "postId": "post_xyz",
        "userId": "user_123",
        "userName": "testuser",
        "userAvatar": "https://example.com/avatar.jpg",
        "content": "非常棒的分享，感谢！",
        "createdAt": 1704067200000,
        "updatedAt": 1704067200000
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

**错误响应 (404)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "帖子不存在"
  }
}
```

---

### 发表评论

### `POST /api/community/comments`

对帖子发表文字评论。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "postId": "string",
  "content": "string"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| postId | string | 是 | 目标帖子 ID |
| content | string | 是 | 评论内容（1-1000 字符） |

**返回**: 新创建的评论（通过触发器自动更新帖子评论计数）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "id": "cmt_abc123",
    "postId": "post_xyz",
    "userId": "user_123",
    "content": "非常棒的分享，感谢！",
    "createdAt": 1704067200000,
    "updatedAt": 1704067200000
  },
  "message": "评论成功"
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "评论内容不能为空"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "评论内容最多1000个字符"
  }
}
```

---

### 删除评论

### `DELETE /api/community/comments/:id`

删除指定评论（作者或管理员可操作）。

**认证**: 需要（作者或 admin / super_admin）

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 评论ID |

**返回**: 删除结果（通过触发器自动更新帖子评论计数）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": null,
  "message": "删除成功"
}
```

**错误响应 (403)**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "无权删除此评论"
  }
}
```

---

## 举报

### 举报帖子

### `POST /api/community/posts/:id/report`

举报指定的帖子（同一用户对同一帖子只能有一个待处理举报）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 帖子ID |

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
| reason | string | 是 | 举报原因（不可为空） |
| details | string | 否 | 详细说明 |

**返回**: 举报结果

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "reportId": "rpt_abc123"
  },
  "message": "举报已提交，感谢您的反馈"
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ERROR",
    "message": "您已举报过该帖子，请等待处理结果"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请提供举报原因"
  }
}
```

---

## 个人中心

### 我的帖子

### `GET /api/community/posts/my-posts`

获取当前用户发布的帖子列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| pageSize | number | 否 | 每页数量（默认 20，最大 50） |
| status | string | 否 | 状态筛选：`active` / `pending` / `rejected` / `hidden` |

**返回**: 我的帖子列表（按时间倒序）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "post_abc123",
        "userId": "user_123",
        "postType": "jav",
        "title": "精选资源推荐",
        "coverImage": "https://example.com/cover.jpg",
        "contentData": "{}",
        "caption": "",
        "tags": [],
        "viewCount": 100,
        "likeCount": 20,
        "commentCount": 5,
        "favoriteCount": 10,
        "shareCount": 2,
        "status": "active",
        "isFeatured": false,
        "createdAt": 1704067200000,
        "updatedAt": 1704067200000
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 我的收藏

### `GET /api/community/posts/my-favorites`

获取当前用户收藏的帖子列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| pageSize | number | 否 | 每页数量（默认 20，最大 50） |

**返回**: 收藏列表（按收藏时间倒序，仅包含 active 状态的帖子）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "post_xyz789",
        "userId": "user_other",
        "userName": "otheruser",
        "userAvatar": "https://example.com/avatar2.jpg",
        "postType": "anime",
        "title": "动漫资源合集",
        "coverImage": "https://example.com/cover2.jpg",
        "contentData": "{}",
        "caption": "经典作品",
        "tags": [],
        "viewCount": 300,
        "likeCount": 45,
        "commentCount": 8,
        "favoriteCount": 15,
        "shareCount": 3,
        "status": "active",
        "isFeatured": false,
        "createdAt": 1703980800000,
        "updatedAt": 1703980800000,
        "isFavorited": true
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

## 统计

### 社区统计

### `GET /api/community/stats`

获取社区整体统计数据（带 Cache API 缓存）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 社区统计数据

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "totalPosts": 500,
    "totalUsers": 120,
    "totalComments": 2000,
    "totalLikes": 8000,
    "averageEngagement": 20.0,
    "postsByType": [
      { "type": "jav", "count": 300 },
      { "type": "anime", "count": 150 },
      { "type": "movie", "count": 50 }
    ],
    "recentActivity": [
      {
        "id": "post_latest1",
        "type": "jav",
        "title": "最新 JAV 资源",
        "createdAt": 1704153600000
      }
    ]
  }
}
```

**缓存说明**:
- 响应头包含 `X-Cache: HIT` 表示命中缓存
- 缓存 key 为 `https://internal/community-stats`

---

### 用户统计

### `GET /api/community/user-stats`

获取当前用户在社区的贡献统计数据。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 用户统计数据（含最近发布的帖子）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "postsCount": 25,
    "likesReceived": 150,
    "favoritesReceived": 80,
    "commentsCount": 30,
    "reputationScore": 180,
    "contributionLevel": "expert",
    "recentPosts": [
      {
        "id": "post_abc123",
        "userId": "user_123",
        "userName": "testuser",
        "postType": "jav",
        "title": "最新分享",
        "coverImage": "https://example.com/cover.jpg",
        "contentData": "{}",
        "caption": "",
        "tags": [],
        "viewCount": 50,
        "likeCount": 10,
        "commentCount": 2,
        "favoriteCount": 5,
        "shareCount": 1,
        "status": "active",
        "isFeatured": false,
        "createdAt": 1704067200000,
        "updatedAt": 1704067200000
      }
    ]
  }
}
```

**贡献等级说明**:
| 等级 | 条件 |
|------|------|
| beginner | 默认（< 5 帖子） |
| contributor | ≥ 5 帖子 |
| expert | ≥ 20 帖子 |
| master | ≥ 50 帖子 |

---

## 通知

### 获取通知列表

### `GET /api/community/notifications`

获取当前用户的通知列表（基于用户发布帖子的互动事件）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| pageSize | number | 否 | 每页数量（默认 20，最大 50） |

**通知类型**:
| type | 触发条件 | content 示例 |
|------|----------|--------------|
| like | 其他人点赞了你的帖子 | "点赞了你的帖子" |
| comment | 其他人评论了你的帖子 | "评论了你的帖子：xxx..." |
| favorite | 其他人收藏了你的帖子 | "收藏了你的帖子" |
| report_resolved | 举报被处理 | "对举报"xxx"的处理结果：已解决/已驳回" |

**返回**: 通知列表（按时间倒序聚合）

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "like_abc123",
        "type": "like",
        "postId": "post_xyz",
        "postTitle": "我的精彩分享",
        "postCoverImage": "https://example.com/cover.jpg",
        "actorName": "testuser",
        "content": "点赞了你的帖子",
        "createdAt": 1704153600000,
        "isRead": false
      },
      {
        "id": "comment_def456",
        "type": "comment",
        "postId": "post_xyz",
        "postTitle": "我的精彩分享",
        "postCoverImage": "https://example.com/cover.jpg",
        "actorName": "otheruser",
        "content": "评论了你的帖子：这个资源太棒了，感谢分享！",
        "createdAt": 1704148000000,
        "isRead": false
      },
      {
        "id": "report_ghi789",
        "type": "report_resolved",
        "postId": "post_old",
        "postTitle": "旧帖子",
        "postCoverImage": "https://example.com/old_cover.jpg",
        "actorName": null,
        "content": "对举报\"违规内容\"的处理结果：已驳回",
        "createdAt": 1704100000000,
        "isRead": false
      }
    ],
    "total": 15,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

**特殊行为**:
- 如果用户从未发布过任何帖子，返回空列表
- 通知为实时聚合生成（非持久化存储），每次请求重新计算
- `isRead` 字段当前固定为 `false`（预留字段）
