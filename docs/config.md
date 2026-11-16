# 配置说明

> 适用版本：v1.8.0+
> 配置分为三层：`backend/wrangler.toml` 的 `[vars]`（非敏感部署配置）、Cloudflare Secrets（敏感凭据）、D1 `system_config`（运行时动态配置）

---

## 一、配置分层

| 层级 | 位置 | 适用场景 | 修改后是否需要重新部署 |
|------|------|----------|------------------------|
| 部署配置 | `backend/wrangler.toml` → `[vars]` | 站点地址、发件人、功能默认值 | 是 |
| 敏感凭据 | `wrangler secret put` / 本地 `backend/.dev.vars` | JWT、OAuth、邮件 API Key | 是（Secrets 即时生效） |
| 运行时配置 | D1 `system_config` 表 | 注册开关、社区开关、限流与保留策略 | 否，管理后台即时生效 |
| 代码常量 | `backend/src/constants.ts` | CORS 白名单、上限、缓存 TTL | 是 |

---

## 二、部署配置（wrangler.toml）

`backend/wrangler.toml` 的 `[vars]` 中维护以下非敏感变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `APP_VERSION` | `1.8.0` | 版本号，`/api/system/version` 与前端显示使用 |
| `SITE_URL` | `https://atlas.wort.uk` | 站点主地址，邮件模板中的站点链接 |
| `FRONTEND_URL` | `https://atlas.wort.uk` | 前端地址，OAuth 完成后跳转目标 |
| `BACKEND_URL` | `https://atlas.wort.uk` | 后端地址，OAuth 回调与邮件退订链接 |
| `DEFAULT_FROM_EMAIL` | `noreply@mail.wort.uk` | Cloudflare 发件邮箱（需与 Cloudflare Email Sending 已 onboard 域名一致） |
| `DEFAULT_FROM_NAME` | `Atlas` | 默认发件人名称 |
| `JWT_EXPIRY_DAYS` | `30` | 登录令牌有效期（天） |
| `ENABLE_ACTION_LOGGING` | `true` | 是否记录用户行为日志 |
| `ENABLE_ALIAS_AI` | `0` | AI 别名候选旁路，默认关闭；开启需同时在 `wrangler.toml` 声明 `[ai]` 绑定 |
| `ALIAS_AI_MODEL` | `@cf/meta/m2m100-1.2b` | AI 别名候选使用的翻译模型（可选覆盖） |

> CORS 白名单不在环境变量中，位于 `backend/src/constants.ts` 的 `ALLOWED_ORIGINS`。新增前端域名后需要重新构建并部署后端。

---

## 三、敏感凭据（Secrets）

本地开发写入 `backend/.dev.vars`（已被 `.gitignore` 忽略）；生产环境使用 `wrangler secret put`。

```bash
cd backend
npx wrangler secret put JWT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAILTRAP_API_TOKEN
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put RANKINGS_IMPORT_SECRET
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | 是 | JWT 签名密钥，建议 32 字节以上随机字符串 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 是 | GitHub OAuth App |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 否 | Google OAuth，未配置时 Google 登录不可用 |
| `RESEND_API_KEY` | 否 | Resend API Key；配置后作为邮件服务商之一参与优先级排队 |
| `MAILTRAP_API_TOKEN` | 否 | Mailtrap Email Sending API Token；配置后作为邮件服务商之一参与优先级排队 |
| `MAILTRAP_API_URL` | 否 | Mailtrap 发送端点，默认 `https://send.api.mailtrap.io/api/send`；用 Sandbox 时改为 sandbox 地址 |
| `BREVO_API_KEY` | 否 | Brevo Transactional Email API Key；配置后作为邮件服务商之一参与优先级排队 |
| `RANKINGS_IMPORT_SECRET` | 否 | 机器同步共享密钥：JavDB 榜单导入（`/api/internal/rankings/import`）与关注动态即将发售（`/api/internal/follows/*`） |
| `TMDB_API_KEY` | 否 | TMDB 影视元数据增强；不配置时回退到搜索源聚合结果 |

> 搜索源以 D1 `search_sources` 为准，不需要 DMM/FANZA 的 API Key。

### 邮件服务商（Cloudflare / Resend / Mailtrap / Brevo）

`backend/wrangler.toml` 已声明 Cloudflare 邮件绑定：

```toml
[[send_email]]
name = "EMAIL"
```

四家服务商都可以同时配置，发送时按管理端优先级依次尝试。每家使用独立发件子域名，隔离发件域名信誉：

| 服务商 | 发件地址 | 发件域名验证位置 |
|---|---|---|
| Cloudflare | `noreply@mail.wort.uk`（`DEFAULT_FROM_EMAIL`） | Cloudflare 面板 |
| Resend | `noreply@resend.wort.uk` | Resend 后台 |
| Mailtrap | `noreply@mailtrap.wort.uk` | Mailtrap 后台 |
| Brevo | `noreply@brevo.wort.uk` | Brevo 后台 |


> 发件地址按服务商在代码中固定绑定，业务层不可覆盖，避免选错通道后使用未验证域名发信。

- `email_priority_cloudflare` / `email_priority_resend` / `email_priority_mailtrap` / `email_priority_brevo`：默认 `0 / -1 / -1 / -1`（调整阶段仅保留 Cloudflare），数值越小越优先，`-1` 表示停用。某家子域名验证完成后到管理端改回 `0`~`3` 即可启用。
- `email_daily_limit_cloudflare` / `email_daily_limit_resend` / `email_daily_limit_mailtrap` / `email_daily_limit_brevo`：默认每家 `100`，每天成功发送上限，`0` 表示不限额；达到上限自动切换到下一优先级。
- 某个服务商未配置凭据或发送失败时，也会继续尝试下一优先级；每日额度按 Asia/Shanghai 自然日统计。

各服务商准备：

- **Cloudflare**：在面板 **Compute → Email Service → Email Sending** 为发件域完成 onboard，`DEFAULT_FROM_EMAIL` 必须属于该域名。
- **Resend**：配置 `RESEND_API_KEY`，并确保子域名 `resend.wort.uk` 已在 Resend 验证。
- **Mailtrap**：配置 `MAILTRAP_API_TOKEN`，并确保子域名 `mailtrap.wort.uk` 已在 Mailtrap 验证；默认走 Transactional Stream。
- **Brevo**：配置 `BREVO_API_KEY`，并确保子域名 `brevo.wort.uk` 已在 Brevo 验证；走 Transactional Email API。

---

## 四、D1 数据库绑定

`backend/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "codeseek"
database_id = "<创建 D1 后返回的 database_id>"
```

- 建库：`npx wrangler d1 create codeseek`
- 全新库初始化见 [部署指南](./deploy.md)：按文件名顺序执行 `database/01_core.sql` → `database/13_seed_sources_novel.sql`（全部可重复执行）
- 本地开发使用 `--local`，生产使用 `--remote`，两者数据互不影响

---

## 五、OAuth 配置

### GitHub OAuth

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Homepage URL：`FRONTEND_URL`
3. Authorization callback URL：`${BACKEND_URL}/api/auth/github/callback`
4. 将 Client ID / Secret 写入 Secrets（见上）

### Google OAuth

1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
2. Authorized redirect URI：`${BACKEND_URL}/api/auth/google/callback`
3. 将 Client ID / Secret 写入 Secrets

> OAuth 回调域名必须与 `BACKEND_URL` 完全一致（协议、域名、端口均需匹配）。

---

## 六、JWT 与登录安全

- `JWT_SECRET` 至少 32 字节，轮换后所有已签发令牌立即失效
- 登录失败锁定读取 `system_config.max_login_attempts`（默认 5）与 `lockout_duration_ms`（默认 15 分钟）
- 锁定记录写入 `security_lockouts`，按 `identifier_hash` 匹配（手机号/邮箱/IP 统一哈希）
- 修改密码、找回密码成功后会使该用户全部已有会话失效

---

## 七、邮件配置

### Resend

1. 在 Resend 添加并验证发件域名
2. 配置 `RESEND_API_KEY`、`DEFAULT_FROM_EMAIL`、`DEFAULT_FROM_NAME`
3. 本地可用 Resend 测试地址，但只能发送到账号绑定邮箱

### 发送策略

- 事务邮件（注册验证码、找回密码、修改邮箱、反馈回复）不受通知偏好与退订控制
- 通知邮件（关注动态、社区互动、站点公告）受用户偏好控制；邮箱未验证时不能开启
- 用户每小时/每天发信上限由 `system_config.email_rate_limit_per_hour` / `email_rate_limit_per_day` 控制
- 所有发送结果写入 `email_send_logs`（类型、状态、用户、IP、限流键、错误信息）
- 通知摘要任务写入 `email_queue`，后台可查看 pending / sent / skipped / failed
- 发布公告时公告邮件入队；删除公告会清理对应的待发送任务
- 用户之后开启公告邮件时，会将最近 7 天内最多 20 条有效公告补发入队（按用户去重）
- 测试邮件入口：通知偏好页，限流为每人每分钟 1 次

### 退订

通知邮件底部包含带签名的退订链接，命中 `email_unsubscribe_tokens`；事务邮件不提供退订。

---

## 八、限流配置

| 场景 | 限制 |
|------|------|
| 搜索（档位 1 基础） | 5 次/分钟、40 次/小时、200 次/天 |
| 搜索（档位 2 活跃） | 6 次/分钟、60 次/小时、300 次/天 |
| 搜索（档位 3 常驻） | 7 次/分钟、100 次/小时、500 次/天 |
| 搜索（档位 4 核心） | 8 次/分钟、160 次/小时、800 次/天 |
| 搜索建议 | 30 次/分钟 |
| 热门关键词 | 20 次/分钟 |
| 推荐 | 30 次/分钟 |
| 标签推荐 | 30 次/分钟 |
| 标签作品 | 20 次/分钟 |
| 收藏操作 | 5 次/分钟 |
| 发帖 | 6 次/分钟、30 次/小时、100 次/天 |
| 评论 | 10 次/分钟、60 次/小时、300 次/天 |
| 点赞/收藏帖子 | 30 次/分钟、1000 次/天 |
| 举报 | 6 次/分钟、30 次/天 |
| 自定义标签 | 5 次/分钟、50 次/天 |
| 注册 | 每 IP 5 次/分钟、10 次/小时、20 次/天 |
| 测试邮件 | 1 次/分钟/用户 |

补充说明：

- 管理员账号跳过上述用户级限流（`checkIsAdmin`），与搜索接口一致。
- 未登录搜索/建议按 `CF-Connecting-IP` 计数，并使用档位 1 的配额。
- 搜索档位只升不降，判定条件为账号年龄 + 近 30 天活跃天数 + 累计搜索次数：
  - 活跃（L2）：注册满 7 天且近 30 天活跃 5 天
  - 常驻（L3）：注册满 30 天且近 30 天活跃 5 天
  - 核心（L4）：注册满 90 天、近 30 天活跃 5 天、累计搜索 500 次
- 超限统一返回 429，搜索接口同时带 `Retry-After` 头；前端配额弹层通过 `GET /api/search/quota` 展示各窗口用量与升级进度。
- 用户数据上限：收藏 1000 条、搜索历史 1000 条、关注女优 100 位。

档位规则定义在 `backend/src/services/search-tier.ts`：账号年龄、活跃天数、累计搜索次数满足条件后自动升级；档位数据在 `search_tier` 相关表中维护，每日刷新。

---

## 九、运行时配置（system_config）

管理后台 → 系统配置可修改以下键（`database/02_config.sql` 初始化）：

| 键 | 默认 | 说明 |
|----|------|------|
| `site_name` | `Atlas` | 站点名称 |
| `site_description` | `搜索全网资源，一步直达` | 站点描述 |
| `enable_registration` | `1` | 是否开放注册 |
| `community_enabled` | `1` | 是否启用社区（关闭后发帖/评论/举报接口返回不可用） |
| `max_login_attempts` | `5` | 最大登录失败次数 |
| `lockout_duration_ms` | `900000` | 锁定时长（毫秒） |
| `max_verification_attempts` | `5` | 验证码最大尝试次数 |
| `password_reset_max_attempts` | `5` | 找回密码最大尝试次数 |
| `password_reset_lockout_duration` | `3600000` | 找回密码锁定时长（毫秒） |
| `email_rate_limit_per_hour` | `5` | 每用户每小时发信上限 |
| `email_rate_limit_per_day` | `20` | 每用户每天发信上限 |
| `email_priority_cloudflare` / `_resend` / `_mailtrap` / `_brevo` | `0` / `-1` / `-1` / `-1` | 邮件服务商优先级，越小越优先，`-1` 停用（调整阶段仅 Cloudflare） |
| `email_daily_limit_cloudflare` / `_resend` / `_mailtrap` / `_brevo` | `100` | 服务商每日成功发送上限，`0` 不限额，达到后切换下一优先级 |
| `verification_code_expiry` | `900000` | 验证码有效期（毫秒） |
| `reset_password_code_expiry` | `1800000` | 找回密码验证码有效期（毫秒） |
| `password_reset_log_retention_days` | `30` | 找回密码日志保留天数 |
| `user_actions_retention_days` | `90` | 用户行为日志保留天数 |
| `security_event_retention_days` | `90` | 安全事件保留天数 |

> `is_public = 0` 的配置不会出现在公开接口中；非管理员读取敏感配置会被拒绝。

---

## 十、搜索源配置

搜索源完全由数据库驱动，不需要改代码：

| 层级 | 表 | 说明 |
|------|----|------|
| 大类 | `search_major_categories` | JAV / 动漫 / 影视 / 漫画 / 小说 |
| 分类 | `search_source_categories` | 资料站、在线播放、磁力、社区等 |
| 搜索源 | `search_sources` | `url_template` 使用 `{keyword}` 占位符 |

相关接口：

- `GET /api/search-sources/major-categories` — 大类列表
- `GET /api/search-sources/categories?majorCategoryId=<id>` — 分类列表
- `GET /api/search-sources` — 搜索源列表（非管理员仅返回公开项）

新增一个搜索类别（以 `novel` 为例）：

1. 在 `database/03_search_sources.sql` 追加大类/分类，在对应的 `database/09_seed_sources_*.sql` 追加搜索源（均使用 `INSERT OR IGNORE`）
2. 在前端 `frontend/src/constants.ts` 的 `SEARCH_CATEGORIES` 中添加对应配置
3. 在 `frontend/src/i18n/locales/{zh-CN,zh-TW,en}/*.ts` 补充三语文案
4. 重新执行对应分类文件：
   `npx wrangler d1 execute codeseek --remote --file=../database/03_search_sources.sql`
   `npx wrangler d1 execute codeseek --remote --file=../database/09_seed_sources_jav.sql`

---

## 十一、Monorepo 共享包解析

`@codeseek/shared` 的解析分两侧：

- **前端**：`frontend/tsconfig.json` 的 `paths` 与 `frontend/vite.config.ts` 的 `alias` 都直接指向 `packages/shared/src`，不依赖 `node_modules` 中的软链接。

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@codeseek/shared": ["../packages/shared/src/index.ts"],
      "@codeseek/shared/types": ["../packages/shared/src/types/index.ts"],
      "@codeseek/shared/utils": ["../packages/shared/src/utils/index.ts"]
    }
  }
}
```

```ts
resolve: {
  alias: {
    '@codeseek/shared/types': path.resolve(__dirname, '../packages/shared/src/types/index.ts'),
    '@codeseek/shared/utils': path.resolve(__dirname, '../packages/shared/src/utils/index.ts'),
    '@codeseek/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
  },
}
```

- **后端**：`packages/shared/package.json` 通过 `main` / `types` / `exports` 指向 `src`，由 npm workspaces 建立 `node_modules/@codeseek/shared` 链接；Wrangler/esbuild 打包时按 `exports` 解析。若该链接损坏，重新执行 `npm install`。

新增或修改共享类型后无需单独构建 `packages/shared`，前端即时生效；如果编辑器仍提示找不到模块，重启 TS Server 即可。

---

## 十二、推荐缓存

| 数据 | 缓存时长 | 位置 |
|------|----------|------|
| 推荐画像 | 5 分钟 | `backend/src/services/recommendation.ts` |
| 热度信号 | 1 小时 | `backend/src/services/hot-signals.ts` |
| JAV 榜单 / 热门女优 | 6 小时 | `backend/src/routes/jav.ts` |
| 收藏/历史统计 | 服务端聚合 | `backend/src/routes/user.ts` |
| 榜单数据 | 前端请求缓存 | `frontend/src/hooks/useJavRankings.ts` |

---

## 十三、配置验证

```bash
# 版本与公开站点配置（appVersion / siteName / allowRegistration / communityEnabled）
curl ${BACKEND_URL}/api/system/public-config

# 健康检查（含 version）
curl ${BACKEND_URL}/api/health

# 公开配置项（仅 is_public = 1）
curl ${BACKEND_URL}/api/config/public
```

日志排查：

```bash
cd backend
npx wrangler tail
npx wrangler d1 execute codeseek --remote --command "SELECT * FROM email_send_logs ORDER BY created_at DESC LIMIT 20"
npx wrangler d1 execute codeseek --remote --command "SELECT status, COUNT(*) FROM email_queue GROUP BY status"
```
