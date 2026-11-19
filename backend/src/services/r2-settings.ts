/**
 * R2 扫描与回收的配置读取（DB system_config）。
 *
 * 单独成文件是为了打断循环依赖：扫描器要用配置，统计快照又要由扫描器触发，
 * 统计服务再读配置就会成环。这里只读配置，不含任何业务逻辑。
 */
import { DB_CONFIG_KEYS } from '@/constants';

export interface R2ScanSettings {
  enabled: boolean;
  pagesPerTick: number;
  reclaimEnabled: boolean;
  reclaimDays: number;
}

/** 缺配置时的兜底值：扫描与回收都开，与 24_r2_objects.sql 的种子值一致 */
const DEFAULT_SETTINGS: R2ScanSettings = {
  enabled: true,
  pagesPerTick: 2,
  reclaimEnabled: true,
  reclaimDays: 90,
};

function readBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/** 读取扫描与回收配置；读取失败时按「关闭扫描」处理，不让配置问题拖慢每分钟 cron */
export async function getR2Settings(db: D1Database): Promise<R2ScanSettings> {
  try {
    const { results } = await db
      .prepare('SELECT key, value FROM system_config WHERE key IN (?, ?, ?, ?)')
      .bind(
        DB_CONFIG_KEYS.R2_SCAN_ENABLED,
        DB_CONFIG_KEYS.R2_SCAN_PAGES_PER_TICK,
        DB_CONFIG_KEYS.R2_RECLAIM_ENABLED,
        DB_CONFIG_KEYS.R2_RECLAIM_DAYS,
      )
      .all<{ key: string; value: string | null }>();
    const map = new Map((results || []).map((row) => [row.key, row.value]));

    const rawPages = Number(map.get(DB_CONFIG_KEYS.R2_SCAN_PAGES_PER_TICK) ?? DEFAULT_SETTINGS.pagesPerTick);
    const rawDays = Number(map.get(DB_CONFIG_KEYS.R2_RECLAIM_DAYS) ?? DEFAULT_SETTINGS.reclaimDays);
    return {
      enabled: readBoolean(map.get(DB_CONFIG_KEYS.R2_SCAN_ENABLED), DEFAULT_SETTINGS.enabled),
      pagesPerTick: Number.isFinite(rawPages)
        ? Math.min(5, Math.max(1, Math.round(rawPages)))
        : DEFAULT_SETTINGS.pagesPerTick,
      reclaimEnabled: readBoolean(
        map.get(DB_CONFIG_KEYS.R2_RECLAIM_ENABLED),
        DEFAULT_SETTINGS.reclaimEnabled,
      ),
      reclaimDays: Number.isFinite(rawDays)
        ? Math.min(3650, Math.max(30, Math.round(rawDays)))
        : DEFAULT_SETTINGS.reclaimDays,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, enabled: false, reclaimEnabled: false };
  }
}
