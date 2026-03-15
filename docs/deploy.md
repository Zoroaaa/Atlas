# CodeSeek 部署指南 (v2.0.0)

> 📖 [返回项目主页](../readme.md) | [API接口文档](api/index.md) | [架构设计文档](backend-frontend-tree.md) | [配置说明文档](config.md) | [更新日志](changelogv.2.0.md)

本文档详细说明如何将CodeSeek项目部署到Cloudflare平台。

---

## 目录

- [环境要求](#环境要求)
- [本地开发](#本地开发)
- [后端部署](#后端部署)
- [前端部署](#前端部署)
- [数据库配置](#数据库配置)
- [环境变量配置](#环境变量配置)
- [常见问题](#常见问题)

---

## 环境要求

### 必需软件

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 20.0.0 | JavaScript运行时 |
| npm | >= 10.0.0 | 包管理器 |
| Git | >= 2.0.0 | 版本控制 |
| Wrangler | >= 3.78.0 | Cloudflare CLI工具 |

### 账户要求

- Cloudflare账户（免费计划即可）
- GitHub账户（可选，用于CI/CD）
- Resend账户（可选，用于邮件服务）

### 安装Wrangler

```bash
# 全局安装Wrangler
npm install -g wrangler

# 验证安装
wrangler --version

# 登录Cloudflare
wrangler login
```

---

## 本地开发

### 克隆项目

```bash
# 克隆仓库
git clone https://github.com/Zoroaaa/codeseek.git
cd codeseek
```

### 后端本地开发

```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 登录Cloudflare（首次运行）
wrangler login

# 创建本地数据库
wrangler d1 create codeseek-db --local

# 初始化本地数据库（按顺序执行）
wrangler d1 execute codeseek-db --local --file="../database/01_schema_core.sql"
wrangler d1 execute codeseek-db --local --file="../database/02_schema_search.sql"
wrangler d1 execute codeseek-db --local --file="../database/03_schema_community.sql"
wrangler d1 execute codeseek-db --local --file="../database/04_schema_security.sql"
wrangler d1 execute codeseek-db --local --file="../database/05_data_system.sql"
wrangler d1 execute codeseek-db --local --file="../database/06_data_search_sources.sql"
wrangler d1 execute codeseek-db --local --file="../database/07_data_tags.sql"
wrangler d1 execute codeseek-db --local --file="../database/09_schema_feedback.sql"

# 启动开发服务器
npm run dev
```

后端服务将在 `http://localhost:8787` 运行。

### 前端本地开发

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 创建环境变量文件
cp .env.example .env

# 启动开发服务器
npm run dev
```

前端服务将在 `http://localhost:3000` 运行。

---

## 后端部署

### 1. 创建D1数据库

```bash
# 登录Cloudflare
wrangler login

# 创建生产数据库
wrangler d1 create codeseek-db

# 记录返回的database_id，更新到wrangler.toml中
```

### 2. 配置wrangler.toml

```toml
name = "codeseek-backend"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]
preview_urls = false  

[vars]
# 应用版本信息
APP_VERSION = "2.0.0"

# 用户注册相关配置
ALLOW_REGISTRATION = "true"
MAX_FAVORITES_PER_USER = "1000"
MAX_HISTORY_PER_USER = "1000"
MAX_TAGS_PER_USER = "50"

# 系统行为日志配置
ENABLE_ACTION_LOGGING = "true"

# 邮箱验证功能配置
EMAIL_VERIFICATION_ENABLED = "true"
EMAIL_VERIFICATION_REQUIRED = "false"
VERIFICATION_CODE_LENGTH = "6"
VERIFICATION_CODE_EXPIRY = "900000"
MAX_VERIFICATION_ATTEMPTS = "3"
EMAIL_RATE_LIMIT_PER_HOUR = "5"
EMAIL_RATE_LIMIT_PER_DAY = "20"
DEFAULT_FROM_EMAIL = "noreply@yourdomain.com"
DEFAULT_FROM_NAME = "磁力快搜"
SITE_URL = "https://yourdomain.com"

# JWT令牌配置
JWT_EXPIRY_DAYS = "30"

# 搜索源状态检查配置
ENABLE_SOURCE_STATUS_CHECK = "true"
SOURCE_STATUS_CHECK_TIMEOUT = "10000"
SOURCE_STATUS_CACHE_DURATION = "300000"

# 数据库配置
[[d1_databases]]
binding = "DB"
database_name = "codeseek"
database_id = "your-database-id-here"  # 替换为实际ID

# 监控和可观测性配置
[observability]
enabled = true
```

### 3. 初始化生产数据库

```bash
# 按顺序执行SQL文件
wrangler d1 execute codeseek-db --remote --file="../database/01_schema_core.sql"
wrangler d1 execute codeseek-db --remote --file="../database/02_schema_search.sql"
wrangler d1 execute codeseek-db --remote --file="../database/03_schema_community.sql"
wrangler d1 execute codeseek-db --remote --file="../database/04_schema_security.sql"
wrangler d1 execute codeseek-db --remote --file="../database/05_data_system.sql"
wrangler d1 execute codeseek-db --remote --file="../database/06_data_search_sources.sql"
wrangler d1 execute codeseek-db --remote --file="../database/07_data_tags.sql"
wrangler d1 execute codeseek-db --remote --file="../database/09_schema_feedback.sql"
```

### 4. 设置环境变量

```bash
# 设置JWT密钥
wrangler secret put JWT_SECRET

# 设置邮件服务API密钥（可选）
wrangler secret put RESEND_API_KEY

# 设置GitHub OAuth（可选）
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# 设置其他配置
wrangler secret put DEFAULT_FROM_EMAIL
wrangler secret put DEFAULT_FROM_NAME
wrangler secret put SITE_URL
```

### 5. 部署Worker

```bash
# 构建并部署
npm run deploy

# 或使用wrangler命令
wrangler deploy
```

### 6. 验证部署

```bash
# 检查Worker状态
wrangler deployments list

# 测试API
curl https://codeseek-backend.your-subdomain.workers.dev/api/health
```

---

## 前端部署

### 方式一：Cloudflare Pages Dashboard（推荐）

1. **连接GitHub仓库**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 进入 Workers & Pages > Create application > Pages > Connect to Git
   - 选择 `codeseek` 仓库

2. **配置构建设置**
   ```
   Framework preset: None
   Build command: npm run build
   Build output directory: dist
   Root directory: frontend
   ```

3. **设置环境变量**
   ```
   VITE_API_URL = https://codeseek-backend.your-subdomain.workers.dev/api
   ```

4. **部署**
   - 点击 "Save and Deploy"
   - 等待构建完成

### 方式二：Wrangler CLI部署

```bash
# 进入前端目录
cd frontend

# 构建项目
npm run build

# 部署到Cloudflare Pages
wrangler pages deploy dist --project-name=codeseek
```

### 方式三：GitHub Actions自动部署

项目已配置GitHub Actions，推送到main分支会自动部署。

查看配置文件：`.github/workflows/backend-deploy.yml`

---

## 数据库配置

### 数据库结构

```
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare D1 (SQLite)                 │
├─────────────────────────────────────────────────────────┤
│  01_schema_core.sql                                     │
│  ├── roles                    # 角色定义                │
│  ├── users                    # 用户信息                │
│  ├── user_sessions            # 会话管理                │
│  ├── user_favorites           # 收藏记录                │
│  ├── user_search_history      # 搜索历史                │
│  ├── user_actions             # 行为日志                │
│  ├── system_config            # 系统配置                │
│  └── analytics_events         # 分析事件                │
├─────────────────────────────────────────────────────────┤
│  02_schema_search.sql                                   │
│  ├── search_major_categories  # 主分类                  │
│  ├── search_source_categories # 子分类                  │
│  ├── search_sources           # 搜索源配置              │
│  ├── user_search_source_configs # 用户搜索源配置        │
│  └── source_status_cache      # 状态缓存                │
├─────────────────────────────────────────────────────────┤
│  03_schema_community.sql                                │
│  ├── community_source_tags    # 社区标签                │
│  ├── community_shared_sources # 社区分享                │
│  ├── community_source_reviews # 评论记录                │
│  ├── community_source_likes   # 点赞记录                │
│  ├── community_source_downloads # 下载记录              │
│  ├── community_source_reports # 举报记录                │
│  └── community_user_stats     # 用户统计                │
├─────────────────────────────────────────────────────────┤
│  04_schema_security.sql                                 │
│  ├── email_verifications      # 验证码记录              │
│  ├── email_change_requests    # 邮箱更改请求            │
│  ├── password_reset_logs      # 密码重置日志            │
│  ├── security_lockouts        # 安全锁定                │
│  ├── user_security_events     # 安全事件                │
│  ├── email_send_logs          # 邮件发送日志            │
│  └── email_templates          # 邮件模板                │
├─────────────────────────────────────────────────────────┤
│  05_data_system.sql          # 系统初始化数据           │
├─────────────────────────────────────────────────────────┤
│  06_data_search_sources.sql  # 搜索源预置数据（50+）    │
├─────────────────────────────────────────────────────────┤
│  07_data_tags.sql            # 官方标签数据             │
├─────────────────────────────────────────────────────────┤
│  09_schema_feedback.sql      # 用户反馈表               │
└─────────────────────────────────────────────────────────┘
```

### 数据库操作命令

```bash
# 查看数据库列表
wrangler d1 list

# 查看数据库信息
wrangler d1 info codeseek-db

# 执行SQL查询
wrangler d1 execute codeseek-db --command "SELECT * FROM users LIMIT 10"

# 导出数据
wrangler d1 export codeseek-db --output backup.sql

# 导入数据
wrangler d1 execute codeseek-db --file backup.sql
```

---

## 环境变量配置

### 后端环境变量

| 变量名 | 必需 | 说明 | 示例值 |
|--------|------|------|--------|
| `JWT_SECRET` | ✅ | JWT签名密钥（至少32字符） | `your-32-char-secret-key-here` |
| `RESEND_API_KEY` | ❌ | Resend邮件服务密钥 | `re_xxxxxxxxxxxx` |
| `GITHUB_CLIENT_ID` | ❌ | GitHub OAuth App Client ID | `Iv1.xxxxxxxx` |
| `GITHUB_CLIENT_SECRET` | ❌ | GitHub OAuth App Client Secret | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

### 后端配置变量 (wrangler.toml)

以下变量在 `wrangler.toml` 的 `[vars]` 部分配置：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `APP_VERSION` | `2.0.0` | 应用版本号 |
| `ALLOW_REGISTRATION` | `true` | 是否允许新用户注册 |
| `MAX_FAVORITES_PER_USER` | `1000` | 每用户最大收藏数 |
| `MAX_HISTORY_PER_USER` | `1000` | 每用户最大历史记录数 |
| `MAX_TAGS_PER_USER` | `50` | 每用户最大标签数 |
| `ENABLE_ACTION_LOGGING` | `true` | 是否启用行为日志 |
| `EMAIL_VERIFICATION_ENABLED` | `true` | 是否启用邮箱验证 |
| `EMAIL_VERIFICATION_REQUIRED` | `false` | 注册是否需要邮箱验证 |
| `VERIFICATION_CODE_LENGTH` | `6` | 验证码长度 |
| `VERIFICATION_CODE_EXPIRY` | `900000` | 验证码过期时间(毫秒) |
| `MAX_VERIFICATION_ATTEMPTS` | `3` | 验证码最大尝试次数 |
| `EMAIL_RATE_LIMIT_PER_HOUR` | `5` | 每小时邮件发送限制 |
| `EMAIL_RATE_LIMIT_PER_DAY` | `20` | 每天邮件发送限制 |
| `DEFAULT_FROM_EMAIL` | `noreply@yourdomain.com` | 默认发件邮箱 |
| `DEFAULT_FROM_NAME` | `磁力快搜` | 默认发件人名称 |
| `SITE_URL` | `https://yourdomain.com` | 网站URL |
| `JWT_EXPIRY_DAYS` | `30` | JWT有效期(天) |
| `ENABLE_SOURCE_STATUS_CHECK` | `true` | 是否启用搜索源状态检查 |
| `SOURCE_STATUS_CHECK_TIMEOUT` | `10000` | 状态检查超时(毫秒) |
| `SOURCE_STATUS_CACHE_DURATION` | `300000` | 状态缓存时间(毫秒) |

### 前端环境变量

| 变量名 | 必需 | 说明 | 示例值 |
|--------|------|------|--------|
| `VITE_API_URL` | ✅ | 后端API地址 | `/api` 或完整URL |
| `VITE_APP_NAME` | ❌ | 应用名称 | `CodeSeek` |
| `VITE_APP_VERSION` | ❌ | 应用版本 | `2.0.0` |

### 设置方式

**后端（Cloudflare Workers）：**
```bash
# 命令行设置
wrangler secret put JWT_SECRET

# 或在Dashboard设置
# Workers & Pages > codeseek-backend > Settings > Variables
```

**前端（Cloudflare Pages）：**
```bash
# 在Dashboard设置
# Workers & Pages > codeseek > Settings > Environment variables
```

---

## 常见问题

### 1. 部署失败：数据库连接错误

**问题**: Worker无法连接到D1数据库

**解决方案**:
```bash
# 检查wrangler.toml中的database_id是否正确
cat wrangler.toml

# 确认数据库已创建
wrangler d1 list

# 重新绑定数据库
# 在Cloudflare Dashboard中检查D1绑定
```

### 2. CORS错误

**问题**: 前端请求后端API时出现CORS错误

**解决方案**:
确保后端CORS配置正确：
```typescript
app.use('*', cors({
  origin: ['https://your-frontend-domain.pages.dev'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
```

### 3. JWT验证失败

**问题**: Token验证失败，返回401错误

**解决方案**:
```bash
# 检查JWT_SECRET是否设置
wrangler secret list

# 重新设置JWT_SECRET
wrangler secret put JWT_SECRET

# 确保前端正确发送Token
# Authorization: Bearer <token>
```

### 4. 构建失败

**问题**: 前端构建失败

**解决方案**:
```bash
# 清理依赖重新安装
rm -rf node_modules package-lock.json
npm install

# 检查TypeScript错误
npm run typecheck

# 检查ESLint错误
npm run lint
```

### 5. 数据库迁移问题

**问题**: SQL执行失败

**解决方案**:
```bash
# 检查SQL语法
cat "../database/01_schema_core.sql"

# 分步执行，定位问题
wrangler d1 execute codeseek-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# 查看执行日志
wrangler d1 execute codeseek-db --remote --file="../database/01_schema_core.sql" --verbose
```

---

## 部署检查清单

- [ ] Node.js >= 20.0.0 已安装
- [ ] Wrangler CLI 已安装并登录
- [ ] D1数据库已创建
- [ ] 数据库表已初始化（8个SQL文件按顺序执行）
- [ ] JWT_SECRET 已设置
- [ ] 后端Worker已部署
- [ ] 后端API健康检查通过
- [ ] 前端环境变量已配置
- [ ] 前端已部署到Pages
- [ ] CORS配置正确
- [ ] 自定义域名已配置（可选）
- [ ] GitHub OAuth 已配置（可选）
- [ ] 邮件服务已配置（可选）

---

## 相关链接

- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)
- [Cloudflare D1文档](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages文档](https://developers.cloudflare.com/pages/)
- [Hono框架文档](https://hono.dev/)
- [React文档](https://react.dev/)
