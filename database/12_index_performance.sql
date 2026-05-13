-- ===============================================
-- 查询性能索引
-- 版本: 3.0
-- 说明: 为高频查询字段添加索引以提升 D1 查询性能
-- 执行顺序: 12（最后执行，不影响 schema）
-- ===============================================

-- 登录/注册查询
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- 会话验证
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 收藏查询
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);

-- 搜索历史查询
CREATE INDEX IF NOT EXISTS idx_user_search_history_user_id ON user_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_search_history_created_at ON user_search_history(created_at);

-- 搜索源用户配置
CREATE INDEX IF NOT EXISTS idx_user_source_configs_user_id ON user_search_source_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_source_configs_source_id ON user_search_source_configs(source_id);

-- 邮箱验证查询
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_type_email ON email_verifications(verification_type, email);

-- 安全锁定查询
CREATE INDEX IF NOT EXISTS idx_security_lockouts_type_identifier ON security_lockouts(lockout_type, identifier);

-- 安全事件查询
CREATE INDEX IF NOT EXISTS idx_user_security_events_user_id ON user_security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_security_events_created_at ON user_security_events(created_at);

-- 用户操作日志
CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_created_at ON user_actions(created_at);

-- 邮箱更改请求
CREATE INDEX IF NOT EXISTS idx_email_change_requests_user_id ON email_change_requests(user_id);

-- 密码重置日志
CREATE INDEX IF NOT EXISTS idx_password_reset_logs_user_id ON password_reset_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_logs_email ON password_reset_logs(email);

-- 社区共享搜索源
CREATE INDEX IF NOT EXISTS idx_community_shared_sources_user_id ON community_shared_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_community_shared_sources_status ON community_shared_sources(status);

-- 社区互动
CREATE INDEX IF NOT EXISTS idx_community_source_reviews_source ON community_source_reviews(shared_source_id);
CREATE INDEX IF NOT EXISTS idx_community_source_likes_source ON community_source_likes(shared_source_id);
CREATE INDEX IF NOT EXISTS idx_community_source_reports_source ON community_source_reports(shared_source_id);