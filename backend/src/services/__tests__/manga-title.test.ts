/**
 * 漫画标题/简介/可读性选取测试。
 *
 * 夹具取自 2026-11-20 的真实响应：subject b0b721ff（葬送的芙莉莲），
 * 它的 title 只有 {"ja-ro":"Sousou no Frieren"}，中文名只在 altTitles 的 zh-hk 里。
 * 这组断言锁住「中文用户不该看到罗马音」这条底线。
 */
import { describe, it, expect } from 'vitest';
import { pickMangaTitle, pickMangaDescription } from '@/services/manga-search';

describe('pickMangaTitle', () => {
  it('title 只有罗马音时，从 altTitles 取中文并转简体', () => {
    const title = { 'ja-ro': 'Sousou no Frieren' };
    const altTitles: Array<Record<string, string>> = [
      { en: "Frieren: Beyond Journey's End" },
      { ja: '葬送のフリーレン' },
      { 'zh-hk': '葬送的芙莉蓮' },
    ];
    expect(pickMangaTitle(title, altTitles)).toBe('葬送的芙莉莲');
  });

  it('title 自带 zh 时直接使用', () => {
    expect(pickMangaTitle({ zh: '进击的巨人', en: 'Attack on Titan' }, undefined)).toBe('进击的巨人');
  });

  it('没有中文时退到英文，而不是罗马音', () => {
    const title = { 'ja-ro': 'Shingeki no Kyojin' };
    const altTitles = [{ en: 'Attack on Titan' }];
    expect(pickMangaTitle(title, altTitles)).toBe('Attack on Titan');
  });

  it('多语言候选里优先 zh 而非 zh-hk', () => {
    const altTitles: Array<Record<string, string>> = [{ 'zh-hk': '鏈鋸人' }, { zh: '电锯人' }];
    expect(pickMangaTitle({ en: 'Chainsaw Man' }, altTitles)).toBe('电锯人');
  });

  it('完全没有中文/英文时保留罗马音（总比空标题好）', () => {
    expect(pickMangaTitle({ 'ja-ro': 'Sousou no Frieren' }, undefined)).toBe('Sousou no Frieren');
  });
});

describe('pickMangaDescription', () => {
  it('优先中文简介并转简体', () => {
    expect(pickMangaDescription({ 'zh-hk': '這是一個關於勇者的故事', en: 'A story' }))
      .toBe('这是一个关于勇者的故事');
  });

  it('没有中文时用英文', () => {
    expect(pickMangaDescription({ en: 'A story', ja: '物語' })).toBe('A story');
  });

  it('缺失时返回 undefined，不返回空串', () => {
    expect(pickMangaDescription(undefined)).toBeUndefined();
  });
});
