-- ============================================================================
-- 32_schema_entity_aliases.sql
--
-- 跨语言实体别名表。
--
-- 背景：各源站的检索索引语言不同（TPB 用英文发布名、JavBus 用日文艺名、
-- MangaDex 用 altTitles），用户输入往往只有一种写法。翻译解决不了专名，
-- 需要把「同一实体的多语言写法」沉淀成可查询的数据。
--
-- 一条记录 = 某个实体在某种语言下的一个别名。
-- alias_key 是查询键：NFKC + 小写 + 去空白/标点，保证「The Shawshank
-- Redemption / the shawshank redemption」命中同一行。
--
-- 幂等：CREATE ... IF NOT EXISTS，可重复执行。
-- 回滚：DROP TABLE IF EXISTS entity_aliases;（不影响既有业务表）
-- ============================================================================

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

-- 主查询：按输入查别名 → 拿到 canonical_id
CREATE INDEX IF NOT EXISTS idx_entity_aliases_lookup
  ON entity_aliases(entity_type, alias_key);

-- 反查：按 canonical_id 取该实体的全部语言变体
CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical
  ON entity_aliases(entity_type, canonical_id);
