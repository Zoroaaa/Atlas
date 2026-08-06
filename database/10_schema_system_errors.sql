-- ===============================================
-- 系统错误监控 + Google OAuth 扩展
-- 版本: 4.2
-- 说明: 1) 新增 system_errors 表（前端/后端错误聚合）
--       2) users 表新增 google_id / google_username 字段（已部署环境升级用）
-- 执行顺序: 10
--
-- 注意：
--   - 全新部署：01_schema_core.sql 已包含 google_id 字段，无需执行本文件第 2 部分
--   - 已部署升级：执行本文件即可，ALTER TABLE 会在列已存在时报错，可忽略
-- ===============================================

-- ===============================================
-- 1. 系统错误记录表（前端 ErrorBoundary + 后端 onError 上报）
-- ===============================================

CREATE TABLE IF NOT EXISTS system_errors (
    id TEXT PRIMARY KEY,                        -- 错误记录唯一标识
    source TEXT NOT NULL,                       -- 错误来源: frontend | backend
    error_type TEXT NOT NULL,                   -- 错误类型: javascript | unhandledrejection | api | server | render
    message TEXT NOT NULL,                      -- 错误消息（截断后存储）
    stack TEXT,                                 -- 错误堆栈（可能为空）
    url TEXT,                                   -- 发生位置：前端 URL 或后端路由路径
    line_number INTEGER,                        -- 行号（前端 source map 解析前）
    column_number INTEGER,                       -- 列号
    user_id TEXT,                               -- 关联用户ID（可为空，匿名用户错误）
    session_id TEXT,                            -- 前端 analytics session_id
    ip_address TEXT,                            -- 用户IP地址
    user_agent TEXT,                            -- 用户代理信息
    request_method TEXT,                        -- 请求方法（后端错误用）
    request_path TEXT,                          -- 请求路径（后端错误用）
    status_code INTEGER,                        -- HTTP 状态码（后端错误用）
    context TEXT DEFAULT '{}',                  -- 额外上下文（JSON：组件栈、面包屑等）
    fingerprint TEXT,                           -- 错误指纹（用于聚合相同错误）
    created_at INTEGER NOT NULL,                -- 发生时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_system_errors_fingerprint ON system_errors(fingerprint);
CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON system_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_source ON system_errors(source);
CREATE INDEX IF NOT EXISTS idx_system_errors_user_id ON system_errors(user_id);

-- ===============================================
-- 2. users 表新增 Google OAuth 字段（已部署环境升级用）
-- 全新部署已在 01_schema_core.sql 包含，以下语句在列已存在时会报错，可忽略
-- ===============================================

ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN google_username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
