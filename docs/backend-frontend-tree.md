# 磁力快搜 - 项目架构树 (v3.1.0)

> 📖 [返回项目主页](../readme.md) | [API接口文档](api/index.md) | [配置说明文档](config.md) | [部署指南文档](deploy.md) | [v3.0 变更日志](changelogv3.0.md) | [v3.1.0 变更日志](changelogv3.1.0.md)

---

## 目录

- [技术栈版本](#技术栈版本)
- [项目根目录结构](#项目根目录结构)
- [前端架构](#前端架构-部署在cloudflare-pages)
- [后端架构](#后端架构-部署在cloudflare-workers-v30)
- [部署架构](#部署架构)
- [数据库模块化结构说明](#数据库模块化结构说明)
- [版本信息](#版本信息)
- [与版本1.0的主要区别](#与版本10的主要区别)
- [版本 3.0 更新内容](#版本-30-更新内容)

---

## 技术栈版本

### 前端技术栈
- **核心**: React 18.3.1 + TypeScript 5.5.3
- **构建工具**: Vite 5.4.1
- **样式框架**: Tailwind CSS 3.4.11
- **状态管理**: Zustand 4.5.5 (支持持久化)
- **路由管理**: React Router 6.26.2
- **图标库**: Lucide React 0.441.0
- **日期处理**: date-fns 3.6.0
- **工具库**: clsx 2.1.1 (类名合并)
- **部署**: Cloudflare Pages
- **版本**: v3.1.0

### 后端技术栈
- **运行时**: Cloudflare Workers
- **框架**: Hono 4.6.0 (轻量级Web框架)
- **语言**: TypeScript 5.5.3
- **数据库**: Cloudflare D1 (SQLite)
- **认证**: JWT (jose 5.9.0)
- **数据验证**: Zod 4.4.3
- **密码安全**: PBKDF2-SHA256 (100,000次迭代)
- **Token 存储**: AES-GCM 加密 (v3.1.0)
- **邮件服务**: Resend
- **API**: RESTful 风格
- **开发工具**: Wrangler 3.78.0
- **版本**: v3.1.0

### 代理服务
- **架构**: Cloudflare Workers边缘计算
- **功能**: URL重写、资源优化、请求转发
- **状态**: 已独立为 [OmniBox](https://github.com/Zoroaaa/OmniBox) 项目

---

## 项目根目录结构

```
codeseek/
├── 📁 packages/                   # 共享包 (npm workspaces)
│   └── 📁 shared/                 # @codeseek/shared - 类型、工具、验证规则
├── 📁 backend/                    # 后端代码 (Cloudflare Workers + Hono)
├── 📁 frontend/                   # 前端代码 (React + TypeScript)
├── 📁 database/                   # 数据库迁移文件 (Cloudflare D1)
├── 📁 codeseek-1.0/              # 版本1.0存档（历史参考）
├── 📁 docs/                       # 项目文档目录
├── 📄 package.json                # npm workspaces 根配置
├── 📄 readme.md                   # 项目说明文档
└── 📄 LICENSE                     # MIT许可证
```

---

## 前端架构 (部署在Cloudflare Pages)

```
frontend/
├── 📁 images/                            # 🖼️ 静态资源
│   ├── 📄 favicon.ico                    # 网站图标
│   └── 📄 logo.png                       # 应用Logo
│
├── 📁 public/                            # 公共资源
│   ├── 📄 _headers                       # Cloudflare Headers配置
│   └── 📄 _redirects                     # Cloudflare重定向配置
│
├── 📁 docs/                              # 📚 前端文档
│   └── 📄 notification.md                # 通知系统文档
│
├── 📁 src/                               # 📦 源码目录
│   │
│   ├── 📁 components/                    # 🧩 组件层
│   │   ├── 📁 layout/                    # 布局组件
│   │   │   ├── 📄 AdminPanelLayout.tsx   # 管理面板布局组件
│   │   │   ├── 📄 CommunityPanelLayout.tsx # 社区面板布局组件
│   │   │   ├── 📄 DashboardLayout.tsx    # 仪表板布局组件
│   │   │   ├── 📄 MainLayout.tsx         # 主页面布局组件
│   │   │   └── 📄 index.ts               # 布局组件导出
│   │   │
│   │   └── 📁 ui/                        # UI基础组件
│   │       ├── 📄 Badge.tsx              # 徽章组件
│   │       ├── 📄 Button.tsx             # 按钮组件
│   │       ├── 📄 Card.tsx               # 卡片组件
│   │       ├── 📄 Checkbox.tsx           # 复选框组件
│   │       ├── 📄 Dropdown.tsx           # 下拉菜单组件
│   │       ├── 📄 EmptyState.tsx         # 空状态组件
│   │       ├── 📄 Input.tsx              # 输入框组件
│   │       ├── 📄 Loading.tsx            # 加载组件
│   │       ├── 📄 Modal.tsx              # 模态框组件
│   │       ├── 📄 Select.tsx             # 选择器组件
│   │       ├── 📄 SourceIcon.tsx         # 搜索源图标组件
│   │       ├── 📄 Tabs.tsx               # 标签页组件
│   │       ├── 📄 TextArea.tsx           # 文本域组件
│   │       ├── 📄 Toast.tsx              # 通知组件
│   │       └── 📄 index.ts               # UI组件导出
│   │
│   ├── 📁 contexts/                      # 🔄 React Context
│   │   └── 📄 ConfigContext.tsx          # 配置上下文
│   │
│   ├── 📁 hooks/                         # 🎣 自定义Hooks
│   │   ├── 📄 useAuth.ts                 # 认证Hook
│   │   ├── 📄 useFavorites.ts            # 收藏Hook
│   │   ├── 📄 useNotification.ts         # 通知Hook
│   │   ├── 📄 useSearch.ts               # 搜索Hook
│   │   ├── 📄 useSearchSuggestions.ts    # 搜索建议Hook
│   │   └── 📄 index.ts                   # Hooks导出
│   │
│   ├── 📁 pages/                         # 📄 页面组件
│   │   ├── 📁 admin/                     # 管理员页面
│   │   │   ├── 📄 ActionsTab.tsx         # 行为日志标签页
│   │   │   ├── 📄 AdminManager.tsx       # 管理面板主页
│   │   │   ├── 📄 AdminPanelOverview.tsx # 管理面板概览
│   │   │   ├── 📄 AnalyticsTab.tsx       # 分析统计标签页
│   │   │   ├── 📄 CleanupTab.tsx         # 数据清理标签页
│   │   │   ├── 📄 ConfigTab.tsx          # 系统配置标签页
│   │   │   ├── 📄 ReportsTab.tsx         # 举报管理标签页
│   │   │   ├── 📄 RolesTab.tsx           # 角色管理标签页
│   │   │   ├── 📄 SessionsTab.tsx        # 会话管理标签页
│   │   │   ├── 📄 TrendsTab.tsx          # 趋势分析标签页
│   │   │   ├── 📄 UsersTab.tsx           # 用户管理标签页
│   │   │   ├── 📄 index.ts               # 管理页面导出
│   │   │   └── 📄 shared.tsx             # 共享组件
│   │   │
│   │   ├── 📁 auth/                      # 认证页面
│   │   │   ├── 📄 ForgotPasswordPage.tsx # 忘记密码页
│   │   │   ├── 📄 LoginPage.tsx          # 登录页
│   │   │   ├── 📄 RegisterPage.tsx       # 注册页
│   │   │   └── 📄 index.ts               # 认证页面导出
│   │   │
│   │   ├── 📁 community/                 # 社区页面
│   │   │   ├── 📄 BrowseTab.tsx          # 浏览标签页
│   │   │   ├── 📄 CommunityManager.tsx   # 社区管理页
│   │   │   ├── 📄 FavoritesTab.tsx       # 收藏标签页
│   │   │   ├── 📄 MySharesTab.tsx        # 我的分享标签页
│   │   │   ├── 📄 NotificationsTab.tsx   # 通知标签页
│   │   │   ├── 📄 StatsBanner.tsx        # 统计横幅组件
│   │   │   ├── 📄 TagsTab.tsx            # 标签管理标签页
│   │   │   ├── 📄 TrendingTab.tsx        # 热门标签页
│   │   │   ├── 📄 index.ts               # 社区页面导出
│   │   │   └── 📄 shared.tsx             # 共享组件
│   │   │
│   │   ├── 📁 dashboard/                 # 仪表板页面
│   │   │   ├── 📄 CategoryManager.tsx    # 分类管理页
│   │   │   ├── 📄 DashboardPage.tsx      # 仪表板主页
│   │   │   ├── 📄 FavoritesHistoryManager.tsx # 收藏历史管理
│   │   │   ├── 📄 OverviewManager.tsx    # 概览页
│   │   │   ├── 📄 SettingsManager.tsx    # 设置页
│   │   │   ├── 📄 SourceManager.tsx      # 搜索源管理页
│   │   │   ├── 📄 StatsManager.tsx       # 统计页
│   │   │   ├── 📄 UserActivitiesPage.tsx # 用户活动页
│   │   │   └── 📄 index.ts               # 仪表板页面导出
│   │   │
│   │   ├── 📄 HomePage.tsx               # 首页
│   │   └── 📄 MainSearchPage.tsx         # 主搜索页
│   │
│   ├── 📁 services/                      # 🔧 服务层
│   │   ├── 📁 api/                       # API服务
│   │   │   ├── 📄 admin.ts               # 管理员API
│   │   │   ├── 📄 auth.ts                # 认证API
│   │   │   ├── 📄 client.ts              # API客户端
│   │   │   ├── 📄 community.ts           # 社区API
│   │   │   ├── 📄 index.ts               # API服务导出
│   │   │   ├── 📄 search.ts              # 搜索API
│   │   │   ├── 📄 source.ts              # 搜索源API
│   │   │   └── 📄 system.ts              # 系统API
│   │   │
│   │   ├── 📁 proxy/                     # 代理服务
│   │   │   ├── 📄 ProxyService.ts        # 代理服务实现
│   │   │   └── 📄 proxy-config.ts        # 代理配置
│   │   │
│   │   └── 📄 config.ts                  # 配置服务
│   │
│   ├── 📁 stores/                        # 📦 状态管理 (Zustand)
│   │   ├── 📄 authStore.ts               # 认证状态
│   │   ├── 📄 communityStore.ts          # 社区状态
│   │   ├── 📄 index.ts                   # Store导出
│   │   ├── 📄 proxyStore.ts              # 代理状态
│   │   ├── 📄 searchStore.ts             # 搜索状态
│   │   ├── 📄 sourceStore.ts             # 搜索源状态
│   │   ├── 📄 themeStore.ts              # 主题状态
│   │   └── 📄 uiStore.ts                 # UI状态
│   │
│   ├── 📁 types/                         # 📝 TypeScript类型定义
│   │   ├── 📄 auth.ts                    # 认证类型
│   │   ├── 📄 common.ts                  # 通用类型
│   │   ├── 📄 community.ts               # 社区类型
│   │   ├── 📄 index.ts                   # 类型导出
│   │   ├── 📄 notification.ts            # 通知类型
│   │   ├── 📄 search.ts                  # 搜索类型
│   │   └── 📄 source.ts                  # 搜索源类型
│   │
│   ├── 📁 utils/                         # 🛠️ 工具函数
│   │   ├── 📄 notificationTemplates.ts   # 通知模板
│   │   ├── 📄 magnet.ts                  # 磁力链接工具
│   │   └── 📄 index.ts                   # 工具函数导出
│   │
│   ├── 📄 App.tsx                        # 应用入口组件
│   ├── 📄 index.css                      # 全局样式 (Tailwind)
│   └── 📄 main.tsx                       # 主入口文件
│
├── 📄 index.html                         # HTML入口
├── 📄 package.json                       # 项目配置
├── 📄 postcss.config.js                  # PostCSS配置
├── 📄 tailwind.config.js                 # Tailwind配置
├── 📄 tsconfig.json                      # TypeScript配置
└── 📄 vite.config.ts                     # Vite配置
```

---

## 后端架构 (部署在Cloudflare Workers v3.1)

```
backend/
├── 📁 .github/                           # 🤖 GitHub配置
│   └── 📁 workflows/                     # CI/CD工作流配置
│       └── 📄 backend-deploy.yml         # 🚀 自动部署配置
│
├── 📁 src/                               # 🎯 核心代码目录
│   │
│   ├── 📁 middleware/                    # 🔐 中间件层
│   │   ├── 📄 auth.ts                    # 认证中间件
│   │   └── 📄 index.ts                   # 中间件导出
│   │
│   ├── 📁 routes/                        # 🛣️ 路由层
│   │   ├── 📄 admin.ts                   # 管理员路由 (仪表盘、用户管理、统计等)
│   │   ├── 📄 auth.ts                    # 认证路由 (登录、注册、密码重置等)
│   │   ├── 📄 community.ts               # 社区路由 (分享、评论、点赞等)
│   │   ├── 📄 config.ts                  # 配置路由 (系统配置、分析事件等)
│   │   ├── 📄 search.ts                  # 搜索路由 (搜索、历史、收藏、建议等)
│   │   ├── 📄 sources.ts                 # 搜索源路由 (分类、搜索源管理)
│   │   ├── 📄 system.ts                  # 系统路由 (公开配置、状态检查等)
│   │   └── 📄 user.ts                    # 用户路由 (设置、活动记录等)
│   │
│   ├── 📁 services/                      # 🔧 业务服务层
│   │   ├── 📄 config.ts                  # 配置服务
│   │   ├── 📄 email-verification.ts      # 📧 邮箱验证服务
│   │   ├── 📄 index.ts                   # 服务导出
│   │   └── 📄 search-sources-service.ts  # 🔍 搜索源服务
│   │
│   ├── 📁 types/                         # 📝 TypeScript类型定义
│   │   └── 📄 index.ts                   # 类型定义
│   │
│   ├── 📁 utils/                         # 🛠️ 工具函数
│   │   ├── 📄 index.ts                   # 工具函数入口
│   │   └── 📄 security.ts                # 安全工具
│   │
│   ├── 📁 validation/                    # ✅ 验证层
│   │   └── 📄 index.ts                   # 请求验证
│   │
│   ├── 📄 constants.ts                   # 📋 常量配置 (CORS、分页、验证等)
│   └── 📄 index.ts                       # 🚀 主入口文件 (路由注册)
│
├── 📄 eslint.config.js                   # ESLint配置
├── 📄 package.json                       # 📦 项目配置文件
├── 📄 tsconfig.json                      # TypeScript配置
└── 📄 wrangler.toml                      # ☁️ Cloudflare Workers配置
```

> **注意**: 数据库迁移文件位于项目根目录的 `database/` 目录下。

---

## 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  前端应用 (React)                     │   │
│  │  • 静态资源托管                                       │   │
│  │  • 全球CDN加速                                        │   │
│  │  • 自动HTTPS                                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Workers                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 后端API服务 (Hono)                    │   │
│  │  • 边缘计算                                          │   │
│  │  • 全球分布                                          │   │
│  │  • 自动扩缩容                                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare D1                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  SQLite数据库                        │   │
│  │  • 用户数据                                          │   │
│  │  • 搜索源配置                                        │   │
│  │  • 社区数据                                          │   │
│  │  • 系统配置                                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据库模块化结构说明

### 模块依赖关系

```
01_schema_core.sql (基础模块 - 必须首先执行)
        │
        ├──► 02_schema_search.sql (搜索引擎核心)
        │
        ├──► 03_schema_community.sql (社区功能 - 依赖用户表)
        │
        ├──► 04_schema_security.sql (邮箱验证与安全机制)
        │
        ├──► 05_data_system.sql (系统初始化数据)
        │
        ├──► 06_data_search_sources.sql (搜索源预置数据 - 50+源)
        │
        ├──► 07_data_tags.sql (官方标签初始化数据)
        │
        ├──► 10_schema_favorites_extend.sql (v3.0: 收藏表扩展)
        │
        ├──► 11_schema_search_history_extend.sql (v3.0: 历史表扩展)
        │
        └──► 12_index_performance.sql (v3.1: 查询性能索引)
```

### 数据表详细说明

| 模块文件 | 核心数据表 | 说明 |
|---------|-----------|------|
| 01_schema_core.sql | roles, users, user_sessions, user_favorites, user_search_history, user_actions, system_config, analytics_events | 核心模块：角色权限、用户管理、会话、收藏、历史、行为日志、系统配置、分析事件 |
| 02_schema_search.sql | search_major_categories, search_source_categories, search_sources, user_search_source_configs, source_status_cache | 搜索引擎核心：主分类、子分类、搜索源、用户配置、状态缓存 |
| 03_schema_community.sql | community_source_tags, community_shared_sources, community_source_reviews, community_source_likes, community_source_downloads, community_source_reports, community_user_stats | 完整社区功能：标签、分享、评论、点赞、下载、举报、用户统计 |
| 04_schema_security.sql | email_verifications, email_change_requests, password_reset_logs, security_lockouts, user_security_events, email_send_logs, email_templates | 安全模块：邮箱验证、邮箱更改、密码重置、安全锁定、安全事件、邮件日志、邮件模板 |
| 05_data_system.sql | - | 系统初始化数据：角色定义、系统配置、邮件模板 |
| 06_data_search_sources.sql | - | 搜索源预置数据：4个主分类、50+搜索源 |
| 07_data_tags.sql | - | 官方标签初始化数据 |
| 10_schema_favorites_extend.sql | - | v3.0: 收藏表新增9个JAV元数据字段 |
| 11_schema_search_history_extend.sql | - | v3.0: 搜索历史表新增9个元数据字段 |
| 12_index_performance.sql | - | v3.1: 25个高频查询索引 |

### 搜索源预置数据

项目预置了 **50+ 搜索源**，分为以下类别：

**番号资料站 (searchable=1)**
- JavBus, JavDB, JavLibrary, r/JAV

**在线播放平台 (searchable=1)**
- Jable, JavMost, JavGuru, AV01, JavGG
- MissAV, SupJAV, BestJavPorn, JAV.sb, JAVLeak
- JAVSeen, JAVTsunami, JAV Subtitled, JAVOut, JAVCL
- JavDoe, JAV Desu, JavyNow, JAVHDPorn.net, JAV Ass Lover, JAV Subtitle

**磁力种子站 (site_type=browse)**
- BTSOW, MagnetDL, TorrentKitty, Sukebei
- OneJAV, Project Jav, NextJAV, JavJunkies, JAVBEE
- iJavTorrent, Empornium, 141PPV, LoveTorrent, XXXClub, My JAV Bay

**社区论坛 (site_type=browse)**
- 色花堂98堂, T66Y草榴社区, 5278.cc, SexInSex
- SIS001, South-Plus, 52AV, JKForum, EYNY
- 夯鸭论坛, OurSogo, Cool18, 141HongKong, HJD2048, 91论坛, Sex8.cc

---

## 版本信息

| 组件 | 版本 | 说明 |
|-----|------|------|
| 前端应用 | v3.1.0 | React 18 + TypeScript |
| 后端服务 | v3.1.0 | Hono + TypeScript |
| 数据库 | v3.1.0 | Cloudflare D1 |
| 共享包 | v3.1.0 | @codeseek/shared |

---

## 与版本1.0的主要区别

### 前端变化

| 特性 | 版本1.0 | 版本2.0 |
|-----|---------|---------|
| 技术栈 | 原生ES6 JavaScript | React 18.3.1 + TypeScript |
| 构建工具 | 无（直接运行） | Vite 5 |
| 样式方案 | 原生CSS | Tailwind CSS |
| 状态管理 | 自定义Store | Zustand |
| 类型安全 | 无 | TypeScript |
| 组件化 | 模块化函数 | React函数组件 |
| 路由 | 无 | React Router 6 |

### 后端变化

| 特性 | 版本1.0 | 版本2.0 |
|-----|---------|---------|
| 语言 | JavaScript | TypeScript |
| 框架 | 原生Workers | Hono框架 |
| 路由 | 自定义Router | Hono路由 |
| 类型安全 | 无 | TypeScript |
| 验证 | 自定义验证 | 统一验证层 |

### 架构优势

1. **类型安全**: TypeScript提供编译时类型检查
2. **开发体验**: React生态系统和现代工具链
3. **可维护性**: 组件化架构，代码组织更清晰
4. **性能优化**: Vite构建，代码分割，Tree-shaking
5. **开发效率**: 热更新，更好的IDE支持

---

## 版本 3.0 更新内容

> 📅 发布日期: 2026-05-13 | 详细变更: [changelogv3.0.md](changelogv3.0.md)

### 🔒 安全性重大升级

- **密码哈希算法升级**: SHA-256 → PBKDF2-SHA256 (100,000次迭代)
  - 新增随机盐值，抗彩虹表攻击
  - 向后兼容旧哈希格式
  - 符合 OWASP 密码存储最佳实践
  
- **Token 哈希分离**: 密码和 Token 使用不同哈希策略
  - Token 保持 SHA-256（轻量快速）
  - 密码使用 PBKDF2（高安全性）

- **CORS 策略强化**:
  - 移除通配符匹配（原 `.endsWith()` 过于宽松）
  - 支持正则表达式精确控制域名
  - 明确拒绝未授权来源

### 📊 数据模型扩展

#### 收藏项新增字段 (9个)
| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | TEXT | 番号 |
| `cover` | TEXT | 封面图URL |
| `actors` | TEXT | 演员 |
| `duration` | TEXT | 时长 |
| `tags` | TEXT | 标签 |
| `release_date` | TEXT | 发行时间 |
| `publisher` | TEXT | 发行商 |
| `magnet_link` | TEXT | 磁力链接 |
| `status` | TEXT | 状态 (want/watched) |

#### 搜索历史新增字段 (9个)
- title, subtitle, code, actors, duration, tags, release_date, publisher, keyword

### ⚙️ 后端架构改进

1. **Zod 数据验证体系**
   - 新增依赖: `zod@^4.4.3`
   - 新增文件: [`backend/src/utils/validators.ts`](backend/src/utils/validators.ts)
   - 应用场景: 用户活动、反馈、通知等数据验证
   
2. **认证中间件统一**
   - Context 新增 `authToken` 字段
   - 消除 ~50 行重复的 Token 验证代码
   - 统一使用 `authMiddleware` 装饰接口

3. **数据库批量操作优化**
   - 使用 `DB.batch()` 实现原子操作
   - 应用于账户删除、密码重置等场景

4. **搜索源服务 Bug 修复**
   - 修正表名: `major_categories` → `search_major_categories`
   - 修正表名: `categories` → `search_source_categories`

5. **JSON 解析容错处理**
   - settings 和 permissions 字段增加 try-catch
   - 防止脏数据导致服务异常

### 🎨 前端体验优化

1. **收藏面板重构**
   - 卡片式布局（支持封面图展示）
   - 状态切换按钮（想看 ↔ 已看）
   - 元数据显示（番号、演员、时长、标签等）
   
2. **搜索历史面板增强**
   - 高度调整: 276px → 400px
   - Grid 网格 → 列表视图（适应多行内容）
   - 完整元数据展示

3. **JAV 面板功能扩展**
   - 新增收藏状态显示
   - 快速添加/取消收藏功能
   - 收藏时自动携带完整元数据

4. **认证架构优化**
   - ApiClient 不再维护独立 token 状态
   - 统一由 AuthStore (Zustand) 管理
   - 消除双重状态同步问题

5. **图片代理组件**
   - 新增 ProxyImage 组件（解决跨域问题）
   - 自动回退占位图

### 🗄️ 数据库变更

**新增迁移脚本**:
- [`database/10_schema_favorites_extend.sql`](database/10_schema_favorites_extend.sql) - 收藏表扩展
- [`database/11_schema_search_history_extend.sql`](database/11_schema_search_history_extend.sql) - 历史表扩展

**索引优化**:
```sql
CREATE INDEX idx_favorites_code ON user_favorites(code);
```

### 📦 依赖变更

**后端新增**:
```json
{
  "dependencies": {
    "zod": "^4.4.3"
  }
}
```

**前端无新增依赖**（基于现有技术栈）

### 📈 变更统计

- **总文件数**: 35 个文件修改
- **代码行数**: +1666 行 / -596 行
- **后端文件**: 15 个（核心逻辑 + 验证体系）
- **前端文件**: 12 个（UI 重构 + 架构优化）
- **数据库脚本**: 3 个（Schema + 迁移）

---

## 🔄 v3.1.0 版本变更 (2026-05-13)

### 📦 Monorepo 共享包改造

- 创建 `packages/shared` (`@codeseek/shared`)
- 前端类型文件改为从共享包重新导出：`auth.ts`, `search.ts`, `source.ts`, `common.ts`
- 后端 `VALIDATION_RULES` 从共享包导入
- npm workspaces 统一管理，前后端分别独立构建/部署

### 🔒 安全加固

- 关闭生产环境 source map (`vite.config.ts`)

### 🚦 CI/CD 改进

- `backend-deploy.yml` 部署前强制运行 `typecheck` + `lint`
- 类型错误和代码规范问题被拦截在 CI，不再推送到生产

### ⚡ 性能优化

- 新增 `12_index_performance.sql` — 25 个高频查询索引
- 覆盖：登录、会话验证、收藏、搜索历史、邮箱验证、安全锁定、社区查询
- 构建脚本优化：`tsc -b && vite build` → `tsc --noEmit && vite build`

### 🧹 代码质量

- 新增 `camelizeKeys` 工具函数（递归 snake_case → camelCase）
- 前端 `utils/index.ts` 从共享包重新导出工具函数
- 前端 API 服务 (`search.ts`) 应用 `camelizeKeys` 替代 15 行手动映射
- 修复 `AdminUser.permissions` / `AdminUserDetail.permissions` 类型 (`string` → `string[]`)
- 删除冗余文件：`frontend/src/utils/camelize.ts`, `shared/validations.ts`

### 📄 文件变更
- 新增 14 个文件（共享包 + 数据库索引）
- 修改 12 个文件（前端 9 + 后端 3 + CI 1 + 构建配置 1）
- 删除 0 个文件

---

👉 [查看完整的 v3.1.0 变更日志 →](changelogv3.1.0.md)

👉 [查看完整的 v3.0 变更日志 →](changelogv3.0.md)
