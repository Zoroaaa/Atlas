/**
 * JavBus 类别词典同步
 *
 * 来源：https://www.javbus.com/genre 与 https://www.javbus.com/uncensored/genre
 * 策略：每个 section 独立判定；解析数低于门槛时整段放弃并保留旧行，
 *      两个 section 都失败时不推进任何 updated_at（下小时会重试）。
 */
import { GENRE_DICT } from '@/constants';
import { getHtml } from '@/services/jav-utils';
import { isTechnicalTag } from '@/services/tag-filter';
import { valueKey } from '@/services/recommendation-utils';
import {
  getGenreSectionStats,
  replaceSectionGenres,
  type GenreInsertRow,
  type GenreSection,
} from '@/repositories/genre-repository';

export interface ParsedGenre {
  name: string;
  nameKey: string;
  genreKey: string;
  section: GenreSection;
  url: string;
}

export interface GenreSyncResult {
  updated: number;
  sections: Record<GenreSection, 'updated' | 'skipped' | 'failed'>;
}

const GENRE_LINK_RE =
  /<a[^>]+href="(?:https?:\/\/www\.javbus\.com)?\/(uncensored\/)?genre\/([a-z0-9-]+)"[^>]*>([^<]+)<\/a>/gi;

/** 解析类别索引页；只保留指定 section 的链接，按名称去重 */
export function parseGenreIndex(html: string, section: GenreSection): ParsedGenre[] {
  if (!html) return [];
  const entries: ParsedGenre[] = [];
  const seen = new Set<string>();
  GENRE_LINK_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = GENRE_LINK_RE.exec(html)) !== null) {
    const linkSection: GenreSection = match[1] ? 'uncensored' : 'censored';
    if (linkSection !== section) continue;

    const genreKey = match[2].trim().toLowerCase();
    const name = match[3].replace(/<[^>]+>/g, '').trim();
    if (!genreKey || !name || name.length > 30) continue;

    const nameKey = valueKey(name);
    if (!nameKey || seen.has(nameKey)) continue;
    seen.add(nameKey);

    entries.push({
      name,
      nameKey,
      genreKey,
      section,
      url: section === 'censored'
        ? `https://www.javbus.com/genre/${genreKey}`
        : `https://www.javbus.com/uncensored/genre/${genreKey}`,
    });
  }

  return entries;
}

function isSectionDue(count: number, lastUpdatedAt: number, now: number): boolean {
  if (count <= 0) return true;
  return lastUpdatedAt < now - GENRE_DICT.SYNC_INTERVAL_MS;
}

async function syncSection(
  db: D1Database,
  section: GenreSection,
  now: number
): Promise<'updated' | 'skipped' | 'failed'> {
  const url = section === 'censored' ? GENRE_DICT.CENSORED_URL : GENRE_DICT.UNCENSORED_URL;
  const html = await getHtml(url, GENRE_DICT.FETCH_TIMEOUT_MS);
  if (!html) {
    console.warn(`[genre-dict] section=${section} fetch failed`);
    return 'failed';
  }

  const parsed = parseGenreIndex(html, section);
  if (parsed.length < GENRE_DICT.MIN_TAGS_PER_SECTION) {
    console.warn(
      `[genre-dict] section=${section} parsed=${parsed.length} < ${GENRE_DICT.MIN_TAGS_PER_SECTION} 放弃更新`
    );
    return 'skipped';
  }

  const rows: GenreInsertRow[] = parsed.map((entry, index) => ({
    id: `${entry.section}:${entry.nameKey}`,
    name_key: entry.nameKey,
    name: entry.name,
    genre_key: entry.genreKey,
    section: entry.section,
    url: entry.url,
    is_technical: isTechnicalTag(entry.name) ? 1 : 0,
    sort_order: index,
    created_at: now,
    updated_at: now,
  }));

  await replaceSectionGenres(db, section, rows);
  console.log(`[genre-dict] section=${section} updated=${rows.length}`);
  return 'updated';
}

/**
 * 按周同步词典；未到期时直接返回，零外部请求。
 * 先同步 censored，再同步 uncensored：同名标签以有码为准（name_key 全局唯一 + INSERT OR IGNORE）。
 */
export async function syncGenreDictionary(
  db: D1Database,
  now = Date.now()
): Promise<GenreSyncResult> {
  const stats = await getGenreSectionStats(db);
  const bySection = new Map(stats.map((stat) => [stat.section, stat]));

  const due = (['censored', 'uncensored'] as const).filter((section) => {
    const stat = bySection.get(section);
    return !stat || isSectionDue(stat.count, stat.last_updated_at, now);
  });

  const sections: GenreSyncResult['sections'] = {
    censored: 'skipped',
    uncensored: 'skipped',
  };
  let updated = 0;

  for (const section of due) {
    try {
      const result = await syncSection(db, section, now);
      sections[section] = result;
      if (result === 'updated') updated += 1;
    } catch (err) {
      console.error(`[genre-dict] section=${section} sync error:`, err);
      sections[section] = 'failed';
    }
  }

  return { updated, sections };
}
