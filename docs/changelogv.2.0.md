# CodeSeek 版本 2.0 变更日志

> 📖 [返回项目主页](../readme.md) | [API接口文档](api/index.md) | [架构设计文档](backend-frontend-tree.md) | [配置说明文档](config.md) | [部署指南文档](deploy.md)

本文档详细记录CodeSeek从版本1.0升级到版本2.0的所有变更内容。

---

## 目录

- [概述](#概述)
- [变更统计](#-变更统计)
- [前端变更](#-前端变更)
- [后端变更](#-后端变更)
- [依赖变更](#-依赖变更)
- [数据库变更](#️-数据库变更)
- [迁移指南](#-迁移指南)
- [升级收益](#-升级收益)
- [版本时间线](#-版本时间线)
- [v2.0 最新更新](#-v20-最新更新-2025-03)

---

## 概述

版本2.0是CodeSeek项目的重大架构升级版本，主要变化包括：

- **前端技术栈升级**: 从原生ES6 JavaScript迁移到React 18.3.1 + TypeScript 5.5.3
- **后端技术栈升级**: 从原生JavaScript迁移到Hono 4.6.0 + TypeScript 5.5.3
- **构建工具引入**: 使用Vite 5.4.1进行现代化构建
- **类型安全**: 全面引入TypeScript类型系统
- **状态管理**: 引入Zustand 4.5.5状态管理库
- **样式方案**: 从原生CSS迁移到Tailwind CSS 3.4.11
- **数据库优化**: 模块化SQL文件结构，从8个文件优化为7个文件
- **安全增强**: 完整的邮箱验证、安全锁定、登录失败锁定机制

---

## 📊 变更统计

| 类别 | 版本1.0 | 版本2.0 | 变化 |
|------|---------|---------|------|
| 前端技术栈 | 原生ES6 JS | React 18.3.1 + TS 5.5.3 | 完全重构 |
| 后端技术栈 | 原生JS | Hono 4.6.0 + TS 5.5.3 | 框架升级 |
| 构建工具 | 无 | Vite 5.4.1 | 新增 |
| 类型系统 | 无 | TypeScript 5.5.3 | 新增 |
| 状态管理 | 自定义Store | Zustand 4.5.5 | 重构 |
| 样式方案 | 原生CSS | Tailwind CSS 3.4.11 | 重构 |
| 路由管理 | 无 | React Router 6.26.2 | 新增 |
| 数据库模块 | 8个 | 7个 | 优化整合 |
| 预置搜索源 | ~20个 | 50+ | 大幅增加 |

---

## 🚀 前端变更

### 技术栈升级

#### 版本1.0
```
- 核心: 原生JavaScript ES6+ 模块化
- 样式: CSS3 + 响应式设计
- 存储: LocalStorage + IndexedDB
- 部署: Cloudflare Pages
```

#### 版本2.0
```
- 核心: React 18.3.1 + TypeScript 5.5.3
- 构建: Vite 5.4.1
- 样式: Tailwind CSS 3.4.11
- 状态: Zustand 4.5.5
- 路由: React Router 6.26.2
- 图标: Lucide React 0.441.0
- 日期: date-fns 3.6.0
- 部署: Cloudflare Pages
```

### 目录结构变化

#### 版本1.0 前端结构
```
frontend/
├── dashboard.html
├── index.html
├── css/
│   ├── core/
│   ├── components/
│   ├── pages/
│   └── utils/
├── src/
│   ├── core/
│   │   ├── constants.js
│   │   ├── config.js
│   │   └── proxy-config.js
│   ├── utils/
│   ├── services/
│   ├── components/
│   └── pages/
└── images/
```

#### 版本2.0 前端结构
```
frontend/
├── index.html
├── public/
│   ├── _headers
│   └── _redirects
├── src/
│   ├── components/
│   │   ├── layout/
│   │   └── ui/
│   ├── hooks/
│   ├── pages/
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── community/
│   │   └── dashboard/
│   ├── services/
│   │   ├── api/
│   │   └── proxy/
│   ├── stores/
│   ├── types/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── images/
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

### 主要变更点

#### 1. 组件化架构
- **版本1.0**: 使用模块化函数和类
- **版本2.0**: 使用React函数组件和Hooks

**示例对比:**

版本1.0 (search.js):
```javascript
export class SearchManager {
  constructor(container) {
    this.container = container;
    this.init();
  }
  
  init() {
    this.render();
    this.bindEvents();
  }
  
  render() {
    this.container.innerHTML = `...`;
  }
}
```

版本2.0 (MainSearchPage.tsx):
```typescript
export function MainSearchPage() {
  const [keyword, setKeyword] = useState('');
  const { search, isLoading } = useSearch();
  
  const handleSearch = useCallback(() => {
    search(keyword);
  }, [keyword, search]);
  
  return (
    <div className="...">
      <Input value={keyword} onChange={setKeyword} />
      <Button onClick={handleSearch}>搜索</Button>
    </div>
  );
}
```

#### 2. 状态管理
- **版本1.0**: 自定义Store类，手动管理状态
- **版本2.0**: Zustand状态管理，自动持久化

**示例对比:**

版本1.0:
```javascript
class AuthStore {
  constructor() {
    this.user = null;
    this.token = null;
  }
  
  setUser(user) {
    this.user = user;
    localStorage.setItem('user', JSON.stringify(user));
  }
}
```

版本2.0 (authStore.ts):
```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user }),
    }),
    { name: 'auth-storage' }
  )
);
```

#### 3. 样式方案
- **版本1.0**: 原生CSS文件，手动管理样式
- **版本2.0**: Tailwind CSS，原子化样式

**示例对比:**

版本1.0 (CSS):
```css
.search-container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background-color: #fff;
}

.search-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
```

版本2.0 (Tailwind):
```typescript
<div className="flex flex-col p-5 bg-white">
  <input className="w-full p-3 border border-gray-300 rounded-lg" />
</div>
```

#### 4. 类型安全
- **版本1.0**: 无类型检查，运行时错误
- **版本2.0**: TypeScript编译时类型检查

**示例对比:**

版本1.0:
```javascript
function login(email, password) {
  return fetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}
```

版本2.0:
```typescript
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  data?: {
    user: User;
    token: string;
  };
  error?: ApiError;
}

async function login(request: LoginRequest): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(request)
  });
  return response.json();
}
```

---

## 🔧 后端变更

### 技术栈升级

#### 版本1.0
```
- 运行时: Cloudflare Workers
- 语言: JavaScript
- 路由: 自定义Router类
- 数据库: Cloudflare D1
- 认证: JWT (手动实现)
```

#### 版本2.0
```
- 运行时: Cloudflare Workers
- 框架: Hono 4.6.0
- 语言: TypeScript 5.5.3
- 数据库: Cloudflare D1
- 认证: JWT (jose 5.9.0)
- 邮件: Resend
```

### 目录结构变化

#### 版本1.0 后端结构
```
codeseek-backend/
├── src/
│   ├── index.js
│   ├── router.js
│   ├── middleware.js
│   ├── utils.js
│   ├── constants.js
│   ├── handlers/
│   │   ├── auth.js
│   │   ├── community.js
│   │   ├── search-sources.js
│   │   ├── system.js
│   │   └── user.js
│   └── services/
│       ├── services.js
│       ├── email-verification.js
│       └── search-sources-service.js
├── database/
├── package.json
└── wrangler.toml
```

#### 版本2.0 后端结构
```
backend/
├── src/
│   ├── index.ts
│   ├── constants.ts
│   ├── routes/
│   │   ├── admin.ts
│   │   ├── auth.ts
│   │   ├── community.ts
│   │   ├── config.ts
│   │   ├── search.ts
│   │   ├── sources.ts
│   │   ├── system.ts
│   │   └── user.ts
│   ├── services/
│   │   ├── index.ts
│   │   ├── email-verification.ts
│   │   └── search-sources-service.ts
│   ├── middleware/
│   │   ├── index.ts
│   │   └── auth.ts
│   ├── validation/
│   │   └── index.ts
│   ├── utils/
│   │   ├── index.ts
│   │   └── security.ts
│   └── types/
│       └── index.ts
├── package.json
├── tsconfig.json
├── eslint.config.js
└── wrangler.toml
```

### 主要变更点

#### 1. 框架迁移
- **版本1.0**: 自定义Router类处理路由
- **版本2.0**: Hono框架处理路由

**示例对比:**

版本1.0 (router.js):
```javascript
export class Router {
  constructor() {
    this.routes = new Map();
  }
  
  add(method, path, handler) {
    this.routes.set(`${method}:${path}`, handler);
  }
  
  async handle(request) {
    const url = new URL(request.url);
    const handler = this.routes.get(`${request.method}:${url.pathname}`);
    if (handler) {
      return handler(request);
    }
    return new Response('Not Found', { status: 404 });
  }
}
```

版本2.0 (index.ts):
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

app.route('/api/auth', authRoutes);
app.route('/api/user', userRoutes);
app.route('/api/search', searchRoutes);

export default app;
```

#### 2. 路由组织
- **版本1.0**: handlers目录，每个文件导出多个函数
- **版本2.0**: routes目录，每个文件导出Hono实例

**示例对比:**

版本1.0 (handlers/auth.js):
```javascript
export async function handleLogin(request) {
  const body = await request.json();
  // ...
}

export async function handleRegister(request) {
  const body = await request.json();
  // ...
}
```

版本2.0 (routes/auth.ts):
```typescript
import { Hono } from 'hono';

const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  // ...
  return c.json({ success: true, data: { user, token } });
});

authRoutes.post('/register', async (c) => {
  const body = await c.req.json();
  // ...
  return c.json({ success: true, data: { user, token } });
});

export { authRoutes };
```

#### 3. 中间件
- **版本1.0**: 手动实现中间件链
- **版本2.0**: Hono内置中间件

**示例对比:**

版本1.0 (middleware.js):
```javascript
export async function authMiddleware(request, next) {
  const token = request.headers.get('Authorization');
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const payload = verifyToken(token);
    request.user = payload;
    return next(request);
  } catch (error) {
    return new Response('Invalid Token', { status: 401 });
  }
}
```

版本2.0 (middleware/auth.ts):
```typescript
import { createMiddleware } from 'hono/factory';

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  try {
    const payload = await verifyToken(token);
    c.set('user', payload);
    await next();
  } catch (error) {
    return c.json({ success: false, error: 'Invalid Token' }, 401);
  }
});
```

#### 4. 类型定义
- **版本1.0**: 无类型定义
- **版本2.0**: 完整的TypeScript类型

**示例对比:**

版本1.0:
```javascript
async function getUser(userId) {
  const result = await db.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first();
  return result;
}
```

版本2.0:
```typescript
interface User {
  id: string;
  username: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}

async function getUser(userId: string): Promise<User | null> {
  const result = await db.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<User>();
  return result;
}
```

---

## 📦 依赖变更

### 前端依赖

#### 新增依赖
```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^4.5.5",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.441.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "tailwindcss": "^3.4.11",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "vite": "^5.4.1",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0"
  }
}
```

#### 移除依赖
- 无（版本1.0无npm依赖）

### 后端依赖

#### 新增依赖
```json
{
  "dependencies": {
    "hono": "^4.6.0",
    "jose": "^5.9.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.5.3",
    "wrangler": "^3.78.0"
  }
}
```

#### 移除依赖
- 无（版本1.0无npm依赖）

---

## 🗄️ 数据库变更

### 模块结构优化

版本2.0将数据库文件从8个优化整合为7个：

| 版本1.0 | 版本2.0 | 变化 |
|---------|---------|------|
| 01_user_management.sql | 01_schema_core.sql | 重命名，整合角色表 |
| 02_search_engine.sql | 02_schema_search.sql | 重命名 |
| 03_community.sql | 03_schema_community.sql | 重命名 |
| 04_search_source.sql | - | 合并到02 |
| 05_email_security.sql | 04_schema_security.sql | 重命名 |
| 06_system_analytics.sql | - | 合并到01 |
| 07_initialization_data.sql | 05_data_system.sql | 重命名 |
| 08_role_management.sql | - | 合并到01 |

### 新增数据表

- `roles` - 角色定义表（super_admin, admin, user, guest）
- `email_change_requests` - 邮箱更改请求表
- `user_security_events` - 用户安全事件表
- `email_send_logs` - 邮件发送日志表
- `email_templates` - 邮件模板表

### 安全功能增强

- 邮箱验证机制
- 登录失败锁定
- 安全锁定机制
- 邮箱更改流程
- 账户删除验证

---

## 🔄 迁移指南

### 前端迁移

1. **安装依赖**
```bash
cd frontend
npm install
```

2. **配置TypeScript**
```bash
# 创建tsconfig.json
# 配置类型定义
```

3. **迁移组件**
- 将JS模块转换为TSX组件
- 添加类型定义
- 使用React Hooks

4. **迁移样式**
- 将CSS转换为Tailwind类名
- 配置tailwind.config.js

5. **迁移状态管理**
- 将自定义Store转换为Zustand
- 配置持久化存储

### 后端迁移

1. **安装依赖**
```bash
cd backend
npm install
```

2. **配置TypeScript**
```bash
# 创建tsconfig.json
# 配置编译选项
```

3. **迁移路由**
- 将handlers转换为routes
- 使用Hono路由

4. **迁移中间件**
- 使用Hono中间件
- 配置CORS等

---

## 🎯 升级收益

### 开发体验
- ✅ 类型安全，减少运行时错误
- ✅ IDE智能提示，提高开发效率
- ✅ 热更新，快速预览更改
- ✅ 组件化开发，代码复用性高

### 代码质量
- ✅ TypeScript编译检查
- ✅ ESLint代码规范
- ✅ 更清晰的代码结构
- ✅ 更好的可维护性

### 性能优化
- ✅ Vite快速构建
- ✅ 代码分割
- ✅ Tree-shaking
- ✅ 按需加载

### 生态系统
- ✅ React生态系统支持
- ✅ 丰富的第三方库
- ✅ 活跃的社区支持
- ✅ 完善的文档

---

## 📅 版本时间线

| 版本 | 发布日期 | 主要变更 |
|------|---------|---------|
| v1.0 | 2024-10 | 初始版本，原生ES6架构 |
| v2.0 | 2025-03 | 架构重构，React + TypeScript |

---

## 🔧 v2.0 最新更新 (2025-03)

### 新增功能

#### 前端新增
- ✅ 新增 `contexts/ConfigContext.tsx` 配置上下文
- ✅ 新增 `pages/admin/ConfigTab.tsx` 系统配置管理页面
- ✅ 新增 `services/config.ts` 配置服务
- ✅ 新增 `types/notification.ts` 通知类型定义
- ✅ 新增 `utils/notificationTemplates.ts` 通知模板工具
- ✅ 新增 `docs/notification.md` 通知系统文档
- ✅ 新增 `components/feedback/FeedbackButton.tsx` 反馈浮动按钮组件
- ✅ 新增 `components/feedback/FeedbackModal.tsx` 反馈提交弹窗组件
- ✅ 新增 `services/api/feedback.ts` 反馈 API 客户端

#### 后端新增
- ✅ 新增 `services/config.ts` 配置服务
- ✅ 新增系统配置管理API
- ✅ 新增邮箱验证码限流机制
- ✅ 新增搜索源状态检查缓存
- ✅ 新增 `routes/github-oauth.ts` GitHub OAuth 第三方登录
- ✅ 新增 `routes/feedback.ts` 用户反馈系统
- ✅ 新增 `database/09_schema_feedback.sql` 用户反馈表结构

#### GitHub OAuth 模块
- ✅ 支持使用 GitHub 账号一键登录
- ✅ 自动创建新用户或关联已有账号
- ✅ CSRF 防护（state 参数 + HttpOnly Cookie）
- ✅ 记录安全事件日志
- ✅ 支持 GitHub 邮箱权限获取

#### 用户反馈模块
- ✅ 支持三种反馈类型：问题反馈、优化建议、其他
- ✅ 未登录用户也可提交反馈（需填写联系邮箱）
- ✅ 自动收集页面URL、浏览器信息
- ✅ 管理员反馈管理面板
- ✅ 反馈状态流转（待处理→处理中→已解决/已关闭）
- ✅ 优先级设置（低/普通/高/紧急）
- ✅ 处理完成后发送邮件通知用户
- ✅ 反馈统计面板

### 配置优化
- ✅ `wrangler.toml` 配置项大幅扩展，支持更多运行时配置
- ✅ 新增 `compatibility_flags = ["nodejs_compat"]` Node.js兼容性
- ✅ 新增 `observability` 监控配置
- ✅ 新增邮件发送频率限制配置
- ✅ 新增JWT有效期配置
- ✅ 新增搜索源状态检查配置
- ✅ 新增 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` GitHub OAuth 配置
- ✅ 新增 `BACKEND_URL` / `FRONTEND_URL` OAuth 回调地址配置

### 安全增强
- ✅ 邮箱验证码发送频率限制（每小时5次，每天20次）
- ✅ 验证码尝试次数限制（最多3次）
- ✅ 临时邮箱域名黑名单
- ✅ 可信邮箱域名白名单
- ✅ 安全事件监控阈值配置
- ✅ GitHub OAuth CSRF 防护（state 参数 + HttpOnly Cookie）
- ✅ OAuth state 有效期限制（10分钟）

### API 统计更新
- ✅ 新增 GitHub OAuth 接口（2个）
- ✅ 新增用户反馈接口（6个）
- ✅ API 总数从 134 个增加到 142 个

---

## 🙏 致谢

感谢所有参与版本2.0开发和测试的贡献者！

---

## 📞 反馈

如有问题或建议，请通过以下方式反馈：
- GitHub Issues: [https://github.com/Zoroaaa/codeseek/issues](https://github.com/Zoroaaa/codeseek/issues)
- 邮件: zoroasx@gmail.com
