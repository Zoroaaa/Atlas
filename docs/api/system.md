# 系统接口 `/api`

> [返回API目录](./index.md)

**认证方式**: 部分公开，部分需要认证

---

## 目录

### 公开接口
- [获取公开配置](#获取公开配置)
- [健康检查](#健康检查)

### 认证接口
- [检查搜索源状态](#检查搜索源状态)
- [批量检查搜索源状态（POST）](#批量检查搜索源状态post)
- [批量检查搜索源状态（GET）](#批量检查搜索源状态get)
- [获取搜索源状态历史](#获取搜索源状态历史)
- [清除搜索源状态缓存](#清除搜索源状态缓存)
- [记录用户行为](#记录用户行为)
- [获取用户行为记录](#获取用户行为记录)
- [获取系统统计](#获取系统统计)

---

## 公开接口

### 获取公开配置

### `GET /api/public-config`

获取公开的系统配置（无需认证）。

**认证**: 公开

**返回**: 公开配置对象

**响应示例**:
```json
{
  "success": true,
  "data": {
    "appVersion": "2.0.0",
    "siteName": "磁力快搜",
    "siteDescription": "搜索全网资源，一步直达",
    "allowRegistration": true,
    "communityEnabled": true
  }
}
```

---

### 健康检查

### `GET /api/health`

检查系统健康状态。

**认证**: 公开

**返回**: 系统健康状态

**响应示例**:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": 1704067200000,
    "version": "2.0.0"
  }
}
```

---

## 认证接口

### 检查搜索源状态

### `GET /api/source-status-check`

检查单个搜索源的可访问状态。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceId | string | 是 | 搜索源ID |

**返回**: 状态检查结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "status": "online",
    "available": true,
    "responseTime": 150,
    "qualityScore": 100,
    "error": null,
    "cached": false,
    "checkedUrl": "https://example.com"
  }
}
```

**状态说明**:
| status | 说明 |
|--------|------|
| online | 在线正常 |
| restricted | 受限（HTTP 4xx） |
| timeout | 请求超时 |
| offline | 离线/不可达 |
| error | 其他错误 |

**说明**:
- 优先返回5分钟内的缓存结果
- 缓存不存在时实时检测
- 检测超时时间为10秒

---

### 批量检查搜索源状态（POST）

### `POST /api/source-status-batch`

批量检查多个搜索源的可访问状态。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "sourceIds": ["string"]
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceIds | array | 是 | 搜索源ID数组（最多30个） |

**返回**: 批量检查结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "sourceId": "src_abc123",
        "sourceName": "Google",
        "status": "online",
        "available": true,
        "responseTime": 150,
        "error": null,
        "cached": true
      }
    ],
    "checkedAt": 1704067200000,
    "summary": {
      "total": 10,
      "available": 8,
      "unavailable": 2
    }
  }
}
```

**说明**:
- 优先使用缓存结果
- 缓存有效期5分钟
- 并发检测，超时9秒

---

### 批量检查搜索源状态（GET）

### `GET /api/source-status-batch`

批量查询多个搜索源的缓存状态（不触发实时检测）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceIds | string | 是 | 搜索源ID列表（逗号分隔，最多50个） |

**返回**: 缓存状态查询结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "sourceId": "src_abc123",
        "status": "online",
        "available": true,
        "responseTime": 150,
        "cached": true,
        "cacheAgeSeconds": 120,
        "error": null
      },
      {
        "sourceId": "src_def456",
        "status": "unchecked",
        "available": false,
        "responseTime": 0,
        "cached": false,
        "cacheAgeSeconds": null,
        "error": "尚未检查"
      }
    ]
  }
}
```

---

### 获取搜索源状态历史

### `GET /api/source-status-history/:sourceId`

获取指定搜索源的状态检测历史。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| sourceId | string | 搜索源ID |

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认50） |
| hours | number | 否 | 时间范围（默认24小时） |

**返回**: 状态历史及统计

**响应示例**:
```json
{
  "success": true,
  "data": {
    "source": {
      "id": "src_abc123",
      "name": "Google",
      "url_template": "https://www.google.com/search?q={keyword}"
    },
    "history": [
      {
        "status": "online",
        "available": true,
        "responseTime": 150,
        "checkedAt": "2024-01-01T00:00:00.000Z",
        "error": null
      }
    ],
    "summary": {
      "totalChecks": 100,
      "availableCount": 95,
      "unavailableCount": 5,
      "availabilityRate": 95,
      "avgResponseTime": 180,
      "lastChecked": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

### 清除搜索源状态缓存

### `DELETE /api/source-status-cache/:sourceId`

清除指定搜索源的状态缓存。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| sourceId | string | 搜索源ID |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "缓存已清除"
}
```

---

### 记录用户行为

### `POST /api/record-action`

记录用户行为日志。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "action": "string",
  "data": {}?
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 行为类型 |
| data | object | 否 | 行为数据 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "act_abc123"
  },
  "message": "行为已记录"
}
```

**常用行为类型**:
| action | 说明 |
|--------|------|
| login | 登录 |
| logout | 登出 |
| search | 搜索 |
| click_source | 点击搜索源 |
| add_favorite | 添加收藏 |
| remove_favorite | 取消收藏 |
| share | 分享 |
| view_page | 浏览页面 |
| error | 错误 |

---

### 获取用户行为记录

### `GET /api/user-actions`

获取当前用户的行为记录。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认100） |
| offset | number | 否 | 偏移量（默认0） |
| action | string | 否 | 行为类型筛选 |

**返回**: 行为记录列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "actions": [
      {
        "id": "act_abc123",
        "user_id": "user_123",
        "action": "search",
        "data": {
          "keyword": "test",
          "source": "google"
        },
        "ip_address": "192.168.1.1",
        "user_agent": "Mozilla/5.0...",
        "created_at": 1704067200000
      }
    ],
    "total": 500,
    "limit": 100,
    "offset": 0
  }
}
```

---

### 获取系统统计

### `GET /api/stats`

获取系统统计数据。

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
    "users": 1000,
    "sources": 80,
    "searches": 50000,
    "activeUsers": 150,
    "activeUsersGrowthPercent": 10
  }
}
```

**返回字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| users | number | 活跃用户总数 |
| sources | number | 活跃搜索源总数 |
| searches | number | 搜索历史总数 |
| activeUsers | number | 本周活跃用户数 |
| activeUsersGrowthPercent | number | 活跃用户增长率（相比上周） |
