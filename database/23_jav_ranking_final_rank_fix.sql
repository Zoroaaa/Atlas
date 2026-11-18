-- Atlas 数据库 · 修正补档后终榜/最新快照的重复名次
-- 依赖：14_jav_ranking_archive.sql
-- 可重复执行：只重排每个通道最新一期快照的名次，历史掉榜快照保持原名次。
--
-- 背景：
--   补档时终榜（周期最后一天）的名次来自 data_record_sources 的最后一次上榜名次。
--   跨周期仍在榜的作品，其名次取自后续日期，与当天掉榜作品的名次会重叠，
--   于是终榜出现多个相同名次。这里按现有名次重新编号为 1..N，保证名次连续唯一。
--   历史掉榜快照本身来自同一天的榜单，名次天然唯一，不做改动。
--
-- 说明：重排只能保证名次唯一连续，不能还原跨天作品在终榜当天的真实名次；
--   后续正常导入的终榜直接使用来源榜单名次，不再需要本脚本。

DROP TABLE IF EXISTS _jav_ranking_rank_fix_23;
CREATE TABLE _jav_ranking_rank_fix_23 AS
WITH latest AS (
  -- 周榜：每个 ISO 周的最新一期
  SELECT snapshot_key FROM (
    SELECT
      s.snapshot_key,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_name, s.section,
          strftime('%Y', date(s.snapshot_at / 1000, 'unixepoch', '+8 hours', '-3 days', 'weekday 4')) || '-W' ||
          printf('%02d', (CAST(strftime('%j', date(s.snapshot_at / 1000, 'unixepoch', '+8 hours', '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7 + 1)
        ORDER BY s.snapshot_at DESC
      ) AS rn
    FROM jav_ranking_snapshots s
    WHERE s.list_type = 'weekly'
  )
  WHERE rn = 1

  UNION ALL

  -- 月榜：每个自然月的最新一期
  SELECT snapshot_key FROM (
    SELECT
      s.snapshot_key,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_name, s.section,
          strftime('%Y-%m', s.snapshot_at / 1000, 'unixepoch', '+8 hours')
        ORDER BY s.snapshot_at DESC
      ) AS rn
    FROM jav_ranking_snapshots s
    WHERE s.list_type = 'monthly'
  )
  WHERE rn = 1

  UNION ALL

  -- 年度榜：同一目标年份在同一刷新年内只保留最新一期
  SELECT snapshot_key FROM (
    SELECT
      s.snapshot_key,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_name, s.section, COALESCE(s.year, 0),
          strftime('%Y', s.snapshot_at / 1000, 'unixepoch', '+8 hours')
        ORDER BY s.snapshot_at DESC
      ) AS rn
    FROM jav_ranking_snapshots s
    WHERE s.list_type = 'yearly'
  )
  WHERE rn = 1

  UNION ALL

  -- TOP250：不分周期，每个通道只保留最新一期
  SELECT snapshot_key FROM (
    SELECT
      s.snapshot_key,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_name, s.section
        ORDER BY s.snapshot_at DESC
      ) AS rn
    FROM jav_ranking_snapshots s
    WHERE s.list_type = 'top250'
  )
  WHERE rn = 1
)
SELECT
  e.id,
  ROW_NUMBER() OVER (
    PARTITION BY e.snapshot_key
    ORDER BY e.rank ASC, e.code ASC
  ) AS new_rank
FROM jav_ranking_entries e
JOIN latest l ON l.snapshot_key = e.snapshot_key;

UPDATE jav_ranking_entries
   SET rank = (
     SELECT r.new_rank FROM _jav_ranking_rank_fix_23 r
      WHERE r.id = jav_ranking_entries.id
   )
 WHERE id IN (SELECT id FROM _jav_ranking_rank_fix_23);

DROP TABLE IF EXISTS _jav_ranking_rank_fix_23;
