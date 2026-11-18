-- Atlas 数据库 · 榜单归档历史快照修正（非最新只保留掉榜影片）
-- 依赖：14_jav_ranking_archive.sql、21_jav_ranking_cycle_backfill.sql
-- 可重复执行：每次清空并重建周榜/月榜归档，并裁剪 TOP250 历史快照；年度榜快照不动。
--
-- 修正原因：
--   21 号脚本按「首次出现 <= 当日 <= 最后出现」逐日还原，会把跨天仍在榜的作品
--   重复写进周期内的每一天，导致非终榜快照也接近满榜。实际规则应为：
--     · 周期内非最新快照只保留「最后一次上榜日 = 当日」的影片（当天掉榜记录）
--     · 周期最新（终榜）快照保留完整榜单，最多 60 部
--     · TOP250 没有周期，所有更早快照永久裁剪，只保留不在最新快照里的影片
--   这样每个榜单只有最新/终榜快照是满的，其余快照都是历史掉榜记录。
--
-- 数据来源仍是 data_record_sources：
--   created_at = 首次上榜，source_data.fetchedAt = 最后一次上榜。
--   非最新日按「最后上榜日 = 当日」还原掉榜记录；
--   最新日按「首次 <= 当日 <= 最后」还原完整榜单，按名次取前 60 部。
--   逐日名次没有单独存证，排名取该作品最后一次上榜名次，补档用于展示结构而非逐日精确名次。
--
-- 执行后新导入的榜单会由后端自动维护同样的结构，无需再次补档。

-- ── 1. 清空周榜 / 月榜旧快照 ─────────────────────────────
DELETE FROM jav_ranking_entries
 WHERE snapshot_key IN (
   SELECT snapshot_key FROM jav_ranking_snapshots
    WHERE list_type IN ('weekly', 'monthly')
 );

DELETE FROM jav_ranking_snapshots
 WHERE list_type IN ('weekly', 'monthly');

-- ── 2. 先按通道起止日期生成每一天的快照（数量先写 0，第 5 步回填） ──
INSERT OR REPLACE INTO jav_ranking_snapshots
    (snapshot_key, source_name, list_type, section, year, snapshot_at, item_count, created_at)
WITH RECURSIVE
sources AS (
  SELECT
    rs.source_name,
    CASE json_extract(rs.source_data, '$.period')
      WHEN 'weekly' THEN 'weekly'
      WHEN 'monthly' THEN 'monthly'
    END AS list_type,
    COALESCE(json_extract(rs.source_data, '$.section'), 'censored') AS section,
    rs.created_at AS first_at,
    CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER) AS last_at
  FROM data_record_sources rs
  JOIN data_records d ON d.id = rs.record_id
  WHERE rs.source_type = 'ranking'
    AND d.record_type = 'jav'
    AND d.code IS NOT NULL
    AND json_valid(rs.source_data)
    AND json_extract(rs.source_data, '$.period') IN ('weekly', 'monthly')
    AND CAST(json_extract(rs.source_data, '$.rank') AS INTEGER) > 0
),
bounds AS (
  SELECT
    source_name,
    list_type,
    section,
    MIN(date(first_at / 1000, 'unixepoch', '+8 hours')) AS start_day,
    MAX(date(last_at / 1000, 'unixepoch', '+8 hours')) AS end_day
  FROM sources
  GROUP BY source_name, list_type, section
),
days(source_name, list_type, section, day, end_day) AS (
  SELECT source_name, list_type, section, start_day, end_day
  FROM bounds
  UNION ALL
  SELECT source_name, list_type, section, date(day, '+1 day'), end_day
  FROM days
  WHERE day < end_day
),
cycle_days AS (
  SELECT
    source_name,
    list_type,
    section,
    day,
    CASE list_type
      WHEN 'weekly' THEN
        'week:' ||
        strftime('%Y', date(day, '-3 days', 'weekday 4')) || '-W' ||
        printf('%02d', (CAST(strftime('%j', date(day, '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7 + 1)
      ELSE
        'month:' || strftime('%Y-%m', day)
    END AS cycle_key
  FROM days
)
SELECT
  source_name || ':' || cycle_key || ':' || day,
  source_name,
  list_type,
  section,
  NULL,
  CAST(strftime('%s', day, '-8 hours') AS INTEGER) * 1000 + 7200000,
  0,
  CAST(strftime('%s', day, '-8 hours') AS INTEGER) * 1000 + 7200000
FROM cycle_days;

-- ── 3. 计算每个快照应包含的条目（非最新日=当天掉榜，最新日=完整榜单） ──
DROP TABLE IF EXISTS _jav_ranking_backfill_22;
CREATE TABLE _jav_ranking_backfill_22 (
  snapshot_key TEXT NOT NULL,
  source_name  TEXT NOT NULL,
  list_type    TEXT NOT NULL,
  section      TEXT NOT NULL,
  cycle_key    TEXT NOT NULL,
  day          TEXT NOT NULL,
  record_id    TEXT,
  code         TEXT NOT NULL,
  title        TEXT,
  cover        TEXT,
  rank         INTEGER NOT NULL,
  score        TEXT,
  url          TEXT
);

INSERT INTO _jav_ranking_backfill_22
    (snapshot_key, source_name, list_type, section, cycle_key, day,
     record_id, code, title, cover, rank, score, url)
WITH RECURSIVE
sources AS (
  SELECT
    rs.source_name,
    CASE json_extract(rs.source_data, '$.period')
      WHEN 'weekly' THEN 'weekly'
      WHEN 'monthly' THEN 'monthly'
    END AS list_type,
    COALESCE(json_extract(rs.source_data, '$.section'), 'censored') AS section,
    rs.created_at AS first_at,
    CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER) AS last_at,
    rs.record_id,
    d.code,
    d.title,
    d.cover,
    CAST(json_extract(rs.source_data, '$.rank') AS INTEGER) AS rank,
    CAST(json_extract(rs.source_data, '$.score') AS TEXT) AS score,
    json_extract(rs.source_data, '$.url') AS url
  FROM data_record_sources rs
  JOIN data_records d ON d.id = rs.record_id
  WHERE rs.source_type = 'ranking'
    AND d.record_type = 'jav'
    AND d.code IS NOT NULL
    AND json_valid(rs.source_data)
    AND json_extract(rs.source_data, '$.period') IN ('weekly', 'monthly')
    AND CAST(json_extract(rs.source_data, '$.rank') AS INTEGER) > 0
),
bounds AS (
  SELECT
    source_name,
    list_type,
    section,
    MIN(date(first_at / 1000, 'unixepoch', '+8 hours')) AS start_day,
    MAX(date(last_at / 1000, 'unixepoch', '+8 hours')) AS end_day
  FROM sources
  GROUP BY source_name, list_type, section
),
days(source_name, list_type, section, day, end_day) AS (
  SELECT source_name, list_type, section, start_day, end_day
  FROM bounds
  UNION ALL
  SELECT source_name, list_type, section, date(day, '+1 day'), end_day
  FROM days
  WHERE day < end_day
),
cycle_days AS (
  SELECT
    source_name,
    list_type,
    section,
    day,
    CASE list_type
      WHEN 'weekly' THEN
        'week:' ||
        strftime('%Y', date(day, '-3 days', 'weekday 4')) || '-W' ||
        printf('%02d', (CAST(strftime('%j', date(day, '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7 + 1)
      ELSE
        'month:' || strftime('%Y-%m', day)
    END AS cycle_key
  FROM days
),
latest_days AS (
  SELECT source_name, list_type, section, cycle_key, MAX(day) AS latest_day
  FROM cycle_days
  GROUP BY source_name, list_type, section, cycle_key
),
snapshot_entries AS (
  SELECT
    cd.source_name,
    cd.list_type,
    cd.section,
    cd.cycle_key,
    cd.day,
    CASE WHEN cd.day = ld.latest_day THEN 1 ELSE 0 END AS is_latest,
    ROW_NUMBER() OVER (
      PARTITION BY cd.source_name, cd.list_type, cd.section, cd.cycle_key, cd.day
      ORDER BY s.rank ASC
    ) AS row_no,
    s.record_id,
    s.code,
    s.title,
    s.cover,
    s.rank,
    s.score,
    s.url
  FROM cycle_days cd
  JOIN latest_days ld
    ON ld.source_name = cd.source_name
   AND ld.list_type = cd.list_type
   AND ld.section = cd.section
   AND ld.cycle_key = cd.cycle_key
  JOIN sources s
    ON s.source_name = cd.source_name
   AND s.list_type = cd.list_type
   AND s.section = cd.section
   AND (
        (cd.day = ld.latest_day
         AND date(s.first_at / 1000, 'unixepoch', '+8 hours') <= cd.day
         AND date(s.last_at / 1000, 'unixepoch', '+8 hours') >= cd.day)
     OR (cd.day < ld.latest_day
         AND date(s.last_at / 1000, 'unixepoch', '+8 hours') = cd.day)
   )
)
SELECT
  cd.source_name || ':' || cd.cycle_key || ':' || cd.day,
  cd.source_name,
  cd.list_type,
  cd.section,
  cd.cycle_key,
  cd.day,
  cd.record_id,
  cd.code,
  cd.title,
  cd.cover,
  cd.rank,
  cd.score,
  cd.url
FROM snapshot_entries cd
WHERE cd.is_latest = 0 OR cd.row_no <= 60;

-- ── 4. 写入名次明细 ─────────────────────────────────────
INSERT OR REPLACE INTO jav_ranking_entries
    (id, snapshot_key, record_id, code, title, cover, rank, score, url,
     list_type, section, year, source_name, snapshot_at, created_at)
SELECT
  k.snapshot_key || ':' || k.code,
  k.snapshot_key,
  k.record_id,
  k.code,
  k.title,
  k.cover,
  k.rank,
  k.score,
  k.url,
  k.list_type,
  k.section,
  NULL,
  k.source_name,
  s.snapshot_at,
  s.snapshot_at
FROM _jav_ranking_backfill_22 k
JOIN jav_ranking_snapshots s ON s.snapshot_key = k.snapshot_key;

-- ── 5. TOP250 历史快照永久裁剪：更早快照只保留不在最新快照里的影片 ──
-- TOP250 没有周期，每次新快照都会裁剪此前全部历史；这里修正已有快照。
WITH latest AS (
  SELECT source_name, section, MAX(snapshot_at) AS latest_at
  FROM jav_ranking_snapshots
  WHERE list_type = 'top250'
  GROUP BY source_name, section
),
stale AS (
  SELECT s.snapshot_key
  FROM jav_ranking_snapshots s
  JOIN latest l
    ON l.source_name = s.source_name
   AND l.section = s.section
  WHERE s.list_type = 'top250'
    AND s.snapshot_at < l.latest_at
)
DELETE FROM jav_ranking_entries
 WHERE snapshot_key IN (SELECT snapshot_key FROM stale)
   AND code IN (
     SELECT e.code
     FROM jav_ranking_entries e
     JOIN jav_ranking_snapshots s ON s.snapshot_key = e.snapshot_key
     JOIN latest l
       ON l.source_name = s.source_name
      AND l.section = s.section
     WHERE s.list_type = 'top250'
       AND s.snapshot_at = l.latest_at
   );

-- ── 6. 回填每个快照的真实条目数 ─────────────────────────
UPDATE jav_ranking_snapshots
   SET item_count = (
     SELECT COUNT(*) FROM jav_ranking_entries e
      WHERE e.snapshot_key = jav_ranking_snapshots.snapshot_key
   )
 WHERE list_type IN ('weekly', 'monthly', 'top250');

DROP TABLE IF EXISTS _jav_ranking_backfill_22;
