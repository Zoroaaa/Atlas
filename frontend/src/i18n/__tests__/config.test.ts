import { describe, it, expect, afterEach, vi } from 'vitest';
import { mapBrowserLanguage, detectBrowserLanguage } from '../config';

describe('mapBrowserLanguage', () => {
  it.each([
    ['zh-CN', 'zh-CN'], ['zh', 'zh-CN'], ['zh-Hans', 'zh-CN'], ['zh-SG', 'zh-CN'],
    ['zh-TW', 'zh-TW'], ['zh-HK', 'zh-TW'], ['zh-Hant', 'zh-TW'], ['zh-Hant-TW', 'zh-TW'],
    ['en', 'en'], ['en-US', 'en'],
    ['ja', 'en'], ['ja-JP', 'en'], ['ko-KR', 'en'], ['fr', 'en'],
  ])('%s -> %s', (input, expected) => {
    expect(mapBrowserLanguage(input)).toBe(expected);
  });
});

describe('detectBrowserLanguage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the first preferred language; non-Chinese defaults to English', () => {
    vi.stubGlobal('navigator', { languages: ['ja-JP', 'zh-CN'], language: 'ja-JP' });
    expect(detectBrowserLanguage()).toBe('en');
    vi.stubGlobal('navigator', { languages: ['zh-TW', 'en'], language: 'zh-TW' });
    expect(detectBrowserLanguage()).toBe('zh-TW');
    vi.stubGlobal('navigator', { languages: [], language: 'zh-CN' });
    expect(detectBrowserLanguage()).toBe('zh-CN');
  });
});
