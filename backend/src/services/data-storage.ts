/**
 * 数据存储管理服务
 *
 * 在用户搜索时将有效结果去重落库到 data_records / data_record_sources 表，
 * 逐步积累本地数据资产。不保存用户个人信息，仅保留数据本身。
 *
 * 集成点：
 *   - persistDataRecord: 搜索路由 saveEnrichedHistory 之后异步调用
 *   - enrichDataRecordFromDetail: JAV detail 路由返回前异步调用（补充磁力来源）
 *
 * 数据完整性策略：
 *   - content_data 存储搜索返回的首条完整元数据（含 overview/summary 等明细字段）
 *   - data_record_sources 表存储所有磁力/下载链接（anime/movie/novel 各源的磁力）
 *   - JAV 番号搜索返回完整详情，首采即 detail_completed=1
 *   - 列表型结果（anime/movie/manga/novel）首采 detail_completed=0，后续按需补充
 */
import { generateId } from '@/utils';
import type { JavEntityLink, MagnetItem } from './jav-utils';
import {
  applyJavDetailAbsent,
  applyJavDetailSuccess,
  applyJavDetailTransientFailure,
  computeMissingMask,
  magnetCountOf,
} from './jav-detail-meta';

// ─── JAV 封面相对路径补全 ─────────────────────────────────────────────
// JavBus 返回的 cover 是相对路径（如 /pics/cover/9ho0_b.jpg），
// 落库时补全为完整 URL，避免前端展示时再处理。
function resolveJavCover(cover: string | undefined): string | undefined {
  if (!cover) return undefined;
  if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
  if (cover.startsWith('/')) return `https://www.javbus.com${cover}`;
  return cover;
}

// ─── 类型：Provider 返回结构（局部定义，避免循环依赖） ────────────────

interface ActressItem {
  id: string;
  name: string;
  cover?: string;
  ruby?: string;
  romaji?: string;
  tags?: string[];
}

interface BgmItem {
  id: number;
  name: string;
  nameCN: string;
  cover: string;
  tags?: string[];
  studio?: string;
  rating?: number;
  url?: string;
  type?: string;
  status?: string;
  collection?: { wish?: number; collect?: number; doing?: number; dropped?: number };
}

/** 动漫统一磁力资源（nyaa/mikan/animetosho/dmhy 归一化） */
interface AnimeUnifiedResource {
  source: string;
  sourceLabel: string;
  title: string;
  magnet: string;
  size: string;
  date: string;
  seeders?: number;
  leechers?: number;
  group?: string;
  trusted?: boolean;
}

/** 动漫归组结果 */
interface AnimeGrouped {
  groups?: Array<{ subject: { id: number }; resources: AnimeUnifiedResource[] }>;
  ungrouped?: AnimeUnifiedResource[];
}

interface MovieItem {
  id: number;
  title: string;
  originalTitle?: string;
  overview?: string;
  poster: string | null;
  backdrop?: string | null;
  releaseDate?: string;
  release_date?: string;
  first_air_date?: string;
  year?: string;
  rating?: number;
  vote_average?: number;
  voteCount?: number;
  mediaType?: string;
  source?: string;
}

/** 影视资源项（磁力/网盘） */
interface MovieResourceItem {
  title: string;
  magnet?: string;
  size?: string;
  date?: string;
  source: string;
  sourceLabel: string;
  resourceType?: 'magnet' | 'drive' | 'direct';
  driveUrl?: string;
  driveCode?: string;
  detailUrl?: string;
}

/** 影视归组结果（与 movie-search 的 grouped 结构对应） */
interface MovieGrouped {
  groups?: Array<{ subject: { id: number }; resources: MovieResourceItem[] }>;
  ungrouped?: MovieResourceItem[];
}

/** 各媒体资源条目的公共字段：动漫/影视统一映射到 data_record_sources */
interface MediaResourceLike {
  title?: string;
  magnet?: string;
  size?: string;
  date?: string;
  source?: string;
  sourceLabel?: string;
  resourceType?: 'magnet' | 'drive' | 'direct';
  driveUrl?: string;
  driveCode?: string;
  detailUrl?: string;
  seeders?: number;
  leechers?: number;
  group?: string;
  trusted?: boolean;
}

interface MangaItem {
  id: string;
  title: string;
  cover: string;
  status?: string;
  tags?: string[];
}

interface NovelItem {
  id: string;
  title: string;
  cover: string;
  author?: string;
  description?: string;
  publisher?: string;
  format?: string;
  year?: string;
  category?: string;
  source?: string;
  language?: string;
  size?: string;
  detailUrl?: string;
}

interface JavDetail {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  duration?: string;
  publisher?: string;
  director?: string;
  maker?: string;
  series?: string;
  publishers?: string[];
  directors?: string[];
  makers?: string[];
  directorLinks?: JavEntityLink[];
  makerLinks?: JavEntityLink[];
  publisherLinks?: JavEntityLink[];
  seriesLinks?: JavEntityLink[];
  tagLinks?: JavEntityLink[];
  tags: string[];
  actresses: string[];
  detailUrl: string;
}

// ─── 内部：来源写入辅助 ──────────────────────────────────────────────

interface SourceEntry {
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  sourceData: Record<string, unknown>;
}

async function insertSources(
  db: D1Database,
  recordId: string,
  sources: SourceEntry[]
): Promise<void> {
  if (!sources.length) return;
  const now = Date.now();
  // 一次 batch 完成全部写入：D1 每次 invocation 最多 6 个并发连接，
  // 逐条 Promise.all 会在磁力多时排队甚至触发 overloaded，batch 只算一次往返
  const statements = sources.map((s) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO data_record_sources
           (id, record_id, source_name, source_type, source_url, source_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        generateId(),
        recordId,
        s.sourceName,
        s.sourceType,
        s.sourceUrl,
        JSON.stringify(s.sourceData),
        now
      )
  );

  try {
    await db.batch(statements);
  } catch (e) {
    console.error('[data-storage] insertSources batch error:', e);
  }
}

// ─── 内部：主记录 upsert ─────────────────────────────────────────────

interface RecordPayload {
  recordType: 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
  dedupKey: string;
  title: string;
  cover?: string;
  code?: string;
  actors?: string;
  duration?: string;
  releaseDate?: string;
  publisher?: string;
  tags?: string[];
  rating?: string;
  contentData: Record<string, unknown>;
  detailCompleted: 0 | 1;
}

/**
 * 写入主记录：首写优先（冲突时只刷新 last_updated_at，不覆盖已采数据）。
 * 单条 UPSERT + RETURNING 完成插入/节流更新/取 id：
 * - 新记录：一次往返
 * - 已有记录且超过 5 分钟：一次往返（更新 last_updated_at）
 * - 已有记录且 5 分钟内刚更新：RETURNING 为空，回退一次只读查询取 id
 */
async function upsertRecord(db: D1Database, payload: RecordPayload): Promise<string | null> {
  const now = Date.now();
  const id = generateId();
  const tagsJson = JSON.stringify(payload.tags || []);
  const throttleMs = 5 * 60 * 1000;

  const written = await db
    .prepare(
      `INSERT INTO data_records
         (id, record_type, dedup_key, title, cover, code, actors, duration,
          release_date, publisher, tags, rating, content_data, detail_completed,
          status, source_count, first_seen_at, last_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)
       ON CONFLICT(record_type, dedup_key) DO UPDATE SET last_updated_at = excluded.last_updated_at
       WHERE data_records.last_updated_at < ?
       RETURNING id`
    )
    .bind(
      id,
      payload.recordType,
      payload.dedupKey,
      payload.title,
      payload.cover ?? null,
      payload.code ?? null,
      payload.actors ?? null,
      payload.duration ?? null,
      payload.releaseDate ?? null,
      payload.publisher ?? null,
      tagsJson,
      payload.rating ?? null,
      JSON.stringify(payload.contentData),
      payload.detailCompleted,
      now,
      now,
      now - throttleMs
    )
    .first<{ id: string }>()
    .catch((e) => {
      console.error('[data-storage] upsertRecord error:', e);
      return null;
    });

  if (written) return written.id;

  // 冲突且未到节流窗口：记录已存在，只需取回 id
  const existing = await db
    .prepare('SELECT id FROM data_records WHERE record_type = ? AND dedup_key = ?')
    .bind(payload.recordType, payload.dedupKey)
    .first<{ id: string }>()
    .catch((e) => {
      console.error('[data-storage] lookupRecord error:', e);
      return null;
    });

  return existing?.id ?? null;
}

// ─── JAV 磁力 → 来源条目 ─────────────────────────────────────────────

function magnetsToSources(magnets: MagnetItem[], detailUrl?: string): SourceEntry[] {
  const sources: SourceEntry[] = [];
  if (detailUrl) {
    sources.push({
      sourceName: 'JavBus',
      sourceType: 'detail',
      sourceUrl: detailUrl,
      sourceData: {},
    });
  }
  for (const m of magnets) {
    if (!m.magnet) continue;
    sources.push({
      sourceName: 'JavBus',
      sourceType: 'magnet',
      sourceUrl: m.magnet,
      sourceData: { name: m.name, size: m.size, date: m.date, isHD: m.isHD },
    });
  }
  return sources;
}

// ─── 媒体资源 → 来源条目（动漫/影视共用） ─────────────────────────────

/**
 * 资源写入 data_record_sources 的唯一入口。
 * 顺序：磁力 → 网盘 → 详情页；按 URL 去重，最多 limit 条。
 */
function mediaResourcesToSources(resources: MediaResourceLike[], limit = 30): SourceEntry[] {
  const seen = new Set<string>();
  const sources: SourceEntry[] = [];

  const push = (sourceName: string, sourceType: string, sourceUrl: string, sourceData: Record<string, unknown>) => {
    if (!sourceUrl || seen.has(sourceUrl) || sources.length >= limit) return;
    seen.add(sourceUrl);
    sources.push({ sourceName, sourceType, sourceUrl, sourceData });
  };

  for (const r of resources) {
    const sourceName = r.sourceLabel || r.source || 'unknown';
    if (r.magnet) {
      push(sourceName, 'magnet', r.magnet, {
        name: r.title,
        size: r.size,
        date: r.date,
        seeders: r.seeders,
        leechers: r.leechers,
        group: r.group,
        trusted: r.trusted,
      });
    }
    if (r.driveUrl) {
      push(sourceName, r.resourceType || 'drive', r.driveUrl, {
        name: r.title,
        code: r.driveCode,
        size: r.size,
        date: r.date,
      });
    }
    if (r.detailUrl) {
      push(sourceName, 'detail', r.detailUrl, { name: r.title });
    }
  }

  return sources;
}

// ─── 动漫磁力资源 → 来源条目 ─────────────────────────────────────────
// 优先取 grouped 中首条作品的关联磁力（精准归属），无归组时 fallback 到全部磁力前 20 条
function animeResourcesToSources(
  result: Record<string, unknown>,
  firstBgmId: number
): SourceEntry[] {
  const grouped = result.grouped as AnimeGrouped | undefined;
  const nyaa = (result.nyaa as Array<{ title: string; magnet: string; size?: string; date?: string; seeders?: number; leechers?: number; trusted?: boolean }> | undefined) || [];
  const mikan = (result.mikan as Array<{ title: string; magnet: string; size?: string; pubDate?: string; group?: string }> | undefined) || [];
  const animetosho = (result.animetosho as Array<{ title: string; magnet: string; size?: string; date?: string; seeders?: number; leechers?: number }> | undefined) || [];
  const dmhy = (result.dmhy as Array<{ title: string; magnet: string; size?: string; pubDate?: string; group?: string; detailUrl?: string }> | undefined) || [];

  // 优先用归组数据：取首条作品关联的磁力
  if (grouped?.groups?.length) {
    const firstGroup = grouped.groups.find((g) => g.subject.id === firstBgmId);
    if (firstGroup?.resources?.length) {
      return mediaResourcesToSources(firstGroup.resources, 30);
    }
  }

  // fallback：合并所有磁力源前 20 条（去重 magnet）
  const merged: MediaResourceLike[] = [
    ...nyaa.slice(0, 10).map((n) => ({ ...n, sourceLabel: 'Nyaa' })),
    ...mikan.slice(0, 5).map((m) => ({
      title: m.title,
      magnet: m.magnet,
      size: m.size,
      date: m.pubDate,
      group: m.group,
      sourceLabel: 'Mikan',
    })),
    ...animetosho.slice(0, 5).map((a) => ({ ...a, sourceLabel: 'AnimeTosho' })),
    ...dmhy.slice(0, 5).map((d) => ({
      title: d.title,
      magnet: d.magnet,
      size: d.size,
      date: d.pubDate,
      group: d.group,
      detailUrl: d.detailUrl,
      sourceLabel: 'DMHY',
    })),
  ];

  return mediaResourcesToSources(merged, 20);
}

// ─── 影视资源 → 来源条目 ─────────────────────────────────────────────

/**
 * 只写入「当前记录所属作品」的归组资源。
 * 不能拿全部 resources 兜底：那会把其它作品的磁力错挂到首条作品上。
 */
function movieResourcesToSources(result: Record<string, unknown>, subjectId: number): SourceEntry[] {
  const grouped = result.grouped as MovieGrouped | undefined;
  const group = grouped?.groups?.find((g) => g.subject?.id === subjectId);
  return mediaResourcesToSources(group?.resources ?? [], 30);
}

// ═════════════════════════════════════════════════════════════════════
// 公开 API
// ═════════════════════════════════════════════════════════════════════

/**
 * 主入口：从搜索结果提取并落库。
 * - 列表型结果采首条完整元数据 + 所有磁力资源写入 sources 表
 * - JAV 番号搜索返回完整详情，首采即 detail_completed=1
 *
 * 容错：任何异常只 console.error，不抛出（搜索路由用 waitUntil 异步调用）。
 */
export async function persistDataRecord(
  db: D1Database,
  result: Record<string, unknown>
): Promise<void> {
  try {
    const resultType = result.resultType as string | undefined;
    if (!resultType) return;

    let payload: RecordPayload | null = null;
    let sources: SourceEntry[] = [];
    let javDetail: JavDetail | null = null;

    switch (resultType) {
      case 'jav': {
        // JAV 番号搜索：result.detail 存在则为完整详情
        const detail = result.detail as JavDetail | undefined;
        if (detail && detail.code && detail.title) {
          const magnets = (result.magnets as MagnetItem[] | undefined) || [];
          const magnetFetchFailed = result.magnetFetchFailed === true;
          const resolvedCover = resolveJavCover(detail.cover);
          javDetail = detail;
          payload = {
            recordType: 'jav',
            dedupKey: `jav:${detail.code}`,
            title: detail.title,
            cover: resolvedCover,
            code: detail.code,
            actors: detail.actresses?.length ? JSON.stringify(detail.actresses) : undefined,
            duration: detail.duration,
            releaseDate: detail.releaseDate,
            publisher: detail.publisher,
            tags: detail.tags,
            contentData: {
              ...detail,
              cover: resolvedCover,
              // 磁力只写 data_record_sources（唯一事实源），避免同一批磁力在
              // content_data 与子表双份存储；详情读取走 library-detail 的 sources 查询
            },
            // 首采只做保守判断，落库后由 applyJavDetailSuccess 按真实来源数复核
            detailCompleted:
              !magnetFetchFailed && computeMissingMask(detail, magnetCountOf(magnets)) === 0 ? 1 : 0,
          };
          sources = magnetsToSources(magnets, detail.detailUrl);
          break;
        }
        // JAV 女优搜索：result.actresses[] 列表，采首条
        const actresses = result.actresses as ActressItem[] | undefined;
        const first = actresses?.[0];
        if (first && first.id && first.name) {
          payload = {
            recordType: 'actress',
            dedupKey: `actress:${first.id}`,
            title: first.name,
            cover: first.cover,
            code: first.id,
            actors: first.name,
            tags: first.tags,
            contentData: {
              id: first.id,
              name: first.name,
              cover: first.cover,
              ruby: first.ruby,
              romaji: first.romaji,
              tags: first.tags,
            },
            detailCompleted: 0,
          };
        }
        break;
      }
      case 'anime': {
        const bgm = result.bgm as BgmItem[] | undefined;
        const first = bgm?.[0];
        if (first && first.id) {
          // 提取该作品关联的磁力资源
          sources = animeResourcesToSources(result, first.id);

          payload = {
            recordType: 'anime',
            dedupKey: `anime:bgm:${first.id}`,
            title: first.nameCN || first.name,
            cover: first.cover,
            code: `bgm:${first.id}`,
            publisher: first.studio,
            tags: first.tags,
            rating: first.rating != null ? `${first.rating} 分` : undefined,
            contentData: {
              // 完整 bgm 元数据（含 url/type/status/collection 等明细字段）
              ...first,
              // 磁力资源摘要（详情进 sources 表，这里存摘要供前端快速预览）
              magnetCount: sources.length,
              magnets: sources.slice(0, 10).map((s) => ({
                name: (s.sourceData as { name?: string }).name,
                source: s.sourceName,
                size: (s.sourceData as { size?: string }).size,
              })),
            },
            detailCompleted: 0,
          };
        }
        break;
      }
      case 'movie': {
        const results = result.results as MovieItem[] | undefined;
        const first = results?.find((r) => r && typeof r.id === 'number');
        if (first) {
          const release = first.releaseDate || first.release_date || first.first_air_date;
          // 只用归组中「当前作品」的资源：全部资源兜底会把别的作品磁力错挂过来
          sources = movieResourcesToSources(result, first.id);

          payload = {
            recordType: 'movie',
            dedupKey: `movie:tmdb:${first.id}`,
            title: first.title,
            cover: first.poster || undefined,
            code: `tmdb:${first.id}`,
            releaseDate: release,
            rating: (first.rating ?? first.vote_average) != null
              ? `${first.rating ?? first.vote_average} 分`
              : undefined,
            contentData: {
              // 完整 TMDB 元数据（含 overview/originalTitle/backdrop/voteCount 等明细）
              ...first,
              magnetCount: sources.length,
              magnets: sources.slice(0, 10).map((s) => ({
                name: (s.sourceData as { name?: string }).name,
                source: s.sourceName,
                size: (s.sourceData as { size?: string }).size,
              })),
            },
            detailCompleted: 0,
          };
        }
        break;
      }
      case 'manga': {
        const manga = result.manga as MangaItem[] | undefined;
        const first = manga?.[0];
        if (first && first.id) {
          // MangaDex 详情页作为唯一来源：否则 source_count=0 会在 180 天后被清理
          sources = [{
            sourceName: 'MangaDex',
            sourceType: 'detail',
            sourceUrl: `https://mangadex.org/title/${first.id}`,
            sourceData: { title: first.title },
          }];
          payload = {
            recordType: 'manga',
            dedupKey: `manga:${first.id}`,
            title: first.title,
            cover: first.cover,
            code: first.id,
            tags: first.tags,
            contentData: {
              id: first.id,
              title: first.title,
              cover: first.cover,
              status: first.status,
              tags: first.tags,
            },
            detailCompleted: 0,
          };
        }
        break;
      }
      case 'novel': {
        const novels = result.novels as NovelItem[] | undefined;
        if (!novels || novels.length === 0) break;

        // 抓取源：知轩藏书 + 奇书网；多源跳转卡片由 search_sources 表注入，不在此处理
        const first = novels.find((n) => n && n.id) || novels[0];
        if (!first) break;

        const tags = [first.format, first.year, first.category].filter(Boolean) as string[];

        // 详情/下载链接作为来源
        if (first.detailUrl) {
          sources.push({
            sourceName: first.source || '知轩藏书',
            sourceType: 'download',
            sourceUrl: first.detailUrl,
            sourceData: {
              title: first.title,
              format: first.format,
              size: first.size,
              source: first.source,
            },
          });
        }

        // 两个站点 id 都是纯数字，必须带站点前缀，否则跨站碰撞会合并成同一条记录
        const siteKey = first.source === '奇书网' ? 'qishu' : 'zxcs';
        payload = {
          recordType: 'novel',
          dedupKey: `novel:${siteKey}:${first.id}`,
          title: first.title,
          cover: first.cover,
          code: first.id,
          actors: first.author,
          publisher: first.publisher,
          tags,
          contentData: {
            // 完整小说元数据（含 description/detailUrl/language/size 等明细）
            ...first,
          },
          detailCompleted: 0,
        };
        break;
      }
    }

    if (!payload) return;

    const recordId = await upsertRecord(db, payload);
    if (recordId && sources.length) {
      await insertSources(db, recordId, sources);
    }
    // 按库中真实磁力来源数复核完整度，避免「抓过详情 = 完整」的历史误判
    if (recordId && javDetail) {
      await applyJavDetailSuccess(db, recordId, javDetail, {
        magnetFetchFailed: result.magnetFetchFailed === true,
      });
    }
  } catch (err) {
    console.error('[data-storage] persistDataRecord error:', err);
  }
}

/**
 * 详情补充：用户查看 JAV 详情 / 榜单补全 / 管理批量任务共用。
 * 成功时更新记录并补充磁力来源；失败时只更新 jav_detail_meta 的重试状态，
 * 不动业务字段。暂时失败与源站缺失（NOT_FOUND）分开处理。
 */
export async function enrichDataRecordFromDetail(
  db: D1Database,
  input: {
    detail?: JavDetail;
    magnets?: MagnetItem[];
    /** 详情页抓取失败时的错误码；有值表示本次没有拿到详情 */
    error?: string;
    /** 详情页成功但磁力 Ajax 失败 */
    magnetFetchFailed?: boolean;
    /** 没有 detail 时用于定位已有记录的番号 */
    code?: string;
    /**
     * 明确要更新的记录 ID（批量任务逐条处理时传入）。
     * 历史记录可能使用非 `jav:<code>` 的 dedup_key，仅按 dedup_key 反查会漏更新、
     * 误判失败类型，甚至插入重复记录，因此已知 ID 时优先按 ID 定位。
     */
    recordId?: string;
  }
): Promise<void> {
  try {
    const d = input.detail;
    const code = d?.code ?? input.code;
    if (!code) return;

    const dedupKey = `jav:${code}`;
    const existing = input.recordId
      ? { id: input.recordId }
      : await db
          .prepare('SELECT id FROM data_records WHERE record_type = ? AND dedup_key = ?')
          .bind('jav', dedupKey)
          .first<{ id: string }>();

    // 失败路径：只更新重试元数据，不动业务字段
    if (!d || !d.title) {
      if (!existing) return;
      if (input.error === 'NOT_FOUND') {
        await applyJavDetailAbsent(db, existing.id, 'NOT_FOUND');
      } else if (input.error) {
        await applyJavDetailTransientFailure(db, existing.id, input.error);
      }
      return;
    }

    const magnets = input.magnets || [];
    const resolvedCover = resolveJavCover(d.cover);
    const now = Date.now();

    // 磁力只写 data_record_sources（唯一事实源），content_data 不再重复存一份
    const contentData = {
      ...d,
      cover: resolvedCover,
    };

    let recordId = existing?.id;
    if (recordId) {
      // 已存在：补充详情字段；完整度稍后由 applyJavDetailSuccess 统一判定
      await db
        .prepare(
          `UPDATE data_records
             SET title = ?, cover = COALESCE(?, cover), actors = ?,
                 duration = COALESCE(?, duration), release_date = COALESCE(?, release_date),
                 publisher = COALESCE(?, publisher), tags = ?, content_data = ?,
                 detail_completed = 0, last_updated_at = ?
           WHERE id = ?`
        )
        .bind(
          d.title,
          resolvedCover ?? null,
          d.actresses?.length ? JSON.stringify(d.actresses) : null,
          d.duration ?? null,
          d.releaseDate ?? null,
          d.publisher ?? null,
          JSON.stringify(d.tags || []),
          JSON.stringify(contentData),
          now,
          recordId
        )
        .run()
        .catch((e) => console.error('[data-storage] enrich update error:', e));
    } else {
      // 不存在：新建记录，detail_completed 先置 0，随后统一复核
      recordId = generateId();
      await db
        .prepare(
          `INSERT INTO data_records
             (id, record_type, dedup_key, title, cover, code, actors, duration,
              release_date, publisher, tags, rating, content_data, detail_completed,
              status, source_count, first_seen_at, last_updated_at)
           VALUES (?, 'jav', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, 'active', 0, ?, ?)`
        )
        .bind(
          recordId,
          dedupKey,
          d.title,
          resolvedCover ?? null,
          d.code,
          d.actresses?.length ? JSON.stringify(d.actresses) : null,
          d.duration ?? null,
          d.releaseDate ?? null,
          d.publisher ?? null,
          JSON.stringify(d.tags || []),
          JSON.stringify(contentData),
          now,
          now
        )
        .run()
        .catch((e) => console.error('[data-storage] enrich insert error:', e));
    }

    await insertSources(db, recordId, magnetsToSources(magnets, d.detailUrl));
    await applyJavDetailSuccess(db, recordId, d, {
      magnetFetchFailed: input.magnetFetchFailed,
    });
  } catch (err) {
    console.error('[data-storage] enrichDataRecordFromDetail error:', err);
  }
}
