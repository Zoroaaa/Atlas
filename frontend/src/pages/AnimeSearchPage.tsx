/**
 * @deprecated 此页面已整合到 MainSearchPage 的「动漫搜索」Tab 中
 * 请使用 /main?tab=anime 访问
 * @see MainSearchPage
 * @date 2026-06-11
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search, Moon, Sun, ArrowLeft, ExternalLink, Download, Copy,
  Loader2, ChevronLeft, ChevronRight, Wifi, Star, Film,
  Calendar, Tv, Check, RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores';
import { animeApi } from '@/services/api';
import type { BangumiSubject, NyaaTorrent, MikanItem, AnimeSearchData } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = {
  seedColor: (n: number) =>
    n >= 10 ? 'text-emerald-400' : n >= 1 ? 'text-yellow-400' : 'text-red-400',
  rating: (n: number) =>
    n >= 8 ? 'text-emerald-400' : n >= 6 ? 'text-yellow-400' : 'text-slate-400',
};

// ─── sub-components ─────────────────────────────────────────────────────────

const SourceTab: React.FC<{
  active: string;
  onChange: (v: string) => void;
}> = ({ active, onChange }) => (
  <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1">
    {(['all', 'nyaa', 'mikan'] as const).map((s) => {
      const labels: Record<string, string> = { all: '全部', nyaa: 'Nyaa', mikan: 'Mikan' };
      return (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
            active === s
              ? 'bg-violet-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {labels[s]}
        </button>
      );
    })}
  </div>
);

const BangumiCard: React.FC<{ subject: BangumiSubject }> = ({ subject }) => (
  <a
    href={subject.url}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50
               hover:border-violet-500/50 hover:bg-slate-800/80 transition-all"
  >
    {subject.cover && (
      <img
        src={subject.cover}
        alt={subject.nameCN || subject.name}
        className="w-14 h-20 object-cover rounded-lg flex-shrink-0 bg-slate-700"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    )}
    <div className="min-w-0 flex-1">
      <p className="font-medium text-slate-100 text-sm leading-tight truncate group-hover:text-violet-300 transition-colors">
        {subject.nameCN || subject.name}
      </p>
      {subject.nameCN && subject.name !== subject.nameCN && (
        <p className="text-xs text-slate-500 mt-0.5 truncate">{subject.name}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-slate-400">
        {subject.rating > 0 && (
          <span className={`flex items-center gap-0.5 ${fmt.rating(subject.rating)}`}>
            <Star className="w-3 h-3 fill-current" />{subject.rating.toFixed(1)}
          </span>
        )}
        {subject.airDate && (
          <span className="flex items-center gap-0.5">
            <Calendar className="w-3 h-3" />{subject.airDate.slice(0, 7)}
          </span>
        )}
        {subject.eps > 0 && (
          <span className="flex items-center gap-0.5">
            <Tv className="w-3 h-3" />{subject.eps} 集
          </span>
        )}
      </div>
      {subject.summary && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
          {subject.summary}
        </p>
      )}
    </div>
    <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-violet-400 flex-shrink-0 mt-0.5 transition-colors" />
  </a>
);

const CopyMagnetBtn: React.FC<{ magnet: string }> = ({ magnet }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(magnet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      title="复制磁力链接"
      className={`p-1.5 rounded-lg transition-all ${
        copied
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-slate-700/60 text-slate-400 hover:bg-violet-600/30 hover:text-violet-300'
      }`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

const NyaaRow: React.FC<{ item: NyaaTorrent; idx: number }> = ({ item, idx }) => (
  <tr className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${
    idx % 2 === 0 ? '' : 'bg-slate-900/20'
  }`}>
    <td className="py-2.5 px-3 max-w-0 w-full">
      <div className="flex items-start gap-2">
        {item.trusted && (
          <span className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" title="可信" />
        )}
        <span className="text-sm text-slate-200 leading-snug break-words">{item.title}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
        <span>{item.category}</span>
        <span>{item.size}</span>
        <span>{item.date}</span>
      </div>
    </td>
    <td className="py-2.5 px-2 text-center whitespace-nowrap">
      <span className={`text-sm font-medium ${fmt.seedColor(item.seeders)}`}>{item.seeders}</span>
      <span className="text-slate-600 mx-0.5">/</span>
      <span className="text-sm text-red-400">{item.leechers}</span>
    </td>
    <td className="py-2.5 px-2 whitespace-nowrap">
      <div className="flex items-center gap-1">
        <CopyMagnetBtn magnet={item.magnet} />
        <a
          href={item.torrentUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="下载 .torrent"
          className="p-1.5 rounded-lg bg-slate-700/60 text-slate-400 hover:bg-blue-600/30 hover:text-blue-300 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
        <a
          href={`https://nyaa.si/view/${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="在 Nyaa 查看"
          className="p-1.5 rounded-lg bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-slate-200 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </td>
  </tr>
);

const MikanRow: React.FC<{ item: MikanItem; idx: number }> = ({ item, idx }) => (
  <tr className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${
    idx % 2 === 0 ? '' : 'bg-slate-900/20'
  }`}>
    <td className="py-2.5 px-3 max-w-0 w-full">
      <span className="text-sm text-slate-200 leading-snug break-words">{item.title}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
        {item.group && <span className="text-violet-400/70">[{item.group}]</span>}
        {item.size && <span>{item.size}</span>}
        {item.pubDate && <span>{item.pubDate.slice(0, 16)}</span>}
      </div>
    </td>
    <td className="py-2.5 px-2 text-center">
      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">Mikan</span>
    </td>
    <td className="py-2.5 px-2 whitespace-nowrap">
      <CopyMagnetBtn magnet={item.magnet} />
    </td>
  </tr>
);

// ─── main page ───────────────────────────────────────────────────────────────

export const AnimeSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const isDark = resolvedTheme === 'dark';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnimeSearchData | null>(null);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('all');
  const [activeTab, setActiveTab] = useState<'nyaa' | 'mikan'>('nyaa');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string, pg = 1, src = source) => {
    if (!q.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await animeApi.search(q.trim(), pg, src) as { success: boolean; data: AnimeSearchData };
      if (res.success) {
        setData(res.data);
        setPage(pg);
      } else {
        toast.error('搜索失败');
      }
    } catch (e: any) {
      toast.error(e?.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  }, [source, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, 1);
  };

  const handleSource = (s: string) => {
    setSource(s);
    if (data) doSearch(query, 1, s);
  };

  const torrentList = data?.nyaa ?? [];
  const mikanList = data?.mikan ?? [];
  const bgmList = data?.bgm ?? [];

  const hasResults = torrentList.length > 0 || mikanList.length > 0;

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
            <Film className="w-4 h-4 text-violet-400" />
            <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              动漫搜索
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
                placeholder="输入动漫名称 / 关键词…"
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm border transition-all outline-none
                  ${isDark
                    ? 'bg-slate-800/60 border-slate-700/60 text-slate-100 placeholder-slate-500 focus:border-violet-500/70 focus:bg-slate-800'
                    : 'bg-slate-100 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:bg-white'
                  }`}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50
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
            <Film className="w-12 h-12 text-violet-400/40 mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              搜索动漫名称，获取 Bangumi 元数据 + Nyaa / Mikan 磁力链接
            </p>
            <p className="text-xs text-slate-600 mt-2">
              数据来源：<a href="https://bgm.tv" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Bangumi</a>
              {' · '}
              <a href="https://nyaa.si" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Nyaa.si</a>
              {' · '}
              <a href="https://mikanani.me" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Mikan</a>
            </p>
          </div>
        )}

        {/* ── loading ── */}
        {loading && (
          <div className="flex flex-col items-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-slate-500">正在搜索…</p>
          </div>
        )}

        {/* ── results ── */}
        {!loading && data && (
          <div className="space-y-6">
            {/* toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <SourceTab active={source} onChange={handleSource} />
                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  磁力 {data.total} 条
                </span>
              </div>
              <button
                onClick={() => doSearch(query, page)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> 刷新
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              {/* ── left: Bangumi metadata ── */}
              {bgmList.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-violet-500" />
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Bangumi 条目
                    </h2>
                    <a
                      href={`https://bgm.tv/search/${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      更多 →
                    </a>
                  </div>
                  <div className="space-y-2">
                    {bgmList.map(s => <BangumiCard key={s.id} subject={s} />)}
                  </div>
                </div>
              )}

              {/* ── right: torrent results ── */}
              <div className="min-w-0">
                {/* tab switch */}
                <div className={`flex border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} mb-4`}>
                  {[
                    { key: 'nyaa', label: 'Nyaa.si', count: torrentList.length },
                    { key: 'mikan', label: 'Mikan', count: mikanList.length },
                  ].map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key as 'nyaa' | 'mikan')}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                        activeTab === key
                          ? 'border-violet-500 text-violet-400'
                          : `border-transparent ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`
                      }`}
                    >
                      {label}
                      {count > 0 && (
                        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                          activeTab === key ? 'bg-violet-600/30 text-violet-300' : 'bg-slate-700/50 text-slate-500'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {!hasResults && (
                  <div className="text-center py-12">
                    <Wifi className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">未找到相关资源</p>
                    <p className="text-xs text-slate-600 mt-1">尝试更换关键词或数据源</p>
                  </div>
                )}

                {/* Nyaa table */}
                {activeTab === 'nyaa' && torrentList.length > 0 && (
                  <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <table className="w-full text-left">
                      <thead>
                        <tr className={`text-xs ${isDark ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                          <th className="py-2.5 px-3 font-medium">标题 / 分类 / 大小</th>
                          <th className="py-2.5 px-2 text-center font-medium whitespace-nowrap">
                            <span title="做种/下载">S/L</span>
                          </th>
                          <th className="py-2.5 px-2 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {torrentList.map((item, i) => (
                          <NyaaRow key={item.id} item={item} idx={i} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Mikan table */}
                {activeTab === 'mikan' && mikanList.length > 0 && (
                  <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <table className="w-full text-left">
                      <thead>
                        <tr className={`text-xs ${isDark ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                          <th className="py-2.5 px-3 font-medium">标题 / 字幕组</th>
                          <th className="py-2.5 px-2 font-medium">来源</th>
                          <th className="py-2.5 px-2 font-medium">磁力</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mikanList.map((item, i) => (
                          <MikanRow key={item.magnet} item={item} idx={i} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* pagination (nyaa only, 75 per page) */}
                {activeTab === 'nyaa' && torrentList.length >= 60 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <button
                      disabled={page <= 1}
                      onClick={() => doSearch(query, page - 1)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-800/60 text-slate-400
                                 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                    </button>
                    <span className="flex items-center px-3 text-xs text-slate-500">第 {page} 页</span>
                    <button
                      onClick={() => doSearch(query, page + 1)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-800/60 text-slate-400
                                 hover:bg-slate-700 hover:text-slate-200 transition-all"
                    >
                      下一页 <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
