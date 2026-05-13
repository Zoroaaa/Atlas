-- ===============================================
-- 搜索历史表结构扩展
-- 版本: 1.0
-- 说明: 为搜索历史添加详细字段，支持显示更丰富的信息
-- 执行顺序: 11
-- 
-- ⚠️ 字段冗余说明：
--   query 和 keyword 字段存储相同值（搜索关键词）
--   原因：早期版本使用 query，后续重构改为 keyword
--   保留两个字段是为了向后兼容旧数据
--   新代码应统一使用 keyword 字段，query 字段标记为 @deprecated
-- ===============================================

-- ===============================================
-- 扩展 user_search_history 表
-- 添加可选的详细信息字段（参考收藏表但不包含封面）
-- ===============================================

ALTER TABLE user_search_history ADD COLUMN title TEXT;
ALTER TABLE user_search_history ADD COLUMN subtitle TEXT;
ALTER TABLE user_search_history ADD COLUMN code TEXT;
ALTER TABLE user_search_history ADD COLUMN actors TEXT;
ALTER TABLE user_search_history ADD COLUMN duration TEXT;
ALTER TABLE user_search_history ADD COLUMN tags TEXT;
ALTER TABLE user_search_history ADD COLUMN release_date TEXT;
ALTER TABLE user_search_history ADD COLUMN publisher TEXT;
-- @deprecated 使用 keyword 字段替代，保留用于向后兼容
ALTER TABLE user_search_history ADD COLUMN keyword TEXT;
ALTER TABLE user_search_history ADD COLUMN updated_at INTEGER;

-- ===============================================
-- 索引优化（可选字段索引）
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_history_code ON user_search_history(code);
CREATE INDEX IF NOT EXISTS idx_history_keyword ON user_search_history(keyword);
