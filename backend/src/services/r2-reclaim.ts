/**
 * R2 对象回收。
 *
 * 两种 scope，风险完全不同：
 *   unparsed  key 命名不合规、url_hash 为空。代理的 key 是 URL 的纯函数，
 *             这类 key 永远算不出来，删掉零误伤 —— 唯一适合无人值守清理的类别。
 *   expired   无账本 + 无记录引用 + 超期。**不代表没人用**：代理命中后是 302 到 CDN，
 *             Worker 看不到访问，uploaded_at 只是「首次缓存时间」。删除会让用户
 *             下次访问回源重建；若上游图已失效，就永久丢失。只能人工确认后执行。
 *
 * 因此每日 cron 只跑 unparsed；expired 只提供手动入口。
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
  type R2ReclaimScope,
} from '@/repositories/r2-objects-repository';
import { getR2Settings } from './r2-settings';
import { refreshStatsSnapshot } from './r2-dashboard';

/** R2 批量删除单次上限（官方 1000）；取 500 留余量，失败时损失面更小 */
const DELETE_CHUNK_KEYS = 500;
/** 无人值守清理的单次上限：只删未解析 key，量本来就小 */
const AUTO_RECLAIM_LIMIT = 500;
/** 回收记录保留 30 天供排障，之后物理删除，避免表只增不减 */
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface ReclaimPreview {
  scope: R2ReclaimScope;
  days: number;
  namespace: string | null;
  candidates: number;
  bytes: number;
  oldestUploadedAt: number | null;
  hasMore: boolean;
}

export interface ReclaimResult {
  scope: R2ReclaimScope;
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
 * 预览：只统计，不删。前端必须先把数量与体积展示给管理员再确认。
 * unparsed 不使用天数条件：这类 key 没有任何被命中的可能。
 */
export async function previewReclaim(
  env: Env,
  params: { scope: R2ReclaimScope; days: number; namespace?: string; limit: number },
): Promise<ReclaimPreview> {
  const uploadedBefore = Date.now() - params.days * 24 * 60 * 60 * 1000;
  const summary = await summarizeReclaimCandidates(env.DB, {
    scope: params.scope,
    uploadedBefore,
    namespace: params.namespace,
  });

  return {
    scope: params.scope,
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
 *   1. SQL 侧：按 scope 过滤（unparsed 只认 url_hash IS NULL；
 *      expired 还要求无账本、无引用、超期、保护期已过）
 *   2. 删之前按 key 再复核一遍（预览到执行之间回填器可能刚写入账本）
 *   3. R2 删除失败则整批不标记账，对象与快照保持一致
 */
export async function reclaimR2Objects(
  env: Env,
  params: { scope: R2ReclaimScope; days: number; namespace?: string; limit: number },
): Promise<ReclaimResult> {
  const empty: ReclaimResult = {
    scope: params.scope,
    deleted: 0,
    failed: 0,
    bytesFreed: 0,
    hasMore: false,
  };
  if (!env.MEDIA) return empty;

  const now = Date.now();
  const uploadedBefore = now - params.days * 24 * 60 * 60 * 1000;

  const candidates = await selectReclaimCandidates(env.DB, {
    scope: params.scope,
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
      ...empty,
      failed: safeKeys.length,
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
    scope: params.scope,
    deleted: safeKeys.length,
    failed: candidates.length - safeKeys.length,
    bytesFreed,
    hasMore: candidates.length === params.limit,
  };
}

/**
 * 每日自动清理：只删未解析 key，不碰任何可能被复用的对象。
 *
 * 为什么不再按天数自动删「超期未登记」：那些对象是用户浏览过的封面，
 * 搜索页、收藏、历史、榜单都会反复请求同一批 URL。命中走 CDN，Worker 看不到，
 * 所以无法判断它们是否还在被用；删了只是把命中退回成回源，
 * 省下的存储费远小于上游压力与延迟，且上游已失效的图会永久丢失。
 *
 * 顺带清理 30 天前已标记删除的快照行。
 */
export async function runR2AutoReclaim(
  env: Env,
  limit = AUTO_RECLAIM_LIMIT,
): Promise<ReclaimResult & { purged: number }> {
  const empty: ReclaimResult & { purged: number } = {
    scope: 'unparsed',
    deleted: 0,
    failed: 0,
    bytesFreed: 0,
    hasMore: false,
    purged: 0,
  };
  if (!env.MEDIA) return empty;

  const settings = await getR2Settings(env.DB);

  let purged = 0;
  try {
    purged = await purgeDeletedObjects(env.DB, Date.now() - PURGE_AFTER_MS);
  } catch (err) {
    console.error('[r2-reclaim] 清理历史快照行失败:', err);
  }

  if (!settings.reclaimEnabled) return { ...empty, purged };

  const result = await reclaimR2Objects(env, {
    scope: 'unparsed',
    days: settings.reclaimDays,
    limit,
  });
  return { ...result, purged };
}
