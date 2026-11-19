/**
 * R2 对象快照仓储：只负责 r2_objects / r2_scan_state 两张表的 SQL 读写。
 *
 * 约束：r2_objects 是 R2 的独立真相源，本文件不读写 cover_assets 之外的业务表。
 * 对账与回收都是「只读 R2 快照 + 只读账本」，唯一例外是 repairLedgerLies
 * 把谎报 ready 的账本行改回 missing。
 */

/** 一次 INSERT 覆盖几行：7 个列 + 1 个 protect_until 占位，单语句绑定参数上限 100 */
const UPSERT_COLUMNS = 7;
export const R2_UPSERT_CHUNK_ROWS = Math.floor((100 - 1) / UPSERT_COLUMNS);

/** 回收复核时 IN 列表最多放几个 key（每个 key 约 90 字符，远低于 SQL 文本上限） */
export const R2_RECHECK_CHUNK_KEYS = 98;

export interface R2ScanStateRow {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  scan_id: string | null;
  cursor: string | null;
  pages_done: number;
  objects_seen: number;
  skipped_keys: number;
  is_truncated: number;
  started_at: number | null;
  completed_at: number | null;
  next_scan_at: number;
  trigger: 'cron' | 'manual';
  /** full = 全量校验（更新所有行 + 检测消失）；incremental = 只登记新对象 */
  scan_mode: 'full' | 'incremental';
  stats_version: number;
  last_error: string | null;
  updated_at: number;
}

export interface R2StatsSnapshotRow {
  id: string;
  payload: string;
  total_objects: number;
  total_bytes: number;
  generated_at: number;
  last_full_at: number;
}

export interface R2ObjectUpsertRow {
  objectKey: string;
  urlHash: string | null;
  namespace: string;
  byteSize: number;
  uploadedAt: number;
  seenAt: number;
}

export interface R2ObjectListRow {
  object_key: string;
  url_hash: string | null;
  namespace: string;
  byte_size: number;
  uploaded_at: number;
  first_seen_at: number;
  last_seen_at: number;
  reclaimed_at: number | null;
  registered: number;
  ledger_status: string | null;
}

export interface R2ObjectListQuery {
  page: number;
  pageSize: number;
  namespace?: string;
  registered: 'all' | 'yes' | 'no';
  status: 'live' | 'reclaimed' | 'all';
  minAgeDays?: number;
  sort: 'uploaded' | 'size';
}

export interface R2ReclaimCandidate {
  object_key: string;
  url_hash: string | null;
  byte_size: number;
}

export interface R2NamespaceCount {
  namespace: string;
  cnt: number;
  bytes: number;
}

// ── 扫描状态 ─────────────────────────────────────────────

/** 读取单行扫描状态；表还没建或行缺失时返回 null，由调用方按「未初始化」处理 */
export async function getScanState(db: D1Database): Promise<R2ScanStateRow | null> {
  try {
    return await db
      .prepare('SELECT * FROM r2_scan_state WHERE id = ?')
      .bind('current')
      .first<R2ScanStateRow>();
  } catch {
    return null;
  }
}

/** 开新一轮：重置游标与计数器，保留 stats_version 与 next_scan_at */
export async function startScanRound(
  db: D1Database,
  params: {
    scanId: string;
    now: number;
    trigger: 'cron' | 'manual';
    mode: 'full' | 'incremental';
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE r2_scan_state
          SET status = 'running', scan_id = ?, cursor = NULL,
              pages_done = 0, objects_seen = 0, skipped_keys = 0, is_truncated = 1,
              started_at = ?, completed_at = NULL, last_error = NULL,
              trigger = ?, scan_mode = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      params.scanId,
      params.now,
      params.trigger,
      params.mode,
      params.now,
      'current',
    )
    .run();
}

/** 每页结束落一次游标：进程被杀时最多重放一页，upsert 幂等 */
export async function persistScanProgress(
  db: D1Database,
  params: {
    cursor: string | null;
    pagesDone: number;
    objectsSeen: number;
    skippedKeys: number;
    isTruncated: boolean;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE r2_scan_state
          SET cursor = ?, pages_done = ?, objects_seen = ?, skipped_keys = ?,
              is_truncated = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      params.cursor,
      params.pagesDone,
      params.objectsSeen,
      params.skippedKeys,
      params.isTruncated ? 1 : 0,
      params.now,
      'current',
    )
    .run();
}

/** 本轮失败：保留 cursor / pages_done，下一个 tick 从断点续扫 */
export async function markScanFailed(
  db: D1Database,
  params: { lastError: string; nextScanAt: number; now: number },
): Promise<void> {
  await db
    .prepare(
      `UPDATE r2_scan_state
          SET status = 'failed', last_error = ?, next_scan_at = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(params.lastError.slice(0, 500), params.nextScanAt, params.now, 'current')
    .run();
}

/** 手动「立即扫描」：把下一轮时间提前到当下；已在跑时不重置游标 */
export async function requestManualScan(db: D1Database, now: number): Promise<void> {
  await db
    .prepare(
      `UPDATE r2_scan_state SET next_scan_at = 0, trigger = 'manual', updated_at = ?
        WHERE id = ?`,
    )
    .bind(now, 'current')
    .run();
}

/** 上次失败的轮次到期后续扫：保留原 scan_id 与游标，不从头重来 */
export async function resumeScanRound(db: D1Database, now: number): Promise<void> {
  await db
    .prepare(
      `UPDATE r2_scan_state SET status = 'running', last_error = NULL, updated_at = ?
        WHERE id = ?`,
    )
    .bind(now, 'current')
    .run();
}

/** 一轮扫完：清游标、写最终计数、推进 stats_version 让边缘缓存自然换 key */
export async function completeScanRound(
  db: D1Database,
  params: {
    nextScanAt: number;
    now: number;
    pagesDone: number;
    objectsSeen: number;
    skippedKeys: number;
    warning?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE r2_scan_state
          SET status = 'completed', completed_at = ?, cursor = NULL, is_truncated = 0,
              pages_done = ?, objects_seen = ?, skipped_keys = ?,
              next_scan_at = ?, stats_version = stats_version + 1,
              last_error = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      params.now,
      params.pagesDone,
      params.objectsSeen,
      params.skippedKeys,
      params.nextScanAt,
      params.warning ? params.warning.slice(0, 500) : null,
      params.now,
      'current',
    )
    .run();
}

/** 统计缓存版本号；读不到时返回 0，缓存 key 仍可用 */
export async function getStatsVersion(db: D1Database): Promise<number> {
  try {
    const row = await db
      .prepare('SELECT stats_version FROM r2_scan_state WHERE id = ?')
      .bind('current')
      .first<{ stats_version: number }>();
    return Number(row?.stats_version ?? 0);
  } catch {
    return 0;
  }
}

// ── 对象写入 ─────────────────────────────────────────────

/**
 * 批量 upsert 一页对象。每页一次 db.batch，单语句 14 行（99 个绑定参数）。
 *
 * mode='incremental' 时退化为 DO NOTHING：日常轮次只登记新对象，已存在的行
 * 一个字节都不写。全量更新（含 last_seen_at）只放在每周的 full 轮次，
 * 否则每天一轮全量 upsert 就是全表 N 行写，白占 D1 额度。
 *
 * reclaimed_at 非空说明这个 key 被我们回收过又被访问重建：打 180 天保护期，
 * 否则下一轮扫描会把它当超期对象再删一次，热图会在删除与回源之间反复抖动。
 */
export async function upsertR2Objects(
  db: D1Database,
  rows: R2ObjectUpsertRow[],
  protectUntil: number,
  mode: 'full' | 'incremental' = 'full',
): Promise<void> {
  if (rows.length === 0) return;

  const isFull = mode === 'full';
  const statements: D1PreparedStatement[] = [];
  for (let start = 0; start < rows.length; start += R2_UPSERT_CHUNK_ROWS) {
    const chunk = rows.slice(start, start + R2_UPSERT_CHUNK_ROWS);
    const values = chunk.map(() => '(?,?,?,?,?,?,?)').join(',');
    const binds: unknown[] = [];
    for (const row of chunk) {
      binds.push(
        row.objectKey,
        row.urlHash,
        row.namespace,
        row.byteSize,
        row.uploadedAt,
        row.seenAt,
        row.seenAt,
      );
    }

    if (!isFull) {
      statements.push(
        db
          .prepare(
            `INSERT INTO r2_objects
               (object_key, url_hash, namespace, byte_size, uploaded_at, first_seen_at, last_seen_at)
             VALUES ${values}
             ON CONFLICT(object_key) DO NOTHING`,
          )
          .bind(...binds),
      );
      continue;
    }

    binds.push(protectUntil);
    statements.push(
      db
        .prepare(
          `INSERT INTO r2_objects
             (object_key, url_hash, namespace, byte_size, uploaded_at, first_seen_at, last_seen_at)
           VALUES ${values}
           ON CONFLICT(object_key) DO UPDATE SET
             url_hash       = excluded.url_hash,
             namespace      = excluded.namespace,
             byte_size      = excluded.byte_size,
             uploaded_at    = excluded.uploaded_at,
             last_seen_at   = excluded.last_seen_at,
             missing_rounds = 0,
             deleted_at     = NULL,
             protect_until  = CASE
                                WHEN r2_objects.reclaimed_at IS NOT NULL THEN ?
                                ELSE r2_objects.protect_until
                              END,
             reclaimed_at   = NULL`,
        )
        .bind(...binds),
    );
  }

  await db.batch(statements);
}

/** 本轮没扫到的行缺失轮数 +1；连续两轮才算对象消失，防单次 list 抖动误判 */
export async function bumpMissingObjects(
  db: D1Database,
  scanStartedAt: number,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE r2_objects SET missing_rounds = missing_rounds + 1
        WHERE last_seen_at < ? AND deleted_at IS NULL`,
    )
    .bind(scanStartedAt)
    .run();
  return result.meta.changes ?? 0;
}

/** 连续两轮没见到 → 物化 deleted_at，之后所有列表/统计都按 deleted_at IS NULL 过滤 */
export async function markVanishedObjects(db: D1Database, now: number): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE r2_objects SET deleted_at = ?
        WHERE missing_rounds >= 2 AND deleted_at IS NULL`,
    )
    .bind(now)
    .run();
  return result.meta.changes ?? 0;
}

/** 清理 30 天前标记删除的行，避免「对象换了又换、行只增不减」 */
export async function purgeDeletedObjects(db: D1Database, before: number): Promise<number> {
  const result = await db
    .prepare('DELETE FROM r2_objects WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .bind(before)
    .run();
  return result.meta.changes ?? 0;
}

// ── 对账统计 ─────────────────────────────────────────────

/** R2 口径：有效对象数、总占用、未解析 key 数 */
export async function countR2Objects(
  db: D1Database,
): Promise<{ objects: number; bytes: number; unparsed: number }> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS objects,
              COALESCE(SUM(byte_size), 0) AS bytes,
              SUM(CASE WHEN url_hash IS NULL THEN 1 ELSE 0 END) AS unparsed
         FROM r2_objects WHERE deleted_at IS NULL`,
    )
    .first<{ objects: number; bytes: number; unparsed: number }>();
  return {
    objects: Number(row?.objects ?? 0),
    bytes: Number(row?.bytes ?? 0),
    unparsed: Number(row?.unparsed ?? 0),
  };
}

/** 账本口径：ready 数量与占用（asset 维度去重，不含记录重复） */
export async function countLedgerReady(
  db: D1Database,
): Promise<{ ready: number; bytes: number }> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS ready, COALESCE(SUM(byte_size), 0) AS bytes
         FROM cover_assets WHERE status = 'ready'`,
    )
    .first<{ ready: number; bytes: number }>();
  return { ready: Number(row?.ready ?? 0), bytes: Number(row?.bytes ?? 0) };
}

/** 业务口径：有 cover 的记录数 + 已登记映射的去重封面数 */
export async function countBusinessCovers(
  db: D1Database,
): Promise<{ recordsWithCover: number; distinctCoverHashes: number }> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM data_records
           WHERE cover IS NOT NULL AND trim(cover) <> '') AS recordsWithCover,
         (SELECT COUNT(DISTINCT url_hash) FROM data_record_covers) AS distinctCoverHashes`,
    )
    .first<{ recordsWithCover: number; distinctCoverHashes: number }>();
  return {
    recordsWithCover: Number(row?.recordsWithCover ?? 0),
    distinctCoverHashes: Number(row?.distinctCoverHashes ?? 0),
  };
}

/**
 * 差额 1：R2 有、账本无的对象，按「是否超过回收阈值」拆成可回收与保护期两档。
 * 用 EXISTS 而不是 JOIN：同一 hash 若出现多行异常 key，JOIN 会把统计放大。
 */
export async function groupUnregisteredObjects(
  db: D1Database,
  params: { cutoff: number },
): Promise<{ reclaimable: R2NamespaceCount[]; protected: R2NamespaceCount[] }> {
  const reclaimableQuery = db
    .prepare(
      `SELECT o.namespace AS namespace, COUNT(*) AS cnt, COALESCE(SUM(o.byte_size), 0) AS bytes
         FROM r2_objects o
        WHERE o.deleted_at IS NULL AND o.reclaimed_at IS NULL
          AND o.uploaded_at < ?
          AND (o.protect_until IS NULL OR o.protect_until < ?)
          AND NOT EXISTS (SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash)
          AND NOT EXISTS (SELECT 1 FROM data_record_covers c WHERE c.url_hash = o.url_hash)
        GROUP BY o.namespace ORDER BY bytes DESC`,
    )
    .bind(params.cutoff, params.cutoff);

  const protectedQuery = db
    .prepare(
      `SELECT o.namespace AS namespace, COUNT(*) AS cnt, COALESCE(SUM(o.byte_size), 0) AS bytes
         FROM r2_objects o
        WHERE o.deleted_at IS NULL AND o.reclaimed_at IS NULL
          AND o.url_hash IS NOT NULL
          AND o.uploaded_at >= ?
          AND NOT EXISTS (SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash)
        GROUP BY o.namespace ORDER BY bytes DESC`,
    )
    .bind(params.cutoff);

  const [reclaimable, protectedRows] = await db.batch([reclaimableQuery, protectedQuery]);
  return {
    reclaimable: (reclaimable.results || []) as unknown as R2NamespaceCount[],
    protected: (protectedRows.results || []) as unknown as R2NamespaceCount[],
  };
}

/**
 * 差额 2：账本标了 ready 但 R2 里没有对象。
 *
 * before 必须是「最近一轮完整扫描的 started_at」，不能用 completed_at：
 * R2 list 按 key 字典序推进，扫描开始后才写入的对象可能落在已扫过的位置，
 * 用结束时间做门槛会把它们误判成「对象不存在」。
 * repairable = 仍被记录引用、可以改回 missing 重试；orphan = 无引用，交给现有 GC 删除。
 */
export async function groupLedgerLies(
  db: D1Database,
  params: { before: number },
): Promise<Array<{ namespace: string; cnt: number; repairable: number; orphan: number }>> {
  const result = await db
    .prepare(
      `SELECT a.namespace AS namespace, COUNT(*) AS cnt,
              SUM(CASE WHEN EXISTS (
                    SELECT 1 FROM data_record_covers c WHERE c.url_hash = a.url_hash
                  ) THEN 1 ELSE 0 END) AS repairable,
              SUM(CASE WHEN NOT EXISTS (
                    SELECT 1 FROM data_record_covers c WHERE c.url_hash = a.url_hash
                  ) THEN 1 ELSE 0 END) AS orphan
         FROM cover_assets a
        WHERE a.status = 'ready' AND a.stored_at IS NOT NULL AND a.stored_at < ?
          AND NOT EXISTS (
                SELECT 1 FROM r2_objects o
                 WHERE o.url_hash = a.url_hash AND o.deleted_at IS NULL)
        GROUP BY a.namespace ORDER BY cnt DESC`,
    )
    .bind(params.before)
    .all<{ namespace: string; cnt: number; repairable: number; orphan: number }>();
  return result.results || [];
}

/** 年龄分桶：按上传时间把对象切成 30/90/180 天三档，用于判断回收节奏是否合理 */
export async function groupAgeBuckets(
  db: D1Database,
  params: { now: number },
): Promise<
  Array<{
    namespace: string;
    b0_30: number;
    b31_90: number;
    b91_180: number;
    b180p: number;
  }>
> {
  const day = 24 * 60 * 60 * 1000;
  const result = await db
    .prepare(
      `SELECT o.namespace AS namespace,
              SUM(CASE WHEN o.uploaded_at >= ? THEN 1 ELSE 0 END) AS b0_30,
              SUM(CASE WHEN o.uploaded_at < ? AND o.uploaded_at >= ? THEN 1 ELSE 0 END) AS b31_90,
              SUM(CASE WHEN o.uploaded_at < ? AND o.uploaded_at >= ? THEN 1 ELSE 0 END) AS b91_180,
              SUM(CASE WHEN o.uploaded_at < ? THEN 1 ELSE 0 END) AS b180p
         FROM r2_objects o
        WHERE o.deleted_at IS NULL
        GROUP BY o.namespace ORDER BY b180p DESC`,
    )
    .bind(
      params.now - 30 * day,
      params.now - 30 * day,
      params.now - 90 * day,
      params.now - 90 * day,
      params.now - 180 * day,
      params.now - 180 * day,
    )
    .all<{ namespace: string; b0_30: number; b31_90: number; b91_180: number; b180p: number }>();
  return result.results || [];
}

/** 按类别汇总 R2 对象，并顺带算出其中已被账本登记的数量（一次扫描出三列） */
export async function groupObjectsByNamespace(
  db: D1Database,
): Promise<
  Array<{ namespace: string; objects: number; bytes: number; registered: number }>
> {
  const result = await db
    .prepare(
      `SELECT o.namespace AS namespace,
              COUNT(*) AS objects,
              COALESCE(SUM(o.byte_size), 0) AS bytes,
              SUM(CASE WHEN EXISTS (
                    SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash
                  ) THEN 1 ELSE 0 END) AS registered
         FROM r2_objects o
        WHERE o.deleted_at IS NULL
        GROUP BY o.namespace
        ORDER BY bytes DESC`,
    )
    .all<{ namespace: string; objects: number; bytes: number; registered: number }>();
  return result.results || [];
}

// ── 统计快照 ─────────────────────────────────────────────

/**
 * 读取统计快照。看板请求只走这一次单行读，不再重跑全表聚合。
 * 表还没建时返回 null，调用方按「未初始化」处理。
 */
export async function getStatsSnapshot(db: D1Database): Promise<R2StatsSnapshotRow | null> {
  try {
    return await db
      .prepare('SELECT * FROM r2_stats_snapshot WHERE id = ?')
      .bind('current')
      .first<R2StatsSnapshotRow>();
  } catch {
    return null;
  }
}

/** 写入统计快照；payload 由统计服务序列化，这里只落库 */
export async function saveStatsSnapshot(
  db: D1Database,
  params: {
    payload: string;
    totalObjects: number;
    totalBytes: number;
    generatedAt: number;
    lastFullAt?: number;
  },
): Promise<void> {
  const lastFullSql = params.lastFullAt === undefined ? '' : ', last_full_at = ?';
  const statement = db.prepare(
    `UPDATE r2_stats_snapshot
        SET payload = ?, total_objects = ?, total_bytes = ?, generated_at = ?${lastFullSql}
      WHERE id = ?`,
  );
  const binds: unknown[] = [
    params.payload,
    params.totalObjects,
    params.totalBytes,
    params.generatedAt,
  ];
  if (params.lastFullAt !== undefined) binds.push(params.lastFullAt);
  binds.push('current');
  await statement.bind(...binds).run();
}

// ── 对象浏览 ─────────────────────────────────────────────

/**
 * 对象分页列表；registered 由账本是否存在对应 hash 推导。
 *
 * withTotal=false 时跳过 COUNT：COUNT 要扫全部 live 行（十万级），
 * 而翻页只需要 LIMIT。调用方只在第一页（或筛选变化后）请求总数，
 * 后续翻页沿用已有数字，避免每翻一页付一次全表扫描。
 */
export async function listR2Objects(
  db: D1Database,
  query: R2ObjectListQuery,
  withTotal = true,
): Promise<{ total: number | null; rows: R2ObjectListRow[] }> {
  const where: string[] = [];
  const binds: unknown[] = [];

  if (query.status === 'live') {
    where.push('o.deleted_at IS NULL');
  } else if (query.status === 'reclaimed') {
    where.push('o.reclaimed_at IS NOT NULL');
  }
  if (query.namespace) {
    where.push('o.namespace = ?');
    binds.push(query.namespace);
  }
  if (query.minAgeDays !== undefined && query.minAgeDays > 0) {
    where.push('o.uploaded_at < ?');
    binds.push(Date.now() - query.minAgeDays * 24 * 60 * 60 * 1000);
  }
  if (query.registered === 'yes') {
    where.push('EXISTS (SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash)');
  } else if (query.registered === 'no') {
    where.push('NOT EXISTS (SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash)');
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = query.sort === 'size'
    ? 'ORDER BY o.byte_size DESC'
    : 'ORDER BY o.uploaded_at DESC';
  const offset = (query.page - 1) * query.pageSize;

  const rowsStatement = db
    .prepare(
      `SELECT o.object_key, o.url_hash, o.namespace, o.byte_size, o.uploaded_at,
              o.first_seen_at, o.last_seen_at, o.reclaimed_at,
              CASE WHEN a.url_hash IS NULL THEN 0 ELSE 1 END AS registered,
              a.status AS ledger_status
         FROM r2_objects o
         LEFT JOIN cover_assets a ON a.url_hash = o.url_hash
         ${whereSql}
         ${orderSql}
         LIMIT ? OFFSET ?`,
    )
    .bind(...binds, query.pageSize, offset);

  if (!withTotal) {
    const rows = await rowsStatement.all<R2ObjectListRow>();
    return { total: null, rows: rows.results || [] };
  }

  const [countResult, rowsResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total FROM r2_objects o ${whereSql}`).bind(...binds),
    rowsStatement,
  ]);

  const totalRow = (countResult.results || [])[0] as { total?: number } | undefined;
  return {
    total: Number(totalRow?.total ?? 0),
    rows: (rowsResult.results || []) as unknown as R2ObjectListRow[],
  };
}

// ── 回收 ─────────────────────────────────────────────────

/**
 * 选回收候选：只碰「无账本 + 无记录引用 + 超期 + 保护期已过」的对象。
 *
 * 注意：url_hash 为空的未解析 key 也会命中（NOT EXISTS 对 NULL 恒真），
 * 这是期望行为 —— 这类 key 代理永远算不出来，留在 R2 里也取不到。
 */
export async function selectReclaimCandidates(
  db: D1Database,
  params: { uploadedBefore: number; namespace?: string; limit: number },
): Promise<R2ReclaimCandidate[]> {
  const namespaceSql = params.namespace ? 'AND o.namespace = ?' : '';
  const binds: unknown[] = [params.uploadedBefore, params.uploadedBefore];
  if (params.namespace) binds.push(params.namespace);
  binds.push(params.limit);

  const result = await db
    .prepare(
      `SELECT o.object_key, o.url_hash, o.byte_size
         FROM r2_objects o
        WHERE o.deleted_at IS NULL AND o.reclaimed_at IS NULL
          AND o.uploaded_at < ?
          AND (o.protect_until IS NULL OR o.protect_until < ?)
          ${namespaceSql}
          AND NOT EXISTS (SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash)
          AND NOT EXISTS (SELECT 1 FROM data_record_covers c WHERE c.url_hash = o.url_hash)
        ORDER BY o.uploaded_at ASC
        LIMIT ?`,
    )
    .bind(...binds)
    .all<R2ReclaimCandidate>();
  return result.results || [];
}

/** 计算候选总量与体积；多取一条用于判断是否还有剩余 */
export async function summarizeReclaimCandidates(
  db: D1Database,
  params: { uploadedBefore: number; namespace?: string },
): Promise<{ count: number; bytes: number; oldest: number | null }> {
  const namespaceSql = params.namespace ? 'AND o.namespace = ?' : '';
  const binds: unknown[] = [params.uploadedBefore, params.uploadedBefore];
  if (params.namespace) binds.push(params.namespace);

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(o.byte_size), 0) AS bytes, MIN(o.uploaded_at) AS oldest
         FROM r2_objects o
        WHERE o.deleted_at IS NULL AND o.reclaimed_at IS NULL
          AND o.uploaded_at < ?
          AND (o.protect_until IS NULL OR o.protect_until < ?)
          ${namespaceSql}
          AND NOT EXISTS (SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash)
          AND NOT EXISTS (SELECT 1 FROM data_record_covers c WHERE c.url_hash = o.url_hash)`,
    )
    .bind(...binds)
    .first<{ cnt: number; bytes: number; oldest: number | null }>();

  return {
    count: Number(row?.cnt ?? 0),
    bytes: Number(row?.bytes ?? 0),
    oldest: row?.oldest == null ? null : Number(row.oldest),
  };
}

/**
 * 执行前复核：从预览到执行之间回填器可能刚写入账本，删掉就丢了刚下的对象。
 * 只返回仍然安全的 key，调用方按这个列表删 R2。
 */
export async function recheckReclaimCandidates(
  db: D1Database,
  keys: string[],
): Promise<string[]> {
  if (keys.length === 0) return [];
  const placeholders = keys.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT o.object_key
         FROM r2_objects o
        WHERE o.object_key IN (${placeholders})
          AND o.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM cover_assets a WHERE a.url_hash = o.url_hash)
          AND NOT EXISTS (SELECT 1 FROM data_record_covers c WHERE c.url_hash = o.url_hash)`,
    )
    .bind(...keys)
    .all<{ object_key: string }>();
  return (result.results || []).map((row) => row.object_key);
}

/**
 * 标记已回收。保留行、不物理删除：删了它会立刻以「未登记有效对象」
 * 重新出现在统计里，看起来像同一天被反复回收。
 */
export async function markObjectsReclaimed(
  db: D1Database,
  keys: string[],
  now: number,
): Promise<number> {
  if (keys.length === 0) return 0;
  const placeholders = keys.map(() => '?').join(',');
  const result = await db
    .prepare(
      `UPDATE r2_objects SET reclaimed_at = ?, deleted_at = ?
        WHERE object_key IN (${placeholders})`,
    )
    .bind(now, now, ...keys)
    .run();
  return result.meta.changes ?? 0;
}

// ── 账本修账 ─────────────────────────────────────────────

/**
 * 修账前的 dry-run：返回待修行数与 ready 总数。
 * 影响面超过阈值时调用方要放弃本轮修账 —— 首轮扫描不完整会把大量
 * 「还没来得及扫」的账本行误判成「对象不存在」。
 */
export async function countLedgerLiesForRepair(
  db: D1Database,
  params: { before: number },
): Promise<{ repairable: number; readyTotal: number }> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM cover_assets a
           WHERE a.status = 'ready' AND a.stored_at IS NOT NULL AND a.stored_at < ?
             AND NOT EXISTS (SELECT 1 FROM r2_objects o
                              WHERE o.url_hash = a.url_hash AND o.deleted_at IS NULL)
             AND EXISTS (SELECT 1 FROM data_record_covers c WHERE c.url_hash = a.url_hash)
         ) AS repairable,
         (SELECT COUNT(*) FROM cover_assets WHERE status = 'ready') AS readyTotal`,
    )
    .bind(params.before)
    .first<{ repairable: number; readyTotal: number }>();
  return {
    repairable: Number(row?.repairable ?? 0),
    readyTotal: Number(row?.readyTotal ?? 0),
  };
}

/**
 * 把谎报 ready 的账本行改回 missing 重试。
 *
 * EXISTS data_record_covers 不能去掉：孤儿资产的账本行由 gcOrphanCoverAssets 直接删除，
 * 若这里把它们改成 missing，回填器会重新下载对象，形成「GC 删 → 修账复活 → 再删」的死循环。
 */
export async function repairLedgerLies(
  db: D1Database,
  params: { before: number; now: number },
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE cover_assets
          SET status = 'missing', attempts = 0, retry_exhausted = 0,
              next_retry_at = 0, updated_at = ?
        WHERE status = 'ready' AND stored_at IS NOT NULL AND stored_at < ?
          AND NOT EXISTS (SELECT 1 FROM r2_objects o
                           WHERE o.url_hash = cover_assets.url_hash AND o.deleted_at IS NULL)
          AND EXISTS (SELECT 1 FROM data_record_covers c
                       WHERE c.url_hash = cover_assets.url_hash)`,
    )
    .bind(params.now, params.before)
    .run();
  return result.meta.changes ?? 0;
}

/** 回收后也要让边缘缓存的统计失效 */
export async function bumpStatsVersion(db: D1Database, now: number): Promise<void> {
  await db
    .prepare(
      'UPDATE r2_scan_state SET stats_version = stats_version + 1, updated_at = ? WHERE id = ?',
    )
    .bind(now, 'current')
    .run();
}
