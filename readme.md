<div align="center">

<img src="frontend/public/logo.png" alt="CodeSeek Logo" width="120" height="120">

# 磁力快搜 - CodeSeek

**现代化的磁力搜索聚合平台 - 基于 Cloudflare 边缘计算的无服务器架构**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)](https://github.com/Zoroaaa/codeseek)
[![Cloudflare](https://img.shields.io/badge/Powered%20by-Cloudflare-orange.svg)](https://www.cloudflare.com/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-green.svg)](/)
[![Backend](https://img.shields.io/badge/Backend-Hono%20%2B%20TypeScript-blue.svg)](/)
[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTYDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/Zoroaaa/codeseek)

</div>

## 📑 目录

- [快速访问](#-快速访问)
- [项目文档](#-项目文档)
- [项目特色](#-项目特色)
- [技术栈概览](#️-技术栈概览)
- [快速开始](#-快速开始)
- [性能优化](#-性能优化)
- [安全特性](#-安全特性)
- [许可证](#-许可证)
- [致谢](#-致谢)
- [联系与支持](#-联系与支持)

## 🔗 快速访问

<div align="center">

| 资源类型 | 链接 | 备注 |
|---------|------|------|
| 📖 项目文档 | 👉 [完整介绍](https://zread.ai/Zoroaaa/codeseek) | 详细的项目说明和使用指南 |
| 🚀 在线体验 | 👉 [https://codeseek.pp.ua](https://codeseek.pp.ua) | 体验完整功能 |
| 🔑 演示密码 | 👉 `pp520` | 代理网页访问密码 |

</div>

## 📚 项目文档

本项目采用模块化文档管理，各专项文档独立维护，确保内容完整、准确、专业。

### 核心文档

| 文档 | 说明 | 链接 |
|------|------|------|
| **API 接口文档** | 完整的 RESTful API 接口说明，包含 130+ 接口定义、请求/响应格式、认证方式等 | [docs/api/index.md](docs/api/index.md) |
| **架构设计文档** | 前后端目录结构、技术栈版本、部署架构、数据库模块化设计详解 | [docs/backend-frontend-tree.md](docs/backend-frontend-tree.md) |
| **配置说明文档** | 前端配置、后端配置、环境变量、代理服务、数据库配置、角色权限配置 | [docs/config.md](docs/config.md) |
| **部署指南文档** | 环境要求、本地开发、后端部署、前端部署、数据库配置、常见问题解答 | [docs/deploy.md](docs/deploy.md) |
| **版本变更日志** | 完整的版本变更记录：v2.0（架构重构）、v3.0（安全增强+功能扩展）、v3.1（Monorepo共享+安全加固+性能优化） | [docs/changelogv.2.0.md](docs/changelogv.2.0.md) / [docs/changelogv3.0.md](docs/changelogv3.0.md) / [docs/changelogv3.1.0.md](docs/changelogv3.1.0.md) |
| **GitHub 推送指南** | Git 操作流程、提交规范、分支管理、GitHub Actions 自动部署配置 | [docs/github_push.md](docs/github_push.md) |

### 前端专项文档

| 文档 | 说明 | 链接 |
|------|------|------|
| **通知组件文档** | Toast 通知组件的使用方法、API 文档、配置选项和最佳实践 | [frontend/docs/notification.md](frontend/docs/notification.md) |

## ✨ 项目特色

### 🎯 核心优势

#### 1. 现代化技术架构
- ⚛️ **React 18 + TypeScript 5.5**: 采用最新的React并发特性，配合TypeScript实现完整的类型安全，大幅减少运行时错误
- ⚡ **Vite 5.4 极速构建**: 毫秒级热更新，开发体验丝滑流畅，生产构建优化到极致
- 🎨 **Tailwind CSS 3.4**: 原子化CSS方案，样式开发效率提升300%，支持亮色/暗色主题无缝切换
- 📦 **Zustand 状态管理**: 轻量级状态管理方案，自动持久化存储，告别Redux的繁琐

#### 2. 云原生边缘计算
- ☁️ **Cloudflare 全栈部署**: 前端Pages + 后端Workers + 数据库D1，完全Serverless架构
- 🌍 **全球CDN加速**: 利用Cloudflare全球300+边缘节点，用户就近访问，响应速度提升80%
- 💰 **零运维成本**: 无需购买服务器，免费额度即可支撑中小型应用，真正实现"部署即忘"
- 📈 **自动弹性伸缩**: 流量高峰自动扩容，无需担心服务器宕机或资源浪费

#### 3. 多源聚合搜索引擎
- 🌐 **50+ 预置搜索源**: 内置磁力搜索、网盘搜索、影视搜索、学术搜索等多种类型
- 🔍 **智能聚合搜索**: 一键搜索多个源，结果统一格式化、智能排序，告别逐个网站查找
- 📊 **搜索源状态监控**: 实时检测搜索源可用性，自动跳过失效源，保证搜索成功率
- ⚙️ **高度可定制**: 用户可自由启用/禁用搜索源、调整优先级、添加自定义搜索源

#### 4. 企业级安全防护
- 🔐 **JWT无状态认证**: 基于jose库实现的Token认证，支持自动刷新，安全可靠
- 📧 **完整邮箱验证**: 注册验证、密码重置、邮箱更改、账户删除，全流程邮箱确认
- 🛡️ **多层安全机制**: 登录失败锁定、验证码频率限制、临时邮箱黑名单、安全事件日志
- 🔑 **RBAC权限系统**: 四级角色权限（超级管理员/管理员/用户/访客），细粒度权限控制

### 🚀 技术亮点

#### 前端技术栈
```
React 18.3.1          → 并发渲染、Suspense、自动批处理
TypeScript 5.5.3      → 完整类型推断、泛型约束、类型守卫
Vite 5.4.1            → ESM原生支持、按需编译、极速HMR
Tailwind CSS 3.4.11   → JIT编译、暗色模式、响应式设计
Zustand 4.5.5         → 极简API、中间件支持、持久化存储
@codeseek/shared      → Monorepo 共享包 (类型、工具、验证规则)
React Router 6.26.2   → 数据路由、懒加载、嵌套布局
Lucide React 0.441.0  → 1000+ 精美图标、Tree-shaking优化
date-fns 3.6.0        → 轻量级日期处理、国际化支持
```

#### 后端技术栈
```
Hono 4.6.0            → 超轻量Web框架、多运行时支持
TypeScript 5.5.3      → 类型安全、接口定义、泛型约束
Cloudflare Workers    → 边缘计算、V8隔离环境、零冷启动
Cloudflare D1         → SQLite兼容、全球分布、自动备份
JWT (jose 5.9.0)      → 标准化认证、多种算法支持
Resend                → 现代邮件服务、高送达率、实时追踪
```

### 📱 用户体验

#### 完美响应式设计
- 📱 **移动端优先**: 从320px到4K显示器，完美适配所有设备尺寸
- 🎯 **触摸优化**: 手势操作、滑动菜单、长按交互，移动端体验媲美原生APP
- ⚡ **性能优先**: 首屏加载<1s，交互响应<100ms，Lighthouse评分90+

#### 智能交互体验
- 🔔 **Toast通知系统**: 统一的消息提示，支持成功/错误/警告/信息四种类型
- 💾 **自动数据同步**: 跨设备同步搜索历史、收藏夹、个人设置
- 🎨 **主题定制**: 亮色/暗色/跟随系统，一键切换，状态持久化
- ⌨️ **快捷键支持**: 常用操作支持键盘快捷键，提升操作效率

## 🎯 核心功能

### 1. 🔍 智能搜索系统

#### 多源聚合搜索
- **一键聚合**: 输入关键词，同时搜索多个搜索引擎，结果统一展示
- **智能排序**: 根据搜索源优先级、使用频率、可用状态智能排序结果
- **分类筛选**: 支持按主分类（磁力/网盘/影视等）和子分类筛选搜索源
- **历史记录**: 自动保存搜索历史，支持快速重搜和历史统计

#### 搜索建议与热门
- **智能提示**: 输入关键词时自动提示相关搜索建议
- **热门搜索**: 实时展示热门搜索关键词，发现热门资源
- **搜索统计**: 个人搜索统计，了解自己的搜索习惯

#### 搜索源管理
- **启用/禁用**: 自由控制哪些搜索源参与搜索
- **优先级调整**: 自定义搜索源的显示顺序
- **状态监控**: 实时查看搜索源可用性状态
- **自定义添加**: 支持添加自定义搜索源（URL模板）

### 2. 👤 用户系统

#### 认证与安全
- **多种登录方式**: 支持用户名或邮箱登录、GitHub OAuth 第三方登录
- **GitHub OAuth**: 一键使用 GitHub 账号登录，自动创建/关联账号
- **JWT Token认证**: 无状态认证，支持Token自动刷新
- **登录保护**: 连续失败5次自动锁定15分钟
- **会话管理**: 查看活跃会话，支持强制登出

#### 邮箱验证流程
- **注册验证**: 可选/强制邮箱验证注册
- **密码重置**: 通过邮箱验证码安全重置密码
- **邮箱更改**: 双邮箱验证确认，安全更改绑定邮箱
- **账户删除**: 邮箱验证确认后才能删除账户

#### 个人数据管理
- **收藏夹**: 收藏常用搜索结果，支持分类管理
- **搜索历史**: 自动记录搜索历史，支持清空和删除
- **数据同步**: 跨设备同步收藏、历史、设置
- **数据导出**: 支持导出个人数据（JSON格式）

### 3. 👥 社区功能

#### 搜索源分享
- **分享搜索源**: 将自己发现的好用搜索源分享给社区
- **标签管理**: 为搜索源添加标签，方便分类查找
- **审核机制**: 管理员审核后才能上架，保证质量

#### 互动功能
- **评论评分**: 对搜索源发表评价，帮助他人选择
- **点赞收藏**: 为优质搜索源点赞，收藏到个人列表
- **举报机制**: 发现违规内容可举报，管理员处理

#### 贡献统计
- **个人贡献**: 查看自己分享的搜索源数量、下载量、评分
- **社区排行**: 热门分享、活跃贡献者排行

### 5. 📝 用户反馈

#### 反馈提交
- **多种反馈类型**: 问题反馈、优化建议、其他
- **匿名支持**: 未登录用户也可提交反馈
- **自动收集**: 自动记录页面URL、浏览器信息

#### 反馈管理
- **状态跟踪**: 查看反馈处理状态（待处理/处理中/已解决/已关闭）
- **邮件通知**: 反馈处理完成后自动发送邮件通知
- **历史记录**: 查看自己的反馈历史

#### 管理员功能
- **反馈列表**: 分页查询、多条件筛选、搜索
- **统计面板**: 各状态、类型、优先级统计
- **处理回复**: 修改状态、优先级、添加回复
- **邮件通知**: 处理完成后发送邮件通知用户

### 6. 🛠️ 管理员功能

#### 用户管理
- **用户列表**: 分页查询、搜索筛选、状态查看
- **角色权限**: 四级角色（超级管理员/管理员/用户/访客）
- **状态控制**: 启用/禁用用户账户
- **登录日志**: 查看用户登录记录和IP信息

#### 内容管理
- **搜索源管理**: 增删改查系统搜索源和分类
- **社区审核**: 审核用户分享的搜索源
- **举报处理**: 处理用户举报内容

#### 系统监控
- **仪表盘**: 一览系统运行状态、用户活跃度
- **趋势分析**: 用户增长、搜索趋势、活跃度变化
- **行为日志**: 用户操作行为记录和分析
- **配置管理**: 动态修改系统配置，无需重新部署

### 7. 📊 JAV榜单功能

#### 多维度榜单
- **有码精选**: JavBus首页前3页随机20条
- **无码精选**: 无码专区前3页随机20条
- **高清榜单**: 高清分类前3页随机20条
- **字幕榜单**: 字幕分类前3页随机20条
- **随机类别**: 随机10个类别，每个类别12条
- **随机女优**: 随机10个女优，每个女优12条

#### 智能推荐
- **番号建议**: 输入关键词自动匹配番号
- **数据来源**: 支持多数据源聚合展示
- **登录可见**: 需要用户登录认证后才能访问

## 🏗️ 技术栈概览

```
┌─────────────────────────────────────────────────────────┐
│                    前端层 (v2.0.0)                      │
│  • React 18.3.1 + TypeScript 5.5.3                      │
│  • Vite 5.4.1 构建工具                                   │
│  • Tailwind CSS 3.4.11 样式框架                         │
│  • Zustand 4.5.5 状态管理                                │
│  • React Router 6.26.2 路由管理                         │
│  • 部署：Cloudflare Pages                               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  后端服务层 (v2.0.0)                     │
│  • Hono 4.6.0 框架 (轻量级Web框架)                       │
│  • TypeScript 5.5.3 类型安全                            │
│  • Cloudflare Workers (边缘计算)                        │
│  • Cloudflare D1 (SQLite 数据库)                        │
│  • JWT Token 认证 (jose 5.9.0)                          │
│  • Resend 邮件服务                                      │
└─────────────────────────────────────────────────────────┘
```

👉 [查看完整架构设计](docs/backend-frontend-tree.md)

## 🚀 快速开始

### 环境要求

- **Node.js**: >= 20.0.0
- **Cloudflare账户**: 用于部署Workers和D1数据库
- **Wrangler CLI**: Cloudflare开发工具 (>= 3.78.0)

### 快速部署

```bash
# 克隆项目
git clone https://github.com/Zoroaaa/codeseek.git
cd codeseek

# 后端部署
cd backend && npm install && npm run deploy

# 前端部署
cd frontend && npm install && npm run build && wrangler pages deploy dist
```

👉 [查看详细部署指南](docs/deploy.md)  
👉 [查看配置说明](docs/config.md)

👉 [查看完整API文档](docs/api/index.md)

## 📊 性能优化

### 前端性能优化
- ✅ React 18 并发特性 + Vite 快速构建
- ✅ 代码分割，路由级别懒加载，Tree-shaking
- ✅ Zustand 持久化状态 + API 响应缓存
- ✅ React.memo 和 useMemo 优化重渲染

### 后端性能优化
- ✅ Cloudflare 全球边缘节点就近处理
- ✅ 数据库索引优化 + 参数化查询
- ✅ 响应压缩 (gzip/brotli) + 批量操作支持
- ✅ 请求限流 + 并发控制 + 降级策略

## 🔒 安全特性

### 前端安全
- ✅ XSS 防护 + CSRF 保护
- ✅ 内容安全策略 (CSP) + 子资源完整性 (SRI)
- ✅ JWT Token 认证 + 请求签名验证

### 后端安全
- ✅ JWT Token 认证 (jose库) + RBAC 权限控制
- ✅ SQL 注入防护 + 密码加密存储 (bcrypt)
- ✅ 登录失败锁定机制 + 安全事件日志
- ✅ CORS 配置 + 速率限制 + IP 记录

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源协议。

### 许可说明

您可以自由地：
- ✅ **使用** - 用于任何目的，包括商业用途
- ✅ **修改** - 修改源代码以适应您的需求
- ✅ **分发** - 分享项目或其修改版本
- ✅ **私有使用** - 在私有项目中使用

但您必须：
- 📋 **保留版权声明** - 保留原始版权声明和许可证文本
- 📝 **声明修改** - 说明对源代码所做的修改

免责声明：
- ⚠️ **无担保** - 软件按"原样"提供，不提供任何形式的担保
- 🚫 **无责任** - 作者不对使用软件造成的任何损害负责

## 🙏 致谢

### 技术平台
- **[Cloudflare](https://www.cloudflare.com/)** - 提供优秀的边缘计算平台
- **[GitHub](https://github.com/)** - 代码托管和协作平台
- **[Resend](https://resend.com/)** - 邮件发送服务

### 开源社区
感谢所有为开源社区做出贡献的开发者们！

### 特别感谢
- 所有提交 Issue 和 PR 的贡献者
- 使用并反馈问题的用户们
- 分享和推广项目的朋友们

## 📧 联系与支持

### 官方渠道
- 🏠 **项目主页**: [GitHub - CodeSeek](https://github.com/Zoroaaa/codeseek)
- 🐛 **问题反馈**: [GitHub Issues](https://github.com/Zoroaaa/codeseek/issues)
- 💬 **功能建议**: [GitHub Discussions](https://github.com/Zoroaaa/codeseek/discussions)
- 📖 **项目文档**: [在线文档](https://zread.ai/Zoroaaa/codeseek)

### 如何贡献
我们欢迎各种形式的贡献：
- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码
- 🌍 翻译文档

#### 贡献步骤
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 支持项目
如果这个项目对您有帮助，请考虑：
- ⭐ 给项目点个 Star
- 🔄 分享给更多的人
- 💖 成为贡献者

---

<div align="center">

### ✨ 感谢您使用磁力快搜！ ✨

<p>⭐ 如果这个项目对你有帮助，请给我们一个Star！ ⭐</p>
<p>💪 欢迎加入我们的开源社区，一起改进和发展！ 💪</p>

**让搜索更简单，让体验更美好！**

Made with ❤️ by [Zoro](https://github.com/Zoroaaa)

</div>
