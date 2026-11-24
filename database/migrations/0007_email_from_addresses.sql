-- Atlas 数据库迁移 0007 · 邮件发件地址纳入系统配置
--
-- 新增 Cloudflare / Resend / Mailtrap / Brevo 四个发件地址配置；INSERT OR IGNORE 不覆盖已有值。
-- 发送侧读取这些键，未配置或留空时回退 DEFAULT_FROM_EMAIL（wrangler.toml）。

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('email_from_cloudflare', '',
   'Cloudflare 发件地址；留空使用全局 DEFAULT_FROM_EMAIL',
   'string', 'email', '{"maxLength": 254}', NULL, 0, 1, 0, 30, 1794808775000, 1794808775000);

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('email_from_resend', 'noreply@resend.wort.uk',
   'Resend 发件地址；需与 Resend 已验证域名一致，留空回退 DEFAULT_FROM_EMAIL',
   'string', 'email', '{"maxLength": 254}', NULL, 0, 1, 0, 31, 1794808775000, 1794808775000);

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('email_from_mailtrap', 'noreply@mailtrap.wort.uk',
   'Mailtrap 发件地址；需与 Mailtrap 已验证域名一致，留空回退 DEFAULT_FROM_EMAIL',
   'string', 'email', '{"maxLength": 254}', NULL, 0, 1, 0, 32, 1794808775000, 1794808775000);

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('email_from_brevo', 'noreply@brevo.wort.uk',
   'Brevo 发件地址；需与 Brevo 已验证域名一致，留空回退 DEFAULT_FROM_EMAIL',
   'string', 'email', '{"maxLength": 254}', NULL, 0, 1, 0, 33, 1794808775000, 1794808775000);
