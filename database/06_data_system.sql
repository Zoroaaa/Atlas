-- ===============================================
-- 系统初始化数据
-- 版本: 3.0
-- 说明: 包含角色、系统配置、配置分组、邮件模板等初始化数据
-- 执行顺序: 05
-- 更新说明: 精简配置项，仅保留真正需要动态管理的配置
-- ===============================================

-- ===============================================
-- 1. 角色初始化数据
-- ===============================================

INSERT OR IGNORE INTO roles (id, name, display_name, description, permissions, is_system, priority, created_at, updated_at)
VALUES
    ('super_admin', 'super_admin', '超级管理员', '拥有系统最高权限，可以管理所有用户和系统配置', '["*"]', 1, 100, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('admin', 'admin', '管理员', '可以管理用户、查看统计数据、处理举报等', '["user:read", "user:write", "stats:read", "report:read", "report:write", "source:read", "source:write", "community:read", "community:write"]', 1, 50, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('user', 'user', '普通用户', '普通注册用户，拥有基本的搜索和收藏功能', '["search", "favorite", "history", "sync", "community:share", "community:review"]', 1, 10, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 2. 配置分组初始化数据（精简版）
-- ===============================================

INSERT OR IGNORE INTO config_groups (id, name, display_name, description, icon, display_order, created_at, updated_at) VALUES
    ('basic', 'basic', '基础配置', '网站基础信息配置', 'Settings', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('features', 'features', '功能开关', '功能模块开关配置', 'ToggleLeft', 2, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('security', 'security', '安全配置', '安全策略相关配置', 'Shield', 3, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('email', 'email', '邮件配置', '邮件发送相关配置', 'Mail', 4, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('cleanup', 'cleanup', '数据清理', '数据清理相关配置', 'Trash2', 5, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 3. 系统配置初始化数据（精简版 - 仅保留需要动态管理的配置）
-- 说明：其他配置项已移至 constants.ts 和 validation/index.ts 统一管理
-- ===============================================

INSERT OR IGNORE INTO system_config (key, value, description, config_type, config_group, is_public, display_order, validation_rules, created_at, updated_at) VALUES
    -- ====================
    -- 基础配置 - 网站信息
    -- ====================
    ('site_name', 'Atlas', '网站名称', 'string', 'basic', 1, 1, NULL, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('site_description', '搜索全网资源，一步直达', '网站描述', 'string', 'basic', 1, 2, NULL, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('enable_registration', '1', '是否开放注册', 'boolean', 'basic', 1, 3, NULL, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    
    -- ====================
    -- 功能开关 - 运营需要动态调整
    -- ====================
    ('community_enabled', '1', '启用搜索源共享社区功能', 'boolean', 'features', 1, 10, NULL, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    
    -- ====================
    -- 安全配置 - 安全策略需要动态调整
    -- ====================
    ('max_login_attempts', '5', '最大登录尝试次数', 'integer', 'security', 1, 20, '{"min": 3, "max": 10}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('lockout_duration_ms', '900000', '账户锁定时长（毫秒，默认15分钟）', 'integer', 'security', 1, 21, '{"min": 60000, "max": 3600000}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('max_verification_attempts', '5', '最大验证尝试次数', 'integer', 'security', 1, 22, '{"min": 1, "max": 10}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('password_reset_max_attempts', '5', '密码重置最大尝试次数', 'integer', 'security', 1, 23, '{"min": 1, "max": 10}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('password_reset_lockout_duration', '3600000', '密码重置锁定持续时间（毫秒，默认1小时）', 'integer', 'security', 1, 24, '{"min": 300000, "max": 86400000}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    
    -- ====================
    -- 邮件配置 - 防滥用需要动态调整
    -- ====================
    ('email_rate_limit_per_hour', '5', '每小时最大发送邮件数', 'integer', 'email', 0, 40, '{"min": 1, "max": 20}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('email_rate_limit_per_day', '20', '每天最大发送邮件数', 'integer', 'email', 0, 41, '{"min": 1, "max": 100}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('verification_code_expiry', '900000', '验证码过期时间（毫秒，默认15分钟）', 'integer', 'email', 1, 42, '{"min": 60000, "max": 3600000}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('reset_password_code_expiry', '1800000', '重置密码验证码过期时间（毫秒，默认30分钟）', 'integer', 'email', 1, 43, '{"min": 600000, "max": 7200000}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    
    -- ====================
    -- 数据清理 - 运维需要动态调整
    -- ====================
    ('password_reset_log_retention_days', '30', '密码重置日志保留天数', 'integer', 'cleanup', 0, 50, '{"min": 7, "max": 90}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('user_actions_retention_days', '90', '用户行为日志保留天数', 'integer', 'cleanup', 0, 51, '{"min": 30, "max": 365}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
    ('security_event_retention_days', '90', '安全事件保留天数', 'integer', 'cleanup', 0, 52, '{"min": 30, "max": 365}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ===============================================
-- 4. 邮件模板初始化数据
-- ===============================================

INSERT OR IGNORE INTO email_templates (
    id, template_name, template_type, subject_template, html_template, text_template,
    required_variables, created_at, updated_at
) VALUES 
    ('tpl_register_verify', 'registration_verification', 'registration',
     '验证您的{{siteName}}账户', 
     '<!DOCTYPE html><html><head><meta charset="utf-8"><title>验证邮箱</title></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;"><h1 style="margin: 0; font-size: 28px;">验证您的邮箱</h1></div><div style="background: white; padding: 40px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;"><p style="font-size: 16px; line-height: 1.6; color: #333;">您好 <strong>{{username}}</strong>，</p><p style="font-size: 16px; line-height: 1.6; color: #333;">感谢您注册{{siteName}}！请使用以下验证码完成邮箱验证：</p><div style="background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;"><span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; font-family: monospace;">{{verificationCode}}</span></div><p style="font-size: 14px; color: #666; text-align: center;">验证码将在 <strong>{{expiryMinutes}} 分钟</strong> 后过期</p><p style="font-size: 16px; line-height: 1.6; color: #333;">如果您没有注册此账户，请忽略此邮件。</p><hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="font-size: 12px; color: #999; text-align: center;">此邮件由系统自动发送，请勿回复。<br>{{siteName}} - 让搜索更简单</p></div></body></html>',
     '验证您的{{siteName}}账户\n\n您好 {{username}}，\n\n感谢您注册{{siteName}}！您的验证码是：{{verificationCode}}\n\n此验证码将在 {{expiryMinutes}} 分钟后过期。\n\n如果您没有注册此账户，请忽略此邮件。\n\n{{siteName}}',
     '["username", "siteName", "verificationCode", "expiryMinutes"]',
     strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

    ('tpl_forgot_password', 'forgot_password_verification', 'forgot_password',
     '重置您的{{siteName}}密码', 
     '<!DOCTYPE html><html><head><meta charset="utf-8"><title>密码重置</title></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;"><h1 style="margin: 0; font-size: 28px;">密码重置</h1></div><div style="background: white; padding: 40px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;"><p style="font-size: 16px; line-height: 1.6; color: #333;">您好 <strong>{{username}}</strong>，</p><p style="font-size: 16px; line-height: 1.6; color: #333;">我们收到了您的密码重置请求。如果这是您本人操作，请使用以下验证码重置密码：</p><div style="background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;"><span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; font-family: monospace;">{{verificationCode}}</span></div><p style="font-size: 14px; color: #666; text-align: center;">验证码将在 <strong>{{expiryMinutes}} 分钟</strong> 后过期</p><div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;"><p style="font-size: 14px; color: #856404; margin: 0;"><strong>安全提醒：</strong></p><ul style="font-size: 14px; color: #856404; margin: 10px 0;"><li>如果您没有申请密码重置，请忽略此邮件</li><li>请勿将验证码分享给任何人</li><li>建议使用强密码保护您的账户</li></ul></div><hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="font-size: 12px; color: #999; text-align: center;">此邮件由系统自动发送，请勿回复。<br>{{siteName}} - 让搜索更简单</p></div></body></html>',
     '重置您的{{siteName}}密码\n\n您好 {{username}}，\n\n我们收到了您的密码重置请求。如果这是您本人操作，请使用以下验证码： \n\n验证码：{{verificationCode}}\n\n此验证码将在 {{expiryMinutes}} 分钟后过期。\n\n安全提醒： \n- 如果您没有申请密码重置，请忽略此邮件\n- 请勿将验证码分享给任何人\n- 建议使用强密码保护您的账户\n\n{{siteName}}',
     '["username", "siteName", "verificationCode", "expiryMinutes"]',
     strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

    ('tpl_email_change', 'email_change', 'email_change',
     '验证您的新邮箱地址',
     '<!DOCTYPE html><html><head><meta charset="utf-8"><title>邮箱验证</title></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #00b894 0%, #00a085 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;"><h1 style="margin: 0; font-size: 28px;">验证新邮箱</h1></div><div style="background: white; padding: 40px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;"><p style="font-size: 16px; line-height: 1.6; color: #333;">您好 <strong>{{username}}</strong>，</p><p style="font-size: 16px; line-height: 1.6; color: #333;">您申请将账户邮箱从 <strong>{{oldEmail}}</strong> 更改为 <strong>{{newEmail}}</strong>。</p><p style="font-size: 16px; line-height: 1.6; color: #333;">请使用以下验证码验证您的新邮箱地址：</p><div style="background: #f8f9fa; border: 2px dashed #00b894; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;"><span style="font-size: 32px; font-weight: bold; color: #00b894; letter-spacing: 5px; font-family: monospace;">{{verificationCode}}</span></div><p style="font-size: 14px; color: #666; text-align: center;">验证码将在 <strong>{{expiryMinutes}} 分钟</strong> 后过期</p><p style="font-size: 16px; line-height: 1.6; color: #333;">如果您没有申请更改邮箱，请立即联系我们。</p><hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="font-size: 12px; color: #999; text-align: center;">此邮件由系统自动发送,请勿回复。<br>{{siteName}} - 让搜索更简单</p></div></body></html>',
     '验证您的新邮箱地址\n\n您好 {{username}}，\n\n您申请将账户邮箱从 {{oldEmail}} 更改为 {{newEmail}}。\n\n您的验证码是：{{verificationCode}}\n\n此验证码将在 {{expiryMinutes}} 分钟后过期。\n\n如果您没有申请更改邮箱，请立即联系我们。\n\n{{siteName}}',
     '["username", "siteName", "verificationCode", "expiryMinutes", "oldEmail", "newEmail"]',
     strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

    ('tpl_account_delete', 'account_delete', 'account_delete',  
     '确认删除您的{{siteName}}账户',
     '<!DOCTYPE html><html><head><meta charset="utf-8"><title>账户删除确认</title></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #e84393 0%, #d63031 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;"><h1 style="margin: 0; font-size: 28px;">账户删除确认</h1></div><div style="background: white; padding: 40px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;"><p style="font-size: 16px; line-height: 1.6; color: #333;">您好 <strong>{{username}}</strong>，</p><p style="font-size: 16px; line-height: 1.6; color: #333;">我们收到了删除您账户的申请。这将<strong>永久删除</strong>您的所有数据，包括收藏、历史记录等。</p><p style="font-size: 16px; line-height: 1.6; color: #333;">如果您确认要删除账户，请使用以下验证码：</p><div style="background: #f8f9fa; border: 2px dashed #e84393; border-radius: 8px; padding: 20px. text-align: center; margin: 30px 0;"><span style="font-size: 32px; font-weight: bold; color: #e84393; letter-spacing: 5px; font-family: monospace;">{{verificationCode}}</span></div><p style="font-size: 14px; color: #666; text-align: center;">验证码将在 <strong>{{expiryMinutes}} 分钟</strong> 后过期</p><div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;"><p style="font-size: 14px; color: #856404; margin: 0;"><strong>重要提醒：</strong>账户删除后无法恢复，请谨慎操作！</p></div><p style="font-size: 16px; line-height: 1.6; color: #333;">如果您不想删除账户，请忽略此邮件。</p><hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="font-size: 12px; color: #999; text-align: center;">此邮件由系统自动发送，请勿回复。<br>{{siteName}} - 让搜索更简单</p></div></body></html>',
     '确认删除您的{{siteName}}账户\n\n您好 {{username}}，\n\n我们收到了删除您账户的申请。这将永久删除您的所有数据。\n\n如果您确认要删除账户，验证码是：{{verificationCode}}\n\n此验证码将在 {{expiryMinutes}} 分钟后过期。\n\n重要提醒：账户删除后无法恢复，请谨慎操作！\n\n如果您不想删除账户，请忽略此邮件。\n\n{{siteName}}',
     '["username", "siteName", "verificationCode", "expiryMinutes"]',
     strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);
