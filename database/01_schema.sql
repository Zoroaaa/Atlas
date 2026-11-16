-- Atlas 数据库初始化：最终表结构
-- 由历史迁移脚本汇总生成，仅包含 CREATE 语句，无 ALTER / DROP。
-- 适用于全新 D1 数据库，执行顺序：01_schema.sql → 02_data.sql。

PRAGMA foreign_keys = OFF;

CREATE TABLE roles (
    id TEXT PRIMARY KEY,                        -- 角色唯一标识
    name TEXT UNIQUE NOT NULL,                  -- 角色名称（如 admin, super_admin, user）
    display_name TEXT NOT NULL,                 -- 显示名称（如 管理员, 超级管理员, 普通用户）
    description TEXT,                           -- 角色描述
    is_system INTEGER DEFAULT 0,                -- 是否系统内置角色（不可删除）
    priority INTEGER DEFAULT 0,                 -- 角色优先级（数字越大权限越高）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);
CREATE TABLE users (
    id TEXT PRIMARY KEY,                        -- 用户唯一标识
    username TEXT UNIQUE NOT NULL,              -- 用户名（唯一）
    email TEXT UNIQUE NOT NULL,                 -- 邮箱（唯一）
    password_hash TEXT NOT NULL,                -- 密码哈希值
    role_id TEXT DEFAULT 'user',                -- 关联角色ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    settings TEXT DEFAULT '{}',                 -- 用户设置（JSON对象）
    is_active INTEGER DEFAULT 1,                -- 是否激活（1:激活 0:禁用）
    last_login INTEGER,                         -- 最后登录时间
    login_count INTEGER DEFAULT 0,              -- 登录次数统计
    email_verified INTEGER DEFAULT 0,           -- 0:未验证 1:已验证
    last_password_change INTEGER,               -- 最后密码修改时间
    search_tier INTEGER DEFAULT 1,              -- 搜索限流档位（只升不降）
    tier_updated_at INTEGER,                    -- 档位最近评估时间戳（毫秒）
    -- GitHub OAuth 扩展字段
    github_id TEXT,                             -- GitHub用户ID
    github_username TEXT,                       -- GitHub用户名（用于展示）
    -- Google OAuth 扩展字段
    google_id TEXT,                             -- Google用户唯一ID（sub）
    google_username TEXT,                       -- Google用户展示名
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE SET DEFAULT
);
CREATE TABLE user_sessions (
    id TEXT PRIMARY KEY,                        -- 会话唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    token_hash TEXT NOT NULL,                   -- 会话token哈希值
    expires_at INTEGER NOT NULL,                -- 过期时间戳
    created_at INTEGER NOT NULL,                -- 创建时间戳
    last_activity INTEGER NOT NULL,             -- 最后活动时间
    ip_address TEXT,                            -- 登录IP地址
    user_agent TEXT,                            -- 用户代理信息
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE user_favorites (
    id TEXT PRIMARY KEY,                        -- 收藏记录唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    title TEXT NOT NULL,                        -- 收藏项标题
    subtitle TEXT,                              -- 收藏项副标题
    url TEXT NOT NULL,                          -- 收藏项URL
    icon TEXT,                                  -- 收藏项图标
    keyword TEXT,                               -- 关联关键词
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    -- JAV 元数据扩展字段
    code TEXT,                                  -- 番号
    cover TEXT,                                 -- 封面图URL
    actors TEXT,                                -- 演员（JSON数组或逗号分隔）
    duration TEXT,                              -- 时长
    tags TEXT,                                  -- 类别标签（JSON数组或逗号分隔）
    release_date TEXT,                          -- 发行时间
    publisher TEXT,                             -- 发行商
    magnet_link TEXT,                           -- 磁力链接
    -- 状态字段
    status TEXT NOT NULL DEFAULT 'want',        -- 状态: want | have | watching
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE user_search_history (
    id TEXT PRIMARY KEY,                        -- 搜索记录唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    query TEXT NOT NULL,                        -- 搜索查询词（兼容性字段，与keyword相同）
    source TEXT DEFAULT 'unknown',              -- 搜索来源
    results_count INTEGER DEFAULT 0,            -- 搜索结果数量
    created_at INTEGER NOT NULL,                -- 创建时间戳
    -- 详细信息扩展字段
    title TEXT,                                 -- 标题
    subtitle TEXT,                              -- 副标题
    code TEXT,                                  -- 番号
    actors TEXT,                                -- 演员
    duration TEXT,                              -- 时长
    tags TEXT,                                  -- 标签
    release_date TEXT,                          -- 发行时间
    publisher TEXT,                             -- 发行商
    keyword TEXT,                               -- 搜索关键词（@deprecated 使用 query 字段）
    updated_at INTEGER,                         -- 更新时间戳
    -- 封面字段
    cover TEXT,                                 -- 封面图URL
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE user_actions (
    id TEXT PRIMARY KEY,                        -- 行为记录唯一标识
    user_id TEXT,                               -- 关联用户ID（可为空，记录匿名行为）
    action TEXT NOT NULL,                       -- 行为类型
    data TEXT DEFAULT '{}',                     -- 行为数据（JSON格式）
    ip_address TEXT,                            -- 用户IP地址
    user_agent TEXT,                            -- 用户代理信息
    created_at INTEGER NOT NULL,                -- 创建时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE system_config (
    key TEXT PRIMARY KEY,                       -- 配置键名
    value TEXT NOT NULL,                        -- 配置值
    description TEXT,                           -- 配置描述
    config_type TEXT DEFAULT 'string',          -- 配置类型（string/integer/boolean/json/float）
    config_group TEXT DEFAULT 'other',          -- 配置分组
    validation_rules TEXT,                      -- 配置验证规则（JSON格式）
    options TEXT,                               -- 配置选项（用于下拉选择等，JSON格式）
    is_public INTEGER DEFAULT 0,                -- 是否公开（1:公开 0:私有）
    is_resettable INTEGER DEFAULT 1,            -- 是否可重置
    is_sensitive INTEGER DEFAULT 0,             -- 是否敏感配置
    display_order INTEGER DEFAULT 0,            -- 排序顺序
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);
CREATE TABLE config_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE config_change_logs (
    id TEXT PRIMARY KEY,                        -- 日志唯一标识
    config_key TEXT NOT NULL,                   -- 配置键名
    old_value TEXT,                             -- 旧值
    new_value TEXT NOT NULL,                    -- 新值
    change_type TEXT NOT NULL,                  -- 变更类型（create/update/delete/reset）
    changed_by TEXT,                            -- 变更人用户ID
    changed_by_username TEXT,                   -- 变更人用户名
    change_reason TEXT,                         -- 变更原因
    ip_address TEXT,                            -- 变更IP地址
    user_agent TEXT,                            -- 用户代理
    created_at INTEGER NOT NULL,                -- 创建时间戳
    FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE analytics_events (
    id TEXT PRIMARY KEY,                        -- 事件唯一标识
    user_id TEXT,                               -- 关联用户ID（可为空，记录匿名事件）
    session_id TEXT,                            -- 会话ID
    event_type TEXT NOT NULL,                   -- 事件类型
    event_data TEXT DEFAULT '{}',               -- 事件数据（JSON格式）
    ip_address TEXT,                            -- 用户IP地址
    user_agent TEXT,                            -- 用户代理信息
    referer TEXT,                               -- 来源页面
    created_at INTEGER NOT NULL,                -- 事件发生时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE search_major_categories (
    id TEXT PRIMARY KEY,                        -- 大类唯一标识
    name TEXT NOT NULL,                         -- 大类名称
    description TEXT,                           -- 大类描述
    icon TEXT DEFAULT '🌟',                     -- 大类图标
    color TEXT DEFAULT '#6b7280',               -- 大类颜色
    display_order INTEGER DEFAULT 999,          -- 显示顺序
    is_system INTEGER DEFAULT 0,                -- 是否系统大类(1:系统 0:自定义)
    is_active INTEGER DEFAULT 1,                -- 是否激活(1:激活 0:禁用)
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);
CREATE TABLE search_source_categories (
    id TEXT PRIMARY KEY,                        -- 分类唯一标识
    major_category_id TEXT NOT NULL,            -- 关联大类ID
    name TEXT NOT NULL,                         -- 分类名称
    description TEXT,                           -- 分类描述
    icon TEXT DEFAULT '📁',                     -- 分类图标
    color TEXT DEFAULT '#3b82f6',               -- 分类颜色
    display_order INTEGER DEFAULT 999,          -- 显示顺序
    is_system INTEGER DEFAULT 0,                -- 是否系统分类(1:系统 0:自定义)
    is_active INTEGER DEFAULT 1,                -- 是否激活(1:激活 0:禁用)
    default_searchable INTEGER DEFAULT 1,       -- 该分类下的源默认是否可搜索
    default_site_type TEXT DEFAULT 'search',    -- 默认网站类型(search/browse/reference)
    search_priority INTEGER DEFAULT 5,          -- 搜索优先级(1-10)
    created_by TEXT,                            -- 创建者ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (major_category_id) REFERENCES search_major_categories (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE search_sources (
    id TEXT PRIMARY KEY,                        -- 搜索源唯一标识
    category_id TEXT NOT NULL,                  -- 关联分类ID
    name TEXT NOT NULL,                         -- 搜索源名称
    subtitle TEXT,                              -- 搜索源副标题
    description TEXT,                           -- 搜索源描述
    icon TEXT DEFAULT '🔍',                     -- 搜索源图标
    url_template TEXT NOT NULL,                 -- URL模板
    homepage_url TEXT,                          -- 主页URL
    site_type TEXT DEFAULT 'search',            -- 网站类型(跟随分类的default_site_type，不可独立修改)
    searchable INTEGER DEFAULT 1,               -- 是否参与搜索(1:参与 0:不参与)，需与分类default_searchable同时为1才生效
    search_priority INTEGER DEFAULT 5,          -- 搜索优先级(1-10)
    is_system INTEGER DEFAULT 0,                -- 是否系统搜索源(1:系统 0:自定义)
    is_active INTEGER DEFAULT 1,                -- 是否激活(1:激活 0:禁用)
    display_order INTEGER DEFAULT 999,          -- 显示顺序
    usage_count INTEGER DEFAULT 0,              -- 使用次数
    last_used_at INTEGER,                       -- 最后使用时间
    created_by TEXT,                            -- 创建者ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (category_id) REFERENCES search_source_categories (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE user_search_source_configs (
    id TEXT PRIMARY KEY,                        -- 配置唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    source_id TEXT NOT NULL,                    -- 关联搜索源ID
    is_enabled INTEGER DEFAULT 1,               -- 是否启用(1:启用 0:禁用)
    custom_priority INTEGER,                    -- 自定义优先级
    custom_name TEXT,                           -- 自定义名称
    custom_subtitle TEXT,                       -- 自定义副标题
    custom_icon TEXT,                           -- 自定义图标
    notes TEXT,                                 -- 用户备注
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    UNIQUE(user_id, source_id),                 -- 用户+搜索源唯一
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES search_sources (id) ON DELETE CASCADE
);
CREATE TABLE source_status_cache (
    id TEXT PRIMARY KEY,                        -- 状态缓存唯一标识
    source_id TEXT NOT NULL,                    -- 搜索源ID
    keyword TEXT NOT NULL,                      -- 检查关键词
    keyword_hash TEXT NOT NULL,                 -- 关键词哈希值
    status TEXT NOT NULL DEFAULT 'unknown',     -- 状态（unknown/available/unavailable）
    available INTEGER DEFAULT 0,                -- 是否可用（1:可用 0:不可用）
    content_match INTEGER DEFAULT 0,            -- 内容匹配度
    response_time INTEGER DEFAULT 0,            -- 响应时间（毫秒）
    quality_score INTEGER DEFAULT 0,            -- 质量评分
    match_details TEXT DEFAULT '{}',            -- 匹配详情（JSON格式）
    page_info TEXT DEFAULT '{}',                -- 页面信息（JSON格式）
    check_error TEXT,                           -- 检查错误信息
    expires_at INTEGER NOT NULL,                -- 缓存过期时间
    created_at INTEGER NOT NULL,                -- 创建时间戳
    last_accessed INTEGER NOT NULL,             -- 最后访问时间
    access_count INTEGER DEFAULT 0              -- 访问次数统计
);
CREATE TABLE community_tags (
    id TEXT PRIMARY KEY,                        -- 标签唯一标识
    tag_name TEXT UNIQUE NOT NULL,              -- 标签名称（唯一）
    tag_description TEXT,                       -- 标签描述
    tag_color TEXT DEFAULT '#3b82f6',           -- 标签颜色
    tag_active INTEGER DEFAULT 1,               -- 是否激活（1:激活 0:禁用）
    created_by TEXT,                            -- 创建者用户ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);
CREATE TABLE community_posts (
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
CREATE TABLE community_comments (
    id TEXT PRIMARY KEY,                        -- 评论唯一标识
    post_id TEXT NOT NULL,                      -- 关联帖子ID
    user_id TEXT NOT NULL,                      -- 评论者用户ID
    content TEXT NOT NULL,                      -- 评论内容
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE community_likes (
    id TEXT PRIMARY KEY,                        -- 操作记录唯一标识
    post_id TEXT NOT NULL,                      -- 关联帖子ID
    user_id TEXT NOT NULL,                      -- 操作用户ID
    like_type TEXT NOT NULL CHECK (like_type IN ('like', 'favorite')), -- 操作类型
    created_at INTEGER NOT NULL,                -- 创建时间戳
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(post_id, user_id, like_type)         -- 确保用户对同一帖子的同一种操作只能执行一次
);
CREATE TABLE community_reports (
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
CREATE TABLE email_verifications (
    id TEXT PRIMARY KEY,                        -- 验证记录唯一标识
    user_id TEXT,                               -- 关联用户ID（注册验证时可为空）
    email TEXT NOT NULL,                        -- 要验证的邮箱地址
    email_hash TEXT NOT NULL,                   -- 邮箱哈希值（用于索引）
    verification_code TEXT NOT NULL,            -- 6位数字验证码
    code_hash TEXT NOT NULL,                    -- 验证码哈希值
    verification_type TEXT NOT NULL,            -- 验证类型：registration/email_change/password_reset/account_delete
    status TEXT DEFAULT 'pending',              -- 状态：pending/used/expired/failed
    ip_address TEXT,                            -- 申请验证的IP地址
    user_agent TEXT,                            -- 用户代理信息
    attempt_count INTEGER DEFAULT 0,            -- 验证尝试次数
    max_attempts INTEGER DEFAULT 3,             -- 最大尝试次数
    expires_at INTEGER NOT NULL,                -- 验证码过期时间（通常5-15分钟）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    used_at INTEGER,                            -- 使用时间戳
    last_attempt_at INTEGER,                    -- 最后尝试时间
    metadata TEXT DEFAULT '{}',                 -- 附加信息（JSON格式）
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE email_change_requests (
    id TEXT PRIMARY KEY,                        -- 请求唯一标识
    user_id TEXT NOT NULL,                      -- 用户ID
    old_email TEXT NOT NULL,                    -- 原邮箱地址
    new_email TEXT NOT NULL,                    -- 新邮箱地址
    new_email_hash TEXT NOT NULL,               -- 新邮箱哈希
    old_email_verified INTEGER DEFAULT 0,       -- 原邮箱是否已验证
    new_email_verified INTEGER DEFAULT 0,       -- 新邮箱是否已验证
    status TEXT DEFAULT 'pending',              -- pending/completed/expired/cancelled
    old_email_verification_id TEXT,             -- 原邮箱验证记录ID
    new_email_verification_id TEXT,             -- 新邮箱验证记录ID
    expires_at INTEGER NOT NULL,                -- 整个请求过期时间（通常30分钟）
    created_at INTEGER NOT NULL,                -- 创建时间
    updated_at INTEGER,                         -- 更新时间
    completed_at INTEGER,                       -- 完成时间
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (old_email_verification_id) REFERENCES email_verifications (id) ON DELETE SET NULL,
    FOREIGN KEY (new_email_verification_id) REFERENCES email_verifications (id) ON DELETE SET NULL
);
CREATE TABLE password_reset_logs (
    id TEXT PRIMARY KEY,                        -- 重置记录唯一标识
    user_id TEXT,                               -- 用户ID（可能为空，用于记录未找到用户的情况）
    email TEXT NOT NULL,                        -- 请求重置的邮箱
    email_hash TEXT NOT NULL,                   -- 邮箱哈希（用于索引）
    request_type TEXT NOT NULL,                 -- 请求类型：forgot_password/change_password
    request_status TEXT DEFAULT 'initiated',    -- 状态：initiated/code_sent/code_verified/completed/failed
    ip_address TEXT,                            -- 请求IP地址
    user_agent TEXT,                            -- 用户代理
    verification_code_sent INTEGER DEFAULT 0,   -- 是否已发送验证码
    verification_attempts INTEGER DEFAULT 0,    -- 验证尝试次数
    created_at INTEGER NOT NULL,                -- 创建时间戳
    code_sent_at INTEGER,                       -- 验证码发送时间
    verified_at INTEGER,                        -- 验证成功时间
    completed_at INTEGER,                       -- 重置完成时间
    verification_id TEXT,                       -- 关联的邮箱验证记录ID
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY (verification_id) REFERENCES email_verifications (id) ON DELETE SET NULL
);
CREATE TABLE security_lockouts (
    id TEXT PRIMARY KEY,                        -- 锁定记录唯一标识
    lockout_type TEXT NOT NULL,                 -- 锁定类型：password_reset/login/verification
    identifier TEXT NOT NULL,                   -- 标识符（邮箱/IP等）
    identifier_hash TEXT NOT NULL,              -- 标识符哈希
    attempt_count INTEGER DEFAULT 1,            -- 尝试次数
    max_attempts INTEGER NOT NULL,              -- 最大允许次数
    lockout_duration INTEGER NOT NULL,          -- 锁定持续时间（毫秒）
    first_attempt_at INTEGER NOT NULL,          -- 首次尝试时间
    last_attempt_at INTEGER NOT NULL,           -- 最后尝试时间
    locked_until INTEGER NOT NULL,              -- 锁定到什么时候
    created_at INTEGER NOT NULL,                -- 创建时间戳
    ip_address TEXT,                            -- 相关IP地址
    user_agent TEXT,                            -- 用户代理
    notes TEXT,                                 -- 备注信息
    UNIQUE(lockout_type, identifier_hash)
);
CREATE TABLE user_security_events (
    id TEXT PRIMARY KEY,                        -- 事件唯一标识
    user_id TEXT,                               -- 用户ID（可能为空）
    event_type TEXT NOT NULL,                   -- 事件类型
    event_subtype TEXT,                         -- 事件子类型
    event_status TEXT DEFAULT 'success',        -- 事件状态：success/failed/blocked
    event_data TEXT DEFAULT '{}',               -- 事件数据（JSON格式）
    ip_address TEXT,                            -- IP地址
    user_agent TEXT,                            -- 用户代理
    session_id TEXT,                            -- 会话ID
    risk_score INTEGER DEFAULT 0,               -- 风险评分（0-100）
    risk_factors TEXT DEFAULT '[]',             -- 风险因素（JSON数组）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE email_send_logs (
    id TEXT PRIMARY KEY,                        -- 发送记录唯一标识
    user_id TEXT,                               -- 关联用户ID
    recipient_email TEXT NOT NULL,              -- 收件人邮箱
    email_type TEXT NOT NULL,                   -- 邮件类型：verification/password_reset/email_change/account_delete
    send_status TEXT NOT NULL,                  -- 发送状态：pending/sent/failed/delivered/bounced
    provider TEXT DEFAULT 'resend',             -- 邮件服务商
    provider_message_id TEXT,                   -- 服务商消息ID
    template_name TEXT,                         -- 使用的模板名称
    subject TEXT,                               -- 邮件主题
    send_error TEXT,                            -- 发送错误信息
    ip_address TEXT,                            -- 发送请求的IP
    rate_limit_key TEXT,                        -- 限流键
    created_at INTEGER NOT NULL,                -- 创建时间
    sent_at INTEGER,                            -- 发送时间
    delivered_at INTEGER,                       -- 投递时间
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE email_templates (
    id TEXT PRIMARY KEY,                        -- 模板唯一标识
    template_name TEXT UNIQUE NOT NULL,         -- 模板名称
    template_type TEXT NOT NULL,                -- 模板类型
    subject_template TEXT NOT NULL,             -- 主题模板
    html_template TEXT NOT NULL,                -- HTML模板
    text_template TEXT,                         -- 纯文本模板
    required_variables TEXT DEFAULT '[]',       -- 必需变量（JSON数组）
    optional_variables TEXT DEFAULT '[]',       -- 可选变量（JSON数组）
    is_active INTEGER DEFAULT 1,                -- 是否激活
    version INTEGER DEFAULT 1,                  -- 模板版本
    created_at INTEGER NOT NULL,                -- 创建时间
    updated_at INTEGER NOT NULL,                -- 更新时间
    usage_count INTEGER DEFAULT 0               -- 使用次数
);
CREATE TABLE rate_limits (
    id TEXT PRIMARY KEY,                        -- 限流键，格式如 "search:user123" 或 "suggestions:ip:1.2.3.4"
    count INTEGER NOT NULL DEFAULT 1,           -- 当前窗口内请求计数
    reset_at INTEGER NOT NULL,                  -- 窗口重置时间戳（毫秒）
    created_at INTEGER NOT NULL                 -- 创建时间戳
);
CREATE TABLE user_feedback (
    id TEXT PRIMARY KEY,                        -- 反馈唯一标识
    user_id TEXT,                               -- 提交用户ID（未登录时为NULL）
    contact_email TEXT,                         -- 联系邮箱（未登录用户必填）
    type TEXT NOT NULL,                         -- 反馈类型: bug | suggestion | other
    title TEXT NOT NULL,                        -- 反馈标题
    content TEXT NOT NULL,                      -- 反馈内容
    page_url TEXT,                              -- 发生问题的页面URL
    user_agent TEXT,                            -- 用户浏览器信息
    ip_address TEXT,                            -- 提交者IP
    status TEXT DEFAULT 'pending',              -- 状态: pending | processing | resolved | closed
    priority TEXT DEFAULT 'normal',             -- 优先级: low | normal | high | urgent
    admin_user_id TEXT,                         -- 处理管理员ID
    admin_reply TEXT,                           -- 管理员回复内容
    admin_notes TEXT,                           -- 管理员内部备注（不发送给用户）
    resolved_at INTEGER,                        -- 处理完成时间
    email_sent INTEGER DEFAULT 0,               -- 是否已发送回复邮件
    created_at INTEGER NOT NULL,                -- 提交时间
    updated_at INTEGER NOT NULL,                -- 更新时间
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE site_announcements (
    id TEXT PRIMARY KEY,                        -- 公告唯一标识
    title TEXT NOT NULL,                        -- 公告标题
    content TEXT NOT NULL,                      -- 公告内容（支持简单文本）
    type TEXT DEFAULT 'info',                  -- 公告类型: info | warning | success | error
    is_pinned INTEGER DEFAULT 0,                -- 是否置顶 (0/1)
    is_active INTEGER DEFAULT 1,                -- 是否启用 (0/1)
    start_time INTEGER,                        -- 生效时间（NULL=立即生效）
    end_time INTEGER,                          -- 失效时间（NULL=永不失效）
    admin_user_id TEXT,                        -- 发布者ID
    created_at INTEGER NOT NULL,                -- 创建时间
    updated_at INTEGER NOT NULL,                -- 更新时间
    FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE system_errors (
    id TEXT PRIMARY KEY,                        -- 错误记录唯一标识
    source TEXT NOT NULL,                       -- 错误来源: frontend | backend
    error_type TEXT NOT NULL,                   -- 错误类型: javascript | unhandledrejection | api | server | render
    message TEXT NOT NULL,                      -- 错误消息（截断后存储）
    stack TEXT,                                 -- 错误堆栈（可能为空）
    url TEXT,                                   -- 发生位置：前端 URL 或后端路由路径
    line_number INTEGER,                        -- 行号（前端 source map 解析前）
    column_number INTEGER,                       -- 列号
    user_id TEXT,                               -- 关联用户ID（可为空，匿名用户错误）
    session_id TEXT,                            -- 前端 analytics session_id
    ip_address TEXT,                            -- 用户IP地址
    user_agent TEXT,                            -- 用户代理信息
    request_method TEXT,                        -- 请求方法（后端错误用）
    request_path TEXT,                          -- 请求路径（后端错误用）
    status_code INTEGER,                        -- HTTP 状态码（后端错误用）
    context TEXT DEFAULT '{}',                  -- 额外上下文（JSON：组件栈、面包屑等）
    fingerprint TEXT,                           -- 错误指纹（用于聚合相同错误）
    created_at INTEGER NOT NULL,                -- 发生时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE data_records (
    id TEXT PRIMARY KEY,                        -- 记录唯一标识
    record_type TEXT NOT NULL CHECK (record_type IN ('jav','anime','movie','manga','novel','actress')),
    dedup_key TEXT NOT NULL,                    -- 去重键（如 jav:ABC-123 / anime:bgm:123）
    title TEXT NOT NULL,                        -- 标题
    cover TEXT,                                 -- 封面图URL
    code TEXT,                                  -- 番号或外部ID（原始值，便于检索）
    actors TEXT,                                -- 演员（JSON数组字符串或逗号分隔）
    duration TEXT,                              -- 时长
    release_date TEXT,                          -- 发行时间
    publisher TEXT,                             -- 发行商/制作方
    tags TEXT DEFAULT '[]',                     -- 标签（JSON数组字符串）
    rating TEXT,                                -- 评分（文本，如 "8.5 分"）
    content_data TEXT NOT NULL,                 -- 完整类型特定数据（JSON字符串）
    detail_completed INTEGER DEFAULT 0,         -- 0=仅首条元数据 1=已补充完整详情
    status TEXT DEFAULT 'active',               -- 状态（active/hidden）
    source_count INTEGER DEFAULT 0,             -- 来源链接数（冗余计数，触发器维护）
    first_seen_at INTEGER NOT NULL,             -- 首次采集时间
    last_updated_at INTEGER NOT NULL,           -- 最近更新时间
    UNIQUE(record_type, dedup_key)              -- 去重核心约束
);
CREATE TABLE data_record_sources (
    id TEXT PRIMARY KEY,                        -- 来源记录唯一标识
    record_id TEXT NOT NULL,                    -- 关联 data_records.id
    source_name TEXT NOT NULL,                  -- 来源名称（JavBus/Bangumi/TMDB 等）
    source_type TEXT,                           -- 类型（detail/magnet/stream/info）
    source_url TEXT,                            -- 来源URL
    source_data TEXT DEFAULT '{}',              -- 来源特定数据（JSON，如磁力的 size/date/isHD）
    created_at INTEGER NOT NULL,                -- 创建时间
    UNIQUE(record_id, source_name, source_url), -- 同源同URL不重复
    FOREIGN KEY (record_id) REFERENCES data_records (id) ON DELETE CASCADE
);
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,                         -- 如 follow.new_work / follow.release_soon
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',         -- JSON：跳转所需信息（番号、女优 key 等）
    dedup_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER,                            -- NULL = 未读
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE notification_preferences (
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    in_app INTEGER NOT NULL DEFAULT 1,
    email INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE actress_watch (
    key TEXT PRIMARY KEY,                       -- JavBus star slug
    name TEXT NOT NULL,
    avatar TEXT,
    created_at INTEGER NOT NULL,
    last_checked_at INTEGER NOT NULL DEFAULT 0,
    last_ok_at INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,      -- 连续失败次数，用于退避
    baseline_done INTEGER NOT NULL DEFAULT 0    -- 0 = 尚未完成首次基线抓取（首次不通知）
);
CREATE TABLE actress_works (
    watch_key TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    cover TEXT,
    release_date TEXT,                          -- YYYY-MM-DD
    first_detected_at INTEGER NOT NULL,
    PRIMARY KEY (watch_key, code),
    FOREIGN KEY (watch_key) REFERENCES actress_watch(key) ON DELETE CASCADE
);
CREATE TABLE user_follows (
    user_id TEXT NOT NULL,
    watch_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_viewed_at INTEGER NOT NULL,            -- 之后发现的作品算"未读"
    notify_in_app INTEGER NOT NULL DEFAULT 1,
    notify_email INTEGER NOT NULL DEFAULT 0,    -- 邮件渠道上线后使用
    PRIMARY KEY (user_id, watch_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (watch_key) REFERENCES actress_watch(key) ON DELETE CASCADE
);
CREATE TABLE email_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    dedup_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',     -- pending / sent / skipped / failed
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE email_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    status TEXT NOT NULL,                       -- sent / failed
    item_count INTEGER NOT NULL DEFAULT 0,
    message_id TEXT,
    error TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE notification_settings (
    user_id TEXT PRIMARY KEY,
    email_hide_details INTEGER NOT NULL DEFAULT 0,  -- 1 = 邮件里只显示条数，不含女优名/番号
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE user_announcement_reads (
    user_id TEXT NOT NULL,
    announcement_id TEXT NOT NULL,
    read_at INTEGER,                            -- NULL = 未读
    dismissed_at INTEGER,                       -- 非 NULL = 用户从收件箱删除
    PRIMARY KEY (user_id, announcement_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (announcement_id) REFERENCES site_announcements(id) ON DELETE CASCADE
);
CREATE TABLE community_post_views (
    user_id TEXT NOT NULL,                      -- 浏览用户ID
    post_id TEXT NOT NULL,                      -- 被浏览帖子ID
    last_viewed_at INTEGER NOT NULL,            -- 最近一次计入浏览量的时间戳（毫秒）
    PRIMARY KEY (user_id, post_id),             -- 保证用户+帖子唯一，便于 upsert 去重
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE
);
CREATE TABLE jav_genres (
    -- 稳定主键：section + name_key，避免同名标签跨 section 冲突
    id            TEXT PRIMARY KEY,
    -- 归一化名（valueKey：小写 + 去空白），跨 section 唯一：同名标签只保留一条
    name_key      TEXT NOT NULL UNIQUE,
    -- 展示名，取自站点锚文本
    name          TEXT NOT NULL,
    -- URL slug，如 4g / hd
    genre_key     TEXT NOT NULL,
    -- 'censored' | 'uncensored'
    section       TEXT NOT NULL,
    -- 完整 URL，由 section + genre_key 在服务端拼接（不接受前端传 URL）
    url           TEXT NOT NULL,
    -- 技术/发行属性标签由同步时用 isTechnicalTag 直接算好，查询零成本
    is_technical  INTEGER NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);
CREATE TABLE jav_genre_pages (
    name_key      TEXT PRIMARY KEY,
    -- 从分页窗口学到过 / 成功抓到过的最大页码
    max_page_seen INTEGER NOT NULL DEFAULT 1,
    -- >0 表示已确认末页；0 表示未知
    last_page     INTEGER NOT NULL DEFAULT 0,
    -- 上次扩张探测的页码
    last_page_p   INTEGER NOT NULL DEFAULT 0,
    probed_at     INTEGER NOT NULL DEFAULT 0,
    updated_at    INTEGER NOT NULL
);
CREATE TABLE cron_locks (
    key TEXT PRIMARY KEY,                       -- 任务标识，如 follow.check
    locked_until INTEGER NOT NULL,              -- 租约到期时间戳（毫秒）
    owner TEXT NOT NULL,                        -- 持有者 id（本次执行随机生成）
    updated_at INTEGER NOT NULL
);
CREATE TABLE jav_detail_meta (
  record_id           TEXT PRIMARY KEY,
  -- pending: 从未成功抓取 / complete: 四个字段齐全 / partial: 抓到了但缺字段
  -- absent: 源站确认没有该番号或确实没有这些字段 / error: 暂时失败（网络/拦截）
  status              TEXT NOT NULL DEFAULT 'pending',
  missing_mask        INTEGER NOT NULL DEFAULT 0,
  -- 只统计「源站缺失」次数；超时、网络、拦截走 transient_failures，不消耗重试次数
  attempts            INTEGER NOT NULL DEFAULT 0,
  transient_failures  INTEGER NOT NULL DEFAULT 0,
  next_retry_at       INTEGER NOT NULL DEFAULT 0,
  retry_exhausted     INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  fetched_at          INTEGER,
  updated_at          INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (record_id) REFERENCES data_records(id) ON DELETE CASCADE
);
CREATE TABLE "detail_fetch_jobs" (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'running', -- running | done
  batch_size        INTEGER NOT NULL DEFAULT 10,
  total             INTEGER NOT NULL DEFAULT 0,
  processed         INTEGER NOT NULL DEFAULT 0,
  completed         INTEGER NOT NULL DEFAULT 0,
  partial           INTEGER NOT NULL DEFAULT 0,
  absent            INTEGER NOT NULL DEFAULT 0,
  transient_failed  INTEGER NOT NULL DEFAULT 0,
  skipped           INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_by        TEXT,
  -- 只补哪一类缺失：magnets | director | maker | publisher；NULL 表示不限
  filter_missing    TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  finished_at       INTEGER
);
CREATE TABLE entity_aliases (
    id            TEXT PRIMARY KEY,
    -- 实体类型：work（作品）/ person（人物）/ tag（标签）
    entity_type   TEXT NOT NULL,
    -- 全局唯一实体 id，如 tmdb:movie:278、bangumi:253、wikidata:Q123
    canonical_id  TEXT NOT NULL,
    -- 别名语言：zh / zh-TW / ja / en / romaji / pinyin
    lang          TEXT NOT NULL,
    -- 展示用原文
    alias         TEXT NOT NULL,
    -- 查询键：NFKC + 小写 + 去空白/标点
    alias_key     TEXT NOT NULL,
    -- 数据来源：manual / tmdb / wikidata / wikipedia / bangumi / mangadex / ai
    source        TEXT NOT NULL,
    -- 置信度 0~1：人工 1.0、元数据 0.9、AI 候选校验通过 0.5
    confidence    REAL NOT NULL DEFAULT 1.0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    UNIQUE(entity_type, canonical_id, lang, alias_key)
);
CREATE VIEW follow_targets AS
SELECT
  CASE
    WHEN instr(w.key, ':') > 0 THEN substr(w.key, 1, instr(w.key, ':') - 1)
    ELSE 'actress'
  END AS entity_type,
  CASE
    WHEN instr(w.key, ':') > 0 THEN substr(w.key, instr(w.key, ':') + 1)
    ELSE w.key
  END AS entity_key,
  w.key AS watch_key,
  w.name AS name,
  w.avatar AS avatar,
  w.created_at AS created_at,
  w.last_checked_at AS last_checked_at,
  w.last_ok_at AS last_ok_at,
  w.fail_count AS fail_count,
  w.baseline_done AS baseline_done
FROM actress_watch w;
CREATE UNIQUE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_rate_limits_reset ON rate_limits(reset_at);
CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_priority ON roles(priority);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_user_active ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_favorites_user_created ON user_favorites(user_id, created_at);
CREATE INDEX idx_favorites_keyword ON user_favorites(keyword);
CREATE INDEX idx_favorites_user_url ON user_favorites(user_id, url);
CREATE INDEX idx_favorites_code ON user_favorites(code);
CREATE INDEX idx_user_favorites_status ON user_favorites(user_id, status);
CREATE INDEX idx_history_user_created ON user_search_history(user_id, created_at);
CREATE INDEX idx_history_query ON user_search_history(query);
CREATE INDEX idx_history_source ON user_search_history(source);
CREATE INDEX idx_history_user_keyword ON user_search_history(user_id, query);
CREATE INDEX idx_history_code ON user_search_history(code);
CREATE INDEX idx_history_created_query ON user_search_history(created_at, query);
CREATE INDEX idx_history_cover ON user_search_history(cover) WHERE cover IS NOT NULL AND cover != '';
CREATE INDEX idx_actions_user_created ON user_actions(user_id, created_at);
CREATE INDEX idx_actions_action ON user_actions(action);
CREATE INDEX idx_actions_login ON user_actions(action, created_at);
CREATE INDEX idx_config_public ON system_config(is_public);
CREATE INDEX idx_config_group ON system_config(config_group);
CREATE INDEX idx_config_logs_key ON config_change_logs(config_key);
CREATE INDEX idx_config_logs_by ON config_change_logs(changed_by);
CREATE INDEX idx_config_logs_created ON config_change_logs(created_at);
CREATE INDEX idx_config_logs_type ON config_change_logs(change_type);
CREATE INDEX idx_analytics_user_created ON analytics_events(user_id, created_at);
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_session ON analytics_events(session_id);
CREATE INDEX idx_analytics_created ON analytics_events(created_at);
CREATE INDEX idx_major_categories_order ON search_major_categories(display_order, is_active);
CREATE INDEX idx_major_categories_system ON search_major_categories(is_system, is_active);
CREATE INDEX idx_source_categories_major ON search_source_categories(major_category_id, display_order);
CREATE INDEX idx_source_categories_system ON search_source_categories(is_system, is_active);
CREATE INDEX idx_source_categories_created_by ON search_source_categories(created_by);
CREATE INDEX idx_search_sources_category ON search_sources(category_id, display_order);
CREATE INDEX idx_search_sources_system ON search_sources(is_system, is_active);
CREATE INDEX idx_search_sources_searchable ON search_sources(searchable, search_priority);
CREATE INDEX idx_search_sources_site_type ON search_sources(site_type);
CREATE INDEX idx_search_sources_created_by ON search_sources(created_by);
CREATE INDEX idx_search_sources_usage ON search_sources(usage_count DESC);
CREATE INDEX idx_user_source_configs_user ON user_search_source_configs(user_id, is_enabled);
CREATE INDEX idx_user_source_configs_source ON user_search_source_configs(source_id);
CREATE INDEX idx_status_cache_source_keyword ON source_status_cache(source_id, keyword_hash);
CREATE INDEX idx_status_cache_expires ON source_status_cache(expires_at);
CREATE INDEX idx_status_cache_source ON source_status_cache(source_id);
CREATE INDEX idx_posts_user ON community_posts(user_id);
CREATE INDEX idx_posts_type ON community_posts(post_type);
CREATE INDEX idx_posts_status ON community_posts(status);
CREATE INDEX idx_posts_created ON community_posts(created_at DESC);
CREATE INDEX idx_posts_like_count ON community_posts(like_count DESC);
CREATE INDEX idx_posts_view_count ON community_posts(view_count DESC);
CREATE INDEX idx_posts_user_status ON community_posts(user_id, status);
CREATE INDEX idx_tags_name ON community_tags(tag_name);
CREATE INDEX idx_tags_creator ON community_tags(created_by);
CREATE INDEX idx_tags_active ON community_tags(tag_active);
CREATE INDEX idx_comments_post ON community_comments(post_id);
CREATE INDEX idx_comments_user ON community_comments(user_id);
CREATE INDEX idx_comments_created ON community_comments(created_at DESC);
CREATE INDEX idx_likes_post ON community_likes(post_id);
CREATE INDEX idx_likes_user ON community_likes(user_id);
CREATE INDEX idx_likes_type ON community_likes(like_type);
CREATE INDEX idx_reports_post ON community_reports(post_id);
CREATE INDEX idx_reports_status ON community_reports(status);
CREATE INDEX idx_email_verifications_email_hash ON email_verifications(email_hash);
CREATE INDEX idx_email_verifications_user_type ON email_verifications(user_id, verification_type);
CREATE INDEX idx_email_verifications_status ON email_verifications(status);
CREATE INDEX idx_email_verifications_expires ON email_verifications(expires_at);
CREATE INDEX idx_email_verifications_created ON email_verifications(created_at DESC);
CREATE INDEX idx_email_verifications_code_hash ON email_verifications(code_hash);
CREATE INDEX idx_email_verifications_type_email ON email_verifications(verification_type, email);
CREATE INDEX idx_email_change_user_status ON email_change_requests(user_id, status);
CREATE INDEX idx_email_change_new_email ON email_change_requests(new_email_hash);
CREATE INDEX idx_email_change_expires ON email_change_requests(expires_at);
CREATE INDEX idx_password_reset_logs_email ON password_reset_logs(email_hash);
CREATE INDEX idx_password_reset_logs_user ON password_reset_logs(user_id);
CREATE INDEX idx_password_reset_logs_status ON password_reset_logs(request_status);
CREATE INDEX idx_password_reset_logs_created ON password_reset_logs(created_at DESC);
CREATE INDEX idx_password_reset_logs_ip ON password_reset_logs(ip_address);
CREATE INDEX idx_security_lockouts_identifier ON security_lockouts(lockout_type, identifier_hash);
CREATE INDEX idx_security_lockouts_locked_until ON security_lockouts(locked_until);
CREATE INDEX idx_security_lockouts_created ON security_lockouts(created_at DESC);
CREATE INDEX idx_security_lockouts_type_identifier ON security_lockouts(lockout_type, identifier);
CREATE INDEX idx_security_events_user ON user_security_events(user_id, created_at DESC);
CREATE INDEX idx_security_events_type ON user_security_events(event_type, event_subtype);
CREATE INDEX idx_security_events_status ON user_security_events(event_status);
CREATE INDEX idx_security_events_risk ON user_security_events(risk_score DESC);
CREATE INDEX idx_security_events_ip ON user_security_events(ip_address);
CREATE INDEX idx_email_logs_user_created ON email_send_logs(user_id, created_at DESC);
CREATE INDEX idx_email_logs_email_type ON email_send_logs(recipient_email, email_type);
CREATE INDEX idx_email_logs_status ON email_send_logs(send_status);
CREATE INDEX idx_email_logs_rate_limit ON email_send_logs(rate_limit_key, created_at);
CREATE INDEX idx_email_templates_name ON email_templates(template_name);
CREATE INDEX idx_email_templates_type_active ON email_templates(template_type, is_active);
CREATE INDEX idx_user_feedback_status ON user_feedback(status);
CREATE INDEX idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at);
CREATE INDEX idx_user_feedback_type ON user_feedback(type);
CREATE INDEX idx_site_announcements_active ON site_announcements(is_active);
CREATE INDEX idx_site_announcements_pinned ON site_announcements(is_pinned);
CREATE INDEX idx_site_announcements_created_at ON site_announcements(created_at);
CREATE INDEX idx_system_errors_fingerprint ON system_errors(fingerprint);
CREATE INDEX idx_system_errors_created_at ON system_errors(created_at DESC);
CREATE INDEX idx_system_errors_source ON system_errors(source);
CREATE INDEX idx_system_errors_user_id ON system_errors(user_id);
CREATE INDEX idx_data_records_type_seen ON data_records(record_type, first_seen_at);
CREATE INDEX idx_data_records_status ON data_records(status);
CREATE INDEX idx_data_records_detail ON data_records(detail_completed);
CREATE INDEX idx_data_records_code ON data_records(code) WHERE code IS NOT NULL;
CREATE INDEX idx_data_record_sources_record ON data_record_sources(record_id);
CREATE UNIQUE INDEX idx_notifications_dedup ON notifications(user_id, dedup_key);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_actress_watch_checked ON actress_watch(last_checked_at);
CREATE INDEX idx_actress_works_release ON actress_works(release_date);
CREATE INDEX idx_actress_works_detected ON actress_works(watch_key, first_detected_at);
CREATE INDEX idx_user_follows_watch ON user_follows(watch_key);
CREATE UNIQUE INDEX idx_email_queue_dedup ON email_queue(user_id, dedup_key);
CREATE INDEX idx_email_queue_status ON email_queue(status, user_id, created_at);
CREATE INDEX idx_email_log_user_time ON email_log(user_id, sent_at);
CREATE INDEX idx_email_log_time ON email_log(sent_at);
CREATE INDEX idx_user_announcement_reads_user
    ON user_announcement_reads(user_id, read_at);
CREATE INDEX idx_post_views_post ON community_post_views(post_id);
CREATE INDEX idx_likes_post_type ON community_likes(post_id, like_type);
CREATE INDEX idx_jav_genres_usable
  ON jav_genres(section, is_technical, sort_order);
CREATE INDEX idx_jav_genres_key
  ON jav_genres(name_key);
CREATE INDEX idx_post_views_last_viewed
    ON community_post_views(last_viewed_at);
CREATE INDEX idx_data_records_retention
    ON data_records(detail_completed, last_updated_at);
CREATE INDEX idx_posts_status_created
    ON community_posts(status, created_at DESC);
CREATE INDEX idx_comments_post_created
    ON community_comments(post_id, created_at DESC);
CREATE INDEX idx_jav_detail_meta_due
  ON jav_detail_meta (retry_exhausted, status, next_retry_at);
CREATE INDEX idx_jav_detail_meta_missing
  ON jav_detail_meta (missing_mask);
CREATE INDEX idx_data_records_jav_pending
  ON data_records(record_type, status, detail_completed, last_updated_at)
  WHERE record_type = 'jav' AND status = 'active' AND detail_completed = 0;
CREATE INDEX idx_email_queue_cleanup
  ON email_queue(created_at)
  WHERE status <> 'pending';
CREATE INDEX idx_likes_user_type_created
  ON community_likes(user_id, like_type, created_at DESC);
CREATE INDEX idx_actions_created
  ON user_actions(created_at DESC);
CREATE INDEX idx_users_created
  ON users(created_at DESC);
CREATE INDEX idx_status_cache_source_created
  ON source_status_cache(source_id, created_at DESC);
CREATE INDEX idx_posts_status_hot
  ON community_posts(status, like_count DESC, view_count DESC, created_at DESC);
CREATE INDEX idx_reports_status_created
  ON community_reports(status, created_at DESC);
CREATE INDEX idx_record_sources_name
  ON data_record_sources(source_name);
CREATE INDEX idx_detail_fetch_jobs_status
  ON detail_fetch_jobs (status, created_at DESC);
CREATE UNIQUE INDEX uniq_detail_fetch_jobs_running
  ON detail_fetch_jobs (status) WHERE status = 'running';
CREATE INDEX idx_entity_aliases_lookup
  ON entity_aliases(entity_type, alias_key);
CREATE INDEX idx_entity_aliases_canonical
  ON entity_aliases(entity_type, canonical_id);
CREATE INDEX idx_actress_works_watch_release
  ON actress_works (watch_key, release_date);
CREATE INDEX idx_data_records_type_code
  ON data_records (record_type, code);
CREATE INDEX idx_jav_meta_recent
  ON jav_detail_meta(updated_at DESC);
CREATE INDEX idx_jav_meta_retry
  ON jav_detail_meta(next_retry_at);
CREATE INDEX idx_sources_type
  ON data_record_sources(source_type);
CREATE INDEX idx_sources_url
  ON data_record_sources(source_url)
  WHERE source_url IS NOT NULL;
CREATE INDEX idx_history_user_source
  ON user_search_history(user_id, source);
CREATE INDEX idx_data_records_first_seen
  ON data_records(first_seen_at DESC);
CREATE INDEX idx_data_records_type_title
  ON data_records(record_type, title);
CREATE TRIGGER update_roles_timestamp
    AFTER UPDATE ON roles
    FOR EACH ROW
    BEGIN
        UPDATE roles SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER update_users_timestamp
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
        UPDATE users SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER update_favorites_timestamp
    AFTER UPDATE ON user_favorites
    FOR EACH ROW
    BEGIN
        UPDATE user_favorites SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER cleanup_expired_sessions
    AFTER INSERT ON user_sessions
    FOR EACH ROW
    BEGIN
        DELETE FROM user_sessions WHERE expires_at < strftime('%s', 'now') * 1000;
    END;
CREATE TRIGGER update_major_categories_timestamp
    AFTER UPDATE ON search_major_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_major_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER update_source_categories_timestamp
    AFTER UPDATE ON search_source_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_source_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER update_search_sources_timestamp
    AFTER UPDATE ON search_sources
    FOR EACH ROW
    BEGIN
        UPDATE search_sources SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER update_user_source_configs_timestamp
    AFTER UPDATE ON user_search_source_configs
    FOR EACH ROW
    BEGIN
        UPDATE user_search_source_configs SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER cleanup_expired_status_cache
    AFTER INSERT ON source_status_cache
    FOR EACH ROW
    BEGIN
        DELETE FROM source_status_cache WHERE expires_at < strftime('%s', 'now') * 1000;
    END;
CREATE TRIGGER cascade_delete_category_sources
    AFTER DELETE ON search_source_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_sources
        SET category_id = 'others', updated_at = strftime('%s', 'now') * 1000
        WHERE category_id = OLD.id;
    END;
CREATE TRIGGER update_source_usage_stats
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
CREATE TRIGGER create_default_user_source_configs
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
CREATE TRIGGER update_post_comment_count_after_insert
    AFTER INSERT ON community_comments
    FOR EACH ROW
    BEGIN
        UPDATE community_posts SET
            comment_count = comment_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.post_id;
    END;
CREATE TRIGGER update_post_comment_count_after_delete
    AFTER DELETE ON community_comments
    FOR EACH ROW
    BEGIN
        UPDATE community_posts SET
            comment_count = MAX(comment_count - 1, 0),
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = OLD.post_id;
    END;
CREATE TRIGGER update_post_like_count_after_insert
    AFTER INSERT ON community_likes
    FOR EACH ROW
    WHEN NEW.like_type = 'like'
    BEGIN
        UPDATE community_posts SET
            like_count = like_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.post_id;
    END;
CREATE TRIGGER update_post_favorite_count_after_insert
    AFTER INSERT ON community_likes
    FOR EACH ROW
    WHEN NEW.like_type = 'favorite'
    BEGIN
        UPDATE community_posts SET
            favorite_count = favorite_count + 1,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.post_id;
    END;
CREATE TRIGGER update_post_like_count_after_delete
    AFTER DELETE ON community_likes
    FOR EACH ROW
    WHEN OLD.like_type = 'like'
    BEGIN
        UPDATE community_posts SET
            like_count = MAX(like_count - 1, 0),
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = OLD.post_id;
    END;
CREATE TRIGGER update_post_favorite_count_after_delete
    AFTER DELETE ON community_likes
    FOR EACH ROW
    WHEN OLD.like_type = 'favorite'
    BEGIN
        UPDATE community_posts SET
            favorite_count = MAX(favorite_count - 1, 0),
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = OLD.post_id;
    END;
CREATE TRIGGER cleanup_expired_verifications
    AFTER INSERT ON email_verifications
    FOR EACH ROW
    BEGIN
        DELETE FROM email_verifications
        WHERE expires_at < strftime('%s', 'now') * 1000
        AND status = 'pending';
    END;
CREATE TRIGGER cleanup_expired_email_changes
    AFTER INSERT ON email_change_requests
    FOR EACH ROW
    BEGIN
        DELETE FROM email_change_requests
        WHERE expires_at < strftime('%s', 'now') * 1000
        AND status = 'pending';
    END;
CREATE TRIGGER update_email_template_timestamp
    AFTER UPDATE ON email_templates
    FOR EACH ROW
    BEGIN
        UPDATE email_templates SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;
CREATE TRIGGER cleanup_expired_security_lockouts
    AFTER INSERT ON security_lockouts
    FOR EACH ROW
    BEGIN
        DELETE FROM security_lockouts
        WHERE locked_until < strftime('%s', 'now') * 1000;
    END;
CREATE TRIGGER update_email_template_usage_on_send
    AFTER INSERT ON email_send_logs
    FOR EACH ROW
    WHEN NEW.template_name IS NOT NULL
    BEGIN
        UPDATE email_templates
        SET usage_count = usage_count + 1
        WHERE template_name = NEW.template_name;
    END;
CREATE TRIGGER update_source_count_after_insert
AFTER INSERT ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count + 1 WHERE id = NEW.record_id;
END;
CREATE TRIGGER update_source_count_after_delete
AFTER DELETE ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count - 1 WHERE id = OLD.record_id;
END;

PRAGMA foreign_keys = ON;
