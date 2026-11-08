/**
 * CodeSeek 后端常量 — Layer 2: 代码固定值
 *
 * 职责：存放真正的"代码级固定值"——改了需要修改代码重新部署的内容。
 *
 * 三层架构职责边界：
 *   Layer 1 wrangler.toml  → 部署级基础设施参数（域名、邮件发件人、JWT策略）
 *   Layer 2 constants.ts   → 本文件：代码枚举/正则/固定业务逻辑/验证规则
 *   Layer 3 DB system_config → 运行期业务参数，管理后台可热改
 *
 * 判断标准：
 *   放这里  → 改了需要改代码逻辑（正则、枚举、黑白名单、验证规则）
 *   放 DB   → 管理员在后台调一下就能生效（功能开关、安全限制）
 */

export const CONFIG = {

  // ==================================================================
  // 默认域名配置 — 仅作为环境变量未设置时的 fallback
  // 实际部署时应在 wrangler.toml 中配置 FRONTEND_URL 和 BACKEND_URL
  // ==================================================================

  DEFAULT_URLS: {
    FRONTEND: 'https://atlas.wort.uk',
    BACKEND: 'https://atlasapi.wort.uk',
  },

  // ==================================================================
  // 固定枚举值 — 代码逻辑依赖，不可热改
  // ==================================================================

  // ==================================================================
  // 正则表达式 — 格式规则，改了需改验证逻辑
  // ==================================================================

  VALIDATION: {
    USERNAME_REGEX: /^[a-zA-Z0-9_]+$/,
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    VERIFICATION_CODE_REGEX: /^\d{6}$/,
  },

  // ==================================================================
  // 邮箱域名黑白名单 — 安全规则，不允许管理员在后台修改
  // ==================================================================

  TempEmail: {
    DOMAINS: [
      '10minutemail.com', 'guerrillamail.com', 'tempmail.org', 'temp-mail.org',
      'throwaway.email', 'mailinator.com', 'yopmail.com', 'maildrop.cc',
      'tempail.com', '10min.email', 'sharklasers.com', 'guerrillamailblock.com',
      'pokemail.net', 'spam4.me', 'bccto.me', 'chacuo.net', 'dispostable.com',
      'tempinbox.com', 'mohmal.com', 'emailondeck.com',
    ] as const,
  },

  TrustedEmail: {
    DOMAINS: [
      'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'qq.com',
      '163.com', '126.com', 'sina.com', 'sohu.com', 'foxmail.com',
      '139.com', 'yeah.net',
    ] as const,
  },

  // ==================================================================
  // CORS — 与部署域名强绑定，改了需要重新部署
  // ==================================================================

  CORS: {
    MAX_AGE: 86400,
    ALLOW_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    ALLOW_HEADERS: ['Content-Type', 'Authorization', 'X-Requested-With'],
    EXPOSE_HEADERS: ['Content-Length', 'X-Request-Id'],
    ALLOWED_ORIGINS: [
      'https://atlas.wort.uk',
      'https://www.atlas.wort.uk',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
  },

  Stats: {
    HOUR_IN_MS: 60 * 60 * 1000,
    DAY_IN_MS: 24 * 60 * 60 * 1000,
    WEEK_IN_MS: 7 * 24 * 60 * 60 * 1000,
    TWO_WEEKS_IN_MS: 14 * 24 * 60 * 60 * 1000,
    MONTH_IN_MS: 30 * 24 * 60 * 60 * 1000,
  },

  // ==================================================================
  // UI/展示默认值 — 代码渲染逻辑依赖，无业务含义
  // ==================================================================

  Defaults: {
    SEARCH_PRIORITY: 5,
    DISPLAY_ORDER: 999,
    DEFAULT_ICON: '🔍',
    DEFAULT_CATEGORY_ICON: '📁',
    DEFAULT_MAJOR_CATEGORY_ICON: '🌟',
    DEFAULT_COLOR: '#3b82f6',
    DEFAULT_MAJOR_CATEGORY_COLOR: '#6b7280',
    DEFAULT_SITE_TYPE: 'search',
  },

  // ==================================================================
  // 角色枚举 — 代码逻辑硬编码，改了需改权限体系
  // ==================================================================

  Roles: {
    DEFAULT_ROLE_ID: 'user',
    DEFAULT_ROLE_NAME: 'user',
    DEFAULT_ROLE_DISPLAY_NAME: '普通用户',
    DEFAULT_ROLE_PRIORITY: 10,
    DEFAULT_PERMISSIONS: ['search', 'favorite', 'history', 'sync', 'community:share', 'community:review'] as const,
  },
};

// ==================================================================
// 共享验证规则 - 从 shared/ 单源导入，消除前后端重复维护
// ==================================================================
export { VALIDATION_RULES } from '@codeseek/shared';

// ==================================================================
// DB配置Key常量 — 仅保留真正需要动态管理的配置项
// 使用方式：configService.getBoolean(DB_CONFIG_KEYS.ENABLE_REGISTRATION, true)
// ==================================================================

export const DB_CONFIG_KEYS = {
  // 基础配置 — 网站信息
  SITE_NAME: 'site_name',
  SITE_DESCRIPTION: 'site_description',

  // 功能开关 — 运营需要动态调整
  ENABLE_REGISTRATION: 'enable_registration',
  COMMUNITY_ENABLED: 'community_enabled',

  // 安全限制 — 安全策略需要动态调整
  MAX_LOGIN_ATTEMPTS: 'max_login_attempts',
  LOCKOUT_DURATION_MS: 'lockout_duration_ms',
  MAX_VERIFICATION_ATTEMPTS: 'max_verification_attempts',
  PASSWORD_RESET_MAX_ATTEMPTS: 'password_reset_max_attempts',
  PASSWORD_RESET_LOCKOUT_DURATION: 'password_reset_lockout_duration',

  // 邮件限制 — 防滥用需要动态调整
  EMAIL_RATE_LIMIT_PER_HOUR: 'email_rate_limit_per_hour',
  EMAIL_RATE_LIMIT_PER_DAY: 'email_rate_limit_per_day',

  // 验证码过期时间 — 安全策略需要动态调整
  VERIFICATION_CODE_EXPIRY: 'verification_code_expiry',
  RESET_PASSWORD_CODE_EXPIRY: 'reset_password_code_expiry',

  // 数据清理 — 运维需要动态调整
  PASSWORD_RESET_LOG_RETENTION_DAYS: 'password_reset_log_retention_days',
  USER_ACTIONS_RETENTION_DAYS: 'user_actions_retention_days',
  SECURITY_EVENT_RETENTION_DAYS: 'security_event_retention_days',
} as const;

// ==================================================================
// JAV 榜单常量 — 周榜/月榜来源、面板限量、热门女优权重
// ==================================================================

export const JAV_RANKING = {
  SOURCE: {
    CENSORED_WEEKLY: {
      name: 'JavDB:有码周榜',
      section: 'censored' as const,
      period: 'weekly' as const,
      url: 'https://javdb.com/rankings/movies?period=week&type=censored',
    },
    UNCENSORED_WEEKLY: {
      name: 'JavDB:无码周榜',
      section: 'uncensored' as const,
      period: 'weekly' as const,
      url: 'https://javdb.com/rankings/movies?period=week&type=uncensored',
    },
    CENSORED_MONTHLY: {
      name: 'JavDB:有码月榜',
      section: 'censored' as const,
      period: 'monthly' as const,
      url: 'https://javdb.com/rankings/movies?period=month&type=censored',
    },
    UNCENSORED_MONTHLY: {
      name: 'JavDB:无码月榜',
      section: 'uncensored' as const,
      period: 'monthly' as const,
      url: 'https://javdb.com/rankings/movies?period=month&type=uncensored',
    },
  },
  PANEL_LIMIT: 60,
  // 榜单由每日定时任务导入，缓存 6 小时即可
  CACHE_TTL_SECONDS: 6 * 60 * 60,
  MIN_IMPORT_ITEMS: 5,
  ACTRESS_LIMIT: 18,
  ACTRESS_CACHE_TTL_SECONDS: 6 * 60 * 60,
  // 热门女优 = 四个榜单上榜作品数 × 5 + 被关注人数 × 2。
  // 关注功能刚上线、关注数还少，所以上榜作品数权重更大；关注多起来后可调高 FOLLOW 权重
  ACTRESS_WORK_WEIGHT: 5,
  ACTRESS_FOLLOW_WEIGHT: 2,
} as const;

// ==================================================================
// 关注女优 / 通知系统常量
// ==================================================================

export const FOLLOW = {
  MAX_PER_USER: 100,
  /** 每次定时任务最多检查几位（Workers 每次调用 50 次子请求上限，留足余量） */
  WATCH_BATCH: 20,
  WATCH_CONCURRENCY: 4,
  /** 同一位女优两次检查的最小间隔；连续失败按 2 的幂退避，最多 32 倍 */
  WATCH_MIN_INTERVAL_MS: 30 * 60 * 1000,
  WATCH_MAX_BACKOFF_EXP: 5,
  FEED_MAX_PAGE_SIZE: 50,
} as const;

export const EMAIL = {
  /** 每轮（每 15 分钟）最多处理几位用户的邮件：一封一次子请求，远低于 50 上限 */
  DIGEST_BATCH_USERS: 15,
  /** 最早一条待发通知攒够这么久才发，让同一批新作合并成一封 */
  MIN_DELAY_MS: 10 * 60 * 1000,
  /** 每人每 24 小时最多几封（超出的继续攒，合并进下一封） */
  MAX_PER_USER_PER_DAY: 3,
  /** 全站每 24 小时最多几封（Resend 免费版约 100/天，留余量） */
  GLOBAL_DAILY_CAP: 90,
  MAX_ITEMS_PER_EMAIL: 30,
  /** 发送失败退避：30 分钟 × 2^失败次数（最多 32 倍）；连续失败达到上限就放弃这批 */
  FAIL_BACKOFF_BASE_MS: 30 * 60 * 1000,
  FAIL_BACKOFF_MAX_EXP: 5,
  MAX_CONSECUTIVE_FAILURES: 5,
  RETENTION_MS: 30 * 24 * 60 * 60 * 1000,
  TEST_RATE_LIMIT_MS: 60 * 1000,
} as const;

export const NOTIFICATION = {
  MAX_PAGE_SIZE: 50,
  /** 用户事后开启公告邮件时，允许补发的近期公告窗口（天） */
  ANNOUNCEMENT_BACKFILL_DAYS: 7,
  /** 单次补发的公告数量上限，避免一次性轰炸 */
  ANNOUNCEMENT_BACKFILL_LIMIT: 20,
  /** 公告在收件箱里的伪 ID 前缀（读时合并，不落 notifications 表） */
  ANNOUNCEMENT_ID_PREFIX: 'announcement:',
  TYPES: [
    'follow.new_work',
    'follow.release_soon',
    'community.like',
    'community.comment',
    'community.favorite',
    'community.report_resolved',
    'site.announcement',
  ] as const,
} as const;

// ==================================================================
// 推荐系统常量 — 代码级固定规则，改了需重新部署
// ==================================================================

export const RECOMMEND = {
  DIM_WEIGHTS: {
    actor: 0.5,
    tag: 0.4,
    publisher: 0.1,
  },
  FAVORITE_WEIGHT: 3,
  HISTORY_WEIGHT: 1,
  HISTORY_MIN_OCCURRENCES: 3,
  NEW_USER_MAX_HISTORY: 3,
  POPULARITY_WINDOW_DAYS: 30,
  RELATED_LIMIT: 8,
  FOR_YOU_LIMIT: 12,
  HOT_LIMIT: 12,
  CANDIDATE_LIMIT: 400,
  PROFILE_CACHE_TTL: 5 * 60,
  SIGNALS_CACHE_TTL: 60 * 60,
  RANKING_FRESH_DAYS: 7,
  ENRICH_BATCH: 20,
  ENRICH_CONCURRENCY: 4,
  ENRICH_TIMEOUT_MS: 8000,
  ENRICH_TIME_BUDGET_MS: 25000,
  ENRICH_MAX_FAILURES: 3,
} as const;
