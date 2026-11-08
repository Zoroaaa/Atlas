/**
 * 搜索限流档位
 *
 * 分档依据：账号年龄 + 近 30 天活跃天数 + 累计搜索量，只升不降。
 * 计算在认证中间件中惰性执行（每用户最多每 24 小时一次），避免每次搜索都跑聚合。
 * 分钟档仅作为突发防护基线，档位差异体现在小时/天配额。
 */
import type { MultiLevelLimit } from '@/utils/rate-limit';

const DAY_MS = 86_400_000;
/** 档位重算间隔：24 小时 */
const TIER_REFRESH_MS = DAY_MS;
const MAX_TIER = 4;

export interface SearchTierRule {
  tier: number;
  label: string;
  /** 账号注册天数下限 */
  minAccountAgeDays: number;
  /** 近 30 天有搜索记录的天数下限 */
  minActiveDays: number;
  /** 累计搜索次数下限 */
  minTotalSearches: number;
}

/** 按档位升序排列，判定时取满足条件的最高档 */
export const SEARCH_TIER_RULES: SearchTierRule[] = [
  { tier: 1, label: '基础', minAccountAgeDays: 0, minActiveDays: 0, minTotalSearches: 0 },
  { tier: 2, label: '活跃', minAccountAgeDays: 7, minActiveDays: 5, minTotalSearches: 0 },
  { tier: 3, label: '常驻', minAccountAgeDays: 30, minActiveDays: 5, minTotalSearches: 0 },
  { tier: 4, label: '核心', minAccountAgeDays: 90, minActiveDays: 5, minTotalSearches: 500 },
];

export interface SearchTierLimit extends MultiLevelLimit {
  unit: 'minute' | 'hour' | 'day';
}

/** 各档位搜索限流配置 */
export const SEARCH_TIER_LIMITS: Record<number, SearchTierLimit[]> = {
  1: [
    { unit: 'minute', windowMs: 60_000, maxRequests: 5, label: '每分钟' },
    { unit: 'hour', windowMs: 3_600_000, maxRequests: 20, label: '每小时' },
    { unit: 'day', windowMs: 86_400_000, maxRequests: 100, label: '每天' },
  ],
  2: [
    { unit: 'minute', windowMs: 60_000, maxRequests: 6, label: '每分钟' },
    { unit: 'hour', windowMs: 3_600_000, maxRequests: 30, label: '每小时' },
    { unit: 'day', windowMs: 86_400_000, maxRequests: 150, label: '每天' },
  ],
  3: [
    { unit: 'minute', windowMs: 60_000, maxRequests: 7, label: '每分钟' },
    { unit: 'hour', windowMs: 3_600_000, maxRequests: 50, label: '每小时' },
    { unit: 'day', windowMs: 86_400_000, maxRequests: 250, label: '每天' },
  ],
  4: [
    { unit: 'minute', windowMs: 60_000, maxRequests: 8, label: '每分钟' },
    { unit: 'hour', windowMs: 3_600_000, maxRequests: 80, label: '每小时' },
    { unit: 'day', windowMs: 86_400_000, maxRequests: 400, label: '每天' },
  ],
};

export interface SearchTierStats {
  tier: number;
  accountAgeDays: number;
  activeDays: number;
  totalSearches: number;
}

export interface TierRequirement {
  key: 'accountAgeDays' | 'activeDays' | 'totalSearches';
  current: number;
  target: number;
}

/** 将非法/缺失档位归一化到 [1, 4] */
export function normalizeSearchTier(tier: number | null | undefined): number {
  if (!tier || tier < 1) return 1;
  return tier > MAX_TIER ? MAX_TIER : tier;
}

export function getSearchTierRule(tier: number): SearchTierRule {
  return SEARCH_TIER_RULES.find((rule) => rule.tier === normalizeSearchTier(tier)) ?? SEARCH_TIER_RULES[0];
}

/** 按规则判定档位（取满足项中的最高档） */
function resolveTierFromStats(accountAgeDays: number, activeDays: number, totalSearches: number): number {
  let tier = 1;
  for (const rule of SEARCH_TIER_RULES) {
    if (
      accountAgeDays >= rule.minAccountAgeDays &&
      activeDays >= rule.minActiveDays &&
      totalSearches >= rule.minTotalSearches
    ) {
      tier = rule.tier;
    }
  }
  return tier;
}

/**
 * 聚合用户档位所需的实时数据。
 * 一次查询完成：账号年龄来自 users.created_at，搜索量/活跃天数来自 user_search_history。
 */
export async function getSearchTierStats(db: D1Database, userId: string): Promise<SearchTierStats | null> {
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT u.created_at AS created_at,
              (SELECT COUNT(*) FROM user_search_history h WHERE h.user_id = u.id) AS total_searches,
              (SELECT COUNT(DISTINCT date(h.created_at / 1000, 'unixepoch', '+8 hours'))
                 FROM user_search_history h
                WHERE h.user_id = u.id AND h.created_at >= ?) AS active_days
         FROM users u
        WHERE u.id = ?`,
    )
    .bind(now - 30 * DAY_MS, userId)
    .first<{ created_at: number; total_searches: number; active_days: number }>();

  if (!row) return null;

  const accountAgeDays = Math.max(0, Math.floor((now - row.created_at) / DAY_MS));
  const activeDays = row.active_days || 0;
  const totalSearches = row.total_searches || 0;

  return {
    tier: resolveTierFromStats(accountAgeDays, activeDays, totalSearches),
    accountAgeDays,
    activeDays,
    totalSearches,
  };
}

/**
 * 惰性重算档位：仅当超过刷新间隔或从未评估时才查库。
 * 只升不降：写入值取「已存档位」与「实时判定档位」的较大者。
 * 任何异常都返回已存档位，不阻断认证流程。
 */
export async function refreshSearchTierIfStale(
  db: D1Database,
  userId: string,
  currentTier: number | null | undefined,
  tierUpdatedAt: number | null | undefined,
): Promise<number> {
  const tier = normalizeSearchTier(currentTier);
  const now = Date.now();

  // 已满档无需再评估；未到刷新间隔直接复用
  if (tier >= MAX_TIER) return tier;
  if (tierUpdatedAt && now - tierUpdatedAt < TIER_REFRESH_MS) return tier;

  try {
    const stats = await getSearchTierStats(db, userId);
    if (!stats) return tier;

    const nextTier = Math.max(tier, stats.tier);
    await db
      .prepare('UPDATE users SET search_tier = ?, tier_updated_at = ? WHERE id = ?')
      .bind(nextTier, now, userId)
      .run();
    return nextTier;
  } catch (err) {
    console.error('[SearchTier] refresh error:', err);
    return tier;
  }
}

/**
 * 读取用户当前生效档位（必要时惰性刷新）。
 * 仅搜索链路调用：每次搜索多一次轻量 SELECT；迁移未执行时降级为 L1，不阻断搜索。
 */
export async function getEffectiveSearchTier(db: D1Database, userId: string): Promise<number> {
  try {
    const row = await db
      .prepare('SELECT search_tier, tier_updated_at FROM users WHERE id = ?')
      .bind(userId)
      .first<{ search_tier: number | null; tier_updated_at: number | null }>();
    return await refreshSearchTierIfStale(db, userId, row?.search_tier, row?.tier_updated_at);
  } catch (err) {
    console.error('[SearchTier] read error:', err);
    return 1;
  }
}

/**
 * 下一档位及其条件进度；已是最高档返回 null。
 * current 使用实时统计，便于前端展示「已达成、等待生效」。
 */
export function getNextTierProgress(
  stats: SearchTierStats,
  currentTier: number | null | undefined,
): { tier: number; requirements: TierRequirement[] } | null {
  const tier = normalizeSearchTier(currentTier);
  if (tier >= MAX_TIER) return null;

  const next = SEARCH_TIER_RULES.find((rule) => rule.tier === tier + 1);
  if (!next) return null;

  const requirements: TierRequirement[] = [
    { key: 'accountAgeDays', current: stats.accountAgeDays, target: next.minAccountAgeDays },
    { key: 'activeDays', current: stats.activeDays, target: next.minActiveDays },
  ];
  if (next.minTotalSearches > 0) {
    requirements.push({ key: 'totalSearches', current: stats.totalSearches, target: next.minTotalSearches });
  }

  return { tier: next.tier, requirements };
}
