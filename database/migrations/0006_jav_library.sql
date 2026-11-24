-- Atlas 数据库迁移 0006 · JAV Library & R2：作品库 / 榜单归档 / 封面账本 / R2 对象快照
--
-- 由历史脚本 08、14、16、24、25 合并为幂等终态结构（含单行状态表的初始化行）。
-- 全部对象使用 IF NOT EXISTS，可在已有生产库上直接执行。

-- ── 表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cover_assets (
    url_hash        TEXT PRIMARY KEY,             -- sha256(归一化 URL)，64 位小写 hex
    url             TEXT NOT NULL,                -- 归一化后的完整地址（审计 / 重建）
    namespace       TEXT NOT NULL,                -- jav/anime/movie/manga/novel/person/misc
    object_key      TEXT NOT NULL UNIQUE,         -- covers/v1/orig/<ns>/<h2>/<hash>
    status          TEXT NOT NULL DEFAULT 'ready'
                    CHECK (status IN ('ready', 'missing', 'failed')),
    mime_type       TEXT,
    byte_size       INTEGER,
    source_host     TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    retry_exhausted INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_retry_at   INTEGER NOT NULL DEFAULT 0,
    first_seen_at   INTEGER NOT NULL,
    stored_at       INTEGER,
    updated_at      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS data_record_covers (
    record_id  TEXT PRIMARY KEY,
    cover_url  TEXT NOT NULL,                     -- 处理时的 data_records.cover 快照
    url_hash   TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (record_id) REFERENCES data_records(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS "detail_fetch_jobs" (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'running', -- running | done
  batch_size        INTEGER NOT NULL DEFAULT 10,
  total             INTEGER NOT NULL DEFAULT 0,
  processed         INTEGER NOT NULL DEFAULT 0,
  completed         INTEGER NOT NULL DEFAULT 0,
  partial           INTEGER NOT NULL DEFAULT 0,
  absent            INTEGER NOT NULL DEFAULT 0,
  transient_failed  INTEGER NOT NULL DEFAULT 0,
  skipped           INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_by        TEXT,
  -- 只补哪一类：director | maker | publisher | magnets | transient | absent | pending；NULL 表示不限
  filter_missing    TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  finished_at       INTEGER
);

CREATE TABLE IF NOT EXISTS entity_aliases (
    id            TEXT PRIMARY KEY,
    -- 实体类型：work（作品）/ person（人物）/ tag（标签）
    entity_type   TEXT NOT NULL,
    -- 全局唯一实体 id，如 tmdb:movie:278、bangumi:253、wikidata:Q123
    canonical_id  TEXT NOT NULL,
    -- 别名语言：zh / zh-TW / ja / en / romaji / pinyin
    lang          TEXT NOT NULL,
    -- 展示用原文
    alias         TEXT NOT NULL,
    -- 查询键：NFKC + 小写 + 去空白/标点
    alias_key     TEXT NOT NULL,
    -- 数据来源：manual / tmdb / wikidata / wikipedia / bangumi / mangadex / ai
    source        TEXT NOT NULL,
    -- 置信度 0~1：人工 1.0、元数据 0.9、AI 候选校验通过 0.5
    confidence    REAL NOT NULL DEFAULT 1.0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    UNIQUE(entity_type, canonical_id, lang, alias_key)
);

CREATE TABLE IF NOT EXISTS jav_detail_meta (
  record_id           TEXT PRIMARY KEY,
  -- pending: 从未成功抓取 / complete: 四个字段齐全 / partial: 抓到了但缺字段
  -- absent: 源站确认没有该番号或确实没有这些字段 / error: 暂时失败（网络/拦截）
  status              TEXT NOT NULL DEFAULT 'pending',
  missing_mask        INTEGER NOT NULL DEFAULT 0,
  -- 只统计「源站缺失」次数；超时、网络、拦截走 transient_failures，不消耗重试次数
  attempts            INTEGER NOT NULL DEFAULT 0,
  transient_failures  INTEGER NOT NULL DEFAULT 0,
  next_retry_at       INTEGER NOT NULL DEFAULT 0,
  retry_exhausted     INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  fetched_at          INTEGER,
  updated_at          INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (record_id) REFERENCES data_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jav_genre_pages (
    name_key      TEXT PRIMARY KEY,
    -- 从分页窗口学到过 / 成功抓到过的最大页码
    max_page_seen INTEGER NOT NULL DEFAULT 1,
    -- >0 表示已确认末页；0 表示未知
    last_page     INTEGER NOT NULL DEFAULT 0,
    -- 上次扩张探测的页码
    last_page_p   INTEGER NOT NULL DEFAULT 0,
    probed_at     INTEGER NOT NULL DEFAULT 0,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jav_genres (
    -- 稳定主键：section + name_key，避免同名标签跨 section 冲突
    id            TEXT PRIMARY KEY,
    -- 归一化名（valueKey：小写 + 去空白），跨 section 唯一：同名标签只保留一条
    name_key      TEXT NOT NULL UNIQUE,
    -- 展示名，取自站点锚文本
    name          TEXT NOT NULL,
    -- URL slug，如 4g / hd
    genre_key     TEXT NOT NULL,
    -- 'censored' | 'uncensored'
    section       TEXT NOT NULL,
    -- 完整 URL，由 section + genre_key 在服务端拼接（不接受前端传 URL）
    url           TEXT NOT NULL,
    -- 技术/发行属性标签由同步时用 isTechnicalTag 直接算好，查询零成本
    is_technical  INTEGER NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jav_ranking_entries (
    id           TEXT PRIMARY KEY,               -- snapshot_key + ':' + code
    snapshot_key TEXT NOT NULL,
    record_id    TEXT,                           -- 关联 data_records.id；记录被删除后仍保留快照
    code         TEXT NOT NULL,
    title        TEXT,
    cover        TEXT,
    rank         INTEGER NOT NULL,
    score        TEXT,
    url          TEXT,
    list_type    TEXT NOT NULL,
    section      TEXT NOT NULL,
    year         INTEGER,
    source_name  TEXT NOT NULL,
    snapshot_at  INTEGER NOT NULL,
    created_at   INTEGER NOT NULL,
    UNIQUE(snapshot_key, code)
);

CREATE TABLE IF NOT EXISTS jav_ranking_snapshots (
    snapshot_key TEXT PRIMARY KEY,               -- source_name + ':' + 周期 + ':' + 抓取日
    source_name  TEXT NOT NULL,                  -- 如 JavDB:有码周榜 / JavDB:TOP250全部
    list_type    TEXT NOT NULL,                  -- weekly | monthly | top250 | yearly
    section      TEXT NOT NULL,                  -- censored | uncensored | western | fc2 | all
    year         INTEGER,                        -- 年度榜年份；其他榜单为 NULL
    snapshot_at  INTEGER NOT NULL,               -- 抓取时间（毫秒）
    item_count   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS r2_objects (
    -- 主键用完整 key 而不是 url_hash：异常/历史格式的 key 也必须能被登记、
    -- 能被回收，否则就是「发现不了也删不掉」这个原始问题换个形式复现
    object_key      TEXT PRIMARY KEY,
    -- key 尾段反解出的 sha256；反解失败（历史/异常格式）为 NULL，不参与账本对账
    url_hash        TEXT,
    namespace       TEXT NOT NULL,
    byte_size       INTEGER NOT NULL DEFAULT 0,
    -- 取 R2 对象的 uploaded，不是首次发现时间。回收「N 天前」只认这个字段
    uploaded_at     INTEGER NOT NULL,
    first_seen_at   INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL,
    -- 连续未扫到的轮数。达到 2 才落 deleted_at：单次 list 抖动或分页边界
    -- 不该被当成「对象已消失」，否则会牵连后面的修账逻辑一起误判
    missing_rounds  INTEGER NOT NULL DEFAULT 0,
    -- 已从 R2 消失（外部删除或本系统回收）的物化标记。
    -- 统计与列表统一用 `deleted_at IS NULL` 过滤，才能命中下面的部分索引
    deleted_at      INTEGER,
    -- 本系统批量回收的时间；下次扫描重新见到该 key 时清空
    reclaimed_at    INTEGER,
    -- 回收后又被访问重建的对象打上保护期，避免反复删同一张热图。
    -- 代理命中后由 CDN 直出，Worker 再也看不到该 key，无法直接观测访问热度，
    -- 只能靠「被删了又回来」这一个信号区分热图与死图
    protect_until   INTEGER
);

CREATE TABLE IF NOT EXISTS r2_scan_state (
    -- 单行状态机：CHECK 保证只有一行，避免多实例各写一条游标
    id               TEXT PRIMARY KEY CHECK (id = 'current'),
    status           TEXT NOT NULL DEFAULT 'idle'
                     CHECK (status IN ('idle', 'running', 'completed', 'failed')),
    -- 轮次 id，仅用于日志与排障
    scan_id          TEXT,
    -- R2 list 的 opaque cursor；NULL 表示从本轮开头扫
    cursor           TEXT,
    pages_done       INTEGER NOT NULL DEFAULT 0,
    objects_seen     INTEGER NOT NULL DEFAULT 0,
    -- 反解失败、只登记不关联账本的 key 数
    skipped_keys     INTEGER NOT NULL DEFAULT 0,
    -- 0 表示本轮已扫到底
    is_truncated     INTEGER NOT NULL DEFAULT 1,
    started_at       INTEGER,
    completed_at     INTEGER,
    -- 下次允许开新一轮的时间；手动「立即扫描」把它置 0
    next_scan_at     INTEGER NOT NULL DEFAULT 0,
    trigger          TEXT NOT NULL DEFAULT 'cron'
                     CHECK (trigger IN ('cron', 'manual')),
    -- 统计缓存版本号：完成一轮、执行回收后 +1。
    -- cron 没有 request origin，无法构造合法缓存 key 去 delete 边缘缓存，
    -- 把版本号放进 key 就能让旧条目自然过期
    stats_version    INTEGER NOT NULL DEFAULT 0,
    last_error       TEXT,
    updated_at       INTEGER NOT NULL DEFAULT 0,
    -- 'full' = 全量校验（做消失检测）；'incremental' = 只登记新对象
    scan_mode        TEXT NOT NULL DEFAULT 'incremental'
);

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

-- ── 索引 ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cover_assets_host
  ON cover_assets(source_host);

CREATE INDEX IF NOT EXISTS idx_cover_assets_retry
  ON cover_assets(status, retry_exhausted, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_data_record_covers_hash
  ON data_record_covers(url_hash);

CREATE INDEX IF NOT EXISTS idx_data_record_sources_record ON data_record_sources(record_id);

CREATE INDEX IF NOT EXISTS idx_data_records_code ON data_records(code) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_records_cover_updated
  ON data_records(last_updated_at DESC)
  WHERE cover IS NOT NULL AND trim(cover) <> '';

CREATE INDEX IF NOT EXISTS idx_data_records_first_seen
  ON data_records(first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_records_jav_pending
  ON data_records(record_type, status, detail_completed, last_updated_at)
  WHERE record_type = 'jav' AND status = 'active' AND detail_completed = 0;

CREATE INDEX IF NOT EXISTS idx_data_records_retention
    ON data_records(detail_completed, last_updated_at);

CREATE INDEX IF NOT EXISTS idx_data_records_type_code
  ON data_records (record_type, code);

CREATE INDEX IF NOT EXISTS idx_data_records_type_seen ON data_records(record_type, first_seen_at);

CREATE INDEX IF NOT EXISTS idx_data_records_type_title
  ON data_records(record_type, title);

CREATE INDEX IF NOT EXISTS idx_detail_fetch_jobs_status
  ON detail_fetch_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical
  ON entity_aliases(entity_type, canonical_id);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_lookup
  ON entity_aliases(entity_type, alias_key);

CREATE INDEX IF NOT EXISTS idx_jav_detail_meta_due
  ON jav_detail_meta (retry_exhausted, status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_jav_detail_meta_missing
  ON jav_detail_meta (missing_mask);

CREATE INDEX IF NOT EXISTS idx_jav_genres_key
  ON jav_genres(name_key);

CREATE INDEX IF NOT EXISTS idx_jav_genres_usable
  ON jav_genres(section, is_technical, sort_order);

CREATE INDEX IF NOT EXISTS idx_jav_meta_recent
  ON jav_detail_meta(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_jav_meta_retry
  ON jav_detail_meta(next_retry_at);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_code
    ON jav_ranking_entries(code);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_latest
    ON jav_ranking_entries(list_type, section, year, snapshot_at DESC, rank);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_snapshot
    ON jav_ranking_entries(snapshot_key, rank);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_time
    ON jav_ranking_entries(snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_snapshots_filter
    ON jav_ranking_snapshots(list_type, section, year, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_snapshots_time
    ON jav_ranking_snapshots(snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_r2_objects_hash
  ON r2_objects(url_hash);

CREATE INDEX IF NOT EXISTS idx_r2_objects_ns_uploaded
  ON r2_objects(namespace, uploaded_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_r2_objects_uploaded
  ON r2_objects(uploaded_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_record_sources_name
  ON data_record_sources(source_name);

CREATE INDEX IF NOT EXISTS idx_sources_type
  ON data_record_sources(source_type);

CREATE INDEX IF NOT EXISTS idx_sources_url
  ON data_record_sources(source_url)
  WHERE source_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_detail_fetch_jobs_running
  ON detail_fetch_jobs (status) WHERE status = 'running';

-- ── 触发器 ────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS update_source_count_after_delete
AFTER DELETE ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count - 1 WHERE id = OLD.record_id;
END;

CREATE TRIGGER IF NOT EXISTS update_source_count_after_insert
AFTER INSERT ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count + 1 WHERE id = NEW.record_id;
END;

-- ── 单行状态初始化（扫描/统计循环依赖，缺失时无法启动） ──
INSERT OR IGNORE INTO r2_scan_state (id, status, updated_at, next_scan_at)
VALUES ('current', 'idle', 0, 0);

INSERT OR IGNORE INTO r2_stats_snapshot (id, payload, generated_at, last_full_at)
VALUES ('current', '{}', 0, 0);
