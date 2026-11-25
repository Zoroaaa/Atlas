-- JAV 自动补全候选集专用索引。
--
-- 0008 建立的 (retry_exhausted, next_retry_at) 会把 complete 行一起纳入范围：
-- complete 记录的 next_retry_at 也是 0，单次候选查询会先扫过 1 万多条 complete 行，
-- 实测读取量从预期的 160 行放大到 1.5 万行。
-- 这里改成 partial 索引，只收录真正会进入自动补全的记录：
--   - 排除 complete（已补全）
--   - 排除只缺导演/制作商/发行商的 partial（只能手动补）
CREATE INDEX IF NOT EXISTS idx_jav_meta_auto_due
  ON jav_detail_meta (next_retry_at)
  WHERE retry_exhausted = 0
    AND status <> 'complete'
    AND (status <> 'partial' OR (missing_mask & 8) <> 0);

-- 0008 的宽索引已被上面的 partial 索引取代，保留只会让优化器选错。
DROP INDEX IF EXISTS idx_jav_meta_due;
