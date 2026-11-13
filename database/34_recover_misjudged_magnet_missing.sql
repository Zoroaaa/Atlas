-- 34_recover_misjudged_magnet_missing.sql
--
-- 背景：
--   旧磁力抓取把「响应非空」当成抓取成功。JavBus 在限流/访问校验或返回
--   未解压响应体时同样返回 200 + 非空内容，解析不出磁力后会被写成
--   missing_mask 第 8 位（缺磁力），但这些记录实际上可能有磁力。
--
-- 处理：
--   把带缺磁力标记的记录重置为「可重新补全」：清空源站缺失次数、暂时失败
--   次数、重试耗尽标记与下次重试时间，让它们立即重新进入自动补全与手动批次。
--   保留 missing_mask，管理页仍可用「缺磁力」筛选找到它们；下一次抓取会
--   重新判定。确实没有磁力的记录会在重试 3 次后再次进入耗尽状态。
--
-- 可重复执行：第二次执行时各计数均为 0，WHERE 条件不再命中。

UPDATE jav_detail_meta
SET attempts = 0,
    transient_failures = 0,
    next_retry_at = 0,
    retry_exhausted = 0,
    last_error = NULL,
    status = CASE WHEN status = 'complete' THEN 'complete' ELSE 'pending' END,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE (missing_mask & 8) <> 0
  AND status <> 'complete'
  AND (attempts > 0 OR transient_failures > 0 OR next_retry_at > 0 OR retry_exhausted <> 0);
