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
  // 固定枚举值 — 代码逻辑依赖，不可热改
  // ==================================================================

  ALLOWED_ACTIONS: [
    'search', 'login', 'logout', 'register', 'visit_site', 'copy_url',
    'favorite_add', 'favorite_remove', 'settings_update', 'export_data',
    'sync_data', 'page_view', 'session_start', 'session_end',
    'custom_source_add', 'custom_source_edit', 'custom_source_delete',
    'tag_created', 'tag_updated', 'tag_deleted',
    'major_category_create', 'major_category_update', 'major_category_delete',
    'source_category_create', 'source_category_update', 'source_category_delete',
    'search_source_create', 'search_source_update', 'search_source_delete',
    'user_source_config_update', 'search_sources_export',
  ] as const,

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
      'https://codeseek.pp.ua',
      'https://www.codeseek.pp.ua',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
  },

  // ==================================================================
  // 纯计算用时间常量 — 不是业务参数，是代码里的数学常量
  // ==================================================================

  Time: {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    HOUR_IN_MS: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    DAY_IN_MS: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    WEEK_IN_MS: 7 * 24 * 60 * 60 * 1000,
    TWO_WEEKS: 14 * 24 * 60 * 60 * 1000,
    TWO_WEEKS_IN_MS: 14 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000,
    MONTH_IN_MS: 30 * 24 * 60 * 60 * 1000,
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
    DEFAULT_PERMISSIONS: ['search', 'favorite', 'history', 'sync'] as const,
  },
};

// ==================================================================
// 验证规则常量 — 统一管理所有输入验证限制
// 改了需要重新部署，因为这些是代码级的验证逻辑
// ==================================================================

export const VALIDATION_RULES = {

  // 用户相关
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 20,
  },
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 100,
  },
  EMAIL: {
    MAX_LENGTH: 255,
  },

  // 搜索相关
  KEYWORD: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 200,
  },
  SEARCH_SOURCES: {
    MAX_COUNT: 50,
  },

  // 收藏相关
  FAVORITES: {
    MAX_SYNC_COUNT: 1000,
    MAX_COUNT: 1000,
    TITLE_MAX_LENGTH: 100,
    SUBTITLE_MAX_LENGTH: 200,
    URL_MAX_LENGTH: 500,
    ICON_MAX_LENGTH: 50,
  },

  // 搜索历史相关
  SEARCH_HISTORY: {
    MAX_COUNT: 1000,
  },

  // 分类/大类相关
  MAJOR_CATEGORY: {
    NAME_MAX_LENGTH: 30,
    DESCRIPTION_MAX_LENGTH: 500,
    ICON_MAX_LENGTH: 10,
  },
  CATEGORY: {
    NAME_MAX_LENGTH: 50,
    DESCRIPTION_MAX_LENGTH: 500,
    ICON_MAX_LENGTH: 10,
  },

  // 搜索源相关
  SOURCE: {
    NAME_MAX_LENGTH: 100,
    SUBTITLE_MAX_LENGTH: 200,
    DESCRIPTION_MAX_LENGTH: 1000,
    URL_MAX_LENGTH: 500,
    ICON_MAX_LENGTH: 10,
  },

  // 用户配置相关
  USER_CONFIG: {
    CUSTOM_NAME_MAX_LENGTH: 100,
    CUSTOM_SUBTITLE_MAX_LENGTH: 200,
    CUSTOM_ICON_MAX_LENGTH: 50,
    NOTES_MAX_LENGTH: 500,
    BATCH_UPDATE_MAX_COUNT: 100,
  },

  // 社区相关
  TAG: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 20,
    DESCRIPTION_MAX_LENGTH: 200,
    MAX_COUNT_PER_SOURCE: 10,
  },
  SHARED_SOURCE: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
    SUBTITLE_MAX_LENGTH: 200,
    DESCRIPTION_MAX_LENGTH: 2000,
    URL_MAX_LENGTH: 500,
  },
  REVIEW: {
    COMMENT_MAX_LENGTH: 1000,
  },
  REPORT: {
    REASON_MAX_LENGTH: 100,
    DETAILS_MAX_LENGTH: 1000,
  },

  // 分页相关
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    MAX_LOG_PAGE_SIZE: 200,
    DEFAULT_HISTORY_LIMIT: 50,
    MAX_HISTORY_LIMIT: 200,
  },

  // 搜索建议相关
  SUGGESTIONS: {
    MIN_KEYWORD_LENGTH: 2,
    MAX_LIMIT: 20,
  },

  // 热门搜索相关
  TRENDING: {
    DEFAULT_HOURS: 24,
    MAX_HOURS: 168,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 50,
  },

  // 验证码相关
  VERIFICATION_CODE: {
    LENGTH: 6,
    EXPIRY_MS: 15 * 60 * 1000,
    MAX_ATTEMPTS: 5,
    RESEND_INTERVAL_MS: 60 * 1000,
  },

  // 邮箱更改相关
  EMAIL_CHANGE: {
    REQUEST_EXPIRY_MS: 30 * 60 * 1000,
    PENDING_EXPIRY_MINUTES: 30,
  },

  // 搜索源状态检查相关
  SOURCE_CHECK: {
    MAX_BATCH_CHECK: 30,
    MAX_CACHE_QUERY: 50,
    DEFAULT_TIMEOUT_MS: 10000,
    BATCH_TIMEOUT_MS: 5000,
    CACHE_DURATION_MS: 5 * 60 * 1000,
    MAX_CONCURRENT_CHECKS: 3,
  },
} as const;

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
