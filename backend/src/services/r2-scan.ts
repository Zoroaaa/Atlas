/**
 * R2 封面对象扫描：把 R2 里的真实对象分批登记到 r2_objects。
 *
 * 为什么需要独立扫描：代理接口命中/回源时只写 R2，不写 cover_assets，
 * 账本看不到用户浏览带进来的封面，账本数量与 R2 实际对象数永远对不上。
 *
 * 两种轮次：
 *   full        全量校验。逐行 upsert（更新 last_seen_at）、检测对象消失、修账、刷新统计快照。
 *   incremental 日常登记。只插新对象（DO NOTHING），已存在的行一个字节都不写。
 *
 * 日常必须用 incremental：一轮全量 upsert 就是 N 行写 + N 行读，每天一轮等于白占
 * D1 额度。消失检测只在 full 轮次做 —— 只有本系统在写这个 bucket，
 * 外部删除是罕见事件，不值得每天付全表写入。
 *
 * 约束：一轮扫描跨多个 tick，游标每页落库；upsert 幂等，进程被杀最多重放一页。
 * 只扫 covers/v1/orig/ 前缀，墓碑（covers/v1/miss/）不是封面对象。
 */
import type { Env } from '@/types';
import { withCronLock } from './cron-lock';
import {
  COVER_ORIG_PREFIX,
  fallbackCoverNamespace,
  parseCoverObjectKey,
} from './media-key';
import {
  bumpMissingObjects,
  completeScanRound,
  countLedgerLiesForRepair,
  getScanState,
  getStatsSnapshot,
  markScanFailed,
  markVanishedObjects,
  persistScanProgress,
  repairLedgerLies,
  resumeScanRound,
  startScanRound,
  upsertR2Objects,
  type R2ObjectUpsertRow,
} from '@/repositories/r2-objects-repository';
import { getR2Settings } from './r2-settings';
import { refreshStatsSnapshot } from './r2-dashboard';

export type { R2ScanSettings } from './r2-settings';

const LOCK_KEY = 'r2.scan';
/**
 * 锁租约 55 秒：每分钟一个 tick，单 tick 只列 1-5 页（R2 list 单页上限 1000），
 * 正常耗时 1-3 秒；留足余量又不会让崩溃的 tick 卡住下一分钟。
 */
const LOCK_TTL_MS = 55_000;
/** 一轮结束后到下一轮的间隔：每天扫一次足够，R2 写入本身就是按需触发 */
const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
/**
 * 全量校验轮次的间隔。日常轮次只插新对象，代价是「对象被外部删除」检测不到；
 * 每周做一次全量确认，把全表写入成本摊到 1/7。
 */
const FULL_SCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** 失败后退避 15 分钟再试，避免 R2 抖动时每分钟都撞一次 */
const FAIL_RETRY_MS = 15 * 60 * 1000;
/** R2 list 单页上限 */
const PAGE_LIMIT = 1000;
/** 被回收后又被访问重建的对象保护期：180 天，足够把热图和死图区分开 */
const REVIVED_PROTECT_MS = 180 * 24 * 60 * 60 * 1000;
/**
 * 修账影响面阈值：超过 ready 总数的 2% 就放弃本轮修账。
 * 正常情况「账本说有、R2 没有」是极少数；大面积命中说明扫描不完整或 R2 侧异常，
 * 这时改账本会把可用的封面推进重试队列，比不改更糟。
 */
const REPAIR_MAX_RATIO = 0.02;

export interface R2ScanTickResult {
  ran: boolean;
  pages: number;
  objects: number;
  done: boolean;
}

/** 把 R2 list 的一页转成待登记行；反解失败的 key 也保留，只是 url_hash 为空 */
function toUpsertRows(
  objects: Array<{ key: string; size: number; uploaded: Date }>,
  seenAt: number,
): R2ObjectUpsertRow[] {
  return objects.map((object) => {
    const parsed = parseCoverObjectKey(object.key);
    return {
      objectKey: object.key,
      urlHash: parsed?.urlHash ?? null,
      namespace: parsed?.namespace ?? fallbackCoverNamespace(object.key),
      byteSize: object.size,
      uploadedAt: object.uploaded.getTime(),
      seenAt,
    };
  });
}

/**
 * 一轮扫完后的收尾：标记消失对象 → 修账 → 收状态 → 刷新统计快照。
 *
 * 顺序不能反：先让 missing_rounds 收敛，修账才不会把「本轮没见到」当成「R2 没有」；
 * 先收状态，快照里的 baselineAt 才会指向本轮。
 * 增量轮次跳过前三步：它没有更新 last_seen_at，做消失判定会把所有老行误杀。
 */
async function finalizeRound(
  env: Env,
  params: {
    startedAt: number;
    now: number;
    pagesDone: number;
    objectsSeen: number;
    skippedKeys: number;
    mode: 'full' | 'incremental';
  },
): Promise<void> {
  let warning: string | null = null;

  if (params.mode === 'full') {
    await bumpMissingObjects(env.DB, params.startedAt);
    await markVanishedObjects(env.DB, params.now);

    // 首轮没扫到任何对象时绝不能修账：多半是 R2 空、前缀配错或权限异常，
    // 此时账本里所有 ready 行都会「找不到对象」，一改就是把全部封面推进重试。
    if (params.objectsSeen === 0) {
      warning = '本轮未扫到任何 R2 对象，已跳过账本修账';
    } else {
      const { repairable, readyTotal } = await countLedgerLiesForRepair(env.DB, {
        before: params.startedAt,
      });
      if (repairable > 0) {
        const ratio = readyTotal > 0 ? repairable / readyTotal : 1;
        if (ratio > REPAIR_MAX_RATIO) {
          console.warn(
            `[r2-scan] 修账影响面 ${repairable}/${readyTotal}（${(ratio * 100).toFixed(1)}%）超过阈值，已跳过`,
          );
          warning = `账本不一致 ${repairable} 条（占 ${(ratio * 100).toFixed(1)}%），超过 2% 阈值已跳过自动修账`;
        } else {
          const repaired = await repairLedgerLies(env.DB, {
            before: params.startedAt,
            now: params.now,
          });
          if (repaired > 0) console.log(`[r2-scan] 修账 ${repaired} 条 ready → missing`);
        }
      }
    }
  }

  await completeScanRound(env.DB, {
    nextScanAt: params.now + SCAN_INTERVAL_MS,
    now: params.now,
    pagesDone: params.pagesDone,
    objectsSeen: params.objectsSeen,
    skippedKeys: params.skippedKeys,
    warning,
  });

  // 统计快照在这里重算：全表聚合只在轮次结束时花一次，
  // 看板请求就只剩一次单行读。失败不影响扫描结果，下一轮会再试。
  try {
    await refreshStatsSnapshot(env, {
      lastFullAt: params.mode === 'full' ? params.now : undefined,
    });
  } catch (err) {
    console.error('[r2-scan] 刷新统计快照失败:', err);
  }
}

/**
 * 决定本轮是 full 还是 incremental。
 * 没有快照（首轮）或距上次全量校验超过 7 天时走 full。
 */
async function resolveRoundMode(env: Env, now: number): Promise<'full' | 'incremental'> {
  const snapshot = await getStatsSnapshot(env.DB);
  const lastFullAt = Number(snapshot?.last_full_at ?? 0);
  if (lastFullAt === 0) return 'full';
  return now - lastFullAt >= FULL_SCAN_INTERVAL_MS ? 'full' : 'incremental';
}

/**
 * 单个 tick：从游标处最多列 pagesPerTick 页并登记。
 * 抢不到锁或未到扫描时间时返回 ran=false，由下一个 tick 补上。
 */
export async function runR2ScanTick(env: Env): Promise<R2ScanTickResult> {
  const idle: R2ScanTickResult = { ran: false, pages: 0, objects: 0, done: false };
  if (!env.MEDIA) return idle;

  const settings = await getR2Settings(env.DB);
  if (!settings.enabled) return idle;

  const bucket = env.MEDIA;
  const result = await withCronLock(
    env.DB,
    LOCK_KEY,
    LOCK_TTL_MS,
    async (): Promise<R2ScanTickResult> => {
      const state = await getScanState(env.DB);
      // 表还没建（迁移未执行）时静默退出：不能让「优化项」把每分钟 cron 打挂
      if (!state) return idle;

      const now = Date.now();
      let cursor = state.cursor;
      let pagesDone = state.pages_done;
      let objectsSeen = state.objects_seen;
      let skippedKeys = state.skipped_keys;
      let startedAt = state.started_at ?? now;
      let mode: 'full' | 'incremental' = state.scan_mode === 'full' ? 'full' : 'incremental';

      if (state.status !== 'running') {
        if (now < state.next_scan_at) return idle;

        // 上次失败的轮次有游标就从断点续扫，沿用本轮已定的 mode
        if (state.cursor && state.status === 'failed') {
          await resumeScanRound(env.DB, now);
        } else {
          const nextMode = await resolveRoundMode(env, now);
          await startScanRound(env.DB, {
            scanId: crypto.randomUUID(),
            now,
            trigger: state.trigger,
            mode: nextMode,
          });
          mode = nextMode;
          cursor = null;
          pagesDone = 0;
          objectsSeen = 0;
          skippedKeys = 0;
          startedAt = now;
        }
      }

      let pageCursor = cursor ?? undefined;
      let pages = 0;

      for (let index = 0; index < settings.pagesPerTick; index += 1) {
        const page = await bucket.list({
          prefix: COVER_ORIG_PREFIX,
          cursor: pageCursor,
          limit: PAGE_LIMIT,
        });

        const rows = toUpsertRows(page.objects, now);
        await upsertR2Objects(env.DB, rows, now + REVIVED_PROTECT_MS, mode);

        pages += 1;
        pagesDone += 1;
        objectsSeen += rows.length;
        skippedKeys += rows.filter((row) => row.urlHash === null).length;

        // truncated 但没有游标说明服务端行为异常，按本轮结束处理，避免死循环
        if (!page.truncated || !page.cursor) {
          await finalizeRound(env, {
            startedAt,
            now,
            pagesDone,
            objectsSeen,
            skippedKeys,
            mode,
          });
          return { ran: true, pages, objects: objectsSeen, done: true };
        }

        pageCursor = page.cursor;
        await persistScanProgress(env.DB, {
          cursor: page.cursor,
          pagesDone,
          objectsSeen,
          skippedKeys,
          isTruncated: true,
          now,
        });
      }

      return { ran: true, pages, objects: objectsSeen, done: false };
    },
  );

  return result ?? idle;
}

/**
 * cron 入口：吞掉异常并落 failed 状态，保证下一分钟还能继续。
 * 失败时保留游标，15 分钟后退避重试。
 */
export async function runR2ScanTickSafe(env: Env): Promise<R2ScanTickResult> {
  try {
    return await runR2ScanTick(env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[r2-scan] tick failed:', err);
    try {
      await markScanFailed(env.DB, {
        lastError: message,
        nextScanAt: Date.now() + FAIL_RETRY_MS,
        now: Date.now(),
      });
    } catch {
      // 状态表不可写时不再抛：cron 已经记过日志
    }
    return { ran: false, pages: 0, objects: 0, done: false };
  }
}
