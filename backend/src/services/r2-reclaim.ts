/**
 * 懒加载封面的回收：删除「无账本、无记录引用、超期」的 R2 对象。
 *
 * 这些对象是用户浏览代理接口时写进 R2 的，账本里没有记录，现有 GC
 * （gcOrphanCoverAssets）只处理有账本行的对象，它们永远不会被回收。
 *
 * 约束：只删对象、不写墓碑 —— 墓碑是上游抓取失败的负缓存，回收后我们希望
 * 下一次访问立即回源重建，写墓碑反而会抑制重建，还会污染对象计数。
 */
import type { Env } from '@/types';
import {
  R2_RECHECK_CHUNK_KEYS,
  bumpStatsVersion,
  markObjectsReclaimed,
  purgeDeletedObjects,
  recheckReclaimCandidates,
  selectReclaimCandidates,
  summarizeReclaimCandidates,
} from '@/repositories/r2-objects-repository';
import { getR2Settings } from './r2-settings';
import { refreshStatsSnapshot } from './r2-dashboard';

/** R2 批量删除单次上限（官方 1000）；取 500 留余量，失败时损失面更小 */
const DELETE_CHUNK_KEYS = 500;
/** 自动回收单次上限：每天 500 个，删错了也不会一次抹掉大片 */
const AUTO_RECLAIM_LIMIT = 500;
/** 回收记录保留 30 天供排障，之后物理删除，避免表只增不减 */
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface ReclaimPreview {
  days: number;
  namespace: string | null;
  candidates: number;
  bytes: number;
  oldestUploadedAt: number | null;
  hasMore: boolean;
}

export interface ReclaimResult {
  deleted: number;
  failed: number;
  bytesFreed: number;
  hasMore: boolean;
}

/** 按 key 分块调用 R2 删除；任一块失败即整体中断，交给下一轮重试 */
async function deleteObjectKeys(env: Env, keys: string[]): Promise<void> {
  const bucket = env.MEDIA;
  if (!bucket) throw new Error('MEDIA 未绑定');

  for (let start = 0; start < keys.length; start += DELETE_CHUNK_KEYS) {
    await bucket.delete(keys.slice(start, start + DELETE_CHUNK_KEYS));
  }
}

/**
 * 预览：只统计，不删。前端必须先把这三个数字展示给管理员再确认。
 * limit 用 summarize 内部不带 LIMIT 的聚合，准确反映总量。
 */
export async function previewReclaim(
  env: Env,
  params: { days: number; namespace?: string; limit: number },
): Promise<ReclaimPreview> {
  const uploadedBefore = Date.now() - params.days * 24 * 60 * 60 * 1000;
  const summary = await summarizeReclaimCandidates(env.DB, {
    uploadedBefore,
    namespace: params.namespace,
  });

  return {
    days: params.days,
    namespace: params.namespace ?? null,
    candidates: summary.count,
    bytes: summary.bytes,
    oldestUploadedAt: summary.oldest,
    hasMore: summary.count > params.limit,
  };
}

/**
 * 执行回收。
 *
 * 三步闸门，任何一步不过都不删：
 *   1. SQL 侧：无账本行 + 无记录引用 + 保护期已过 + 超过天数
 *   2. 删之前按 key 再复核一遍（预览到执行之间回填器可能刚写入账本）
 *   3. R2 删除失败则整批不标记账，对象与快照保持一致
 */
export async function reclaimLazyCovers(
  env: Env,
  params: { days: number; namespace?: string; limit: number },
): Promise<ReclaimResult> {
  const empty: ReclaimResult = { deleted: 0, failed: 0, bytesFreed: 0, hasMore: false };
  if (!env.MEDIA) return empty;

  const now = Date.now();
  const uploadedBefore = now - params.days * 24 * 60 * 60 * 1000;

  const candidates = await selectReclaimCandidates(env.DB, {
    uploadedBefore,
    namespace: params.namespace,
    limit: params.limit,
  });
  if (candidates.length === 0) return empty;

  // 分段复核：IN 列表过长会顶到单语句绑定参数上限
  const safeKeys: string[] = [];
  for (let start = 0; start < candidates.length; start += R2_RECHECK_CHUNK_KEYS) {
    const chunk = candidates.slice(start, start + R2_RECHECK_CHUNK_KEYS);
    const safe = await recheckReclaimCandidates(
      env.DB,
      chunk.map((row) => row.object_key),
    );
    safeKeys.push(...safe);
  }
  if (safeKeys.length === 0) {
    return { ...empty, hasMore: candidates.length === params.limit };
  }

  const safeSet = new Set(safeKeys);
  const bytesFreed = candidates
    .filter((row) => safeSet.has(row.object_key))
    .reduce((sum, row) => sum + Number(row.byte_size || 0), 0);

  try {
    await deleteObjectKeys(env, safeKeys);
  } catch (err) {
    // 删除失败不标记：下一轮扫描仍能看到对象，重试是安全的
    console.error('[r2-reclaim] 删除 R2 对象失败:', err);
    return {
      deleted: 0,
      failed: safeKeys.length,
      bytesFreed: 0,
      hasMore: candidates.length === params.limit,
    };
  }

  await markObjectsReclaimed(env.DB, safeKeys, now);
  await bumpStatsVersion(env.DB, now);

  // 回收改了对象数，快照必须跟着重算，否则看板会继续显示删除前的数字。
  // 失败不回滚已删对象：下一轮扫描结束会再算一次，最多旧一天。
  try {
    await refreshStatsSnapshot(env);
  } catch (err) {
    console.error('[r2-reclaim] 刷新统计快照失败:', err);
  }

  return {
    deleted: safeKeys.length,
    failed: candidates.length - safeKeys.length,
    bytesFreed,
    hasMore: candidates.length === params.limit,
  };
}

/**
 * 每日自动回收：受 r2_reclaim_enabled / r2_reclaim_days 控制。
 * 顺带清理 30 天前已标记删除的快照行。
 */
export async function runR2AutoReclaim(
  env: Env,
  limit = AUTO_RECLAIM_LIMIT,
): Promise<ReclaimResult & { purged: number }> {
  const empty = { deleted: 0, failed: 0, bytesFreed: 0, hasMore: false, purged: 0 };
  if (!env.MEDIA) return empty;

  const settings = await getR2Settings(env.DB);

  let purged = 0;
  try {
    purged = await purgeDeletedObjects(env.DB, Date.now() - PURGE_AFTER_MS);
  } catch (err) {
    console.error('[r2-reclaim] 清理历史快照行失败:', err);
  }

  if (!settings.reclaimEnabled) return { ...empty, purged };

  const result = await reclaimLazyCovers(env, {
    days: settings.reclaimDays,
    limit,
  });
  return { ...result, purged };
}
