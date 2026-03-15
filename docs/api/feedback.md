# 用户反馈接口 `/api/feedback`

> [返回API目录](./index.md)

**认证方式**: 用户接口可选认证，管理员接口需要管理员权限

---

## 目录

- [提交反馈](#提交反馈)
- [查看我的反馈](#查看我的反馈)
- [管理员接口](#管理员接口)
  - [获取反馈列表](#获取反馈列表)
  - [获取反馈统计](#获取反馈统计)
  - [获取反馈详情](#获取反馈详情)
  - [处理反馈](#处理反馈)

---

## 提交反馈

### `POST /api/feedback`

提交用户反馈，支持登录用户和未登录用户。

**认证**: 可选（未登录用户需填写联系邮箱）

**请求体**:
```json
{
  "type": "bug",
  "title": "string",
  "content": "string",
  "contactEmail": "string?",
  "pageUrl": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 反馈类型：`bug`(问题反馈)、`suggestion`(优化建议)、`other`(其他) |
| title | string | 是 | 反馈标题（5-100字符） |
| content | string | 是 | 反馈内容（10-2000字符） |
| contactEmail | string | 条件必填 | 联系邮箱（未登录用户必填，登录用户可选） |
| pageUrl | string | 否 | 发生问题的页面URL |

**返回**: 反馈ID和提交时间

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "fb_abc123",
    "createdAt": 1704067200000
  },
  "message": "反馈提交成功，感谢您的宝贵意见！"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 参数验证失败 |
| `VALIDATION_ERROR` | 400 | 未登录用户必须填写联系邮箱 |

---

## 查看我的反馈

### `GET /api/feedback/my`

获取当前登录用户提交的反馈列表。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认1 |
| limit | number | 否 | 每页数量，默认20，最大100 |
| status | string | 否 | 状态筛选：`pending`、`processing`、`resolved`、`closed` |

**返回**: 反馈列表和分页信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "fb_abc123",
        "type": "bug",
        "title": "搜索功能异常",
        "content": "在使用搜索功能时发现...",
        "status": "resolved",
        "priority": "high",
        "admin_reply": "问题已修复，感谢反馈！",
        "created_at": 1704067200000,
        "updated_at": 1704153600000,
        "resolved_at": 1704153600000
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    }
  }
}
```

---

## 管理员接口

以下接口需要管理员权限。

### 获取反馈列表

### `GET /api/feedback/admin/list`

获取所有用户反馈列表，支持多条件筛选。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认1 |
| limit | number | 否 | 每页数量，默认20，最大100 |
| status | string | 否 | 状态筛选：`pending`、`processing`、`resolved`、`closed` |
| type | string | 否 | 类型筛选：`bug`、`suggestion`、`other` |
| priority | string | 否 | 优先级筛选：`low`、`normal`、`high`、`urgent` |
| search | string | 否 | 搜索关键词（标题/内容） |
| userId | string | 否 | 用户ID筛选 |
| sortBy | string | 否 | 排序字段：`created_at`、`updated_at`、`priority`，默认`created_at` |
| sortOrder | string | 否 | 排序方向：`asc`、`desc`，默认`desc` |

**返回**: 反馈列表和分页信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "fb_abc123",
        "user_id": "user_123",
        "contact_email": "user@example.com",
        "type": "bug",
        "title": "搜索功能异常",
        "content": "在使用搜索功能时发现...",
        "page_url": "https://example.com/search",
        "user_agent": "Mozilla/5.0...",
        "ip_address": "192.168.1.1",
        "status": "pending",
        "priority": "normal",
        "admin_user_id": null,
        "admin_reply": null,
        "admin_notes": null,
        "resolved_at": null,
        "email_sent": 0,
        "created_at": 1704067200000,
        "updated_at": 1704067200000,
        "user": {
          "id": "user_123",
          "username": "testuser",
          "email": "user@example.com"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

### 获取反馈统计

### `GET /api/feedback/admin/stats`

获取反馈统计数据。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 各状态和类型的统计

**响应示例**:
```json
{
  "success": true,
  "data": {
    "total": 100,
    "pending": 25,
    "processing": 15,
    "resolved": 50,
    "closed": 10,
    "bugs": 40,
    "suggestions": 45,
    "other": 15,
    "urgent": 5,
    "high_priority": 20
  }
}
```

---

### 获取反馈详情

### `GET /api/feedback/admin/:id`

获取单条反馈的详细信息。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**路径参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 反馈ID |

**返回**: 反馈详细信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "fb_abc123",
    "user_id": "user_123",
    "contact_email": "user@example.com",
    "type": "bug",
    "title": "搜索功能异常",
    "content": "在使用搜索功能时发现页面加载缓慢，具体表现为...",
    "page_url": "https://example.com/search",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    "ip_address": "192.168.1.1",
    "status": "processing",
    "priority": "high",
    "admin_user_id": "admin_001",
    "admin_reply": "我们正在排查问题...",
    "admin_notes": "可能是数据库查询优化问题",
    "resolved_at": null,
    "email_sent": 0,
    "created_at": 1704067200000,
    "updated_at": 1704153600000,
    "user": {
      "id": "user_123",
      "username": "testuser",
      "email": "user@example.com"
    },
    "admin_user": {
      "id": "admin_001",
      "username": "admin"
    }
  }
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 反馈不存在 |

---

### 处理反馈

### `PUT /api/feedback/admin/:id`

管理员处理反馈，支持修改状态、优先级、添加回复等。

**认证**: 需要管理员权限

**请求头**:
```
Authorization: Bearer <token>
```

**路径参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 反馈ID |

**请求体**:
```json
{
  "status": "resolved",
  "priority": "high",
  "adminReply": "string?",
  "adminNotes": "string?",
  "sendEmail": true
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 新状态：`pending`、`processing`、`resolved`、`closed` |
| priority | string | 否 | 优先级：`low`、`normal`、`high`、`urgent` |
| adminReply | string | 否 | 管理员回复（将发送给用户） |
| adminNotes | string | 否 | 内部备注（用户不可见） |
| sendEmail | boolean | 否 | 是否发送邮件通知用户，默认false |

**返回**: 更新后的反馈信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "fb_abc123",
    "status": "resolved",
    "priority": "high",
    "admin_reply": "问题已修复，感谢您的反馈！",
    "resolved_at": 1704153600000,
    "email_sent": 1
  },
  "message": "反馈处理成功"
}
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 反馈不存在 |
| `VALIDATION_ERROR` | 400 | 参数验证失败 |

---

## 反馈状态流转

```
pending (待处理)
    ↓
processing (处理中)
    ↓
resolved (已解决) / closed (已关闭)
```

## 反馈类型说明

| 类型 | 说明 |
|------|------|
| `bug` | 问题反馈 - 报告系统缺陷或错误 |
| `suggestion` | 优化建议 - 提出功能改进建议 |
| `other` | 其他 - 其他类型的反馈 |

## 优先级说明

| 优先级 | 说明 |
|--------|------|
| `low` | 低优先级 - 不影响使用的小问题 |
| `normal` | 普通优先级 - 一般问题 |
| `high` | 高优先级 - 影响用户体验的问题 |
| `urgent` | 紧急 - 严重影响系统运行的问题 |

## 邮件通知

当管理员处理反馈并设置 `sendEmail: true` 时，系统会通过 Resend 邮件服务向用户发送处理结果通知邮件。邮件内容包括：
- 反馈类型和标题
- 处理状态
- 管理员回复内容
- 网站链接
