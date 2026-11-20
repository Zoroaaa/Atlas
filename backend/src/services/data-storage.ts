/**
 * 数据存储管理：把搜索结果去重落库到 data_records / data_record_sources，积累本地数据资产。
 *
 * 约束：不保存用户个人信息；content_data 只存元数据，磁力/下载链接统一进 sources 表；
 * 列表类结果首采 detail_completed=0，JAV 番号走详情补全路径并按字段完整度判定。
 */
import { generateId } from '@/utils';
import type { JavEntityLink, MagnetItem } from './jav-utils';
import {
  applyJavDetailAbsent,
  applyJavDetailSuccess,
  applyJavDetailTransientFailure,
  magnetCountOf,
} from './jav-detail-meta';

// ── JAV 封面相对路径补全 ─────────────────────────────────────────────
// JavBus 返回的 cover 是相对路径（如 /pics/cover/9ho0_b.jpg），
// 落库时补全为完整 URL，避免前端展示时再处理。
function resolveJavCover(cover: string | undefined): string | undefined {
  if (!cover) return undefined;
  if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
  if (cover.startsWith('/')) return `https://www.javbus.com${cover}`;
  return cover;
}

// ── 类型：Provider 返回结构（局部定义，避免循环依赖） ────────────────

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
  /** 跨站合并后的其他下载入口 */
  mirrors?: Array<{ source: string; detailUrl: string; size?: string; format?: string }>;
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

// ── 内部：来源写入辅助 ──────────────────────────────────────────────

interface SourceEntry {
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  sourceData: Record<string, unknown>;
}

/** 批量写入来源表；(record_id, source_name, source_url) 冲突时只刷新 source_data。 */
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
        `INSERT INTO data_record_sources
           (id, record_id, source_name, source_type, source_url, source_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(record_id, source_name, source_url)
         DO UPDATE SET source_data = excluded.source_data`
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

// ── 内部：主记录 upsert ─────────────────────────────────────────────

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

// ── JAV 磁力 → 来源条目 ─────────────────────────────────────────────

/** 详情页 URL 记为 detail 来源，磁力逐条记为 magnet 来源；空磁力跳过。 */
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

// ── 媒体资源 → 来源条目（动漫/影视共用） ─────────────────────────────

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

// ── 动漫磁力资源 → 来源条目 ─────────────────────────────────────────
// 优先取 grouped 中首条作品的关联磁力（精准归属），无归组时 fallback 到全部磁力前 20 条
function animeResourcesToSources(
  result: Record<string, unknown>,
  firstBgmId: number,
  warnIfMissing = true,
): SourceEntry[] {
  const grouped = result.grouped as AnimeGrouped | undefined;
  const nyaa = (result.nyaa as Array<{ title: string; magnet: string; size?: string; date?: string; seeders?: number; leechers?: number; trusted?: boolean }> | undefined) || [];
  const mikan = (result.mikan as Array<{ title: string; magnet: string; size?: string; pubDate?: string; group?: string }> | undefined) || [];
  const animetosho = (result.animetosho as Array<{ title: string; magnet: string; size?: string; date?: string; seeders?: number; leechers?: number }> | undefined) || [];
  const dmhy = (result.dmhy as Array<{ title: string; magnet: string; size?: string; pubDate?: string; group?: string; detailUrl?: string }> | undefined) || [];

  // 只写入「当前作品」的归组资源。不能拿全部磁力兜底：
  // 那会把 other 作品的种子挂到首条作品上，详情页出现不相关内容（与影视侧策略一致）。
  const firstGroup = grouped?.groups?.find((g) => g.subject.id === firstBgmId);
  if (firstGroup?.resources?.length) {
    return mediaResourcesToSources(firstGroup.resources, 30);
  }

  // 只有本次搜索的首条作品值得告警：后面几条没有归组资源是正常现象（同一关键词下的次要作品），
  // 每条都警告会把日志刷满，反而看不到真正的问题。
  const dropped = nyaa.length + mikan.length + animetosho.length + dmhy.length;
  if (warnIfMissing && dropped > 0) {
    console.warn(`[data-storage] anime 资源无法归属到 bgm:${firstBgmId}，丢弃 ${dropped} 条磁力`);
  }
  return [];
}

// ── 影视资源 → 来源条目 ─────────────────────────────────────────────

/**
 * 只写入「当前记录所属作品」的归组资源。
 * 不能拿全部 resources 兜底：那会把其它作品的磁力错挂到首条作品上。
 */
function movieResourcesToSources(result: Record<string, unknown>, subjectId: number): SourceEntry[] {
  const grouped = result.grouped as MovieGrouped | undefined;
  const group = grouped?.groups?.find((g) => g.subject?.id === subjectId);
  return mediaResourcesToSources(group?.resources ?? [], 30);
}

// ── 公开 API ─────────────────────────────────────────────────────────

/**
 * 主入口：从搜索结果提取并落库。
 * - 列表型结果采首条完整元数据 + 所有磁力资源写入 sources 表
 * - JAV 番号结果转交 enrichDataRecordFromDetail，按字段完整度判定 detail_completed
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

    // 一次搜索写入整页结果，而不是只写首条。
    // 只写首条会让本地库永远等于"历史搜过的关键词数"，四类库存长期停在几百条，
    // 本地优先检索也就无从谈起；整页写入后每次搜索的入库量提升一个数量级。
    // 上限按类别设：单次搜索最多写这么多条，避免 D1 写放大。
    const writes: Array<{ payload: RecordPayload; sources: SourceEntry[] }> = [];

    switch (resultType) {
      case 'jav': {
        // JAV 番号搜索：result.detail 存在则为完整详情。
        // 搜索链路要求「近 3 个月外部源优先并更新本地，磁力一起新增/更新」，
        // 因此这里统一走 enrichDataRecordFromDetail（存在则更新、不存在则新建），
        // 而不是首写优先的 upsertRecord。
        const detail = result.detail as (JavDetail & { magnets?: MagnetItem[] }) | undefined;
        if (detail && detail.code && detail.title) {
          const { magnets: detailMagnets, ...detailFields } = detail;
          const magnets = detailMagnets ?? (result.magnets as MagnetItem[] | undefined) ?? [];
          await enrichDataRecordFromDetail(db, {
            detail: detailFields as JavDetail,
            magnets,
            magnetFetchFailed: result.magnetFetchFailed === true,
          });
          return;
        }
        // JAV 女优搜索：result.actresses[] 列表
        const actresses = result.actresses as ActressItem[] | undefined;
        for (const first of (actresses ?? []).slice(0, 10)) {
          if (!first?.id || !first.name) continue;
          writes.push({
            payload: {
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
            },
            sources: [],
          });
        }
        break;
      }
      case 'anime': {
        const bgm = result.bgm as BgmItem[] | undefined;
        for (const [index, subject] of (bgm ?? []).slice(0, 5).entries()) {
          if (!subject?.id) continue;
          // 只写「该作品名下」的归组资源：拿全部磁力兜底会把别的作品的种子挂过来
          const sources = animeResourcesToSources(result, subject.id, index === 0);
          writes.push({
            payload: {
              recordType: 'anime',
              dedupKey: `anime:bgm:${subject.id}`,
              title: subject.nameCN || subject.name,
              cover: subject.cover,
              code: `bgm:${subject.id}`,
              publisher: subject.studio,
              tags: subject.tags,
              rating: subject.rating != null ? `${subject.rating} 分` : undefined,
              contentData: {
                // 完整 bgm 元数据（含 url/type/status/collection 等明细字段）
                ...subject,
                // 磁力资源摘要（详情进 sources 表，这里存摘要供前端快速预览）
                magnetCount: sources.length,
                magnets: sources.slice(0, 10).map((s) => ({
                  name: (s.sourceData as { name?: string }).name,
                  source: s.sourceName,
                  size: (s.sourceData as { size?: string }).size,
                })),
              },
              detailCompleted: 0,
            },
            sources,
          });
        }
        break;
      }
      case 'movie': {
        const results = result.results as MovieItem[] | undefined;
        for (const item of (results ?? []).slice(0, 5)) {
          if (!item || typeof item.id !== 'number') continue;
          const release = item.releaseDate || item.release_date || item.first_air_date;
          // 只用归组中「当前作品」的资源：全部资源兜底会把别的作品磁力错挂过来
          const sources = movieResourcesToSources(result, item.id);
          writes.push({
            payload: {
              recordType: 'movie',
              dedupKey: `movie:tmdb:${item.id}`,
              title: item.title,
              cover: item.poster || undefined,
              code: `tmdb:${item.id}`,
              releaseDate: release,
              rating: (item.rating ?? item.vote_average) != null
                ? `${item.rating ?? item.vote_average} 分`
                : undefined,
              contentData: {
                // 完整 TMDB 元数据（含 overview/originalTitle/backdrop/voteCount 等明细）
                ...item,
                magnetCount: sources.length,
                magnets: sources.slice(0, 10).map((s) => ({
                  name: (s.sourceData as { name?: string }).name,
                  source: s.sourceName,
                  size: (s.sourceData as { size?: string }).size,
                })),
              },
              detailCompleted: 0,
            },
            sources,
          });
        }
        break;
      }
      case 'manga': {
        const manga = result.manga as MangaItem[] | undefined;
        for (const item of (manga ?? []).slice(0, 10)) {
          if (!item?.id) continue;
          // MangaDex 详情页作为唯一来源：否则 source_count=0 会在 180 天后被清理
          const sources: SourceEntry[] = [{
            sourceName: 'MangaDex',
            sourceType: 'detail',
            sourceUrl: `https://mangadex.org/title/${item.id}`,
            sourceData: { title: item.title },
          }];
          writes.push({
            payload: {
              recordType: 'manga',
              dedupKey: `manga:${item.id}`,
              title: item.title,
              cover: item.cover,
              code: item.id,
              tags: item.tags,
              contentData: {
                // 可读性字段一并入库，详情卡与本地检索都要用
                ...item,
              },
              detailCompleted: 0,
            },
            sources,
          });
        }
        break;
      }
      case 'novel': {
        const novels = result.novels as NovelItem[] | undefined;
        for (const first of (novels ?? []).slice(0, 10)) {
          if (!first?.id || !first.title) continue;
          const tags = [first.format, first.year, first.category].filter(Boolean) as string[];
          const sources: SourceEntry[] = [];

          // 详情/下载链接作为来源；跨站合并后的镜像站也是来源，一起落库，
          // 否则「另一站也有这本书」的信息在库里丢失，详情页只能显示一个入口。
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
          for (const mirror of first.mirrors ?? []) {
            if (!mirror.detailUrl || mirror.detailUrl === first.detailUrl) continue;
            sources.push({
              sourceName: mirror.source,
              sourceType: 'download',
              sourceUrl: mirror.detailUrl,
              sourceData: {
                title: first.title,
                format: mirror.format ?? first.format,
                size: mirror.size ?? first.size,
                source: mirror.source,
              },
            });
          }

          // 两个站点 id 都是纯数字，必须带站点前缀，否则跨站碰撞会合并成同一条记录
          const siteKey = first.source === '奇书网' ? 'qishu' : 'zxcs';
          writes.push({
            payload: {
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
            },
            sources,
          });
        }
        break;
      }
    }

    for (const write of writes) {
      const recordId = await upsertRecord(db, write.payload);
      if (recordId && write.sources.length) {
        await insertSources(db, recordId, write.sources);
      }
    }
  } catch (err) {
    console.error('[data-storage] persistDataRecord error:', err);
  }
}

// ── 详情回源合并 ─────────────────────────────────────────────────────

interface ExistingJavRow {
  id: string;
  title: string | null;
  cover: string | null;
  publisher: string | null;
  actors: string | null;
  tags: string | null;
  content_data: string | null;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : [];
  } catch {
    return [];
  }
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function readStringArray(source: Record<string, unknown>, key: string): string[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  return items.length > 0 ? items : undefined;
}

/** 多值字段存在时同步单值字段，避免 content_data 里 director/directors 不一致 */
function syncJoinedField(
  patch: Record<string, unknown>,
  arrayKey: string,
  singleKey: string
): void {
  const values = patch[arrayKey];
  if (!Array.isArray(values) || values.length === 0 || readString(patch, singleKey)) return;
  const joined = values
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .join(' / ');
  if (joined) patch[singleKey] = joined;
}

/**
 * 详情回源只覆盖「本次真正解析到」的字段。
 *
 * 源站结构变化、软 404、降级页时常只返回标题，其余字段为空；直接写回空值会清掉
 * 已补全的演员/标签/实体字段。完整度也必须按合并后的结果判定，否则本次残缺数据
 * 会把本来完整的记录误标成 partial。
 */
function mergeJavDetail(
  previous: ExistingJavRow | null,
  detail: JavDetail,
  resolvedCover: string | undefined
): {
  title: string;
  cover: string | undefined;
  publisher: string | undefined;
  actorsJson: string | null;
  tagsJson: string;
  content: Record<string, unknown>;
  detailForMask: {
    director?: string;
    maker?: string;
    publisher?: string;
    directors?: string[];
    makers?: string[];
    publishers?: string[];
  };
} {
  const prevContent = parseJsonObject(previous?.content_data);
  const prevActors = parseJsonStringArray(previous?.actors);
  const prevTags = parseJsonStringArray(previous?.tags);

  // parseJavDetail 在标题解析失败时会退化成番号，不能让它覆盖已有的真实标题
  const newTitle = detail.title?.trim();
  const titleFallback = !newTitle || newTitle === detail.code;
  const prevTitle = previous?.title?.trim();
  const keepPrevTitle = Boolean(titleFallback && prevTitle);
  const title = keepPrevTitle ? prevTitle! : (newTitle || detail.code);

  const cover = resolvedCover ?? previous?.cover ?? undefined;

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...detail, cover })) {
    if (key === 'title' && keepPrevTitle) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    patch[key] = value;
  }
  syncJoinedField(patch, 'directors', 'director');
  syncJoinedField(patch, 'makers', 'maker');
  syncJoinedField(patch, 'publishers', 'publisher');
  syncJoinedField(patch, 'seriesList', 'series');

  const content: Record<string, unknown> = { ...prevContent, ...patch };

  // 旧记录的发行商可能只落在结构化列里，content_data 没有；合并后仍算已有
  const prevPublisher = previous?.publisher?.trim();
  if (!readString(content, 'publisher') && prevPublisher) {
    content.publisher = prevPublisher;
  }

  const actresses = detail.actresses?.length ? detail.actresses : prevActors;
  const tags = detail.tags?.length ? detail.tags : prevTags;

  return {
    title,
    cover,
    publisher: readString(content, 'publisher'),
    actorsJson: actresses.length > 0 ? JSON.stringify(actresses) : null,
    tagsJson: JSON.stringify(tags),
    content,
    detailForMask: {
      director: readString(content, 'director'),
      maker: readString(content, 'maker'),
      publisher: readString(content, 'publisher'),
      directors: readStringArray(content, 'directors'),
      makers: readStringArray(content, 'makers'),
      publishers: readStringArray(content, 'publishers'),
    },
  };
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
    // 批量任务传入 recordId 时必须按 ID 定位：历史记录可能使用非 `jav:<code>` 的
    // dedup_key，按 dedup_key 反查会漏更新、误判失败类型甚至插入重复记录。
    const found = input.recordId
      ? await db
          .prepare(
            `SELECT id, title, cover, publisher, actors, tags, content_data
             FROM data_records WHERE id = ?`
          )
          .bind(input.recordId)
          .first<ExistingJavRow>()
      : await db
          .prepare(
            `SELECT id, title, cover, publisher, actors, tags, content_data
             FROM data_records WHERE record_type = ? AND dedup_key = ?`
          )
          .bind('jav', dedupKey)
          .first<ExistingJavRow>();
    // 传了 ID 但查不到时仍按该 ID 更新（影响 0 行），不能退回插入造成重复记录
    const existing = found ?? (input.recordId
      ? {
          id: input.recordId,
          title: null,
          cover: null,
          publisher: null,
          actors: null,
          tags: null,
          content_data: null,
        }
      : null);

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
    const merged = mergeJavDetail(existing, d, resolvedCover);

    let recordId = existing?.id;
    if (recordId) {
      // 已存在：只覆盖本次解析到的字段；完整度按合并结果判定
      await db
        .prepare(
          `UPDATE data_records
             SET title = ?, cover = ?, actors = ?,
                 duration = COALESCE(?, duration), release_date = COALESCE(?, release_date),
                 publisher = ?, tags = ?, content_data = ?,
                 detail_completed = 0, last_updated_at = ?
           WHERE id = ?`
        )
        .bind(
          merged.title,
          merged.cover ?? null,
          merged.actorsJson,
          d.duration ?? null,
          d.releaseDate ?? null,
          merged.publisher ?? null,
          merged.tagsJson,
          JSON.stringify(merged.content),
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
          merged.title,
          merged.cover ?? null,
          d.code,
          merged.actorsJson,
          d.duration ?? null,
          d.releaseDate ?? null,
          merged.publisher ?? null,
          merged.tagsJson,
          JSON.stringify(merged.content),
          now,
          now
        )
        .run()
        .catch((e) => console.error('[data-storage] enrich insert error:', e));
    }

    await insertSources(db, recordId, magnetsToSources(magnets, d.detailUrl));
    await applyJavDetailSuccess(db, recordId, merged.detailForMask, {
      magnetFetchFailed: input.magnetFetchFailed,
      // 刚写入的磁力数量已知，只有 0 条时才需要回查库存
      magnetCount: magnetCountOf(magnets),
    });
  } catch (err) {
    console.error('[data-storage] enrichDataRecordFromDetail error:', err);
  }
}
