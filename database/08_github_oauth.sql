-- ===============================================
-- GitHub OAuth 支持
-- 版本: 2.1
-- 说明: 为 users 表添加 github_id 字段，支持 GitHub 一键登录
-- 执行顺序: 08
-- ===============================================

-- 添加 github_id 列（已存在则忽略）
ALTER TABLE users ADD COLUMN github_id TEXT;

-- 添加 github_username 列（用于展示，可选）
ALTER TABLE users ADD COLUMN github_username TEXT;

-- github_id 唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users (github_id) WHERE github_id IS NOT NULL;
