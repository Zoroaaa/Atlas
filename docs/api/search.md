# 搜索接口 `/api/search`

> [返回API目录](./index.md)

**认证方式**: 全局 authMiddleware，所有接口需要认证

---

## 目录

- [执行搜索](#执行搜索)
- [获取搜索建议](#获取搜索建议)
- [获取热门搜索](#获取热门搜索)

---

## 执行搜索

### `POST /api/search`

执行搜索并返回搜索源列表，自动记录搜索历史。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "keyword": "string",
  "page": "number?",
  "pageSize": "number?",
  "majorCategoryId": "string?",
  "categoryId": "string?"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词 |
| page | number | 否 | 页码（默认1） |
| pageSize | number | 否 | 每页数量（默认20，最大100） |
| majorCategoryId | string | 否 | 主分类ID |
| categoryId | string | 否 | 分类ID |

**返回**: 搜索结果

**响应示例**:
```json
{
  "success": true,
  "data": {
    "keyword": "test keyword",
    "results": [
      {
        "id": "src_abc123",
        "name": "Google",
        "subtitle": "全球最大搜索引擎",
        "icon": "🔍",
        "url": "https://www.google.com/search?q=test%20keyword",
        "siteType": "search",
        "category": "cat_456"
      },
      {
        "id": "src_def456",
        "name": "Bing",
        "subtitle": "微软搜索引擎",
        "icon": "🔍",
        "url": "https://www.bing.com/search?q=test%20keyword",
        "siteType": "search",
        "category": "cat_456"
      }
    ],
    "total": 15,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  },
  "message": "搜索完成"
}
```

**返回字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| keyword | string | 搜索关键词（已trim） |
| results | array | 搜索结果列表（包含搜索源信息和生成的URL） |
| total | number | 总数 |
| page | number | 页码 |
| pageSize | number | 每页数量 |
| hasMore | boolean | 是否有更多 |

**搜索结果项字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 搜索源ID |
| name | string | 搜索源名称 |
| subtitle | string | 副标题 |
| icon | string | 图标 |
| url | string | 生成的搜索URL（关键词已编码） |
| siteType | string | 站点类型（search/browse/reference） |
| category | string | 分类ID |

**搜索逻辑**:
1. 根据分类筛选搜索源
2. 只返回激活且可搜索的搜索源
3. 只返回需要关键词的搜索源（requires_keyword = 1）
4. 按分类优先级、搜索源优先级、显示顺序排序
5. 支持用户个性化配置（用户启用的搜索源）

**自动记录**:
- 自动记录搜索历史到 `user_search_history` 表

---

## 获取搜索建议

### `GET /api/search/suggestions`

根据关键词获取搜索建议。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词（至少2个字符） |
| limit | number | 否 | 返回数量（默认10，最大20） |

**返回**: 建议关键词列表及搜索次数

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "keyword": "test keyword",
      "count": 150
    },
    {
      "keyword": "test example",
      "count": 80
    }
  ]
}
```

**说明**:
- 基于全局搜索历史生成建议
- 按搜索次数降序排列
- 关键词长度不足2个字符时返回空数组

---

## 获取热门搜索

### `GET /api/search/trending`

获取热门搜索关键词。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量（默认20，最大50） |
| hours | number | 否 | 时间范围（默认24小时，最大168小时/7天） |

**返回**: 热门关键词列表及搜索次数

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "keyword": "热门关键词1",
      "count": 500
    },
    {
      "keyword": "热门关键词2",
      "count": 350
    },
    {
      "keyword": "热门关键词3",
      "count": 200
    }
  ]
}
```

**说明**:
- 基于指定时间范围内的搜索历史统计
- 按搜索次数降序排列
- 时间范围最大为7天（168小时）
