-- 搜索关键词统计表：用于高效的关键词建议查询
-- 避免每次搜索建议都扫描 user_search_history 原始日志表

CREATE TABLE IF NOT EXISTS search_keyword_stats (
    keyword TEXT PRIMARY KEY,           -- 搜索关键词
    count INTEGER NOT NULL DEFAULT 1,   -- 累计搜索次数
    created_at INTEGER NOT NULL,        -- 首次出现时间
    updated_at INTEGER NOT NULL         -- 最后更新时间
);

-- 用于前缀搜索：WHERE keyword LIKE 'prefix%'
CREATE INDEX IF NOT EXISTS idx_search_keyword_stats_keyword ON search_keyword_stats(keyword);

-- 用于热门排序：ORDER BY count DESC
CREATE INDEX IF NOT EXISTS idx_search_keyword_stats_count ON search_keyword_stats(count DESC);

-- 清理旧数据时使用
CREATE INDEX IF NOT EXISTS idx_search_keyword_stats_updated ON search_keyword_stats(updated_at);