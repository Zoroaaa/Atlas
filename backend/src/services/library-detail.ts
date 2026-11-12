/**
 * 本地库影片详情（只读）：从 data_records / data_record_sources 取回已采集的 JAV 详情，
 * 供"收藏分享到社区"等场景补齐磁力链接等信息。纯本地查询，不访问外部站点。
 */
import { inspectJavCode } from '@codeseek/shared/utils';
import type { JavEntityKind, JavEntityLink } from './jav-utils';

export interface LibraryMagnet {
  name: string;
  magnet: string;
  size?: string;
  date?: string;
  isHD?: boolean;
}

export interface LibraryJavDetail {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  duration?: string;
  publisher?: string;
  director?: string;
  maker?: string;
  series?: string;
  /** 多值原文（源站同一字段可能挂多个链接） */
  directors?: string[];
  makers?: string[];
  publishers?: string[];
  /** 实体链接：前端点击后查看该导演/制作商/发行商/系列的作品 */
  directorLinks?: JavEntityLink[];
  makerLinks?: JavEntityLink[];
  publisherLinks?: JavEntityLink[];
  seriesLinks?: JavEntityLink[];
  tags: string[];
  actresses: string[];
  detailUrl?: string;
  magnets: LibraryMagnet[];
}

export interface LibraryLookup {
  found: boolean;
  /** 详情是否已补全；false 表示只有列表级信息（磁力等可能缺失） */
  detailCompleted: boolean;
  detail?: LibraryJavDetail;
}

const MAX_MAGNETS = 20;

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  } catch {
    // 兼容逗号分隔的旧数据
  }
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

function pickString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function pickStringArray(source: Record<string, unknown>, key: string): string[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return list.length > 0 ? list : undefined;
}

/** content_data 里的实体链接（历史记录可能没有该字段，返回 undefined 交给前端懒解析） */
function pickEntityLinks(
  source: Record<string, unknown>,
  key: string,
  kind: JavEntityKind
): JavEntityLink[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) return undefined;
  const links: JavEntityLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const path = typeof entry.path === 'string' ? entry.path.trim() : '';
    if (!name || !path) continue;
    if (!links.some((link) => link.name === name)) links.push({ kind, name, path });
  }
  return links.length > 0 ? links : undefined;
}

export async function getLibraryJavDetail(db: D1Database, rawCode: string): Promise<LibraryLookup> {
  const info = inspectJavCode(rawCode);
  if (!info.recognized) return { found: false, detailCompleted: false };

  const record = await db
    .prepare(
      `SELECT id, title, cover, code, actors, duration, release_date, publisher, tags, content_data, detail_completed
       FROM data_records WHERE record_type = 'jav' AND dedup_key = ?`
    )
    .bind(`jav:${info.code}`)
    .first<{
      id: string; title: string; cover: string | null; code: string; actors: string | null;
      duration: string | null; release_date: string | null; publisher: string | null;
      tags: string | null; content_data: string | null; detail_completed: number;
    }>();
  if (!record) return { found: false, detailCompleted: false };

  let extra: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(record.content_data || '{}');
    if (parsed && typeof parsed === 'object') extra = parsed as Record<string, unknown>;
  } catch {
    // content_data 损坏时只用结构化列
  }

  const sources = await db
    .prepare(
      `SELECT source_type, source_url, source_data FROM data_record_sources
       WHERE record_id = ? AND source_type IN ('magnet', 'detail')
       ORDER BY created_at DESC, id`
    )
    .bind(record.id)
    .all<{ source_type: string; source_url: string | null; source_data: string | null }>();

  const magnets: LibraryMagnet[] = [];
  let detailUrl = pickString(extra, 'detailUrl');
  for (const row of sources.results || []) {
    if (!row.source_url) continue;
    if (row.source_type === 'detail') {
      detailUrl = detailUrl ?? row.source_url;
      continue;
    }
    if (!row.source_url.startsWith('magnet:') || magnets.length >= MAX_MAGNETS) continue;
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(row.source_data || '{}'); } catch { /* 忽略 */ }
    magnets.push({
      name: typeof data.name === 'string' && data.name ? data.name : record.code,
      magnet: row.source_url,
      size: typeof data.size === 'string' ? data.size : undefined,
      date: typeof data.date === 'string' ? data.date : undefined,
      isHD: typeof data.isHD === 'boolean' ? data.isHD : undefined,
    });
  }

  return {
    found: true,
    detailCompleted: record.detail_completed === 1,
    detail: {
      code: record.code,
      title: record.title,
      cover: record.cover ?? undefined,
      releaseDate: record.release_date ?? undefined,
      duration: record.duration ?? undefined,
      publisher: record.publisher ?? undefined,
      director: pickString(extra, 'director'),
      maker: pickString(extra, 'maker'),
      series: pickString(extra, 'series'),
      directors: pickStringArray(extra, 'directors'),
      makers: pickStringArray(extra, 'makers'),
      publishers: pickStringArray(extra, 'publishers') ?? (record.publisher ? [record.publisher] : undefined),
      directorLinks: pickEntityLinks(extra, 'directorLinks', 'director'),
      makerLinks: pickEntityLinks(extra, 'makerLinks', 'studio'),
      publisherLinks: pickEntityLinks(extra, 'publisherLinks', 'label'),
      seriesLinks: pickEntityLinks(extra, 'seriesLinks', 'series'),
      tags: parseList(record.tags),
      actresses: parseList(record.actors),
      detailUrl,
      magnets,
    },
  };
}
