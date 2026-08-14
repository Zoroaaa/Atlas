-- ===============================================
-- 数据存储管理表结构
-- 版本: 1.0
-- 说明: 持久化有效搜索结果，去重落库，多源合并，管理员可查阅
--       不保存用户个人信息，仅保留数据本身
-- 执行顺序: 11
-- ===============================================

-- ===============================================
-- 1. 数据记录主表（规范化资源）
-- 用途: 存储去重后的资源主数据，每种类型一条规范记录
-- ===============================================

CREATE TABLE IF NOT EXISTS data_records (
    id TEXT PRIMARY KEY,                        -- 记录唯一标识
    record_type TEXT NOT NULL CHECK (record_type IN ('jav','anime','movie','manga','novel','actress')),
    dedup_key TEXT NOT NULL,                    -- 去重键（如 jav:ABC-123 / anime:bgm:123）
    title TEXT NOT NULL,                        -- 标题
    cover TEXT,                                 -- 封面图URL
    code TEXT,                                  -- 番号或外部ID（原始值，便于检索）
    actors TEXT,                                -- 演员（JSON数组字符串或逗号分隔）
    duration TEXT,                              -- 时长
    release_date TEXT,                          -- 发行时间
    publisher TEXT,                             -- 发行商/制作方
    tags TEXT DEFAULT '[]',                     -- 标签（JSON数组字符串）
    rating TEXT,                                -- 评分（文本，如 "8.5 分"）
    content_data TEXT NOT NULL,                 -- 完整类型特定数据（JSON字符串）
    detail_completed INTEGER DEFAULT 0,         -- 0=仅首条元数据 1=已补充完整详情
    status TEXT DEFAULT 'active',               -- 状态（active/hidden）
    source_count INTEGER DEFAULT 0,             -- 来源链接数（冗余计数，触发器维护）
    first_seen_at INTEGER NOT NULL,             -- 首次采集时间
    last_updated_at INTEGER NOT NULL,           -- 最近更新时间
    UNIQUE(record_type, dedup_key)              -- 去重核心约束
);

-- ===============================================
-- 2. 数据来源链接子表（多源合并）
-- 用途: 同一资源的多个来源链接/磁力等，合并到主记录下
-- ===============================================

CREATE TABLE IF NOT EXISTS data_record_sources (
    id TEXT PRIMARY KEY,                        -- 来源记录唯一标识
    record_id TEXT NOT NULL,                    -- 关联 data_records.id
    source_name TEXT NOT NULL,                  -- 来源名称（JavBus/Bangumi/TMDB 等）
    source_type TEXT,                           -- 类型（detail/magnet/stream/info）
    source_url TEXT,                            -- 来源URL
    source_data TEXT DEFAULT '{}',              -- 来源特定数据（JSON，如磁力的 size/date/isHD）
    created_at INTEGER NOT NULL,                -- 创建时间
    UNIQUE(record_id, source_name, source_url), -- 同源同URL不重复
    FOREIGN KEY (record_id) REFERENCES data_records (id) ON DELETE CASCADE
);

-- ===============================================
-- 3. 索引
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_data_records_type_seen ON data_records(record_type, first_seen_at);
CREATE INDEX IF NOT EXISTS idx_data_records_status ON data_records(status);
CREATE INDEX IF NOT EXISTS idx_data_records_detail ON data_records(detail_completed);
CREATE INDEX IF NOT EXISTS idx_data_records_code ON data_records(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_record_sources_record ON data_record_sources(record_id);

-- ===============================================
-- 4. 触发器：来源计数维护
-- 用途: data_record_sources 增删时自动维护 data_records.source_count
-- ===============================================

CREATE TRIGGER IF NOT EXISTS update_source_count_after_insert
AFTER INSERT ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count + 1 WHERE id = NEW.record_id;
END;

CREATE TRIGGER IF NOT EXISTS update_source_count_after_delete
AFTER DELETE ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count - 1 WHERE id = OLD.record_id;
END;

-- 注：last_updated_at 由应用层显式维护（避免 AFTER UPDATE 递归触发）
