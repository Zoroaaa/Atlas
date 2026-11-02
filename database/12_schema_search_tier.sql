-- 搜索限流档位（users 表增量迁移）
-- 存量库需手动执行一次；新装库由 01_schema_core.sql 直接建列。
ALTER TABLE users ADD COLUMN search_tier INTEGER DEFAULT 1;   -- 搜索限流档位（只升不降）
ALTER TABLE users ADD COLUMN tier_updated_at INTEGER;         -- 档位最近评估时间戳（毫秒）
