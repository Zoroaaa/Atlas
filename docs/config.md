# 配置说明

> **适用版本**: v4.0.0+
>
> CodeSeek 使用 Cloudflare Workers Secrets + 环境变量进行配置管理。

---

## 目录

- [环境变量总览](#环境变量总览)
- [认证配置](#认证配置)
- [搜索源配置](#搜索源配置)
- [存储配置](#存储配置)
- [安全配置](#安全配置)
- [功能开关](#功能开关)
- [新增搜索类别的配置流程](#新增搜索类别的配置流程)

---

## 环境变量总览

### 必填项

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | `Ov23li...` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | `abc123...` |
| `JWT_SECRET` | JWT 签名密钥（>=32字符随机字符串） | `rand0m-s3cr3t-k3y-32chars!!` |
| `D1_DATABASE_ID` | Cloudflare D1 数据库 ID | `xxxxxx...` |
| `R2_ACCESS_KEY_ID` | R2 存储访问密钥 ID | `abc...` |
| `R2_SECRET_ACCESS_KEY` | R2 存储密钥 | `xyz...` |
| `R2_BUCKET_NAME` | R2 存储桶名称 | `codeseek-assets` |
| `R2_PUBLIC_URL` | R2 公开访问 URL | `https://assets.codeseek.pp.ua` |

### 可选项（按搜索类别）

| 变量名 | 类别 | 说明 | 默认值 |
|--------|------|------|--------|
| `DMM_API_ID` | JAV | DMM Affiliate ID | - |
| `DMM_API_KEY` | JAV | DMM Affiliate Key | - |
| `TMDB_API_KEY` | 影视 | TMDB API Key | - |
| `BANGUMI_API_KEY` | 动漫 | Bangumi API Key（可选） | - |

### 系统配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `APP_VERSION` | 应用版本号 | `2.0.0` |
| `NODE_ENV` | 运行环境 | `production` |
| `CORS_ORIGIN` | CORS 允许的源 | `https://codeseek.pp.ua` |
| `ADMIN_GITHUB_IDS` | 管理员 GitHub ID 列表（逗号分隔） | `` |

---

## 认证配置

### GitHub OAuth

1. 访问 https://github.com/settings/developers 创建 OAuth App
2. 设置回调地址：`https://api.codeseek.pp.ua/api/auth/github/callback`
3. 将获得的 Client ID 和 Secret 填入环境变量

### JWT 配置

- **算法**: HS256
- **有效期**: Access Token 24h / Refresh Token 7d
- **JWT_SECRET**: 使用 `openssl rand -base64 32` 生成

### 管理员配置

在 `ADMIN_GITHUB_IDS` 中填写管理员数字 ID（逗号分隔），例如：

```
ADMIN_GITHUB_IDS=123456,789012
```

---

## 搜索源配置

### v4.0 三层架构下的配置方式

搜索源的配置分为两层：

#### Layer 1 & 2: Provider 内置（代码层面）

每个 Provider 在代码中声明自己支持的分类：

```typescript
// backend/src/providers/anime-provider.ts
export const animeProvider: SearchProvider = {
  category: 'anime',
  name: '动漫搜索',
  classifications: ['bangumi', 'mikan', 'nyaa', 'showrss'],
  // ...
};
```

**无需额外配置**，注册 Provider 即生效。

#### Layer 3: 数据库驱动（运行层面）

具体搜索源实例通过 `search_sources` 表管理：

```sql
-- 通过后台管理界面或 SQL 插入
INSERT INTO search_sources (name, category, classification, base_url, type, priority, config)
VALUES ('Bangumi API', 'anime', 'bangumi', 'https://api.bgm.tv', 'api', 10,
        '{"apiKey": "your_bangumi_key"}');
```

或通过 API 创建：

```bash
curl -X POST https://api.codeseek.pp.ua/api/search-sources \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bangumi API",
    "category": "anime",
    "classification": "bangumi",
    "baseUrl": "https://api.bgm.tv",
    "type": "api",
    "priority": 10,
    "config": { "apiKey": "your_key" }
  }'
```

### 各类别所需的外部 API Key

| 类别 | API | 获取地址 | 是否必须 |
|------|-----|---------|---------|
| 动漫 | Bangumi | https://bgm.tv/dev/app | 推荐（无 Key 限流更严） |
| 影视 | TMDB | https://www.themoviedb.org/settings/api | **必须** |
| JAV | DMM Affiliate | https://affiliate.dmm.com/ | **必须** |

---

## 存储配置

### Cloudflare R2

R2 用于存储用户上传内容和代理缓存图片。

```bash
# 创建 R2 存储桶
wrangler r2 bucket create codeseek-assets

# 设置公开访问（可选，通过自定义域名）
wrangler r2 bucket public codeseek-assets
```

**用途（v4.0 扩展）：**
- JAV 封面图代理缓存
- 动漫 Bangumi 封面缓存
- 影视 TMDB 海报缓存
- 用户头像

---

## 安全配置

### CORS

```bash
CORS_ORIGIN=https://codeseek.pp.ua,https://www.codeseek.pp.ua
```

支持逗号分隔的多域名，开发时可加入 `http://localhost:5173`。

### Rate Limiting（内置，无需配置）

| 接口类别 | 限制 |
|---------|------|
| 搜索 | 30 次/分钟/IP |
| 认证 | 10 次/分钟/IP |
| 写操作 | 20 次/分钟/IP |

### 安全头（自动添加）

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

---

## 功能开关

当前版本暂不支持通过环境变量控制功能开关。所有功能默认启用。

如需禁用某个搜索类别，可通过以下方式：

1. **禁用整个类别**：注释掉 `index.ts` 中的 `providerRegistry.register()` 行
2. **禁用特定分类**：从对应 Provider 的 `classifications` 数组中移除
3. **禁用单个源**：将 `search_sources.is_active` 设为 `false`

---

## 新增搜索类别的配置流程

以新增「音乐搜索」为例：

### Step 1: 创建 Provider

```typescript
// backend/src/providers/music-provider.ts
export const musicProvider: SearchProvider = {
  category: 'music',
  name: '音乐搜索',
  classifications: ['spotify', 'netease'],
  async search(classification, params) {
    // 实现搜索逻辑
  },
};
```

### Step 2: 注册 Provider

```typescript
// backend/src/index.ts
import { musicProvider } from '@/providers/music-provider';
providerRegistry.register(musicProvider);  // ← 一行搞定
```

### Step 3: 添加搜索源到数据库

```sql
INSERT INTO search_sources (name, category, classification, base_url, type, priority)
VALUES ('Spotify API', 'music', 'spotify', 'https://api.spotify.com', 'api', 10),
       ('网易云音乐', 'music', 'netease', 'https://music.163.com', 'scrape', 8);
```

### Step 4: 前端添加 Tab 和 Panel

- SearchPage 添加「音乐」Tab
- 创建 MusicSearchResultPanel 组件
- 添加对应的 TypeScript 类型

### Step 5: 配置 API Key（如需要）

```bash
# wrangler secret put SPOTIFY_CLIENT_ID
# wrangler secret put SPOTIFY_CLIENT_SECRET
```

---

## 配置验证

部署后访问以下端点验证配置：

```bash
# 健康检查（返回配置摘要）
curl https://api.codeseek.pp.ua/api/health

# 搜索源状态
curl -H "Authorization: Bearer <token>" \
  https://api.codeseek.pp.ua/api/search-sources?includeStats=true

# 分类列表验证
curl https://api.codeseek.pp.ua/api/search-sources/classifications/anime
curl https://api.codeseek.pp.ua/api/search-sources/classifications/movie
curl https://api.codeseek.pp.ua/api/search-sources/classifications/jav
```
