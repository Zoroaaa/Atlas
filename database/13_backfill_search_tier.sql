-- 搜索限流档位存量回填
-- 前置：先执行 12_schema_search_tier.sql（users 表新增 search_tier / tier_updated_at）
-- 特性：可重复执行，档位只升不降，不会把已升档的账号降回去
-- 规则与 backend/src/services/search-tier.ts 保持一致：
--   L2 注册≥7天 + 近30天活跃≥5天
--   L3 注册≥30天 + 近30天活跃≥5天
--   L4 注册≥90天 + 近30天活跃≥5天 + 累计搜索≥500次
WITH now_ts AS (
  SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms
),
stats AS (
  SELECT
    u.id AS user_id,
    CAST((n.now_ms - u.created_at) / 86400000 AS INTEGER) AS account_age_days,
    (SELECT COUNT(*) FROM user_search_history h WHERE h.user_id = u.id) AS total_searches,
    (SELECT COUNT(DISTINCT CAST(h.created_at / 86400000 AS INTEGER))
       FROM user_search_history h
      WHERE h.user_id = u.id
        AND h.created_at >= n.now_ms - 2592000000) AS active_days
  FROM users u, now_ts n
)
UPDATE users
SET search_tier = MAX(
      COALESCE(users.search_tier, 1),
      CASE
        WHEN s.account_age_days >= 90 AND s.active_days >= 5 AND s.total_searches >= 500 THEN 4
        WHEN s.account_age_days >= 30 AND s.active_days >= 5 THEN 3
        WHEN s.account_age_days >= 7  AND s.active_days >= 5 THEN 2
        ELSE 1
      END
    ),
    tier_updated_at = (SELECT now_ms FROM now_ts)
FROM stats s
WHERE users.id = s.user_id;

-- 执行结果校验：各档位人数
SELECT search_tier, COUNT(*) AS user_count FROM users GROUP BY search_tier ORDER BY search_tier;
