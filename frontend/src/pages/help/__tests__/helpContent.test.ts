/**
 * 帮助中心结构守卫：helpContent 里声明的分类与章节，三语文案必须一一对应。
 *
 * 新增或删除章节时先改 helpContent 再补文案；缺口会在这里失败，
 * 不会等到用户打开帮助中心才看到 key 字符串或空章节。
 */
import { describe, it, expect } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import en from '@/i18n/locales/en.json';
import { HELP_CATEGORIES, HELP_SECTION_CATEGORY, HELP_SECTION_IDS } from '../helpContent';

interface HelpSectionText {
  title: string;
  summary: string;
  features?: string[];
  steps?: string[];
  caveats?: string[];
}

interface HelpLocale {
  categories: Record<string, { title: string; description: string }>;
  sections: Record<string, HelpSectionText>;
}

const locales = [
  ['zh-CN', zhCN],
  ['zh-TW', zhTW],
  ['en', en],
] as const;

const helpOf = (resource: unknown): HelpLocale => (resource as { help: HelpLocale }).help;

describe('帮助中心结构', () => {
  it('章节 id 不重复且都归属唯一分类', () => {
    const unique = new Set(HELP_SECTION_IDS);
    expect(unique.size).toBe(HELP_SECTION_IDS.length);
    expect(Object.keys(HELP_SECTION_CATEGORY)).toHaveLength(HELP_SECTION_IDS.length);
  });

  it.each(locales)('%s 的分类与章节集合和 helpContent 完全一致', (_lng, resource) => {
    const help = helpOf(resource);
    expect(Object.keys(help.categories).sort()).toEqual(HELP_CATEGORIES.map((item) => item.id).sort());
    expect(Object.keys(help.sections).sort()).toEqual([...HELP_SECTION_IDS].sort());
  });

  it.each(locales)('%s 的每个分类都有标题与描述', (_lng, resource) => {
    const help = helpOf(resource);
    for (const category of HELP_CATEGORIES) {
      expect(help.categories[category.id]?.title?.trim(), `${category.id} 缺少标题`).toBeTruthy();
      expect(help.categories[category.id]?.description?.trim(), `${category.id} 缺少描述`).toBeTruthy();
    }
  });

  it.each(locales)('%s 的每个章节都有标题、摘要与正文', (_lng, resource) => {
    const help = helpOf(resource);
    for (const sectionId of HELP_SECTION_IDS) {
      const section = help.sections[sectionId];
      expect(section, `${sectionId} 缺失`).toBeTruthy();
      expect(section.title?.trim(), `${sectionId} 缺少标题`).toBeTruthy();
      expect(section.summary?.trim(), `${sectionId} 缺少摘要`).toBeTruthy();
      // FAQ 类章节只用 caveats 承载排查步骤，因此正文允许是三者之一
      const body = [section.features, section.steps, section.caveats].some(
        (list) => Array.isArray(list) && list.some((item) => item.trim().length > 0)
      );
      expect(body, `${sectionId} 没有正文`).toBe(true);
    }
  });
});
