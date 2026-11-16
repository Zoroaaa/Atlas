-- Atlas 数据库 · Config：系统配置 / 配置分组 / 配置变更日志
-- 依赖：01_core.sql
-- 本文件可重复执行：表/视图/索引/触发器均使用 IF NOT EXISTS，种子数据使用 INSERT OR IGNORE。

-- ──────────────────────────────────────────────
-- 表
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
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

CREATE TABLE IF NOT EXISTS config_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config_change_logs (
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

-- ──────────────────────────────────────────────
-- 索引
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_config_public ON system_config(is_public);

CREATE INDEX IF NOT EXISTS idx_config_group ON system_config(config_group);

CREATE INDEX IF NOT EXISTS idx_config_logs_key ON config_change_logs(config_key);

CREATE INDEX IF NOT EXISTS idx_config_logs_by ON config_change_logs(changed_by);

CREATE INDEX IF NOT EXISTS idx_config_logs_created ON config_change_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_config_logs_type ON config_change_logs(change_type);

-- ──────────────────────────────────────────────
-- 种子数据
-- ──────────────────────────────────────────────
INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('site_name', 'Atlas', '网站名称', 'string', 'basic', NULL, NULL, 1, 1, 0, 1, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('site_description', '搜索全网资源，一步直达', '网站描述', 'string', 'basic', NULL, NULL, 1, 1, 0, 2, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('enable_registration', '1', '是否开放注册', 'boolean', 'basic', NULL, NULL, 1, 1, 0, 3, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('community_enabled', '1', '启用搜索源共享社区功能', 'boolean', 'features', NULL, NULL, 1, 1, 0, 10, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('max_login_attempts', '5', '最大登录尝试次数', 'integer', 'security', '{"min": 3, "max": 10}', NULL, 0, 1, 0, 20, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('lockout_duration_ms', '900000', '账户锁定时长（毫秒，默认15分钟）', 'integer', 'security', '{"min": 60000, "max": 3600000}', NULL, 0, 1, 0, 21, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('max_verification_attempts', '5', '最大验证尝试次数', 'integer', 'security', '{"min": 1, "max": 10}', NULL, 0, 1, 0, 22, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('password_reset_max_attempts', '5', '密码重置最大尝试次数', 'integer', 'security', '{"min": 1, "max": 10}', NULL, 0, 1, 0, 23, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('password_reset_lockout_duration', '3600000', '密码重置锁定持续时间（毫秒，默认1小时）', 'integer', 'security', '{"min": 300000, "max": 86400000}', NULL, 0, 1, 0, 24, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_rate_limit_per_hour', '5', '每小时最大发送邮件数', 'integer', 'email', '{"min": 1, "max": 20}', NULL, 0, 1, 0, 40, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_rate_limit_per_day', '20', '每天最大发送邮件数', 'integer', 'email', '{"min": 1, "max": 100}', NULL, 0, 1, 0, 41, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('verification_code_expiry', '900000', '验证码过期时间（毫秒，默认15分钟）', 'integer', 'email', '{"min": 60000, "max": 3600000}', NULL, 0, 1, 0, 42, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('reset_password_code_expiry', '1800000', '重置密码验证码过期时间（毫秒，默认30分钟）', 'integer', 'email', '{"min": 600000, "max": 7200000}', NULL, 0, 1, 0, 43, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('password_reset_log_retention_days', '30', '密码重置日志保留天数', 'integer', 'cleanup', '{"min": 7, "max": 90}', NULL, 0, 1, 0, 50, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('user_actions_retention_days', '90', '用户行为日志保留天数', 'integer', 'cleanup', '{"min": 30, "max": 365}', NULL, 0, 1, 0, 51, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('security_event_retention_days', '90', '安全事件保留天数', 'integer', 'cleanup', '{"min": 30, "max": 365}', NULL, 0, 1, 0, 52, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('jav_detail_job_enabled', '1', '是否推进 JAV 详情批量补全。与「数据存储」面板里的「暂停/继续」是同一个开关：关闭后分钟 cron 跳过推进，任务进度保留，重新打开后从同一任务继续。', 'boolean', 'features', NULL, NULL, 0, 1, 0, 11, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_priority_cloudflare', '0', 'Cloudflare 邮件优先级（数值越小越优先；-1 表示停用）', 'integer', 'email', '{"min": -1, "max": 99}', NULL, 0, 1, 0, 33, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_priority_resend', '-1', 'Resend 邮件优先级（数值越小越优先；-1 表示停用）', 'integer', 'email', '{"min": -1, "max": 99}', NULL, 0, 1, 0, 34, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_priority_mailtrap', '-1', 'Mailtrap 邮件优先级（数值越小越优先；-1 表示停用）', 'integer', 'email', '{"min": -1, "max": 99}', NULL, 0, 1, 0, 35, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_priority_brevo', '-1', 'Brevo 邮件优先级（数值越小越优先；-1 表示停用）', 'integer', 'email', '{"min": -1, "max": 99}', NULL, 0, 1, 0, 36, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_daily_limit_cloudflare', '100', 'Cloudflare 每日发送上限（0 表示不限额，达到后自动使用下一优先级）', 'integer', 'email', '{"min": 0, "max": 1000000}', NULL, 0, 1, 0, 37, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_daily_limit_resend', '100', 'Resend 每日发送上限（0 表示不限额，达到后自动使用下一优先级）', 'integer', 'email', '{"min": 0, "max": 1000000}', NULL, 0, 1, 0, 38, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_daily_limit_mailtrap', '100', 'Mailtrap 每日发送上限（0 表示不限额，达到后自动使用下一优先级）', 'integer', 'email', '{"min": 0, "max": 1000000}', NULL, 0, 1, 0, 39, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "system_config" ("key", "value", "description", "config_type", "config_group", "validation_rules", "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at") VALUES ('email_daily_limit_brevo', '100', 'Brevo 每日发送上限（0 表示不限额，达到后自动使用下一优先级）', 'integer', 'email', '{"min": 0, "max": 1000000}', NULL, 0, 1, 0, 40, 1794808773000, 1794808773000);

INSERT OR IGNORE INTO "config_groups" ("id", "name", "display_name", "description", "icon", "display_order", "created_at", "updated_at") VALUES ('basic', 'basic', '基础配置', '网站基础信息配置', 'Settings', 1, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "config_groups" ("id", "name", "display_name", "description", "icon", "display_order", "created_at", "updated_at") VALUES ('features', 'features', '功能开关', '功能模块开关配置', 'ToggleLeft', 2, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "config_groups" ("id", "name", "display_name", "description", "icon", "display_order", "created_at", "updated_at") VALUES ('security', 'security', '安全配置', '安全策略相关配置', 'Shield', 3, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "config_groups" ("id", "name", "display_name", "description", "icon", "display_order", "created_at", "updated_at") VALUES ('email', 'email', '邮件配置', '邮件发送相关配置', 'Mail', 4, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "config_groups" ("id", "name", "display_name", "description", "icon", "display_order", "created_at", "updated_at") VALUES ('cleanup', 'cleanup', '数据清理', '数据清理相关配置', 'Trash2', 5, 1794808772000, 1794808772000);
