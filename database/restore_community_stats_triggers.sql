-- ===============================================
-- 社区 v3.0 用户统计触发器恢复补丁
-- 说明: 之前因 FTS5 SQLITE_MISMATCH 问题连带删除了统计触发器
--       现在 FTS5 已移除，使用简化版两步模式重新创建
-- 执行方式: wrangler d1 execute <DB_NAME> --file=./database/restore_community_stats_triggers.sql
-- ===============================================

-- 4个用户统计触发器（简化版：INSERT OR IGNORE + UPDATE 两步模式）

-- 触发器：发布帖子后更新用户统计
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

-- 触发器：收到点赞后更新帖子作者统计
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

-- 触发器：收到收藏后更新帖子作者统计
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

-- 触发器：发表评论后更新评论者统计
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

-- 验证：确认所有触发器已创建
SELECT name, type FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'update_%';
