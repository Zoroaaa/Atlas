import React from 'react';
import { AnimeSearchResultPanel, MovieSearchResultPanel, MangaSearchResultPanel } from '@/components/search';

/**
 * 查表式结果渲染配置
 *
 * 映射表键值对应 resultType 字段(由后端 searchFlow.enrichedData.resultType 返回)
 */
export const RESULT_PANELS: Record<string, React.ComponentType<any>> = {
  anime: AnimeSearchResultPanel,
  movie: MovieSearchResultPanel,
  manga: MangaSearchResultPanel,
};

/**
 * 根据 resultType 获取对应的结果面板组件
 *
 * @param resultType - 搜索结果类型(如 'anime', 'movie', 'manga' 等)
 * @returns 对应的 React 组件,如果未匹配则返回 undefined
 */
export function getResultPanel(resultType?: string): React.ComponentType<any> | undefined {
  return resultType ? RESULT_PANELS[resultType] : undefined;
}