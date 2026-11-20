/**
 * 可操作判定测试：这组断言是「有结果但点不动不算成功」的口径来源，
 * 改动判定等于改动成功率指标，必须同步改这里。
 */
import { describe, it, expect } from 'vitest';
import {
  isAnimeResourceActionable,
  isMovieResourceActionable,
  isMangaActionable,
  isNovelActionable,
} from '@/services/search-actionable';

describe('isAnimeResourceActionable', () => {
  it('有 magnet 才算可操作', () => {
    expect(isAnimeResourceActionable({ magnet: 'magnet:?xt=urn:btih:abc' })).toBe(true);
  });

  it('空磁力（Mikan 超预算的条目）不算可操作', () => {
    expect(isAnimeResourceActionable({ magnet: '' })).toBe(false);
    expect(isAnimeResourceActionable({})).toBe(false);
  });
});

describe('isMovieResourceActionable', () => {
  it('磁力可操作', () => {
    expect(isMovieResourceActionable({ magnet: 'magnet:?xt=urn:btih:abc' })).toBe(true);
  });

  it('网盘链接可操作', () => {
    expect(isMovieResourceActionable({ driveUrl: 'https://pan.example.com/s/1' })).toBe(true);
  });

  it('只有详情页不算可操作', () => {
    expect(isMovieResourceActionable({})).toBe(false);
  });
});

describe('isMangaActionable', () => {
  it('已知章节数为 0 时不可操作（授权作品无章节）', () => {
    expect(isMangaActionable({ id: 'uuid', chapterCount: 0 })).toBe(false);
  });

  it('已知章节数大于 0 时可操作', () => {
    expect(isMangaActionable({ id: 'uuid', chapterCount: 12 })).toBe(true);
  });

  it('未接入可读性字段时退回「有页面」', () => {
    expect(isMangaActionable({ id: 'uuid' })).toBe(true);
  });
});

describe('isNovelActionable', () => {
  it('有下载直链才可操作', () => {
    expect(isNovelActionable({ detailUrl: 'https://download.zxcs.zip/x.txt', format: 'TXT' })).toBe(true);
  });

  it('详情页解析失败、无直链时不可操作', () => {
    expect(isNovelActionable({})).toBe(false);
  });
});
