import type { SearchTabType, TabConfig } from '@/types/source';

/** 搜索 Tab 配置常量 — 定义所有搜索分类的元数据 */
export const SEARCH_TABS: Record<SearchTabType, TabConfig> = {
  jav: {
    id: 'jav',
    label: 'JAV番号搜索',
    icon: '🎬',
    gradient: 'from-blue-500 to-violet-600',
    majorCategoryId: 'jav_sources',
    placeholder: '输入番号、关键词搜索资源...',
    description: '搜索日本成人视频番号和相关资源',
  },
  anime: {
    id: 'anime',
    label: '动漫搜索',
    icon: '🎌',
    gradient: 'from-violet-500 to-purple-600',
    majorCategoryId: 'anime_sources',
    placeholder: '输入动漫名称、番剧名称...',
    description: '搜索动漫、番剧、漫画等ACG资源',
  },
  movie: {
    id: 'movie',
    label: '影视搜索',
    icon: '🎥',
    gradient: 'from-blue-500 to-cyan-600',
    majorCategoryId: 'movie_sources',
    placeholder: '输入电影、电视剧名称...',
    description: '搜索电影、电视剧、综艺等影视资源',
  },
  sources: {
    id: 'sources',
    label: '搜索源访问',
    icon: '🔗',
    gradient: 'from-emerald-500 to-teal-600',
    majorCategoryId: null,
    placeholder: '浏览所有可用资源站点...',
    description: '快速访问各类浏览型资源站点',
  },
};

/** 搜索类 Tab 列表（排除 sources 浏览型） */
export const SEARCH_ONLY_TABS: TabConfig[] = Object.values(SEARCH_TABS).filter(
  (tab) => tab.majorCategoryId !== null
);

/** 所有 Tab 的有序列表（按定义顺序） */
export const ALL_TABS: TabConfig[] = Object.values(SEARCH_TABS);
