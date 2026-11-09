-- ============================================================================
-- 21_schema_jav_genres.sql
--
-- 推荐标签（JavBus 类别词典）与类别作品分页状态。
--
-- 幂等：全部使用 CREATE ... IF NOT EXISTS，可在全新库与已升级库重复执行。
-- 回滚：DROP TABLE jav_genre_pages; DROP TABLE jav_genres;
--       两张表不被任何既有功能读取，删除不影响既有数据。
-- ============================================================================

-- 类别词典（同步自 https://www.javbus.com/genre 与 /uncensored/genre）
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

CREATE INDEX IF NOT EXISTS idx_jav_genres_usable
  ON jav_genres(section, is_technical, sort_order);

CREATE INDEX IF NOT EXISTS idx_jav_genres_key
  ON jav_genres(name_key);

-- 类别作品分页状态（页码学习 + 扩张探测）
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
