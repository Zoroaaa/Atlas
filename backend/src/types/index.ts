/**
 * CodeSeek 后端类型定义
 * 功能：定义所有数据库实体、环境变量、API响应类型
 */

// =====================================================================
// Env — 对应 wrangler.toml [vars] + secrets
// 只包含 Layer 1（部署级）配置，业务配置已全部迁移至 DB
// =====================================================================
export interface Env {
  // 基础设施绑定
  DB: D1Database;

  // Secrets（通过 `wrangler secret put` 注入，不在 wrangler.toml 中出现）
  JWT_SECRET: string;
  RESEND_API_KEY?: string;

  // 部署级 vars（对应 wrangler.toml [vars]）
  APP_VERSION?: string;
  APP_ENV?: string;
  SITE_URL?: string;
  FRONTEND_URL?: string;
  BACKEND_URL?: string;
  DEFAULT_FROM_EMAIL?: string;
  DEFAULT_FROM_NAME?: string;
  JWT_EXPIRY_DAYS?: string;
  ENABLE_ACTION_LOGGING?: string;

  // GitHub OAuth（通过 `wrangler secret put` 注入）
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  // TMDB API（影视搜索元数据）
  TMDB_API_KEY?: string;

}

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
  permissions: string;
  settings: string;
  is_active: number;
  last_login: number | null;
  login_count: number;
  email_verified: number;
  last_password_change?: number | null;
  role_id?: string;
  github_id?: string | null;
  github_username?: string | null;
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  permissions: string;
  is_system: number;
  priority: number;
  created_at: number;
  updated_at: number;
}

export interface UserSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  last_activity: number;
  ip_address: string | null;
  user_agent: string | null;
}

export interface UserFavorite {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  url: string;
  icon: string | null;
  keyword: string | null;
  code: string | null;
  cover: string | null;
  actors: string | null;
  duration: string | null;
  tags: string | null;
  release_date: string | null;
  publisher: string | null;
  magnet_link: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface UserSearchHistory {
  id: string;
  user_id: string;
  query: string;
  source: string;
  results_count: number;
  created_at: number;
  title?: string;
  subtitle?: string;
  code?: string;
  actors?: string;
  duration?: string;
  tags?: string;
  release_date?: string;
  publisher?: string;
  keyword?: string;
  /** 封面 URL（搜索历史增强：Bangumi封面/TMDB poster/JAV封面） */
  cover?: string;
}

export interface UserAction {
  id: string;
  user_id: string | null;
  action: string;
  data: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
}

export interface MajorCategory {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  color: string;
  display_order: number;
  is_system: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface SearchSourceCategory {
  id: string;
  major_category_id: string;
  name: string;
  description: string;
  icon: string | null;
  color: string;
  default_searchable: number;
  default_site_type: string;
  search_priority: number;
  is_system: number;
  is_active: number;
  display_order: number;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface SearchSource {
  id: string;
  category_id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  icon: string | null;
  url_template: string;
  homepage_url: string | null;
  site_type: string;
  searchable: number;
  search_priority: number;
  is_system: number;
  is_active: number;
  display_order: number;
  usage_count: number;
  last_used_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface UserSearchSourceConfig {
  id: string;
  user_id: string;
  source_id: string;
  is_enabled: number;
  custom_priority: number | null;
  custom_name: string | null;
  custom_subtitle: string | null;
  custom_icon: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface CommunitySourceTag {
  id: string;
  tag_name: string;
  tag_description: string | null;
  tag_color: string;
  usage_count: number;
  is_official: number;
  tag_active: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface CommunitySharedSource {
  id: string;
  user_id: string;
  source_name: string;
  source_subtitle: string | null;
  source_icon: string | null;
  source_url_template: string;
  source_category: string;
  description: string | null;
  tags: string | null;
  status: string;
  is_verified: number;
  is_featured: number;
  view_count: number;
  download_count: number;
  like_count: number;
  rating_score: number;
  rating_count: number;
  created_at: number;
  updated_at: number;
  last_tested_at: number | null;
}

export interface CommunitySourceReview {
  id: string;
  shared_source_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  is_anonymous: number;
  created_at: number;
  updated_at: number;
}

export interface CommunitySourceLike {
  id: string;
  shared_source_id: string;
  user_id: string;
  like_type: string;
  created_at: number;
}

export interface CommunitySourceDownload {
  id: string;
  shared_source_id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
}

export interface CommunitySourceReport {
  id: string;
  shared_source_id: string;
  reporter_user_id: string;
  report_reason: string;
  report_details: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface CommunityUserStats {
  user_id: string;
  shared_sources_count: number;
  total_downloads: number;
  total_likes: number;
  total_views: number;
  reviews_given: number;
  sources_downloaded: number;
  tags_created: number;
  reputation_score: number;
  contribution_level: string;
  created_at: number;
  updated_at: number;
}

export interface EmailVerification {
  id: string;
  user_id: string | null;
  email: string;
  verification_code: string;
  verification_type: string;
  expires_at: number;
  created_at: number;
  ip_address?: string | null;
  user_agent?: string | null;
  attempt_count?: number;
  email_hash?: string | null;
  code_hash?: string | null;
  status?: string;
  metadata?: string;
}

export interface EmailChangeRequest {
  id: string;
  user_id: string;
  old_email: string;
  new_email: string;
  old_email_verified: number;
  new_email_verified: number;
  status: string;
  expires_at: number;
  created_at: number;
  updated_at: number | null;
}

export interface PasswordResetLog {
  id: string;
  user_id: string | null;
  email: string;
  request_type: string;
  request_status: string;
  ip_address: string | null;
  user_agent: string | null;
  verification_code_sent: number;
  verification_attempts: number;
  created_at: number;
  code_sent_at: number | null;
  verified_at: number | null;
  completed_at: number | null;
}

export interface SecurityLockout {
  id: string;
  lockout_type: string;
  identifier: string;
  attempt_count: number;
  max_attempts: number;
  lockout_duration: number;
  first_attempt_at: number;
  last_attempt_at: number;
  locked_until: number;
  created_at: number;
  ip_address: string | null;
  user_agent: string | null;
  notes: string | null;
}

export interface UserSecurityEvent {
  id: string;
  user_id: string | null;
  event_type: string;
  event_subtype: string | null;
  event_status: string;
  event_data: string;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  risk_score: number;
  risk_factors: string;
  created_at: number;
}

export interface EmailSendLog {
  id: string;
  user_id: string | null;
  recipient_email: string;
  email_type: string;
  send_status: string;
  provider: string;
  provider_message_id: string | null;
  subject: string | null;
  send_error: string | null;
  ip_address: string | null;
  rate_limit_key: string | null;
  created_at: number;
  sent_at: number | null;
  delivered_at: number | null;
}

export interface EmailTemplate {
  id: string;
  template_name: string;
  template_type: string;
  subject_template: string;
  html_template: string;
  text_template: string | null;
  required_variables: string;
  optional_variables: string;
  is_active: number;
  version: number;
  created_at: number;
  updated_at: number;
  usage_count: number;
}

export interface SourceStatusCache {
  id: string;
  source_id: string;
  keyword: string;
  keyword_hash: string | null;
  status: string;
  available: number;
  content_match: number;
  response_time: number;
  quality_score: number;
  match_details: string | null;
  page_info: string | null;
  check_error: string | null;
  expires_at: number | null;
  created_at: number;
  last_accessed: number | null;
  access_count: number;
}

export interface SystemConfig {
  key: string;
  value: string;
  description: string | null;
  config_type: string;
  config_group: string | null;
  is_public: number;
  is_sensitive: number;
  is_resettable: number;
  validation_rules: string | null;
  options: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
}

export interface ConfigChangeLog {
  id: string;
  config_key: string;
  old_value: string | null;
  new_value: string;
  change_type: 'create' | 'update' | 'delete' | 'reset';
  changed_by: string | null;
  changed_by_username: string | null;
  change_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
}

export interface ConfigGroup {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
}

export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  session_id: string | null;
  event_type: string;
  event_data: string;
  ip_address: string | null;
  user_agent: string | null;
  referer: string | null;
  created_at: number;
}

export interface JwtPayload {
  userId: string;
  username: string;
  role?: string;
  iat: number;
  exp: number;
}
