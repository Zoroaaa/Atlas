import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search, Moon, Sun, ArrowLeft, ExternalLink, Copy, Star,
  Loader2, ChevronLeft, ChevronRight, Film, Tv2, Calendar,
  Wifi, Check, RefreshCw, Magnet, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores';
import { movieApi } from '@/services/api';
import type { TMDBResult, ResourceItem, MovieSearchData } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

// ─── helpers ────────────────────────────────────────────────────────────────

const ratingColor = (n: number) =>
  n >= 8 ? 'text-emerald-400' : n >= 6 ? 'text-yellow-400' : 'text-slate-400';

const mediaTypeLabel = (t: 'movie' | 'tv') =>
  t === 'movie' ? '电影' : '剧集';

// ─── sub-components ─────────────────────────────────────────────────────────

const CopyBtn: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
        copied
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-slate-700/60 text-slate-400 hover:bg-blue-600/30 hover:text-blue-300'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {label ?? (copied ? '已复制' : '复制')}
    </button>
  );
};

// TMDB movie card
const MovieCard: React.FC<{ item: TMDBResult; onSelect: (item: TMDBResult) => void; active: boolean }> = ({
  item, onSelect, active,
}) => (
  <button
    onClick={() => onSelect(item)}
    className={`group text-left w-full flex gap-3 p-3 rounded-xl border transition-all ${
      active
        ? 'border-blue-500/60 bg-blue-500/10'
        : 'border-slate-700/50 bg-slate-800/40 hover:border-blue-500/30 hover:bg-slate-800/70'
    }`}
  >
    {/* poster */}
    <div className="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden bg-slate-700">
      {item.poster ? (
        <img
          src={item.poster}
          alt={item.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {item.mediaType === 'movie' ? (
            <Film className="w-5 h-5 text-slate-600" />
          ) : (
            <Tv2 className="w-5 h-5 text-slate-600" />
          )}
        </div>
      )}
    </div>

    {/* info */}
    <div className="min-w-0 flex-1">
      <p className={`font-medium text-sm leading-tight truncate transition-colors ${
        active ? 'text-blue-300' : 'text-slate-100 group-hover:text-blue-300'
      }`}>
        {item.title}
      </p>
      {item.originalTitle && item.originalTitle !== item.title && (
        <p className="text-xs text-slate-500 truncate mt-0.5">{item.originalTitle}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-400">
        {item.source === 'douban' ? (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-400">豆瓣</span>
        ) : (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/20 text-cyan-400">TMDB</span>
        )}
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
          item.mediaType === 'movie'
            ? 'bg-blue-500/20 text-blue-400'
            : 'bg-purple-500/20 text-purple-400'
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
      {item.overview && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{item.overview}</p>
      )}
    </div>
  </button>
);

// Resource item row
const ResourceRow: React.FC<{ item: ResourceItem; idx: number }> = ({ item, idx }) => (
  <tr className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${
    idx % 2 === 0 ? '' : 'bg-slate-900/20'
  }`}>
    <td className="py-2.5 px-3 max-w-0 w-full">
      <p className="text-sm text-slate-200 break-words leading-snug">{item.title}</p>
      <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-slate-500">
        {item.size && <span>{item.size}</span>}
        {item.date && <span>{item.date}</span>}
      </div>
    </td>
    <td className="py-2.5 px-2 whitespace-nowrap">
      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">
        {item.sourceLabel}
      </span>
    </td>
    <td className="py-2.5 px-2 whitespace-nowrap">
      <div className="flex items-center gap-1">
        <CopyBtn text={item.magnet} />
        <a
          href={item.magnet}
          title="打开磁力链接"
          className="p-1.5 rounded-lg bg-slate-700/60 text-slate-400 hover:bg-blue-600/30 hover:text-blue-300 transition-all"
        >
          <Magnet className="w-3.5 h-3.5" />
        </a>
      </div>
    </td>
  </tr>
);

// ─── main page ───────────────────────────────────────────────────────────────

export const MovieSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const isDark = resolvedTheme === 'dark';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MovieSearchData | null>(null);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<TMDBResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string, pg = 1) => {
    if (!q.trim()) return;
    setLoading(true);
    setData(null);
    setSelectedItem(null);
    try {
      const res = await movieApi.search(q.trim(), pg) as { success: boolean; data: MovieSearchData };
      if (res.success) {
        setData(res.data);
        setPage(pg);
        if (res.data.results.length > 0) setSelectedItem(res.data.results[0]);
      } else {
        toast.error('搜索失败');
      }
    } catch (e: any) {
      toast.error(e?.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, 1);
  };

  const results = data?.results ?? [];
  const resources = data?.resources ?? [];

  // Filter resources by selected item title (fuzzy)
  const filteredResources = selectedItem
    ? resources.filter(r =>
        r.title.toLowerCase().includes(selectedItem.title.toLowerCase()) ||
        r.title.toLowerCase().includes(selectedItem.originalTitle.toLowerCase()) ||
        resources.length <= 5 // if few results, show all
      )
    : resources;

  const displayResources = filteredResources.length > 0 ? filteredResources : resources;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0c1220]' : 'bg-slate-50'} transition-colors`}>
      {/* ── top nav ── */}
      <header className={`sticky top-0 z-10 border-b ${
        isDark ? 'bg-[#0c1220]/95 border-slate-800' : 'bg-white/95 border-slate-200'
      } backdrop-blur-sm`}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate('/main')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mr-2">
            <Film className="w-4 h-4 text-blue-400" />
            <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              影视搜索
            </span>
          </div>

          {/* search bar */}
          <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="输入影视名称…"
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm border transition-all outline-none
                  ${isDark
                    ? 'bg-slate-800/60 border-slate-700/60 text-slate-100 placeholder-slate-500 focus:border-blue-500/70 focus:bg-slate-800'
                    : 'bg-slate-100 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white'
                  }`}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                         text-white text-sm font-medium transition-all flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              搜索
            </button>
          </form>

          <button onClick={toggleTheme} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* ── empty state ── */}
        {!loading && !data && (
          <div className="text-center py-20">
            <Film className="w-12 h-12 text-blue-400/40 mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              搜索电影或剧集，获取 TMDB 详情 + 磁力资源链接
            </p>
            <p className="text-xs text-slate-600 mt-2">
              元数据：
              <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer"
                 className="text-cyan-400 hover:underline">TMDB</a>
              {' + '}
              <a href="https://movie.douban.com" target="_blank" rel="noopener noreferrer"
                 className="text-green-400 hover:underline">豆瓣</a>
              {' · '}
              磁力：
              <a href="https://www.lightbt.top" target="_blank" rel="noopener noreferrer"
                 className="text-blue-400 hover:underline">LightBT</a>
              {' · '}
              <a href="https://www.yinfans.me" target="_blank" rel="noopener noreferrer"
                 className="text-blue-400 hover:underline">音范丝</a>
            </p>
          </div>
        )}

        {/* ── loading ── */}
        {loading && (
          <div className="flex flex-col items-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-slate-500">正在搜索…</p>
          </div>
        )}

        {/* ── results ── */}
        {!loading && data && (
          <div className="space-y-5">
            {/* stats bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>TMDB {data.total} 条</span>
                <span>·</span>
                <span>磁力资源 {data.resourceTotal} 条</span>
              </div>
              <button
                onClick={() => doSearch(query, page)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> 刷新
              </button>
            </div>

            {/* TMDB error warning */}
            {data.tmdbError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>TMDB 请求失败：{data.tmdbError}</span>
              </div>
            )}

            {data.doubanError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>豆瓣请求失败：{data.doubanError}</span>
              </div>
            )}

            {results.length === 0 && resources.length === 0 && (
              <div className="text-center py-12">
                <Wifi className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">未找到相关结果</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
              {/* ── left: TMDB results list ── */}
              {results.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-blue-500" />
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      影视匹配
                    </h2>
                    <span className="ml-auto text-xs text-slate-600">{results.length} 条</span>
                  </div>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
                    {results.map(item => (
                      <MovieCard
                        key={`${item.mediaType}-${item.id}`}
                        item={item}
                        onSelect={setSelectedItem}
                        active={selectedItem?.id === item.id && selectedItem?.mediaType === item.mediaType}
                      />
                    ))}
                  </div>

                  {/* pagination */}
                  {results.length >= 18 && (
                    <div className="flex justify-center gap-2 pt-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => doSearch(query, page - 1)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-800/60 text-slate-400
                                   hover:bg-slate-700 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> 上页
                      </button>
                      <span className="flex items-center px-3 text-xs text-slate-500">第 {page} 页</span>
                      <button
                        onClick={() => doSearch(query, page + 1)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-800/60 text-slate-400
                                   hover:bg-slate-700 hover:text-slate-200 transition-all"
                      >
                        下页 <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── right: detail + resources ── */}
              <div className="min-w-0 space-y-5">
                {/* selected item detail */}
                {selectedItem && (
                  <div className={`rounded-xl border p-4 ${isDark ? 'border-slate-800 bg-slate-800/30' : 'border-slate-200 bg-white'}`}>
                    <div className="flex gap-4">
                      {selectedItem.backdrop || selectedItem.poster ? (
                        <img
                          src={selectedItem.backdrop ?? selectedItem.poster!}
                          alt={selectedItem.title}
                          className="hidden sm:block w-48 h-28 object-cover rounded-lg flex-shrink-0 bg-slate-700"
                          loading="lazy"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className={`font-bold text-lg leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                              {selectedItem.title}
                            </h3>
                            {selectedItem.originalTitle !== selectedItem.title && (
                              <p className="text-sm text-slate-500 mt-0.5">{selectedItem.originalTitle}</p>
                            )}
                          </div>
                          <a
                            href={selectedItem.source === 'douban'
                              ? `https://movie.douban.com/subject/${Math.abs(selectedItem.id)}/`
                              : `https://www.themoviedb.org/${selectedItem.mediaType}/${selectedItem.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-blue-400 transition-colors"
                            title={selectedItem.source === 'douban' ? '在豆瓣查看' : '在 TMDB 查看'}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-400">
                          {selectedItem.source === 'douban' ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">豆瓣</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">TMDB</span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            selectedItem.mediaType === 'movie'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-purple-500/20 text-purple-400'
                          }`}>
                            {mediaTypeLabel(selectedItem.mediaType)}
                          </span>
                          {selectedItem.year && <span>{selectedItem.year}</span>}
                          {selectedItem.rating > 0 && (
                            <span className={`flex items-center gap-1 ${ratingColor(selectedItem.rating)}`}>
                              <Star className="w-3.5 h-3.5 fill-current" />
                              {selectedItem.rating.toFixed(1)}
                              <span className="text-slate-600 text-xs">({selectedItem.voteCount})</span>
                            </span>
                          )}
                        </div>
                        {selectedItem.overview && (
                          <p className="text-sm text-slate-500 mt-2 leading-relaxed line-clamp-3">
                            {selectedItem.overview}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* resource links */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 rounded-full bg-orange-500" />
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      磁力资源
                    </h2>
                    <span className="text-xs text-slate-600">{displayResources.length} 条</span>
                  </div>

                  {displayResources.length === 0 ? (
                    <div className={`rounded-xl border p-6 text-center ${
                      isDark ? 'border-slate-800 bg-slate-800/20' : 'border-slate-200 bg-slate-50'
                    }`}>
                      <Magnet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">未抓取到磁力资源</p>
                      <p className="text-xs text-slate-600 mt-1">
                        资源站可能暂不可访问，可直接前往
                        <a href={`https://www.lightbt.top/search?q=${encodeURIComponent(query)}`}
                           target="_blank" rel="noopener noreferrer"
                           className="text-blue-400 hover:underline mx-1">LightBT</a>
                        或
                        <a href={`https://www.yinfans.me/?s=${encodeURIComponent(query)}`}
                           target="_blank" rel="noopener noreferrer"
                           className="text-blue-400 hover:underline mx-1">音范丝</a>
                        搜索
                      </p>
                    </div>
                  ) : (
                    <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                      <table className="w-full text-left">
                        <thead>
                          <tr className={`text-xs ${isDark ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                            <th className="py-2.5 px-3 font-medium">标题</th>
                            <th className="py-2.5 px-2 font-medium">来源</th>
                            <th className="py-2.5 px-2 font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayResources.map((item, i) => (
                            <ResourceRow key={item.magnet + i} item={item} idx={i} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
