-- Atlas 数据库迁移 0003 · Community：社区标签 / 帖子 / 评论 / 点赞 / 举报 / 浏览去重
--
-- 由历史脚本 04 合并为幂等终态结构，不包含默认标签数据。
-- 全部对象使用 IF NOT EXISTS，可在已有生产库上直接执行；种子数据在 database/seeds/。

-- ── 表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_comments (
    id TEXT PRIMARY KEY,                        -- 评论唯一标识
    post_id TEXT NOT NULL,                      -- 关联帖子ID
    user_id TEXT NOT NULL,                      -- 评论者用户ID
    content TEXT NOT NULL,                      -- 评论内容
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_likes (
    id TEXT PRIMARY KEY,                        -- 操作记录唯一标识
    post_id TEXT NOT NULL,                      -- 关联帖子ID
    user_id TEXT NOT NULL,                      -- 操作用户ID
    like_type TEXT NOT NULL CHECK (like_type IN ('like', 'favorite')), -- 操作类型
    created_at INTEGER NOT NULL,                -- 创建时间戳
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(post_id, user_id, like_type)         -- 确保用户对同一帖子的同一种操作只能执行一次
);

CREATE TABLE IF NOT EXISTS community_post_views (
    user_id TEXT NOT NULL,                      -- 浏览用户ID
    post_id TEXT NOT NULL,                      -- 被浏览帖子ID
    last_viewed_at INTEGER NOT NULL,            -- 最近一次计入浏览量的时间戳（毫秒）
    PRIMARY KEY (user_id, post_id),             -- 保证用户+帖子唯一，便于 upsert 去重
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY,                        -- 帖子唯一标识
    user_id TEXT NOT NULL,                      -- 发布者用户ID
    post_type TEXT NOT NULL CHECK (post_type IN ('jav', 'anime', 'movie', 'manga', 'novel', 'actress')), -- 资源类型
    title TEXT NOT NULL,                        -- 帖子标题
    cover_image TEXT NOT NULL,                  -- 封面图片URL
    content_data TEXT NOT NULL,                 -- JSON存储原始搜索结果详情
    caption TEXT DEFAULT '',                    -- 用户推荐语
    tags TEXT DEFAULT '[]',                     -- JSON数组存储标签ID列表
    view_count INTEGER DEFAULT 0,               -- 浏览次数
    like_count INTEGER DEFAULT 0,               -- 点赞次数
    comment_count INTEGER DEFAULT 0,            -- 评论次数
    favorite_count INTEGER DEFAULT 0,           -- 收藏次数
    status TEXT DEFAULT 'active',               -- 状态（active/pending/rejected/hidden）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_reports (
    id TEXT PRIMARY KEY,                        -- 举报记录唯一标识
    post_id TEXT NOT NULL,                      -- 被举报的帖子ID
    reporter_user_id TEXT NOT NULL,             -- 举报人用户ID
    report_reason TEXT NOT NULL,                -- 举报原因
    report_details TEXT,                        -- 举报详情
    status TEXT DEFAULT 'pending',              -- 处理状态（pending/resolved/dismissed）
    admin_user_id TEXT,                         -- 处理管理员ID
    admin_action TEXT,                          -- 管理员操作
    admin_notes TEXT,                           -- 管理员备注
    resolved_at INTEGER,                        -- 处理完成时间
    created_at INTEGER NOT NULL,                -- 举报时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS community_tags (
    id TEXT PRIMARY KEY,                        -- 标签唯一标识
    tag_name TEXT UNIQUE NOT NULL,              -- 标签名称（唯一）
    tag_description TEXT,                       -- 标签描述
    tag_color TEXT DEFAULT '#3b82f6',           -- 标签颜色
    tag_active INTEGER DEFAULT 1,               -- 是否激活（1:激活 0:禁用）
    created_by TEXT,                            -- 创建者用户ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);

-- ── 索引 ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_comments_created ON community_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_post ON community_comments(post_id);

CREATE INDEX IF NOT EXISTS idx_comments_post_created
    ON community_comments(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_user ON community_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_likes_post ON community_likes(post_id);

CREATE INDEX IF NOT EXISTS idx_likes_post_type ON community_likes(post_id, like_type);

CREATE INDEX IF NOT EXISTS idx_likes_type ON community_likes(like_type);

CREATE INDEX IF NOT EXISTS idx_likes_user ON community_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_likes_user_type_created
  ON community_likes(user_id, like_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_views_last_viewed
    ON community_post_views(last_viewed_at);

CREATE INDEX IF NOT EXISTS idx_post_views_post ON community_post_views(post_id);

CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_like_count ON community_posts(like_count DESC);

CREATE INDEX IF NOT EXISTS idx_posts_status ON community_posts(status);

CREATE INDEX IF NOT EXISTS idx_posts_status_created
    ON community_posts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_status_hot
  ON community_posts(status, like_count DESC, view_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_type ON community_posts(post_type);

CREATE INDEX IF NOT EXISTS idx_posts_user ON community_posts(user_id);

CREATE INDEX IF NOT EXISTS idx_posts_user_status ON community_posts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_posts_view_count ON community_posts(view_count DESC);

CREATE INDEX IF NOT EXISTS idx_reports_post ON community_reports(post_id);

CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status);

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON community_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tags_active ON community_tags(tag_active);

CREATE INDEX IF NOT EXISTS idx_tags_creator ON community_tags(created_by);

CREATE INDEX IF NOT EXISTS idx_tags_name ON community_tags(tag_name);

-- ── 触发器 ────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS update_post_comment_count_after_delete
    AFTER DELETE ON community_comments
    FOR EACH ROW
    BEGIN
        UPDATE community_posts SET
            comment_count = MAX(comment_count - 1, 0),
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = OLD.post_id;
    END;

CREATE TRIGGER IF NOT EXISTS update_post_comment_count_after_insert
    AFTER INSERT ON community_comments
    FOR EACH ROW
    BEGIN
        UPDATE community_posts SET
            comment_count = comment_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.post_id;
    END;

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

