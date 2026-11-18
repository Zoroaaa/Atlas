-- Atlas 数据库 · 榜单归档按周期重建（周榜 / 月榜历史补档 + 年度榜去重）
-- 依赖：14_jav_ranking_archive.sql
-- 可重复执行：先清空周榜/月榜归档，再从 data_record_sources 重建；年度榜按「同月」去重。
--
-- 新周期规则（周期与终榜标记由后端按快照时间计算，不落库）：
--   · 周榜：ISO 周（周一至周日）一个周期，每天一个快照，周日为终榜（60 部）
--   · 月榜：自然月一个周期，每天一个快照，月末为终榜（60 部）
--   · 年度榜：刷新年一个周期，每月一个快照，12 月为终榜（250 部）
--   · TOP250：不分周期，最新一期为当前榜，其余为历史快照
--
-- 补档数据来源：data_record_sources 的周榜/月榜行按 (record_id, source_name, source_url)
-- 唯一，created_at 是作品首次上榜时间，source_data.fetchedAt 是最后一次上榜时间。
-- 「首次出现 <= 当日 <= 最后出现」视为当日仍在榜，逐日还原快照；名次取最后一次上榜名次。
-- 逐日名次没有单独存证，因此补档用于还原周期内进榜作品与周期终榜，不保证每一天名次完全精确。
--
-- 只动 jav_ranking_* 归档表，不改 data_record_sources / data_records。
-- TOP250 与年度榜的现有快照保留（年度榜只做同月去重），周榜/月榜按补档结果重建。
-- 可重复执行，但每次都会用 data_record_sources 的近似结果覆盖周/月榜归档，
-- 部署后无需再次执行；不要在本脚本之后重新执行 14 的历史回填（旧键会重新插入旧格式快照）。
-- 建议在后端新代码部署前执行；执行后当天的周/月榜快照会由每日导入任务按新键覆盖或替换。

-- ── 1. 清空周榜 / 月榜旧快照 ─────────────────────────────
DELETE FROM jav_ranking_entries
 WHERE snapshot_key IN (
   SELECT snapshot_key FROM jav_ranking_snapshots
    WHERE list_type IN ('weekly', 'monthly')
 );

DELETE FROM jav_ranking_snapshots
 WHERE list_type IN ('weekly', 'monthly');

-- ── 2. 按通道起止日期逐日重建快照 ────────────────────────
-- 快照键与导入服务保持一致：source + ISO 周/自然月 + 东八区日期
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
counts AS (
  SELECT d.source_name, d.list_type, d.section, d.day, COUNT(*) AS item_count
  FROM days d
  JOIN sources s
    ON s.source_name = d.source_name
   AND s.list_type = d.list_type
   AND s.section = d.section
   AND date(s.first_at / 1000, 'unixepoch', '+8 hours') <= d.day
   AND date(s.last_at / 1000, 'unixepoch', '+8 hours') >= d.day
  GROUP BY d.source_name, d.list_type, d.section, d.day
)
SELECT
  c.source_name || ':' ||
  CASE c.list_type
    WHEN 'weekly' THEN
      'week:' ||
      strftime('%Y', date(c.day, '-3 days', 'weekday 4')) || '-W' ||
      printf('%02d', (CAST(strftime('%j', date(c.day, '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7 + 1) ||
      ':' || c.day
    ELSE
      'month:' || strftime('%Y-%m', c.day) || ':' || c.day
  END,
  c.source_name,
  c.list_type,
  c.section,
  NULL,
  CAST(strftime('%s', c.day, '-8 hours') AS INTEGER) * 1000 + 7200000,
  c.item_count,
  CAST(strftime('%s', c.day, '-8 hours') AS INTEGER) * 1000 + 7200000
FROM counts c;

-- ── 3. 按重建后的快照写入名次明细 ────────────────────────
INSERT OR REPLACE INTO jav_ranking_entries
    (id, snapshot_key, record_id, code, title, cover, rank, score, url,
     list_type, section, year, source_name, snapshot_at, created_at)
SELECT
  s.snapshot_key || ':' || d.code,
  s.snapshot_key,
  rs.record_id,
  d.code,
  d.title,
  d.cover,
  CAST(json_extract(rs.source_data, '$.rank') AS INTEGER),
  CAST(json_extract(rs.source_data, '$.score') AS TEXT),
  json_extract(rs.source_data, '$.url'),
  s.list_type,
  s.section,
  NULL,
  s.source_name,
  s.snapshot_at,
  s.snapshot_at
FROM jav_ranking_snapshots s
JOIN data_record_sources rs
  ON rs.source_name = s.source_name
 AND rs.source_type = 'ranking'
 AND json_valid(rs.source_data)
 AND json_extract(rs.source_data, '$.period') = s.list_type
 AND COALESCE(json_extract(rs.source_data, '$.section'), 'censored') = s.section
 AND date(rs.created_at / 1000, 'unixepoch', '+8 hours')
     <= date(s.snapshot_at / 1000, 'unixepoch', '+8 hours')
 AND date(CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER) / 1000, 'unixepoch', '+8 hours')
     >= date(s.snapshot_at / 1000, 'unixepoch', '+8 hours')
JOIN data_records d ON d.id = rs.record_id
WHERE s.list_type IN ('weekly', 'monthly')
  AND d.record_type = 'jav'
  AND d.code IS NOT NULL
  AND CAST(json_extract(rs.source_data, '$.rank') AS INTEGER) > 0;

-- ── 4. 年度榜去重：同一通道、同一目标年份、同一自然月只保留最新一份 ──
-- 2021 年度榜曾重复跑过两次；新规则每月一期，因此按「年月」去重，跨月快照全部保留。
-- 如果确认跨月的旧快照也不要，可在本脚本执行后额外按 source_name + year 只留最新一份。
WITH yearly_dups AS (
  SELECT
    snapshot_key,
    ROW_NUMBER() OVER (
      PARTITION BY source_name, year,
                   strftime('%Y-%m', snapshot_at / 1000, 'unixepoch', '+8 hours')
      ORDER BY snapshot_at DESC, created_at DESC
    ) AS rn
  FROM jav_ranking_snapshots
  WHERE list_type = 'yearly'
)
DELETE FROM jav_ranking_entries
 WHERE snapshot_key IN (SELECT snapshot_key FROM yearly_dups WHERE rn > 1);

WITH yearly_dups AS (
  SELECT
    snapshot_key,
    ROW_NUMBER() OVER (
      PARTITION BY source_name, year,
                   strftime('%Y-%m', snapshot_at / 1000, 'unixepoch', '+8 hours')
      ORDER BY snapshot_at DESC, created_at DESC
    ) AS rn
  FROM jav_ranking_snapshots
  WHERE list_type = 'yearly'
)
DELETE FROM jav_ranking_snapshots
 WHERE snapshot_key IN (SELECT snapshot_key FROM yearly_dups WHERE rn > 1);
