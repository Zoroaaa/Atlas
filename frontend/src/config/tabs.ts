import type { SearchTabType, TabConfig } from '@/types/source';

/** 搜索 Tab 配置常量 — 定义所有搜索分类的元数据。文本字段统一存 i18n key,由消费端调用 t(key) 解析。 */
export const SEARCH_TABS: Record<SearchTabType, TabConfig> = {
  jav: {
    id: 'jav',
    labelKey: 'tabs:jav.label',
    shortLabelKey: 'tabs:jav.short',
    icon: '🎬',
    gradient: 'from-[#d4a853] to-[#f59e0b]',
    majorCategoryId: 'jav_sources',
    placeholderKey: 'tabs:jav.placeholder',
    descriptionKey: 'tabs:jav.description',
    pinned: true,
  },
  anime: {
    id: 'anime',
    labelKey: 'tabs:anime.label',
    shortLabelKey: 'tabs:anime.short',
    icon: '🎌',
    gradient: 'from-rose-500 to-pink-600',
    majorCategoryId: 'anime_sources',
    placeholderKey: 'tabs:anime.placeholder',
    descriptionKey: 'tabs:anime.description',
    pinned: true,
  },
  movie: {
    id: 'movie',
    labelKey: 'tabs:movie.label',
    shortLabelKey: 'tabs:movie.short',
    icon: '🎥',
    gradient: 'from-amber-400 to-[#d4a853]',
    majorCategoryId: 'movie_sources',
    placeholderKey: 'tabs:movie.placeholder',
    descriptionKey: 'tabs:movie.description',
    pinned: true,
  },
  manga: {
    id: 'manga',
    labelKey: 'tabs:manga.label',
    shortLabelKey: 'tabs:manga.short',
    icon: '📖',
    gradient: 'from-purple-500 to-indigo-600',
    majorCategoryId: 'manga_sources',
    placeholderKey: 'tabs:manga.placeholder',
    descriptionKey: 'tabs:manga.description',
    pinned: true,
  },
  novel: {
    id: 'novel',
    labelKey: 'tabs:novel.label',
    shortLabelKey: 'tabs:novel.short',
    icon: '📚',
    gradient: 'from-emerald-500 to-teal-600',
    majorCategoryId: 'novel_sources',
    placeholderKey: 'tabs:novel.placeholder',
    descriptionKey: 'tabs:novel.description',
    pinned: true,
  },
  sources: {
    id: 'sources',
    labelKey: 'tabs:sources.label',
    shortLabelKey: 'tabs:sources.short',
    icon: '🔗',
    gradient: 'from-teal-500 to-cyan-600',
    majorCategoryId: null,
    placeholderKey: 'tabs:sources.placeholder',
    descriptionKey: 'tabs:sources.description',
    pinned: false,
  },
  community: {
    id: 'community',
    labelKey: 'tabs:community.label',
    shortLabelKey: 'tabs:community.short',
    icon: '🌐',
    gradient: 'from-amber-400 via-orange-500 to-red-500',
    majorCategoryId: null,
    placeholderKey: 'tabs:community.placeholder',
    descriptionKey: 'tabs:community.description',
    pinned: false,
  },
};

/** 搜索类 Tab 列表（排除 sources 浏览型） */
export const SEARCH_ONLY_TABS: TabConfig[] = Object.values(SEARCH_TABS).filter(
  (tab) => tab.majorCategoryId !== null
);

/** 所有 Tab 的有序列表（按定义顺序） */
export const ALL_TABS: TabConfig[] = Object.values(SEARCH_TABS);

/** 常驻主导航的 Tab 列表 */
export const PINNED_TABS: TabConfig[] = ALL_TABS.filter((t) => t.pinned);

/** 溢出到"更多"菜单的 Tab 列表 */
export const OVERFLOW_TABS: TabConfig[] = ALL_TABS.filter((t) => !t.pinned);
