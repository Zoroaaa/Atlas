import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import en from '@/i18n/locales/en.json';

const locales = [
  ['zh-CN', zhCN],
  ['zh-TW', zhTW],
  ['en', en],
] as const;

const FOLLOW_KEYS = [
  'follow:entityTypes.actress',
  'follow:entityTypes.director',
  'follow:entityTypes.studio',
  'follow:entityTypes.label',
  'follow:entityTypes.series',
  'follow:entityTypes.tag',
  'follow:filterAllEntities',
  'follow:filterLabel',
  'follow:searchPlaceholder',
  'follow:searchAction',
  'follow:searchClear',
  'follow:searchResultTitle',
  'follow:searchEmpty',
  'follow:searchEmptyHint',
];

describe('关注体系三语文案', () => {
  it.each(FOLLOW_KEYS)('%s 在三种语言中都有值', async (key) => {
    for (const [lng] of locales) {
      await i18n.changeLanguage(lng);
      const value = i18n.t(key);
      expect(value, `${lng} 缺少 ${key}`).not.toBe(key);
      expect(String(value).trim().length).toBeGreaterThan(0);
    }
    await i18n.changeLanguage('zh-CN');
  });

  it.each(locales)('%s 的磁力数量文案包含 count 插值', async (lng, resource) => {
    const ns = resource as Record<string, unknown>;
    const detail = (ns as { jav: { detail: Record<string, string> } }).jav.detail;
    expect(detail.magnetsHeader).toContain('{{count}}');

    await i18n.changeLanguage(lng);
    expect(i18n.t('jav:detail.magnetsHeader', { count: 3 })).toContain('3');
    await i18n.changeLanguage('zh-CN');
  });

  it.each(locales)('%s 的标签实体入口与图片放大文案存在', async (lng, resource) => {
    const ns = resource as {
      jav: { entity: Record<string, string> };
      common: { buttons: Record<string, string> };
    };
    expect(ns.jav.entity.openTagWorks).toBeTruthy();
    expect(ns.common.buttons.viewImage).toBeTruthy();
    expect(lng).toBeTruthy();
  });
});
