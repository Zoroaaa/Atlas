# AGENTS.md — Atlas 协作规范

面向在本仓库工作的所有 AI coding agent。开始改代码前先读完本文件；用户当次指令与本文件冲突时，以用户指令为准。

## 1. 项目概览

Atlas 是开源聚合搜索引擎，覆盖 JAV / 动漫 / 影视 / 漫画 / 小说五类内容。

- 前端：React 19 + TypeScript + Vite + Tailwind CSS + React Router + Zustand + TanStack Query + i18next
- 后端：Hono + TypeScript，运行在 Cloudflare Workers；D1（SQLite）存业务数据，R2 存封面资源
- 部署形态：单个 Worker 同时托管 API 与前端静态资源（`frontend/dist`）
- 共享包：`@codeseek/shared`，提供前后端共用的类型、zod schema、校验常量
- 仓库：npm workspaces monorepo

## 2. 常用命令

所有命令默认在仓库根目录执行。安装依赖必须在根目录，子目录单独 `npm install` 会破坏 workspace 软链。

```bash
# 安装依赖（首次 / lockfile 变更后）
npm install

# 本地开发
npm run dev --workspace=frontend      # Vite dev server
npm run dev --workspace=backend       # wrangler dev（本地 D1）

# 类型检查（改完代码必跑）
npm run typecheck --workspace=frontend
npm run typecheck --workspace=backend

# Lint
npm run lint --workspace=frontend
npm run lint --workspace=backend

# 测试
npm run test:run --workspace=frontend # vitest 单次运行
npm run test --workspace=backend      # vitest run

# 构建
npm run build --workspace=frontend    # tsc --noEmit && vite build

# 部署后端（Worker 同时托管前端静态资源，部署前必须先构建 frontend/dist）
npm run deploy --workspace=backend
```

- 线上部署走 Cloudflare Workers Builds（push 触发）；`.github/workflows/backend-deploy.yml` 仅保留手动应急入口，不要新增并行自动部署流水线。
- 数据库脚本位于 `database/`，按编号顺序手动执行；编号只增不改，不允许重排或复用旧编号。

## 3. 仓库地图

| 路径 | 职责 | 边界 |
| --- | --- | --- |
| `frontend/src/components/search` | 搜索工作台、结果面板、本地库详情卡 | 只做展示与交互，数据请求走 hooks / services |
| `frontend/src/components/jav` | JAV 详情、榜单、女优、推荐等专用组件 | 复用共享片段，不复制详情逻辑 |
| `frontend/src/components/workbench` | 工作台通用原子组件（Panel / Chip / MediaCard 等） | 保持无业务耦合 |
| `frontend/src/components/layout` | 全局壳层、导航、布局 | 不写业务请求 |
| `frontend/src/hooks` | 跨组件状态与数据编排（react-query 封装） | 不直接写 SQL 或 DOM 结构 |
| `frontend/src/services/api` | 后端 API 封装、类型、zod 请求校验 | 不包含 UI 状态 |
| `frontend/src/stores` | Zustand 全局状态 | 只存客户端状态，服务端数据优先 react-query |
| `backend/src/routes` | HTTP 入口：认证、限流、参数校验、响应 | 不写 SQL，不内联 provider 细节 |
| `backend/src/services` | 业务编排、抓取、补全、推荐、排名 | 不直接拼 HTTP 响应 |
| `backend/src/providers` | 各类搜索 Provider（实现统一接口） | 新增类别只加 provider + 注册，不改路由分支 |
| `backend/src/repositories` | 所有 SQL 读写 | SQL 只允许出现在这里 |
| `backend/src/validation` | zod 请求 schema 入口 | 与 `@codeseek/shared` 保持一致 |
| `packages/shared` | 前后端共享类型、schema、校验常量 | 改这里等于改契约，必须前后端同时验证 |
| `database/` | D1 建表 / 迁移 / 种子脚本 | 只增编号，生产执行需用户手动操作 |

## 4. 架构约定

### 后端

- 路由只做：认证 → 限流 → 参数校验（zod / `validateBody`）→ 调用 service / repository → 返回统一响应。
- SQL 集中在 `repositories/*.ts`；路由与 service 不写裸 SQL。
- 搜索类别通过 `SearchProvider` 接口扩展：新类别实现接口并注册，不在 `routes/search.ts` 里写 if/else 分支。
- 缓存键必须区分数据敏感度：JAV / 小说等含用户上下文的结果使用用户级 key + `private` 缓存头；公共结果才可共享缓存。
- 所有写接口必须做输入校验，错误信息面向用户、使用中文。
- 外部抓取失败要区分「网络错误 / 超时」与「资源不存在」，不得把抓取失败当成番号不存在。

### 前端

- 服务端数据统一走 TanStack Query；跨路由共享的数据不要在组件里另起 `useState` 维护第二份。
- 表单与 URL 状态需要可刷新、可分享时，写入 query 参数（例如 JAV 搜索的 `sub`）。
- i18n 三种语言（`zh-CN` / `zh-TW` / `en`）必须同步新增 key，禁止只改中文。
- 组件优先复用 `components/workbench`、`components/jav/JavDetailShared` 等既有实现；同一逻辑不要在两处各写一份。
- 侧栏导航只有 `components/layout/workspaceNav.tsx` 一处数据源：桌面 `AppShell` 与移动端 `AdminPanelLayout` 都从它派生。新增菜单只改这一处，禁止在组件内另存同语义列表（历史上因双份数据导致桌面端漏掉入口）。
- 样式使用 Tailwind 原子类与既有设计 token；不要用 `overflow: hidden` 掩盖布局问题。

## 5. 代码风格

- TypeScript 严格模式；不使用 `any` 兜底，确需时写 `unknown` + 类型收窄。
- 命名：组件 PascalCase；函数 / 变量 camelCase；常量 UPPER_SNAKE_CASE；类型 / 接口 PascalCase。
- 导入顺序：第三方 → `@/` 别名 → 相对路径；类型导入使用 `import type`。
- 单文件职责单一；新增逻辑优先拆模块，不无限扩写超长文件。
- 不引入新依赖，除非现有依赖无法完成且已向用户说明理由。
- 不为了「统一」而重排无关代码、改格式或改命名；一次改动只解决一个问题。

## 6. 注释规范（强制）

注释的目标是让下一个接手的人（或 agent）理解**为什么这样做、有哪些约束、哪里容易踩坑**。代码本身负责表达「做了什么」。

### 6.1 总体原则

1. 解释原因与约束，不复述代码。
2. 只描述当前实现，不写变更历史、作者、日期。
3. 注释必须与代码同步；发现注释与实现不符时，以代码为准修正或删除，禁止保留错误注释。
4. 宁可少写，也不写无信息量的注释。
5. 注释语言统一为中文；专有名词、API 名称、错误码保留原文。

### 6.2 文件头

每个主要源码文件顶部使用 JSDoc 块，说明职责与关键约束。不超过 5 行。

```ts
/**
 * 搜索历史仓储：只负责 search_history 表的 SQL 读写。
 *
 * 约束：所有查询必须带 user_id，避免跨用户数据泄漏。
 */
```

纯类型汇总、桶文件（`index.ts`）可只写一行职责说明。

### 6.3 导出符号

导出的函数、组件、Hook、类使用一句话 JSDoc 说明职责。仅在语义不直观时补充 `@param` / `@returns` / `@throws`，不要机械罗列所有参数。

```ts
/** 按番号回源 JavBus 并写回本地库；refresh=1 时跳过本地缓存。 */
export async function pullExternalDetail(code: string): Promise<void> { ... }
```

### 6.4 行内注释

在以下位置必须写注释：

- 魔数、阈值、时间窗口（例如「30 天重试间隔」「每小时最多 20 条」）
- 外部系统的怪癖、反爬、字段缺失、返回格式不一致
- 兼容逻辑与历史包袱（说明保留原因与移除条件）
- 并发、缓存、权限、数据隔离等约束
- 非直观的分支或多步状态流转

行内注释放在被解释代码上方，单独成行；极短的补充说明可以放行尾。`//` 后保留一个空格。

```ts
// JavDB 月榜只在标题为空或等于番号时才用 JavBus 补全，避免覆盖原有元数据
if (!record.title || record.title === record.code) { ... }
```

### 6.5 分区线

模块内大段逻辑使用单行分区注释，前后端统一为：

```ts
// ── 磁力列表 ─────────────────────────────────────────────
```

- 只用于划分文件内的逻辑区段（解析、请求、渲染、导出等），不要每个函数都加。
- 不使用上下成对的长横线或 `// =====` 方框；已有方框在同一文件内修正为单行分区线。

### 6.6 禁止事项

- 禁止复述代码：`// 设置 loading 为 true`、`// 返回结果`、`// 遍历数组`
- 禁止逐行注释简单 JSX / 纯赋值 / 明显的 getter
- 禁止保留被注释掉的旧代码（确认无用直接删除）
- 禁止无上下文的 `// TODO`；需要时写成 `// TODO(模块): 原因 + 触发条件`
- 禁止用注释掩盖命名或结构问题；能通过改名 / 拆函数解决的，不改用注释

### 6.7 示例

```ts
// ✅ 好：解释约束与原因
// 搜索源开关关闭后缓存仍在 10 分钟内有效，因此这里必须显式清 key
await invalidateSourceCache(sourceId);

// ❌ 差：复述代码
// 清除缓存
await invalidateSourceCache(sourceId);
```

## 7. 测试与验收

- 修改前端 / 后端后至少运行对应的 `typecheck` 与 `lint`。
- 涉及接口、状态、缓存、权限、搜索链路的改动，补充或更新测试，并运行相关测试文件。
- 提交前运行完整验证：前后端 `typecheck` / `lint`、前端 `build`、相关 `test`。
- 不允许删除、跳过或弱化测试来让流程通过；测试失败先定位根因。

## 8. Git 工作流

- 用户未明确要求时，不执行 `git commit`、`git push`、分支操作。
- 一个任务全部完成并经用户确认后，再做一条提交并统一推送；不要中途提交、拆分提交。
- 提交信息说明「为什么改」，一个提交只表达一个目的。
- 需要强推时只能使用 `--force-with-lease`，禁止 `--force`。

## 9. 边界与禁止事项

- 不修改 `node_modules/`、`dist/`、`.wrangler/`、构建产物与缓存目录。
- 不读取、不写入、不提交任何密钥：`.dev.vars`、`.env*`、token、证书。
- 不擅自执行数据库脚本或生产迁移；脚本写好并说明执行顺序，由用户手动执行。
- 不擅自改 CI/CD、部署配置、域名、D1 绑定；需要时先说明影响。
- 不顺手重构、不扩项、不修与当前任务无关的问题；发现风险先报告。
- 不提交调试代码、临时日志、`.tmp` / `.screenshots` 等本地产物。

## 10. 常见坑

- 子目录单独 `npm install` 会让 `@codeseek/shared` 解析失败；依赖统一在根目录安装。
- Worker 部署前未构建 `frontend/dist`，线上静态资源会缺失或停留在旧版本。
- D1 脚本编号已排到较大数字，新增脚本必须续编号，禁止改动已执行脚本。
- 修改搜索源开关、缓存键、推荐数量等常量的同时，要同步升级对应缓存 key 版本，否则旧缓存会返回旧结果。
- Service Worker 缓存规则必须排除系统配置与管理后台接口，避免配置修改后仍显示旧值。
