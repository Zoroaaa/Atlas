# 管理员接口 `/api/admin`

> [返回API目录](./index.md)

**认证方式**: 全局管理员中间件，所有接口需要管理员权限

---

## 目录

### 角色管理
- [获取角色列表](#获取角色列表)

### 用户管理
- [获取用户统计概览](#获取用户统计概览)
- [获取用户列表](#获取用户列表)
- [获取用户详情](#获取用户详情)
- [更新用户状态](#更新用户状态)
- [更新用户角色](#更新用户角色)
- [更新用户权限](#更新用户权限)
- [获取用户登录日志](#获取用户登录日志)
- [获取活跃用户排行](#获取活跃用户排行)

### 举报管理
- [获取举报列表](#获取举报列表)
- [处理举报](#处理举报)

### 统计分析
- [获取系统统计](#获取系统统计)
- [获取登录日志统计](#获取登录日志统计)

### 日志管理
- [获取行为日志统计概览](#获取行为日志统计概览)
- [获取行为日志](#获取行为日志)

### 数据清理
- [手动清理过期数据](#手动清理过期数据)

### 会话管理
- [获取会话统计概览](#获取会话统计概览)
- [获取会话列表](#获取会话列表)
- [强制终止会话](#强制终止会话)

### 分析事件
- [获取分析事件统计](#获取分析事件统计)
- [获取分析事件列表](#获取分析事件列表)

### 看板数据
- [获取看板概览数据](#获取看板概览数据)
- [获取趋势数据](#获取趋势数据)
- [获取用户行为分析](#获取用户行为分析)

---

## 角色管理

### 获取角色列表

### `GET /api/admin/roles`

获取系统中所有角色列表。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 角色列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "roles": [
      {
        "id": "super_admin",
        "name": "super_admin",
        "displayName": "超级管理员",
        "description": "拥有系统最高权限",
        "permissions": ["*"],
        "isSystem": true,
        "priority": 100,
        "createdAt": 1704067200000,
        "updatedAt": 1704067200000
      },
      {
        "id": "admin",
        "name": "admin",
        "displayName": "管理员",
        "description": "系统管理员",
        "permissions": ["admin.*", "user.*"],
        "isSystem": true,
        "priority": 80,
        "createdAt": 1704067200000,
        "updatedAt": 1704067200000
      }
    ]
  }
}
```

---

## 用户管理

### 获取用户统计概览

### `GET /api/admin/users/stats`

获取用户相关的统计数据概览。

**认证**: 需要管理员权限

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
    "total": 1000,
    "active": 800,
    "inactive": 200,
    "verified": 600,
    "newToday": 10,
    "newWeek": 50,
    "newMonth": 200,
    "activeToday": 150,
    "roleDistribution": [
      { "display_name": "普通用户", "count": 800 },
      { "display_name": "VIP用户", "count": 150 }
    ]
  }
}
```

---

### 获取用户列表

### `GET /api/admin/users`

获取系统用户列表，支持分页和筛选。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大100） |
| search | string | 否 | 关键词搜索（用户名/邮箱） |
| status | string | 否 | 状态筛选（active/inactive） |
| roleId | string | 否 | 角色ID筛选 |

**返回**: 用户列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user_abc123",
        "username": "testuser",
        "email": "test@example.com",
        "isActive": true,
        "emailVerified": true,
        "loginCount": 10,
        "createdAt": 1704067200000,
        "lastLogin": 1704153600000,
        "permissions": ["search", "favorite"],
        "role": "user",
        "roleDisplayName": "普通用户"
      }
    ],
    "total": 1000,
    "page": 1,
    "pageSize": 20,
    "totalPages": 50
  }
}
```

---

### 获取用户详情

### `GET /api/admin/users/:id`

获取指定用户的详细信息。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 用户ID |

**返回**: 用户详情

**响应示例**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_abc123",
      "username": "testuser",
      "email": "test@example.com",
      "isActive": true,
      "emailVerified": true,
      "loginCount": 10,
      "createdAt": 1704067200000,
      "lastLogin": 1704153600000,
      "permissions": ["search", "favorite", "history"],
      "settings": {
        "theme": "dark",
        "language": "zh-CN"
      },
      "role": "user",
      "roleDisplayName": "普通用户",
      "rolePermissions": ["search", "favorite", "history"]
    },
    "stats": {
      "favoritesCount": 5,
      "historyCount": 50,
      "activeSessions": 2,
      "totalLoginCount": 10,
      "totalSearchCount": 100
    },
    "recentSessions": [],
    "recentActions": []
  }
}
```

---

### 更新用户状态

### `PUT /api/admin/users/:id/status`

更新指定用户的激活状态。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 用户ID |

**请求体**:
```json
{
  "isActive": "boolean",
  "reason": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| isActive | boolean | 是 | 激活状态 |
| reason | string | 否 | 操作原因 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "用户已禁用"
}
```

---

### 更新用户角色

### `PUT /api/admin/users/:id/role`

更新指定用户的角色。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 用户ID |

**请求体**:
```json
{
  "roleId": "string"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId | string | 是 | 角色ID |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "roleId": "vip",
    "roleName": "VIP用户"
  },
  "message": "角色已更新"
}
```

---

### 更新用户权限

### `PUT /api/admin/users/:id/permissions`

更新指定用户的自定义权限。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 用户ID |

**请求体**:
```json
{
  "permissions": ["string"]
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| permissions | array | 是 | 权限列表 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "permissions": ["search", "favorite", "history"]
  },
  "message": "权限已更新"
}
```

---

### 获取用户登录日志

### `GET /api/admin/users/:id/login-logs`

获取指定用户的登录日志。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 用户ID |

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大100） |

**返回**: 登录日志列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_abc123",
        "loginTime": 1704067200000,
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0...",
        "loginStatus": "success",
        "loginMethod": "password",
        "failureReason": null
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

### 获取活跃用户排行

### `GET /api/admin/active-users`

获取活跃用户排行榜。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认20，最大100） |
| days | number | 否 | 统计天数（默认7） |

**返回**: 活跃用户列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user_abc123",
        "username": "testuser",
        "email": "test@example.com",
        "roleDisplayName": "普通用户",
        "totalLoginCount": 100,
        "recentLogins": 10,
        "recentSearches": 50
      }
    ]
  }
}
```

---

## 举报管理

### 获取举报列表

### `GET /api/admin/reports`

获取举报记录列表。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大100） |
| status | string | 否 | 状态筛选（默认pending，可选resolved/dismissed） |

**返回**: 举报列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": "report_abc123",
        "shared_source_id": "share_xyz",
        "source_name": "分享资源名称",
        "source_url_template": "https://...",
        "reporter_user_id": "user_456",
        "reporter_username": "reporter",
        "report_reason": "spam",
        "report_details": "垃圾广告内容",
        "status": "pending",
        "created_at": 1704067200000
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

---

### 处理举报

### `PUT /api/admin/reports/:id`

处理指定的举报。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 举报ID |

**请求体**:
```json
{
  "status": "string",
  "action": "string?",
  "notes": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 是 | 处理状态（resolved/dismissed） |
| action | string | 否 | 处理动作（remove_source等） |
| notes | string | 否 | 处理备注 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "举报已处理"
}
```

---

## 统计分析

### 获取系统统计

### `GET /api/admin/stats`

获取系统整体统计数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 系统统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 1000,
      "active": 800,
      "verified": 600,
      "newThisWeek": 50,
      "dailyActive": 150
    },
    "roles": [
      {
        "id": "user",
        "name": "user",
        "displayName": "普通用户",
        "userCount": 800
      }
    ],
    "sources": {
      "total": 100,
      "active": 80,
      "searchable": 75,
      "totalUsage": 10000
    },
    "searches": {
      "total": 50000,
      "uniqueUsers": 500,
      "uniqueKeywords": 5000
    },
    "community": {
      "sharedSources": 200,
      "tags": 50,
      "reviews": 300,
      "pendingReports": 10
    },
    "topSearchKeywords": [
      { "query": "test", "count": 500 }
    ],
    "topUsedSources": [
      { "name": "Google", "usage_count": 1000 }
    ]
  }
}
```

---

### 获取登录日志统计

### `GET /api/admin/login-stats`

获取登录相关的统计数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 统计天数（默认7） |

**返回**: 登录统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "dailyStats": [
      {
        "date": "2024-01-01",
        "total": 100,
        "success": 95,
        "failed": 5,
        "unique_users": 80
      }
    ],
    "topIPs": [
      { "ip_address": "192.168.1.1", "count": 50 }
    ],
    "failedAttempts": [
      { "ip_address": "192.168.1.100", "count": 10 }
    ]
  }
}
```

---

## 日志管理

### 获取行为日志统计概览

### `GET /api/admin/logs/stats`

获取行为日志的统计概览。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 日志统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "total": 10000,
    "today": 500,
    "week": 3000,
    "uniqueUsersToday": 100,
    "actionsByType": [
      { "action": "search", "count": 200 },
      { "action": "login", "count": 100 }
    ],
    "loginToday": {
      "success": 95,
      "failed": 5
    }
  }
}
```

---

### 获取行为日志

### `GET /api/admin/logs`

获取用户行为日志列表。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大200） |
| userId | string | 否 | 用户ID筛选 |
| username | string | 否 | 用户名筛选（模糊匹配） |
| action | string | 否 | 操作类型筛选（多个用逗号分隔） |

**返回**: 日志列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_abc123",
        "user_id": "user_123",
        "action": "search",
        "data": "{\"query\":\"test\"}",
        "ip_address": "192.168.1.1",
        "user_agent": "Mozilla/5.0...",
        "created_at": 1704067200000,
        "username": "testuser"
      }
    ],
    "total": 1000,
    "page": 1,
    "pageSize": 20,
    "totalPages": 50
  }
}
```

---

## 数据清理

### 手动清理过期数据

### `POST /api/admin/cleanup`

手动清理过期的数据记录。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 清理结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "oldPasswordResetLogs": 10,
    "oldActions": 100,
    "oldSecurityEvents": 5
  },
  "message": "数据清理完成"
}
```

---

## 会话管理

### 获取会话统计概览

### `GET /api/admin/sessions/stats`

获取会话相关的统计数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 会话统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "total": 500,
    "active": 100,
    "uniqueUsers": 80,
    "recentlyActive": 50,
    "todaySessions": 30,
    "deviceDistribution": [
      { "device_type": "Desktop", "count": 60 },
      { "device_type": "Mobile", "count": 35 },
      { "device_type": "Tablet", "count": 5 }
    ]
  }
}
```

---

### 获取会话列表

### `GET /api/admin/sessions`

获取所有会话列表。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大100） |
| userId | string | 否 | 用户ID筛选 |
| status | string | 否 | 状态筛选（active/expired） |

**返回**: 会话列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "sess_abc123",
        "userId": "user_123",
        "username": "testuser",
        "email": "test@example.com",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0...",
        "createdAt": 1704067200000,
        "lastActivity": 1704153600000,
        "expiresAt": 1704240000000,
        "isActive": true,
        "expiresInSeconds": 86400
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

---

### 强制终止会话

### `DELETE /api/admin/sessions/:id`

强制终止指定会话。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 会话ID |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "会话已终止"
}
```

---

## 分析事件

### 获取分析事件统计

### `GET /api/admin/analytics/stats`

获取分析事件的统计数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 统计天数（默认7） |

**返回**: 分析统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalEvents": 10000,
    "uniqueUsers": 500,
    "uniqueSessions": 600,
    "eventsByType": [
      { "event_type": "page_view", "count": 5000 }
    ],
    "dailyEvents": [
      { "date": "2024-01-01", "count": 1000 }
    ],
    "topReferers": [
      { "referer": "https://google.com", "count": 500 }
    ],
    "hourlyDistribution": [
      { "hour": "00", "count": 100 }
    ],
    "period": {
      "days": 7,
      "startTime": 1704067200000
    }
  }
}
```

---

### 获取分析事件列表

### `GET /api/admin/analytics/events`

获取分析事件列表。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大100） |
| eventType | string | 否 | 事件类型筛选 |
| userId | string | 否 | 用户ID筛选 |

**返回**: 事件列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "evt_abc123",
        "userId": "user_123",
        "username": "testuser",
        "sessionId": "sess_xyz",
        "eventType": "page_view",
        "eventData": { "page": "/search" },
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0...",
        "referer": "https://google.com",
        "createdAt": 1704067200000
      }
    ],
    "total": 1000,
    "page": 1,
    "pageSize": 20,
    "totalPages": 50
  }
}
```

---

## 看板数据

### 获取看板概览数据

### `GET /api/admin/dashboard/overview`

获取管理看板的概览统计数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 看板概览数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 1000,
      "active": 800,
      "newToday": 10,
      "newWeek": 50,
      "newMonth": 200,
      "activeToday": 150
    },
    "sessions": {
      "total": 500,
      "active": 100,
      "uniqueUsers": 80
    },
    "actions": {
      "total": 10000,
      "uniqueUsers": 500,
      "today": 500,
      "week": 3000
    },
    "analytics": {
      "total": 50000,
      "uniqueUsers": 800,
      "uniqueSessions": 900,
      "today": 2000,
      "week": 15000
    },
    "sources": {
      "total": 100,
      "active": 80,
      "totalUsage": 10000
    },
    "searches": {
      "total": 50000,
      "uniqueUsers": 500,
      "today": 500,
      "week": 3000
    },
    "logins": {
      "successToday": 100,
      "failedToday": 5
    },
    "community": {
      "sharedSources": 200,
      "reviews": 300,
      "pendingReports": 10
    },
    "recentActions": [
      {
        "action": "login",
        "data": {},
        "createdAt": 1704067200000,
        "username": "testuser"
      }
    ]
  }
}
```

---

### 获取趋势数据

### `GET /api/admin/dashboard/trends`

获取各项趋势数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 统计天数（默认7） |

**返回**: 趋势数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "userRegistrations": [
      { "date": "2024-01-01", "count": 10 }
    ],
    "dailyLogins": [
      { "date": "2024-01-01", "total": 100, "success": 95, "failed": 5 }
    ],
    "dailySearches": [
      { "date": "2024-01-01", "count": 500 }
    ],
    "dailyAnalytics": [
      { "date": "2024-01-01", "count": 1000 }
    ],
    "dailyActiveUsers": [
      { "date": "2024-01-01", "count": 150 }
    ],
    "period": {
      "days": 7,
      "startTime": 1704067200000
    }
  }
}
```

---

### 获取用户行为分析

### `GET /api/admin/dashboard/user-behavior`

获取用户行为分析数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 统计天数（默认7） |

**返回**: 用户行为数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "actionsByType": [
      { "action": "search", "count": 500 }
    ],
    "topActiveUsers": [
      { "id": "user_123", "username": "testuser", "email": "test@example.com", "action_count": 100 }
    ],
    "hourlyActivity": [
      { "hour": "00", "count": 50 }
    ],
    "weeklyActivity": [
      { "weekday": "0", "count": 200 }
    ],
    "period": {
      "days": 7,
      "startTime": 1704067200000
    }
  }
}
```
