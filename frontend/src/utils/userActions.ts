/**
 * 用户行为类型注册表：行为日志展示、筛选与用户端活动记录共用的唯一数据源。
 *
 * 约束：
 * - 新增后端 logUserAction 时必须在此登记，否则日志只能显示原始 action 名。
 * - filterable=false 用于自动噪声或已停止写入的历史类型：仍能翻译旧记录，但不进筛选。
 */
import i18next from '@/i18n';

export type UserActionGroup = 'auth' | 'content' | 'account' | 'feedback' | 'admin';

export interface UserActionMeta {
  action: string;
  labelKey: string;
  group: UserActionGroup;
  /** 是否出现在筛选下拉 */
  filterable: boolean;
  /** 是否属于个人中心可见的用户行为 */
  userVisible: boolean;
  /** 列表徽标配色 */
  badgeClass: string;
  /** 个人中心时间线图标 */
  emoji: string;
}

const AUTH_BADGE = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
const DANGER_BADGE = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
const NEUTRAL_BADGE = 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400';
const CONTENT_BADGE = 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
const SETTINGS_BADGE = 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
const FEEDBACK_BADGE = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
const ADMIN_BADGE = 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400';

export const USER_ACTIONS: readonly UserActionMeta[] = [
  // ── 认证 ─────────────────────────────────────────────
  { action: 'login', labelKey: 'admin:actions.login', group: 'auth', filterable: true, userVisible: true, badgeClass: AUTH_BADGE, emoji: '✓' },
  { action: 'login_failed', labelKey: 'admin:actions.login_failed', group: 'auth', filterable: true, userVisible: true, badgeClass: DANGER_BADGE, emoji: '✗' },
  { action: 'logout', labelKey: 'admin:actions.logout', group: 'auth', filterable: true, userVisible: true, badgeClass: NEUTRAL_BADGE, emoji: '→' },
  { action: 'register', labelKey: 'admin:actions.register', group: 'auth', filterable: true, userVisible: true, badgeClass: AUTH_BADGE, emoji: '＋' },
  { action: 'forgot_password', labelKey: 'admin:actions.forgot_password', group: 'auth', filterable: true, userVisible: true, badgeClass: SETTINGS_BADGE, emoji: '🔑' },
  { action: 'reset_password', labelKey: 'admin:actions.reset_password', group: 'auth', filterable: true, userVisible: true, badgeClass: SETTINGS_BADGE, emoji: '🔑' },
  { action: 'change_password', labelKey: 'admin:actions.change_password', group: 'auth', filterable: true, userVisible: true, badgeClass: SETTINGS_BADGE, emoji: '🔒' },
  { action: 'email_verify', labelKey: 'admin:actions.email_verify', group: 'auth', filterable: true, userVisible: true, badgeClass: AUTH_BADGE, emoji: '✉' },
  { action: 'email_change', labelKey: 'admin:actions.email_change', group: 'auth', filterable: true, userVisible: true, badgeClass: AUTH_BADGE, emoji: '✉' },
  { action: 'email_change_cancelled', labelKey: 'admin:actions.email_change_cancelled', group: 'auth', filterable: true, userVisible: true, badgeClass: NEUTRAL_BADGE, emoji: '✉' },
  // token_refresh 由客户端自动触发，量级大且无行为含义：只翻译，不进筛选
  { action: 'token_refresh', labelKey: 'admin:actions.token_refresh', group: 'auth', filterable: false, userVisible: false, badgeClass: NEUTRAL_BADGE, emoji: '↻' },

  // ── 内容 ─────────────────────────────────────────────
  { action: 'search', labelKey: 'admin:actions.search', group: 'content', filterable: false, userVisible: false, badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', emoji: '🔍' },
  { action: 'add_favorite', labelKey: 'admin:actions.add_favorite', group: 'content', filterable: true, userVisible: true, badgeClass: CONTENT_BADGE, emoji: '♥' },
  { action: 'remove_favorite', labelKey: 'admin:actions.remove_favorite', group: 'content', filterable: true, userVisible: true, badgeClass: NEUTRAL_BADGE, emoji: '♡' },
  { action: 'update_favorite_status', labelKey: 'admin:actions.update_favorite_status', group: 'content', filterable: true, userVisible: true, badgeClass: CONTENT_BADGE, emoji: '♥' },
  { action: 'clear_search_history', labelKey: 'admin:actions.clear_search_history', group: 'content', filterable: true, userVisible: true, badgeClass: NEUTRAL_BADGE, emoji: '🗑' },

  // ── 账户与反馈 ───────────────────────────────────────
  { action: 'update_settings', labelKey: 'admin:actions.update_settings', group: 'account', filterable: true, userVisible: true, badgeClass: SETTINGS_BADGE, emoji: '⚙' },
  { action: 'submit_feedback', labelKey: 'admin:actions.submit_feedback', group: 'feedback', filterable: true, userVisible: true, badgeClass: FEEDBACK_BADGE, emoji: '💬' },
  { action: 'delete_feedback', labelKey: 'admin:actions.delete_feedback', group: 'feedback', filterable: true, userVisible: true, badgeClass: NEUTRAL_BADGE, emoji: '🗑' },

  // ── 管理操作 ─────────────────────────────────────────
  { action: 'admin_update_user_status', labelKey: 'admin:actions.admin_update_user_status', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '⚙' },
  { action: 'admin_update_user_role', labelKey: 'admin:actions.admin_update_user_role', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '⚙' },
  { action: 'admin_terminate_session', labelKey: 'admin:actions.admin_terminate_session', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '⚙' },
  { action: 'admin_cleanup', labelKey: 'admin:actions.admin_cleanup', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '🗑' },
  { action: 'admin_handle_report', labelKey: 'admin:actions.admin_handle_report', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '⚠' },
  { action: 'admin_handle_feedback', labelKey: 'admin:actions.admin_handle_feedback', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '💬' },
  { action: 'admin_create_announcement', labelKey: 'admin:actions.admin_create_announcement', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '📢' },
  { action: 'admin_update_announcement', labelKey: 'admin:actions.admin_update_announcement', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '📢' },
  { action: 'admin_delete_announcement', labelKey: 'admin:actions.admin_delete_announcement', group: 'admin', filterable: true, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '📢' },

  // ── 历史类型：已无写入，保留标签用于展示旧记录 ─────────
  { action: 'sync_favorites', labelKey: 'admin:actions.sync_favorites', group: 'content', filterable: false, userVisible: false, badgeClass: NEUTRAL_BADGE, emoji: '↻' },
  { action: 'delete_account', labelKey: 'admin:actions.delete_account', group: 'account', filterable: false, userVisible: false, badgeClass: NEUTRAL_BADGE, emoji: '🗑' },
  { action: 'share_source', labelKey: 'admin:actions.share_source', group: 'content', filterable: false, userVisible: false, badgeClass: NEUTRAL_BADGE, emoji: '↗' },
  { action: 'review_source', labelKey: 'admin:actions.review_source', group: 'content', filterable: false, userVisible: false, badgeClass: NEUTRAL_BADGE, emoji: '★' },
  { action: 'report_source', labelKey: 'admin:actions.report_source', group: 'content', filterable: false, userVisible: false, badgeClass: NEUTRAL_BADGE, emoji: '⚠' },
  { action: 'admin_update_user_permissions', labelKey: 'admin:actions.admin_update_user_permissions', group: 'admin', filterable: false, userVisible: false, badgeClass: ADMIN_BADGE, emoji: '⚙' },
] as const;

const ACTION_MAP = new Map(USER_ACTIONS.map((item) => [item.action, item]));

/** 管理后台筛选下拉：所有仍在写入的可筛选类型 */
export const allActionOptions = USER_ACTIONS.filter((item) => item.filterable);

/** 个人中心筛选下拉：仅用户自身可见类型 */
export const userActionOptions = USER_ACTIONS.filter((item) => item.filterable && item.userVisible);

/** 解析行为类型为当前语言的标签；未登记时回退原始 action */
export const resolveActionLabel = (action: string): string => {
  const meta = ACTION_MAP.get(action);
  return meta ? i18next.t(meta.labelKey) : action;
};

/** 行为类型徽标配色 */
export const actionBadgeClass = (action: string): string =>
  ACTION_MAP.get(action)?.badgeClass ?? NEUTRAL_BADGE;

/** 行为类型时间线图标 */
export const actionEmoji = (action: string): string =>
  ACTION_MAP.get(action)?.emoji ?? '•';
