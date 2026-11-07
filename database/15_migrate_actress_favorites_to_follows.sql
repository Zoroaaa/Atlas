-- ===============================================
-- 把"收藏的女优"迁移为"关注的女优"
--
-- 背景：女优收藏（user_favorites.code = 'actress:<JavBus star key>'）已下线，
--       改为只保留"关注女优"（user_follows）。
--
-- 使用：
--   1. 先执行 14_schema_notifications_follows.sql（建表），并部署新版前后端
--   2. 可选：先执行本文件末尾的【迁移前检查】查询，看有多少条要迁移
--   3. 执行本文件（可重复执行：迁移过的收藏已被删除，再次执行不会有任何变化）
--   4. 执行末尾的【迁移后检查】查询确认结果
--
-- 迁移规则：
--   - 每位用户最多保留 100 个关注（和关注上限一致），按收藏时间从新到旧取；
--     超出上限的女优收藏不会被删除，留在收藏里，请按末尾"遗留检查"处理
--   - 迁移来的关注：站内提醒默认开启；last_viewed_at = 当前时间，所以不会出现一堆"未读"
--   - actress_watch 新建时 baseline_done = 0：定时任务首次检查只建立基线，不发通知
--   - 只迁移 key 合法（字母/数字/下划线/连字符，1~40 位）的记录；其余保留原样
--   - 已经关注过的不会重复，也不会改动其关注设置
-- ===============================================

-- 【迁移前检查】（只读，可先单独执行）
-- SELECT COUNT(*) AS actress_favorites, COUNT(DISTINCT user_id) AS users
-- FROM user_favorites WHERE code LIKE 'actress:%';

-- 1. 先建 actress_watch（全局一份；已存在则只在名字/头像为空时补齐）
INSERT INTO actress_watch (key, name, avatar, created_at, last_checked_at, last_ok_at, fail_count, baseline_done)
SELECT key, MAX(name), MAX(avatar), CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 0, 0, 0
FROM (
    SELECT substr(code, 9) AS key,
           COALESCE(NULLIF(title, ''), substr(code, 9)) AS name,
           cover AS avatar
    FROM user_favorites
    WHERE code LIKE 'actress:%'
      AND length(code) BETWEEN 9 AND 48
      AND substr(code, 9) NOT GLOB '*[^A-Za-z0-9_-]*'
)
GROUP BY key
ON CONFLICT(key) DO UPDATE SET
    avatar = COALESCE(actress_watch.avatar, excluded.avatar);

-- 2. 再建 user_follows（每用户按收藏时间从新到旧，扣除已有关注后最多补到 100 个）
INSERT OR IGNORE INTO user_follows (user_id, watch_key, created_at, last_viewed_at, notify_in_app, notify_email)
SELECT user_id, key, created_at, CAST(strftime('%s','now') AS INTEGER) * 1000, 1, 0
FROM (
    SELECT fav.user_id,
           substr(fav.code, 9) AS key,
           fav.created_at,
           ROW_NUMBER() OVER (PARTITION BY fav.user_id ORDER BY fav.created_at DESC) AS rn
    FROM user_favorites fav
    WHERE fav.code LIKE 'actress:%'
      AND length(fav.code) BETWEEN 9 AND 48
      AND substr(fav.code, 9) NOT GLOB '*[^A-Za-z0-9_-]*'
      AND NOT EXISTS (
          SELECT 1 FROM user_follows f
          WHERE f.user_id = fav.user_id AND f.watch_key = substr(fav.code, 9)
      )
) picked
WHERE rn <= MAX(0, 100 - (SELECT COUNT(*) FROM user_follows f WHERE f.user_id = picked.user_id));

-- 3. 删除已经成功变成关注的女优收藏（只删"该用户确实已关注这位女优"的那些）
DELETE FROM user_favorites
WHERE code LIKE 'actress:%'
  AND length(code) BETWEEN 9 AND 48
  AND substr(code, 9) NOT GLOB '*[^A-Za-z0-9_-]*'
  AND EXISTS (
      SELECT 1 FROM user_follows f
      WHERE f.user_id = user_favorites.user_id AND f.watch_key = substr(user_favorites.code, 9)
  );

-- 【迁移后检查】（只读）
-- 迁移得到的关注数 / 用户数：
-- SELECT COUNT(*) AS follows, COUNT(DISTINCT user_id) AS users FROM user_follows;
-- 遗留检查：仍留在收藏里的女优收藏（超出 100 个上限，或 key 不合法）。应为 0 行，不为 0 请人工处理：
-- SELECT user_id, code, title FROM user_favorites WHERE code LIKE 'actress:%';
