/**
 * 榜单周期计算：与导入快照的东八区日期口径保持一致。
 *
 * 约束：周榜按 ISO 周（周一至周日，周日为终榜）、月榜按自然月（月末为终榜）、
 * 年度榜按刷新年（每月一期，12 月为终榜）、TOP250 不分组（最新一期即当前榜）。
 * 周期只在查询时计算，不落库，历史快照与新增快照使用同一套规则。
 */

const CST_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;

export type RankingCycleListType = 'weekly' | 'monthly' | 'top250' | 'yearly';

export interface RankingCycleInfo {
  /** 周期标识；TOP250 不分周期时为 null */
  cycleKey: string | null;
  /** 是否为该周期的终榜快照 */
  isFinal: boolean;
}

export interface RankingCycleRange {
  listType: 'weekly' | 'monthly' | 'yearly';
  /** 周期起点（含，毫秒时间戳） */
  startAt: number;
  /** 周期终点（不含，毫秒时间戳） */
  endAt: number;
}

const WEEK_KEY_PATTERN = /^week:(\d{4})-W(\d{2})$/;
const MONTH_KEY_PATTERN = /^month:(\d{4})-(\d{2})$/;
const YEAR_KEY_PATTERN = /^year:(\d{4})$/;

function cstParts(ts: number) {
  const date = new Date(ts + CST_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    /** 0 = 周日 */
    weekday: date.getUTCDay(),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO 周：周一为一周起点，周日仍属于同一周；跨年时返回 ISO 周年份 */
function isoWeekOf(ts: number): { year: number; week: number } {
  const { year, month, day, weekday } = cstParts(ts);
  const isoDay = weekday || 7;
  // 该周周四所在的年份即 ISO 周年；第 1 周是包含 1 月 4 日的那一周
  const thursday = new Date(Date.UTC(year, month - 1, day + 4 - isoDay));
  const isoYear = thursday.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart) / DAY_MS / 7) + 1;
  return { year: isoYear, week };
}

/** 计算快照所属周期，并标记是否为周期终榜 */
export function rankingCycleOf(
  listType: RankingCycleListType,
  snapshotAt: number
): RankingCycleInfo {
  if (listType === 'top250') return { cycleKey: null, isFinal: false };

  const parts = cstParts(snapshotAt);

  if (listType === 'weekly') {
    const { year, week } = isoWeekOf(snapshotAt);
    return {
      cycleKey: `week:${year}-W${pad2(week)}`,
      isFinal: parts.weekday === 0,
    };
  }

  if (listType === 'monthly') {
    // Date.UTC(year, month, 0) 取上个月最后一天，即当前月月末
    const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
    return {
      cycleKey: `month:${parts.year}-${pad2(parts.month)}`,
      isFinal: parts.day === lastDay,
    };
  }

  // 年度榜：刷新年内每月一期，12 月那期视为完整年度榜
  return {
    cycleKey: `year:${parts.year}`,
    isFinal: parts.month === 12,
  };
}

/**
 * 解析周期标识为筛选时间范围。
 * 年度榜周期按「刷新年」而不是目标年份，目标年份仍走 entries 的 year 字段筛选。
 */
export function parseRankingCycleKey(cycleKey: string): RankingCycleRange | null {
  const value = cycleKey.trim();

  const weekMatch = WEEK_KEY_PATTERN.exec(value);
  if (weekMatch) {
    const isoYear = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    if (!Number.isInteger(isoYear) || week < 1 || week > 53) return null;
    // ISO 第 1 周是包含 1 月 4 日的那一周
    const jan4 = Date.UTC(isoYear, 0, 4);
    const jan4Weekday = new Date(jan4).getUTCDay() || 7;
    const firstMonday = jan4 - (jan4Weekday - 1) * DAY_MS;
    const startAt = firstMonday + (week - 1) * 7 * DAY_MS - CST_OFFSET_MS;
    return { listType: 'weekly', startAt, endAt: startAt + 7 * DAY_MS };
  }

  const monthMatch = MONTH_KEY_PATTERN.exec(value);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (!Number.isInteger(year) || month < 1 || month > 12) return null;
    const startAt = Date.UTC(year, month - 1, 1) - CST_OFFSET_MS;
    const endAt = Date.UTC(year, month, 1) - CST_OFFSET_MS;
    return { listType: 'monthly', startAt, endAt };
  }

  const yearMatch = YEAR_KEY_PATTERN.exec(value);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    if (!Number.isInteger(year)) return null;
    const startAt = Date.UTC(year, 0, 1) - CST_OFFSET_MS;
    const endAt = Date.UTC(year + 1, 0, 1) - CST_OFFSET_MS;
    return { listType: 'yearly', startAt, endAt };
  }

  return null;
}
