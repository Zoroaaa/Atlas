/**
 * 本地存档 → 收藏载荷映射。
 *
 * 收藏 URL 由 favoriteUrl 统一生成，搜索页与本文件共用同一规则：
 * 同一资源若在两处生成不同 URL，会出现「搜索页显示已收藏、详情卡显示未收藏」并重复收藏。
 */

import type { AddFavoriteRequest } from '@/types';
import type { LibraryRecord } from '@/services/api/library';
import { javFavoriteUrl, mangaFavoriteUrl, movieFavoriteUrl } from './favoriteUrl';

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * 把本地库记录转换成收藏请求体。
 *
 * 返回 null 表示该记录缺少来源页 URL（例如个别动漫记录没有 bangumi 链接），
 * 调用方应隐藏收藏入口：把空 URL 传给后端只会得到校验错误。
 */
export function buildLibraryFavorite(record: LibraryRecord): AddFavoriteRequest | null {
  const extra = record.contentData;
  const tags = record.tags.join(', ') || undefined;
  const actors = record.actors.join(', ') || undefined;

  switch (record.recordType) {
    case 'jav': {
      const url = javFavoriteUrl(str(extra.detailUrl), record.code);
      if (!url) return null;
      return {
        title: record.title || record.code || url,
        url,
        cover: record.cover,
        code: record.code,
        actors,
        duration: record.duration,
        tags,
        releaseDate: record.releaseDate,
        publisher: record.publisher ?? str(extra.maker),
        keyword: record.code,
      };
    }
    case 'anime': {
      const url = str(extra.url);
      if (!url) return null;
      const name = str(extra.name);
      return {
        title: record.title,
        url,
        cover: record.cover,
        subtitle: name && name !== record.title ? name : undefined,
        tags,
        keyword: record.title,
      };
    }
    case 'movie': {
      const mediaType = str(extra.mediaType);
      const id = num(extra.id);
      if (!mediaType || id == null) return null;
      const originalTitle = str(extra.originalTitle);
      return {
        title: record.title,
        url: movieFavoriteUrl(mediaType, id),
        cover: record.cover,
        subtitle: originalTitle && originalTitle !== record.title ? originalTitle : undefined,
        // 影视没有独立标签字段，年份是收藏列表里唯一的筛选线索
        tags: str(extra.year) ?? tags,
        keyword: record.title,
      };
    }
    case 'manga': {
      const id = str(extra.id);
      if (!id) return null;
      return {
        title: record.title,
        url: mangaFavoriteUrl(id),
        cover: record.cover,
        tags,
        keyword: record.title,
      };
    }
    case 'novel': {
      const url = str(extra.detailUrl);
      if (!url) return null;
      const novelTags = [str(extra.format), str(extra.year), str(extra.category)].filter(Boolean).join(', ');
      return {
        title: record.title,
        url,
        cover: record.cover,
        code: str(extra.id) ? `md5:${str(extra.id)}` : undefined,
        actors: str(extra.author),
        publisher: record.publisher,
        tags: novelTags || undefined,
        keyword: record.title,
      };
    }
    default:
      return null;
  }
}
