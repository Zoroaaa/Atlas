-- ===============================================
-- 收藏表扩展
-- 版本: 2.1
-- 说明: 为 user_favorites 表增加 JAV 元数据字段
-- 执行顺序: 10
-- ===============================================

ALTER TABLE user_favorites ADD COLUMN code TEXT;
ALTER TABLE user_favorites ADD COLUMN cover TEXT;
ALTER TABLE user_favorites ADD COLUMN actors TEXT;
ALTER TABLE user_favorites ADD COLUMN duration TEXT;
ALTER TABLE user_favorites ADD COLUMN tags TEXT;
ALTER TABLE user_favorites ADD COLUMN release_date TEXT;
ALTER TABLE user_favorites ADD COLUMN publisher TEXT;
ALTER TABLE user_favorites ADD COLUMN magnet_link TEXT;

CREATE INDEX IF NOT EXISTS idx_favorites_code ON user_favorites(code);


ALTER TABLE user_favorites ADD COLUMN status TEXT NOT NULL DEFAULT 'want';

CREATE INDEX IF NOT EXISTS idx_user_favorites_status ON user_favorites(user_id, status);