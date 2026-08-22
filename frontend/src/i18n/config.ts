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

export const isSupportedLanguage = (lang: unknown): lang is Language =>
  typeof lang === 'string' && SUPPORTED_LANGUAGES.some((opt) => opt.code === lang);

/** 根据 Language 取 BCP 47 tag（供 Intl API 使用） */
export const getIntlTag = (lang: Language): string =>
  SUPPORTED_LANGUAGES.find((opt) => opt.code === lang)?.intlTag ?? 'zh-CN';
