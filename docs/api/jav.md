# JAV榜单接口 `/api/jav`

> [返回API目录](./index.md)

**认证方式**: 全局 authMiddleware，所有接口需要认证

---

## 目录

- [获取JAV榜单](#获取jav榜单)
- [获取番号建议](#获取番号建议)
- [获取JAV详情](#获取jav详情)
- [获取种子文件](#获取种子文件)

---

## 获取JAV榜单

### `GET /api/jav/rankings`

获取JAV榜单数据，包含有码精选、无码精选、高清、字幕、随机类别和随机女优榜单。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**返回**: 多维度榜单数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "censored": [
      {
        "code": "ABC-123",
        "title": "作品标题",
        "cover": "https://example.com/cover.jpg",
        "date": "2024-01-01",
        "actress": "演员名",
        "source": "javbus-p1"
      }
    ],
    "uncensored": [],
    "hd": [],
    "subtitle": [],
    "genres": [
      {
        "name": "巨乳",
        "key": "rq",
        "items": []
      }
    ],
    "actresses": [
      {
        "name": "三上悠亜",
        "key": "2xi",
        "items": []
      }
    ],
    "suggestions": ["ABC-123", "DEF-456"],
    "fetchedAt": 1704067200000,
    "sources": ["JavBus"]
  }
}
```

**返回字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| censored | array | 有码精选（前3页随机20条） |
| uncensored | array | 无码精选（前3页随机20条） |
| hd | array | 高清作品（前3页随机20条） |
| subtitle | array | 字幕作品（前3页随机20条） |
| genres | array | 随机10个类别榜单 |
| actresses | array | 随机10个女优榜单 |
| suggestions | array | 推荐番号列表（最多30个） |
| fetchedAt | number | 获取时间戳 |
| sources | array | 数据来源列表 |

**作品项字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| code | string | 番号（已标准化为 XXX-123 格式） |
| title | string | 作品标题 |
| cover | string | 封面图片URL |
| date | string | 发布日期（YYYY-MM-DD） |
| actress | string | 演员名 |
| source | string | 数据来源标识 |

**类别/女优榜单项**:
| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 类别名或女优名 |
| key | string | 标识符（用于URL路径） |
| items | array | 该类别/女优的作品列表（最多12条） |

**数据来源**:
- 所有数据来自 JavBus
- 有码精选：首页前3页合并去重随机
- 无码精选：/uncensored 前3页合并去重随机
- 高清：/genre/hd 前3页合并去重随机
- 字幕：/genre/sub 前3页合并去重随机
- 类别：从 /genre 页随机选取10个类别
- 女优：从 /actresses 页随机选取10个女优

---

## 获取番号建议

### `GET /api/jav/suggestions`

根据关键词获取番号建议。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 否 | 搜索关键词 |

**返回**: 匹配的番号列表

**响应示例**:
```json
{
  "success": true,
  "data": ["ABC-123", "ABC-456", "ABC-789"]
}
```

**说明**:
- 从首页抓取当前作品列表
- 筛选以关键词开头或包含关键词的番号
- 最多返回10条
- 关键词为空时返回空数组

---

## 获取JAV详情

### `GET /api/jav/detail`

获取指定番号的详细信息，包含磁力链接。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 番号（如 ABC-123） |

**返回**: 作品详情及磁力链接

**响应示例**:
```json
{
  "success": true,
  "data": {
    "code": "ABC-123",
    "title": "作品标题",
    "cover": "https://example.com/cover.jpg",
    "releaseDate": "2024-01-01",
    "duration": "120分钟",
    "director": "导演名",
    "maker": "制作商",
    "publisher": "发行商",
    "series": "系列名",
    "tags": ["巨乳", "美少女"],
    "actresses": ["演员A", "演员B"],
    "magnets": [
      {
        "name": "ABC-123 HD",
        "size": "5.2GB",
        "date": "2024-01-02",
        "magnet": "magnet:?xt=urn:btih:...",
        "isHD": true
      }
    ],
    "detailUrl": "https://www.javbus.com/ABC-123"
  }
}
```

**返回字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| code | string | 番号 |
| title | string | 作品标题 |
| cover | string | 封面图片URL |
| releaseDate | string | 发布日期 |
| duration | string | 时长 |
| director | string | 导演 |
| maker | string | 制作商 |
| publisher | string | 发行商 |
| series | string | 系列 |
| tags | array | 类别标签列表 |
| actresses | array | 演员列表 |
| magnets | array | 磁力链接列表 |
| detailUrl | string | 详情页URL |

**磁力链接项字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 种子名称 |
| size | string | 文件大小 |
| date | string | 发布日期 |
| magnet | string | 磁力链接（magnet协议） |
| isHD | boolean | 是否高清 |

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `INVALID_CODE` | 400 | 无效的番号格式 |
| `NOT_FOUND` | 404 | 未找到该番号 |
| `FETCH_ERROR` | 500 | 获取详情失败 |

**番号格式要求**:
- 标准格式：`XXX-123`（字母-数字）
- 也支持 `XXX123` 格式（会自动标准化）

---

## 获取种子文件

### `GET /api/jav/torrent/:hash`

通过info hash代理下载种子文件。

**认证**: 需要

**请求头**:
```
Authorization: Bearer <token>
```

**URL参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| hash | string | info hash（40位hex或32位base32） |

**返回**: 种子文件（二进制流）

**响应头**:
```
Content-Type: application/x-bittorrent
Content-Disposition: attachment; filename="<HASH>.torrent"
Cache-Control: public, max-age=86400
```

**错误码**:
| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `INVALID_HASH` | 400 | 无效的info hash |
| `NOT_FOUND` | 404 | 未找到该种子文件 |

**说明**:
- 支持40位十六进制hash
- 支持32位base32编码hash
- 从 itorrents.org 或 torrage.info 获取
- 如果种子文件不存在，建议使用磁力链接

**使用示例**:
```
GET /api/jav/torrent/ABCDEF1234567890ABCDEF1234567890ABCDEF12
```
