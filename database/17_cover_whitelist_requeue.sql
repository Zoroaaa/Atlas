-- Atlas 数据库 · 新白名单封面源的历史失败清理
-- 依赖：16_cover_assets.sql
-- 本文件可重复执行：清理后再次执行不会命中任何行。
--
-- 背景：pics.dmm.co.jp / image.mgstage.com / www.qishuxia.com 加入白名单之前，
-- 回填会把它们记为 INVALID_URL（retry_exhausted=1），同时 data_record_covers
-- 已写入映射，记录不会重新进入待回填。host 放行后必须删掉这两类行才会重新排队。

DELETE FROM data_record_covers
 WHERE url_hash IN (
   SELECT url_hash FROM cover_assets
    WHERE last_error = 'INVALID_URL'
      AND (
        source_host IN ('pics.dmm.co.jp', 'image.mgstage.com', 'www.qishuxia.com')
        OR url LIKE '%pics.dmm.co.jp/%'
        OR url LIKE '%image.mgstage.com/%'
        OR url LIKE '%www.qishuxia.com/%'
      )
 );

DELETE FROM cover_assets
 WHERE last_error = 'INVALID_URL'
   AND (
     source_host IN ('pics.dmm.co.jp', 'image.mgstage.com', 'www.qishuxia.com')
     OR url LIKE '%pics.dmm.co.jp/%'
     OR url LIKE '%image.mgstage.com/%'
     OR url LIKE '%www.qishuxia.com/%'
   );
