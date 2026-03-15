# 用户数据接口 `/api/user`

> [返回API目录](./index.md)

**认证方式**: 全局 authMiddleware，所有接口需要认证

---

## 目录

- [获取用户设置](#获取用户设置)
- [更新用户设置](#更新用户设置)
- [获取收藏列表](#获取收藏列表)
- [添加收藏](#添加收藏)
- [删除收藏](#删除收藏)
- [获取搜索历史](#获取搜索历史)
- [保存搜索记录](#保存搜索记录)
- [清空搜索历史](#清空搜索历史)
- [删除单条搜索历史](#删除单条搜索历史)
- [获取搜索统计](#获取搜索统计)
- [获取用户搜索源配置](#获取用户搜索源配置)
- [更新搜索源配置](#更新搜索源配置)
- [获取个人活动记录](#获取个人活动记录)
- [获取个人活动统计](#获取个人活动统计)

---

## 获取用户设置

### `GET /api/user/settings`

获取当前用户的设置信息。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 用户设置对象

**响应示例**:
```json
{
  "success": true,
  "data": {
    "settings": {
      "theme": "dark",
      "language": "zh-CN",
      "notifications": {
        "email": true,
        "push": false
      },
      "privacy": {
        "showProfile": true,
        "showHistory": false
      }
    }
  }
}
```

---

## 更新用户设置

### `PUT /api/user/settings`

更新当前用户的设置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "settings": {}
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| settings | object | 是 | 设置对象（任意JSON结构） |

**返回**: 更新后的设置

**响应示例**:
```json
{
  "success": true,
  "data": {
    "settings": {
      "theme": "light",
      "language": "en-US"
    }
  },
  "message": "设置已保存"
}
```

---

## 获取收藏列表

### `GET /api/user/favorites`

获取当前用户的所有收藏。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 收藏列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "favorites": [
      {
        "id": "fav_abc123",
        "user_id": "user_123",
        "title": "Google搜索",
        "subtitle": "全球最大搜索引擎",
        "url": "https://www.google.com/search?q={keyword}",
        "icon": "🔍",
        "keyword": null,
        "created_at": 1704067200000,
        "updated_at": 1704067200000
      }
    ]
  }
}
```

---

## 添加收藏

### `POST /api/user/favorites`

添加一个新的收藏。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "title": "string",
  "subtitle": "string?",
  "url": "string",
  "icon": "string?",
  "keyword": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 标题（最多100字符） |
| subtitle | string | 否 | 副标题（最多200字符） |
| url | string | 是 | 有效URL（最多500字符） |
| icon | string | 否 | 图标（最多50字符） |
| keyword | string | 否 | 关键词（最多100字符） |

**返回**: 新创建的收藏信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "fav_abc123",
    "title": "Google搜索",
    "subtitle": "全球最大搜索引擎",
    "url": "https://www.google.com/search?q={keyword}",
    "icon": "🔍",
    "keyword": null,
    "createdAt": 1704067200000
  },
  "message": "收藏成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 标题和URL是必填项 |
| `VALIDATION_ERROR` | 400 | 最多只能收藏N个搜索源 |

**特殊行为**:
- 如果URL已存在，返回已存在的收藏信息，不重复创建

---

## 删除收藏

### `DELETE /api/user/favorites/:id`

删除指定的收藏项。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 收藏项ID |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "已取消收藏"
}
```

---

## 获取搜索历史

### `GET /api/user/search-history`

获取当前用户的搜索历史记录。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量限制（默认100） |

**返回**: 搜索历史记录列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "hist_abc123",
        "user_id": "user_123",
        "query": "test keyword",
        "source": "all",
        "results_count": 50,
        "created_at": 1704067200000
      }
    ]
  }
}
```

---

## 保存搜索记录

### `POST /api/user/search-history`

保存一条搜索历史记录。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "query": "string",
  "source": "string?",
  "resultsCount": "number?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 搜索关键词（最多200字符） |
| source | string | 否 | 搜索源（最多100字符） |
| resultsCount | number | 否 | 结果数量 |

**返回**: 新创建的历史记录

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "hist_abc123",
    "query": "test keyword",
    "source": "all",
    "resultsCount": 50,
    "createdAt": 1704067200000
  },
  "message": "搜索历史已保存"
}
```

**特殊行为**:
- 如果历史记录超过最大限制，自动删除最旧的记录

---

## 清空搜索历史

### `DELETE /api/user/search-history`

清空当前用户的所有搜索历史。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "搜索历史已清空"
}
```

---

## 删除单条搜索历史

### `DELETE /api/user/search-history/:id`

删除指定的搜索历史记录。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 历史记录ID |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "搜索历史已删除"
}
```

---

## 获取搜索统计

### `GET /api/user/search-stats`

获取当前用户的搜索统计数据。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 搜索统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalSearches": 150,
    "topSources": [
      {
        "source": "google",
        "count": 50
      },
      {
        "source": "baidu",
        "count": 30
      }
    ],
    "recentSearches": [
      {
        "query": "test keyword",
        "created_at": 1704067200000
      }
    ],
    "searchGrowthPercent": 15,
    "thisWeekSearches": 25,
    "lastWeekSearches": 22
  }
}
```

**返回字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| totalSearches | number | 总搜索次数 |
| topSources | array | 常用搜索源（Top 5） |
| recentSearches | array | 最近搜索记录（10条） |
| searchGrowthPercent | number | 搜索增长百分比 |
| thisWeekSearches | number | 本周搜索次数 |
| lastWeekSearches | number | 上周搜索次数 |

---

## 获取用户搜索源配置

### `GET /api/user/source-configs`

获取当前用户对所有搜索源的个性化配置。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 搜索源配置列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "configs": [
      {
        "id": "cfg_abc123",
        "user_id": "user_123",
        "source_id": "source_456",
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

## 更新搜索源配置

### `PUT /api/user/source-configs/:sourceId`

更新用户对特定搜索源的个性化配置。

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

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| isEnabled | boolean | 否 | 是否启用 |
| customPriority | number | 否 | 自定义优先级（1-10） |
| customName | string | 否 | 自定义名称 |
| customSubtitle | string | 否 | 自定义副标题 |
| customIcon | string | 否 | 自定义图标 |
| notes | string | 否 | 备注 |

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

## 获取个人活动记录

### `GET /api/user/activities`

获取当前用户的活动记录。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认100，最大100） |
| offset | number | 否 | 偏移量（默认0） |
| action | string | 否 | 行为类型筛选 |

**返回**: 活动列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "act_abc123",
        "action": "login",
        "actionLabel": "登录",
        "data": {
          "method": "password",
          "ip": "192.168.1.1"
        },
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0...",
        "createdAt": 1704067200000
      }
    ],
    "total": 150,
    "limit": 100,
    "offset": 0
  }
}
```

**行为类型映射**:
| action | actionLabel |
|--------|-------------|
| login | 登录 |
| login_failed | 登录失败 |
| logout | 登出 |
| search | 搜索 |
| add_favorite | 添加收藏 |
| remove_favorite | 取消收藏 |
| sync_favorites | 同步收藏 |
| update_settings | 更新设置 |
| change_password | 修改密码 |
| change_email | 修改邮箱 |
| delete_account | 删除账户 |
| clear_search_history | 清空搜索历史 |
| share_source | 分享搜索源 |
| review_source | 评价搜索源 |
| report_source | 举报搜索源 |

---

## 获取个人活动统计

### `GET /api/user/activities/stats`

获取当前用户的活动统计数据。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 活动统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "total": 500,
    "today": 10,
    "week": 50,
    "month": 200,
    "actionsByType": [
      {
        "action": "search",
        "count": 200
      },
      {
        "action": "login",
        "count": 50
      }
    ],
    "summary": {
      "logins": 10,
      "thisWeekLogins": 3,
      "lastWeekLogins": 2,
      "failedLogins": 1,
      "searches": 50,
      "favorites": 5
    }
  }
}
```

**返回字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| total | number | 总活动数 |
| today | number | 今日活动数 |
| week | number | 本周活动数 |
| month | number | 本月活动数 |
| actionsByType | array | 按类型分组统计 |
| summary.logins | number | 最近一个月登录次数 |
| summary.thisWeekLogins | number | 本周登录次数 |
| summary.lastWeekLogins | number | 上周登录次数 |
| summary.failedLogins | number | 最近一个月登录失败次数 |
| summary.searches | number | 最近一个月搜索次数 |
| summary.favorites | number | 最近一个月收藏操作次数 |
