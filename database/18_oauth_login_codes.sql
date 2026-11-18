-- ──────────────────────────────────────────────────────────────
-- 18. OAuth 一次性登录票据 + 验证码明文清理
--
-- 背景：
--   1) OAuth 回调原本把长期 JWT 拼在 302 的 query 上，token 会进入浏览器历史、
--      访问日志与 Referer。改为回调只发一次性 code，前端 POST 兑换 token。
--   2) email_verifications.verification_code 历史上存过明文验证码；
--      新代码不再写入明文（写空串占位），这里清理存量。
--
-- 执行顺序：先于新版本 Worker 部署执行（兑换接口依赖 oauth_login_codes）。
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_login_codes (
    code_hash TEXT PRIMARY KEY,                 -- 一次性 code 的 SHA-256 摘要
    user_id TEXT NOT NULL,                      -- 已通过 OAuth 校验的用户
    provider TEXT NOT NULL,                     -- github / google
    expires_at INTEGER NOT NULL,                -- 过期时间（5 分钟）
    created_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_login_codes(expires_at);

-- 清理历史明文验证码：列是 NOT NULL，保留空串占位，校验逻辑只读 code_hash
UPDATE email_verifications SET verification_code = '' WHERE verification_code <> '';
