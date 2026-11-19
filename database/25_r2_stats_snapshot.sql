-- Atlas 数据库 · R2 统计快照（把全表聚合从「每次请求」挪到「每轮扫描」）
-- 依赖：24_r2_objects.sql
--
-- 为什么需要：看板统计原本每次请求都要对 r2_objects 做 4 次全表聚合，
-- 并对 data_records / cover_assets 做多次全表扫描，单次约 137 万行读。
-- 5 分钟缓存 × 每天 288 次 = 近 4 亿行读，是 D1 付费额度的一半。
-- 聚合结果改由扫描轮次结束时算一次并落库，请求侧只读一行。
--
-- 注意：本文件含一条 ALTER TABLE，**只能执行一次**。
-- 重复执行时该语句会报 "duplicate column name: scan_mode"，其余语句均可重复执行。

-- 本轮是全量校验还是增量登记。跨 tick 必须持久化：一轮扫描可能持续上百分片，
-- 中途切换模式会让部分行没更新 last_seen_at，进而被误判成「对象已消失」
ALTER TABLE r2_scan_state
  ADD COLUMN scan_mode TEXT NOT NULL DEFAULT 'incremental';

CREATE TABLE IF NOT EXISTS r2_stats_snapshot (
    -- 单例行，与 r2_scan_state 一样用 CHECK 约束保证只有一行
    id            TEXT PRIMARY KEY CHECK (id = 'current'),
    -- 整份统计的 JSON（r2 / ledger / business / diff / byNamespace / ageBuckets）
    payload       TEXT NOT NULL DEFAULT '{}',
    -- 冗余的总数与总体积：对象列表分页要用，避免请求时解析 JSON
    total_objects INTEGER NOT NULL DEFAULT 0,
    total_bytes   INTEGER NOT NULL DEFAULT 0,
    generated_at  INTEGER NOT NULL DEFAULT 0,
    -- 上一次「全量校验」轮次的时间。日常轮次只登记新对象、不做消失检测，
    -- 因为只有本系统在写这个 bucket，外部删除是罕见事件，不值得每天付全表写入
    last_full_at  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO r2_stats_snapshot (id, payload, generated_at, last_full_at)
VALUES ('current', '{}', 0, 0);
