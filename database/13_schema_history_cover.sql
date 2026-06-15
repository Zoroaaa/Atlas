-- ===============================================
-- 搜索历史表新增封面字段
-- 版本: 1.0
-- 说明: 为搜索历史增强（方案B）添加 cover 字段
--       用于存储聚合搜索返回的 Bangumi 封面 / TMDB poster
--       使前端可以卡片模式展示搜索历史
-- 执行顺序: 13
-- ===============================================

ALTER TABLE user_search_history ADD COLUMN cover TEXT;

-- 索引：支持按有/无封面筛选
CREATE INDEX IF NOT EXISTS idx_history_cover ON user_search_history(cover)
  WHERE cover IS NOT NULL AND cover != '';
