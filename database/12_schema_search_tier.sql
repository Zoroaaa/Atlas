-- 搜索限流档位（users 表增量迁移）
-- 版本: 2.0（幂等化）
--
-- 背景：SQLite / D1 不支持 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，重复执行 ALTER 会报
--       `duplicate column name` 并中断脚本；而 01_schema_core.sql 已为新装库直接建好这两列。
-- 处理：本文件不再执行 ALTER，改为幂等校验，全新库和已升级库都可安全、重复执行。
--
-- 校验结果说明：
--   search_tier_column_count = 2  -> 两列均已存在，无需处理
--   search_tier_column_count = 0  -> v1.5.0 之前、从未执行过原版 12 的存量库，请手动补列：
--       ALTER TABLE users ADD COLUMN search_tier INTEGER DEFAULT 1;
--       ALTER TABLE users ADD COLUMN tier_updated_at INTEGER;
--     补列后再执行 13_backfill_search_tier.sql 回填存量用户档位。

SELECT
    COUNT(*) AS search_tier_column_count,
    CASE WHEN COUNT(*) = 2
         THEN 'OK: search_tier / tier_updated_at 已存在'
         ELSE 'MISSING: 请按文件头部说明手动补列'
    END AS search_tier_status
FROM pragma_table_info('users')
WHERE name IN ('search_tier', 'tier_updated_at');
