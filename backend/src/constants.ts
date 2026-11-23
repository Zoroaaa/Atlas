/**
 * 后端代码级固定值（Layer 2）：枚举、正则、域名黑白名单、业务阈值与权重。
 *
 * 分层：wrangler.toml 管部署参数，DB system_config 管可热改业务配置；
 * 只有「改动必须改代码并重新部署」的值才放这里。
 */

import { VALIDATION_PATTERNS } from '@codeseek/shared';

/** 代码级固定配置集合 */
export const CONFIG = {

  // ── 应用版本（APP_VERSION 环境变量未设置时的唯一兜底） ──
  APP_VERSION: '1.9.0',

  // ── 默认域名（环境变量未设置时的兜底，正式部署以 wrangler.toml 为准） ──
  DEFAULT_URLS: {
    FRONTEND: 'https://atlas.wort.uk',
    BACKEND: 'https://atlas.wort.uk',
  },

  // ── 正则表达式（格式规则，改动需同步验证逻辑） ──
  VALIDATION: {
    USERNAME_REGEX: VALIDATION_PATTERNS.USERNAME,
    EMAIL_REGEX: VALIDATION_PATTERNS.EMAIL,
    VERIFICATION_CODE_REGEX: VALIDATION_PATTERNS.VERIFICATION_CODE,
  },

  // ── 邮箱域名黑白名单（安全规则，不允许后台修改） ──
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

  // ── CORS（与部署域名强绑定，改动需重新部署） ──
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

  // ── UI / 展示默认值（渲染逻辑依赖，无业务含义） ──
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

  // ── 角色枚举（只按角色名判定 admin/superadmin，无细粒度权限体系） ──
  Roles: {
    DEFAULT_ROLE_ID: 'user',
    DEFAULT_ROLE_NAME: 'user',
    DEFAULT_ROLE_DISPLAY_NAME: '普通用户',
    DEFAULT_ROLE_PRIORITY: 10,
  },
};

// ── 共享验证规则（从 shared/ 单源导入，避免前后端重复维护） ──
export { VALIDATION_RULES } from '@codeseek/shared';

/**
 * DB system_config 的 key 常量，仅保留需要后台动态调整的项。
 * 用法：configService.getBoolean(DB_CONFIG_KEYS.ENABLE_REGISTRATION, true)
 */
export const DB_CONFIG_KEYS = {
  // 基础配置 — 网站信息
  SITE_NAME: 'site_name',
  SITE_DESCRIPTION: 'site_description',

  // 功能开关 — 运营需要动态调整
  ENABLE_REGISTRATION: 'enable_registration',
  COMMUNITY_ENABLED: 'community_enabled',
  /** JAV 详情批量补全：关闭后每分钟 cron 跳过推进（不删任务、不影响其他定时任务） */
  JAV_DETAIL_JOB_ENABLED: 'jav_detail_job_enabled',
  /** 封面回填「加速」通道：开启后每分钟推进一批，关闭时分钟 cron 直接跳过（日常保持关闭） */
  COVER_BACKFILL_ENABLED: 'cover_backfill_enabled',
  /** 封面回填「日常」通道：每小时 :05 推进一批，与分钟通道互不影响 */
  COVER_BACKFILL_HOURLY_ENABLED: 'cover_backfill_hourly_enabled',
  /** 封面回填每批条数（1-100），两个通道共用 */
  COVER_BACKFILL_BATCH_SIZE: 'cover_backfill_batch_size',
  /** R2 对象扫描：关闭后看板数字停在上一轮，不影响取图 */
  R2_SCAN_ENABLED: 'r2_scan_enabled',
  /** 每个 tick 最多列几页 R2 对象（1 页 = 1000 个），1-5 */
  R2_SCAN_PAGES_PER_TICK: 'r2_scan_pages_per_tick',
  /** 是否允许每日自动回收超期懒加载封面 */
  R2_RECLAIM_ENABLED: 'r2_reclaim_enabled',
  /** 自动回收的天数阈值（30-3650） */
  R2_RECLAIM_DAYS: 'r2_reclaim_days',

  // 安全限制 — 安全策略需要动态调整
  MAX_LOGIN_ATTEMPTS: 'max_login_attempts',
  LOCKOUT_DURATION_MS: 'lockout_duration_ms',
  MAX_VERIFICATION_ATTEMPTS: 'max_verification_attempts',
  PASSWORD_RESET_MAX_ATTEMPTS: 'password_reset_max_attempts',
  PASSWORD_RESET_LOCKOUT_DURATION: 'password_reset_lockout_duration',

  // 邮件限制 — 防滥用需要动态调整
  EMAIL_RATE_LIMIT_PER_HOUR: 'email_rate_limit_per_hour',
  EMAIL_RATE_LIMIT_PER_DAY: 'email_rate_limit_per_day',
  /** 邮件服务商优先级（数值越小越优先，-1 表示停用） */
  EMAIL_PRIORITY_CLOUDFLARE: 'email_priority_cloudflare',
  EMAIL_PRIORITY_RESEND: 'email_priority_resend',
  EMAIL_PRIORITY_MAILTRAP: 'email_priority_mailtrap',
  EMAIL_PRIORITY_BREVO: 'email_priority_brevo',
  /** 邮件服务商每日发送上限（0 表示不限额） */
  EMAIL_DAILY_LIMIT_CLOUDFLARE: 'email_daily_limit_cloudflare',
  EMAIL_DAILY_LIMIT_RESEND: 'email_daily_limit_resend',
  EMAIL_DAILY_LIMIT_MAILTRAP: 'email_daily_limit_mailtrap',
  EMAIL_DAILY_LIMIT_BREVO: 'email_daily_limit_brevo',

  // 验证码过期时间 — 安全策略需要动态调整
  VERIFICATION_CODE_EXPIRY: 'verification_code_expiry',
  RESET_PASSWORD_CODE_EXPIRY: 'reset_password_code_expiry',

  // 数据清理 — 运维需要动态调整
  PASSWORD_RESET_LOG_RETENTION_DAYS: 'password_reset_log_retention_days',
  USER_ACTIONS_RETENTION_DAYS: 'user_actions_retention_days',
  SECURITY_EVENT_RETENTION_DAYS: 'security_event_retention_days',
} as const;

// ── JAV 榜单（周榜/月榜来源、面板限量、热门女优权重） ──
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
  // 榜单由每日 18:00 UTC 的定时任务导入；缓存与同步周期一致（24 小时），
  // 导入成功后由导入接口主动失效，避免「刚同步仍看到旧榜」。
  CACHE_TTL_SECONDS: 24 * 60 * 60,
  MIN_IMPORT_ITEMS: 5,
  ACTRESS_LIMIT: 36,
  ACTRESS_CACHE_TTL_SECONDS: 6 * 60 * 60,
  // 热门女优 = 四个榜单上榜作品数 × 5 + 被关注人数 × 2。
  // 关注功能刚上线、关注数还少，所以上榜作品数权重更大；关注多起来后可调高 FOLLOW 权重
  ACTRESS_WORK_WEIGHT: 5,
  ACTRESS_FOLLOW_WEIGHT: 2,
} as const;

// 年度榜上限按东八区当前年份自动顺延：2026 年跑 2008-2026，2027 年自动加到 2027
const JAV_TOP250_CURRENT_YEAR = new Date(Date.now() + 8 * 3600_000).getUTCFullYear();

// ── JavDB TOP250（总榜每月、年度榜每月同步） ──
export const JAV_TOP250 = {
  /** 总的类别：来源站点的 type_value（all / 0 / 1 / 2 / 3） */
  SECTIONS: [
    { key: 'all', apiValue: 'all', sourceName: 'JavDB:TOP250全部' },
    { key: 'censored', apiValue: '0', sourceName: 'JavDB:TOP250有码' },
    { key: 'uncensored', apiValue: '1', sourceName: 'JavDB:TOP250无码' },
    { key: 'western', apiValue: '2', sourceName: 'JavDB:TOP250欧美' },
    { key: 'fc2', apiValue: '3', sourceName: 'JavDB:TOP250FC2' },
  ] as const,
  /** 年度榜范围（含首尾）；上限随当前年份自动顺延 */
  YEAR_START: 2008,
  YEAR_END: Math.max(2026, JAV_TOP250_CURRENT_YEAR),
  /** 每个榜单固定 250 条，App API 单页最大 20 条 */
  MAX_ITEMS: 250,
  PAGE_SIZE: 20,
  /** 总榜与年度榜都每月同步一次；缓存略长于同步周期，导入成功会主动失效 */
  OVERALL_CACHE_TTL_SECONDS: 30 * 24 * 60 * 60,
  YEAR_CACHE_TTL_SECONDS: 31 * 24 * 60 * 60,
  MIN_IMPORT_ITEMS: 20,
} as const;

/** TOP250 全部板块 key（总榜 + 四个大类） */
export const JAV_TOP250_SECTION_KEYS = JAV_TOP250.SECTIONS.map((item) => item.key);
/** TOP250 板块 key 联合类型 */
export type JavTop250SectionKey = (typeof JAV_TOP250.SECTIONS)[number]['key'];

/** 年度榜覆盖年份（含首尾） */
export const JAV_TOP250_YEARS: number[] = Array.from(
  { length: JAV_TOP250.YEAR_END - JAV_TOP250.YEAR_START + 1 },
  (_, index) => JAV_TOP250.YEAR_START + index
);

/** 板块 key → 榜单 source_name；未知 key 回退到总榜 */
export function javTop250SourceName(section: JavTop250SectionKey): string {
  return JAV_TOP250.SECTIONS.find((item) => item.key === section)?.sourceName
    ?? JAV_TOP250.SECTIONS[0].sourceName;
}

/** 年度榜 source_name，形如 `JavDB:TOP250年度2024` */
export function javTop250YearSourceName(year: number): string {
  return `JavDB:TOP250年度${year}`;
}

// ── 关注女优 / 通知系统 ──
export const FOLLOW = {
  MAX_PER_USER: 100,
  /** 每轮（每 30 分钟）最多检查 20 位关注对象 */
  WATCH_BATCH: 20,
  /** 抓取分批：5 个一批，批间等待 10 秒，避免一次性打满外部站 */
  WATCH_GROUP_SIZE: 5,
  WATCH_GROUP_DELAY_MS: 10_000,
  /** 同一位女优两次检查的最小间隔；连续失败按 2 的幂退避，最多 32 倍 */
  WATCH_MIN_INTERVAL_MS: 30 * 60 * 1000,
  WATCH_MAX_BACKOFF_EXP: 5,
  FEED_MAX_PAGE_SIZE: 50,
  /**
   * 即将发售（JavDB）：每 30 分钟一轮、每轮最多 20 个关注对象；
   * 单个对象最快 30 分钟刷新一次，失败按 2 的幂退避。
   * 脚本内部同样按 5 个一批、批间 10 秒执行。
   */
  UPCOMING_BATCH_DEFAULT: 20,
  UPCOMING_BATCH_MAX: 20,
  UPCOMING_MIN_INTERVAL_MS: 30 * 60 * 1000,
  UPCOMING_MAX_BACKOFF_EXP: 5,
  UPCOMING_MAX_WORKS: 20,
  /** JavDB App API 能映射的实体类型；label/tag 暂无稳定接口，跳过 */
  UPCOMING_ENTITY_TYPES: ['actress', 'director', 'studio', 'series'] as const,
} as const;

export const EMAIL = {
  /** 每轮（每 30 分钟）最多处理几位用户的邮件：一封一次子请求；与关注检测（≤20）合计 ≤35，低于 50 上限 */
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
    'feedback.reply',
    'site.announcement',
  ] as const,
} as const;

// ── 推荐标签（JavBus 类别词典 + 类别作品） ──
export const GENRE_DICT = {
  CENSORED_URL: 'https://www.javbus.com/genre',
  UNCENSORED_URL: 'https://www.javbus.com/uncensored/genre',
  /** 单个 section 解析结果低于该值时放弃更新，保留旧行（防页面改版/拦截清空词典） */
  MIN_TAGS_PER_SECTION: 50,
  /** 词典同步周期：每周一次 */
  SYNC_INTERVAL_MS: 7 * 24 * 60 * 60 * 1000,
  FETCH_TIMEOUT_MS: 15000,
} as const;

export const GENRE_REC = {
  MAX_TAGS: 20,
  /** 收藏与历史都有信号时的权重；占比口径，避免记录量级差异导致单向主导 */
  FAVORITE_WEIGHT: 0.7,
  HISTORY_WEIGHT: 0.3,
  FAVORITE_LIMIT: 1000,
  HISTORY_LIMIT: 200,
  PROFILE_CACHE_TTL: 5 * 60,
  RATE_LIMIT_PER_MINUTE: 30,
} as const;

export const GENRE_WORKS = {
  /** 每次返回的作品数 */
  PAGE_SIZE: 24,
  /** 分页硬上限（站点总页数不可知，用上限兜底） */
  MAX_PAGE: 30,
  /** 扩张探测步长：每次向后推 8 页 */
  PROBE_STEP: 8,
  /** 每个标签最多每 24 小时探测一次 */
  PROBE_INTERVAL_MS: 24 * 60 * 60 * 1000,
  /** 整页解析结果缓存 1 小时（抽样在缓存之后，避免所有用户看到同一批） */
  CACHE_TTL_SECONDS: 3600,
  FETCH_TIMEOUT_MS: 15000,
  RATE_LIMIT_PER_MINUTE: 20,
} as const;

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
  FOR_YOU_LIMIT: 24,
  HOT_LIMIT: 24,
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
