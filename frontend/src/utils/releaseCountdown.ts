/**
 * 计算发售日距今天的天数（按东八区自然日）。
 * 返回 null 表示日期缺失/格式无效；0 表示今天，负数表示已发售。
 */
export function releaseCountdownDays(releaseDate?: string | null): number | null {
  if (!releaseDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releaseDate);
  if (!match) return null;

  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((target - today) / 86_400_000);
  return Number.isFinite(days) ? days : null;
}
