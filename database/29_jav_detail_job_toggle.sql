-- 29_jav_detail_job_toggle.sql
--
-- JAV 详情批量补全的运行时开关。
--
-- 背景：
--   该任务由每分钟 cron 驱动（wrangler.toml 的 "* * * * *"），
--   之前关闭它只能改 cron 重新部署，或直接改 detail_fetch_jobs 的任务状态。
--
-- 开关语义：
--   value = 1 / 缺失 / 无法识别 / 查询出错  → 按启用处理（fail-open）
--   value = 0 或 false                     → 分钟 cron 直接跳过，不推进任务，
--                                            任务行保持 running，恢复后自动继续。
--
-- 可重复执行：INSERT OR IGNORE，已存在时不覆盖用户改动过的值。
-- 管理端位置：管理员 → 系统配置 → 功能开关 → jav_detail_job_enabled。

INSERT OR IGNORE INTO system_config (
  key, value, description, config_type, config_group, is_public, display_order, validation_rules, created_at, updated_at
) VALUES (
  'jav_detail_job_enabled',
  '1',
  '是否推进 JAV 详情批量补全。与「数据存储」面板里的「暂停/继续」是同一个开关：关闭后分钟 cron 跳过推进，任务进度保留，重新打开后从同一任务继续。',
  'boolean',
  'features',
  0,
  11,
  NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);
