-- ===============================================
-- 索引和触发器（整合版）
-- 版本: 4.0
-- 说明: 整合所有索引和触发器定义，去除重复，优化性能
-- 执行顺序: 09（最后执行，确保所有表已创建）
-- ===============================================

-- ===============================================
-- 1. 核心表索引
-- ===============================================

-- 角色表索引
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_priority ON roles(priority);

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;

-- 会话表索引
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- 收藏表索引
CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON user_favorites(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_favorites_keyword ON user_favorites(keyword);
CREATE INDEX IF NOT EXISTS idx_favorites_user_url ON user_favorites(user_id, url);
CREATE INDEX IF NOT EXISTS idx_favorites_code ON user_favorites(code);
CREATE INDEX IF NOT EXISTS idx_user_favorites_status ON user_favorites(user_id, status);

-- 搜索历史表索引
CREATE INDEX IF NOT EXISTS idx_history_user_created ON user_search_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_history_query ON user_search_history(query);
CREATE INDEX IF NOT EXISTS idx_history_source ON user_search_history(source);
CREATE INDEX IF NOT EXISTS idx_history_user_keyword ON user_search_history(user_id, query);
CREATE INDEX IF NOT EXISTS idx_history_code ON user_search_history(code);
CREATE INDEX IF NOT EXISTS idx_history_created_query ON user_search_history(created_at, query);
CREATE INDEX IF NOT EXISTS idx_history_cover ON user_search_history(cover) WHERE cover IS NOT NULL AND cover != '';

-- 用户操作日志表索引
CREATE INDEX IF NOT EXISTS idx_actions_user_created ON user_actions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_actions_action ON user_actions(action);
CREATE INDEX IF NOT EXISTS idx_actions_login ON user_actions(action, created_at);

-- 系统配置表索引
CREATE INDEX IF NOT EXISTS idx_config_public ON system_config(is_public);
CREATE INDEX IF NOT EXISTS idx_config_group ON system_config(config_group);

-- 配置变更日志表索引
CREATE INDEX IF NOT EXISTS idx_config_logs_key ON config_change_logs(config_key);
CREATE INDEX IF NOT EXISTS idx_config_logs_by ON config_change_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_config_logs_created ON config_change_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_config_logs_type ON config_change_logs(change_type);

-- 分析事件表索引
CREATE INDEX IF NOT EXISTS idx_analytics_user_created ON analytics_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);

-- ===============================================
-- 2. 搜索相关表索引
-- ===============================================

-- 大类表索引
CREATE INDEX IF NOT EXISTS idx_major_categories_order ON search_major_categories(display_order, is_active);
CREATE INDEX IF NOT EXISTS idx_major_categories_system ON search_major_categories(is_system, is_active);

-- 分类表索引
CREATE INDEX IF NOT EXISTS idx_source_categories_major ON search_source_categories(major_category_id, display_order);
CREATE INDEX IF NOT EXISTS idx_source_categories_system ON search_source_categories(is_system, is_active);
CREATE INDEX IF NOT EXISTS idx_source_categories_created_by ON search_source_categories(created_by);

-- 搜索源表索引
CREATE INDEX IF NOT EXISTS idx_search_sources_category ON search_sources(category_id, display_order);
CREATE INDEX IF NOT EXISTS idx_search_sources_system ON search_sources(is_system, is_active);
CREATE INDEX IF NOT EXISTS idx_search_sources_searchable ON search_sources(searchable, search_priority);
CREATE INDEX IF NOT EXISTS idx_search_sources_site_type ON search_sources(site_type);
CREATE INDEX IF NOT EXISTS idx_search_sources_created_by ON search_sources(created_by);
CREATE INDEX IF NOT EXISTS idx_search_sources_usage ON search_sources(usage_count DESC);

-- 用户搜索源配置表索引
CREATE INDEX IF NOT EXISTS idx_user_source_configs_user ON user_search_source_configs(user_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_user_source_configs_source ON user_search_source_configs(source_id);

-- 搜索源状态缓存表索引
CREATE INDEX IF NOT EXISTS idx_status_cache_source_keyword ON source_status_cache(source_id, keyword_hash);
CREATE INDEX IF NOT EXISTS idx_status_cache_expires ON source_status_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_status_cache_source ON source_status_cache(source_id);

-- ===============================================
-- 3. 社区相关表索引
-- ===============================================

-- 帖子表索引
CREATE INDEX IF NOT EXISTS idx_posts_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON community_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_posts_status ON community_posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_like_count ON community_posts(like_count DESC);
CREATE INDEX IF NOT EXISTS idx_posts_view_count ON community_posts(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_status ON community_posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_featured ON community_posts(is_featured, created_at DESC);

-- 标签表索引
CREATE INDEX IF NOT EXISTS idx_tags_name ON community_tags(tag_name);
CREATE INDEX IF NOT EXISTS idx_tags_creator ON community_tags(created_by);
CREATE INDEX IF NOT EXISTS idx_tags_active ON community_tags(tag_active);

-- 评论表索引
CREATE INDEX IF NOT EXISTS idx_comments_post ON community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON community_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON community_comments(created_at DESC);

-- 点赞表索引
CREATE INDEX IF NOT EXISTS idx_likes_post ON community_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON community_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_type ON community_likes(like_type);

-- 举报表索引
CREATE INDEX IF NOT EXISTS idx_reports_post ON community_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status);

-- ===============================================
-- 4. 安全相关表索引
-- ===============================================

-- 邮箱验证表索引
CREATE INDEX IF NOT EXISTS idx_email_verifications_email_hash ON email_verifications(email_hash);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_type ON email_verifications(user_id, verification_type);
CREATE INDEX IF NOT EXISTS idx_email_verifications_status ON email_verifications(status);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verifications_created ON email_verifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verifications_code_hash ON email_verifications(code_hash);
CREATE INDEX IF NOT EXISTS idx_email_verifications_type_email ON email_verifications(verification_type, email);

-- 邮箱变更请求表索引
CREATE INDEX IF NOT EXISTS idx_email_change_user_status ON email_change_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_change_new_email ON email_change_requests(new_email_hash);
CREATE INDEX IF NOT EXISTS idx_email_change_expires ON email_change_requests(expires_at);

-- 密码重置日志表索引
CREATE INDEX IF NOT EXISTS idx_password_reset_logs_email ON password_reset_logs(email_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_logs_user ON password_reset_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_logs_status ON password_reset_logs(request_status);
CREATE INDEX IF NOT EXISTS idx_password_reset_logs_created ON password_reset_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_logs_ip ON password_reset_logs(ip_address);

-- 安全锁定表索引
CREATE INDEX IF NOT EXISTS idx_security_lockouts_identifier ON security_lockouts(lockout_type, identifier_hash);
CREATE INDEX IF NOT EXISTS idx_security_lockouts_locked_until ON security_lockouts(locked_until);
CREATE INDEX IF NOT EXISTS idx_security_lockouts_created ON security_lockouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_lockouts_type_identifier ON security_lockouts(lockout_type, identifier);

-- 安全事件表索引
CREATE INDEX IF NOT EXISTS idx_security_events_user ON user_security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON user_security_events(event_type, event_subtype);
CREATE INDEX IF NOT EXISTS idx_security_events_status ON user_security_events(event_status);
CREATE INDEX IF NOT EXISTS idx_security_events_risk ON user_security_events(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON user_security_events(ip_address);

-- 邮件发送日志表索引
CREATE INDEX IF NOT EXISTS idx_email_logs_user_created ON email_send_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_send_logs(recipient_email, email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_send_logs(send_status);
CREATE INDEX IF NOT EXISTS idx_email_logs_rate_limit ON email_send_logs(rate_limit_key, created_at);

-- 邮件模板表索引
CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(template_name);
CREATE INDEX IF NOT EXISTS idx_email_templates_type_active ON email_templates(template_type, is_active);

-- ===============================================
-- 5. 反馈和公告表索引
-- ===============================================

-- 用户反馈表索引
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(type);

-- 公告表索引
CREATE INDEX IF NOT EXISTS idx_site_announcements_active ON site_announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_site_announcements_pinned ON site_announcements(is_pinned);
CREATE INDEX IF NOT EXISTS idx_site_announcements_created_at ON site_announcements(created_at);

-- ===============================================
-- 6. 核心表触发器
-- ===============================================

-- 角色表更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_roles_timestamp
    AFTER UPDATE ON roles
    FOR EACH ROW
    BEGIN
        UPDATE roles SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 用户表更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
        UPDATE users SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 收藏表更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_favorites_timestamp
    AFTER UPDATE ON user_favorites
    FOR EACH ROW
    BEGIN
        UPDATE user_favorites SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 清理过期会话触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
    AFTER INSERT ON user_sessions
    FOR EACH ROW
    BEGIN
        DELETE FROM user_sessions WHERE expires_at < strftime('%s', 'now') * 1000;
    END;

-- ===============================================
-- 7. 搜索相关表触发器
-- ===============================================

-- 大类表更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_major_categories_timestamp
    AFTER UPDATE ON search_major_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_major_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 分类表更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_source_categories_timestamp
    AFTER UPDATE ON search_source_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_source_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 搜索源表更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_search_sources_timestamp
    AFTER UPDATE ON search_sources
    FOR EACH ROW
    BEGIN
        UPDATE search_sources SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 用户搜索源配置表更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_user_source_configs_timestamp
    AFTER UPDATE ON user_search_source_configs
    FOR EACH ROW
    BEGIN
        UPDATE user_search_source_configs SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 清理过期状态缓存触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_status_cache
    AFTER INSERT ON source_status_cache
    FOR EACH ROW
    BEGIN
        DELETE FROM source_status_cache WHERE expires_at < strftime('%s', 'now') * 1000;
    END;

-- 级联删除分类时更新搜索源触发器
CREATE TRIGGER IF NOT EXISTS cascade_delete_category_sources
    AFTER DELETE ON search_source_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_sources
        SET category_id = 'others', updated_at = strftime('%s', 'now') * 1000
        WHERE category_id = OLD.id;
    END;

-- 更新搜索源使用统计触发器
CREATE TRIGGER IF NOT EXISTS update_source_usage_stats
    AFTER INSERT ON user_search_history
    FOR EACH ROW
    WHEN NEW.source IS NOT NULL
    BEGIN
        UPDATE search_sources
        SET usage_count = usage_count + 1,
            last_used_at = strftime('%s', 'now') * 1000,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.source;
    END;

-- 为新用户创建默认搜索源配置触发器
CREATE TRIGGER IF NOT EXISTS create_default_user_source_configs
    AFTER INSERT ON users
    FOR EACH ROW
    BEGIN
        INSERT INTO user_search_source_configs (
            id, user_id, source_id, is_enabled, created_at, updated_at
        )
        SELECT
            NEW.id || '_' || ss.id,
            NEW.id,
            ss.id,
            CASE
                WHEN ss.id IN ('javbus', 'javdb', 'javlibrary', 'btsow') THEN 1
                WHEN ss.searchable = 1 AND ss.site_type = 'search' THEN 1
                WHEN ss.site_type = 'browse' THEN 0
                ELSE 0
            END,
            strftime('%s', 'now') * 1000,
            strftime('%s', 'now') * 1000
        FROM search_sources ss
        WHERE ss.is_system = 1 AND ss.is_active = 1;
    END;

-- ===============================================
-- 8. 社区相关表触发器
-- ===============================================

-- 帖子评论计数触发器（插入）
CREATE TRIGGER IF NOT EXISTS update_post_comment_count_after_insert
    AFTER INSERT ON community_comments
    FOR EACH ROW
    BEGIN
        UPDATE community_posts SET
            comment_count = comment_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.post_id;
    END;

-- 帖子评论计数触发器（删除）
CREATE TRIGGER IF NOT EXISTS update_post_comment_count_after_delete
    AFTER DELETE ON community_comments
    FOR EACH ROW
    BEGIN
        UPDATE community_posts SET
            comment_count = MAX(comment_count - 1, 0),
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = OLD.post_id;
    END;

-- 帖子点赞计数触发器（插入）
CREATE TRIGGER IF NOT EXISTS update_post_like_count_after_insert
    AFTER INSERT ON community_likes
    FOR EACH ROW
    WHEN NEW.like_type = 'like'
    BEGIN
        UPDATE community_posts SET
            like_count = like_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.post_id;
    END;

-- 帖子收藏计数触发器（插入）
CREATE TRIGGER IF NOT EXISTS update_post_favorite_count_after_insert
    AFTER INSERT ON community_likes
    FOR EACH ROW
    WHEN NEW.like_type = 'favorite'
    BEGIN
        UPDATE community_posts SET
            favorite_count = favorite_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.post_id;
    END;

-- 帖子点赞计数触发器（删除）
CREATE TRIGGER IF NOT EXISTS update_post_like_count_after_delete
    AFTER DELETE ON community_likes
    FOR EACH ROW
    WHEN OLD.like_type = 'like'
    BEGIN
        UPDATE community_posts SET
            like_count = MAX(like_count - 1, 0),
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = OLD.post_id;
    END;

-- 帖子收藏计数触发器（删除）
CREATE TRIGGER IF NOT EXISTS update_post_favorite_count_after_delete
    AFTER DELETE ON community_likes
    FOR EACH ROW
    WHEN OLD.like_type = 'favorite'
    BEGIN
        UPDATE community_posts SET
            favorite_count = MAX(favorite_count - 1, 0),
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = OLD.post_id;
    END;

-- 用户统计触发器：发布帖子后更新
CREATE TRIGGER IF NOT EXISTS update_user_stats_after_post
    AFTER INSERT ON community_posts
    FOR EACH ROW
    WHEN NEW.status = 'active'
    BEGIN
        INSERT OR IGNORE INTO community_user_stats (
            id, user_id, posts_count, likes_received, favorites_received,
            comments_count, reputation_score, contribution_level, created_at, updated_at
        ) VALUES (
            NEW.user_id || '_stats', NEW.user_id, 0, 0, 0, 0, 0, 'beginner',
            strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000
        );
        UPDATE community_user_stats SET
            posts_count = posts_count + 1,
            reputation_score = reputation_score + 5,
            contribution_level = CASE
                WHEN posts_count + 1 >= 50 THEN 'master'
                WHEN posts_count + 1 >= 20 THEN 'expert'
                WHEN posts_count + 1 >= 5 THEN 'contributor'
                ELSE 'beginner'
            END,
            updated_at = strftime('%s', 'now') * 1000
        WHERE user_id = NEW.user_id;
    END;

-- 用户统计触发器：收到点赞后更新
CREATE TRIGGER IF NOT EXISTS update_user_stats_after_like
    AFTER INSERT ON community_likes
    FOR EACH ROW
    WHEN NEW.like_type = 'like'
    BEGIN
        INSERT OR IGNORE INTO community_user_stats (
            id, user_id, posts_count, likes_received, favorites_received,
            comments_count, reputation_score, contribution_level, created_at, updated_at
        ) VALUES (
            (SELECT user_id || '_stats' FROM community_posts WHERE id = NEW.post_id),
            (SELECT user_id FROM community_posts WHERE id = NEW.post_id),
            0, 0, 0, 0, 0, 'beginner',
            strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000
        );
        UPDATE community_user_stats SET
            likes_received = likes_received + 1,
            reputation_score = reputation_score + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE user_id = (SELECT user_id FROM community_posts WHERE id = NEW.post_id);
    END;

-- 用户统计触发器：收到收藏后更新
CREATE TRIGGER IF NOT EXISTS update_user_stats_after_favorite
    AFTER INSERT ON community_likes
    FOR EACH ROW
    WHEN NEW.like_type = 'favorite'
    BEGIN
        INSERT OR IGNORE INTO community_user_stats (
            id, user_id, posts_count, likes_received, favorites_received,
            comments_count, reputation_score, contribution_level, created_at, updated_at
        ) VALUES (
            (SELECT user_id || '_stats' FROM community_posts WHERE id = NEW.post_id),
            (SELECT user_id FROM community_posts WHERE id = NEW.post_id),
            0, 0, 0, 0, 0, 'beginner',
            strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000
        );
        UPDATE community_user_stats SET
            favorites_received = favorites_received + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE user_id = (SELECT user_id FROM community_posts WHERE id = NEW.post_id);
    END;

-- 用户统计触发器：发表评论后更新
CREATE TRIGGER IF NOT EXISTS update_user_stats_after_comment
    AFTER INSERT ON community_comments
    FOR EACH ROW
    BEGIN
        INSERT OR IGNORE INTO community_user_stats (
            id, user_id, posts_count, likes_received, favorites_received,
            comments_count, reputation_score, contribution_level, created_at, updated_at
        ) VALUES (
            NEW.user_id || '_stats', NEW.user_id, 0, 0, 0, 0, 0, 'beginner',
            strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000
        );
        UPDATE community_user_stats SET
            comments_count = comments_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE user_id = NEW.user_id;
    END;

-- ===============================================
-- 9. 安全相关表触发器
-- ===============================================

-- 清理过期邮箱验证触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_verifications
    AFTER INSERT ON email_verifications
    FOR EACH ROW
    BEGIN
        DELETE FROM email_verifications
        WHERE expires_at < strftime('%s', 'now') * 1000
        AND status = 'pending';
    END;

-- 清理过期邮箱变更请求触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_email_changes
    AFTER INSERT ON email_change_requests
    FOR EACH ROW
    BEGIN
        DELETE FROM email_change_requests
        WHERE expires_at < strftime('%s', 'now') * 1000
        AND status = 'pending';
    END;

-- 邮件模板更新时间戳触发器
CREATE TRIGGER IF NOT EXISTS update_email_template_timestamp
    AFTER UPDATE ON email_templates
    FOR EACH ROW
    BEGIN
        UPDATE email_templates SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

-- 清理过期安全锁定触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_security_lockouts
    AFTER INSERT ON security_lockouts
    FOR EACH ROW
    BEGIN
        DELETE FROM security_lockouts
        WHERE locked_until < strftime('%s', 'now') * 1000;
    END;

-- 邮件模板使用计数触发器
CREATE TRIGGER IF NOT EXISTS update_email_template_usage_on_send
    AFTER INSERT ON email_send_logs
    FOR EACH ROW
    WHEN NEW.template_name IS NOT NULL
    BEGIN
        UPDATE email_templates
        SET usage_count = usage_count + 1
        WHERE template_name = NEW.template_name;
    END;