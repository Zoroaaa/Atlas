-- 37_email_providers.sql
--
-- 邮件服务商优先级、每日限额与发件子域名约定。
--
-- 支持的通道（发件地址在代码内固定绑定，见 backend/src/services/email-sender.ts）：
--   cloudflare → DEFAULT_FROM_EMAIL（noreply@mail.wort.uk）
--   resend     → noreply@resend.wort.uk
--   mailtrap   → noreply@mailtrap.wort.uk
--   brevo      → noreply@brevo.wort.uk
--
-- 语义：
--   email_priority_*      数值越小越优先；-1 表示停用
--   email_daily_limit_*   每天成功发送上限；0 表示不限额
--   调整阶段默认仅启用 Cloudflare，其余置 -1；某家子域名验证完成后
--   到「管理员 → 系统配置 → 邮件」把对应优先级改回 0~3 即可启用。
--
-- 可重复执行：INSERT OR IGNORE，不覆盖管理员改动过的值。
-- 同时清理旧版单选配置与已下线的 Mailjet / Sender 配置。

INSERT OR IGNORE INTO system_config (
  key, value, description, config_type, config_group, is_public, display_order,
  validation_rules, options, created_at, updated_at
) VALUES
  (
    'email_priority_cloudflare',
    '0',
    'Cloudflare 邮件优先级（数值越小越优先；-1 表示停用）',
    'integer',
    'email',
    0,
    33,
    '{"min": -1, "max": 99}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'email_priority_resend',
    '-1',
    'Resend 邮件优先级（数值越小越优先；-1 表示停用）',
    'integer',
    'email',
    0,
    34,
    '{"min": -1, "max": 99}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'email_priority_mailtrap',
    '-1',
    'Mailtrap 邮件优先级（数值越小越优先；-1 表示停用）',
    'integer',
    'email',
    0,
    35,
    '{"min": -1, "max": 99}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'email_priority_brevo',
    '-1',
    'Brevo 邮件优先级（数值越小越优先；-1 表示停用）',
    'integer',
    'email',
    0,
    36,
    '{"min": -1, "max": 99}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'email_daily_limit_cloudflare',
    '100',
    'Cloudflare 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    'integer',
    'email',
    0,
    37,
    '{"min": 0, "max": 1000000}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'email_daily_limit_resend',
    '100',
    'Resend 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    'integer',
    'email',
    0,
    38,
    '{"min": 0, "max": 1000000}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'email_daily_limit_mailtrap',
    '100',
    'Mailtrap 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    'integer',
    'email',
    0,
    39,
    '{"min": 0, "max": 1000000}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ),
  (
    'email_daily_limit_brevo',
    '100',
    'Brevo 每日发送上限（0 表示不限额，达到后自动使用下一优先级）',
    'integer',
    'email',
    0,
    40,
    '{"min": 0, "max": 1000000}',
    NULL,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
  );

-- 旧版单选配置已由优先级 + 每日限额替代
DELETE FROM system_config WHERE key = 'email_provider';

-- 已下线的服务商配置，避免管理端残留无效项
DELETE FROM system_config
WHERE key IN (
  'email_priority_mailjet',
  'email_daily_limit_mailjet',
  'email_priority_sender',
  'email_daily_limit_sender'
);
