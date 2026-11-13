-- 33_follow_entity_targets.sql
--
-- 关注对象从「只有女优」扩展到「女优 / 导演 / 制作商 / 发行商 / 系列 / 标签」。
--
-- 设计：不新建并行的关注表，继续使用 actress_watch / actress_works / user_follows，
-- 用 watch_key 承载类型：
--   女优：JavBus star slug（不含冒号），保持历史数据原样
--   实体：<entityType>:<JavBus 列表页路径去掉开头斜杠>
--         例：director:o7、studio:abc、label:xyz、series:s1、tag:genre/2a
-- 路径可能带 /uncensored/ 前缀，因此 key 中允许出现斜杠。
--
-- follow_targets 视图把 watch_key 拆成 entity_type / entity_key，
-- 读路径（关注列表、关注动态、关键词集合搜索、热门女优、热度信号）统一走视图，
-- 写路径仍然直接写 actress_watch / user_follows，避免重建带外键的表。
--
-- 可重复执行：视图先 DROP IF EXISTS 再创建；索引均为 IF NOT EXISTS。
-- 无需回填：历史数据库里的女优关注 key 不含冒号，视图会自动归类为 actress。

DROP VIEW IF EXISTS follow_targets;

CREATE VIEW follow_targets AS
SELECT
  CASE
    WHEN instr(w.key, ':') > 0 THEN substr(w.key, 1, instr(w.key, ':') - 1)
    ELSE 'actress'
  END AS entity_type,
  CASE
    WHEN instr(w.key, ':') > 0 THEN substr(w.key, instr(w.key, ':') + 1)
    ELSE w.key
  END AS entity_key,
  w.key AS watch_key,
  w.name AS name,
  w.avatar AS avatar,
  w.created_at AS created_at,
  w.last_checked_at AS last_checked_at,
  w.last_ok_at AS last_ok_at,
  w.fail_count AS fail_count,
  w.baseline_done AS baseline_done
FROM actress_watch w;

-- 关注动态按单个对象筛选 + 按发售日排序；已有 idx_actress_works_detected(watch_key, first_detected_at) 覆盖「未读」统计
CREATE INDEX IF NOT EXISTS idx_actress_works_watch_release
  ON actress_works (watch_key, release_date);

-- 关键词集合搜索按番号回连本地库取标题/标签（data_records 已有 idx_data_records_code，这里补记录类型+番号组合）
CREATE INDEX IF NOT EXISTS idx_data_records_type_code
  ON data_records (record_type, code);
