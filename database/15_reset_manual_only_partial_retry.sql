-- Atlas 数据库 · 清理「只能手动补」记录的 30 天重试时间
-- 依赖：08_jav_library.sql
-- 可重复执行：只把磁力齐全的 partial 记录 next_retry_at 清零，不改动其它字段。
--
-- 背景：只有缺磁力的 partial 记录会进入每小时自动补全；仅缺导演 / 制作商 / 发行商
-- 的记录只能由管理端手动批次补。旧逻辑对所有 partial 都写了 30 天重试时间，
-- 管理页因此把它们显示成「等待重试」，但自动任务永远不会选中。
-- missing_mask 的 magnets 位为 8。

UPDATE jav_detail_meta
SET next_retry_at = 0
WHERE status = 'partial'
  AND (missing_mask & 8) = 0;
