import React, { useState } from 'react';
import {
  Star, Film, Tv2, Calendar, ExternalLink, Magnet,
  AlertCircle, Wifi, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import type {
  MovieEnrichedData,
  TMDBResult,
  ResourceItem,
} from '@/types/search';
import { CopyButton } from '@/components/ui/CopyButton';

// ─── helpers ────────────────────────────────────────────────────────────────

const ratingColor = (n: number) =>
  n >= 8 ? 'text-emerald-400' : n >= 6 ? 'text-yellow-400' : 'text-slate-400';

const mediaTypeLabel = (t: 'movie' | 'tv') =>
  t === 'movie' ? '电影' : '剧集';

// ─── 资源卡片（单条资源） ────────────────────────────────────────────

function ResourceCard({ item }: { item: ResourceItem }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
      {/* 左侧：标题 + 元信息 */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* 来源徽章 */}
          {item.source === 'yts' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded">YTS</span>
          )}
          {item.source === 'eztv' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 rounded">EZTV</span>
          )}
          {item.source === 'tpb' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 rounded">TPB</span>
          )}
          {/* 资源类型标签 */}
          {item.resourceType === 'drive' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 rounded">网盘</span>
          )}
          {item.resourceType === 'direct' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 rounded">直链</span>
          )}
          {/* 标题（点击唤起客户端或打开链接） */}
          {item.resourceType === 'drive' && item.driveUrl ? (
            <a
              href={item.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
              title={item.title}
            >
              {item.title}
            </a>
          ) : item.magnet ? (
            <a
              href={item.magnet}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate"
              title={`点击唤起 BT 客户端下载：${item.title}`}
            >
              {item.title}
            </a>
          ) : (
            <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{item.title}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 mt-1 text-[10px] text-slate-500">
          {item.size && <span>{item.size}</span>}
          {item.date && <span>{item.date}</span>}
          <span className="text-slate-400">{item.sourceLabel}</span>
        </div>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center gap-0.5 shrink-0">
        {item.resourceType === 'drive' && item.driveUrl ? (
          <>
            <a
              href={item.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="打开网盘链接"
              className="p-1 rounded text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {item.driveCode && (
              <CopyButton text={item.driveCode} label={`复制提取码: ${item.driveCode}`} />
            )}
          </>
        ) : item.magnet ? (
          <>
            <CopyButton text={item.magnet} label="复制磁力链接" />
            <a
              href={item.magnet}
              title="打开磁力链接（唤起BT客户端）"
              className="p-1 rounded text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
            >
              <Magnet className="w-3.5 h-3.5" />
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── 影视卡片（左侧列表） ────────────────────────────────────────────

const MovieCard: React.FC<{
  item: TMDBResult;
  onSelect: (item: TMDBResult) => void;
  active: boolean;
}> = ({ item, onSelect, active }) => (
  <button
    onClick={() => onSelect(item)}
    className={`group text-left w-full flex gap-3 p-3 rounded-xl border transition-all ${
      active
        ? 'border-blue-500/60 bg-blue-500/10'
        : 'border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 hover:border-blue-500/30 hover:bg-slate-50 dark:hover:bg-slate-800/70'
    }`}
  >
    <div className="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700">
      {item.poster ? (
        <img
          src={item.poster}
          alt={item.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {item.mediaType === 'movie' ? (
            <Film className="w-5 h-5 text-slate-400" />
          ) : (
            <Tv2 className="w-5 h-5 text-slate-400" />
          )}
        </div>
      )}
    </div>

    <div className="min-w-0 flex-1">
      <p className={`font-medium text-sm leading-tight truncate ${
        active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-slate-100 group-hover:text-blue-500'
      }`}>
        {item.title}
      </p>
      {item.originalTitle && item.originalTitle !== item.title && (
        <p className="text-xs text-slate-500 truncate mt-0.5">{item.originalTitle}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-slate-400">
        {item.source === 'douban' ? (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">豆瓣</span>
        ) : (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400">TMDB</span>
        )}
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
          item.mediaType === 'movie'
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
            : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
        }`}>
          {mediaTypeLabel(item.mediaType)}
        </span>
        {item.year && (
          <span className="flex items-center gap-0.5">
            <Calendar className="w-3 h-3" />{item.year}
          </span>
        )}
        {item.rating > 0 && (
          <span className={`flex items-center gap-0.5 ${ratingColor(item.rating)}`}>
            <Star className="w-3 h-3 fill-current" />{item.rating.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  </button>
);

// ─── main component ──────────────────────────────────────────────────────────

interface MovieSearchResultPanelProps {
  data: MovieEnrichedData;
  isDark?: boolean;
  onRefresh?: () => void;
  onPageChange?: (page: number) => void;
}

export const MovieSearchResultPanel: React.FC<MovieSearchResultPanelProps> = ({
  data,
  isDark: _isDark = true,
  onRefresh,
  onPageChange,
}) => {
  const [selectedItem, setSelectedItem] = useState<TMDBResult | null>(
    data.results.length > 0 ? data.results[0] : null
  );
  const [resourcePage, setResourcePage] = useState(1);
  const [showAllResources, setShowAllResources] = useState(false);
  const RES_PAGE_SIZE = 10;

  const results = data.results ?? [];
  const resources = data.resources ?? [];

  // Filter resources by selected item title (fuzzy)
  const filteredResources = selectedItem
    ? resources.filter((r) =>
        r.title.toLowerCase().includes(selectedItem.title.toLowerCase()) ||
        r.title.toLowerCase().includes(selectedItem.originalTitle.toLowerCase()) ||
        resources.length <= 5
      )
    : resources;

  const displayResources = filteredResources.length > 0 ? filteredResources : resources;
  const resTotalPages = Math.max(1, Math.ceil(displayResources.length / RES_PAGE_SIZE));
  const pagedResources = displayResources.slice((resourcePage - 1) * RES_PAGE_SIZE, resourcePage * RES_PAGE_SIZE);

  // 切换影视时重置资源页码
  const handleSelectItem = (item: TMDBResult) => {
    setSelectedItem(item);
    setResourcePage(1);
  };

  // 统计资源类型
  const magnetCount = displayResources.filter(r => r.resourceType === 'magnet' || r.magnet).length;
  const driveCount = displayResources.filter(r => r.resourceType === 'drive').length;

  return (
    <div className="space-y-5">
      {/* stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{data.total} 条影视</span>
          <span>·</span>
          <span>{data.resourceTotal} 条资源</span>
          {magnetCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              磁力 {magnetCount}
            </span>
          )}
          {driveCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              网盘 {driveCount}
            </span>
          )}
          {data.resourceSources && data.resourceSources.length > 0 && (
            <span className="text-slate-400">
              来自 {data.resourceSources.join(' / ')}
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> 刷新
          </button>
        )}
      </div>

      {/* error warnings */}
      {data.tmdbError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm dark:bg-yellow-500/10 dark:border-yellow-500/30 dark:text-yellow-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>TMDB 请求失败：{data.tmdbError}</span>
        </div>
      )}
      {data.doubanError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>豆瓣请求失败：{data.doubanError}</span>
        </div>
      )}
      {data.tpbError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>TPB 请求失败：{data.tpbError}</span>
        </div>
      )}
      {data.eztvError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-700 text-sm dark:bg-cyan-500/10 dark:border-cyan-500/30 dark:text-cyan-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>EZTV 请求失败：{data.eztvError}</span>
        </div>
      )}

      {/* completely empty state */}
      {results.length === 0 && resources.length === 0 && !data.tmdbError && !data.doubanError && !data.tpbError && !data.eztvError && (
        <div className="text-center py-16">
          <Wifi className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-500">未找到相关结果</p>
          <p className="text-xs text-slate-400 mt-1">尝试更换关键词</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* left: results list */}
        {results.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-blue-500" />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                影视匹配
              </h2>
              <span className="ml-auto text-xs text-slate-400">{results.length} 条</span>
            </div>
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
              {results.map((item) => (
                <MovieCard
                  key={`${item.mediaType}-${item.id}`}
                  item={item}
                  onSelect={handleSelectItem}
                  active={
                    selectedItem?.id === item.id &&
                    selectedItem?.mediaType === item.mediaType
                  }
                />
              ))}
            </div>

            {/* pagination */}
            {onPageChange && results.length >= 18 && (
              <div className="flex justify-center gap-2 pt-2">
                <button
                  disabled={data.page <= 1}
                  onClick={() => onPageChange(data.page - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-500
                             hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                             dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 上页
                </button>
                <span className="flex items-center px-3 text-xs text-slate-500">
                  第 {data.page} 页
                </span>
                <button
                  onClick={() => onPageChange(data.page + 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-500
                             hover:bg-slate-200 hover:text-slate-700 transition-all
                             dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  下页 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : !data.tmdbError && !data.doubanError ? (
          <div className="rounded-xl border p-6 text-center bg-white dark:bg-slate-800/30 border-slate-200 dark:border-slate-700">
            <Film className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-500">未找到影视匹配结果</p>
          </div>
        ) : null}

        {/* right: detail + resources */}
        <div className="min-w-0 space-y-5">
          {/* selected item detail（增强版元数据展示） */}
          {selectedItem && (
            <div className="bg-white dark:bg-slate-900/90 rounded-2xl shadow-lg shadow-slate-900/5 border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
              {/* 封面 + 基本信息 */}
              <div className="flex gap-4 sm:gap-5 p-4 sm:p-5">
                {selectedItem.poster || selectedItem.backdrop ? (
                  <img
                    src={selectedItem.backdrop ?? selectedItem.poster!}
                    alt={selectedItem.title}
                    className="hidden sm:block w-48 h-28 object-cover rounded-lg flex-shrink-0 bg-slate-200 dark:bg-slate-700 shadow-md"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {selectedItem.title}
                      </h3>
                      {selectedItem.originalTitle !== selectedItem.title && (
                        <p className="text-sm text-slate-500 mt-0.5">{selectedItem.originalTitle}</p>
                      )}
                    </div>
                    <a
                      href={
                        selectedItem.source === 'douban'
                          ? `https://movie.douban.com/subject/${Math.abs(selectedItem.id)}/`
                          : `https://www.themoviedb.org/${selectedItem.mediaType}/${selectedItem.id}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary-500 hover:underline flex-shrink-0"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {selectedItem.source === 'douban' ? '在豆瓣查看' : '在 TMDB 查看'}
                    </a>
                  </div>

                  {/* 详细信息（InfoRow 风格） */}
                  <div className="space-y-1.5 mt-3">
                    <div className="flex flex-wrap gap-2 text-sm">
                      {selectedItem.source === 'douban' ? (
                        <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                          豆瓣
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-bold bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 rounded-full">
                          TMDB
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                        selectedItem.mediaType === 'movie'
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {mediaTypeLabel(selectedItem.mediaType)}
                      </span>
                      {selectedItem.year && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="w-3 h-3" />{selectedItem.year}
                        </span>
                      )}
                      {selectedItem.rating > 0 && (
                        <span className={`flex items-center gap-1 text-sm font-semibold ${ratingColor(selectedItem.rating)}`}>
                          <Star className="w-3.5 h-3.5 fill-current" />{selectedItem.rating.toFixed(1)}
                          <span className="text-xs text-slate-400 font-normal">({selectedItem.voteCount} 人评价)</span>
                        </span>
                      )}
                    </div>
                    {selectedItem.overview && (
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3 mt-2">
                        {selectedItem.overview}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* resource links（增强版资源列表） */}
          <div className="bg-white dark:bg-slate-900/90 rounded-2xl shadow-lg shadow-slate-900/5 border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Magnet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500 dark:text-purple-400" />
                </div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                  下载资源
                </span>
                {displayResources.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
                    {displayResources.length} 条
                  </span>
                )}
              </div>
              {displayResources.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Magnet className="w-3 h-3" />
                  点击名称唤起客户端 · 图标复制链接
                </div>
              )}
            </div>

            {/* 内容区 */}
            <div className="p-4 sm:p-5">
              {displayResources.length === 0 ? (
                <div className="text-center py-8">
                  <Magnet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">未抓取到资源</p>
                  <p className="text-xs text-slate-400 mt-2">
                    可直接前往
                    <a href={`https://yts.mx/movies?query_term=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline mx-1">YTS</a>·
                    <a href={`https://1337x.to/search/${encodeURIComponent(data.keyword)}/1/`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline mx-1">1337x</a>·
                    <a href={`https://www.lightbt.top/search?q=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline mx-1">LightBT</a>
                    搜索
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {/* 表头 */}
                    <div className="grid grid-cols-[1fr_80px] gap-2 px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                      <span>资源名称</span>
                      <span className="text-right">操作</span>
                    </div>

                    {/* 资源列表 */}
                    {(showAllResources ? pagedResources : pagedResources.slice(0, 5)).map((item, i) => (
                      <ResourceCard key={item.magnet + item.title + i} item={item} />
                    ))}

                    {/* 展开/收起 */}
                    {pagedResources.length > 5 && (
                      <button
                        onClick={() => setShowAllResources(!showAllResources)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-400 hover:text-primary-500 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg transition-all"
                      >
                        {showAllResources
                          ? <><ChevronUp className="w-3.5 h-3.5" />收起</>
                          : <><ChevronDown className="w-3.5 h-3.5" />展开全部（共 {pagedResources.length} 条）</>}
                      </button>
                    )}
                  </div>

                  {/* 分页 */}
                  {displayResources.length > RES_PAGE_SIZE && (
                    <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        disabled={resourcePage <= 1}
                        onClick={() => setResourcePage(p => p - 1)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-500
                                   hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                                   dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                      </button>
                      <span className="text-xs text-slate-500 px-2">
                        {resourcePage} / {resTotalPages}
                        <span className="ml-1 text-slate-400">（共 {displayResources.length} 条）</span>
                      </span>
                      <button
                        disabled={resourcePage >= resTotalPages}
                        onClick={() => setResourcePage(p => p + 1)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-500
                                   hover:bg-slate-200 hover:text-slate-700 transition-all
                                   dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      >
                        下一页 <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
