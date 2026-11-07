/**
 * i18n 配置 — 支持的语言、默认值与存储 key
 *
 * 设计：与 themeStore 一致的 localStorage 持久化策略；
 * 浏览器检测仅用于首次访问，用户一旦切换则覆盖检测。
 */

export type Language = 'zh-CN' | 'zh-TW' | 'en';

export interface LanguageOption {
  code: Language;
  /** 短码用于 UI 显示 */
  shortLabel: string;
  /** 完整名称（自身语言表达） */
  nativeName: string;
  /** English label for screen readers */
  englishName: string;
  /** BCP 47 tag for Intl APIs */
  intlTag: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'zh-CN', shortLabel: '简', nativeName: '简体中文', englishName: 'Simplified Chinese', intlTag: 'zh-CN' },
  { code: 'zh-TW', shortLabel: '繁', nativeName: '繁體中文', englishName: 'Traditional Chinese', intlTag: 'zh-TW' },
  { code: 'en',    shortLabel: 'EN', nativeName: 'English',   englishName: 'English',           intlTag: 'en-US' },
] as const;

export const DEFAULT_LANGUAGE: Language = 'zh-CN';
export const FALLBACK_LANGUAGE: Language = 'zh-CN';

export const LANGUAGE_STORAGE_KEY = 'language-storage';

/**
 * 把浏览器语言标签映射为支持的界面语言。
 * 中文按简/繁区分；其它任何语言（日语、韩语、法语…）统一落到英语。
 */
export const mapBrowserLanguage = (tag: string): Language => {
  const lng = tag.toLowerCase();
  if (lng.startsWith('zh-tw') || lng.startsWith('zh-hk') || lng.startsWith('zh-mo') || lng.startsWith('zh-hant')) return 'zh-TW';
  if (lng.startsWith('zh')) return 'zh-CN';
  return 'en';
};

/** 首次访问的默认语言：取浏览器首选语言；检测不到时用 DEFAULT_LANGUAGE */
export const detectBrowserLanguage = (): Language => {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const preferred = (navigator.languages && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language]
  ).find(Boolean);
  return preferred ? mapBrowserLanguage(preferred) : DEFAULT_LANGUAGE;
};

export const isSupportedLanguage = (lang: unknown): lang is Language =>
  typeof lang === 'string' && SUPPORTED_LANGUAGES.some((opt) => opt.code === lang);

/** 根据 Language 取 BCP 47 tag（供 Intl API 使用） */
export const getIntlTag = (lang: Language): string =>
  SUPPORTED_LANGUAGES.find((opt) => opt.code === lang)?.intlTag ?? 'zh-CN';
