/**
 * CodeSeek 前端常量 — Layer 2: 代码固定值
 *
 * 职责边界：
 *   Layer 1 wrangler.toml  → 部署级（后端管理，前端无感知）
 *   Layer 2 constants.ts   → 本文件：纯 UI/架构固定值，改了需要改代码
 *   Layer 3 DB → API      → 通过 ConfigContext 下发的运行期业务配置
 *
 * 判断标准：
 *   放这里  → 改了需要改代码（UI尺寸、动画时长、API地址、正则格式）
 *   放 ConfigContext → 从后端 /api/system/public-config 拉取的业务参数
 */

/* ==================== API 配置 ==================== */

/** API 基础地址 — 与部署环境强绑定，改了需重新构建 */
export const API_BASE_URL = {
  LOCAL: '/api',
  PRODUCTION: 'https://backend.codeseek.pp.ua/api',
} as const;

/** API 请求行为配置 — 纯客户端重试策略 */
export const API_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  DEFAULT_TIMEOUT: 15000,
} as const;

/* ==================== UI 配置 ==================== */

/** Toast 通知 — UI 行为，不是业务规则 */
export const TOAST_CONFIG = {
  MAX_TOASTS: 5,
  DEFAULT_DURATION: 5000,
} as const;

/** 侧边栏尺寸 — 纯布局常量 */
export const SIDEBAR_CONFIG = {
  DEFAULT_WIDTH: 280,
  COLLAPSED_WIDTH: 72,
  MOBILE_WIDTH: 288,
} as const;

/* ==================== 代理配置 ==================== */

/** 代理服务器 — 与基础设施绑定，改了需重新部署 */
export const PROXY_CONFIG = {
  PROXY_SERVER: 'https://omnibox.pp.ua',
  DEFAULT_ENABLED: true,
  VERSION: '2.2.0',
  BACKEND_VERSION: '2.0.0',
} as const;

export const PROXY_TIMEOUTS = {
  HEALTH_CHECK: 10000,
} as const;

/* ==================== 格式校验（纯正则，不是业务数字）==================== */

/**
 * 表单格式正则 — 代码逻辑依赖，不可热改
 * 注意：这些正则必须与后端 constants.ts 中的定义保持一致
 */
export const VALIDATION_REGEX = {
  USERNAME: /^[a-zA-Z0-9_]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

/* ==================== 验证规则常量 ==================== */

/**
 * 验证规则 — 与后端 VALIDATION_RULES 保持一致
 * 这些值改了需要前后端同步修改代码重新部署
 */
export const VALIDATION_RULES = {
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
  KEYWORD: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 200,
  },
  VERIFICATION_CODE: {
    LENGTH: 6,
  },
  TAG: {
    MAX_COUNT_PER_SOURCE: 10,
  },
  SEARCH_HISTORY: {
    MAX_COUNT: 1000,
  },
  FAVORITES: {
    MAX_COUNT: 1000,
  },
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    MAX_LOG_PAGE_SIZE: 200,
    DEFAULT_HISTORY_LIMIT: 50,
    MAX_HISTORY_LIMIT: 200,
  },
  SUGGESTIONS: {
    MIN_KEYWORD_LENGTH: 2,
    MAX_LIMIT: 20,
  },
  TRENDING: {
    DEFAULT_HOURS: 24,
    MAX_HOURS: 168,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 50,
  },
} as const;

/** 验证码固定位数（格式规则，非业务参数）*/
export const VERIFICATION_CODE_LENGTH = VALIDATION_RULES.VERIFICATION_CODE.LENGTH;

/** 本地搜索历史最大条数（前端 localStorage 限制，非后端 DB 限制）*/
export const MAX_LOCAL_SEARCH_HISTORY = 100;

/* ==================== 应用信息 ==================== */

/** 构建时版本号，来自打包配置 */
export const APP_VERSION = '2.0.0' as const;
