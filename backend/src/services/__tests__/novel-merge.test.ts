/**
 * 小说跨站合并与封面补齐测试。
 *
 * 合并规则的核心是「书名 + 作者同时相等」，只按书名会误合并同名作品；
 * 这条约束一旦放宽，用户会在一条记录里看到两本不同的书。
 */
import { describe, it, expect } from 'vitest';
import { novelTitleKey, mergeNovelItems, applyDoubanCovers, type NovelItem } from '@/services/novel-search';


const base: NovelItem = {
  id: '1',
  title: '',
  author: '',
  cover: '',
  description: '',
  publisher: '',
  format: 'TXT',
  language: '中文',
  size: '',
  year: '',
  category: '',
  source: '知轩藏书',
  detailUrl: 'https://download.zxcs.zip/a.txt',
};

describe('novelTitleKey', () => {
  it('抹平标点、空白与全半角差异', () => {
    expect(novelTitleKey('《三体》')).toBe(novelTitleKey('三体'));
    expect(novelTitleKey('Ｓａｎ Ｔｉ')).toBe(novelTitleKey('san ti'));
  });

  it('不会把续作合并成同一个 key', () => {
    expect(novelTitleKey('三体')).not.toBe(novelTitleKey('三体Ⅱ'));
  });
});

describe('mergeNovelItems', () => {
  it('书名与作者都相同时合并，另一站成为镜像', () => {
    const items: NovelItem[] = [
      { ...base, id: '1', title: '三体', author: '刘慈欣', detailUrl: 'https://zxcs/a.txt' },
      { ...base, id: '2', title: '三体', author: '刘慈欣', source: '奇书网', detailUrl: 'https://qishu/b.txt', size: '2MB' },
    ];
    const merged = mergeNovelItems(items);
    expect(merged).toHaveLength(1);
    expect(merged[0].detailUrl).toBe('https://zxcs/a.txt');
    expect(merged[0].mirrors).toEqual([
      { source: '奇书网', detailUrl: 'https://qishu/b.txt', size: '2MB', format: 'TXT' },
    ]);
  });

  it('作者不同不合并（同名不同书）', () => {
    const items: NovelItem[] = [
      { ...base, id: '1', title: '边城', author: '沈从文' },
      { ...base, id: '2', title: '边城', author: '另一个人' },
    ];
    expect(mergeNovelItems(items)).toHaveLength(2);
  });

  it('作者缺失时保守不合并', () => {
    const items: NovelItem[] = [
      { ...base, id: '1', title: '无名书', author: '' },
      { ...base, id: '2', title: '无名书', author: '' },
    ];
    expect(mergeNovelItems(items)).toHaveLength(2);
  });

  it('合并时补齐主条目缺失的封面与简介', () => {
    const items: NovelItem[] = [
      { ...base, id: '1', title: '三体', author: '刘慈欣', cover: '', description: '' },
      { ...base, id: '2', title: '三体', author: '刘慈欣', cover: 'http://img/x.jpg', description: '简介', source: '奇书网' },
    ];
    const merged = mergeNovelItems(items);
    expect(merged[0].cover).toBe('http://img/x.jpg');
    expect(merged[0].description).toBe('简介');
  });
});

describe('applyDoubanCovers', () => {
  it('按书名补封面，已有封面的不覆盖', () => {
    const items: NovelItem[] = [
      { ...base, id: '1', title: '三体' },
      { ...base, id: '2', title: '球状闪电', cover: 'http://keep/x.jpg' },
    ];
    const suggestions = new Map([
      [novelTitleKey('三体'), { pic: 'http://douban/3body.jpg', year: '2008' }],
      [novelTitleKey('球状闪电'), { pic: 'http://douban/ball.jpg' }],
    ]);
    const out = applyDoubanCovers(items, suggestions);
    expect(out[0].cover).toBe('http://douban/3body.jpg');
    expect(out[0].year).toBe('2008');
    expect(out[1].cover).toBe('http://keep/x.jpg');
  });

  it('没有建议时原样返回', () => {
    const items: NovelItem[] = [{ ...base, id: '1', title: '三体' }];
    expect(applyDoubanCovers(items, new Map())).toEqual(items);
  });
});
