import { describe, it, expect } from 'vitest';
import { buildLibraryFavorite } from '../libraryFavorite';
import { isSameFavoriteUrl } from '../favoriteUrl';
import type { LibraryRecord, LibraryRecordType } from '@/services/api/library';

/** 只覆盖收藏映射关心的字段，其余给空默认值 */
const record = (
  recordType: LibraryRecordType,
  contentData: Record<string, unknown>,
  patch: Partial<LibraryRecord> = {}
): LibraryRecord => ({
  id: 'r1',
  recordType,
  title: '标题',
  actors: [],
  tags: [],
  detailCompleted: true,
  contentData,
  sources: [],
  firstSeenAt: 0,
  lastUpdatedAt: 0,
  ...patch,
});

describe('本地存档收藏映射', () => {
  it('JAV 优先用详情页 URL，缺失时回退 JavDB 搜索页', () => {
    expect(buildLibraryFavorite(record('jav', { detailUrl: 'https://www.javbus.com/ABP-123' }, { code: 'ABP-123' }))?.url)
      .toBe('https://www.javbus.com/ABP-123');
    expect(buildLibraryFavorite(record('jav', {}, { code: 'ABP-123' }))?.url)
      .toBe('https://javdb.com/search?q=ABP-123&f=all');
  });

  it('动漫 / 小说取来源页，漫画 / 影视按 id 拼接', () => {
    expect(buildLibraryFavorite(record('anime', { url: 'https://bgm.tv/subject/1' }))?.url)
      .toBe('https://bgm.tv/subject/1');
    expect(buildLibraryFavorite(record('manga', { id: 'abc' }))?.url)
      .toBe('https://mangadex.org/title/abc');
    expect(buildLibraryFavorite(record('movie', { mediaType: 'tv', id: 42 }))?.url)
      .toBe('https://www.themoviedb.org/tv/42');
    expect(buildLibraryFavorite(record('novel', { detailUrl: 'https://example.com/book/1' }))?.url)
      .toBe('https://example.com/book/1');
  });

  it('缺少来源页 URL 时返回 null，调用方据此隐藏收藏入口', () => {
    expect(buildLibraryFavorite(record('anime', {}))).toBeNull();
    expect(buildLibraryFavorite(record('manga', {}))).toBeNull();
    expect(buildLibraryFavorite(record('movie', { mediaType: 'movie' }))).toBeNull();
    expect(buildLibraryFavorite(record('novel', {}))).toBeNull();
  });

  it('把演员、标签等元数据一并带入收藏，收藏列表才有筛选线索', () => {
    const payload = buildLibraryFavorite(record('jav', { maker: '厂商A' }, {
      code: 'ABP-123',
      actors: ['女優A'],
      tags: ['巨乳', '单体'],
      publisher: '发行商A',
    }));
    expect(payload).toMatchObject({
      code: 'ABP-123',
      actors: '女優A',
      tags: '巨乳, 单体',
      publisher: '发行商A',
      keyword: 'ABP-123',
    });
  });
});

describe('收藏 URL 判定', () => {
  it('忽略 query、hash 与末尾斜杠差异', () => {
    expect(isSameFavoriteUrl('https://bgm.tv/subject/1?from=search', 'https://bgm.tv/subject/1')).toBe(true);
    expect(isSameFavoriteUrl('https://bgm.tv/subject/1/', 'https://bgm.tv/subject/1')).toBe(true);
  });

  it('不同 id 或不同站点不算同一资源', () => {
    expect(isSameFavoriteUrl('https://bgm.tv/subject/12', 'https://bgm.tv/subject/1')).toBe(false);
    expect(isSameFavoriteUrl('https://example.com/subject/1', 'https://bgm.tv/subject/1')).toBe(false);
  });
});
