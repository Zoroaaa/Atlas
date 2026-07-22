import React, { useState } from 'react';
import {
  Star, Calendar, Tv, ExternalLink,
  Magnet, Wifi, RefreshCw, ChevronLeft, ChevronRight,
  Tag, Heart, Users, Trophy, Film, ShieldCheck,
} from 'lucide-react';
import type {
  AnimeEnrichedData,
  BangumiSubject,
  MikanItem,
  NyaaTorrent,
  ShowRssItem,
} from '@/types/search';
import type { FavoriteItem } from '@/types';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareToCommunityButton } from '@/components/community';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { convertToProxyUrl } from '@/services/proxy';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = {
  seedColor: (n: number) =>
    n >= 10 ? 'text-emerald-400' : n >= 1 ? 'text-yellow-400' : 'text-red-400',
  rating: (n: number) =>
    n >= 8 ? 'text-emerald-400' : n >= 6 ? 'text-yellow-400' : 'text-stone-400',
};

// ─── Nyaa 磁力卡片 ──────────────────────────────────────────────────

function NyaaCard({ item }: { item: NyaaTorrent }) {
  return (
    <div className="grid grid-cols-[1fr_100px] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-all group">
      {/* 左侧：标题 + 元信息 */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* 可信标记 */}
          {item.trusted && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" title="可信上传者" />
          )}
          {/* HD 标记 */}
          {item.title.toLowerCase().includes('1080') && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300 rounded">HD</span>
          )}
          {item.title.toLowerCase().includes('2160') || item.title.toLowerCase().includes('4k') ? (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300 rounded">4K</span>
          ) : null}
          {/* 来源标记 */}
          {item.source === 'nyaa' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300 rounded">Nyaa</span>
          )}
          {/* 标题（点击唤起客户端） */}
          <a
            href={item.magnet}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate"
            title={`点击唤起 BT 客户端下载：${item.title}`}
          >
            {item.title}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-stone-500">
          {item.category && <span>{item.category}</span>}
          {item.size && <span>{item.size}</span>}
          {item.date && <span>{item.date}</span>}
        </div>
      </div>

      {/* 右侧：操作区 */}
      <div className="flex items-center gap-2">
        {/* 做种/下载 */}
        {item.hasSeedData === false ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 dark:bg-stone-700/60 dark:text-stone-400" title="DHT 网络，种子仍可获取">DHT</span>
        ) : (
          <span className={`text-xs font-medium ${fmt.seedColor(item.seeders)} tabular-nums`}>
            {item.seeders}<span className="text-stone-400 mx-0.5">/</span><span className="text-red-400">{item.leechers}</span>
          </span>
        )}
        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5">
          <CopyButton text={item.magnet} label="复制磁力链接" />
        </div>
      </div>
    </div>
  );
}

// ─── Mikan 磁力卡片 ──────────────────────────────────────────────────

function MikanCard({ item }: { item: MikanItem }) {
  return (
    <div className="grid grid-cols-[1fr_100px] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-all group">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 rounded">Mikan</span>
          {item.group && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400 rounded truncate max-w-[80px]" title={`字幕组：${item.group}`}>
              {item.group}
            </span>
          )}
          {item.magnet ? (
            <a
              href={item.magnet}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate"
              title={`点击唤起 BT 客户端下载：${item.title}`}
            >
              {item.title}
            </a>
          ) : (
            <span className="text-xs text-stone-600 dark:text-stone-300 truncate" title={item.title}>
              {item.title}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-stone-500">
          {item.size && <span>{item.size}</span>}
          {item.pubDate && <span>{item.pubDate}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {item.magnet && <CopyButton text={item.magnet} label="复制磁力链接" />}
      </div>
    </div>
  );
}

// ─── showRSS 磁力卡片 ────────────────────────────────────────────────

function ShowRssCard({ item }: { item: ShowRssItem }) {
  return (
    <div className="grid grid-cols-[1fr_100px] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-all group">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300 rounded">SR</span>
          {item.magnet ? (
            <a
              href={item.magnet}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate"
              title={`点击唤起 BT 客户端下载：${item.title}`}
            >
              {item.title}
            </a>
          ) : (
            <span className="text-xs text-stone-600 dark:text-stone-300 truncate" title={item.title}>
              {item.title}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {item.magnet && <CopyButton text={item.magnet} label="复制磁力链接" />}
      </div>
    </div>
  );
}

// ─── 类型/状态标签颜色映射 ────────────────────────────────────────

const typeColor = (t?: string | number) => {
  const m: Record<string | number, string> = { 2:'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',6:'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',4:'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',3:'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400','tv':'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300','movie':'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' };
  return t != null ? (m[t] ?? 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400') : 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400';
};

const statusColor = (s?: string) => {
  switch (s) {
    case '连载中': return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
    case '已完结': return 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400';
    case '未开播': return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
    default: return '';
  }
};

const typeLabel = (t?: string | number) => {
  const m: Record<string | number, string> = { 2:'TV',6:'剧场版',4:'Web',3:'音乐','tv':'TV','movie':'剧场版','ova':'OVA','web':'Web','music':'音乐' };
  return t != null ? (m[t] ?? String(t)) : '';
};

// ─── Bangumi 卡片（详细元数据展示） ─────────────────────────────────

const BangumiCard: React.FC<{
  subject: BangumiSubject;
  isAuthenticated: boolean;
  isFavorited: boolean;
  onToggleFavorite: (subject: BangumiSubject) => void;
  isProxyEnabled: boolean;
}> = ({ subject, isAuthenticated, isFavorited, onToggleFavorite, isProxyEnabled }) => (
  <div
    className="group flex gap-4 p-4 rounded-xl border border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 hover:border-amber-500/50 hover:bg-stone-50 dark:hover:bg-stone-800/70 transition-all"
  >
    {/* 封面 */}
    {subject.cover && (
      <a href={isProxyEnabled ? convertToProxyUrl(subject.url) : subject.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
        <img
          src={getProxyImageUrl(subject.cover)}
          alt={subject.nameCN || subject.name}
          className="w-20 sm:w-24 h-[120px] sm:h-[140px] object-cover rounded-lg bg-stone-200 dark:bg-stone-700 shadow-md"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </a>
    )}

    <div className="min-w-0 flex-1">
      {/* 标题行：类型 + 状态 + 名称 + 操作按钮 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {subject.type && (
              <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${typeColor(subject.type)}`}>
                {typeLabel(subject.type)}
              </span>
            )}
            {subject.status && (
              <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${statusColor(subject.status)}`}>
                {subject.status}
              </span>
            )}
            {subject.rank && subject.rank > 0 && subject.rank <= 1000 && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-amber-500 font-medium">
                <Trophy className="w-3 h-3" />#{subject.rank}
              </span>
            )}
            {isProxyEnabled && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <ShieldCheck className="w-3 h-3" />代理
              </span>
            )}
          </div>

          <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100 leading-snug line-clamp-2 group-hover:text-amber-500 transition-colors">
            {subject.nameCN || subject.name}
          </h3>
          {subject.nameCN && subject.name !== subject.nameCN && (
            <p className="text-xs text-stone-500 mt-0.5 truncate">{subject.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {isAuthenticated && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(subject); }}
              className={`p-1.5 rounded-lg transition-all ${
                isFavorited
                  ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
                  : 'text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
              }`}
              title={isFavorited ? '取消收藏' : '收藏'}
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current' : ''}`} />
            </button>
          )}
          <a
            href={isProxyEnabled ? convertToProxyUrl(subject.url) : subject.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-1.5 rounded-lg transition-all ${
              isProxyEnabled
                ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                : 'text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* 详细信息区 */}
      <div className="space-y-1.5 mt-2">
        {/* 第一行：评分 + 收藏 + 集数 + 放送日期 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          {subject.rating > 0 && (
            <span className={`flex items-center gap-1 ${fmt.rating(subject.rating)} font-medium`}>
              <Star className="w-3 h-3 fill-current" />
              {subject.rating.toFixed(1)}
              {subject.ratingCount ? (
                <span className="text-[10px] text-stone-400 font-normal">({subject.ratingCount})</span>
              ) : null}
            </span>
          )}

          {subject.collection && (
            <>
              {subject.collection.collect > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]" title="收藏人数">
                  <Heart className="w-3 h-3 text-red-400" />
                  {(subject.collection.collect / 1000).toFixed(1)}k
                </span>
              )}
              {subject.collection.doing > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]" title="在看人数">
                  <Users className="w-3 h-3 text-amber-400" />
                  {subject.collection.doing}
                </span>
              )}
            </>
          )}

          {subject.eps > 0 && (
            <span className="flex items-center gap-1">
              <Tv className="w-3 h-3" />{subject.eps} 集
            </span>
          )}
          {subject.airDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />{subject.airDate.slice(0, 7)}
            </span>
          )}
        </div>

        {/* 制作公司 */}
        {subject.studio && (
          <span className="text-[10px] text-amber-500 dark:text-amber-400 truncate block">
            <Film className="w-3 h-3 inline mr-0.5" />{subject.studio}
          </span>
        )}

        {/* 标签 */}
        {subject.tags && subject.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {subject.tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] rounded-full bg-stone-100 text-stone-500 dark:bg-stone-700/50 dark:text-stone-400">
                <Tag className="w-2.5 h-2.5" />{tag}
              </span>
            ))}
          </div>
        )}

        {/* 简介 */}
        {subject.summary && (
          <p className="text-[11px] text-stone-500 leading-relaxed line-clamp-2 mt-1">
            {subject.summary}
          </p>
        )}
      </div>
    </div>
  </div>
);

// ─── main component ──────────────────────────────────────────────────────────

interface AnimeSearchResultPanelProps {
  data: AnimeEnrichedData;
  isDark?: boolean;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteItem[];
  onRefresh?: () => void;
  onPageChange?: (page: number) => void;
  onToggleFavorite?: (subject: BangumiSubject) => void;
  onLoginRequired?: () => void;
}

export const AnimeSearchResultPanel: React.FC<AnimeSearchResultPanelProps> = ({
  data,
  isDark: _isDark = true,
  isAuthenticated = false,
  isProxyEnabled = false,
  favorites = [],
  onRefresh,
  onPageChange,
  onToggleFavorite,
  onLoginRequired,
}) => {
  const [localPage, setLocalPage] = useState(1);
  // 各源独立分页 state
  const [atosPage, setAtosPage] = useState(1);
  const [mikanPage, setMikanPage] = useState(1);
  const [srPage, setSrPage] = useState(1);
  const SOURCE_PAGE_SIZE = 10; // 统一每页10条
  const PAGE_SIZE = 10;

  const bgmList = data.bgm ?? [];
  // 各源独立
  const nyaaList = data.nyaa ?? [];
  const atosList = data.animetosho ?? [];
  const mikanList = data.mikan ?? [];
  const showrssList = data.showrss ?? [];
  const hasResults = nyaaList.length > 0 || atosList.length > 0 || mikanList.length > 0 || showrssList.length > 0;

  // 收藏状态判断
  const isBgmFavorited = (url: string) => favorites.some(f => f.url === url);

  // Nyaa 翻页（保留原有分页逻辑）
  const activeTorrents = nyaaList;
  const totalPages = Math.max(1, Math.ceil(activeTorrents.length / PAGE_SIZE));
  const pagedTorrents = activeTorrents.slice((localPage - 1) * PAGE_SIZE, localPage * PAGE_SIZE);

  // error states
  const hasBgmError = !!data.errors?.bangumi;
  const hasNyaaError = !!data.errors?.nyaa;
  const hasAtosError = !!data.errors?.animetosho;
  const hasMikanError = !!data.errors?.mikan;
  const hasSrError = !!data.errors?.showrss;

  return (
    <div className="space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {hasResults && (
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 font-medium">多源聚合</span>
              <span>共 {data.total} 条资源</span>
              {(nyaaList.length > 0) && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">Nyaa {nyaaList.length}</span>
              )}
              {(atosList.length > 0) && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">AT {atosList.length}</span>
              )}
              {(mikanList.length > 0) && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">Mikan {mikanList.length}</span>
              )}
              {(showrssList.length > 0) && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">SR {showrssList.length}</span>
              )}
            </div>
          )}
          {!hasResults && (
            <span className="text-xs text-stone-500">磁力 {data.total} 条</span>
          )}
        </div>
        {onRefresh && (
          <div className="flex items-center gap-2">
            <ShareToCommunityButton
              postData={{
                postType: 'anime',
                title: data.bgm[0]?.nameCN || data.keyword,
                coverImage: data.bgm[0]?.cover ? getProxyImageUrl(data.bgm[0].cover) : '',
                contentData: JSON.stringify({
                  keyword: data.keyword,
                  bgm: data.bgm,
                  nyaa: data.nyaa,
                  mikan: data.mikan,
                  animetosho: data.animetosho,
                  showrss: data.showrss,
                }),
              }}
              isAuthenticated={isAuthenticated}
              onLoginRequired={onLoginRequired}
              size="small"
            />
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> 刷新
            </button>
          </div>
        )}
      </div>

      {/* errors */}
      {(hasBgmError || hasNyaaError || hasAtosError || hasMikanError || hasSrError) && (
        <div className="space-y-2">
          {hasBgmError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400">
              <Wifi className="w-4 h-4 flex-shrink-0" />
              <span>Bangumi 请求失败：{data.errors.bangumi}</span>
            </div>
          )}
          {data.errors?.nyaa && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400">
              <Wifi className="w-4 h-4 flex-shrink-0" />
              <span>Nyaa 请求失败：{data.errors.nyaa}</span>
            </div>
          )}
          {data.errors?.mikan && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400">
              <Wifi className="w-4 h-4 flex-shrink-0" />
              <span>Mikan 请求失败：{data.errors.mikan}</span>
            </div>
          )}
          {data.errors?.animetosho && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400">
              <Wifi className="w-4 h-4 flex-shrink-0" />
              <span>AnimeTosho 请求失败：{data.errors.animetosho}</span>
            </div>
          )}
          {data.errors?.showrss && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-400">
              <Wifi className="w-4 h-4 flex-shrink-0" />
              <span>showRSS 请求失败：{data.errors.showrss}</span>
            </div>
          )}
        </div>
      )}

      {/* completely empty state */}
      {!hasResults && bgmList.length === 0 && !hasBgmError && !hasNyaaError && !hasAtosError && !hasMikanError && !hasSrError && (
        <div className="text-center py-16">
          <Wifi className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <p className="text-sm text-stone-500">未找到相关结果</p>
          <p className="text-xs text-stone-400 mt-1">尝试更换关键词</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* left: Bangumi metadata（增强版） */}
        {bgmList.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-amber-500" />
              <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">
                Bangumi 条目
              </h2>
              <a
                href={`https://bgm.tv/search/${encodeURIComponent(data.keyword)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-amber-500 hover:text-amber-400 transition-colors"
              >
                更多 →
              </a>
            </div>
            <div className="space-y-2">
              {bgmList.map((s) => (
                <BangumiCard
                  key={s.id}
                  subject={s}
                  isAuthenticated={isAuthenticated}
                  isFavorited={isBgmFavorited(s.url)}
                  onToggleFavorite={(subj) => onToggleFavorite?.(subj)}
                  isProxyEnabled={isProxyEnabled}
                />
              ))}
            </div>
          </div>
        ) : hasBgmError ? null : (
          <div className="rounded-xl border p-6 text-center bg-white dark:bg-stone-800/30 border-stone-200 dark:border-stone-700">
            <Star className="w-8 h-8 text-stone-400 mx-auto mb-2" />
            <p className="text-sm text-stone-500">未找到 Bangumi 条目</p>
          </div>
        )}

        {/* right: torrent results */}
        <div className="min-w-0 space-y-4">
          {/* empty state for torrents */}
          {!hasResults && (
            <div className="text-center py-12 bg-white dark:bg-stone-900/90 rounded-2xl shadow-lg shadow-stone-900/5 border border-stone-200/60 dark:border-stone-700/60">
              <Magnet className="w-8 h-8 text-stone-400 mx-auto mb-3" />
              <p className="text-sm text-stone-500">未找到磁力资源</p>
              <p className="text-xs text-stone-400 mt-1">尝试更换关键词或数据源</p>
            </div>
          )}

          {/* Nyaa 磁力列表 */}
          {pagedTorrents.length > 0 && (
            <div className="bg-white dark:bg-stone-900/90 rounded-2xl shadow-lg shadow-stone-900/5 border border-stone-200/60 dark:border-stone-700/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Magnet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 dark:text-amber-400" />
                  </div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm sm:text-base">Nyaa 资源</span>
                  <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full">{nyaaList.length} 条</span>
                </div>
                <a href={`https://nyaa.si/?f=0&c=1_0&q=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-amber-500 hover:text-amber-400 transition-colors">Nyaa 站内搜索 →</a>
              </div>

              {/* 内容区 */}
              <div className="p-4 sm:p-5">
                <div className="space-y-1.5">
                  {/* 表头 */}
                  <div className="grid grid-cols-[1fr_100px] gap-2 px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide border-b border-stone-100 dark:border-stone-800">
                    <span>标题 / 分类 / 大小 / 日期</span>
                    <span className="text-right">状态 · 操作</span>
                  </div>

                  {/* 资源列表 */}
                  {pagedTorrents.map((item, i) =>
                    <NyaaCard key={(item as NyaaTorrent).id || i} item={item as NyaaTorrent} />
                  )}

                </div>

                {/* 分页 */}
                {activeTorrents.length > PAGE_SIZE && (
                  <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                    <button
                      disabled={localPage <= 1}
                      onClick={() => setLocalPage(p => p - 1)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                                 dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                    </button>
                    <span className="text-xs text-stone-500 px-2">
                      {localPage} / {totalPages}
                      <span className="ml-1 text-stone-400">（共 {activeTorrents.length} 条）</span>
                    </span>
                    <button
                      disabled={localPage >= totalPages}
                      onClick={() => setLocalPage(p => p + 1)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                 hover:bg-stone-200 hover:text-stone-700 transition-all
                                 dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                    >
                      下一页 <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AnimeTosho 磁力列表 */}
          {atosList.length > 0 && (
            <div className="bg-white dark:bg-stone-900/90 rounded-2xl shadow-lg shadow-stone-900/5 border border-stone-200/60 dark:border-stone-700/60 overflow-hidden mt-4">
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                    <Magnet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 dark:text-rose-400" />
                  </div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm sm:text-base">AnimeTosho 资源</span>
                  <span className="px-2 py-0.5 text-xs font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full">{atosList.length} 条</span>
                </div>
                <a href={`https://feed.animetosho.org/json?filter=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-rose-500 hover:text-rose-400 transition-colors">AT 站内搜索 →</a>
              </div>
              <div className="p-4 sm:p-5">
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_100px] gap-2 px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide border-b border-stone-100 dark:border-stone-800">
                    <span>标题 / 大小 / 日期</span>
                    <span className="text-right">操作</span>
                  </div>
                  {/* 计算分页 */}
                  {(() => {
                    const atosTotalPages = Math.max(1, Math.ceil(atosList.length / SOURCE_PAGE_SIZE));
                    const pagedAtos = atosList.slice((atosPage - 1) * SOURCE_PAGE_SIZE, atosPage * SOURCE_PAGE_SIZE);
                    return (
                      <>
                        {pagedAtos.map((item, i) =>
                          <NyaaCard key={(item as NyaaTorrent).id || `atos-${i}`} item={item as NyaaTorrent} />
                        )}
                        {/* 分页控件 */}
                        {atosList.length > SOURCE_PAGE_SIZE && (
                          <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                            <button
                              disabled={atosPage <= 1}
                              onClick={() => setAtosPage(p => p - 1)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                         hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                                         dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                            </button>
                            <span className="text-xs text-stone-500 px-2">
                              {atosPage} / {atosTotalPages}
                              <span className="ml-1 text-stone-400">（共 {atosList.length} 条）</span>
                            </span>
                            <button
                              disabled={atosPage >= atosTotalPages}
                              onClick={() => setAtosPage(p => p + 1)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                         hover:bg-stone-200 hover:text-stone-700 transition-all
                                         dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                              下一页 <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Mikan 结果（独立展示） */}
          {mikanList.length > 0 && (
            <div className="bg-white dark:bg-stone-900/90 rounded-2xl shadow-lg shadow-stone-900/5 border border-stone-200/60 dark:border-stone-700/60 overflow-hidden mt-4">
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Magnet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm sm:text-base">
                    Mikan 资源
                  </span>
                  <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full">
                    {mikanList.length} 条
                  </span>
                </div>
                <a
                  href={`https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(data.keyword)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  Mikan 站内搜索 →
                </a>
              </div>
              <div className="p-4 sm:p-5">
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_100px] gap-2 px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide border-b border-stone-100 dark:border-stone-800">
                    <span>标题 / 字幕组 / 大小 / 日期</span>
                    <span className="text-right">操作</span>
                  </div>
                  {/* 计算分页 */}
                  {(() => {
                    const mikanTotalPages = Math.max(1, Math.ceil(mikanList.length / SOURCE_PAGE_SIZE));
                    const pagedMikan = mikanList.slice((mikanPage - 1) * SOURCE_PAGE_SIZE, mikanPage * SOURCE_PAGE_SIZE);
                    return (
                      <>
                        {pagedMikan.map((item, i) =>
                          <MikanCard key={i} item={item} />
                        )}
                        {/* 分页控件 */}
                        {mikanList.length > SOURCE_PAGE_SIZE && (
                          <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                            <button
                              disabled={mikanPage <= 1}
                              onClick={() => setMikanPage(p => p - 1)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                         hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                                         dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                            </button>
                            <span className="text-xs text-stone-500 px-2">
                              {mikanPage} / {mikanTotalPages}
                              <span className="ml-1 text-stone-400">（共 {mikanList.length} 条）</span>
                            </span>
                            <button
                              disabled={mikanPage >= mikanTotalPages}
                              onClick={() => setMikanPage(p => p + 1)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                         hover:bg-stone-200 hover:text-stone-700 transition-all
                                         dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                              下一页 <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* showRSS 结果 */}
          {showrssList.length > 0 && (
            <div className="bg-white dark:bg-stone-900/90 rounded-2xl shadow-lg shadow-stone-900/5 border border-stone-200/60 dark:border-stone-700/60 overflow-hidden mt-4">
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Magnet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500 dark:text-orange-400" />
                  </div>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm sm:text-base">
                    showRSS 资源
                  </span>
                  <span className="px-2 py-0.5 text-xs font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
                    {showrssList.length} 条
                  </span>
                </div>
                <a
                  href="https://showrss.info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-orange-500 hover:text-orange-400 transition-colors"
                >
                  showRSS 站内 →
                </a>
              </div>
              <div className="p-4 sm:p-5">
                <div className="space-y-1.5">
                  {/* 计算分页 */}
                  {(() => {
                    const srTotalPages = Math.max(1, Math.ceil(showrssList.length / SOURCE_PAGE_SIZE));
                    const pagedSr = showrssList.slice((srPage - 1) * SOURCE_PAGE_SIZE, srPage * SOURCE_PAGE_SIZE);
                    return (
                      <>
                        {pagedSr.map((item, i) => (
                          <ShowRssCard key={i} item={item} />
                        ))}
                        {/* 分页控件 */}
                        {showrssList.length > SOURCE_PAGE_SIZE && (
                          <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                            <button
                              disabled={srPage <= 1}
                              onClick={() => setSrPage(p => p - 1)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                         hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                                         dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                            </button>
                            <span className="text-xs text-stone-500 px-2">
                              {srPage} / {srTotalPages}
                              <span className="ml-1 text-stone-400">（共 {showrssList.length} 条）</span>
                            </span>
                            <button
                              disabled={srPage >= srTotalPages}
                              onClick={() => setSrPage(p => p + 1)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500
                                         hover:bg-stone-200 hover:text-stone-700 transition-all
                                         dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                              下一页 <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 服务端翻页（超过 60 条时请求下一页） */}
          {onPageChange && nyaaList.length >= 60 && localPage >= totalPages && (
            <div className="flex justify-center gap-2 mt-1">
              <button
                disabled={data.page <= 1}
                onClick={() => onPageChange(data.page - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-amber-100 text-amber-600
                           hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all
                           dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> 上一批
              </button>
              <span className="flex items-center px-3 text-xs text-stone-500">第 {data.page} 批</span>
              <button
                onClick={() => onPageChange(data.page + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-amber-100 text-amber-600
                           hover:bg-amber-200 transition-all
                           dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
              >
                下一批 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
