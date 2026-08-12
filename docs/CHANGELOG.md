# Changelog

All notable changes to this project will be documented in this file.

## [v4.2.0] - 2026-08-12

### Added - 小说搜索 + 聚合视图 + 观测体系 + 多项增强 📚

本次版本核心亮点：新增小说搜索类别（第五大类），作品级资源归组聚合视图，Google OAuth 登录，前端错误监控自建观测系统，JAV 子搜索模式与女优推荐，播放器重构，安全限流升级。

---

#### 核心新功能（一）：小说搜索系统

- **Anna's Archive 集成**：接入 Anna's Archive 作为小说主数据源，支持图书元数据搜索
- **奇书网数据源**：新增奇书网搜索源，TXT 直链资源置顶展示
- **多域名故障转移**：搜索源支持多域名自动切换，提升可用性
- **图书描述**：搜索结果展示图书简介/描述信息
- **前端 NovelSearchResultPanel 组件**：独立的小说搜索结果面板

#### 核心新功能（二）：作品级资源归组聚合视图

- **作品维度归组**：搜索结果按作品（标题）维度归组聚合，同一作品的多源资源合并展示
- **聚合视图卡片**：简介整合到聚合视图卡片中，统一展示
- **Title Grouping 优化**：标题归组正则优化，移除不必要的转义字符

#### 核心新功能（三）：Google OAuth 登录

- **Google OAuth 登录**：支持 Google 账号一键登录，自动创建/关联账号
- **State Cookie 修复**：修复 Set-Cookie 合并导致 state cookie 未设置的问题

#### 核心新功能（四）：前端错误监控观测系统

- **自建观测系统**：前端错误监控自建观测体系，无需第三方依赖
- **系统错误列表**：管理后台新增系统错误列表（修复 prefer-const 与 any 类型）

#### 核心新功能（五）：JAV 搜索增强

- **子搜索模式**：JAV 搜索增加子搜索模式，支持更精准的搜索
- **番号格式校验**：输入番号格式校验，错误提示仅在输入框未聚焦时显示避免与搜索建议冲突
- **推荐女优栏目**：新增推荐女优栏目，支持爬取女优列表及详情番号
- **女优详情弹窗**：优化女优详情弹窗和搜索体验

#### 核心新功能（六）：播放器重构

- **WebTor 在线播放**：移除内嵌播放和 BTorrent，仅保留 WebTor 在线播放
- **PikPak 推荐提示**：弹窗增加 PikPak 推荐提示
- **复制磁力链接**：点击播放时弹窗提示并支持复制磁力链接

#### 核心新功能（七）：安全与限流升级

- **D1 持久化限流**：改用 D1 持久化限流，支持多级限制
- **邮箱注册白名单**：增强邮箱注册白名单校验
- **搜索限流提示**：修复搜索限流错误提示，直接显示后端异常信息

#### 核心新功能（八）：品牌与 SEO 统一

- **品牌统一**：统一品牌名称为 Atlas 并优化 SEO 配置
- **PNG Favicon**：添加 PNG 格式 favicon 提升搜索引擎兼容性
- **Bing 站长工具**：添加 Bing 站长工具验证标签
- **域名统一**：清除 pages.dev 域名和旧域名 codeseek.pp.ua，统一替换为 atlas.wort.uk

#### 核心新功能（九）：搜索体验优化

- **搜索缓存层**：添加缓存层，修复 manga 建议接口超时
- **搜索建议简化**：简化搜索建议逻辑，删除子类选择功能
- **历史 Fallback**：Provider 返回空数组时 fallback 到数据库历史
- **建议下拉框修复**：提升搜索建议下拉框层级并恢复不透明背景，修复下层内容穿透
- **JavProvider 建议**：恢复 JavProvider suggestions/trending，为 MangaProvider 补充 suggestions

#### 核心新功能（十）：UI 布局优化

- **公告横幅独立置顶**：公告通知独立为全局顶栏，跨所有标签页可见
- **快捷入口面板**：右栏接入快捷入口（搜索源管理、系统设置、社区、管理后台）
- **导航栏精简**：去掉"更多"菜单，sources 入口移至快捷入口

### Improved - 性能与稳定性 ⚡

- **搜索缓存**：减少重复请求，提升响应速度
- **多域名故障转移**：搜索源可用性提升
- **限流持久化**：D1 持久化限流，多级精细控制

### Fixed - 问题修复 🔧

- 修复 JAV 搜索崩溃问题 - 移除错误的面板兜底逻辑
- 修复漫画搜索崩溃 - 移除错误的历史记录字段写入并隔离错误影响
- 修复会话设备始终显示 Mozilla/5.0 的问题
- 修复 Google OAuth Set-Cookie 合并导致 state cookie 未设置
- 修复 /public 端点未登录访问首页 401 的问题
- 修复管理后台系统错误列表的 prefer-const 与 any 类型
- 修复搜索建议下拉框背景穿透问题

### Technical Details

- **新增文件**：
  - `frontend/src/components/search/NovelSearchResultPanel.tsx` — 小说搜索结果面板
  - `frontend/src/components/search/AnnouncementBar.tsx` — 公告横幅组件
  - `frontend/src/components/search/QuickActionsPanel.tsx` — 快捷入口面板
  - `backend/src/providers/novel-provider.ts` — 小说 Provider
  - `backend/src/services/novel-search.ts` — 小说搜索业务逻辑
  - `backend/src/routes/github-oauth.ts` — GitHub OAuth 路由
  - `backend/src/routes/google-oauth.ts` — Google OAuth 路由
- **修改文件**：
  - `frontend/src/pages/MainSearchPage.tsx` — 公告横幅置顶、快捷入口面板
  - `frontend/src/components/layout/UnifiedNavBar.tsx` — 导航栏精简
  - `frontend/src/config/tabs.ts` — 新增小说类别
  - `frontend/src/config/resultPanels.tsx` — 小说结果面板配置
  - `backend/src/index.ts` — 注册 novel Provider
  - `backend/src/routes/search.ts` — 支持 novel category
  - `backend/src/utils/rate-limit.ts` — D1 持久化限流
  - `backend/src/utils/security.ts` — 邮箱白名单校验
  - `backend/src/middleware/auth.ts` — /public 端点修复

---

## [v4.1.0] - 2026-07-17

### Added - 漫画搜索 + 架构优化 🎨

本次版本核心亮点：新增漫画搜索类别，架构全面优化为可扩展模式。

---

#### 核心新功能（一）：漫画搜索系统

- **漫画元数据搜索**：
  - MangaDex API 集成：标题、封面、评分、标签、作者、状态
  - 13个搜索源聚合：MangaDex、MangaFire、MangaReader、MangaHere 等
  - 前端 MangaSearchResultPanel 组件（~400行）
  - 收藏/复制链接/外链跳转

#### 核心新功能（二）：架构可扩展性改造

- **单一数据源模式**：
  - 多数据源并行查询改为单一主数据源 + 多搜索源辅助
  - 数据一致性保证、性能提升、缓存策略简化

- **Pinned 机制**：
  - 用户可标记常用搜索源
  - 搜索源列表顶部显示固定源（带📌标记）
  - 一键固定/取消固定（仅登录用户）
  - 固定状态持久化

- **查表式渲染**：
  - 搜索结果渲染从硬编码改为配置驱动
  - 新增类别只需添加配置项，无需修改渲染逻辑

#### 核心新功能（三）：图片代理统一

- 所有外部图片统一通过后端代理
- 漫画封面新增 `category=manga` 参数
- 缓存策略优化（按类别区分）
- 防盗链绕过统一处理

#### 核心新功能（四）：导航栏自适应布局

- **桌面端**：顶部固定导航栏（Logo + 四大类别 + 搜索 + 用户）
- **移动端**：底部固定导航栏（首页 + 四大类别 + 更多）
- **自适应**：根据屏幕宽度自动切换布局
- **新增入口**：漫画搜索入口（桌面端顶部、移动端底部）

#### 核心新功能（五）：数据库整理

- 新增高频查询索引（15个）
- 所有时间字段统一为 `INTEGER` (Unix 时间戳)
- 所有状态字段统一为 `TEXT` (枚举值)
- 所有 JSON 字段增加 `DEFAULT '{}'`

### Improved - 性能与稳定性 ⚡

- **MangaDex API 优化**：限额控制（每分钟 5 次）
- **搜索源超时保护**：100ms ~ 5000ms 响应时间控制
- **索引性能提升**：25 个高频查询索引

### Technical Details

- **新增文件**：
  - `frontend/src/components/search/MangaSearchResultPanel.tsx` — 漫画搜索结果面板
  - `frontend/src/types/manga.ts` — 漫画相关类型定义
  - `backend/src/providers/manga-provider.ts` — 漫画 Provider（2 个分类）
  - `backend/src/services/manga-search.ts` — 漫画搜索业务逻辑
  - `backend/src/routes/manga.ts` — 漫画相关路由
- **修改文件**：
  - `frontend/src/pages/SearchPage.tsx` — 增加 manga category、导航栏优化
  - `frontend/src/components/search/SearchForm.tsx` — 支持漫画搜索
  - `frontend/src/components/layout/MainLayout.tsx` — 导航栏自适应布局
  - `frontend/src/components/layout/MobileBottomNav.tsx` — 移动端底部导航栏新增漫画入口
  - `frontend/src/services/api/search.ts` — 漫画搜索 API
  - `frontend/src/utils/image-proxy.ts` — 图片代理统一
  - `backend/src/index.ts` — 注册 manga Provider
  - `backend/src/routes/search.ts` — 支持 manga category
  - `backend/src/routes/sources.ts` — 支持 pinned 过滤、固定/取消固定接口
  - `backend/src/services/search-sources-service.ts` — pinned 机制实现
  - `backend/src/services/image-proxy.ts` — 漫画封面代理支持

---

## [v4.0.0] - 2026-06-17

### Added - 动漫 & 影视搜索 + 架构升级 🎬

本次版本核心亮点：从单一的 JAV 搜索引擎升级为三大类别聚合搜索引擎，架构全面重构。

---

#### 核心新功能（一）：动漫搜索系统

- **数据源**：Bangumi API（番剧元数据）+ Mikan Project（字幕组）+ Nyaa.si（种子）+ ShowRSS（订阅）
- **前端组件**：AnimeSearchResultPanel（~500行）
  - Bangumi 信息卡（封面、评分、标签云）
  - Mikan 字幕组列表
  - Nyaa 磁力卡片（可信标记、HD 标记、做种数颜色编码）
  - 收藏/复制磁力/外链跳转

#### 核心新功能（二）：影视搜索系统

- **数据源**：TMDB API（影视元数据）+ YTS（电影种子）+ EZTV（剧集种子）+ TPB（兜底磁力）
- **前端组件**：MovieSearchResultPanel（~450行）
  - TMDB 海报卡片（评分、上映日期、简介）
  - 资源列表（来源徽章、画质标签）
  - 季/集选择器（仅剧集）

#### 核心新功能（三）：三层搜索架构

- **层级定义**：
  - Layer 1: `category`（搜索大类：anime/movie/jav）
  - Layer 2: `classification`（搜索分类：bangumi/tmdb/...）
  - Layer 3: `source`（具体源实例：Bangumi API/TMDB API/...）

#### 核心新功能（四）：Provider 注册模式

- 新增可扩展的 Provider 架构
- 新增类别只需创建 Provider + 注册一行代码
- 分类间搜索逻辑完全隔离

### Changed - 架构改进 ⚙️

- **数据库变更**：
  - `search_sources` 表新增 `category` / `classification` 字段
  - `history` 表新增 `category` / `cover_image` 字段
  - 新增 anime/movie 类别搜索源数据
- **共享类型包**：`packages/shared` 统一前后端类型
- **图片代理统一**：所有外部图片统一走后端代理

### Breaking Changes

- 搜索接口参数变更：`category` 和 `classification` 从可选变为必填
- 搜索历史响应新增 `category` / `classification` / `coverImage` 字段

---

## [v3.1.0] - 2026-05-13

### Added - Monorepo 共享包 + 安全加固 + 性能优化 📦

本次版本核心亮点：创建 Monorepo 共享包，消除前后端重复代码，大幅提升代码质量。

---

#### 核心新功能（一）：Monorepo 共享包

- **packages/shared 创建**：统一类型定义和工具函数
- **单源验证规则**：VALIDATION_RULES 从 shared 导入
- **camelizeKeys 工具**：snake_case → camelCase 自动转换

#### 核心新功能（二）：安全性加固

- **生产 Source Map 关闭**：防止源代码暴露
- **CI 门禁**：部署前强制 typecheck + lint

#### 核心新功能（三）：性能优化

- **数据库索引**：25 个高频查询索引
- **构建脚本优化**：`tsc --noEmit && vite build`

### Technical Details

- **新增文件**（14个）：
  - `packages/shared/` — 共享包目录（14个文件）
  - `database/12_index_performance.sql` — 数据库索引迁移
- **修改文件**（12个）：
  - 前后端类型文件改为从 shared 导入
  - CI 配置新增检查步骤
  - 构建脚本优化

---

## [v3.0.0] - 2026-05-13

### Added - 安全性重大升级 + 数据模型扩展 🔐

本次版本核心亮点：密码安全升级（SHA-256 → PBKDF2），JAV 元数据支持，收藏状态管理。

---

#### 核心新功能（一）：密码安全升级

- **PBKDF2-SHA256 哈希**：100,000次迭代 + 随机盐值
- **向后兼容验证**：自动识别新旧格式
- **Token 哈希分离**：密码和 Token 使用不同哈希策略

#### 核心新功能（二）：数据模型扩展

- **收藏项元数据增强**（8个字段）：code/cover/actors/duration/tags/release_date/publisher/magnet_link
- **搜索历史元数据增强**（9个字段）
- **收藏状态管理**：want ↔ watched 状态切换

#### 核心新功能（三）：前端体验优化

- **收藏面板重构**：卡片式布局 + 封面图展示 + 元数据显示
- **搜索历史面板增强**：列表视图 + 元数据展示
- **ProxyImage 组件**：图片代理统一

### Changed - 架构改进 ⚙️

- **Zod 数据验证**：全面引入 Zod 4.4.3
- **CORS 策略强化**：正则匹配域名
- **认证中间件统一**：消除重复代码

### Technical Details

- **新增文件**（3个）：
  - `backend/src/utils/validators.ts` — Zod Schema 定义
  - `database/10_schema_favorites_extend.sql` — 收藏表增量迁移
  - `database/11_schema_search_history_extend.sql` — 历史表增量迁移
- **修改文件**（30个）：前后端核心文件重构

---

## [v2.0.0] - 2025-03

### Added - 架构重构 + 技术栈升级 🚀

本次版本核心亮点：从原生 ES6 架构全面重构为 React + TypeScript 现代化技术栈。

---

#### 核心新功能（一）：前端技术栈升级

- **React 18.3.1 + TypeScript 5.5.3**：组件化架构
- **Vite 5.4.1**：现代化构建工具
- **Tailwind CSS 3.4.11**：原子化样式
- **Zustand 4.5.5**：状态管理
- **React Router 6.26.2**：路由管理

#### 核心新功能（二）：后端技术栈升级

- **Hono 4.6.0 + TypeScript 5.5.3**：框架升级
- **JWT (jose 5.9.0)**：标准化认证
- **Resend**：邮件服务

#### 核心新功能（三）：安全增强

- **邮箱验证机制**：6位验证码
- **登录失败锁定**：连续失败5次自动锁定15分钟
- **GitHub OAuth**：第三方登录
- **用户反馈系统**：问题反馈、优化建议

### Technical Details

- **变更统计**：35个文件修改，+1666行 / -596行
- **数据库优化**：8个文件整合为7个
- **预置搜索源**：从~20个增加到50+

---

## [v1.0.0] - 2024-10

### Added - 初始版本发布 🎉

CodeSeek 初始版本发布，基于原生 ES6 架构的 JAV 搜索引擎。

---

#### 核心功能

- **JAV 搜索**：DMM/FANZA 元数据聚合 + JavBus/JavDB 磁力搜索
- **用户系统**：注册、登录、收藏、历史记录
- **管理后台**：用户管理、搜索源管理、系统配置
- **Cloudflare 全栈部署**：Workers + D1 + Pages

---

**让搜索更简单，让体验更美好！**

Made with ❤️ by [Zoro](https://github.com/Zoroaaa) | Version 4.2.0 | 2026-08-12