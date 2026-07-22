-- ===============================================
-- 社区功能表结构（资源分享重构版）
-- 版本: 3.0
-- 说明: 从"搜索源分享"重构为"资源分享"，支持 JAV/动漫/电影等资源分享
-- 执行顺序: 03
-- ===============================================

-- ===============================================
-- 1. 社区标签管理（简化版）
-- 用途: 管理社区资源的分类标签
-- ===============================================

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

-- ===============================================
-- 2. 资源帖子主表（核心表）
-- 用途: 存储用户分享的各种类型资源帖子
-- ===============================================

CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY,                        -- 帖子唯一标识
    user_id TEXT NOT NULL,                      -- 发布者用户ID
    post_type TEXT NOT NULL CHECK (post_type IN ('jav', 'anime', 'movie')), -- 资源类型
    title TEXT NOT NULL,                        -- 帖子标题
    cover_image TEXT NOT NULL,                  -- 封面图片URL
    content_data TEXT NOT NULL,                 -- JSON存储原始搜索结果详情
    caption TEXT DEFAULT '',                    -- 用户推荐语
    tags TEXT DEFAULT '[]',                     -- JSON数组存储标签ID列表
    view_count INTEGER DEFAULT 0,               -- 浏览次数
    like_count INTEGER DEFAULT 0,               -- 点赞次数
    comment_count INTEGER DEFAULT 0,            -- 评论次数
    favorite_count INTEGER DEFAULT 0,           -- 收藏次数
    share_count INTEGER DEFAULT 0,              -- 分享次数
    status TEXT DEFAULT 'active',               -- 状态（active/pending/rejected/hidden）
    is_featured INTEGER DEFAULT 0,              -- 是否精选推荐（1:是 0:否）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ===============================================
-- 3. 评论管理（简化为纯文本评论）
-- 用途: 存储用户对帖子的文字评论
-- ===============================================

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

-- ===============================================
-- 4. 点赞与收藏
-- 用途: 记录用户对帖子的点赞和收藏操作
-- ===============================================

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

-- ===============================================
-- 5. 举报管理
-- 用途: 记录对违规帖子的举报信息
-- ===============================================

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

-- ===============================================
-- 6. 用户统计
-- 用途: 统计用户在社区的贡献数据
-- ===============================================

CREATE TABLE IF NOT EXISTS community_user_stats (
    id TEXT PRIMARY KEY,                        -- 统计记录唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    posts_count INTEGER DEFAULT 0,              -- 发布的帖子数量
    likes_received INTEGER DEFAULT 0,           -- 收获的点赞数
    favorites_received INTEGER DEFAULT 0,       -- 收获的收藏数
    comments_count INTEGER DEFAULT 0,           -- 发表的评论数
    reputation_score INTEGER DEFAULT 0,         -- 声誉积分
    contribution_level TEXT DEFAULT 'beginner', -- 贡献等级（beginner/contributor/expert/master）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id)
);

-- ===============================================
-- 7. 删除旧表（从搜索源分享迁移时需要清理）
-- ===============================================

DROP TABLE IF EXISTS community_source_downloads;
DROP TABLE IF EXISTS community_shared_sources;