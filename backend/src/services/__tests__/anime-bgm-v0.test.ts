/**
 * Bangumi v0 映射测试：夹具取自 2026-11-20 的真实响应（subject 400602）。
 *
 * 这条链路最容易在三个地方错：infobox 的 value 形态、rank 的位置、platform 到 type 的转换。
 * 用夹具锁住，避免以后换成"更规整"的写法时把别名丢掉。
 */
import { describe, it, expect } from 'vitest';
import { mapBgmV0Subject, type BgmV0Subject } from '@/services/anime-search';

const fixture: BgmV0Subject = {
  id: 400602,
  name: '葬送のフリーレン',
  name_cn: '葬送的芙莉莲',
  date: '2023-09-29',
  platform: 'TV',
  images: { large: 'https://lain.bgm.tv/pic/cover/l/x.jpg', common: 'https://lain.bgm.tv/pic/cover/c/x.jpg' },
  summary: '勇者一行击败魔王后的故事。',
  rating: { rank: 43, score: 8.5, total: 36937 },
  collection: { wish: 7254, collect: 56079, doing: 11940, dropped: 786 },
  eps: 28,
  total_episodes: 28,
  tags: [{ name: '治愈', count: 8184 }, { name: '公路片', count: 6571 }],
  infobox: [
    { key: '中文名', value: [{ v: '葬送的芙莉莲' }] },
    { key: '别名', value: [{ v: "Frieren: Beyond Journey's End" }, { v: 'Sousou no Frieren' }, { v: '葬送的芙莉蓮' }] },
    { key: '动画制作', value: [{ v: 'MADHOUSE' }] },
  ],
};

describe('mapBgmV0Subject', () => {
  it('抽出 infobox 别名，供归组匹配罗马音资源', () => {
    const subject = mapBgmV0Subject(fixture);
    expect(subject.aliases).toContain('Sousou no Frieren');
    expect(subject.aliases).toContain("Frieren: Beyond Journey's End");
  });

  it('别名不重复收录中文名与日文名', () => {
    const subject = mapBgmV0Subject(fixture);
    expect(subject.aliases?.includes('葬送的芙莉莲')).toBe(false);
    expect(subject.aliases?.includes('葬送のフリーレン')).toBe(false);
  });

  it('rank 取自 rating.rank，eps 取自 eps', () => {
    const subject = mapBgmV0Subject(fixture);
    expect(subject.rank).toBe(43);
    expect(subject.eps).toBe(28);
    expect(subject.rating).toBe(8.5);
  });

  it('platform 转成前端可识别的类型标签', () => {
    expect(mapBgmV0Subject(fixture).type).toBe('TV');
    expect(mapBgmV0Subject({ ...fixture, platform: 'Web' }).type).toBe('Web');
    expect(mapBgmV0Subject({ ...fixture, platform: 'OVA' }).type).toBe('OVA');
    expect(mapBgmV0Subject({ ...fixture, platform: '剧场版' }).type).toBe('movie');
  });

  it('infobox 的 value 是字符串时同样能取到', () => {
    const subject = mapBgmV0Subject({
      ...fixture,
      infobox: [{ key: '别名', value: 'Sousou no Frieren' }],
    });
    expect(subject.aliases).toEqual(['Sousou no Frieren']);
  });

  it('动画制作取 infobox，而不是恒为空', () => {
    expect(mapBgmV0Subject(fixture).studio).toBe('MADHOUSE');
  });
});
