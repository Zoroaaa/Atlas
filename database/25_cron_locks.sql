-- ============================================================================
-- 25_cron_locks.sql
--
-- 定时任务互斥锁（租约）。
--
-- 背景：Workers cron 不保证「上一轮结束才开始下一轮」。关注检测要抓外部站、
-- 邮件摘要要发信，慢轮次可能超过 30 分钟，下一轮会重叠执行，重复写 D1。
-- 锁用一张极小的表记录「谁在跑到什么时候」，到期自动失效（无需人工清理）。
--
-- 语义：locked_until 是租约到期时间；持有者结束后主动删除自己那行，
--       崩溃/超时未删除时，下一轮在租约过期后即可抢占。
--
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。
-- 回滚：DROP TABLE IF EXISTS cron_locks;（仅影响重叠保护，不影响数据）
-- 注意：本次后端在表不存在时会记警告并照常执行任务（fail-open），
--       所以「先部署代码、后跑脚本」不会让定时任务停摆。
-- ============================================================================

CREATE TABLE IF NOT EXISTS cron_locks (
    key TEXT PRIMARY KEY,                       -- 任务标识，如 follow.check
    locked_until INTEGER NOT NULL,              -- 租约到期时间戳（毫秒）
    owner TEXT NOT NULL,                        -- 持有者 id（本次执行随机生成）
    updated_at INTEGER NOT NULL
);
