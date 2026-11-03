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
import type { MagnetItem } from './jav-utils';

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

/** 动漫统一磁力资源（nyaa/mikan/animetosho/showrss 归一化） */
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
  // 逐条 INSERT OR IGNORE（触发器自动维护 source_count，仅新增时计数+1）
  await Promise.all(
    sources.map((s) =>
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
        .run()
        .catch((e) => console.error('[data-storage] insertSource error:', e))
    )
  );
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
 * 写入主记录：首写优先（INSERT OR IGNORE 保留 first_seen_at）。
 * 返回记录 id；若已存在则顺带节流更新 last_updated_at（5 分钟内不重复更新，减少写放大）。
 */
async function upsertRecord(db: D1Database, payload: RecordPayload): Promise<string | null> {
  const now = Date.now();
  const id = generateId();
  const tagsJson = JSON.stringify(payload.tags || []);

  await db
    .prepare(
      `INSERT OR IGNORE INTO data_records
         (id, record_type, dedup_key, title, cover, code, actors, duration,
          release_date, publisher, tags, rating, content_data, detail_completed,
          status, source_count, first_seen_at, last_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`
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
      now
    )
    .run()
    .catch((e) => console.error('[data-storage] upsertRecord error:', e));

  // 查询实际记录 id（可能是刚插入的，也可能是已存在的）
  const row = await db
    .prepare('SELECT id FROM data_records WHERE record_type = ? AND dedup_key = ?')
    .bind(payload.recordType, payload.dedupKey)
    .first<{ id: string }>()
    .catch((e) => {
      console.error('[data-storage] lookupRecord error:', e);
      return null;
    });

  if (!row) return null;

  // 节流更新 last_updated_at：仅当距上次更新超过 5 分钟时刷新，避免热点资源每次搜索都写
  const throttleMs = 5 * 60 * 1000;
  await db
    .prepare('UPDATE data_records SET last_updated_at = ? WHERE id = ? AND last_updated_at < ?')
    .bind(now, row.id, now - throttleMs)
    .run()
    .catch((e) => console.error('[data-storage] touchRecord error:', e));

  return row.id;
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

// ─── 动漫磁力资源 → 来源条目 ─────────────────────────────────────────
// 优先取 grouped 中首条作品的关联磁力（精准归属），fallback 到全部磁力前 20 条
function animeResourcesToSources(
  result: Record<string, unknown>,
  firstBgmId: number
): SourceEntry[] {
  const grouped = result.grouped as AnimeGrouped | undefined;
  const nyaa = (result.nyaa as Array<{ title: string; magnet: string; size?: string; date?: string; seeders?: number; leechers?: number; trusted?: boolean }> | undefined) || [];
  const mikan = (result.mikan as Array<{ title: string; magnet: string; size?: string; pubDate?: string; group?: string }> | undefined) || [];
  const animetosho = (result.animetosho as Array<{ title: string; magnet: string; size?: string; date?: string; seeders?: number; leechers?: number }> | undefined) || [];
  const showrss = (result.showrss as Array<{ title: string; magnet: string }> | undefined) || [];

  // 优先用归组数据：取首条作品关联的磁力
  if (grouped?.groups?.length) {
    const firstGroup = grouped.groups.find((g) => g.subject.id === firstBgmId);
    if (firstGroup?.resources?.length) {
      return firstGroup.resources
        .filter((r) => r.magnet)
        .slice(0, 30)
        .map((r) => ({
          sourceName: r.sourceLabel || r.source || 'unknown',
          sourceType: 'magnet',
          sourceUrl: r.magnet,
          sourceData: {
            name: r.title,
            size: r.size,
            date: r.date,
            seeders: r.seeders,
            leechers: r.leechers,
            group: r.group,
            trusted: r.trusted,
          },
        }));
    }
  }

  // fallback：合并所有磁力源前 20 条（去重 magnet）
  const seen = new Set<string>();
  const sources: SourceEntry[] = [];
  const pushMagnet = (sourceName: string, item: { title: string; magnet: string; size?: string; date?: string | undefined; }) => {
    if (!item.magnet || seen.has(item.magnet)) return;
    seen.add(item.magnet);
    sources.push({
      sourceName,
      sourceType: 'magnet',
      sourceUrl: item.magnet,
      sourceData: { name: item.title, size: item.size, date: item.date },
    });
  };

  for (const n of nyaa.slice(0, 10)) pushMagnet('Nyaa', n);
  for (const m of mikan.slice(0, 5)) pushMagnet('Mikan', { title: m.title, magnet: m.magnet, size: m.size, date: m.pubDate });
  for (const a of animetosho.slice(0, 5)) pushMagnet('AnimeTosho', a);
  for (const s of showrss.slice(0, 3)) pushMagnet('showRSS', s);

  return sources.slice(0, 20);
}

// ─── 影视磁力资源 → 来源条目 ─────────────────────────────────────────

function movieResourcesToSources(result: Record<string, unknown>): SourceEntry[] {
  const resources = (result.resources as MovieResourceItem[] | undefined) || [];
  const seen = new Set<string>();
  const sources: SourceEntry[] = [];

  for (const r of resources.slice(0, 30)) {
    // 磁力链接
    if (r.magnet && !seen.has(r.magnet)) {
      seen.add(r.magnet);
      sources.push({
        sourceName: r.sourceLabel || r.source || 'unknown',
        sourceType: 'magnet',
        sourceUrl: r.magnet,
        sourceData: { name: r.title, size: r.size, date: r.date },
      });
    }
    // 网盘链接
    if (r.driveUrl && !seen.has(r.driveUrl)) {
      seen.add(r.driveUrl);
      sources.push({
        sourceName: r.sourceLabel || r.source || 'unknown',
        sourceType: r.resourceType || 'drive',
        sourceUrl: r.driveUrl,
        sourceData: { name: r.title, code: r.driveCode, size: r.size, date: r.date },
      });
    }
    // 详情页直链
    if (r.detailUrl && !seen.has(r.detailUrl)) {
      seen.add(r.detailUrl);
      sources.push({
        sourceName: r.sourceLabel || r.source || 'unknown',
        sourceType: 'detail',
        sourceUrl: r.detailUrl,
        sourceData: { name: r.title },
      });
    }
  }

  return sources;
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

    switch (resultType) {
      case 'jav': {
        // JAV 番号搜索：result.detail 存在则为完整详情
        const detail = result.detail as JavDetail | undefined;
        if (detail && detail.code && detail.title) {
          const magnets = (result.magnets as MagnetItem[] | undefined) || [];
          const resolvedCover = resolveJavCover(detail.cover);
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
              magnets: magnets.map((m) => ({
                name: m.name,
                magnet: m.magnet,
                size: m.size,
                date: m.date,
                isHD: m.isHD,
              })),
            },
            detailCompleted: 1,
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
          // 提取磁力/网盘资源
          sources = movieResourcesToSources(result);

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

        // 优先取 Anna's Archive 结果（source !== '奇书网'）
        // fallback：若 Anna 全部失败（如 403），取奇书网置顶结果
        const first = novels.find((n) => n && n.id && n.source !== '奇书网') || novels[0];
        if (!first) break;

        const tags = [first.format, first.year, first.category].filter(Boolean) as string[];

        // 详情/下载链接作为来源
        if (first.detailUrl) {
          sources.push({
            sourceName: first.source || (first.source === '奇书网' ? '奇书网' : "Anna's Archive"),
            sourceType: first.source === '奇书网' ? 'download' : 'detail',
            sourceUrl: first.detailUrl,
            sourceData: {
              title: first.title,
              format: first.format,
              size: first.size,
              source: first.source,
            },
          });
        }

        payload = {
          recordType: 'novel',
          dedupKey: `novel:${first.id}`,
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
  } catch (err) {
    console.error('[data-storage] persistDataRecord error:', err);
  }
}

/**
 * 详情补充：用户查看 JAV 详情时，用完整数据更新/新建记录并补充磁力来源。
 * 即使搜索时已采集，detail 接口可能拿到更新的磁力，故始终合并来源（INSERT OR IGNORE 去重）。
 *
 * 当前仅 JAV 有独立详情接口；后续其他类型新增详情接口时可扩展。
 */
export async function enrichDataRecordFromDetail(
  db: D1Database,
  detail: { detail: JavDetail; magnets?: MagnetItem[] }
): Promise<void> {
  try {
    const d = detail.detail;
    if (!d?.code || !d?.title) return;

    const magnets = detail.magnets || [];
    const resolvedCover = resolveJavCover(d.cover);
    const dedupKey = `jav:${d.code}`;
    const now = Date.now();

    // 查是否已存在
    const existing = await db
      .prepare('SELECT id, detail_completed FROM data_records WHERE record_type = ? AND dedup_key = ?')
      .bind('jav', dedupKey)
      .first<{ id: string; detail_completed: number }>();

    const contentData = {
      ...d,
      cover: resolvedCover,
      magnets: magnets.map((m) => ({
        name: m.name,
        magnet: m.magnet,
        size: m.size,
        date: m.date,
        isHD: m.isHD,
      })),
    };

    if (existing) {
      // 已存在：补充完整详情（若未完成）+ 刷新 last_updated_at
      await db
        .prepare(
          `UPDATE data_records
             SET title = ?, cover = COALESCE(?, cover), actors = ?,
                 duration = COALESCE(?, duration), release_date = COALESCE(?, release_date),
                 publisher = COALESCE(?, publisher), tags = ?, content_data = ?,
                 detail_completed = 1, last_updated_at = ?
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
          existing.id
        )
        .run()
        .catch((e) => console.error('[data-storage] enrich update error:', e));

      await insertSources(db, existing.id, magnetsToSources(magnets, d.detailUrl));
    } else {
      // 不存在：直接新建完整记录
      const id = generateId();
      await db
        .prepare(
          `INSERT INTO data_records
             (id, record_type, dedup_key, title, cover, code, actors, duration,
              release_date, publisher, tags, rating, content_data, detail_completed,
              status, source_count, first_seen_at, last_updated_at)
           VALUES (?, 'jav', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 'active', 0, ?, ?)`
        )
        .bind(
          id,
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

      await insertSources(db, id, magnetsToSources(magnets, d.detailUrl));
    }
  } catch (err) {
    console.error('[data-storage] enrichDataRecordFromDetail error:', err);
  }
}
