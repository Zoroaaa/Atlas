# 系统配置接口 `/api/config`

> [返回API目录](./index.md)

**认证方式**: 全局 authMiddleware，所有接口需要认证，部分接口需要管理员/超级管理员权限

---

## 目录

### 配置管理
- [获取公开配置](#获取公开配置)
- [获取所有配置](#获取所有配置)
- [获取配置分组](#获取配置分组)
- [获取单个配置](#获取单个配置)
- [更新配置](#更新配置)
- [批量更新配置](#批量更新配置)
- [重置配置](#重置配置)
- [删除配置](#删除配置)
- [导出配置](#导出配置)
- [导入配置](#导入配置)
- [获取配置变更日志](#获取配置变更日志)

### 分析事件
- [记录分析事件](#记录分析事件)
- [获取分析统计](#获取分析统计)

### 邮件日志
- [获取邮件日志列表](#获取邮件日志列表)

---

## 配置管理

### 获取公开配置

### `GET /api/config/public`

获取公开的系统配置（无需管理员权限）。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 公开配置对象

**响应示例**:
```json
{
  "success": true,
  "data": {
    "site_name": "磁力快搜",
    "site_description": "搜索全网资源，一步直达",
    "enable_registration": true,
    "community_enabled": true,
    "max_login_attempts": 5
  }
}
```

**说明**:
- 只返回 `is_public = 1` 的配置项
- 布尔值和数值会自动转换类型

---

### 获取所有配置

### `GET /api/config/all`

获取所有系统配置。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 配置列表

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "key": "site_name",
      "value": "磁力快搜",
      "description": "网站名称",
      "config_type": "string",
      "config_group": "basic",
      "is_public": 1,
      "is_sensitive": 0,
      "display_order": 0,
      "validation_rules": null,
      "created_at": 1704067200000,
      "updated_at": 1704067200000
    }
  ]
}
```

---

### 获取配置分组

### `GET /api/config/groups`

获取配置分组及各组配置。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 分组信息及配置

**响应示例**:
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "name": "basic",
        "display_name": "基础设置",
        "display_order": 1
      }
    ],
    "groupedConfigs": {
      "basic": {
        "info": {
          "name": "basic",
          "display_name": "基础设置"
        },
        "configs": []
      }
    }
  }
}
```

---

### 获取单个配置

### `GET /api/config/:key`

获取指定配置项的详细信息。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| key | string | 配置键名 |

**返回**: 配置详情

**响应示例**:
```json
{
  "success": true,
  "data": {
    "key": "site_name",
    "value": "磁力快搜",
    "description": "网站名称",
    "config_type": "string",
    "config_group": "basic",
    "is_public": 1,
    "is_sensitive": 0,
    "validation_rules": null,
    "created_at": 1704067200000,
    "updated_at": 1704067200000
  }
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 配置项不存在 |

---

### 更新配置

### `PUT /api/config/:key`

更新指定配置项的值。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| key | string | 配置键名 |

**请求体**:
```json
{
  "value": "any",
  "description": "string?",
  "configType": "string?",
  "configGroup": "string?",
  "isPublic": "boolean?",
  "isSensitive": "boolean?",
  "changeReason": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| value | any | 是 | 配置值 |
| description | string | 否 | 配置描述 |
| configType | string | 否 | 配置类型（string/integer/float/boolean） |
| configGroup | string | 否 | 配置分组 |
| isPublic | boolean | 否 | 是否公开 |
| isSensitive | boolean | 否 | 是否敏感 |
| changeReason | string | 否 | 变更原因 |

**返回**: 更新后的配置

**响应示例**:
```json
{
  "success": true,
  "data": {
    "key": "site_name",
    "value": "CodeSeek v2"
  },
  "message": "配置已更新"
}
```

**验证规则**:
- 配置值会根据 `config_type` 和 `validation_rules` 进行验证
- 整数类型：支持 min/max 范围验证
- 字符串类型：支持 minLength/maxLength/pattern 验证
- 布尔类型：只接受 0/1/true/false

---

### 批量更新配置

### `PUT /api/config/batch`

批量更新多个配置项。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "configs": [
    {
      "key": "string",
      "value": "any"
    }
  ],
  "changeReason": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| configs | array | 是 | 配置数组 |
| configs[].key | string | 是 | 配置键名 |
| configs[].value | any | 是 | 配置值 |
| changeReason | string | 否 | 变更原因 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "results": [
      { "key": "site_name", "success": true },
      { "key": "max_login_attempts", "success": false, "error": "值不能小于 3" }
    ],
    "updated": 1
  },
  "message": "配置批量更新完成"
}
```

---

### 重置配置

### `POST /api/config/reset/:key`

重置指定配置项为默认值。

**认证**: 需要超级管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| key | string | 配置键名 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "key": "site_name",
    "value": "磁力快搜"
  },
  "message": "配置已重置为默认值"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 未找到该配置的默认值 |
| `FORBIDDEN` | 403 | 需要超级管理员权限 |

---

### 删除配置

### `DELETE /api/config/:key`

删除指定的配置项。

**认证**: 需要超级管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| key | string | 配置键名 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": null,
  "message": "配置已删除"
}
```

---

### 导出配置

### `GET /api/config/export`

导出所有配置为JSON格式。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 导出数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "version": "2.0.0",
    "exportedAt": "2024-01-01T00:00:00.000Z",
    "exportedBy": "admin",
    "configs": [
      {
        "key": "site_name",
        "value": "磁力快搜",
        "description": "网站名称",
        "configType": "string",
        "configGroup": "basic",
        "isPublic": true,
        "isSensitive": false
      }
    ]
  }
}
```

**说明**:
- 敏感配置的值会被替换为 `******`

---

### 导入配置

### `POST /api/config/import`

从JSON数据导入配置。

**认证**: 需要超级管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "configs": [
    {
      "key": "string",
      "value": "any",
      "description": "string?",
      "configType": "string?",
      "configGroup": "string?",
      "isPublic": "boolean?",
      "isSensitive": "boolean?"
    }
  ],
  "overwrite": "boolean?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| configs | array | 是 | 配置数组 |
| overwrite | boolean | 否 | 是否覆盖已存在的配置（默认false） |

**返回**: 导入结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "results": [
      { "key": "site_name", "success": true, "action": "updated" },
      { "key": "new_config", "success": true, "action": "created" },
      { "key": "existing", "success": false, "action": "skipped", "error": "配置已存在" }
    ],
    "created": 1,
    "updated": 1,
    "skipped": 1
  },
  "message": "配置导入完成"
}
```

**说明**:
- 值为 `******` 的配置会被跳过（敏感配置需手动设置）

---

### 获取配置变更日志

### `GET /api/config/logs`

获取配置变更历史记录。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认50，最大200） |
| key | string | 否 | 配置键筛选 |
| type | string | 否 | 变更类型筛选（create/update/delete/reset） |

**返回**: 变更日志列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_abc123",
        "config_key": "site_name",
        "old_value": "旧值",
        "new_value": "新值",
        "change_type": "update",
        "changed_by": "user_123",
        "changed_by_username": "admin",
        "change_reason": "更新网站名称",
        "ip_address": "192.168.1.1",
        "user_agent": "Mozilla/5.0...",
        "created_at": 1704067200000
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 50
  }
}
```

---

## 分析事件

### 记录分析事件

### `POST /api/config/analytics/events`

记录一个分析事件。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "eventType": "string",
  "eventData": {}?,
  "sessionId": "string?",
  "referer": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| eventType | string | 是 | 事件类型 |
| eventData | object | 否 | 事件数据 |
| sessionId | string | 否 | 会话ID |
| referer | string | 否 | 来源页面 |

**返回**: 操作结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "evt_abc123"
  },
  "message": "事件已记录"
}
```

---

### 获取分析统计

### `GET /api/config/analytics/stats`

获取分析统计数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 统计天数（默认7） |

**返回**: 统计数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalEvents": 5000,
    "uniqueUsers": 200,
    "uniqueSessions": 300,
    "eventsByType": [
      {
        "event_type": "page_view",
        "count": 3000
      }
    ],
    "dailyEvents": [
      {
        "date": "2024-01-01",
        "count": 500
      }
    ],
    "period": {
      "days": 7,
      "since": 1703548800000
    }
  }
}
```

---

## 邮件日志

### 获取邮件日志列表

### `GET /api/config/email/logs`

获取邮件发送日志列表。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认50，最大200） |
| type | string | 否 | 邮件类型筛选 |
| status | string | 否 | 发送状态筛选 |

**返回**: 邮件日志列表

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "mail_abc123",
        "email_type": "verification",
        "recipient_email": "test@example.com",
        "subject": "验证您的邮箱",
        "send_status": "sent",
        "user_id": "user_123",
        "username": "testuser",
        "error_message": null,
        "created_at": 1704067200000
      }
    ],
    "total": 500,
    "page": 1,
    "pageSize": 50
  }
}
```

---

## 默认配置值

系统预设的默认配置值：

| 配置键 | 默认值 | 类型 | 分组 | 说明 |
|--------|--------|------|------|------|
| site_name | 磁力快搜 | string | basic | 网站名称 |
| site_description | 搜索全网资源，一步直达 | string | basic | 网站描述 |
| enable_registration | 1 | boolean | basic | 是否开放注册 |
| community_enabled | 1 | boolean | features | 启用社区功能 |
| max_login_attempts | 5 | integer | security | 最大登录尝试次数（3-10） |
| lockout_duration_ms | 900000 | integer | security | 账户锁定时长（毫秒，默认15分钟） |
| max_verification_attempts | 5 | integer | security | 最大验证尝试次数 |
| password_reset_max_attempts | 5 | integer | security | 密码重置最大尝试次数 |
| password_reset_lockout_duration | 3600000 | integer | security | 密码重置锁定时长（毫秒） |
| email_rate_limit_per_hour | 5 | integer | email | 每小时最大发送邮件数 |
| email_rate_limit_per_day | 20 | integer | email | 每天最大发送邮件数 |
| verification_code_expiry | 900000 | integer | email | 验证码过期时间（毫秒） |
| reset_password_code_expiry | 1800000 | integer | email | 重置密码验证码过期时间 |
| password_reset_log_retention_days | 30 | integer | cleanup | 密码重置日志保留天数 |
| user_actions_retention_days | 90 | integer | cleanup | 用户行为日志保留天数 |
| security_event_retention_days | 90 | integer | cleanup | 安全事件保留天数 |
