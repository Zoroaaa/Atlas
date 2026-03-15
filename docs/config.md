# CodeSeek 配置说明文档 (v2.0.0)

> 📖 [返回项目主页](../readme.md) | [API接口文档](api/index.md) | [架构设计文档](backend-frontend-tree.md) | [部署指南文档](deploy.md) | [更新日志](changelogv.2.0.md)

本文档详细说明CodeSeek项目的配置系统，包括前端配置、后端配置和环境变量设置。

---

## 目录

- [前端配置](#前端配置)
- [后端配置](#后端配置)
- [环境变量](#环境变量)
- [GitHub OAuth 配置](#github-oauth-配置)
- [反馈系统配置](#反馈系统配置)
- [代理服务配置](#代理服务配置)
- [数据库配置](#数据库配置)
- [角色权限配置](#角色权限配置)

---

## 前端配置

### Vite配置 (vite.config.ts)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react', 'clsx'],
          state: ['zustand'],
          utils: ['date-fns']
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
})
```

### Tailwind CSS配置 (tailwind.config.js)

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      }
    },
  },
  plugins: [],
}
```

### TypeScript配置 (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### API客户端配置 (services/api/client.ts)

```typescript
const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
}

const apiClient = {
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_CONFIG.baseURL}${endpoint}`
    const token = localStorage.getItem('authToken')
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    const response = await fetch(url, {
      ...options,
      headers,
    })
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }
    
    return response.json()
  }
}
```

---

## 后端配置

### Wrangler配置 (wrangler.toml)

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
ALLOW_REGISTRATION = "true"                    # 是否允许新用户注册
MAX_FAVORITES_PER_USER = "1000"                # 每个用户最大收藏数量限制
MAX_HISTORY_PER_USER = "1000"                  # 每个用户最大搜索历史记录数量限制
MAX_TAGS_PER_USER = "50"                       # 每个用户最大可创建标签数量限制
COMMUNITY_MAX_SHARES_PER_USER = "50"           # 社区中每个用户最大分享搜索源数量限制

# 系统行为日志配置
ENABLE_ACTION_LOGGING = "true"                 # 是否启用用户行为日志记录

# 邮箱验证功能配置
EMAIL_VERIFICATION_ENABLED = "true"            # 是否启用邮箱验证系统
EMAIL_VERIFICATION_REQUIRED = "false"          # 注册时是否强制要求邮箱验证
VERIFICATION_CODE_LENGTH = "6"                 # 验证码位数（6位数字）
VERIFICATION_CODE_EXPIRY = "900000"            # 验证码过期时间（毫秒，15分钟=900000）
MAX_VERIFICATION_ATTEMPTS = "3"                # 单个验证码最大尝试次数
EMAIL_RATE_LIMIT_PER_HOUR = "5"               # 同一邮箱/IP每小时最大发送次数
EMAIL_RATE_LIMIT_PER_DAY = "20"               # 同一邮箱/IP每天最大发送次数
DEFAULT_FROM_EMAIL = "noreply@yourdomain.com" # 系统发送邮件的发件人邮箱地址
DEFAULT_FROM_NAME = "磁力快搜"                  # 系统发送邮件的发件人显示名称
SITE_URL = "https://yourdomain.com"           # 网站域名（用于邮件中的链接和引用）

# JWT令牌配置
JWT_EXPIRY_DAYS = "30"                         # JWT令牌有效期（天）

# 社区功能配置
COMMUNITY_REQUIRE_APPROVAL = "false"           # 社区分享的搜索源是否需要管理员审核

# 搜索源状态检查配置
ENABLE_SOURCE_STATUS_CHECK = "true"            # 是否启用搜索源状态自动检查功能
SOURCE_STATUS_CHECK_TIMEOUT = "10000"          # 单个搜索源状态检查超时时间（毫秒，10秒）
SOURCE_STATUS_CACHE_DURATION = "300000"        # 状态检查结果缓存时间（毫秒，5分钟=300000）

# 数据库配置
[[d1_databases]]
binding = "DB"                                  # 在代码中使用的数据库实例名称
database_name = "codeseek"                     # Cloudflare D1 数据库名称
database_id = "your-database-id-here"          # 数据库唯一标识符（替换为实际ID）

# 监控和可观测性配置
[observability]
enabled = true                                 # 启用 Cloudflare 的监控和日志功能
```

### Hono应用配置 (src/index.ts)

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

const app = new Hono()

app.use('*', cors({
  origin: ['https://codeseek.pp.ua', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use('*', logger())
app.use('*', secureHeaders())

export default app
```

### 常量配置 (src/constants.ts)

```typescript
export const CONFIG = {
  /** 允许的用户行为类型 - [固定值] */
  ALLOWED_ACTIONS: [
    'search', 'login', 'logout', 'register', 'visit_site', 'copy_url',
    'favorite_add', 'favorite_remove', 'settings_update', 'export_data',
    'sync_data', 'page_view', 'session_start', 'session_end',
    'custom_source_add', 'custom_source_edit', 'custom_source_delete',
    'tag_created', 'tag_updated', 'tag_deleted',
    'major_category_create', 'major_category_update', 'major_category_delete',
    'source_category_create', 'source_category_update', 'source_category_delete',
    'search_source_create', 'search_source_update', 'search_source_delete',
    'user_source_config_update', 'search_sources_export'
  ] as const,

  /** 验证相关配置 - [后备值] */
  VALIDATION: {
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 20,
    PASSWORD_MIN_LENGTH: 6,
    PASSWORD_MAX_LENGTH: 100,
    USERNAME_REGEX: /^[a-zA-Z0-9_]{3,20}$/,
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    VERIFICATION_CODE_REGEX: /^\d{6}$/,
    MAX_BATCH_CONFIG_UPDATE: 100,
    MAX_SYNC_FAVORITES: 1000,
  },

  /** 安全相关配置 - [后备值] */
  SECURITY: {
    MAX_LOGIN_ATTEMPTS: 5,
    MAX_VERIFICATION_ATTEMPTS: 5,
    MAX_PASSWORD_RESET_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 15 * 60 * 1000,
    PASSWORD_RESET_LOCKOUT_MS: 60 * 60 * 1000,
    SUSPICIOUS_ACTIVITY_THRESHOLD: 50,
    RECENT_FAILED_LOGINS_THRESHOLD: 3,
    RECENT_IP_LOGINS_THRESHOLD: 3,
    RECENT_PASSWORD_CHANGES_THRESHOLD: 2,
  },

  /** 邮件相关配置 - [后备值] */
  Email: {
    VERIFICATION_CODE_EXPIRY_MS: 900000,
    VERIFICATION_CODE_LENGTH: 6,
    HOURLY_LIMIT: 5,
    DAILY_LIMIT: 20,
    RESEND_INTERVAL_MS: 60000,
    CHANGE_REQUEST_EXPIRY_MS: 1800000,
    CHANGE_PENDING_EXPIRY_MINUTES: 15,
    DEFAULT_FROM_EMAIL: 'noreply@codeseek.pp.ua',
    DEFAULT_FROM_NAME: '磁力快搜',
  },

  /** CORS跨域配置 - [固定值] */
  CORS: {
    MAX_AGE: 86400,
    ALLOW_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    ALLOW_HEADERS: ['Content-Type', 'Authorization', 'X-Requested-With'],
    EXPOSE_HEADERS: ['Content-Length', 'X-Request-Id'],
    ALLOWED_ORIGINS: [
      'https://codeseek.pp.ua',
      'https://www.codeseek.pp.ua',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
  },

  /** 搜索源状态检查配置 - [后备值] */
  SourceStatus: {
    CHECK_TIMEOUT_MS: 10000,
    BATCH_CHECK_TIMEOUT_MS: 5000,
    CACHE_DURATION_MS: 300000,
    MAX_BATCH_CHECK: 50,
    MAX_CACHE_AGE_MS: 300000,
  },

  /** 分页配置 - [后备值] */
  Pagination: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    MAX_LOG_PAGE_SIZE: 200,
    DEFAULT_HISTORY_LIMIT: 50,
    MAX_HISTORY_LIMIT: 200,
    MAX_BATCH_CONFIG_UPDATE: 100,
    MAX_SOURCES_CHECK: 50,
  },

  /** 默认值配置 - [固定值] */
  Defaults: {
    APP_VERSION: '2.0.0',
    SEARCH_PRIORITY: 5,
    DISPLAY_ORDER: 999,
    DEFAULT_ICON: '🔍',
    DEFAULT_CATEGORY_ICON: '📁',
    DEFAULT_MAJOR_CATEGORY_ICON: '🌟',
    DEFAULT_COLOR: '#3b82f6',
    DEFAULT_MAJOR_CATEGORY_COLOR: '#6b7280',
    DEFAULT_SITE_TYPE: 'search',
    SITE_URL: 'https://codeseek.pp.ua',
  },

  /** 用户数据限制配置 - [后备值] */
  MAX_FAVORITES_PER_USER: 1000,
  MAX_HISTORY_PER_USER: 500,
  MAX_TAGS_PER_USER: 100,
}
```

---

## 环境变量

### 前端环境变量 (.env)

```bash
VITE_API_URL=/api
VITE_APP_NAME=CodeSeek
VITE_APP_VERSION=2.0.0
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=false
```

### 后端环境变量 (Cloudflare Workers Secrets)

在Cloudflare Dashboard中设置以下环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `JWT_SECRET` | JWT签名密钥 | `your-super-secret-key-min-32-chars` |
| `RESEND_API_KEY` | Resend邮件服务API密钥 | `re_xxxxxxxxxxxx` |
| `DEFAULT_FROM_EMAIL` | 默认发件人邮箱 | `noreply@yourdomain.com` |
| `DEFAULT_FROM_NAME` | 默认发件人名称 | `磁力快搜` |
| `SITE_URL` | 网站URL | `https://codeseek.pp.ua` |

### 设置环境变量命令

```bash
# 使用Wrangler设置密钥
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY

# 或在Cloudflare Dashboard中设置
# Workers & Pages > codeseek-backend > Settings > Variables
```

---

## GitHub OAuth 配置

GitHub OAuth 模块支持使用 GitHub 账号第三方登录。

### 创建 GitHub OAuth App

1. 访问 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击 "New OAuth App"
3. 填写应用信息：
   - **Application name**: 应用名称（如：磁力快搜）
   - **Homepage URL**: 前端首页地址（如：`https://codeseek.pp.ua`）
   - **Authorization callback URL**: 后端回调地址（如：`https://backend.codeseek.pp.ua/api/auth/github/callback`）
4. 创建后获取 Client ID 和 Client Secret

### 环境变量配置

| 变量名 | 类型 | 说明 | 配置方式 |
|--------|------|------|----------|
| `GITHUB_CLIENT_ID` | Secret | GitHub OAuth App Client ID | `wrangler secret put GITHUB_CLIENT_ID` |
| `GITHUB_CLIENT_SECRET` | Secret | GitHub OAuth App Client Secret | `wrangler secret put GITHUB_CLIENT_SECRET` |
| `BACKEND_URL` | Var | 后端域名，用于构造回调 URL | wrangler.toml |
| `FRONTEND_URL` | Var | 前端域名，授权后跳转目标 | wrangler.toml |

### wrangler.toml 配置示例

```toml
[vars]
BACKEND_URL = "https://backend.codeseek.pp.ua"
FRONTEND_URL = "https://codeseek.pp.ua"
```

### 设置密钥

```bash
# 设置 GitHub OAuth Client ID
wrangler secret put GITHUB_CLIENT_ID
# 输入你的 Client ID

# 设置 GitHub OAuth Client Secret
wrangler secret put GITHUB_CLIENT_SECRET
# 输入你的 Client Secret
```

### OAuth 流程说明

1. 用户点击 "GitHub 登录" 按钮
2. 前端调用 `GET /api/auth/github` 发起授权
3. 后端生成 state 参数并重定向到 GitHub
4. 用户在 GitHub 授权页面确认
5. GitHub 回调到 `/api/auth/github/callback`
6. 后端验证 state，换取 access_token
7. 获取 GitHub 用户信息，创建/关联账号
8. 生成 JWT Token，重定向到前端

### 安全机制

- **CSRF 防护**: 使用随机 state 参数，存储在 HttpOnly Cookie 中
- **Cookie 安全**: 设置 `HttpOnly`、`Secure`、`SameSite=Lax`
- **有效期限制**: State 有效期 10 分钟
- **日志记录**: 记录登录安全事件

---

## 反馈系统配置

反馈系统模块支持用户提交问题反馈和建议，管理员可处理反馈并发送邮件通知。

### 环境变量配置

| 变量名 | 类型 | 说明 | 配置方式 |
|--------|------|------|----------|
| `RESEND_API_KEY` | Secret | Resend 邮件服务 API 密钥 | `wrangler secret put RESEND_API_KEY` |
| `DEFAULT_FROM_EMAIL` | Var | 发件人邮箱 | wrangler.toml |
| `DEFAULT_FROM_NAME` | Var | 发件人名称 | wrangler.toml |
| `SITE_URL` | Var | 网站域名（邮件中链接） | wrangler.toml |

### wrangler.toml 配置示例

```toml
[vars]
DEFAULT_FROM_EMAIL = "noreply@tempemail.pp.ua"
DEFAULT_FROM_NAME = "磁力快搜"
SITE_URL = "https://codeseek.pp.ua"
```

### 数据库表结构

反馈系统使用 `user_feedback` 表，需执行数据库迁移：

```bash
# 执行反馈表迁移
wrangler d1 execute codeseek-db --remote --file="../database/09_schema_feedback.sql"
```

### 反馈类型

| 类型 | 说明 |
|------|------|
| `bug` | 问题反馈 - 报告系统缺陷或错误 |
| `suggestion` | 优化建议 - 提出功能改进建议 |
| `other` | 其他 - 其他类型的反馈 |

### 反馈状态流转

```
pending (待处理) → processing (处理中) → resolved (已解决) / closed (已关闭)
```

### 邮件通知

当管理员处理反馈时，可选择发送邮件通知用户。邮件内容包括：
- 反馈类型和标题
- 处理状态
- 管理员回复内容
- 网站链接

### 前端组件

反馈系统提供两个前端组件：

1. **FeedbackButton** - 固定在页面右下角的浮动按钮
2. **FeedbackModal** - 反馈提交弹窗

使用示例：
```tsx
import { FeedbackButton } from '@/components/feedback';

function App() {
  return (
    <div>
      {/* 页面内容 */}
      <FeedbackButton />
    </div>
  );
}
```

---

## 代理服务配置

> **注意**: 代理服务已独立为 [OmniBox](https://github.com/Zoroaaa/OmniBox) 项目，以下为历史参考。

### 代理配置 (services/proxy/proxy-config.ts)

```typescript
export const PROXY_CONFIG = {
  enabled: true,
  
  cache: {
    enabled: true,
    ttl: {
      HTML: 5 * 60 * 1000,
      CSS: 60 * 60 * 1000,
      JS: 60 * 60 * 1000,
      IMAGE: 24 * 60 * 60 * 1000,
      FONT: 7 * 24 * 60 * 60 * 1000,
      API: 60 * 1000,
      OTHER: 30 * 60 * 1000,
    }
  },
  
  concurrency: {
    maxConcurrent: 10,
    queueSize: 100,
  },
  
  retry: {
    maxRetries: 3,
    retryDelay: 1000,
  }
}
```

---

## 数据库配置

### D1数据库创建

```bash
# 创建数据库
wrangler d1 create codeseek-db

# 查看数据库信息
wrangler d1 info codeseek-db

# 执行迁移
wrangler d1 migrations apply codeseek-db
```

### 数据库迁移文件

数据库迁移文件位于 `database/` 目录：

```
database/
├── 01_schema_core.sql          # 核心表结构（角色、用户、会话等）
├── 02_schema_search.sql        # 搜索引擎核心（分类、搜索源）
├── 03_schema_community.sql     # 社区功能（标签、分享、评论）
├── 04_schema_security.sql      # 安全模块（验证、锁定）
├── 05_data_system.sql          # 系统初始化数据
├── 06_data_search_sources.sql  # 搜索源预置数据（50+源）
├── 07_data_tags.sql            # 官方标签初始化数据
└── 09_schema_feedback.sql      # 用户反馈表结构
```

### 数据库初始化

```bash
# 按顺序执行SQL文件
cd backend

# 开发环境
wrangler d1 execute codeseek-db --local --file="../database/01_schema_core.sql"
wrangler d1 execute codeseek-db --local --file="../database/02_schema_search.sql"
wrangler d1 execute codeseek-db --local --file="../database/03_schema_community.sql"
wrangler d1 execute codeseek-db --local --file="../database/04_schema_security.sql"
wrangler d1 execute codeseek-db --local --file="../database/05_data_system.sql"
wrangler d1 execute codeseek-db --local --file="../database/06_data_search_sources.sql"
wrangler d1 execute codeseek-db --local --file="../database/07_data_tags.sql"
wrangler d1 execute codeseek-db --local --file="../database/09_schema_feedback.sql"

# 生产环境
wrangler d1 execute codeseek-db --remote --file="../database/01_schema_core.sql"
# ... 其他文件（按相同顺序执行）
```

---

## 角色权限配置

### 系统角色

系统内置四种角色：

| 角色 | 权限级别 | 说明 |
|------|---------|------|
| super_admin | 100 | 超级管理员，拥有所有权限 |
| admin | 50 | 管理员，可管理用户和内容 |
| user | 10 | 普通用户，基本功能权限 |
| guest | 1 | 访客，仅搜索权限 |

### 权限列表

```typescript
// 超级管理员权限
const SUPER_ADMIN_PERMISSIONS = ['*'];

// 管理员权限
const ADMIN_PERMISSIONS = [
  'user:read', 'user:write',
  'stats:read',
  'report:read', 'report:write',
  'source:read', 'source:write',
  'community:read', 'community:write'
];

// 普通用户权限
const USER_PERMISSIONS = [
  'search', 'favorite', 'history', 'sync',
  'community:share', 'community:review'
];

// 访客权限
const GUEST_PERMISSIONS = ['search'];
```

### 权限中间件使用

```typescript
import { authMiddleware, roleMiddleware, permissionMiddleware } from './middleware';

// 需要认证的路由
app.use('/api/user/*', authMiddleware);

// 需要管理员权限的路由
app.use('/api/admin/*', authMiddleware, adminMiddleware);

// 需要特定权限的路由
app.post('/api/sources', 
  authMiddleware, 
  roleMiddleware, 
  permissionMiddleware('source:write'),
  createSourceHandler
);
```

---

## 配置最佳实践

### 安全建议

1. **密钥管理**
   - 使用强随机密钥（至少32字符）
   - 定期轮换JWT密钥
   - 不要在代码中硬编码密钥

2. **CORS配置**
   - 仅允许可信域名
   - 生产环境禁用 `*` 通配符
   - 启用credentials时需指定具体域名

3. **环境隔离**
   - 开发和生产使用不同的数据库
   - 使用不同的API密钥
   - 区分日志级别

### 性能优化

1. **缓存策略**
   - 静态资源使用长期缓存
   - API响应使用适当TTL
   - 启用CDN缓存

2. **资源优化**
   - 启用代码分割
   - 使用Tree-shaking
   - 压缩静态资源

3. **数据库优化**
   - 创建必要的索引
   - 使用参数化查询
   - 定期清理过期数据
