/**
 * R2 管理看板的统计聚合。
 *
 * 关键约束：全表聚合只在扫描轮次结束（或回收后）执行一次，结果落到
 * r2_stats_snapshot；看板请求只读一行快照，不重跑聚合。
 * 原因：单次聚合约 137 万行读，5 分钟缓存下每天近 4 亿行，是 D1 付费额度的一半。
 *
 * 代价是数字以最近一轮扫描为准（最多滞后一天），这与看板本身的语义一致 ——
 * 它本来就不是实时监控，而是对账快照。
 */
import type { Env } from '@/types';
import {
  countBusinessCovers,
  countLedgerReady,
  countR2Objects,
  getScanState,
  getStatsSnapshot,
  groupAgeBuckets,
  groupLedgerLies,
  groupObjectsByNamespace,
  groupUnregisteredObjects,
  saveStatsSnapshot,
  type R2ScanStateRow,
} from '@/repositories/r2-objects-repository';
import { getR2Settings } from './r2-settings';

export interface R2ScanSummary {
  status: R2ScanStateRow['status'];
  scanId: string | null;
  pagesDone: number;
  objectsSeen: number;
  skippedKeys: number;
  startedAt: number | null;
  completedAt: number | null;
  nextScanAt: number;
  trigger: string;
  /** full = 全量校验轮次（会检测对象消失）；incremental = 只登记新对象 */
  mode: 'full' | 'incremental';
  lastError: string | null;
  /** 最近一次完整扫描的开始时间；账本谎报的判定基准，为 null 表示还没有完整轮次 */
  baselineAt: number | null;
}

export interface R2NamespaceStat {
  namespace: string;
  objects: number;
  bytes: number;
  registered: number;
  unregistered: number;
}

export interface R2AgeBucket {
  namespace: string;
  b0_30: number;
  b31_90: number;
  b91_180: number;
  b180p: number;
}

/** 可物化部分：只在扫描/回收后计算，不含扫描状态与配置（这两个每次都实时读） */
export interface R2SnapshotPayload {
  r2: { objects: number; bytes: number; unparsed: number };
  ledger: { ready: number; bytes: number };
  business: { recordsWithCover: number; distinctCoverHashes: number };
  diff: {
    /** 未登记但在保护期内：正常现象，主体是用户浏览带进来的封面 */
    unregistered: { count: number; bytes: number };
    /** key 命名不合规、url_hash 为空：代理永远算不出来，可安全清理 */
    unparsed: { count: number; bytes: number };
    ledgerMissing: { count: number; repairable: number; orphan: number };
    /** 超期未登记：仅统计不自动删，是否还需人判断 */
    reclaimable: { days: number; count: number; bytes: number };
  };
  byNamespace: R2NamespaceStat[];
  ageBuckets: R2AgeBucket[];
}

export interface R2DashboardStats extends R2SnapshotPayload {
  scan: R2ScanSummary | null;
  reclaim: { enabled: boolean; days: number };
  /** 快照生成时间；0 表示还没有任何快照 */
  snapshotAt: number;
  /** true = 还没有快照，看板数字不可用 */
  stale: boolean;
  generatedAt: number;
}

function emptyPayload(days: number): R2SnapshotPayload {
  return {
    r2: { objects: 0, bytes: 0, unparsed: 0 },
    ledger: { ready: 0, bytes: 0 },
    business: { recordsWithCover: 0, distinctCoverHashes: 0 },
    diff: {
      unregistered: { count: 0, bytes: 0 },
      unparsed: { count: 0, bytes: 0 },
      ledgerMissing: { count: 0, repairable: 0, orphan: 0 },
      reclaimable: { days, count: 0, bytes: 0 },
    },
    byNamespace: [],
    ageBuckets: [],
  };
}

function sumCount(rows: Array<{ cnt: number }>): number {
  return rows.reduce((sum, row) => sum + Number(row.cnt || 0), 0);
}

function sumBytes(rows: Array<{ bytes: number }>): number {
  return rows.reduce((sum, row) => sum + Number(row.bytes || 0), 0);
}

/**
 * 跑一次全表聚合。只应由 refreshStatsSnapshot 调用 ——
 * 直接调就等于把全表扫描留在请求路径上。
 *
 * baselineAt 用最近一轮完整扫描的 started_at 而不是 completed_at：
 * R2 list 按 key 字典序推进，扫描开始后才写入的对象可能落在已扫过的位置，
 * 拿结束时间当基准会把它们误判成「账本谎报」。
 */
export async function computeStatsPayload(env: Env): Promise<R2SnapshotPayload> {
  const now = Date.now();
  const settings = await getR2Settings(env.DB);
  const state = await getScanState(env.DB);
  const baselineAt =
    state?.status === 'completed' && state.started_at ? state.started_at : null;
  const cutoff = now - settings.reclaimDays * 24 * 60 * 60 * 1000;

  const [r2Count, ledgerReady, business, byNamespace] = await Promise.all([
    countR2Objects(env.DB),
    countLedgerReady(env.DB),
    countBusinessCovers(env.DB),
    groupObjectsByNamespace(env.DB),
  ]);

  // 扫描进行中不查「账本谎报」：本轮还没扫完，缺失只是「还没走到」。
  // 直接把已完成的上一轮结果当空处理，避免看板闪出一堆假故障。
  const [unregistered, ledgerLies, ageBuckets] = await Promise.all([
    groupUnregisteredObjects(env.DB, { cutoff }),
    baselineAt ? groupLedgerLies(env.DB, { before: baselineAt }) : Promise.resolve([]),
    groupAgeBuckets(env.DB, { now }),
  ]);

  return {
    r2: r2Count,
    ledger: { ready: ledgerReady.ready, bytes: ledgerReady.bytes },
    business,
    diff: {
      unregistered: {
        count: sumCount(unregistered.protected),
        bytes: sumBytes(unregistered.protected),
      },
      unparsed: {
        count: sumCount(unregistered.unparsed),
        bytes: sumBytes(unregistered.unparsed),
      },
      ledgerMissing: {
        count: sumCount(ledgerLies),
        repairable: ledgerLies.reduce((sum, row) => sum + Number(row.repairable || 0), 0),
        orphan: ledgerLies.reduce((sum, row) => sum + Number(row.orphan || 0), 0),
      },
      reclaimable: {
        days: settings.reclaimDays,
        count: sumCount(unregistered.reclaimable),
        bytes: sumBytes(unregistered.reclaimable),
      },
    },
    byNamespace: byNamespace.map((row) => {
      const objects = Number(row.objects);
      const registered = Number(row.registered);
      return {
        namespace: row.namespace,
        objects,
        bytes: Number(row.bytes),
        registered,
        unregistered: Math.max(0, objects - registered),
      };
    }),
    ageBuckets: ageBuckets.map((row) => ({
      namespace: row.namespace,
      b0_30: Number(row.b0_30 ?? 0),
      b31_90: Number(row.b31_90 ?? 0),
      b91_180: Number(row.b91_180 ?? 0),
      b180p: Number(row.b180p ?? 0),
    })),
  };
}

/**
 * 重算并落库统计快照。扫描轮次结束、回收执行后各调一次。
 *
 * lastFullAt 只在「全量校验轮次」完成时传：日常增量轮次没有做消失检测，
 * 不能把时间戳往前推，否则下次全量校验会被无限延后。
 */
export async function refreshStatsSnapshot(
  env: Env,
  params: { lastFullAt?: number } = {},
): Promise<R2SnapshotPayload> {
  const payload = await computeStatsPayload(env);
  await saveStatsSnapshot(env.DB, {
    payload: JSON.stringify(payload),
    totalObjects: payload.r2.objects,
    totalBytes: payload.r2.bytes,
    generatedAt: Date.now(),
    lastFullAt: params.lastFullAt,
  });
  return payload;
}

/**
 * 把快照 JSON 归一化成完整结构。
 *
 * 为什么必须逐字段补：payload 是历史代码写进数据库的，升级后新字段一定缺失。
 * 直接透传会让前端在 `diff.unparsed.count` 上抛 TypeError —— 线上已发生一次。
 * 缺字段补 0 而不是整份作废，是因为其余字段仍然准确，且下一轮扫描会自动补齐。
 */
export function normalizePayload(raw: unknown): R2SnapshotPayload | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  // 没有 byNamespace 说明不是本模块写入的格式，按未初始化处理
  if (!Array.isArray(obj.byNamespace)) return null;

  const num = (value: unknown): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  /** 统一的 { count, bytes } 二元组；旧快照缺整段时给 0 */
  const pair = (value: unknown): { count: number; bytes: number } => {
    const row = record(value);
    return { count: num(row.count), bytes: num(row.bytes) };
  };
  const list = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.map(record) : [];

  const r2 = record(obj.r2);
  const ledger = record(obj.ledger);
  const business = record(obj.business);
  const diff = record(obj.diff);
  const ledgerMissing = record(diff.ledgerMissing);
  const reclaimable = record(diff.reclaimable);

  return {
    r2: { objects: num(r2.objects), bytes: num(r2.bytes), unparsed: num(r2.unparsed) },
    ledger: { ready: num(ledger.ready), bytes: num(ledger.bytes) },
    business: {
      recordsWithCover: num(business.recordsWithCover),
      distinctCoverHashes: num(business.distinctCoverHashes),
    },
    diff: {
      unregistered: pair(diff.unregistered),
      unparsed: pair(diff.unparsed),
      ledgerMissing: {
        count: num(ledgerMissing.count),
        repairable: num(ledgerMissing.repairable),
        orphan: num(ledgerMissing.orphan),
      },
      reclaimable: { days: num(reclaimable.days), ...pair(reclaimable) },
    },
    byNamespace: list(obj.byNamespace).map((row) => {
      const objects = num(row.objects);
      const registered = num(row.registered);
      return {
        namespace: String(row.namespace ?? ''),
        objects,
        bytes: num(row.bytes),
        registered,
        unregistered: Math.max(0, objects - registered),
      };
    }),
    ageBuckets: list(obj.ageBuckets).map((row) => ({
      namespace: String(row.namespace ?? ''),
      b0_30: num(row.b0_30),
      b31_90: num(row.b31_90),
      b91_180: num(row.b91_180),
      b180p: num(row.b180p),
    })),
  };
}

/**
 * 读快照并按当前扫描状态组装看板响应。
 * 解析失败或格式不认时按无快照处理，让前端提示重扫，而不是抛 500。
 */
export async function getR2DashboardStats(env: Env): Promise<R2DashboardStats> {
  const now = Date.now();
  const [snapshot, state, settings] = await Promise.all([
    getStatsSnapshot(env.DB),
    getScanState(env.DB),
    getR2Settings(env.DB),
  ]);

  let payload: R2SnapshotPayload | null = null;
  if (snapshot?.payload) {
    try {
      payload = normalizePayload(JSON.parse(snapshot.payload));
    } catch {
      payload = null;
    }
  }

  const snapshotAt = Number(snapshot?.generated_at ?? 0);
  const baselineAt =
    state?.status === 'completed' && state.started_at ? state.started_at : null;

  return {
    ...(payload ?? emptyPayload(settings.reclaimDays)),
    scan: state
      ? {
          status: state.status,
          scanId: state.scan_id,
          pagesDone: Number(state.pages_done),
          objectsSeen: Number(state.objects_seen),
          skippedKeys: Number(state.skipped_keys),
          startedAt: state.started_at,
          completedAt: state.completed_at,
          nextScanAt: Number(state.next_scan_at),
          trigger: state.trigger,
          mode: state.scan_mode === 'full' ? 'full' : 'incremental',
          lastError: state.last_error,
          baselineAt,
        }
      : null,
    reclaim: { enabled: settings.reclaimEnabled, days: settings.reclaimDays },
    snapshotAt,
    stale: payload === null || snapshotAt === 0,
    generatedAt: now,
  };
}
